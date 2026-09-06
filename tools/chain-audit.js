// CHAIN再定義の影響監査。src/ は一切変更せず、読み込んだ battle.js の
// 「深さの数え方」だけを差し替えた写しを作り、新旧を同じ入力・同じseedで比べる。
//
//   node tools/chain-audit.js --paths        … 5系統の期待経路を固定する（見本を表示）
//   node tools/chain-audit.js --runs 150     … 通常ランでの影響（既定150ラン）
//   node tools/chain-audit.js                … 両方
//
// ── 3つのモード ─────────────────────────────────────────
//   A legacy : 現行。親を持つ因果イベントは種類を問わず必ず+1段。
//   B count  : 深さの数え方だけ新定義にする。**倍率は現行の段数で計算する**。
//              乱数の呼び出し数が変わらないので戦闘展開は A と完全に同じで、
//              「記録（最大CHAIN・代表経路）だけがどう変わるか」を切り出せる。
//   C full   : 新定義の段数をそのまま倍率にも使う。ここで初めて数値が動く。
//
// B を挟むのは、設計書 第4節「ついでに段数を数え直さない」を守るため。
// 段数の変更と倍率の変更を混ぜて報告しない。
const fs = require('fs'), vm = require('vm');

// ── 因果イベントの分類（契約案） ───────────────────────
// effect  実効果       : HP・資源・編成・倍率のいずれかを実際に動かす。1段と数える。
// notice  通知         : すでに決まっている結果を知らせるだけ。段を増やさない。
// restate 同一効果の補足: 親と同じ一つの効果を言い換える／宣言する。段を増やさない。
//
// 種別だけでは足りない（trait_trigger と facility_trigger が3役を兼ねる）ので、
// traitId / facilityId / resource まで見て分ける。
const ROLE = {
  attack: () => 'effect',
  splash: () => 'effect',
  revive: () => 'effect',
  summon: () => 'effect',
  heal: () => 'effect',
  momentum: () => 'effect',              // 味方全員の与ダメージ倍率が上がる
  incident: () => 'effect',              // 仲間割れ。直後に同士討ちのダメージが続く
  resource_forfeit: () => 'effect',
  // 死は「その一撃の結果」だが、略奪・墓地・魂の反応がすべてここを親に持つ分岐点。
  // 反応の起点なので実効果として1段数える。
  death: () => 'effect',
  resource_gain: () => 'effect',
  // 魂1を消費は《魂の徴収》の内訳（同じ一つの効果の後半）
  resource_consume: d => (d.resource === 'soul' ? 'restate' : 'effect'),
  trait_trigger: d => {
    // 「これから起こす」宣言。実効果は直後の子（追加行動・伝播ダメージ）が持つ
    if (['greedy', 'chain_massacre', 'overload'].includes(d.traitId)) return 'restate';
    // 出撃前に計算済みの倍率を書き写しているだけ（V2aの伝票・preparedRosterのmods）
    if (['demon_cook', 'big_eater'].includes(d.traitId)) return 'notice';
    return 'effect';                     // soul_harvest / hunger_demon / glutton_feast
  },
  synergy_trigger: () => 'effect',       // 追い剥ぎコンビ：次の味方攻撃 +25%
  facility_trigger: d => {
    if (d.facilityId === 'graveyard') return 'restate';     // 実効果は子の summon
    if (d.facilityId === 'grand_kitchen') return 'notice';  // 倍率は伝票側で計算済み
    return 'effect';                                        // 恐喝帳簿：次の味方攻撃 +40%
  },
  overkill: () => 'restate',             // 同じ一撃の余剰の言い換え
  survive: () => 'notice'                // onLethal がすでに救っている
};
const roleOf = (type, data) => (ROLE[type] ? ROLE[type](data || {}) : 'effect');

const FILES = ['src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js', 'src/core/util.js',
  'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'];

