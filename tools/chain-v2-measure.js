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
// ── 再起（リトライ）で破棄された戦闘を数えないこと ────────
// 本体は `Game.retry()` で state を丸ごとチェックポイントへ巻き戻す。
// `record.maxChain` もそこで巻き戻り、やり直した戦闘の連鎖は歴史から消える。
// 測定側が戦闘ごとの最大値を単調加算すると、**測定器だけが破棄された歴史を残す**。
// （実測: seed基1000 / ゴブリン統一 11ラン目 で record.maxChain=3 に対し測定器 4）
// そこで採用済み戦闘を配列で持ち、本体と同じ境界で巻き戻す:
//   ・`saveCheckpoint()` … いまの採用件数を控える
//   ・`retry()` が成功  … 控えた件数まで配列を切り捨てる
// 最大値・能力数・代表経路は、すべて**採用が確定した戦闘だけ**から作る。
//
// 一致確認（1件でも崩れたら測定を停止する）:
//   ・V1の再計算値と `chainSummary.maxChain` が一致すること
//   ・`Chain.summarize()` がタイムラインを書き換えないこと
//   ・raw の `parentEventId / chainId / chainDepth` が読み直しの前後で同一であること
//   ・ラン終了時に 測定V1最大 === `record.maxChain`
//   ・ラン終了時に 測定V1最大 === 採用履歴から再構成したV1最大
//   ・ラン終了時に 測定V2最大 === 同じ採用履歴から再構成したV2最大
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

// ── 採用済み戦闘の台帳。本体のチェックポイントと同じ境界で巻き戻す ──
// `accepted` に積むのは観測値だけ（タイムラインは保持しない。9000ラン分は重すぎる）。
// `checkpointAt` は「巻き戻したときに残る件数」。retry() は state を
// チェックポイントの中身へ入れ替えるので、台帳もその時点の長さへ切り戻せばよい。
let accepted = [];
let checkpointAt = 0;

const originalSaveCheckpoint = Game.saveCheckpoint.bind(Game);
Game.saveCheckpoint = function () {
  const r = originalSaveCheckpoint();
  checkpointAt = accepted.length;
  return r;
};

const originalRetry = Game.retry.bind(Game);
Game.retry = function () {
  const at = checkpointAt;                 // 本体が巻き戻す先の件数
  const ok = originalRetry();
  if (ok) {
    // originalRetry() は末尾で saveCheckpoint() を呼ぶ（＝上のフックが
    // 切り捨て前の長さを控えてしまう）ので、切り捨てと同時に控えも戻す。
    accepted.length = at;
    checkpointAt = at;
  }
  return ok;
};

// 採用履歴からの再構成。単調加算ではなく、そのつど台帳から作り直す。
const maxOf = (list, key) => list.reduce((m, b) => Math.max(m, b[key] || 0), 0);

