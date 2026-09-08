// CHAIN V2 ハプニング条件 A/B 測定
// production（V2倍率・rawハプニング条件）と 比較案（V2倍率・V2ハプニング条件）を全15戦略で比較する。
//
// 使い方:
//   node tools/chain-happening-ab.js 200 --json out.json
//   CHAIN_SEED_BASE=2000 node tools/chain-happening-ab.js 200
//   CHAIN_SEED_BASE=3000 node tools/chain-happening-ab.js 200
//
// 規律:
//   ・src/ は一切変更しない
//   ・sim.js の戦略定義と母数保証を再利用し、複製しない
//   ・productionの透明性assert（パッチなし本番との完全一致）を保証
//   ・未完ランは追加seedで補充し、有効母数200を保証する
//
const fs = require('fs'), vm = require('vm');

const args = process.argv.slice(2);
const N = Number(args[0] && !args[0].startsWith('--') ? args[0] : 200);
const SEED_BASE = Number(process.env.CHAIN_SEED_BASE || 1000);
const jsonOut = (() => { const at = args.indexOf('--json'); return at >= 0 ? args[at + 1] : null; })();
const TRANSPARENCY_RUNS = Number(process.env.HAPPENING_AB_TRANSPARENCY || 30);

// ── 分類とハプニング定義は本体をそのまま使う ────────────────
const chainCtx = { module: { exports: {} }, console };
vm.createContext(chainCtx);
vm.runInContext(fs.readFileSync(__dirname + '/../src/data/battle_happenings.js', 'utf8'), chainCtx);
vm.runInContext(fs.readFileSync(__dirname + '/../src/core/chain.js', 'utf8'), chainCtx, { filename: 'src/core/chain.js' });
const Chain = chainCtx.module.exports.Chain;
const BATTLE_HAPPENINGS = vm.runInContext('BATTLE_HAPPENINGS', chainCtx);

// ── battle.js の写しにハプニング条件の計測・切替フックを差し込む ────
function patchBattle(src) {
  src = src.replace(/\r\n/g, '\n');
  const swap = (from, to) => {
    if (!src.includes(from)) {
      throw new Error('chain-happening-ab: battle.js の差し替え箇所が見つからない:\n' + from.slice(0, 100)
        + '\n  → battle.js が変わったらここを直すこと。写しを作って回避しないこと');
    }
    src = src.replace(from, to);
  };

  // 1. tryIncident 内で実発火を計測
  swap(
`        emitCausal("incident", {
          id: happening.id, name: happening.name, unitId: unit.id,
          targetId: target && target.id, emphasis: 3,
          text: happening.text(unit, target), cls: "incident"
        }, actionOpts.parentEvent || null);`,
`        if (typeof Math.HAPPENING_AB !== "undefined" && Math.HAPPENING_AB.recordTrigger) {
          Math.HAPPENING_AB.recordTrigger(happening.id);
        }
        emitCausal("incident", {
          id: happening.id, name: happening.name, unitId: unit.id,
          targetId: target && target.id, emphasis: 3,
          text: happening.text(unit, target), cls: "incident"
        }, actionOpts.parentEvent || null);`
  );

  // 2. act 内の unit.chainDepth 代入箇所で判定機会の計測と V2段数切替
  swap(
`      unit.chainDepth = actionOpts.parentEvent ? (actionOpts.parentEvent.chainDepth || 1) + 1 : 1;
      if (tryIncident(unit, allies, actionOpts)) return;`,
`      const rawDepth = actionOpts.parentEvent ? (actionOpts.parentEvent.chainDepth || 1) + 1 : 1;
      const v2Depth = actionOpts.parentEvent ? (actionOpts.parentEvent.v2Depth ?? 1) + 1 : 1;
      if (typeof Math.HAPPENING_AB !== "undefined" && Math.HAPPENING_AB.recordOpportunity) {
        Math.HAPPENING_AB.recordOpportunity(unit, allies, actionOpts, rawDepth, v2Depth);
      }
      unit.chainDepth = (typeof Math.HAPPENING_AB !== "undefined" && Math.HAPPENING_AB.useV2Gate) ? v2Depth : rawDepth;
      if (tryIncident(unit, allies, actionOpts)) return;`
  );

  return src;
}

