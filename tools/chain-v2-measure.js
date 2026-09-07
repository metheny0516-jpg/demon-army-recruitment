// CHAIN V2切替前の測定。全15戦略×N ラン（既定200）。
//
//   node tools/chain-v2-measure.js            … 200ラン
//   node tools/chain-v2-measure.js 50         … 短縮
//   CHAIN_SEED_BASE=2000 node tools/chain-v2-measure.js
//   node tools/chain-v2-measure.js 200 --json out.json
//
// ── 測定の作り（ここが結論の信頼性そのもの） ──────────────
// **ゲームは1回しか走らせない。** 1つの戦闘結果から V1 と V2 の両方を算出する。
// V1用とV2用に別々にゲームを回して比べると、乱数と分岐が食い違って
// 「定義の差」なのか「別のランを見ているだけ」なのか区別できなくなる。
//
//   V1 … タイムラインの raw `chainDepth` の最大値（＝ Battle.summarizeChains の maxChain）
//   V2 … 同じタイムラインを Chain.summarize() で読み直した `maxDepth`
//
// 戦闘計算・倍率・ハプニング条件・演出閾値・UI・raw因果グラフには一切触れない。
// `Chain.RECORDED_VERSION` も 2 へ切り替えない。読み直しているだけである。
//
// 一致確認（1件でも崩れたら測定を停止する）:
//   ・V1の再計算値と `chainSummary.maxChain` が一致すること
//   ・`Chain.summarize()` がタイムラインを書き換えないこと
//   ・raw の `parentEventId / chainId / chainDepth` が読み直しの前後で同一であること
//
// 戦略定義とランの回し方は tools/sim.js のものを**そのまま**使う。
// 写しを持つと「sim.js とは別のゲームを測っている」ことになるため、
// sim.js の出力部分だけを切り落として同じ関数を読み込む。
const fs = require('fs'), vm = require('vm');

const N = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 200);
const SEED_BASE = Number(process.env.CHAIN_SEED_BASE || 1000);
const jsonOut = (() => { const at = process.argv.indexOf('--json'); return at >= 0 ? process.argv[at + 1] : null; })();

// ── seed付き乱数。ホストの Math.random は一切使わない ─────
let seedState = 1;
const seed = value => { seedState = value >>> 0 || 1; };
const seededMath = Object.create(Math);
seededMath.random = () => {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
};

// ── sim.js の「戦略定義とランの回し方」だけを読み込む ─────
const SIM_SRC = fs.readFileSync(__dirname + '/sim.js', 'utf8');
const CUT = 'const N = Number(process.argv[2] || 400);';
if (!SIM_SRC.includes(CUT)) {
  throw new Error('chain-v2-measure: tools/sim.js の切り出し位置が見つからない。'
    + '\n  sim.js が変わったら、この目印（' + CUT + '）を直すこと。'
    + '\n  写しを作って回避しないこと（sim.js と違うゲームを測ることになる）');
}
const outer = { console, Math: seededMath, Date, JSON, require, process };
vm.createContext(outer);
vm.runInContext(SIM_SRC.slice(0, SIM_SRC.indexOf(CUT)), outer, { filename: 'tools/sim.js(戦略定義のみ)' });
const strategies = vm.runInContext('strategies', outer);
const runOnce = vm.runInContext('runOnce', outer);
const Game = vm.runInContext('Game', outer);
const KPI = vm.runInContext('KPI', outer);
const inner = vm.runInContext('ctx', outer);          // sim.js がゲームを読み込んだコンテキスト
const Chain = vm.runInContext('Chain', inner);
const Battle = vm.runInContext('Battle', inner);
const store = vm.runInContext('store', outer);

if (strategies.length !== 15) {
  throw new Error(`chain-v2-measure: 戦略が15本でない（${strategies.length}本）。sim.js の変更を確認すること`);
}