function measureRun(strategy, runSeed, stats) {
  seed(runSeed);
  for (const k of Object.keys(store)) delete store[k];   // ラン間の保存状態を持ち越さない
  KPI.reset();

  accepted = [];
  checkpointAt = 0;

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

    // ここでは台帳へ積むだけ。最大値も代表例も、採用が確定してから作る。
    // （再起で捨てられる戦闘がまだ混じっている段階なので、確定させてはいけない）
    const a1 = v1Abilities(timeline, result.chainSummary);
    const a2 = v2Abilities(view);
    accepted.push({
      v1, v2: view.maxDepth,
      a1Len: a1.length, a2Len: a2.length,
      v1Sample: { depth: v1, abilities: a1 },
      v2Sample: { depth: view.maxDepth, abilities: a2 },
      // 分類が変わった代表例の候補（構造化経路つき）
      sample: (v1 - view.maxDepth >= 3 && view.deepest) ? {
        strategy: strategy.name, seed: runSeed, v1, v2: view.maxDepth,
        rawMaxDepth: view.rawMaxDepth,
        steps: view.deepest.steps.map(s => ({
          depth: s.depth, rawDepth: s.rawDepth, effect: s.effect.type, kind: s.effectKind,
          actor: s.actorName, declaredBy: s.declaredBy && s.declaredBy.abilityName,
          target: s.effect.targetName, shared: s.sharedDeclaration
        }))
      } : null
    });
  };

  const record = runOnce(strategy, stats);
  battleHook = null;
  if (halted) return null;

  // ── ここから先は「採用が確定した戦闘」だけを見る ──────────
  const kept = accepted;
  const run = {
    battles: kept.length,
    v1Max: maxOf(kept, 'v1'),
    v2Max: maxOf(kept, 'v2'),
    v1AbilityMax: maxOf(kept, 'a1Len'),
    v2AbilityMax: maxOf(kept, 'a2Len'),
    v1Sample: null, v2Sample: null
  };
  for (const b of kept) {
    if (b.a1Len === run.v1AbilityMax && !run.v1Sample) run.v1Sample = b.v1Sample;
    if (b.a2Len === run.v2AbilityMax && !run.v2Sample) run.v2Sample = b.v2Sample;
  }
  for (const b of kept) {
    if (b.sample && samples.length < 12) samples.push(b.sample);
  }

  // ── 最後まで終わらなかったランを混ぜない ────────────────
  // sim.js の runOnce は `Game.deploy()` が falsy を返すと while を break する。
  // そのとき endRun() へ到達しないので `st.record` が無く、`{}` が返る。
  // これを普通のランとして数えると **maxChain 0 のランが水増しされ**、
  // 教訓「未完の記憶」(maxChain<=2) の率が実際より高く出る。
  // （実測 750ラン中 38件 = 5.1%。前回報告のV1教訓率 5.1% はほぼこれだった）
  // 本体もsimも直さず、測定対象から外して件数だけ報告する。
  if (!record || record.maxChain === undefined) {
    return { strategy: strategy.name, seed: runSeed, unfinished: true, battles: kept.length };
  }

  // ── ラン終了時の整合性（1件でも崩れたら測定を停止する） ──────
  // 本体は再起で state ごとチェックポイントへ戻る。台帳がその境界で
  // 巻き戻っていなければ、ここで record.maxChain と食い違う。
  const recordMaxChain = record.maxChain || 0;
  if (run.v1Max !== recordMaxChain) {
    halted = `ラン終了時に 測定V1最大(${run.v1Max}) と record.maxChain(${recordMaxChain}) が一致しない`
      + `（再起 ${record.retriesUsed || 0} 回 / 採用戦闘 ${kept.length} 件）`;
    return null;
  }
  if (run.v1Max !== kept.reduce((m, b) => Math.max(m, b.v1 || 0), 0)) {
    halted = 'ラン終了時に 測定V1最大 と 採用履歴から再構成したV1最大 が一致しない';
    return null;
  }
  if (run.v2Max !== kept.reduce((m, b) => Math.max(m, b.v2 || 0), 0)) {
    halted = 'ラン終了時に 測定V2最大 と 採用履歴から再構成したV2最大 が一致しない';
    return null;
  }

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
    // 回帰テストが読む。v1Max はこの値と必ず一致していなければならない。
    recordMaxChain, retriesUsed: record.retriesUsed || 0,
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
const unfinished = [];      // 最後まで終わらなかったラン（集計から外す）
console.log(`■ CHAIN V2切替前の測定（全${strategies.length}戦略 × ${N}ラン／seed基 ${SEED_BASE}）`);
console.log('  1つの戦闘結果から V1（raw chainDepth）と V2（Chain.summarize）を同時に算出。');
console.log('  ゲームは二重実行しない。倍率・閾値・UI・raw因果グラフは変更していない。\n');

