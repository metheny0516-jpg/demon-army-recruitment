// CHAIN（連鎖）の正規化API。
//
// 生の因果グラフ（parentEventId / chainId / chainDepth）は battle.js が付ける。
// このファイルは**それを読み直すだけ**で、戦闘計算にもラン状態にも一切触らない。
// 契約と測定の全文は docs/CHAIN_CONTRACT_2026-09-06.md（Astra承認済み・ebc40a1）。
//
// ── いまの立ち位置（重要） ──────────────────────────────
// **このAPIを追加しただけでは、表示・記録・戦闘結果は何も変わらない。**
//   ・倍率（battle.js の chainDepth >= 3）
//   ・連鎖ハプニングの発火条件（battle_happenings.js の u.chainDepth >= 3）
//   ・記録の閾値（run.js の教訓 <=2 / ビルド名 >=6）
//   ・表示（Battle.summarizeChains() の maxChain）
// これらは**すべて現行(V1)の数え方のまま**であり、切り替えは別承認の別作業である。
// Chain.summarize() は現時点では「読める形で並べ直す」ためだけに存在する。
//
// ── 数え方の原則 ────────────────────────────────────────
// 「どこで計算しているか」では分けない。**同じ実効果を一度だけ数える**で統一する。
//   ・実効果 effect      : 別の能力・規則が起こす、別個の状態変化。1段と数える。
//   ・補足   restate     : 親と同じ一つの効果の言い換え・内訳・修飾。段を増やさない。
//   ・宣言   declaration : 「これから起こす」。効果を担う子があるならその子が1段。
//                          子が無いときは selfEffect で分かれる。
//                            selfEffect=true  … そのイベント自身が実効果（行動中止など）→ 1段
//                            selfEffect=false … 予告しただけで実行されなかった          → 0段
// 未分類のイベントが出たら**停止する**（黙って0段扱いにしない）。
//
// ── 段数の読み出しについての注意 ────────────────────────
// 親の段数を `parent.chainDepth || 1` で読んではいけない。新定義では0段の親
// （未実行の予告、効果を子に委ねる宣言）が出るため、0 が falsy で 1 に読み替えられ、
// 子が1段ぶん水増しされる。読むときは必ず `?? 1` 相当にすること。

const Chain = {
  // 正規化APIの出力（summarize の戻り値）の契約バージョン。
  DEF_VERSION: 2,

  // **いま実際に記録している CHAIN 値**のバージョン。
  // maxChain・魔界史・KPI・倍率・閾値はすべて現行(V1)の数え方のままなので 1。
  // V2 へ切り替える承認が出て、実際に記録する値が変わったときに初めて 2 になる。
  // 将来の切替予約を V2 と偽って保存しないこと（保存値は「いま記録している値」と一致させる）。
  RECORDED_VERSION: 1,

  // 保存済みの値のバージョンを読む。不明・欠落は V1 として扱い、値を推定変換しない。
  versionOf(saved) {
    const v = saved && Number(saved.chainDefVersion);
    return Number.isFinite(v) && v >= 1 ? v : 1;
  },

  summarize(timeline) { return summarize(timeline); },
  classify(type, data) { return classify(type, data); }
};

// ── 因果イベントの役 ───────────────────────────────────
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
    for (const h of (typeof BATTLE_HAPPENINGS !== "undefined" ? BATTLE_HAPPENINGS : [])) {
      HAPPENING_KIND.set(h.id, h.kind);
    }
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
      + '  → CLASSIFY へ役を足すまで先へ進めない（黙って0段扱いにしない）');
  }
  // selfEffect の既定は false。宣言は明示したものだけが「自分自身で1段」になる。
  return { selfEffect: false, ...got };
}

// ── 正規化API（単一の入口） ────────────────────────────
// 生の因果グラフ（parentEventId）はそのまま残し、ここで読み方だけを与える。
//
// 結合の向き:
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
    defVersion: Chain.DEF_VERSION,
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

if (typeof module !== "undefined") module.exports = { Chain, summarize, classify };
