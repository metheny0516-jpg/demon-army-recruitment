// CHAIN倍率をV2基準へ切り替えた場合の勝率影響を A/B 測定する。
//
//   node tools/chain-mult-ab.js 200 --json out.json
//   CHAIN_SEED_BASE=2000 node tools/chain-mult-ab.js 200
//   node tools/chain-mult-ab.js 200 --v2-threshold 2     … 引き下げ案の閾値を変える
//
// **ゲーム本体（src/）は1行も変更しない。** battle.js の写しに対して
// 「倍率が読む段数」だけを差し替え、同じseedで走らせて比べる。
//
// ── なぜ1回の戦闘から両方を出せないか ──────────────────
// 記録の読み替え（chain-v2-measure.js）と違い、倍率は**戦闘へ跳ね返る**。
// 倍率が変われば与ダメージが変わり、撃破の順番が変わり、以後の展開がまるごと変わる。
// だから同じ戦闘から両方は出せない。**同じseedで別々に走らせ、
// A/B以外の入力が一致していることをassertする**方式にする。
//
// ── 差し替えるのは倍率が読む段数だけ ────────────────────
// timeline の `chainDepth` は**production のまま**（raw V1）にして、
// V2の段数は `v2Depth` という別フィールドへ並記する。こうすると
//   ・記録（record.maxChain）・ハプニング発火条件・演出閾値は全モードで同一
//   ・違うのは applyDamage が倍率を決めるときに読む値だけ
// になり、勝敗差の原因を倍率だけに絞れる。
//
// ── モード ────────────────────────────────────────────
//   V1     … 現行。倍率は raw chainDepth を読む（>=3 で 1.25 / 1.75 / +0.25 / 上限2.5）
//   V2same … 倍率は v2Depth を読む。**段数閾値と倍率表は現行のまま**（>=3）
//   V2low  … 倍率は v2Depth を読む。**V1と近い発生頻度になるよう閾値を下げる**（既定 >=2）
//
// V2low の倍率表は閾値からの相対で同じ形にする（T で1.25、T+1 で1.75、以後 +0.25、上限2.5）。
const fs = require('fs'), vm = require('vm');

const args = process.argv.slice(2);
const N = Number(args[0] && !args[0].startsWith('--') ? args[0] : 200);
const SEED_BASE = Number(process.env.CHAIN_SEED_BASE || 1000);
const jsonOut = (() => { const at = args.indexOf('--json'); return at >= 0 ? args[at + 1] : null; })();
const V2_LOW_THRESHOLD = (() => {
  const at = args.indexOf('--v2-threshold');
  return at >= 0 ? Number(args[at + 1]) : 2;
})();
const TRANSPARENCY_RUNS = Number(process.env.MULT_AB_TRANSPARENCY || 30);

// ── 分類は本体の Chain をそのまま使う（写しを持たない） ────
const chainCtx = { module: { exports: {} }, console };
vm.createContext(chainCtx);
vm.runInContext(fs.readFileSync(__dirname + '/../src/data/battle_happenings.js', 'utf8'), chainCtx);
vm.runInContext(fs.readFileSync(__dirname + '/../src/core/chain.js', 'utf8'), chainCtx,
  { filename: 'src/core/chain.js' });
const Chain = chainCtx.module.exports.Chain;