strategies.forEach((strategy, si) => {
  const stats = { syn: {}, payroll: {}, unpaid: 0, battles: 0, lossStage: {}, retries: 0, rerolls: 0,
    events: 0, incidents: 0, foodShortages: 0, maxArmy: 0, paidHires: 0, paidHireGold: 0, seizes: 0 };
  // ── 有効ランを必ず N 本そろえる ──────────────────────
  // 未完を単純に落とすと母集団が戦略ごとに変わり、「全15戦略×N」の比較でなくなる。
  // 未完が出たらseedを追加採番して補充し、**未完の件数と原因は別に残す**。
  // 補充は N の2倍までで打ち切る（そこまで出るなら原因の切り分けが先）。
  const rows = [];
  let draws = 0;
  const maxDraws = N * 2;
  while (rows.length < N && draws < maxDraws) {
    const row = measureRun(strategy, SEED_BASE + si * 1000003 + draws * 7919, stats);
    draws += 1;
    if (halted) {
      console.error(`\n✗ 測定を停止する: ${halted}`);
      console.error(`  戦略「${strategy.name}」 ${draws} 回目の採番`);
      process.exit(1);
    }
    if (row.unfinished) { unfinished.push(row); continue; }
    rows.push(row);
  }
  if (rows.length < N) {
    console.error(`\n✗ 測定を停止する: 「${strategy.name}」で有効ランが ${rows.length}/${N} しか揃わない`
      + `（${draws} 回採番して未完 ${draws - rows.length} 件）`);
    console.error('  母集団を欠いたまま集計しない。node tools/deploy-falsy-probe.js で原因を切り分けること。');
    process.exit(1);
  }
  all.push(...rows);
  const s = summaryOf(rows);
  const skipped = unfinished.filter(r => r.strategy === strategy.name).length;
  console.log(`■ ${strategy.name}（有効 ${rows.length}ラン${
    skipped ? ` / 未完 ${skipped}件を追加採番で補充（採番 ${draws} 回）` : ''}）`);
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
console.log('═══ 全体（15戦略 × ' + N + 'ラン ＝ 有効 ' + all.length + 'ラン'
  + (unfinished.length ? ` / 未完 ${unfinished.length}件は追加採番で補充` : '') + '） ═══\n');
if (all.length !== strategies.length * N) {
  console.error(`✗ 有効ラン数が ${all.length} で ${strategies.length * N} に満たない。集計しない。`);
  process.exit(1);
}
if (unfinished.length) {
  console.log(`■ 未完のラン ${unfinished.length}件（採番に対して ${
    f1(pct(unfinished.length, unfinished.length + all.length))}%）`);
  console.log('  sim.js の runOnce が Game.deploy() の falsy で break し、endRun() へ到達しなかったもの。');
  console.log('  record が無いので maxChain も教訓もビルド名も存在しない。');
  console.log('  **集計からは外し、同数を追加採番で補充してある**（母集団は戦略ごとに ' + N + ' 本で揃う）。');
  const byStrat = new Map();
  for (const r of unfinished) byStrat.set(r.strategy, (byStrat.get(r.strategy) || 0) + 1);
  console.log('  内訳 ' + [...byStrat.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('  原因の切り分けは node tools/deploy-falsy-probe.js\n');
} else {
  console.log('■ 未完のラン 0件。全15戦略とも最初の ' + N + ' 本がそのまま有効ラン。\n');
}
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
    seedBase: SEED_BASE, runsPerStrategy: N, unfinished,
    chainDefVersion: { api: Chain.DEF_VERSION, recorded: Chain.RECORDED_VERSION },
    overall: g, byStrategy: strategies.map(s => ({ name: s.name,
      ...summaryOf(all.filter(r => r.strategy === s.name)) })),
    samples, runs: all
  }, null, 2));
  console.log(`\n測定結果を書き出した: ${jsonOut}`);
}
console.log(`\n注: Chain.RECORDED_VERSION は ${Chain.RECORDED_VERSION} のまま（V2へ切り替えていない）。`);