// ── 1モードぶんの実行環境。sim.js の戦略定義と runOnce をそのまま使う ──
const SIM_SRC = fs.readFileSync(__dirname + '/sim.js', 'utf8');
const CUT = 'const N = Number(process.argv[2] || 400);';
if (!SIM_SRC.includes(CUT)) throw new Error('chain-happening-ab: tools/sim.js の切り出し位置が見つからない');
const SIM_HEAD = SIM_SRC.slice(0, SIM_SRC.indexOf(CUT));

function makeEnv(mode) {
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
  const seededMath = Object.create(Math);
  seededMath.random = () => {
    seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
    return seedState / 0x7fffffff;
  };

  const cfg = {
    useV2Gate: !!mode.useV2Gate,
    // ハプニングごとの集計
    opportunities: new Map(), // happeningId -> count
    rawMet: new Map(),        // happeningId -> count
    v2Met: new Map(),         // happeningId -> count
    flipped: new Map(),       // happeningId -> count
    triggered: new Map(),     // happeningId -> count
    battles: 0,
    reset() {
      this.opportunities.clear();
      this.rawMet.clear();
      this.v2Met.clear();
      this.flipped.clear();
      this.triggered.clear();
      this.battles = 0;
    },
    recordOpportunity(unit, allies, actionOpts, rawDepth, v2Depth) {
      if (unit.side !== 'player' || unit.flags.incidentUsed) return;
      const happenings = BATTLE_HAPPENINGS || [];
      const originalDepth = unit.chainDepth;
      for (const h of happenings) {
        if (actionOpts.isExtra && !h.duringChain) continue;
        const id = h.id;
        this.opportunities.set(id, (this.opportunities.get(id) || 0) + 1);

        unit.chainDepth = rawDepth;
        const rawCheck = !!h.check(unit);

        unit.chainDepth = v2Depth;
        const v2Check = !!h.check(unit);

        if (rawCheck) this.rawMet.set(id, (this.rawMet.get(id) || 0) + 1);
        if (v2Check) this.v2Met.set(id, (this.v2Met.get(id) || 0) + 1);
        if (rawCheck !== v2Check) {
          this.flipped.set(id, (this.flipped.get(id) || 0) + 1);
        }
      }
      unit.chainDepth = originalDepth;
    },
    recordTrigger(happeningId) {
      this.triggered.set(happeningId, (this.triggered.get(happeningId) || 0) + 1);
    }
  };
  seededMath.HAPPENING_AB = cfg;

  const outer = {
    console: { log() {}, warn() {}, error() {} },
    Math: seededMath, Date, JSON,
    require: name => (name === 'fs' ? fsProxy : require(name)),
    process
  };
  vm.createContext(outer);
  vm.runInContext(SIM_HEAD, outer, { filename: `tools/sim.js(戦略定義のみ/${mode.id})` });

  return {
    id: mode.id, label: mode.label, cfg,
    strategies: vm.runInContext('strategies', outer),
    runOnce: vm.runInContext('runOnce', outer),
    Game: vm.runInContext('Game', outer),
    KPI: vm.runInContext('KPI', outer),
    store: vm.runInContext('store', outer),
    BATTLE_HAPPENINGS,
    seed: v => { seedState = v >>> 0 || 1; }
  };
}

const MODES = [
  { id: 'PROD_VERIFY', label: 'production（パッチなし素の本番・透明性検査用）', patch: false, useV2Gate: false },
  { id: 'PROD',        label: 'production（V2倍率・rawハプニング条件）',          patch: true,  useV2Gate: false },
  { id: 'V2GATE',      label: '比較案（V2倍率・V2ハプニング条件）',              patch: true,  useV2Gate: true }
];

const envs = new Map(MODES.map(m => [m.id, makeEnv(m)]));

