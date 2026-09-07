// `Game.deploy()` が falsy を返す原因の切り分け。
//
//   node tools/deploy-falsy-probe.js            … 全15戦略 × 200ラン
//   node tools/deploy-falsy-probe.js 50
//   CHAIN_SEED_BASE=2000 node tools/deploy-falsy-probe.js 200
//
// 測定（tools/chain-v2-measure.js）で未完として除外していたランの原因を特定する。
// **ゲーム本体もsim戦略も、このツールからは一切書き換えない。** 読むだけである。
//
// deploy() の falsy 経路は run.js に2つしかない:
//   1350行  if (this.activeRoster().length === 0) return null;   → 出撃者0
//   1361行  if (!openingBattle && !this.preparePayrollForBattle(notes)) return null;  → 給与不能
// これ以外で falsy になったら「その他」として、判定に使った材料ごと残す。
//
// 分類は deploy() を呼ぶ**前**に取った読み取り専用のスナップショットで行う。
// preparePayrollForBattle() は状態を書き換えるので、原因判定のために呼び直さない。
const fs = require('fs'), vm = require('vm');

const N = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 200);
const SEED_BASE = Number(process.env.CHAIN_SEED_BASE || 1000);
const DETAIL_LIMIT = Number(process.env.DEPLOY_PROBE_DETAILS || 6);

let seedState = 1;
const seed = value => { seedState = value >>> 0 || 1; };
const seededMath = Object.create(Math);
seededMath.random = () => {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
};

// 戦略定義とランの回し方は tools/sim.js のものをそのまま使う（写しを持たない）
const SIM_SRC = fs.readFileSync(__dirname + '/sim.js', 'utf8');
const CUT = 'const N = Number(process.argv[2] || 400);';
if (!SIM_SRC.includes(CUT)) throw new Error('deploy-falsy-probe: tools/sim.js の切り出し位置が見つからない');
const outer = { console, Math: seededMath, Date, JSON, require, process };
vm.createContext(outer);
vm.runInContext(SIM_SRC.slice(0, SIM_SRC.indexOf(CUT)), outer, { filename: 'tools/sim.js(戦略定義のみ)' });
const strategies = vm.runInContext('strategies', outer);
const runOnce = vm.runInContext('runOnce', outer);
const Game = vm.runInContext('Game', outer);
const KPI = vm.runInContext('KPI', outer);
const store = vm.runInContext('store', outer);

// ── deploy() を包んで、falsy のときだけ理由を記録する ─────
const originalDeploy = Game.deploy.bind(Game);
let currentSeed = null, currentStrategy = null;
const reasons = new Map();          // 戦略 → 理由 → 件数
const details = [];                 // 最初の数件の詳細

const power = m => m.hp + m.atk * 3 + m.def * 2 + m.spd;
const snapshot = () => {
  const st = Game.state;
  const combat = Game.departmentRoster('combat');
  const active = Game.activeRoster();
  let quote = null;
  try { quote = Game.payrollQuote(); } catch (e) { quote = { error: String(e && e.message) }; }
  return {
    phase: st.phase, stage: st.stage, turn: st.turn, day: st.day,
    gold: st.gold, food: st.food,
    rosterSize: st.roster.length,
    roster: st.roster.map(m => ({ uid: m.uid, name: m.name, race: m.race,
      salary: m.salary, loyalty: m.loyalty, unpaid: !!m.unpaid, dept: Game.departmentOf(m).id,
      power: power(m) })),
    combatRosterSize: combat.length,
    combatUids: combat.map(m => m.uid),
    activeUids: (st.activeUids || []).slice(),
    activeRosterSize: active.length,
    payrollPolicy: st.payrollPolicy,
    payrollQuote: quote && {
      policy: quote.policy, total: quote.total, affordable: quote.affordable,
      shortfall: quote.shortfall
    },
    salaryTotal: (() => { try { return Game.salaryTotal(); } catch (e) { return null; } })(),
    applicants: (st.applicants || []).map(m => ({ name: m.name, race: m.race, salary: m.salary })),
    openingPrototype: !!st.openingPrototype,
    selectedMission: st.selectedMission && st.selectedMission.missionKind,
    retriesLeft: st.retriesLeft, retriesUsed: st.retriesUsed
  };
};

