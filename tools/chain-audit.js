// CHAIN再定義の影響監査。src/ は一切変更せず、読み込んだ battle.js の写しに対して
// 「段数の数え方」と「その数を読む場所」だけを差し替えて、新旧を同じ入力・同じseedで比べる。
//
//   node tools/chain-audit.js --paths       … 期待経路8件＋分岐契約をassertし、正規化APIの出力を表示
//   node tools/chain-audit.js --runs 200    … 通常ランでの影響（モード別）
//   node tools/chain-audit.js               … 両方
//
// ── 分類の原則 ─────────────────────────────────────────
// 「どこで計算しているか」では分けない。**同じ実効果を一度だけ数える**で統一する。
//   ・実効果 effect      : 別の能力・規則が起こす、別個の状態変化。1段と数える。
//   ・補足   restate     : 親と同じ一つの効果の言い換え・内訳・修飾。段を増やさない。
//   ・宣言   declaration : 「これから起こす」。効果を担う子があるならその子が1段。
//                          子が無いときは selfEffect で分かれる。
//                            selfEffect=true  … そのイベント自身が実効果（行動中止など）→ 1段
//                            selfEffect=false … 予告しただけで実行されなかった          → 0段
// 未分類のイベントが出たら停止する（黙って0段扱いにしない）。
//
// ── モード（倍率とハプニング発火条件を分離して測る） ─────
//   A legacy 現行。親を持つ因果イベントは種類を問わず必ず+1段。
//   B record 段数の記録だけ新定義。倍率もハプニング条件も現行の段数で動かす。
//   C mult   新定義を**倍率だけ**に使う（ハプニング条件は現行）。
//   D gate   新定義を**ハプニング発火条件だけ**に使う（倍率は現行）。
//   E both   倍率もハプニング条件も新定義。
//
// ── 乱数と保存状態の扱い（固定） ────────────────────────
//   ・乱数はすべて vm コンテキストへ渡した seed 付き Math.random に通す。
//     ホストの Math.random は使わない（事件の選択もコンテキスト側の乱数を使う）。
//   ・1ランごとに localStorage を空にする。魔界史・教訓の持ち越しは無し。
//   ・A と B が1件でも食い違ったら**検証失敗**として停止する（原因を推測しない）。
const fs = require('fs'), vm = require('vm');

const CHAIN_DEF_VERSION = 2;

// ── 因果イベントの役（契約案） ─────────────────────────
// kind は「その効果の識別子」。同じ実効果を指すイベントは同じ kind を返す。
// 結合の判定に使うのは親子関係だけで、時間的な隣接では結合しない。
const CLASSIFY = {
  attack: () => ({ role: 'effect', kind: 'damage' }),
  splash: () => ({ role: 'effect', kind: 'damage' }),
  // 撃破は「その一撃そのものの結果」。別の能力による別個の状態変化ではないので数えない。
  // 反応イベントはここを親に持ったまま、一撃の段から数える。
  death: () => ({ role: 'restate', kind: 'damage' }),
  overkill: () => ({ role: 'restate', kind: 'damage' }),
  // 致死耐えは別。《執念》などが介入してHPを1に固定し、撃破を打ち消している。
  // 同じ一撃の言い換えではなく別個の状態変化なので1段と数える。
  survive: () => ({ role: 'effect', kind: 'survive' }),
  revive: () => ({ role: 'effect', kind: 'revive' }),
  summon: () => ({ role: 'effect', kind: 'summon' }),
  heal: () => ({ role: 'effect', kind: 'heal' }),
  momentum: () => ({ role: 'effect', kind: 'momentum' }),
  resource_gain: d => ({ role: 'effect', kind: 'gain:' + (d.resource || '?') }),
  resource_forfeit: () => ({ role: 'effect', kind: 'forfeit' }),
  // 魂1の消費は《魂の徴収》の内訳（同じ一つの効果の後半）
  resource_consume: d => d.resource === 'soul'
    ? { role: 'restate', kind: 'trait:soul_harvest' }
    : { role: 'effect', kind: 'consume:' + (d.resource || '?') },
  // 仲間割れ(friendly_fire)は「これから同士討ちする」宣言で、効果は子のダメージが担う。
  // ストライキなど(skip)は「行動を中止した」こと自体が実効果なので、子が無くても1段。
  incident: d => ({ role: 'declaration', kind: 'incident:' + (d.id || '?'),
    selfEffect: happeningKind(d.id) === 'skip' }),
  trait_trigger: d => {
    switch (d.traitId) {
      // 宣言。効果は直後の子（追加行動・伝播ダメージ）が担う
      // どれも「追加行動をする」という予告。実行されなければ何も起きていないので0段。
      case 'greedy': case 'chain_massacre': case 'overload': case 'glutton_feast':
        return { role: 'declaration', kind: 'trait:' + d.traitId, selfEffect: false };
      // それ自体が唯一の表現である実効果（同じ効果を担う別イベントがタイムラインに無い）
      case 'demon_cook':     // 食事強化。倍率の計算場所は run.js だが、効果の表現はこの1件だけ
      case 'big_eater':      // その人物の与ダメージ上昇
      case 'hunger_demon':   // 全軍の暴走
      case 'soul_harvest':   // アンデッド全員の強化
        return { role: 'effect', kind: 'trait:' + d.traitId };
      default: return null;  // 未分類 → 停止
    }
  },
  synergy_trigger: d => d.synergyId === 'goblin_pair'
    ? { role: 'effect', kind: 'synergy:goblin_pair' }
    : null,
  facility_trigger: d => {
    switch (d.facilityId) {
      case 'extortion_ledger': return { role: 'effect', kind: 'facility:extortion_ledger' };
      // 「遺骸が動き出す」という予告。召喚されなければ何も起きていないので0段
      case 'graveyard': return { role: 'declaration', kind: 'facility:graveyard', selfEffect: false };
      // 巨大厨房は食事強化の**修飾**。増やしているのは料理人の効果そのものなので数えない
      case 'grand_kitchen': return { role: 'restate', kind: 'trait:demon_cook' };
      default: return null;
    }
  }
};

// incident の実効果性は battle_happenings.js の kind で決まる。
//   kind: 'skip'          … 行動中止そのものが実効果。子は無く、これで完結する → selfEffect
//   kind: 'friendly_fire' … 同士討ちの予告。効果は子の splash が担う            → 予告
// イベント側に kind が乗っていないので、データから id→kind を引く。
let HAPPENING_KIND = null;
function happeningKind(id) {
  if (!HAPPENING_KIND) {
    HAPPENING_KIND = new Map();
    const src = fs.readFileSync(__dirname + '/../src/data/battle_happenings.js', 'utf8');
    const ctx = { out: null };
    vm.createContext(ctx);
    vm.runInContext(src + '\n; out = BATTLE_HAPPENINGS;', ctx);
    for (const h of ctx.out) HAPPENING_KIND.set(h.id, h.kind);
  }
  const kind = HAPPENING_KIND.get(id);
  if (!kind) throw new Error(`未知のハプニング id=${id} → battle_happenings.js に無い`);
  return kind;
}

function classify(type, data) {
  const fn = CLASSIFY[type];
  const got = fn ? fn(data || {}) : null;
  if (!got) {
    throw new Error(`未分類の因果イベント: type=${type} traitId=${(data || {}).traitId} `
      + `facilityId=${(data || {}).facilityId} synergyId=${(data || {}).synergyId} `
      + `resource=${(data || {}).resource}\n`
      + '  → CLASSIFY へ役を足すまで監査は続行しない（黙って0段扱いにしない）');
  }
  // selfEffect の既定は false。宣言は明示したものだけが「自分自身で1段」になる。
  return { selfEffect: false, ...got };
}