// ── 1ランの実行 ─────────────────────────────────────────
function runOne(env, strategy, runSeed, stats) {
  env.seed(runSeed);
  for (const k of Object.keys(env.store)) delete env.store[k];
  env.KPI.reset();
  const record = env.runOnce(strategy, stats);
  if (!record || record.maxChain === undefined) return { unfinished: true };
  return {
    cleared: !!record.cleared,
    battlesWon: record.battlesWon || 0,
    conquest: record.conquest || 0,
    maxChain: record.maxChain || 0,
    lossStage: record.cleared ? null : (record.conquest || 0)
  };
}

// ラン開始時の入力指紋
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

// ── 集計ヘルパー ────────────────────────────────────────
const pct = (n, d) => (d ? n / d * 100 : 0);
const f1 = v => Number(v).toFixed(1);
const f2 = v => Number(v).toFixed(2);
const mean = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0) / Math.max(1, rows.length);

const summaryOf = rows => {
  const lost = rows.filter(r => !r.cleared);
  return {
    runs: rows.length,
    clearRate: pct(rows.filter(r => r.cleared).length, rows.length),
    battlesWon: mean(rows, 'battlesWon'),
    conquest: mean(rows, 'conquest'),
    lossConquest: lost.length ? lost.reduce((t, r) => t + r.lossStage, 0) / lost.length : 0,
    maxChain: mean(rows, 'maxChain')
  };
};

const strategies = envs.get('PROD').strategies;
if (strategies.length !== 15) throw new Error(`戦略が15本でない（${strategies.length}本）`);

console.log(`■ CHAIN V2 ハプニング条件 A/B 測定（全${strategies.length}戦略 × ${N}ラン／seed基 ${SEED_BASE}）`);
console.log('  production（V2倍率・rawハプニング条件） vs 比較案（V2倍率・V2ハプニング条件）');
console.log('  raw chainDepth、記録、倍率表、演出閾値、乱数は不変。\n');
for (const m of MODES) console.log(`    ${m.id.padEnd(12)} ${m.label}`);
console.log('');

// ── ① 差し替えの透明性検査（PROD_VERIFY vs PROD） ────────────
{
  const verifyEnv = envs.get('PROD_VERIFY');
  const prodEnv = envs.get('PROD');
  let checked = 0, mismatch = 0;
  strategies.forEach((strategy, si) => {
    const statsA = { syn:{}, payroll:{}, unpaid:0, battles:0, lossStage:{}, retries:0, rerolls:0,
      events:0, incidents:0, foodShortages:0, maxArmy:0, paidHires:0, paidHireGold:0, seizes:0 };
    const statsB = { ...statsA, syn:{}, payroll:{}, lossStage:{} };
    for (let i = 0; i < TRANSPARENCY_RUNS; i++) {
      const s = SEED_BASE + si * 1000003 + i * 7919;
      const a = runOne(verifyEnv, strategy, s, statsA);
      const b = runOne(prodEnv, strategy, s, statsB);
      checked += 1;
      const key = r => JSON.stringify([r.unfinished || false, r.cleared, r.battlesWon, r.conquest, r.maxChain]);
      if (key(a) !== key(b)) {
        mismatch += 1;
        if (mismatch <= 3) {
          console.error(`    ✗ ${strategy.name} seed ${s}\n      PROD_VERIFY ${key(a)}\n      PROD        ${key(b)}`);
        }
      }
    }
  });
  console.log(`■ 差し替えの透明性（PROD_VERIFY と PROD の一致・${checked}ラン）`);
  if (mismatch) {
    console.error(`  ✗ ${mismatch}件が不一致。計測パッチが本番挙動を変更してしまっている。集計を中止。`);
    process.exit(1);
  }
  console.log('  不一致 0件 → 計測フックは本番の進行・乱数を一切乱していない\n');
}

// ── ② 本測定 ─────────────────────────────────────────
const RUN_MODES = [MODES.find(m => m.id === 'PROD'), MODES.find(m => m.id === 'V2GATE')];
const rowsByMode = new Map(RUN_MODES.map(m => [m.id, []]));
const unfinishedByMode = new Map(RUN_MODES.map(m => [m.id, []]));
const happeningStatsByMode = new Map(RUN_MODES.map(m => [m.id, {
  opportunities: new Map(),
  rawMet: new Map(),
  v2Met: new Map(),
  flipped: new Map(),
  triggered: new Map(),
  perStrategy: new Map() // stratName -> { opportunities, rawMet, v2Met, flipped, triggered }
}]));