Game.deploy = function () {
  const before = snapshot();
  const out = originalDeploy();
  if (out) return out;

  // ── 分類。deploy() の falsy 経路と同じ順番で見る ──
  let reason;
  if (before.phase !== 'formation') reason = 'phase不整合';
  else if (before.activeRosterSize === 0) reason = '出撃者0';
  else if (!before.openingPrototype && before.payrollQuote && before.payrollQuote.affordable === false) reason = '給与不能';
  else reason = 'その他';

  const byStrategy = reasons.get(currentStrategy) || new Map();
  byStrategy.set(reason, (byStrategy.get(reason) || 0) + 1);
  reasons.set(currentStrategy, byStrategy);

  if (details.length < DETAIL_LIMIT) {
    details.push({ strategy: currentStrategy, seed: currentSeed, reason, state: before });
  }
  return out;
};

// ── 実行 ──────────────────────────────────────────────
console.log(`■ Game.deploy() が falsy を返す原因の切り分け（全${strategies.length}戦略 × ${N}ラン／seed基 ${SEED_BASE}）`);
console.log('  ゲーム本体もsim戦略も書き換えていない。deploy() を包んで読んでいるだけ。\n');

const perStrategy = [];
strategies.forEach((strategy, si) => {
  currentStrategy = strategy.name;
  const stats = { syn: {}, payroll: {}, unpaid: 0, battles: 0, lossStage: {}, retries: 0, rerolls: 0,
    events: 0, incidents: 0, foodShortages: 0, maxArmy: 0, paidHires: 0, paidHireGold: 0, seizes: 0 };
  let unfinished = 0;
  for (let i = 0; i < N; i++) {
    currentSeed = SEED_BASE + si * 1000003 + i * 7919;
    seed(currentSeed);
    for (const k of Object.keys(store)) delete store[k];
    KPI.reset();
    const record = runOnce(strategy, stats);
    if (!record || record.maxChain === undefined) unfinished++;
  }
  const by = reasons.get(strategy.name) || new Map();
  perStrategy.push({ name: strategy.name, unfinished, by });
  const breakdown = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  ${strategy.name.padEnd(22)} 未完 ${String(unfinished).padStart(3)}/${N}`
    + ` (${(unfinished / N * 100).toFixed(1)}%)   ${breakdown || '—'}`);
});

const totalUnfinished = perStrategy.reduce((t, s) => t + s.unfinished, 0);
console.log(`\n  合計 未完 ${totalUnfinished}/${strategies.length * N} (${
  (totalUnfinished / (strategies.length * N) * 100).toFixed(1)}%)`);
const totals = new Map();
for (const s of perStrategy) for (const [k, v] of s.by) totals.set(k, (totals.get(k) || 0) + v);
console.log(`  理由の内訳: ${[...totals.entries()].sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}件`).join(' / ') || 'なし'}`);

console.log(`\n■ 最初の ${details.length} 件の詳細（seed・phase・roster・combat roster・activeUids・所持金・給与見積・応募者）`);
for (const d of details) {
  const s = d.state;
  console.log(`\n── ${d.strategy} / seed ${d.seed} / 理由「${d.reason}」`);
  console.log(`   phase=${s.phase} stage=${s.stage} turn=${s.turn} day=${s.day}`
    + ` 開幕プロト=${s.openingPrototype} 作戦=${s.selectedMission}`);
  console.log(`   所持金 ${s.gold}G / 食料 ${s.food} / 給与総額 ${s.salaryTotal}G`
    + ` / 方針 ${s.payrollPolicy}`);
  console.log(`   給与見積: ${JSON.stringify(s.payrollQuote)}`);
  console.log(`   roster ${s.rosterSize}体 / combat ${s.combatRosterSize}体 / activeUids ${
    JSON.stringify(s.activeUids)} → 出撃者 ${s.activeRosterSize}体`);
  for (const m of s.roster) {
    console.log(`     uid${m.uid} ${m.name}（${m.race}）給与${m.salary}G 忠誠${m.loyalty}`
      + ` 部門${m.dept}${m.unpaid ? ' 未払い' : ''} 戦力${m.power}`);
  }
  console.log(`   応募者: ${s.applicants.map(a => `${a.name}(${a.race}/${a.salary}G)`).join(' ') || 'なし'}`);
  console.log(`   再起 残${s.retriesLeft} 使用${s.retriesUsed}`);
}