// ── 1戦闘ぶんの観測。KPI.battleFinished を包んで結果を受け取る ──
// run.js が maxChain を更新した直後に呼ぶ場所なので、戦闘結果そのものが渡ってくる。
// 包むだけで KPI 本来の処理はそのまま通す（KPIの値も同時に測るため）。
let battleHook = null;
const originalBattleFinished = KPI.battleFinished.bind(KPI);
KPI.battleFinished = result => {
  if (battleHook) battleHook(result);
  return originalBattleFinished(result);
};

const rawSignature = timeline => (timeline || [])
  .filter(e => e.eventId)
  .map(e => `${e.eventId}|${e.parentEventId || ''}|${e.chainId || ''}|${e.chainDepth}`).join(';');

// V1の代表CHAINが「またいだ能力の種類」。KPI が実際に使っている関数をそのまま呼ぶ。
const v1Abilities = (timeline, summary) =>
  KPI.chainAbilities(timeline, summary && summary.deepest);

// V2の代表CHAINが「またいだ能力の種類」。結合済み step の能力名を重複なく並べる。
// 起点の通常攻撃は能力ではないので入らない（V1の abilityKey と同じ扱い）。
const v2Abilities = view => {
  const labels = [], seen = new Set();
  for (const step of (view && view.deepest ? view.deepest.steps : [])) {
    const name = (step.declaredBy && step.declaredBy.abilityName) || step.abilityName;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    labels.push(name);
  }
  return labels;
};

let halted = null;
const samples = [];      // 分類が変わった代表例

function measureRun(strategy, runSeed, stats) {
  seed(runSeed);
  for (const k of Object.keys(store)) delete store[k];   // ラン間の保存状態を持ち越さない
  KPI.reset();

  const run = {
    v1Max: 0, v2Max: 0, battles: 0,
    v1AbilityMax: 0, v2AbilityMax: 0,
    v1Sample: null, v2Sample: null
  };

  battleHook = result => {
    const timeline = result.timeline || [];
    const before = rawSignature(timeline);
    const beforeJson = JSON.stringify(timeline);

    const v1 = timeline.reduce((m, e) => Math.max(m, Number(e.chainDepth) || 0), 0);
    const view = Chain.summarize(timeline);

    // ── 一致確認 ──
    if (JSON.stringify(timeline) !== beforeJson) {
      halted = 'Chain.summarize() がタイムラインを書き換えた';
    } else if (rawSignature(timeline) !== before) {
      halted = 'raw の parentEventId / chainId / chainDepth が読み直しで変わった';
    } else if (v1 !== ((result.chainSummary && result.chainSummary.maxChain) || 0)) {
      halted = `V1の再計算値(${v1})と chainSummary.maxChain(${
        (result.chainSummary || {}).maxChain}) が一致しない`;
    }
    if (halted) return;

    run.battles += 1;
    run.v1Max = Math.max(run.v1Max, v1);
    run.v2Max = Math.max(run.v2Max, view.maxDepth);

    const a1 = v1Abilities(timeline, result.chainSummary);
    const a2 = v2Abilities(view);
    if (a1.length > run.v1AbilityMax) { run.v1AbilityMax = a1.length; run.v1Sample = { depth: v1, abilities: a1 }; }
    if (a2.length > run.v2AbilityMax) { run.v2AbilityMax = a2.length; run.v2Sample = { depth: view.maxDepth, abilities: a2 }; }

    // 分類が変わった代表例を少しだけ残す（構造化経路つき）
    if (samples.length < 12 && v1 - view.maxDepth >= 3 && view.deepest) {
      samples.push({
        strategy: strategy.name, seed: runSeed, v1, v2: view.maxDepth,
        rawMaxDepth: view.rawMaxDepth,
        steps: view.deepest.steps.map(s => ({
          depth: s.depth, rawDepth: s.rawDepth, effect: s.effect.type, kind: s.effectKind,
          actor: s.actorName, declaredBy: s.declaredBy && s.declaredBy.abilityName,
          target: s.effect.targetName, shared: s.sharedDeclaration
        }))
      });
    }
  };

  const record = runOnce(strategy, stats);
  battleHook = null;
  if (halted) return null;

  // ── 記録の消費者。同じ record から V1 と V2 を出す ──
  // maxChain 以外は同一なので、閾値の当たり方だけが違う。
  const recV1 = { ...record, maxChain: run.v1Max };
  const recV2 = { ...record, maxChain: run.v2Max };
  const lessonHit = rec => (Game.LESSONS.find(l => l.id === 'arcane') || { test: () => false }).test(rec);
  const lessonOffered = rec => Game.lessonOffers(rec).some(l => l.id === 'arcane');
  const named = rec => {
    const hit = Game.BUILD_TRAITS.find(t => { try { return !!t.test(rec); } catch (e) { return false; } });
    return !!hit && hit.id === 'chain';
  };

  return {
    strategy: strategy.name, seed: runSeed, battles: run.battles,
    cleared: !!record.cleared, conquest: record.conquest || 0,
    v1Max: run.v1Max, v2Max: run.v2Max,
    v1AbilityMax: run.v1AbilityMax, v2AbilityMax: run.v2AbilityMax,
    v1Sample: run.v1Sample, v2Sample: run.v2Sample,
    v1LessonHit: lessonHit(recV1), v2LessonHit: lessonHit(recV2),
    v1LessonOffered: lessonOffered(recV1), v2LessonOffered: lessonOffered(recV2),
    v1BuildHit: (run.v1Max || 0) >= 6, v2BuildHit: (run.v2Max || 0) >= 6,
    v1BuildNamed: named(recV1), v2BuildNamed: named(recV2)
  };
}