const perStrategyRunStats = [];

strategies.forEach((strategy, si) => {
  // 入力指紋 assert
  const prints = RUN_MODES.map(m => inputFingerprint(envs.get(m.id), SEED_BASE + si * 1000003));
  if (new Set(prints).size !== 1) {
    console.error(`\n✗ 測定を停止する: 「${strategy.name}」でモード間のラン開始時の入力が一致しない`);
    RUN_MODES.forEach((m, i) => console.error(`    ${m.id}: ${prints[i].slice(0, 200)}`));
    process.exit(1);
  }

  const stratEntry = { name: strategy.name, byMode: new Map(), unfinished: new Map() };

  for (const m of RUN_MODES) {
    const env = envs.get(m.id);
    const modeStats = happeningStatsByMode.get(m.id);
    const stratHapStats = {
      opportunities: new Map(), rawMet: new Map(), v2Met: new Map(), flipped: new Map(), triggered: new Map()
    };
    modeStats.perStrategy.set(strategy.name, stratHapStats);

    const stats = { syn:{}, payroll:{}, unpaid:0, battles:0, lossStage:{}, retries:0, rerolls:0,
      events:0, incidents:0, foodShortages:0, maxArmy:0, paidHires:0, paidHireGold:0, seizes:0 };
    const rows = [];
    let draws = 0, skipped = 0;
    const maxDraws = N * 2;

    env.cfg.reset();

    while (rows.length < N && draws < maxDraws) {
      const s = SEED_BASE + si * 1000003 + draws * 7919;
      const row = runOne(env, strategy, s, stats);
      draws += 1;
      if (row.unfinished) {
        skipped += 1;
        continue;
      }
      rows.push(row);
    }

    if (rows.length < N) {
      console.error(`\n✗ 測定を停止する: 「${strategy.name}」${m.id} で有効ランが ${rows.length}/${N} しか揃わない`);
      process.exit(1);
    }

    rowsByMode.get(m.id).push(...rows);
    for (let i = 0; i < skipped; i++) unfinishedByMode.get(m.id).push(strategy.name);
    stratEntry.byMode.set(m.id, summaryOf(rows));
    stratEntry.unfinished.set(m.id, skipped);

    // ハプニング統計を累積
    for (const [id, count] of env.cfg.opportunities) {
      modeStats.opportunities.set(id, (modeStats.opportunities.get(id) || 0) + count);
      stratHapStats.opportunities.set(id, count);
    }
    for (const [id, count] of env.cfg.rawMet) {
      modeStats.rawMet.set(id, (modeStats.rawMet.get(id) || 0) + count);
      stratHapStats.rawMet.set(id, count);
    }
    for (const [id, count] of env.cfg.v2Met) {
      modeStats.v2Met.set(id, (modeStats.v2Met.get(id) || 0) + count);
      stratHapStats.v2Met.set(id, count);
    }
    for (const [id, count] of env.cfg.flipped) {
      modeStats.flipped.set(id, (modeStats.flipped.get(id) || 0) + count);
      stratHapStats.flipped.set(id, count);
    }
    for (const [id, count] of env.cfg.triggered) {
      modeStats.triggered.set(id, (modeStats.triggered.get(id) || 0) + count);
      stratHapStats.triggered.set(id, count);
    }
  }

  perStrategyRunStats.push(stratEntry);
});

// ── ③ 出力と集計結果 ────────────────────────────────────
console.log(`■ 1. 全体ラン結果（有効${N * strategies.length}ラン / 15戦略×各${N}ラン）\n`);
console.log('  ' + ['モード', 'クリア率', '平均勝利', '敗北時攻略', '最大CHAIN'].map((c, i) => c.padEnd(i === 0 ? 32 : 12)).join(''));
for (const m of RUN_MODES) {
  const sum = summaryOf(rowsByMode.get(m.id));
  console.log('  ' + [m.label, `${f1(sum.clearRate)}%`, `${f2(sum.battlesWon)}戦`, f2(sum.lossConquest), f2(sum.maxChain)]
    .map((c, i) => String(c).padEnd(i === 0 ? 32 : 12)).join(''));
}