// ── battle.js の写しに、倍率が読む段数だけを差し替える ─────
function patchBattle(src) {
  src = src.replace(/\r\n/g, '\n');
  const swap = (from, to) => {
    if (!src.includes(from)) {
      throw new Error('chain-mult-ab: battle.js の差し替え箇所が見つからない:\n' + from.slice(0, 100)
        + '\n  → battle.js が変わったらここを直すこと。写しを作って回避しないこと');
    }
    src = src.replace(from, to);
  };
  // 因果イベントへ v2Depth を並記する。chainDepth（raw）は触らない。
  swap(
`        data.chainId = parent.chainId || parent.eventId;
        data.chainDepth = (parent.chainDepth || 1) + 1;`,
`        data.chainId = parent.chainId || parent.eventId;
        data.chainDepth = (parent.chainDepth || 1) + 1;
        // V2の段数を並記する。親の段数を || 1 で読んではいけない（0段の親が出るため）。
        data.v2Depth = Math.MULT_AB.depthOf(parent) + (Math.MULT_AB.step(type, data) ? 1 : 0);`);
  swap(
`      } else {
        data.chainDepth = 1;
      }`,
`      } else {
        data.chainDepth = 1;
        data.v2Depth = Math.MULT_AB.step(type, data) ? 1 : 0;
      }`);
  // 倍率。**ここだけがA/Bの差**。閾値からの相対で同じ形の表を作る。
  swap(
`      const chainDepth = opts.parentEvent ? (opts.parentEvent.chainDepth || 1) + 1 : 1;
      if (attacker.side === "player" && chainDepth >= 3) {
        const chainMult = chainDepth === 3 ? 1.25 : Math.min(2.5, 1.75 + (chainDepth - 4) * .25);
        amount *= chainMult;
        opts.traits = [...(opts.traits || []), \`CHAIN \${chainDepth} ×\${chainMult.toFixed(2)}\`];
      }`,
`      const chainDepth = opts.parentEvent ? (opts.parentEvent.chainDepth || 1) + 1 : 1;
      const v2Depth = opts.parentEvent ? Math.MULT_AB.depthOf(opts.parentEvent) + 1 : 1;
      const AB = Math.MULT_AB;
      const multDepth = AB.useV2 ? v2Depth : chainDepth;
      const T = AB.threshold;
      if (attacker.side === "player") {
        const applied = multDepth >= T;
        const m = applied ? (multDepth === T ? 1.25 : Math.min(2.5, 1.75 + (multDepth - T - 1) * .25)) : 1;
        AB.roll(chainDepth, v2Depth, applied, m);
      }
      if (attacker.side === "player" && multDepth >= T) {
        const chainMult = multDepth === T ? 1.25 : Math.min(2.5, 1.75 + (multDepth - T - 1) * .25);
        amount *= chainMult;
        opts.traits = [...(opts.traits || []), \`CHAIN \${multDepth} ×\${chainMult.toFixed(2)}\`];
      }`);
  return src;
}

// ── 1モードぶんの実行環境。sim.js の戦略とランの回し方をそのまま使う ──
const SIM_SRC = fs.readFileSync(__dirname + '/sim.js', 'utf8');
const CUT = 'const N = Number(process.argv[2] || 400);';
if (!SIM_SRC.includes(CUT)) throw new Error('chain-mult-ab: tools/sim.js の切り出し位置が見つからない');
const SIM_HEAD = SIM_SRC.slice(0, SIM_SRC.indexOf(CUT));

function makeEnv(mode) {
  // sim.js は自分でゲームを読み込む。battle.js だけ写しへ差し替えたいので fs を包む。
  const patched = mode.patch;
  const fsProxy = {
    ...fs,
    readFileSync: (file, enc) => {
      const raw = fs.readFileSync(file, enc);
      return (patched && String(file).replace(/\\/g, '/').endsWith('src/core/battle.js'))
        ? patchBattle(raw) : raw;
    }
  };
  let seedState = 1;
  // 差し替えた battle.js が設定を読む唯一の入口。sim.js が ctx へ渡すのは
  // console / Math / Date / JSON / localStorage だけなので、共有される Math に載せる。
  const seededMath = Object.create(Math);
  seededMath.random = () => {
    seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
    return seedState / 0x7fffffff;
  };
  const cfg = {
    useV2: !!mode.useV2,
    threshold: mode.threshold,
    depthOf: ev => (ev && ev.v2Depth != null ? ev.v2Depth : 1),
    step: (type, data) => {
      const c = Chain.classify(type, data);
      return c.role === 'effect' || (c.role === 'declaration' && c.selfEffect);
    },
    rolls: 0, applied: 0, maxMult: 1,
    // 段数の組は件数だけ数える（判定は数十万件になるので配列で持たない）
    legacyHist: new Map(), v2Hist: new Map(),
    roll(legacy, v2, applied, mult) {
      this.rolls += 1;
      if (applied) { this.applied += 1; this.maxMult = Math.max(this.maxMult, mult); }
      this.legacyHist.set(legacy, (this.legacyHist.get(legacy) || 0) + 1);
      this.v2Hist.set(v2, (this.v2Hist.get(v2) || 0) + 1);
    },
    reset() { this.rolls = 0; this.applied = 0; this.maxMult = 1; }
  };
  seededMath.MULT_AB = cfg;

  const outer = { console: { log() {}, warn() {}, error() {} }, Math: seededMath, Date, JSON,
    require: name => (name === 'fs' ? fsProxy : require(name)), process };
  vm.createContext(outer);
  vm.runInContext(SIM_HEAD, outer, { filename: `tools/sim.js(戦略定義のみ/${mode.id})` });
  return {
    id: mode.id, label: mode.label, cfg,
    strategies: vm.runInContext('strategies', outer),
    runOnce: vm.runInContext('runOnce', outer),
    Game: vm.runInContext('Game', outer),
    KPI: vm.runInContext('KPI', outer),
    store: vm.runInContext('store', outer),
    seed: v => { seedState = v >>> 0 || 1; }
  };
}