// battle.js の本文を差し替える。当たらなければ例外（実装が動いたのに黙って旧結果を出さない）。
function patchBattle(src) {
  const swap = (from, to) => {
    if (!src.includes(from)) throw new Error('chain-audit: battle.js の差し替え箇所が見つからない:\n' + from.slice(0, 80));
    src = src.replace(from, to);
  };
  swap(
`        data.chainId = parent.chainId || parent.eventId;
        data.chainDepth = (parent.chainDepth || 1) + 1;`,
`        data.chainId = parent.chainId || parent.eventId;
        data.chainRole = CHAIN_AUDIT.roleOf(type, data);
        data.legacyDepth = (parent.legacyDepth || 1) + 1;
        data.chainDepth = (CHAIN_AUDIT.countAll || data.chainRole === "effect")
          ? (parent.chainDepth || 1) + 1 : (parent.chainDepth || 1);`);
  swap(
`      } else {
        data.chainDepth = 1;
      }`,
`      } else {
        data.chainDepth = 1;
        data.legacyDepth = 1;
        data.chainRole = CHAIN_AUDIT.roleOf(type, data);
      }`);
  // 段数の消費者は2か所ある。倍率だけでなく、連鎖ハプニングの発火条件
  // （battle_happenings.js の `u.chainDepth >= 3`）も同じ数を読んでいる。
  // B モードでは両方を現行の段数で動かす。そうしないと乱数の呼び出し数が変わり、
  // 「段数の変更だけ」を切り出せない。
  swap(
`      unit.chainDepth = actionOpts.parentEvent ? (actionOpts.parentEvent.chainDepth || 1) + 1 : 1;`,
`      const actorLegacy = actionOpts.parentEvent ? (actionOpts.parentEvent.legacyDepth || 1) + 1 : 1;
      const actorNext = actionOpts.parentEvent ? (actionOpts.parentEvent.chainDepth || 1) + 1 : 1;
      if (actionOpts.parentEvent) CHAIN_AUDIT.gates.push([actorLegacy, actorNext]);
      unit.chainDepth = CHAIN_AUDIT.multLegacy ? actorLegacy : actorNext;`);
  swap(
`      const chainDepth = opts.parentEvent ? (opts.parentEvent.chainDepth || 1) + 1 : 1;
      if (attacker.side === "player" && chainDepth >= 3) {
        const chainMult = chainDepth === 3 ? 1.25 : Math.min(2.5, 1.75 + (chainDepth - 4) * .25);
        amount *= chainMult;
        opts.traits = [...(opts.traits || []), \`CHAIN \${chainDepth} ×\${chainMult.toFixed(2)}\`];
      }`,
`      const chainDepth = opts.parentEvent ? (opts.parentEvent.chainDepth || 1) + 1 : 1;
      const legacyDepth = opts.parentEvent ? (opts.parentEvent.legacyDepth || 1) + 1 : 1;
      const multDepth = CHAIN_AUDIT.multLegacy ? legacyDepth : chainDepth;
      if (attacker.side === "player") CHAIN_AUDIT.tiers.push([legacyDepth, chainDepth, multDepth]);
      if (attacker.side === "player" && multDepth >= 3) {
        const chainMult = multDepth === 3 ? 1.25 : Math.min(2.5, 1.75 + (multDepth - 4) * .25);
        amount *= chainMult;
        opts.traits = [...(opts.traits || []), \`CHAIN \${multDepth} ×\${chainMult.toFixed(2)}\`];
      }`);
  return src;
}

// mode: 'A' | 'B' | 'C'
function load(mode, seed) {
  const store = {};
  let s = (seed >>> 0) || 1;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const M = Object.create(Math);
  M.random = rng;
  const audit = { roleOf, countAll: mode === 'A', multLegacy: mode === 'B', tiers: [], gates: [] };
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
    Synergy: vm.runInContext('Synergy', ctx),
    ENEMY_STAGES: vm.runInContext('ENEMY_STAGES', ctx),
    seed: v => { s = (v >>> 0) || 1; }
  };
}