const prodSum = summaryOf(rowsByMode.get('PROD'));
const v2Sum = summaryOf(rowsByMode.get('V2GATE'));
const clearDiff = v2Sum.clearRate - prodSum.clearRate;
const wonDiff = v2Sum.battlesWon - prodSum.battlesWon;
const lossDiff = v2Sum.lossConquest - prodSum.lossConquest;

console.log(`\n  差分（V2GATE − PROD）: クリア率 ${clearDiff >= 0 ? '+' : ''}${f2(clearDiff)}pt, 平均勝利 ${wonDiff >= 0 ? '+' : ''}${f2(wonDiff)}戦, 敗北時攻略 ${lossDiff >= 0 ? '+' : ''}${f2(lossDiff)}`);

// 未完ラン報告
console.log('\n■ 2. 未完ラン報告（補充により有効母数200を保証済み）\n');
for (const m of RUN_MODES) {
  const unfs = unfinishedByMode.get(m.id);
  const byStrat = {};
  for (const s of unfs) byStrat[s] = (byStrat[s] || 0) + 1;
  const detail = Object.entries(byStrat).map(([k, v]) => `${k}:${v}`).join(', ') || 'なし';
  console.log(`  ${m.id}: 合計 ${unfs.length}件 (${detail})`);
}

// ハプニング別集計
console.log(`\n■ 3. ハプニング種類別集計（全${N * strategies.length}ラン合計）\n`);
const happenings = envs.get('PROD').BATTLE_HAPPENINGS || [];

console.log('  ' + ['ハプニングID', '名前', '判定機会', 'raw成立', 'V2成立', '真偽変化', '実発火(PROD→V2)', '発火率(PROD→V2)'].map((c, i) => {
  if (i === 0) return c.padEnd(20);
  if (i === 1) return c.padEnd(16);
  if (i === 6) return c.padEnd(18);
  if (i === 7) return c.padEnd(18);
  return c.padEnd(10);
}).join(''));

const hapResults = [];

for (const h of happenings) {
  const pStats = happeningStatsByMode.get('PROD');
  const vStats = happeningStatsByMode.get('V2GATE');

  const opp = pStats.opportunities.get(h.id) || 0;
  const rawM = pStats.rawMet.get(h.id) || 0;
  const v2M = pStats.v2Met.get(h.id) || 0;
  const flp = pStats.flipped.get(h.id) || 0;
  const pTrig = pStats.triggered.get(h.id) || 0;
  const vTrig = vStats.triggered.get(h.id) || 0;

  const pRate = pct(pTrig, opp);
  const vRate = pct(vTrig, opp);

  const entry = {
    id: h.id, name: h.name, opportunities: opp,
    rawMet: rawM, v2Met: v2M, flipped: flp,
    prodTriggered: pTrig, v2Triggered: vTrig,
    prodRate: pRate, v2Rate: vRate
  };
  hapResults.push(entry);

  console.log('  ' + [
    h.id.padEnd(20),
    h.name.padEnd(16),
    String(opp).padStart(8) + '  ',
    String(rawM).padStart(8) + '  ',
    String(v2M).padStart(8) + '  ',
    String(flp).padStart(8) + '  ',
    `${pTrig} → ${vTrig}`.padStart(16) + '  ',
    `${f2(pRate)}% → ${f2(vRate)}%`.padStart(16)
  ].join(''));
}

// 戦略別ラン結果
console.log('\n■ 4. 戦略別ラン結果（クリア率 / 平均勝利 / 敗北地点）\n');
console.log('  ' + ['戦略名', 'PROD クリア率', 'V2GATE クリア率', '差分', 'PROD 勝利', 'V2GATE 勝利', 'PROD 敗北地点', 'V2GATE 敗北地点'].map((c, i) => {
  if (i === 0) return c.padEnd(18);
  return c.padEnd(14);
}).join(''));