// ── 集計 ──────────────────────────────────────────────
const pct = (n, d) => d ? (n / d * 100) : 0;
const f1 = v => Number(v).toFixed(1);
const median = list => {
  if (!list.length) return 0;
  const s = list.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (list, q) => {
  if (!list.length) return 0;
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const dist = list => {
  const buckets = new Map();
  for (const v of list) buckets.set(v, (buckets.get(v) || 0) + 1);
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]);
};
const summaryOf = rows => ({
  runs: rows.length,
  v1Mean: rows.reduce((t, r) => t + r.v1Max, 0) / Math.max(1, rows.length),
  v2Mean: rows.reduce((t, r) => t + r.v2Max, 0) / Math.max(1, rows.length),
  v1Median: median(rows.map(r => r.v1Max)),
  v2Median: median(rows.map(r => r.v2Max)),
  v1P90: quantile(rows.map(r => r.v1Max), 0.9),
  v2P90: quantile(rows.map(r => r.v2Max), 0.9),
  v1Max: Math.max(0, ...rows.map(r => r.v1Max)),
  v2Max: Math.max(0, ...rows.map(r => r.v2Max)),
  v1LessonHit: pct(rows.filter(r => r.v1LessonHit).length, rows.length),
  v2LessonHit: pct(rows.filter(r => r.v2LessonHit).length, rows.length),
  v1LessonOffered: pct(rows.filter(r => r.v1LessonOffered).length, rows.length),
  v2LessonOffered: pct(rows.filter(r => r.v2LessonOffered).length, rows.length),
  v1BuildHit: pct(rows.filter(r => r.v1BuildHit).length, rows.length),
  v2BuildHit: pct(rows.filter(r => r.v2BuildHit).length, rows.length),
  v1BuildNamed: pct(rows.filter(r => r.v1BuildNamed).length, rows.length),
  v2BuildNamed: pct(rows.filter(r => r.v2BuildNamed).length, rows.length),
  v1AbilityMean: rows.reduce((t, r) => t + r.v1AbilityMax, 0) / Math.max(1, rows.length),
  v2AbilityMean: rows.reduce((t, r) => t + r.v2AbilityMax, 0) / Math.max(1, rows.length)
});