// ── 期待経路（5系統） ──────────────────────────────────
// Battle.simulate を直接呼ぶ。勝敗やダメージ量は見ない。
// 見るのは「どの役がどの順で並ぶか」だけで、編成・敵・seed を固定してある。
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
    if (opt.boost) { m.atk = Math.round(m.atk * opt.boost); m.hp = Math.round(m.hp * 2); }
    return m;
  };
  return [
    { id: '略奪', seed: 7, stage: 2,
      units: () => [mk('goblin', { traits: ['coward', 'pickpocket'], name: '盗む役' }),
        mk('goblin', { traits: ['coward', 'greedy'], name: '反応役' }),
        mk('ogre', { traits: ['brute'], name: '殴り役', boost: 3 })],
      options: { extortionLedger: true, facilityWorks: 2 },
      want: ['attack', 'death', 'resource_gain', 'trait_trigger(greedy)', 'attack'] },
    { id: '食料', seed: 11, stage: 2,
      units: () => [mk('goblin', { traits: ['coward', 'pickpocket'], name: '料理人' }),
        mk('ogre', { traits: ['brute', 'big_eater'], name: '大食漢', boost: 3 }),
        mk('orc', { traits: ['brute'], name: '前衛' })],
      options: { rations: { consumed: 6, need: 6, shortage: 0, emptied: false, kitchen: true,
        bigEaterUids: [], cookUid: null, feastUid: null, hungerUid: null,
        meal: { targetUid: null, boost: .3, boostPercent: 30, kitchenMult: 2, tiedUids: [] } } },
      want: ['resource_consume(food)', 'facility_trigger(grand_kitchen)'] },
    { id: '死霊', seed: 5, stage: 4,
      units: () => [mk('zombie', { traits: ['tenacity'], name: '前衛' }),
        mk('skeleton', { traits: ['bone', 'soul_harvest'], name: '徴収役' }),
        mk('necromancer', { traits: ['necromancy', 'gravekeeper'], name: '術師' })],
      options: {},
      want: ['attack', 'death', 'resource_gain(soul)', 'revive', 'trait_trigger(soul_harvest)'] },
    { id: '召喚', seed: 3, stage: 6,
      units: () => [mk('zombie', { traits: ['tenacity'], name: '前衛' }),
        mk('skeleton', { traits: ['bone'], name: '骨' }),
        mk('necromancer', { traits: ['necromancy', 'gravekeeper'], name: '術師' })],
      options: { graveyard: true, facilityWorks: 2 },
      want: ['death', 'facility_trigger(graveyard)', 'summon'] },
    { id: 'OVERKILL', seed: 9, stage: 1,
      units: () => [mk('ogre', { traits: ['brute', 'chain_massacre'], name: '虐殺役', boost: 8 }),
        mk('orc', { traits: ['brute'], name: '前衛' }),
        mk('goblin', { traits: ['coward', 'pickpocket'], name: '盗む役' })],
      options: {},
      want: ['attack', 'overkill', 'trait_trigger(chain_massacre)', 'splash'] }
  ];
}

const labelOf = e => {
  const tag = e.traitId || e.facilityId || e.synergyId || e.resource || '';
  return `${e.type}${tag ? '(' + tag + ')' : ''}`;
};

// 最深（現行の数え方で最も深い）イベントから親をたどった一本
function deepestPath(timeline) {
  const deepest = timeline.filter(e => Number.isFinite(e.legacyDepth))
    .reduce((best, e) => (!best || e.legacyDepth > best.legacyDepth ? e : best), null);
  if (!deepest) return [];
  const byId = new Map(timeline.map(e => [e.eventId, e]));
  const steps = [];
  for (let cur = deepest; cur; cur = cur.parentEventId ? byId.get(cur.parentEventId) : null) steps.unshift(cur);
  return steps;
}

// ある種類のイベントを終端に持つ経路（系統ごとの見本用）
function pathEndingWith(timeline, match) {
  const byId = new Map(timeline.map(e => [e.eventId, e]));
  const hit = timeline.filter(e => match(e))
    .reduce((best, e) => (!best || (e.legacyDepth || 0) > (best.legacyDepth || 0) ? e : best), null);
  if (!hit) return [];
  const steps = [];
  for (let cur = hit; cur; cur = cur.parentEventId ? byId.get(cur.parentEventId) : null) steps.unshift(cur);
  return steps;
}

function runPaths() {
  // B モードで走らせる：戦闘展開は現行と完全に同じまま、両方の段数が記録される。
  const env = load('B', 1);
  console.log('■ 期待経路（現行→新定義。編成・敵・seed固定。B モード＝展開は現行と同一）\n');
  console.log('  役: [実]実効果=1段  [通]通知=段を増やさない  [補]同一効果の補足=段を増やさない\n');
  const mark = { effect: '実', notice: '通', restate: '補' };
  for (const sc of scenarios(env)) {
    env.seed(sc.seed);
    env.Game.newRun();
    env.seed(sc.seed);
    const units = sc.units().map(m => env.Battle.makeUnit(m, 'player'));
    const result = env.Battle.simulate(units, makeFoes(env, sc.stage), sc.options || {});
    const tl = result.timeline;
    const terminal = sc.want[sc.want.length - 1].split('(')[0];
    let path = pathEndingWith(tl, e => labelOf(e) === sc.want[sc.want.length - 1] || e.type === terminal);
    if (!path.length) path = deepestPath(tl);
    console.log(`【${sc.id}】 ${path.length ? '' : '（経路が出なかった）'}`);
    for (const step of path) {
      const role = step.chainRole || 'effect';
      console.log(`    ${String(step.legacyDepth).padStart(2)} → ${String(step.chainDepth).padStart(2)}  [${mark[role]}] ${labelOf(step)}`);
    }
    const last = path[path.length - 1];
    if (last) console.log(`    段数: 現行 ${last.legacyDepth} → 新定義 ${last.chainDepth}\n`);
  }
}