for (const s of perStrategyRunStats) {
  const p = s.byMode.get('PROD');
  const v = s.byMode.get('V2GATE');
  const dClr = v.clearRate - p.clearRate;
  console.log('  ' + [
    s.name.padEnd(18),
    `${f1(p.clearRate)}%`.padStart(10) + '    ',
    `${f1(v.clearRate)}%`.padStart(10) + '    ',
    `${dClr >= 0 ? '+' : ''}${f1(dClr)}pt`.padStart(8) + '      ',
    `${f2(p.battlesWon)}戦`.padStart(8) + '      ',
    `${f2(v.battlesWon)}戦`.padStart(8) + '      ',
    f2(p.lossConquest).padStart(8) + '      ',
    f2(v.lossConquest).padStart(8)
  ].join(''));
}

// 連鎖ハプニング（chain_receipt, chain_stagefright）の戦略別内訳
console.log('\n■ 5. 連鎖ハプニングの戦略別内訳（真偽変化と実発火）\n');
const chainHapIds = ['chain_receipt', 'chain_stagefright'];
for (const hid of chainHapIds) {
  const hname = happenings.find(h => h.id === hid)?.name || hid;
  console.log(`  ▼ 【${hname}】(${hid})`);
  console.log('    ' + ['戦略名', '判定機会', 'raw成立', 'V2成立', '真偽変化', '実発火 PROD→V2'].map((c, i) => {
    if (i === 0) return c.padEnd(18);
    return c.padEnd(12);
  }).join(''));

  for (const s of perStrategyRunStats) {
    const pHap = happeningStatsByMode.get('PROD').perStrategy.get(s.name);
    const vHap = happeningStatsByMode.get('V2GATE').perStrategy.get(s.name);
    const opp = pHap.opportunities.get(hid) || 0;
    const rawM = pHap.rawMet.get(hid) || 0;
    const v2M = pHap.v2Met.get(hid) || 0;
    const flp = pHap.flipped.get(hid) || 0;
    const pTrig = pHap.triggered.get(hid) || 0;
    const vTrig = vHap.triggered.get(hid) || 0;

    if (opp > 0 || rawM > 0 || v2M > 0 || pTrig > 0 || vTrig > 0) {
      console.log('    ' + [
        s.name.padEnd(18),
        String(opp).padStart(8) + '    ',
        String(rawM).padStart(8) + '    ',
        String(v2M).padStart(8) + '    ',
        String(flp).padStart(8) + '    ',
        `${pTrig} → ${vTrig}`.padStart(10)
      ].join(''));
    }
  }
  console.log('');
}

// JSON出力
if (jsonOut) {
  const reportObj = {
    seedBase: SEED_BASE,
    runsPerStrategy: N,
    overall: {
      PROD: prodSum,
      V2GATE: v2Sum,
      diff: { clearRate: clearDiff, battlesWon: wonDiff, lossConquest: lossDiff }
    },
    unfinished: {
      PROD: unfinishedByMode.get('PROD'),
      V2GATE: unfinishedByMode.get('V2GATE')
    },
    happenings: hapResults,
    strategies: perStrategyRunStats.map(s => ({
      name: s.name,
      PROD: s.byMode.get('PROD'),
      V2GATE: s.byMode.get('V2GATE'),
      unfinished: { PROD: s.unfinished.get('PROD'), V2GATE: s.unfinished.get('V2GATE') },
      happeningDetail: happenings.map(h => {
        const pHap = happeningStatsByMode.get('PROD').perStrategy.get(s.name);
        const vHap = happeningStatsByMode.get('V2GATE').perStrategy.get(s.name);
        return {
          id: h.id,
          opportunities: pHap.opportunities.get(h.id) || 0,
          rawMet: pHap.rawMet.get(h.id) || 0,
          v2Met: pHap.v2Met.get(h.id) || 0,
          flipped: pHap.flipped.get(h.id) || 0,
          prodTriggered: pHap.triggered.get(h.id) || 0,
          v2Triggered: vHap.triggered.get(h.id) || 0
        };
      })
    }))
  };
  fs.writeFileSync(jsonOut, JSON.stringify(reportObj, null, 2));
  console.log(`JSON結果を書き出しました: ${jsonOut}`);
}