const MODES = [
  { id: 'PROD',   label: 'production（差し替えなし）', patch: false, useV2: false, threshold: 3 },
  { id: 'V1',     label: 'V1 現行（raw chainDepth・>=3）', patch: true, useV2: false, threshold: 3 },
  { id: 'V2same', label: `V2same（v2Depth・閾値と表は現行のまま >=3）`, patch: true, useV2: true, threshold: 3 },
  { id: 'V2low',  label: `V2low（v2Depth・閾値を下げる >=${V2_LOW_THRESHOLD}）`, patch: true, useV2: true, threshold: V2_LOW_THRESHOLD }
];
const envs = new Map(MODES.map(m => [m.id, makeEnv(m)]));

// ── 1ラン。未完（deploy falsy で record が無い）は呼び手が補充する ──
function runOne(env, strategy, runSeed, stats) {
  env.seed(runSeed);
  for (const k of Object.keys(env.store)) delete env.store[k];
  env.KPI.reset();
  env.cfg.reset();
  const before = { rolls: env.cfg.rolls };
  const record = env.runOnce(strategy, stats);
  if (!record || record.maxChain === undefined) return { unfinished: true };
  return {
    cleared: !!record.cleared,
    battlesWon: record.battlesWon || 0,
    conquest: record.conquest || 0,
    maxChain: record.maxChain || 0,
    rolls: env.cfg.rolls, applied: env.cfg.applied, maxMult: env.cfg.maxMult,
    // 「その戦略でどこまで行って、どこで負けたか」
    lossStage: record.cleared ? null : (record.conquest || 0)
  };
}

// ラン開始時の入力（seed から決まるもの）が全モードで同じことを確かめる指紋。
// 倍率が違えば戦闘の途中から必ず食い違うので、比べてよいのは**戦闘前の入力だけ**。
function inputFingerprint(env, runSeed) {
  env.seed(runSeed);
  for (const k of Object.keys(env.store)) delete env.store[k];
  env.KPI.reset();
  env.Game.newRun();
  const st = env.Game.state;
  return JSON.stringify({
    demonKingId: st.demonKingId, gold: st.gold, food: st.food, hiresLeft: st.hiresLeft,
    applicants: (st.applicants || []).map(m => [m.tplId, m.name, m.hp, m.atk, m.def, m.spd, m.salary,
      (m.traits || []).join('|')])
  });
}

let halted = null;

// ── 集計 ──────────────────────────────────────────────
const pct = (n, d) => (d ? n / d * 100 : 0);
const f1 = v => Number(v).toFixed(1);
const f2 = v => Number(v).toFixed(2);
const mean = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0) / Math.max(1, rows.length);
const summaryOf = rows => {
  const rolls = rows.reduce((t, r) => t + r.rolls, 0);
  const applied = rows.reduce((t, r) => t + r.applied, 0);
  const lost = rows.filter(r => !r.cleared);
  return {
    runs: rows.length,
    clearRate: pct(rows.filter(r => r.cleared).length, rows.length),
    battlesWon: mean(rows, 'battlesWon'),
    conquest: mean(rows, 'conquest'),
    lossConquest: lost.length ? lost.reduce((t, r) => t + r.lossStage, 0) / lost.length : 0,
    appliedRate: pct(applied, rolls),
    rolls, applied,
    maxMult: Math.max(1, ...rows.map(r => r.maxMult)),
    meanMaxMult: mean(rows, 'maxMult'),
    maxChain: mean(rows, 'maxChain')
  };
};

const strategies = envs.get('PROD').strategies;
if (strategies.length !== 15) throw new Error(`戦略が15本でない（${strategies.length}本）`);

console.log(`■ CHAIN倍率をV2基準へ切り替えた場合の勝率影響（全${strategies.length}戦略 × ${N}ラン／seed基 ${SEED_BASE}）`);
console.log('  ゲーム本体（src/）は未変更。battle.js の写しで「倍率が読む段数」だけを差し替えている。');
console.log('  記録・ハプニング発火条件・演出閾値は全モードで production と同一（chainDepth は raw のまま）。\n');
for (const m of MODES) console.log(`    ${m.id.padEnd(7)} ${m.label}`);
console.log('');