const all = [];
console.log(`■ CHAIN V2切替前の測定（全${strategies.length}戦略 × ${N}ラン／seed基 ${SEED_BASE}）`);
console.log('  1つの戦闘結果から V1（raw chainDepth）と V2（Chain.summarize）を同時に算出。');
console.log('  ゲームは二重実行しない。倍率・閾値・UI・raw因果グラフは変更していない。\n');

strategies.forEach((strategy, si) => {
  const stats = { syn: {}, payroll: {}, unpaid: 0, battles: 0, lossStage: {}, retries: 0, rerolls: 0,
    events: 0, incidents: 0, foodShortages: 0, maxArmy: 0, paidHires: 0, paidHireGold: 0, seizes: 0 };
  const rows = [];
  for (let i = 0; i < N; i++) {
    const row = measureRun(strategy, SEED_BASE + si * 1000003 + i * 7919, stats);
    if (halted) {
      console.error(`\n✗ 測定を停止する: ${halted}`);
      console.error(`  戦略「${strategy.name}」 ラン ${i + 1}`);
      process.exit(1);
    }
    rows.push(row);
  }
  all.push(...rows);
  const s = summaryOf(rows);
  console.log(`■ ${strategy.name}（${N}ラン）`);
  console.log(`  最大CHAIN  V1 平均 ${f1(s.v1Mean)} 中央 ${s.v1Median} P90 ${s.v1P90} 最高 ${s.v1Max}`
    + `　→　V2 平均 ${f1(s.v2Mean)} 中央 ${s.v2Median} P90 ${s.v2P90} 最高 ${s.v2Max}`);
  console.log(`  教訓 maxChain<=2   条件一致 V1 ${f1(s.v1LessonHit)}% → V2 ${f1(s.v2LessonHit)}%`
    + `　／ 実際に提示 V1 ${f1(s.v1LessonOffered)}% → V2 ${f1(s.v2LessonOffered)}%`);
  console.log(`  ビルド名 maxChain>=6 条件一致 V1 ${f1(s.v1BuildHit)}% → V2 ${f1(s.v2BuildHit)}%`
    + `　／ 実際に命名 V1 ${f1(s.v1BuildNamed)}% → V2 ${f1(s.v2BuildNamed)}%`);
  console.log(`  KPI 代表CHAINの能力数 平均 V1 ${f1(s.v1AbilityMean)} → V2 ${f1(s.v2AbilityMean)}`);
  console.log(`  V1分布 ${dist(rows.map(r => r.v1Max)).map(([v, c]) => `${v}:${c}`).join(' ')}`);
  console.log(`  V2分布 ${dist(rows.map(r => r.v2Max)).map(([v, c]) => `${v}:${c}`).join(' ')}\n`);
});