// ── 正規化API（契約案・単一の入口） ────────────────────
// 生の因果グラフ（parentEventId）はそのまま残し、ここで読み方だけを与える。
//
// 結合の向き（採用済み仕様に合わせる）:
//   宣言は**前の親へではなく、効果を担う直接の子へ吸収する**。
//   「強欲」+「追加攻撃」で1つの step になり、UIは「《強欲》による追加攻撃」と読める。
//
// 分岐して実効果の子が複数ある場合（1つの宣言から2体以上が動くなど）:
//   **同じ宣言を各子の step へ複製して所属させる**（集合stepにはしない）。
//   理由は、段数は「実際に起きた効果の数」であり、宣言が1つでも効果が2つなら
//   出来事は2つだから。UIも「《能力》による○○」を効果の数だけ出せる。
//   複製された宣言の step には sharedDeclaration: true が立ち、
//   イベント側は stepIds に所属先を全部持つ（stepId はそのうち先頭）。
// 行為者は「その効果を起こした人物」だけ。
// summon.sourceUnitId は**戦没者**（遺骸を提供した側）であって召喚した人物ではない。
// 墓地は施設が起こす効果なので人物の行為者は居ない（actor は null、施設は能力情報で表す）。
// ここで sourceUnitId を拾うと「戦没者が自分を召喚した」ことになるので拾わない。
function actorIdOf(event) {
  return event.sourceId || event.unitId || event.fromId || null;
}

// 召喚は登場人物が2人居る。役が違うので別々に保持する。
//   戦没者 fallen   … 遺骸を提供して倒れた側（summon.sourceUnitId）
//   召喚個体 summoned … 新たに戦場へ出た側（summon.unit）
// どちらも「行為者」ではない。
function summonRoles(raw, names) {
  if (raw.type !== 'summon') return null;
  const fallenId = raw.sourceUnitId || null;
  const summonedId = (raw.unit && raw.unit.id) || null;
  return {
    fallenId, fallenName: fallenId ? (names.get(fallenId) || null) : null,
    summonedId, summonedName: summonedId ? (names.get(summonedId) || (raw.unit && raw.unit.name) || null) : null
  };
}

function abilityOf(event) {
  const id = event.traitId || event.facilityId || event.synergyId || event.id || null;
  const name = event.name || event.label || null;
  return id || name ? { abilityId: id, abilityName: name } : { abilityId: null, abilityName: null };
}

// 表示に使う名前は battle_start のスナップショットと summon から引く（textを解析しない）
function nameIndex(timeline) {
  const names = new Map();
  for (const e of timeline || []) {
    if (e.type === 'battle_start') {
      for (const u of [...(e.player || []), ...(e.enemy || [])]) names.set(u.id, u.name);
    }
    if (e.type === 'summon' && e.unit) names.set(e.unit.id, e.unit.name);
  }
  return names;
}

function summarize(timeline) {
  const causal = (timeline || []).filter(e => e.eventId && (e.parentEventId || e.chainId));
  const byId = new Map(causal.map(e => [e.eventId, e]));
  const names = nameIndex(timeline);
  const childrenOf = new Map();
  for (const e of causal) {
    if (!e.parentEventId) continue;
    if (!childrenOf.has(e.parentEventId)) childrenOf.set(e.parentEventId, []);
    childrenOf.get(e.parentEventId).push(e);
  }
  // 効果を担う直接の子（実効果の子、または「実効果の子を持たない＝自分が効果になる宣言」）
  const effectChildrenOf = event => (childrenOf.get(event.eventId) || [])
    .filter(c => {
      const { role, selfEffect } = classify(c.type, c);
      if (role === 'effect') return true;
      if (role !== 'declaration') return false;
      // 子が効果を担わない宣言は、それ自身が実効果を表すときだけ「効果を担う子」になる。
      // 未実行の予告は効果ではないので、親から見ても子から見ても段にならない。
      if (!selfEffect) return false;
      return !(childrenOf.get(c.eventId) || []).some(g => classify(g.type, g).role === 'effect');
    });

  const info = new Map();
  const resolve = event => {
    if (info.has(event.eventId)) return info.get(event.eventId);
    const parent = event.parentEventId ? byId.get(event.parentEventId) : null;
    const parentInfo = parent ? resolve(parent) : null;
    const { role, kind, selfEffect } = classify(event.type, event);
    const kids = effectChildrenOf(event);
    let counts;
    if (role === 'effect') counts = true;
    else if (role === 'restate') counts = false;
    // 宣言: 子が効果を担うならその子が1段。子が無いときは
    //   ・そのイベント自身が実効果を表す（行動中止など）→ 1段
    //   ・予告しただけで実行されなかった                 → 0段
    else counts = kids.length === 0 && selfEffect;
    const rawDepth = parentInfo ? parentInfo.rawDepth + 1 : 1;
    // 起点が「数えない」種類（子が効果を担う宣言）なら、段は子から始まる。
    const depth = parentInfo ? parentInfo.depth + (counts ? 1 : 0) : (counts ? 1 : 0);
    // 所属する結合単位。
    //   実効果／効果を持たない宣言 → 自分が単位の代表
    //   補足                       → 親の単位へ吸収（後ろ向き）
    //   効果を担う子がある宣言     → **子の単位へ吸収（前向き）**。複数なら全部に所属
    let stepIds;
    if (counts) stepIds = [event.eventId];
    else if (role === 'declaration') stepIds = kids.map(c => c.eventId);
    else stepIds = parentInfo ? parentInfo.stepIds.slice() : [event.eventId];
    const got = { role, kind, depth, rawDepth, stepIds, counts, kids };
    info.set(event.eventId, got);
    return got;
  };

  const events = causal.map(e => {
    const got = resolve(e);
    return {
      eventId: e.eventId, parentEventId: e.parentEventId || null, chainId: e.chainId || e.eventId,
      type: e.type, role: got.role, effectKind: got.kind,
      rawDepth: got.rawDepth, depth: got.depth, counted: got.counts,
      stepId: got.stepIds[0] || null, stepIds: got.stepIds
    };
  });

  const chains = new Map();
  for (const e of events) {
    const cur = chains.get(e.chainId) || { chainId: e.chainId, maxDepth: 0, rawMaxDepth: 0, eventCount: 0 };
    cur.maxDepth = Math.max(cur.maxDepth, e.depth);
    cur.rawMaxDepth = Math.max(cur.rawMaxDepth, e.rawDepth);
    cur.eventCount += 1;
    chains.set(e.chainId, cur);
  }

  const byEventId = new Map(events.map(e => [e.eventId, e]));
  const deepestEvent = events.reduce((best, e) => {
    if (!best) return e;
    if (e.depth !== best.depth) return e.depth > best.depth ? e : best;
    return e.rawDepth > best.rawDepth ? e : best;
  }, null);
  const deepest = deepestEvent ? {
    chainId: deepestEvent.chainId, depth: deepestEvent.depth, rawDepth: deepestEvent.rawDepth,
    steps: mergeSteps(lineage(byEventId, deepestEvent), byId, names, info)
  } : null;

  return {
    defVersion: CHAIN_DEF_VERSION,
    maxDepth: events.reduce((m, e) => Math.max(m, e.depth), 0),
    rawMaxDepth: events.reduce((m, e) => Math.max(m, e.rawDepth), 0),
    eventCount: events.length,
    events,
    chains: [...chains.values()],
    deepest,
    // 任意のイベントで終わる経路を、同じ結合規則で取り出す
    pathTo(pick) {
      const hit = events.filter(pick)
        .reduce((best, e) => (!best || e.rawDepth > best.rawDepth ? e : best), null);
      if (!hit) return null;
      const line = lineage(byEventId, hit);
      return { line, steps: mergeSteps(line, byId, names, info) };
    }
  };
}