// ── ① 差し替えの透明性: V1モードが production と一致するか ──
// ここが崩れていたら、以後の差はすべて「差し替えの副作用」かもしれない。
{
  const prod = envs.get('PROD'), v1 = envs.get('V1');
  let checked = 0, mismatch = 0;
  strategies.forEach((strategy, si) => {
    const statsA = { syn:{}, payroll:{}, unpaid:0, battles:0, lossStage:{}, retries:0, rerolls:0,
      events:0, incidents:0, foodShortages:0, maxArmy:0, paidHires:0, paidHireGold:0, seizes:0 };
    const statsB = { ...statsA, syn:{}, payroll:{}, lossStage:{} };
    for (let i = 0; i < TRANSPARENCY_RUNS; i++) {
      const s = SEED_BASE + si * 1000003 + i * 7919;
      const a = runOne(prod, strategy, s, statsA);
      const b = runOne(v1, strategy, s, statsB);
      checked += 1;
      const key = r => JSON.stringify([r.unfinished || false, r.cleared, r.battlesWon, r.conquest, r.maxChain]);
      if (key(a) !== key(b)) { mismatch += 1; if (mismatch <= 3) console.error(`    ✗ ${strategy.name} seed ${s}\n      prod ${key(a)}\n      V1   ${key(b)}`); }
    }
  });
  console.log(`■ 差し替えの透明性（production と V1モードの一致・${checked}ラン）`);
  if (mismatch) {
    console.error(`  ✗ ${mismatch}件が不一致。差し替えが V1 の挙動を変えている。集計しない。`);
    process.exit(1);
  }
  console.log('  不一致 0件 → 「v2Depth の並記」と「倍率の読み替え」は V1 の挙動を変えていない\n');
}

// ── ② 本測定 ─────────────────────────────────────────
const RUN_MODES = MODES.filter(m => m.id !== 'PROD');
const rowsByMode = new Map(RUN_MODES.map(m => [m.id, []]));
const unfinishedByMode = new Map(RUN_MODES.map(m => [m.id, []]));
const perStrategy = [];
const legacyHist = new Map(), v2Hist = new Map();
let depthSamples = 0;

strategies.forEach((strategy, si) => {
  // 入力指紋。倍率が違っても、ラン開始時の入力（魔王・初期資源・応募者）は同じはず。
  const prints = RUN_MODES.map(m => inputFingerprint(envs.get(m.id), SEED_BASE + si * 1000003));
  if (new Set(prints).size !== 1) {
    console.error(`\n✗ 測定を停止する: 「${strategy.name}」でモード間のラン開始時の入力が一致しない`);
    RUN_MODES.forEach((m, i) => console.error(`    ${m.id}: ${prints[i].slice(0, 200)}`));
    process.exit(1);
  }

  const entry = { name: strategy.name, byMode: new Map(), unfinished: new Map() };
  for (const m of RUN_MODES) {
    const env = envs.get(m.id);
    const stats = { syn:{}, payroll:{}, unpaid:0, battles:0, lossStage:{}, retries:0, rerolls:0,
      events:0, incidents:0, foodShortages:0, maxArmy:0, paidHires:0, paidHireGold:0, seizes:0 };
    const rows = [];
    let draws = 0, skipped = 0;
    const maxDraws = N * 2;
    // 未完は単純除外しない。追加seedで補充し、件数は別に残す。
    while (rows.length < N && draws < maxDraws) {
      const row = runOne(env, strategy, SEED_BASE + si * 1000003 + draws * 7919, stats);
      draws += 1;
      if (row.unfinished) { skipped += 1; continue; }
      rows.push(row);
    }
    if (rows.length < N) {
      console.error(`\n✗ 測定を停止する: 「${strategy.name}」${m.id} で有効ランが ${rows.length}/${N} しか揃わない`);
      process.exit(1);
    }
    rowsByMode.get(m.id).push(...rows);
    for (let i = 0; i < skipped; i++) unfinishedByMode.get(m.id).push(strategy.name);
    entry.byMode.set(m.id, summaryOf(rows));
    entry.unfinished.set(m.id, skipped);
    if (m.id === 'V1') {
      for (const [k, v] of env.cfg.legacyHist) legacyHist.set(k, (legacyHist.get(k) || 0) + v);
      for (const [k, v] of env.cfg.v2Hist) v2Hist.set(k, (v2Hist.get(k) || 0) + v);
      depthSamples += [...env.cfg.legacyHist.values()].reduce((a, b) => a + b, 0);
    }
    env.cfg.legacyHist.clear(); env.cfg.v2Hist.clear();
  }
  perStrategy.push(entry);

  const base = entry.byMode.get('V1');
  console.log(`■ ${strategy.name}（各モード 有効${N}ラン${
    [...entry.unfinished.entries()].filter(([, v]) => v).map(([k, v]) => ` / ${k} 未完${v}件を補充`).join('') }）`);
  for (const m of RUN_MODES) {
    const s = entry.byMode.get(m.id);
    const d = m.id === 'V1' ? '' : `　（クリア率 ${s.clearRate - base.clearRate >= 0 ? '+' : ''}${
      f1(s.clearRate - base.clearRate)}pt）`;
    console.log(`  ${m.id.padEnd(7)} クリア ${f1(s.clearRate)}%  平均勝利 ${f2(s.battlesWon)}戦`
      + `  敗北時の攻略 ${f2(s.lossConquest)}  倍率適用 ${f1(s.appliedRate)}%`
      + `  到達最大倍率 ${f2(s.maxMult)}（平均 ${f2(s.meanMaxMult)}）${d}`);
  }
  console.log('');
});