// ── 全体 ──────────────────────────────────────────────
const g = summaryOf(all);
console.log('═══ 全体（15戦略 × ' + N + 'ラン = ' + all.length + 'ラン） ═══\n');
console.log(`■ 最大CHAINの分布`);
console.log(`  V1 平均 ${f1(g.v1Mean)} 中央 ${g.v1Median} P90 ${g.v1P90} 最高 ${g.v1Max}`);
console.log(`  V2 平均 ${f1(g.v2Mean)} 中央 ${g.v2Median} P90 ${g.v2P90} 最高 ${g.v2Max}`);
console.log(`  V1 ${dist(all.map(r => r.v1Max)).map(([v, c]) => `${v}:${c}`).join(' ')}`);
console.log(`  V2 ${dist(all.map(r => r.v2Max)).map(([v, c]) => `${v}:${c}`).join(' ')}`);
console.log(`\n■ 教訓「未完の記憶」 maxChain <= 2`);
console.log(`  条件一致   V1 ${f1(g.v1LessonHit)}%  → V2 ${f1(g.v2LessonHit)}%`);
console.log(`  実際に提示 V1 ${f1(g.v1LessonOffered)}%  → V2 ${f1(g.v2LessonOffered)}%`);
console.log(`\n■ ビルド名「N連鎖を通した」 maxChain >= 6`);
console.log(`  条件一致   V1 ${f1(g.v1BuildHit)}%  → V2 ${f1(g.v2BuildHit)}%`);
console.log(`  実際に命名 V1 ${f1(g.v1BuildNamed)}%  → V2 ${f1(g.v2BuildNamed)}%`);
console.log(`\n■ KPI`);
console.log(`  chainMax        平均 V1 ${f1(g.v1Mean)} → V2 ${f1(g.v2Mean)}`);
console.log(`  chainAbilityMax 平均 V1 ${f1(g.v1AbilityMean)} → V2 ${f1(g.v2AbilityMean)}`);
const sampleV1 = all.reduce((b, r) => (!b || r.v1AbilityMax > b.v1AbilityMax ? r : b), null);
const sampleV2 = all.reduce((b, r) => (!b || r.v2AbilityMax > b.v2AbilityMax ? r : b), null);
if (sampleV1 && sampleV1.v1Sample) {
  console.log(`  chainSample V1（${sampleV1.strategy} / 深さ${sampleV1.v1Sample.depth}）: ${
    sampleV1.v1Sample.abilities.join(' → ')}`);
}
if (sampleV2 && sampleV2.v2Sample) {
  console.log(`  chainSample V2（${sampleV2.strategy} / 深さ${sampleV2.v2Sample.depth}）: ${
    sampleV2.v2Sample.abilities.join(' → ')}`);
}

// ── 閾値の当たり方（採用はしない。判断材料として並べるだけ） ──
console.log(`\n■ 閾値をV2でどこに置くと、V1と同じくらいの当たり方になるか（案の材料）`);
const rateAtMost = (key, t) => pct(all.filter(r => r[key] <= t).length, all.length);
const rateAtLeast = (key, t) => pct(all.filter(r => r[key] >= t).length, all.length);
console.log(`  教訓（V1 <=2 は ${f1(rateAtMost('v1Max', 2))}%）`);
for (const t of [0, 1, 2, 3]) console.log(`    V2 <=${t} … ${f1(rateAtMost('v2Max', t))}%`);
console.log(`  ビルド名（V1 >=6 は ${f1(rateAtLeast('v1Max', 6))}%）`);
for (const t of [3, 4, 5, 6]) console.log(`    V2 >=${t} … ${f1(rateAtLeast('v2Max', t))}%`);

// ── 分類が変わった代表例 ──────────────────────────────
console.log(`\n■ 分類が変わった代表例（V1 と V2 で3段以上ひらいたもの）`);
for (const s of samples.slice(0, 3)) {
  console.log(`  ${s.strategy} / seed ${s.seed}：V1 ${s.v1}段 → V2 ${s.v2}段（生 ${s.rawMaxDepth}段）`);
  for (const st of s.steps) {
    console.log(`      step${st.depth}（生${st.rawDepth}）: ${st.declaredBy ? `《${st.declaredBy}》による ` : ''}${
      st.effect}${st.actor ? ' / 行為者 ' + st.actor : ''}${st.target ? ' → ' + st.target : ''}${
      st.shared ? '（宣言を複数stepへ複製）' : ''}`);
  }
}
console.log(`  （記録した代表例は ${samples.length} 件。--json で全件書き出せる）`);

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({
    seedBase: SEED_BASE, runsPerStrategy: N,
    chainDefVersion: { api: Chain.DEF_VERSION, recorded: Chain.RECORDED_VERSION },
    overall: g, byStrategy: strategies.map(s => ({ name: s.name,
      ...summaryOf(all.filter(r => r.strategy === s.name)) })),
    samples, runs: all
  }, null, 2));
  console.log(`\n測定結果を書き出した: ${jsonOut}`);
}
console.log(`\n注: Chain.RECORDED_VERSION は ${Chain.RECORDED_VERSION} のまま（V2へ切り替えていない）。`);