function lineage(byEventId, event) {
  const line = [];
  for (let cur = event; cur; cur = cur.parentEventId ? byEventId.get(cur.parentEventId) : null) line.unshift(cur);
  return line;
}

// 経路上の結合。宣言は次に来る効果イベント（＝その宣言が起こしたもの）と1つの step になる。
// 結合の判定に使うのは親子関係だけで、時間的な隣接は見ない。
function mergeSteps(line, byId, names, info) {
  const steps = [];
  let pending = [];                       // 効果イベントを待っている宣言
  for (const e of line) {
    if (!e.counted && e.role === 'declaration') { pending.push(e); continue; }
    if (!e.counted) {                     // 補足: 直前の step（親）へ吸収
      const last = steps[steps.length - 1];
      if (last) { last.eventIds.push(e.eventId); last.types.push(e.type); }
      continue;
    }
    const raw = byId.get(e.eventId) || {};
    const decl = pending.length ? pending[pending.length - 1] : null;
    const declRaw = decl ? byId.get(decl.eventId) : null;
    const ability = declRaw ? abilityOf(declRaw) : abilityOf(raw);
    // 行為者は**実効果を起こした側**を優先する。分岐（1宣言→複数の子）では宣言者と
    // 実行者が別人になるため、宣言側を優先すると全stepが宣言者の名前になってしまう。
    // 効果イベントが行為者を持たない場合（仲間割れの splash など）だけ宣言者で補う。
    const actorId = actorIdOf(raw) || (declRaw && actorIdOf(declRaw)) || null;
    const declInfo = decl ? info.get(decl.eventId) : null;
    steps.push({
      stepId: e.eventId,
      depth: e.depth,
      rawDepth: e.rawDepth,
      effectKind: e.effectKind,
      role: e.role,
      // UIが「《能力名》による○○」と書くための情報
      actorId: actorId || null,
      actorName: actorId ? (names.get(actorId) || null) : null,
      abilityId: ability.abilityId,
      abilityName: ability.abilityName,
      declaredBy: declRaw ? {
        eventId: declRaw.eventId, type: declRaw.type,
        abilityId: abilityOf(declRaw).abilityId, abilityName: abilityOf(declRaw).abilityName,
        actorId: actorIdOf(declRaw), actorName: names.get(actorIdOf(declRaw)) || null
      } : null,
      // 効果そのもののイベント（数値はここから読む）
      effect: (() => {
        const roles = summonRoles(raw, names);
        const targetId = (roles && roles.summonedId) || raw.toId || raw.targetId || raw.unitId || null;
        return {
          eventId: raw.eventId, type: raw.type,
          dmg: raw.dmg, amount: raw.amount, resource: raw.resource, label: raw.label || null,
          targetId,
          targetName: (roles && roles.summonedName) || names.get(targetId) || null,
          // 召喚だけが持つ2役。戦没者を行為者や召喚者として扱ってはいけない
          ...(roles ? { fallenId: roles.fallenId, fallenName: roles.fallenName,
            summonedId: roles.summonedId, summonedName: roles.summonedName } : {})
        };
      })(),
      sharedDeclaration: !!(declInfo && declInfo.stepIds.length > 1),
      eventIds: pending.map(p => p.eventId).concat([e.eventId]),
      types: pending.map(p => p.type).concat([e.type])
    });
    pending = [];
  }
  // 経路の終端が宣言だった場合。
  //   ・効果を担う子が無い宣言（counts=true）は上のループで step になっている。
  //   ・効果を担う子がある宣言は、その step は**子の側**にある。子はこの経路上に
  //     居ないので、ここでは step を作らない（作ると「起きていない出来事」を1段に見せる）。
  //     どこへ所属したかは pendingDeclarations に残して呼び手が追えるようにする。
  if (pending.length && steps.length) {
    steps[steps.length - 1].pendingDeclarations = pending.map(d => ({
      eventId: d.eventId, type: d.type, stepIds: d.stepIds
    }));
  }
  return steps;
}

// ── battle.js の写しを作る ──────────────────────────────
const FILES = ['src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js', 'src/core/util.js',
  'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'];

function patchBattle(src) {
  const swap = (from, to) => {
    if (!src.includes(from)) throw new Error('chain-audit: battle.js の差し替え箇所が見つからない:\n' + from.slice(0, 90));
    src = src.replace(from, to);
  };
  swap(
`        data.chainId = parent.chainId || parent.eventId;
        data.chainDepth = (parent.chainDepth || 1) + 1;`,
`        data.chainId = parent.chainId || parent.eventId;
        data.legacyDepth = (parent.legacyDepth || 1) + 1;
        // 親の段数は || 1 で読んではいけない。新定義では 0段の親（未実行の予告や
        // 効果を子に委ねる宣言）が出るため、0 を 1 に読み替えると子が1段ぶん水増しされる。
        data.chainDepth = CHAIN_AUDIT.countAll
          ? (parent.chainDepth || 1) + 1
          : CHAIN_AUDIT.depthOf(parent) + (CHAIN_AUDIT.step(type, data) ? 1 : 0);`);
  swap(
`      } else {
        data.chainDepth = 1;
      }`,
`      } else {
        data.chainDepth = CHAIN_AUDIT.countAll ? 1 : (CHAIN_AUDIT.step(type, data) ? 1 : 0);
        data.legacyDepth = 1;
      }`);
  // 消費者①ダメージ倍率
  swap(
`      const chainDepth = opts.parentEvent ? (opts.parentEvent.chainDepth || 1) + 1 : 1;
      if (attacker.side === "player" && chainDepth >= 3) {
        const chainMult = chainDepth === 3 ? 1.25 : Math.min(2.5, 1.75 + (chainDepth - 4) * .25);
        amount *= chainMult;
        opts.traits = [...(opts.traits || []), \`CHAIN \${chainDepth} ×\${chainMult.toFixed(2)}\`];
      }`,
`      const chainDepth = opts.parentEvent ? CHAIN_AUDIT.depthOf(opts.parentEvent) + 1 : 1;
      const legacyDepth = opts.parentEvent ? (opts.parentEvent.legacyDepth || 1) + 1 : 1;
      const multDepth = CHAIN_AUDIT.multNew ? chainDepth : legacyDepth;
      if (attacker.side === "player") CHAIN_AUDIT.tiers.push([legacyDepth, chainDepth]);
      if (attacker.side === "player" && multDepth >= 3) {
        const chainMult = multDepth === 3 ? 1.25 : Math.min(2.5, 1.75 + (multDepth - 4) * .25);
        amount *= chainMult;
        opts.traits = [...(opts.traits || []), \`CHAIN \${multDepth} ×\${chainMult.toFixed(2)}\`];
      }`);
  // 消費者②連鎖ハプニングの発火条件（battle_happenings.js の u.chainDepth >= 3）
  swap(
`      unit.chainDepth = actionOpts.parentEvent ? (actionOpts.parentEvent.chainDepth || 1) + 1 : 1;`,
`      const actorLegacy = actionOpts.parentEvent ? (actionOpts.parentEvent.legacyDepth || 1) + 1 : 1;
      const actorNew = actionOpts.parentEvent ? CHAIN_AUDIT.depthOf(actionOpts.parentEvent) + 1 : 1;
      if (actionOpts.parentEvent) CHAIN_AUDIT.gates.push([actorLegacy, actorNew]);
      unit.chainDepth = CHAIN_AUDIT.gateNew ? actorNew : actorLegacy;`);
  return src;
}

