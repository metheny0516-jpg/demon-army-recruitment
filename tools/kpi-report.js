// 端末内のKPIを読む（GAME_DESIGN_PRINCIPLES.md 第14節）。
//
// ゲーム内に分析画面は作らない。実機で遊んだあと、DevTools のコンソールで
//   copy(KPI.export())
// してファイルへ貼り、ここへ渡す:
//   node tools/kpi-report.js kpi.json
//
// 見たいのは合計値ではなく「1ランで仮説を何回試せたか」と「どこで手が止まったか」。
const fs = require('fs');
const path = process.argv[2];
if (!path) {
  console.error('使い方: node tools/kpi-report.js <KPI.export() を保存したJSON>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const runs = Array.isArray(data.runs) ? data.runs : [];
const totals = data.totals || {};
if (!runs.length) {
  console.log('ラン記録がまだない。1ラン終えてから書き出すこと。');
  process.exit(0);
}
const sum = key => runs.reduce((total, r) => total + (Number(r[key]) || 0), 0);
const mean = key => sum(key) / runs.length;
const fixed = (value, digits = 1) => Number(value).toFixed(digits);

console.log(`■ ラン数 ${runs.length}（クリア ${runs.filter(r => r.cleared).length}）`);
console.log(`  1ランの長さ: 平均 ${fixed(mean('seconds') / 60)}分／戦闘 ${fixed(mean('battles'))}回`);
console.log('');
console.log('■ 仮説試行（既存の材料をどれだけ試せているか）');
console.log(`  ビルド試行: 平均 ${fixed(mean('buildAttempts'))}回/ラン`);
console.log(`  同じ編成のままの連戦: 平均 ${fixed(mean('battles') - mean('buildAttempts'))}回/ラン`);
console.log(`  編成変更操作: 平均 ${fixed(mean('formationChanges'))}回/ラン`);
const attemptsPerBattle = mean('battles') ? mean('buildAttempts') / mean('battles') : 0;
console.log(`  判定: ${attemptsPerBattle >= 0.6
  ? '既存の材料はよく試されている → 足りないのは「種族/役割」の可能性が高い'
  : '試行が戦闘数に対して少ない → 足りないのは「試せる回数・組み替えやすさ」の可能性が高い'}`);
console.log('');
console.log('■ 金貨の出口（傭兵市場）');
console.log(`  雇った傭兵: 平均 ${fixed(mean('mercenariesHired'))}人/ラン（うち同族 ${fixed(mean('kinHires'))}人）`);
console.log(`  傭兵へ払った金貨: 平均 ${fixed(mean('mercenaryGold'))}G/ラン`);
console.log(`  合体を断った回数: 平均 ${fixed(mean('mergesRefused'))}回/ラン`);
console.log(`  有料追加採用: 平均 ${fixed(mean('paidHires'))}人/ラン・紹介料 ${fixed(mean('paidHireGold'))}G/ラン`);
console.log(`  判定: ${mean('mercenariesHired') < 0.5
  ? '傭兵がほぼ使われていない → 見つけられていないか、金が回っていない'
  : mean('kinHires') / Math.max(0.001, mean('mercenariesHired')) >= 0.6
    ? 'ビルドを濃くする買い物になっている（同族が多い）'
    : '頭数だけ買っている → 同族の価値が伝わっていない可能性'}`);
console.log('');
// ── シナジー観測 ─────────────────────────────────────
// 「種族統一ボーナスを厚くする」のではなく「異なる条件が繋がる」方向へ進めるための材料。
// 見たいのは連鎖の深さそのものではなく、**1本の連鎖が何種類の条件をまたいだか**。
console.log('■ シナジー接続（異なる条件がどれだけ繋がったか）');
const kindsPerRun = runs.map(r => Object.keys(r.triggerKinds || {}).length);
const kindsMean = kindsPerRun.reduce((a, b) => a + b, 0) / runs.length;
console.log(`  発火したトリガー種類: 平均 ${fixed(kindsMean)}種/ラン（最大 ${Math.max(0, ...kindsPerRun)}種）`);
console.log(`  最大CHAIN: 平均 ${fixed(mean('chainMax'))}（最高 ${Math.max(0, ...runs.map(r => r.chainMax || 0))}）`);
console.log(`  代表CHAINを構成した異なる能力数: 平均 ${fixed(mean('chainAbilityMax'))}（最高 ${
  Math.max(0, ...runs.map(r => r.chainAbilityMax || 0))}）`);
// 何が発火していないかを見るため、種類ごとの回数を多い順に出す。
// 一度も出てこない能力は「弱い」のではなく「繋がる条件が無い」可能性が高い
const kindTotals = new Map();
for (const r of runs) {
  for (const [key, count] of Object.entries(r.triggerKinds || {})) {
    kindTotals.set(key, (kindTotals.get(key) || 0) + count);
  }
}
const ranked = [...kindTotals.entries()].sort((a, b) => b[1] - a[1]);
if (ranked.length) {
  console.log(`  内訳（多い順）: ${ranked.map(([k, v]) => `${k}×${v}`).join(' / ')}`);
}
// 「いちばん多くの条件をまたいだ1本」を全ランから拾う（新しい順ではなく最良）
const sample = runs.reduce((best, r) => {
  if (!r.chainSample || !(r.chainSample.abilities || []).length) return best;
  return !best || r.chainAbilityMax > best.chainAbilityMax ? r : best;
}, null);
if (sample) {
  console.log(`  いちばん条件をまたいだ代表CHAIN（第${sample.gen}代 / 深さ${sample.chainSample.depth}）:`);
  console.log(`    ${sample.chainSample.abilities.join(' → ')}`);
}
const abilityMean = mean('chainAbilityMax');
console.log(`  判定: ${kindsMean < 4
  ? '発火するトリガーの種類が少ない → 条件そのものが足りない（能力追加＝CodeX側）'
  : abilityMean < 3
    ? 'トリガーは多いが連鎖が同じ能力で閉じている → 足りないのは「異なる条件をつなぐ橋」'
    : '異なる条件が実際につながっている → いまの方向で厚みを増やしてよい'}`);
console.log('');
console.log('■ もう1回（リトライ率）');
const quick = runs.filter(r => r.quickRetry).length;
console.log(`  ラン終了後60秒以内に開始: ${quick}/${runs.length}（${fixed(quick / runs.length * 100, 0)}%）`);
const bySession = new Map();
for (const r of runs) bySession.set(r.sessionRun || 0, (bySession.get(r.sessionRun || 0) || 0) + 1);
console.log(`  セッション内ラン数の最大: ${Math.max(...runs.map(r => r.sessionRun || 0))}`);
console.log('');
console.log('■ テンポ（長いと感じた合図）');
console.log(`  戦闘速度の変更: 平均 ${fixed(mean('speedChanges'))}回/ラン（累計 ${totals.speedChanges || 0}）`);
console.log(`  戦闘スキップ: 平均 ${fixed(mean('logSkips'))}回/ラン（累計 ${totals.logSkips || 0}）`);
console.log(`  モルモ報告の早送り: 平均 ${fixed(mean('reportSkips'))}回/ラン（累計 ${totals.reportSkips || 0}）`);
console.log('');
console.log('■ 停止箇所');
const stops = {};
for (const r of runs) {
  const key = `攻略${r.conquest || 0}`;
  stops[key] = (stops[key] || 0) + 1;
}
console.log(`  ラン終了時の攻略段階: ${Object.entries(stops).sort().map(([k, v]) => `${k}:${v}`).join(' ')}`);
if (data.lastScreen) {
  const s = data.lastScreen;
  console.log(`  最後にいた画面: ${s.phase}（攻略${s.conquest} / 第${s.turn}作戦 / ${s.day}日目 / 第${s.gen || 0}代）`);
  console.log(`  ${s.phase === 'title' || s.phase === 'history'
    ? '→ ランの外で閉じている。区切りまで遊べている合図'
    : s.phase === 'recruit' || s.phase === 'formation' || s.phase === 'preparation'
      ? '→ 準備画面で手が止まっている。選択肢が読めていない／決め手が無い可能性'
      : '→ 戦闘・結果の途中で閉じている。テンポか、負けの納得感を疑う'}`);
}
console.log('');
console.log('■ 各ランの明細（新しい順）');
console.log('  代  結果  戦闘  試行  編成変更  トリガー種  最大CHAIN  代表能力数  分  60秒以内');
for (const r of runs.slice().reverse()) {
  console.log(`  ${String(r.gen).padStart(2)}  ${r.cleared ? '制圧' : '壊滅'}  ${
    String(r.battles).padStart(4)}  ${String(r.buildAttempts).padStart(4)}  ${
    String(r.formationChanges).padStart(8)}  ${
    String(Object.keys(r.triggerKinds || {}).length).padStart(10)}  ${
    String(r.chainMax || 0).padStart(9)}  ${String(r.chainAbilityMax || 0).padStart(10)}  ${
    String(Math.round((r.seconds || 0) / 60)).padStart(3)}  ${r.quickRetry ? '✓' : ''}`);
}