// ── 戦闘そのものが変わっていないことの確認 ───────────────
// 段数の数え方だけを変えた B は、戦闘内では現行と1ダメージも違ってはいけない。
// （違うなら、段数が倍率や発火条件へ漏れている）
function battleParity(n) {
  const A = load('A', 1), B = load('B', 1);
  let compared = 0, mismatch = 0;
  for (let i = 0; i < n; i++) {
    const seed = 500 + i * 131;
    const rows = [A, B].map(env => {
      env.seed(seed);
      env.Game.newRun();
      env.seed(seed);
      const squad = ['goblin', 'ogre', 'skeleton', 'necromancer', 'orc']
        .map(id => env.Battle.makeUnit(env.Game.rollApplicant(id), 'player'));
      const result = env.Battle.simulate(squad, makeFoes(env, 2 + (i % 6)),
        { graveyard: true, extortionLedger: true, facilityWorks: 2 });
      return {
        victory: result.victory,
        dmg: result.timeline.filter(e => e.type === 'attack' || e.type === 'splash').map(e => e.dmg).join(','),
        maxChain: (result.chainSummary || {}).maxChain || 0
      };
    });
    compared++;
    if (rows[0].victory !== rows[1].victory || rows[0].dmg !== rows[1].dmg) mismatch++;
  }
  console.log(`■ 戦闘内の同一性（A vs B、固定編成 ${compared} 戦）`);
  console.log(`  ダメージ列と勝敗の不一致: ${mismatch}件 ${mismatch === 0
    ? '→ 段数の変更は戦闘計算へ漏れていない' : '→ ⚠ 漏れている'}\n`);
  return mismatch;
}

// ── 通常ランでの影響 ───────────────────────────────────
// sim.js と同じ「最も強い応募者を採る」基準戦略。Game のAPIしか使わないので
// 数値式をここで再実装していない。
const power = m => m.hp + m.atk * 3 + m.def * 2 + m.spd;

function playRun(env) {
  const { Game } = env;
  Game.newRun();
  const st = Game.state;
  let guard = 0;
  let battles = 0;
  // 位相の進め方は tools/sim.js の基準戦略「最強優先」と同じ手順を踏む。
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
      const best = Game.departmentRoster('combat').slice()
        .sort((a, b) => power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      best.sort((a, b) => b.hp - a.hp);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day);
      else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      const index = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(index >= 0 ? index : 2);
    }
    if (st.phase === 'formation') {
      const best = Game.departmentRoster('combat').slice()
        .sort((a, b) => power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      best.sort((a, b) => b.hp - a.hp);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      const out = Game.deploy();
      if (!out) break;
      battles += 1;
    }
    if (Game.canSeizeStronghold()) Game.seizeStronghold();
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'facility') Game.chooseFacility('graveyard');
    if (st.phase === 'event') {
      if (st.pendingEvent) {
        const opts = Game.eventOptions();
        if (opts.length) Game.chooseEvent(opts[Math.floor(Math.random() * opts.length)].i);
      }
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') {
      if (Game.canRetry()) Game.retry();
      else Game.concede();
    }
  }
  const maxChain = st.maxChain || 0;
  return {
    clear: st.phase === 'clear',
    stage: st.stage,
    maxChain,
    // 記録された段数を読む2か所（ここが記録互換の要）
    lessonArcane: maxChain <= 2,     // 教訓「未完の記憶」＝次ランの応募傾向が変わる
    buildChain: maxChain >= 6        // 魔界史のビルド名「N連鎖を通した」
  };
}