const MODES = {
  A: { label: 'A 現行',                   countAll: true,  multNew: false, gateNew: false },
  B: { label: 'B 記録のみ新定義',          countAll: false, multNew: false, gateNew: false },
  C: { label: 'C 倍率だけ新定義',          countAll: false, multNew: true,  gateNew: false },
  D: { label: 'D ハプニング条件だけ新定義', countAll: false, multNew: false, gateNew: true },
  E: { label: 'E 倍率＋ハプニング条件',     countAll: false, multNew: true,  gateNew: true }
};

function load(mode, seed) {
  const cfg = MODES[mode];
  if (!cfg) throw new Error('unknown mode: ' + mode);
  let store = {};
  let s = (seed >>> 0) || 1;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const M = Object.create(Math);
  M.random = rng;
  const audit = {
    ...cfg, tiers: [], gates: [],
    // 発火時点では子がまだ出ていない。宣言は「数えない側」に寄せる（倍率・条件用の近似）。
    // 最終的な段数は summarize() が生グラフ全体から決める。
    // 戦闘中は子がまだ存在しないので「子を見る」判定はできない。
    // 新定義ではその必要がない: 実効果に加えて、selfEffect の宣言（行動中止など）だけを数える。
    // どちらもイベント単体で決まるため、正規化APIと同じ結果が逐次でも出せる。
    // 旧案の「子のない宣言は一律1段」は先読みが要るので戦闘中には実装できなかった。
    // 0段の親を 1段と読み替えない。未定義（非因果イベント）だけ 1 とみなす。
    depthOf: ev => (ev && ev.chainDepth != null ? ev.chainDepth : 1),
    step: (type, data) => {
      const c = classify(type, data);
      return c.role === 'effect' || (c.role === 'declaration' && c.selfEffect);
    }
  };
  const ctx = { console, Math: M, Date, JSON, CHAIN_AUDIT: audit, localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
  }};
  vm.createContext(ctx);
  for (const f of FILES) {
    const src = f === 'src/core/battle.js' ? patchBattle(fs.readFileSync(f, 'utf8')) : fs.readFileSync(f, 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return {
    mode, audit,
    Game: vm.runInContext('Game', ctx),
    Battle: vm.runInContext('Battle', ctx),
    ENEMY_STAGES: vm.runInContext('ENEMY_STAGES', ctx),
    rand: () => rng(),
    seed: v => { s = (v >>> 0) || 1; },
    clearStorage: () => { store = {}; }
  };
}

// ── 期待経路（assertする） ─────────────────────────────
function makeFoes(env, stage) {
  const src = env.ENEMY_STAGES[Math.min(env.ENEMY_STAGES.length - 1, Math.max(0, stage))];
  return src.units.map((u, j) => env.Battle.makeUnit({ ...u, uid: 900 + j, name: u.name || '敵',
    maxHp: u.hp, traits: u.traits || [], tags: u.tags || [] }, 'enemy'));
}

function scenarios(env) {
  const mk = (tplId, opt) => {
    const m = env.Game.rollApplicant(tplId);
    if (opt.traits) m.traits = opt.traits.slice();
    if (opt.name) m.name = opt.name;
    if (opt.loyalty !== undefined) m.loyalty = opt.loyalty;
    if (opt.unpaid) m.unpaid = true;
    if (opt.boost) { m.atk = Math.round(m.atk * opt.boost); m.hp = Math.round(m.hp * 2); }
    return m;
  };
  const pool = ids => ids.map(id => {
    const m = env.Game.rollApplicant(id);
    return { ...m, alive: true, mods: { dmgMult: 1, takenMult: 1 } };
  });
  return [
    // 攻撃 → 追い剥ぎ+1G → 強欲による追加攻撃
    { id: '略奪', seed: 7, stage: 2,
      units: () => [mk('goblin', { traits: ['coward', 'pickpocket'], name: '盗む役' }),
        mk('goblin', { traits: ['coward', 'greedy'], name: '反応役' }),
        mk('ogre', { traits: ['brute'], name: '殴り役', boost: 3 })],
      options: { extortionLedger: true, facilityWorks: 2 },
      endsWith: e => e.type === 'attack' && e.rawDepth >= 4,
      expect: [['damage', null], ['gain:gold', '追い剥ぎ'], ['damage', '強欲']] },
    // 糧食消費（巨大厨房は同じ効果の修飾なので数えない）
    { id: '食料', seed: 11, stage: 2,
      units: () => [mk('goblin', { traits: ['coward', 'pickpocket'], name: '料理人' }),
        mk('ogre', { traits: ['brute', 'big_eater'], name: '大食漢', boost: 3 }),
        mk('orc', { traits: ['brute'], name: '前衛' })],
      options: { rations: { consumed: 6, need: 6, shortage: 0, emptied: false, kitchen: true,
        bigEaterUids: [], cookUid: null, feastUid: null, hungerUid: null,
        meal: { targetUid: null, boost: .3, boostPercent: 30, kitchenMult: 2, tiedUids: [] } } },
      endsWith: e => e.type === 'facility_trigger' && e.effectKind === 'trait:demon_cook',
      expect: [['consume:food', null]] },
    // 糧食消費 → 暴食の宴による追加行動
    { id: '暴食', seed: 4, stage: 2,
      units: () => [mk('ogre', { traits: ['brute', 'glutton_feast'], name: '宴の主', boost: 2 }),
        mk('orc', { traits: ['brute'], name: '前衛' })],
      feastUid: 0,
      options: {},
      endsWith: e => e.type === 'attack' && e.effectKind === 'damage' && e.rawDepth >= 3,
      expect: [['consume:food', null], ['damage', '暴食の宴']] },
    { id: '死霊', seed: 5, stage: 4,
      units: () => [mk('zombie', { traits: ['tenacity'], name: '前衛' }),
        mk('skeleton', { traits: ['bone', 'soul_harvest'], name: '徴収役' }),
        mk('necromancer', { traits: ['necromancy', 'gravekeeper'], name: '術師' })],
      options: {},
      endsWith: e => e.effectKind === 'trait:soul_harvest' && e.type === 'trait_trigger',
      expect: [['damage', null], ['revive', null], ['trait:soul_harvest', '魂の徴収']] },
    // 攻撃 → 墓地による召喚
    { id: '墓地', seed: 3, stage: 6,
      units: () => [mk('zombie', { traits: ['tenacity'], name: '前衛' }),
        mk('skeleton', { traits: ['bone'], name: '骨' }),
        mk('necromancer', { traits: ['necromancy', 'gravekeeper'], name: '術師' })],
      options: { graveyard: true, facilityWorks: 2 },
      endsWith: e => e.type === 'summon',
      expect: [['damage', null], ['summon', '墓地']],
      // 墓地は施設が起こす効果。戦没者は「遺骸を提供した側」であって召喚者ではない。
      extraAsserts: found => {
        const st = found.steps[found.steps.length - 1];
        const ef = st.effect;
        return [
          ['召喚stepの人物actorが null', st.actorId === null && st.actorName === null,
            `actorId=${st.actorId} actorName=${st.actorName}`],
          ['施設は能力情報で表す（facilityId=graveyard）',
            st.declaredBy && st.declaredBy.abilityId === 'graveyard' && st.declaredBy.abilityName === '墓地',
            st.declaredBy ? `${st.declaredBy.abilityId}/${st.declaredBy.abilityName}` : 'declaredBy が無い'],
          ['宣言側にも人物actorを立てない', st.declaredBy && st.declaredBy.actorId === null,
            st.declaredBy ? String(st.declaredBy.actorId) : '-'],
          ['戦没者が召喚者になっていない',
            ef.fallenId && ef.fallenId !== st.actorId && ef.fallenId !== ef.summonedId,
            `fallen=${ef.fallenId} actor=${st.actorId} summoned=${ef.summonedId}`],
          ['戦没者と召喚個体を別の役で保持',
            !!(ef.fallenName && ef.summonedName && ef.fallenName !== ef.summonedName),
            `戦没者=${ef.fallenName} / 召喚個体=${ef.summonedName}`],
          ['対象は召喚個体（戦没者ではない）',
            ef.targetId === ef.summonedId && ef.targetId !== ef.fallenId,
            `target=${ef.targetId}`]
        ];
      } },
    // 攻撃 → 魔王軍完成による伝播ダメージ
    { id: 'OVERKILL', seed: 9, stage: 1,
      units: () => [mk('goblin', { traits: ['coward'], name: '殴り役', boost: 10 }),
        mk('mage', { traits: [], name: '術士', boost: 6 })],
      poolIds: ['goblin', 'goblin', 'goblin', 'goblin', 'mage', 'mage', 'mage', 'mage'],
      options: {},
      endsWith: e => e.type === 'splash',
      expect: [['damage', null], ['damage', '魔王軍完成']] },
    // 仲間割れ（効果を担う子がある宣言）
    { id: '仲間割れ', seed: 4, stage: 2,
      units: () => [mk('ogre', { traits: ['brute'], name: '謀反役', loyalty: 5, boost: 2 }),
        mk('orc', { traits: ['brute'], name: '味方', loyalty: 60 }),
        mk('goblin', { traits: ['coward'], name: '巻き添え', loyalty: 60 })],
      options: {},
      endsWith: e => e.type === 'splash' && e.effectKind === 'damage',
      expect: [['damage', '今ここで下剋上']] },
    // 効果を担う子が無いハプニング（宣言そのものが1段）
    { id: 'ストライキ', seed: 6, stage: 2,
      units: () => [mk('ogre', { traits: ['brute'], name: '未払い役', unpaid: true }),
        mk('orc', { traits: ['brute'], name: '前衛', unpaid: true })],
      options: {},
      endsWith: e => e.effectKind === 'incident:strike',
      expect: [['incident:strike', '戦場ストライキ']],
      // 子のない宣言でも「行動を中止した」こと自体が実効果なので1段
      extraAsserts: (found, sum) => {
        const ev = sum.events.find(e => e.effectKind === 'incident:strike');
        const st = found.steps[found.steps.length - 1];
        return [
          ['ストライキ（kind=skip）は selfEffect で1段', ev && ev.counted === true && ev.depth === 1,
            ev ? `counted=${ev.counted} depth=${ev.depth}` : '-'],
          ['宣言イベント自身が step になっている', ev && ev.stepIds.length === 1 && ev.stepIds[0] === ev.eventId,
            ev ? JSON.stringify(ev.stepIds) : '-'],
          ['子を持たない（行動中止で完結）', st && st.eventIds.length === 1,
            st ? JSON.stringify(st.eventIds) : '-']
        ];
      } },
    // 追加行動の予告だけで、実行されなかった宣言（0段）
    { id: '暴食未実行', seed: 4292, stage: 3,
      units: () => [mk('goblin', { traits: ['coward', 'greedy'], name: '強欲', unpaid: true, loyalty: 10 }),
        mk('ogre', { traits: ['brute', 'chain_massacre', 'overload'], name: '虐殺', loyalty: 10, boost: 5 }),
        mk('orc', { traits: ['brute', 'glutton_feast'], name: '宴', unpaid: true, loyalty: 10, boost: 3 }),
        mk('necromancer', { traits: ['necromancy', 'gravekeeper'], name: '術師', loyalty: 10 })],
      feastUid: 2,
      options: { graveyard: true, extortionLedger: true, facilityWorks: 2 },
      endsWith: e => e.effectKind === 'trait:glutton_feast',
      // 予告だけなので step は作られない。経路は親の糧食消費で終わる
      expect: [['consume:food', null]],
      extraAsserts: (found, sum) => {
        const ev = sum.events.find(e => e.effectKind === 'trait:glutton_feast');
        const last = found.steps[found.steps.length - 1];
        return [
          ['未実行の宣言は 0段（counted=false）', ev && ev.counted === false,
            ev ? `counted=${ev.counted}` : '-'],
          ['どの step にも所属しない（stepIds が空）', ev && ev.stepIds.length === 0,
            ev ? JSON.stringify(ev.stepIds) : '-'],
          ['段を増やしていない（親と同じ 1段）', ev && ev.depth === 1 && ev.rawDepth === 2,
            ev ? `正${ev.depth} / 生${ev.rawDepth}` : '-'],
          ['実効果の子を持たない', ev && !sum.events.some(c => c.parentEventId === ev.eventId),
            '-'],
          ['起きていない出来事を step にしていない', found.steps.length === 1,
            `${found.steps.length}段`],
          ['所属先を追える形で残す（pendingDeclarations）',
            last && last.pendingDeclarations && last.pendingDeclarations.some(d => d.eventId === (ev && ev.eventId)),
            last && last.pendingDeclarations ? JSON.stringify(last.pendingDeclarations) : 'なし']
        ];
      } }
  ];
}

// ── 9件目: 1つの宣言から実効果の子が2件ぶら下がる分岐（合成タイムライン） ────
// 現行の戦闘エンジンではこの形は発生しない。理由は2つあり、どちらもコード上の構造。
//   ・《強欲》は反応者ごとに別々の trait_trigger を出し、その1件が1回の追加行動を起こす
//     （battle.js の for (const reactor of allies) … emitCausal → act）
//   ・《連鎖虐殺》《魔王軍完成》の伝播は次の対象を1体だけ選ぶ（opponents.find）
// 実測でも「強欲×3／虐殺×2／過負荷×2／暴食×2／混合」の 2000 戦で分岐は0件だった。
// それでも正規化APIは分岐を扱う契約になっているので、最小の合成タイムラインを直接
// summarize() へ渡して、契約どおりに振る舞うことをここで固定する。
function sharedDeclarationTimeline() {
  const u = (id, name) => ({ id, name });
  return [
    { type: 'battle_start',
      player: [u('p1', '殴り役'), u('p2', '強欲A'), u('p3', '強欲B'), u('p4', '別枝役')],
      enemy: [u('e1', '剣士ロイ'), u('e2', '弓手ミナ'), u('e3', '盾のガル'), u('e4', '別チェーンの的')] },

    // 本命の枝: 攻撃 → 1つの《強欲》宣言 → 実効果の子が2件
    { eventId: 'A1', chainId: 'cA', type: 'attack', sourceId: 'p1', toId: 'e1', dmg: 30 },
    { eventId: 'A2', chainId: 'cA', parentEventId: 'A1', type: 'trait_trigger',
      traitId: 'greedy', name: '強欲', sourceId: 'p2' },
    { eventId: 'A3', chainId: 'cA', parentEventId: 'A2', type: 'attack',
      sourceId: 'p2', toId: 'e2', dmg: 12, label: '強欲' },
    { eventId: 'A4', chainId: 'cA', parentEventId: 'A2', type: 'attack',
      sourceId: 'p3', toId: 'e3', dmg: 9, label: '強欲' },
    // 同じ親を持つ別の枝。A2 の宣言をここへ吸い寄せてはいけない
    { eventId: 'A5', chainId: 'cA', parentEventId: 'A1', type: 'splash',
      sourceId: 'p4', toId: 'e3', dmg: 4 },

    // 別チェーン。宣言も子も別物で、上の枝と混ざってはいけない
    { eventId: 'B1', chainId: 'cB', type: 'attack', sourceId: 'p1', toId: 'e4', dmg: 20 },
    { eventId: 'B2', chainId: 'cB', parentEventId: 'B1', type: 'trait_trigger',
      traitId: 'greedy', name: '強欲', sourceId: 'p2' },
    { eventId: 'B3', chainId: 'cB', parentEventId: 'B2', type: 'attack',
      sourceId: 'p2', toId: 'e4', dmg: 7, label: '強欲' }
  ];
}

function runSharedDeclaration() {
  console.log('■ 分岐契約（1宣言 → 実効果の子2件・合成タイムライン）\n');
  const sum = summarize(sharedDeclarationTimeline());
  const byId = new Map(sum.events.map(e => [e.eventId, e]));
  const checks = [];
  const check = (label, cond, detail) => { checks.push([label, !!cond, detail]); };

  const decl = byId.get('A2');
  const c1 = byId.get('A3'), c2 = byId.get('A4');
  const sibling = byId.get('A5');
  const otherDecl = byId.get('B2'), otherChild = byId.get('B3');

  // ① 宣言イベントの stepIds が2件
  check('宣言 A2 の stepIds が2件', decl && decl.stepIds.length === 2,
    decl ? JSON.stringify(decl.stepIds) : 'A2 が無い');
  check('stepIds が実効果の子そのもの', decl
    && JSON.stringify(decl.stepIds.slice().sort()) === JSON.stringify(['A3', 'A4']),
    decl ? JSON.stringify(decl.stepIds) : '-');
  // 最初の子だけを選んでいない（宣言自身は段にならず、どちらの子も落とさない）
  check('最初の子だけを選んでいない', decl && decl.counted === false && decl.stepIds.length === 2,
    decl ? `counted=${decl.counted} stepIds=${JSON.stringify(decl.stepIds)}` : '-');

  // ④ 2効果が別々の段として数えられる
  check('A3 と A4 が別々の step', c1 && c2 && c1.stepId === 'A3' && c2.stepId === 'A4',
    c1 && c2 ? `${c1.stepId} / ${c2.stepId}` : '-');
  check('A3・A4 とも 2段目（宣言は段を増やさない）',
    c1 && c2 && c1.depth === 2 && c2.depth === 2 && c1.rawDepth === 3 && c2.rawDepth === 3,
    c1 && c2 ? `正 ${c1.depth}/${c2.depth}・生 ${c1.rawDepth}/${c2.rawDepth}` : '-');

  // ②③ 各効果 step の declaredBy が同じ宣言で、両方に sharedDeclaration が立つ
  const paths = ['A3', 'A4'].map(id => ({ id, found: sum.pathTo(e => e.eventId === id) }));
  for (const { id, found } of paths) {
    const last = found && found.steps[found.steps.length - 1];
    check(`${id} の経路が 2段`, found && found.steps.length === 2,
      found ? `${found.steps.length}段` : '経路が取れない');
    check(`${id} の declaredBy.eventId が A2`, last && last.declaredBy && last.declaredBy.eventId === 'A2',
      last && last.declaredBy ? last.declaredBy.eventId : 'declaredBy が無い');
    check(`${id} の sharedDeclaration === true`, last && last.sharedDeclaration === true,
      last ? String(last.sharedDeclaration) : '-');
    check(`${id} の effect が自分自身（別の子を指していない）`,
      last && last.effect && last.effect.eventId === id, last && last.effect ? last.effect.eventId : '-');
  }
  // 2つの経路の終端 step が本当に別物
  const [pA, pB] = paths.map(p => p.found && p.found.steps[p.found.steps.length - 1]);
  check('2経路の終端 step が別の stepId', pA && pB && pA.stepId !== pB.stepId,
    pA && pB ? `${pA.stepId} / ${pB.stepId}` : '-');
  // 分岐では宣言者と実行者が別人になる。step の行為者は実行者、declaredBy は宣言者。
  check('2経路の行為者が別（A3=強欲A / A4=強欲B）',
    pA && pB && pA.actorName === '強欲A' && pB.actorName === '強欲B',
    pA && pB ? `${pA.actorName} / ${pB.actorName}` : '-');
  check('declaredBy はどちらも宣言者 強欲A',
    pA && pB && pA.declaredBy.actorName === '強欲A' && pB.declaredBy.actorName === '強欲A',
    pA && pB ? `${pA.declaredBy.actorName} / ${pB.declaredBy.actorName}` : '-');
  check('2経路の対象が別（弓手ミナ / 盾のガル）',
    pA && pB && pA.effect.targetName === '弓手ミナ' && pB.effect.targetName === '盾のガル',
    pA && pB ? `${pA.effect.targetName} / ${pB.effect.targetName}` : '-');

  // ⑥ 別枝・別チェーンを誤結合しない
  const sibPath = sum.pathTo(e => e.eventId === 'A5');
  const sibLast = sibPath && sibPath.steps[sibPath.steps.length - 1];
  check('同じ親の別枝 A5 は A2 の宣言を拾わない',
    sibLast && sibLast.declaredBy === null && sibLast.eventIds.join(',') === 'A5',
    sibLast ? `declaredBy=${sibLast.declaredBy && sibLast.declaredBy.eventId} eventIds=${sibLast.eventIds.join(',')}` : '-');
  check('A5 は A2 の stepIds に入っていない', decl && !decl.stepIds.includes('A5'),
    decl ? JSON.stringify(decl.stepIds) : '-');
  check('別チェーンの宣言 B2 の stepIds は B3 のみ',
    otherDecl && JSON.stringify(otherDecl.stepIds) === JSON.stringify(['B3']),
    otherDecl ? JSON.stringify(otherDecl.stepIds) : '-');
  check('B3 の sharedDeclaration === false', otherChild && (() => {
    const f = sum.pathTo(e => e.eventId === 'B3');
    const l = f && f.steps[f.steps.length - 1];
    return l && l.sharedDeclaration === false && l.declaredBy && l.declaredBy.eventId === 'B2';
  })(), '-');
  check('チェーンが2本に分かれている',
    sum.chains.length === 2 && sum.chains.every(c => c.maxDepth === 2),
    JSON.stringify(sum.chains.map(c => [c.chainId, c.maxDepth])));

  let failures = 0;
  for (const [label, ok, detail] of checks) {
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : '   → ' + detail}`);
  }
  console.log('');
  for (const { id, found } of paths) {
    if (!found) continue;
    console.log(`  【経路 ${id}】`);
    for (const st of found.steps) {
      const by = st.declaredBy ? `《${st.declaredBy.abilityName}》による ` : '';
      console.log(`      step${st.depth}: ${by}${st.effect.type}`
        + `${st.actorName ? ' / 行為者 ' + st.actorName : ''}`
        + `${st.effect.targetName ? ' → ' + st.effect.targetName : ''}`
        + `${st.sharedDeclaration ? '（宣言を複数stepへ複製）' : ''}`);
    }
  }
  console.log('');
  if (failures) {
    console.error(`✗ 分岐契約 ${failures}件が一致しない。監査を続行しない。`);
    process.exitCode = 1;
  }
  return failures;
}

const pathTo = (sum, pick) => sum.pathTo(pick);

function runPaths() {
  const env = load('B', 1);
  console.log(`■ 期待経路（定義版 ${CHAIN_DEF_VERSION}／編成・敵・seed固定）\n`);
  let failures = 0;
  for (const sc of scenarios(env)) {
    env.clearStorage();
    env.seed(sc.seed);
    env.Game.newRun();
    env.seed(sc.seed);
    const roster = sc.units();
    const units = roster.map(m => env.Battle.makeUnit(m, 'player'));
    if (sc.unpaidAll) units.forEach(u => { u.unpaid = true; });
    const options = { ...(sc.options || {}) };
    if (sc.poolIds) {
      options.synergyPool = sc.poolIds.map(id => {
        const m = env.Game.rollApplicant(id);
        return { ...m, alive: true, traits: m.traits || [], tags: m.tags || [],
          mods: { dmgMult: 1, takenMult: 1 } };
      });
    }
    if (sc.feastUid !== undefined) {
      options.rations = { consumed: 6, need: 4, shortage: 0, emptied: false, kitchen: false,
        bigEaterUids: [], cookUid: null, hungerUid: null,
        feastUid: roster[sc.feastUid].uid, meal: null };
    }
    const result = env.Battle.simulate(units, makeFoes(env, sc.stage), options);
    const sum = summarize(result.timeline);
    const found = pathTo(sum, sc.endsWith);
    if (!found) { console.log(`【${sc.id}】 ✗ 期待した終端イベントが出なかった\n`); failures++; continue; }
    // 段数だけでなく、各stepの構成（実効果の種類と、その行動を起こした能力名）をassertする
    const got = found.steps.map(s => [s.effectKind, s.declaredBy ? s.declaredBy.abilityName : s.abilityName]);
    const ok = JSON.stringify(got) === JSON.stringify(sc.expect);
    if (!ok) failures++;
    console.log(`【${sc.id}】 ${ok ? '✓' : '✗'} 結合後 ${found.steps.length}段（生 ${found.line.length}段）`);
    for (const e of found.line) {
      console.log(`      生${String(e.rawDepth).padStart(2)} → 正${String(e.depth).padStart(2)}  `
        + `${e.counted ? '[数]' : '[  ]'} ${e.type.padEnd(17)} <${e.effectKind}>`);
    }
    for (const st of found.steps) {
      const by = st.declaredBy ? `《${st.declaredBy.abilityName}》による ` : (st.abilityName ? `《${st.abilityName}》 ` : '');
      console.log(`      step${st.depth}: ${by}${st.effect.type}`
        + `${st.actorName ? ' / 行為者 ' + st.actorName : ''}`
        + `${st.effect.targetName ? ' → ' + st.effect.targetName : ''}`
        + `${st.effect.fallenName ? ' / 戦没者 ' + st.effect.fallenName + '（召喚者ではない）' : ''}`
        + `${st.sharedDeclaration ? '（宣言を複数stepへ複製）' : ''}`);
    }
    if (!ok) console.log(`      期待: ${JSON.stringify(sc.expect)}\n      実際: ${JSON.stringify(got)}`);
    for (const [label, pass, detail] of (sc.extraAsserts ? sc.extraAsserts(found, sum) : [])) {
      if (!pass) failures++;
      console.log(`      ${pass ? '✓' : '✗'} ${label}${pass ? '' : '   → ' + detail}`);
    }
    console.log('');
  }
  if (failures) {
    console.error(`✗ 期待経路 ${failures}件が一致しない。監査を続行しない。`);
    process.exitCode = 1;
  }
  return failures;
}

// ── 戦闘内の同一性（A vs B） ───────────────────────────
function battleParity(n) {
  const A = load('A', 1), B = load('B', 1);
  let mismatch = 0;
  for (let i = 0; i < n; i++) {
    const seed = 500 + i * 131;
    const rows = [A, B].map(env => {
      env.clearStorage();
      env.seed(seed);
      env.Game.newRun();
      env.seed(seed);
      const squad = ['goblin', 'ogre', 'skeleton', 'necromancer', 'orc']
        .map(id => env.Battle.makeUnit(env.Game.rollApplicant(id), 'player'));
      const result = env.Battle.simulate(squad, makeFoes(env, 2 + (i % 6)),
        { graveyard: true, extortionLedger: true, facilityWorks: 2 });
      return { victory: result.victory,
        dmg: result.timeline.filter(e => e.type === 'attack' || e.type === 'splash').map(e => e.dmg).join(',') };
    });
    if (rows[0].victory !== rows[1].victory || rows[0].dmg !== rows[1].dmg) mismatch++;
  }
  console.log(`■ 戦闘内の同一性（A vs B、固定編成 ${n} 戦）`);
  console.log(`  ダメージ列と勝敗の不一致: ${mismatch}件 ${mismatch === 0
    ? '→ 記録の数え直しは戦闘計算へ漏れていない' : '→ ✗ 漏れている'}\n`);
  if (mismatch) process.exitCode = 1;
  return mismatch;
}

// ── 逐次(戦闘中) と 正規化API の段数一致 ────────────────
// 新定義は「実効果」＋「selfEffect の宣言」だけを数えるので、どちらもイベント単体で決まる。
// つまり戦闘中の逐次計算でも、後からタイムラインを読み直しても同じ値が出るはずである。
// ここが食い違うと、倍率が見ている段数と記録・UIが見ている段数がずれる。
function depthParity(n) {
  const env = load('B', 1);
  let mismatch = 0, events = 0, battles = 0;
  for (let i = 0; i < n; i++) {
    const seed = 500 + i * 131;
    env.clearStorage(); env.seed(seed); env.Game.newRun(); env.seed(seed);
    const squad = ['goblin', 'ogre', 'skeleton', 'necromancer', 'orc']
      .map(id => env.Battle.makeUnit(env.Game.rollApplicant(id), 'player'));
    // 未払い・低忠誠を混ぜて skip / friendly_fire のハプニングを踏ませる
    squad.forEach((u, j) => { if (j % 2 === 0) u.unpaid = true; u.loyalty = 15; });
    let result;
    try {
      result = env.Battle.simulate(squad, makeFoes(env, 2 + (i % 6)),
        { graveyard: true, extortionLedger: true, facilityWorks: 2 });
    } catch (e) { continue; }
    battles++;
    const byId = new Map(summarize(result.timeline).events.map(e => [e.eventId, e]));
    for (const e of result.timeline) {
      const got = e.eventId && byId.get(e.eventId);
      if (!got) continue;
      events++;
      if ((e.chainDepth || 0) !== got.depth) mismatch++;
    }
  }
  console.log(`■ 逐次(戦闘中) と 正規化API の段数一致（${battles} 戦 / ${events} イベント）`);
  console.log(`  不一致: ${mismatch}件 ${mismatch === 0
    ? '→ 同じ契約が逐次でも後読みでも同じ値を出す' : '→ ✗ 実装が割れている'}\n`);
  if (mismatch) process.exitCode = 1;
  return mismatch;
}

// ── 通常ランでの影響 ───────────────────────────────────
const power = m => m.hp + m.atk * 3 + m.def * 2 + m.spd;

function deployOrder(Game, st) {
  const best = Game.departmentRoster('combat').slice()
    .sort((a, b) => power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
  best.sort((a, b) => b.hp - a.hp);
  st.activeUids = best.map(m => m.uid);
  Game.setPayrollPolicy('regular');
}

function playRun(env) {
  const { Game } = env;
  env.clearStorage();                     // ラン間の保存状態・履歴は持ち越さない
  Game.newRun();
  const st = Game.state;
  let guard = 0;
  while (st.phase !== 'gameover' && st.phase !== 'clear' && guard++ < 300) {
    while (st.phase === 'recruit' && st.applicants.length) {
      if (st.hiresLeft <= 0) { Game.skipHire(); break; }
      if (!Game.canHire()) {
        const idx = st.applicants.reduce((b, m, i) => power(m) > power(st.applicants[b]) ? i : b, 0);
        const weakest = st.roster.reduce((b, m) => power(m) < power(b) ? m : b, st.roster[0]);
        if (power(st.applicants[idx]) > power(weakest) * 1.1) Game.fire(weakest.uid);
        else { Game.skipHire(); break; }
      }
      Game.hire(st.applicants.reduce((b, m, i) => power(m) > power(st.applicants[b]) ? i : b, 0));
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      deployOrder(Game, st);
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day);
      else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      const index = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(index >= 0 ? index : 2);
    }
    if (st.phase === 'formation') {
      deployOrder(Game, st);
      if (!Game.deploy()) break;
    }
    if (Game.canSeizeStronghold()) Game.seizeStronghold();
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'facility') Game.chooseFacility('graveyard');
    if (st.phase === 'event') {
      if (st.pendingEvent) {
        const opts = Game.eventOptions();
        // 事件の選択も seed 付き乱数で行う（ホストの Math.random は使わない）
        if (opts.length) Game.chooseEvent(opts[Math.floor(env.rand() * opts.length)].i);
      }
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') {
      if (Game.canRetry()) Game.retry();
      else Game.concede();
    }
  }
  const record = st.record || {};
  const test = t => { try { return !!t.test(record); } catch (e) { return false; } };
  const arcane = Game.LESSONS.find(l => l.id === 'arcane');
  const offers = Game.lessonOffers(record);
  const named = Game.BUILD_TRAITS.find(test);
  return {
    clear: st.phase === 'clear',
    stage: st.stage,
    maxChain: st.maxChain || 0,
    // 「条件に当てはまった」と「実際に提示された／実際に名前になった」を別々に数える
    lessonArcaneMatched: !!arcane && test(arcane),
    lessonArcaneOffered: offers.some(l => l.id === 'arcane'),
    buildChainMatched: (record.maxChain || 0) >= 6,
    buildChainNamed: !!named && named.id === 'chain'
  };
}

function report(n) {
  const base = Number(process.env.CHAIN_SEED_BASE || 1000);
  const seeds = Array.from({ length: n }, (_, i) => base + i * 7919);
  const order = ['A', 'B', 'C', 'D', 'E'];
  const out = {};
  for (const mode of order) {
    const env = load(mode, 1);
    const rows = [];
    for (const s of seeds) { env.seed(s); rows.push(playRun(env)); }
    out[mode] = { rows, tiers: env.audit.tiers, gates: env.audit.gates };
  }
  const pct = (rows, key) => (rows.filter(r => r[key]).length / rows.length * 100).toFixed(1) + '%';
  const avg = (rows, key) => (rows.reduce((s, r) => s + (r[key] || 0), 0) / rows.length).toFixed(2);
  console.log(`■ 通常ラン ${seeds.length} 件（同じseed列を全モードへ／seed基 ${base}）\n`);
  console.log('  ' + ['モード', 'クリア率', '到達ステージ', '最大CHAIN'].map((c, i) => c.padEnd(i === 0 ? 26 : 14)).join(''));
  for (const mode of order) {
    const r = out[mode].rows;
    console.log('  ' + [MODES[mode].label, pct(r, 'clear'), avg(r, 'stage'), avg(r, 'maxChain')]
      .map((c, i) => String(c).padEnd(i === 0 ? 26 : 14)).join(''));
  }

  // A と B は乱数列・倍率・発火条件がすべて同じ。1件でも違えば検証失敗。
  const diffs = out.A.rows.map((r, i) => [i, r, out.B.rows[i]])
    .filter(([, a, b]) => a.clear !== b.clear || a.stage !== b.stage);
  if (diffs.length) {
    console.error(`\n✗ 検証失敗: A と B のラン結果が ${diffs.length}件 食い違う。`);
    console.error('  記録の数え直しだけでラン結果が動くなら、段数が乱数・分岐へ漏れている。');
    for (const [i, a, b] of diffs.slice(0, 5)) {
      console.error(`    seed ${seeds[i]}: A=${JSON.stringify(a)}\n                B=${JSON.stringify(b)}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n  A と B のラン結果: 全件一致（記録の数え直しはラン進行へ漏れていない）');
  }

  console.log('\n■ 記録された段数の読まれ方（条件一致と、実際の提示・命名を分ける）');
  const line = (label, key) => console.log(`  ${label.padEnd(40)} A ${pct(out.A.rows, key).padStart(6)} → B ${pct(out.B.rows, key).padStart(6)}`);
  line('教訓「未完の記憶」の条件一致 (maxChain<=2)', 'lessonArcaneMatched');
  line('　└ 実際に3択へ提示された', 'lessonArcaneOffered');
  line('ビルド名「N連鎖を通した」の条件一致 (>=6)', 'buildChainMatched');
  line('　└ 実際にその名前になった（先頭一致）', 'buildChainNamed');
  console.log('  ※ 教訓は敗北画面で人が1つ選ぶ。選択率はここでは測れない。');

  const multOf = d => d < 3 ? 1 : (d === 3 ? 1.25 : Math.min(2.5, 1.75 + (d - 4) * .25));
  const tiers = out.B.tiers;              // B は展開が現行と同一なので母集団として正しい
  const bucket = new Map();
  let down = 0;
  for (const [legacy, next] of tiers) {
    bucket.set(`${legacy}→${next}`, (bucket.get(`${legacy}→${next}`) || 0) + 1);
    if (multOf(next) < multOf(legacy)) down++;
  }
  console.log(`\n■ 消費者①ダメージ倍率：味方のダメージ判定 ${tiers.length}件`);
  for (const [key, count] of [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    const [l, c] = key.split('→').map(Number);
    console.log(`  ${key.padEnd(8)} ${String(count).padStart(6)}件  ×${multOf(l).toFixed(2)} → ×${multOf(c).toFixed(2)}`);
  }
  console.log(`  倍率が下がる判定: ${down}件（${(down / Math.max(1, tiers.length) * 100).toFixed(2)}%）`);

  const gates = out.B.gates;
  const flipped = gates.filter(([l, nx]) => (l >= 3) !== (nx >= 3)).length;
  console.log(`\n■ 消費者②連鎖ハプニングの発火条件（unit.chainDepth >= 3）`);
  console.log(`  追加行動 ${gates.length}件のうち、条件の真偽が変わるのは ${flipped}件`
    + `（${(flipped / Math.max(1, gates.length) * 100).toFixed(1)}%）`);
  console.log('  影響の分離は上の表の C（倍率だけ）/ D（条件だけ）/ E（両方）で読む。');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const runsIndex = args.indexOf('--runs');
  const wantPaths = args.includes('--paths') || runsIndex < 0;
  const n = runsIndex >= 0 ? (Number(args[runsIndex + 1]) || 200) : (args.includes('--paths') ? 0 : 200);
  if (wantPaths) {
    if (runPaths() + runSharedDeclaration() === 0) { battleParity(24); depthParity(400); }
  }
  if (n > 0) report(n);
}

module.exports = { classify, summarize, load, patchBattle, scenarios,
  sharedDeclarationTimeline, CHAIN_DEF_VERSION };