// ── ③ 全体 ───────────────────────────────────────────
console.log('═══ 全体（15戦略 × ' + N + 'ラン ＝ 各モード 有効 ' + rowsByMode.get('V1').length + 'ラン） ═══\n');
const overall = new Map(RUN_MODES.map(m => [m.id, summaryOf(rowsByMode.get(m.id))]));
const base = overall.get('V1');
console.log('| モード | クリア率 | 平均勝利 | 敗北時の攻略 | 倍率適用率 | 到達最大倍率 | 平均最大倍率 |');
console.log('|---|---|---|---|---|---|---|');
for (const m of RUN_MODES) {
  const s = overall.get(m.id);
  console.log(`| ${m.id} | ${f1(s.clearRate)}%${m.id === 'V1' ? '' : `（${
    s.clearRate - base.clearRate >= 0 ? '+' : ''}${f1(s.clearRate - base.clearRate)}pt）`}`
    + ` | ${f2(s.battlesWon)}戦 | ${f2(s.lossConquest)} | ${f1(s.appliedRate)}%`
    + ` | ×${f2(s.maxMult)} | ×${f2(s.meanMaxMult)} |`);
}
const un = RUN_MODES.map(m => `${m.id} ${unfinishedByMode.get(m.id).length}件`).join(' / ');
console.log(`\n■ 未完ラン（単純除外せず追加seedで補充した件数）: ${un}`);
for (const m of RUN_MODES) {
  const list = unfinishedByMode.get(m.id);
  if (!list.length) continue;
  const by = new Map();
  for (const name of list) by.set(name, (by.get(name) || 0) + 1);
  console.log(`    ${m.id}: ` + [...by.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
}

// ── ④ 倍率が適用される段数の分布（V1の走行から） ─────────
// 「V1と近い発生頻度になる閾値」を選ぶための材料。V1の走行で観測した
// (raw, v2) の組から、閾値ごとの適用率を出す。
console.log(`\n■ 倍率が適用される頻度（V1モードの味方ダメージ判定 ${depthSamples} 件から）`);
const atLeast = (hist, t) => [...hist.entries()].reduce((n, [d, c]) => n + (d >= t ? c : 0), 0);
const rateLegacy = t => pct(atLeast(legacyHist, t), depthSamples);
const rateV2 = t => pct(atLeast(v2Hist, t), depthSamples);
console.log(`  現行 raw >=3 … ${f1(rateLegacy(3))}%`);
for (const t of [1, 2, 3, 4]) {
  console.log(`  V2 >=${t} … ${f1(rateV2(t))}%${t === 3 ? '（V2same）' : ''}${
    t === V2_LOW_THRESHOLD ? '（V2low）' : ''}`);
}

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({
    seedBase: SEED_BASE, runsPerStrategy: N, v2LowThreshold: V2_LOW_THRESHOLD,
    overall: Object.fromEntries([...overall.entries()]),
    unfinished: Object.fromEntries(RUN_MODES.map(m => [m.id, unfinishedByMode.get(m.id)])),
    byStrategy: perStrategy.map(e => ({ name: e.name,
      byMode: Object.fromEntries([...e.byMode.entries()]),
      unfinished: Object.fromEntries([...e.unfinished.entries()]) })),
    appliedRates: {
      samples: depthSamples,
      legacy: Object.fromEntries([2, 3, 4, 5].map(t => [t, rateLegacy(t)])),
      v2: Object.fromEntries([1, 2, 3, 4, 5].map(t => [t, rateV2(t)])),
      legacyHist: Object.fromEntries(legacyHist), v2Hist: Object.fromEntries(v2Hist)
    }
  }, null, 2));
  console.log(`\n測定結果を書き出した: ${jsonOut}`);
}
console.log(`\n注: ゲーム本体は未変更。Chain.RECORDED_VERSION も倍率も切り替えていない（判断材料の提出まで）。`);