function runCompare(n) {
  const base = Number(process.env.CHAIN_SEED_BASE || 1000);
  const seeds = Array.from({ length: n }, (_, i) => base + i * 7919);
  const modes = ['A', 'B', 'C'];
  const out = {};
  for (const mode of modes) {
    const env = load(mode, 1);
    const rows = [];
    for (const s of seeds) { env.seed(s); rows.push(playRun(env)); }
    out[mode] = { rows, tiers: env.audit.tiers };
  }
  return { seeds, out };
}

function report(n) {
  const { seeds, out } = runCompare(n);
  const pct = rows => (rows.filter(r => r.clear).length / rows.length * 100).toFixed(1);
  const avg = (rows, key) => (rows.reduce((s, r) => s + (r[key] || 0), 0) / rows.length).toFixed(2);
  console.log(`■ 通常ラン ${seeds.length} 件（同じseed一覧を3モードへ与える）\n`);
  const head = ['モード', 'クリア率', '平均到達ステージ', '平均 最大CHAIN'];
  const rowOf = (label, m) => [label, pct(out[m].rows) + '%', avg(out[m].rows, 'stage'), avg(out[m].rows, 'maxChain')];
  const table = [head, rowOf('A 現行', 'A'), rowOf('B 段数のみ新定義', 'B'), rowOf('C 段数＋倍率', 'C')];
  for (const r of table) console.log('  ' + r.map((c, i) => String(c).padEnd(i === 0 ? 18 : 16)).join(''));

  // A と B は同じ乱数列・同じ倍率なので、結果は1件残らず一致していなければならない。
  const same = out.A.rows.every((r, i) => r.clear === out.B.rows[i].clear && r.stage === out.B.rows[i].stage);
  const rate = (m, key) => (out[m].rows.filter(r => r[key]).length / out[m].rows.length * 100).toFixed(1) + '%';
  console.log('\n■ 記録された段数を読む2か所（しきい値の再アンカーが要るところ）');
  console.log(`  教訓「未完の記憶」(maxChain<=2 で次ランの応募傾向が変わる): A ${rate('A', 'lessonArcane')} → B ${rate('B', 'lessonArcane')}`);
  console.log(`  ビルド名「N連鎖を通した」(maxChain>=6):                    A ${rate('A', 'buildChain')} → B ${rate('B', 'buildChain')}`);
  console.log(`\n  A と B のラン結果の一致: ${same ? '全件一致'
    : '不一致あり（原因は上の2か所。戦闘内はA/B完全一致であることを別途確認済み）'}`);
  if (!same && process.env.CHAIN_DEBUG) {
    out.A.rows.forEach((r, i) => {
      const b = out.B.rows[i];
      if (r.clear !== b.clear || r.stage !== b.stage) console.log('    差分 seed', seeds[i], JSON.stringify(r), JSON.stringify(b));
    });
  }

  // 倍率の段が実際にどう動くか（味方のダメージ判定ごと）
  const tiers = out.B.tiers;   // B は展開が現行と同じなので、母集団として正しい
  const multOf = d => d < 3 ? 1 : (d === 3 ? 1.25 : Math.min(2.5, 1.75 + (d - 4) * .25));
  const bucket = new Map();
  let downgraded = 0, kept = 0;
  for (const [legacy, next] of tiers) {
    const key = `${legacy}→${next}`;
    bucket.set(key, (bucket.get(key) || 0) + 1);
    if (multOf(next) < multOf(legacy)) downgraded++; else kept++;
  }
  console.log(`\n■ 味方のダメージ判定 ${tiers.length} 件の段数（現行→新定義）`);
  const top = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [key, count] of top) {
    const [l, c] = key.split('→').map(Number);
    console.log(`  ${key.padEnd(8)} ${String(count).padStart(6)}件  倍率 ×${multOf(l).toFixed(2)} → ×${multOf(c).toFixed(2)}`);
  }
  console.log(`  倍率が下がる判定: ${downgraded}件 / 据え置き: ${kept}件`);
}

const args = process.argv.slice(2);
if (require.main === module) {
  const wantPaths = args.includes('--paths') || !args.some(a => a === '--runs');
  const runsIndex = args.indexOf('--runs');
  const n = runsIndex >= 0 ? Number(args[runsIndex + 1]) || 150 : (args.includes('--paths') ? 0 : 150);
  if (wantPaths) runPaths();
  if (wantPaths) battleParity(24);
  if (n > 0) report(n);
}

module.exports = { roleOf, load, patchBattle, scenarios, deepestPath, labelOf };
