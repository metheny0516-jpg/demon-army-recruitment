// 「あってもクリアと快感に効かないのに、画面と理解コストを食っている要素」を切り分ける。
//
// やり方は外科的な切除（ablation）。システムを1つずつ止めて、
//   クリア率 / 平均勝利数 / 最大CHAIN / 発火した能力の種類数
// がどれだけ動くかを見る。動かないものは、プレイヤーの理解コストだけ取っている。
//
// 使い方: node tools/audit-weight.js [ラン数]
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/data/achievements.js', 'src/data/portraits.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/kpi.js',
  'src/core/battle.js', 'src/core/run.js'
];
const RUNS = Number(process.argv[2] || 20);

const fresh = () => {
  const store = {};
  const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
    getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
  } };
  vm.createContext(ctx);
  for (const f of files) { try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); } catch (e) {} }
  return ctx;
};

const power = m => m.hp + m.atk * 3 + m.def * 2 + m.spd;

// 1条件ぶんを回して指標を返す。ablate は Game/Battle に手を入れる関数。
function measure(label, ablate) {
  const ctx = fresh();
  const Game = vm.runInContext('Game', ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const opts = { departments: true, facility: true, payroll: true, events: true, mercenary: true, command: true };
  if (ablate) ablate(Game, Battle, ctx, opts);

  let cleared = 0, wins = 0, chain = 0, battles = 0, kinds = 0, decisions = 0;
  for (let run = 0; run < RUNS; run++) {
    Game.newRun();
    const st = Game.state;
    let guard = 0, runKinds = new Set();
    while (guard++ < 300 && st.phase !== 'gameover' && st.phase !== 'clear') {
      while (st.phase === 'recruit' && st.applicants.length && st.hiresLeft > 0) {
        const idx = st.applicants.reduce((b, m, i) => power(m) > power(st.applicants[b]) ? i : b, 0);
        decisions++; Game.hire(idx);
      }
      if (st.phase === 'recruit') { decisions++; Game.skipHire(); }
      if (st.phase === 'preparation') {
        st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
        Game.setPayrollPolicy('regular');
        if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day); else Game.prepareOpeningBattle('invade');
      }
      if (st.phase === 'mission') { decisions++; Game.selectMission(2); }
      if (st.phase === 'formation') {
        if (opts.departments && st.roster.length >= 3) {
          for (const m of st.roster) Game.assignDepartment(m.uid, 'combat');
          const sup = st.roster.slice().sort((a, b) => power(a) - power(b));
          Game.assignDepartment(sup[0].uid, 'life');
          Game.assignDepartment(sup[1].uid, 'construction');
          decisions += 2;
        }
        st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
        decisions++;                                   // 出撃隊の選定
        if (opts.payroll) { decisions++; Game.setPayrollPolicy('regular'); }
        let out = Game.deploy();
        if (!out) break;
        if (out.paused) { decisions++; out = Game.issueCommand(opts.command ? 'rally' : null); if (!out) break; }
        battles++;
        if (out.result.victory) wins++;
        chain += (out.result.chainSummary && out.result.chainSummary.maxChain) || 0;
        for (const e of out.result.timeline) {
          if (e.traitId) runKinds.add(e.traitId);
          if (e.type === 'synergy' && e.id) runKinds.add('syn:' + e.id);
          if (e.label) runKinds.add('lab:' + e.label);
        }
      }
      if (st.phase === 'facility') {
        const F = vm.runInContext('FACILITIES', ctx) || [];
        decisions++;
        if (F.length) Game.chooseFacility(F[run % F.length].id); else break;
      }
      if (st.phase === 'result') Game.afterResult ? Game.afterResult() : Game.nextRecruit();
      if (st.phase === 'event') {
        const o = Game.eventOptions();
        if (o.length) { decisions++; Game.chooseEvent(o[0].i); }
        Game.nextRecruit();
      }
      if (st.phase === 'defeat') { if (Game.canRetry && Game.canRetry()) Game.retry(); else break; }
    }
    if (st.phase === 'clear') cleared++;
    kinds += runKinds.size;
  }
  return {
    label,
    clear: (cleared / RUNS * 100),
    wins: wins / RUNS,
    chain: chain / Math.max(1, battles),
    kinds: kinds / RUNS,
    decisions: decisions / RUNS
  };
}

const cases = [
  ['基準（全部あり）', null],
  ['三部門の配属をなくす', (G, B, c, o) => { o.departments = false; }],
  ['施設（Lv.と大型施設）をなくす', (G, B, c, o) => {
    G.processDepartments = function (mission, notes) {                 // 建材と施設進捗を止める
      const st = this.state; st.food += Math.max(0, mission.foodReward || 0);
      st.lastDepartmentReport = { foodReward: 0, foodProduced: 0, foodConsumed: 0, foodShortage: 0,
        loyaltyDelta: 0, materialReward: 0, materialUsed: 0, buildCapacity: 0, salvage: 0,
        wageDiscount: 0, recruitBonus: 0, facilityBefore: 0, facilityAfter: 0, builders: 0, lifeWorkers: 0 };
    };
  }],
  ['給与方針の3択をなくす（常に通常支給）', (G, B, c, o) => { o.payroll = false; }],
  ['城内ハプニングをなくす', (G, B, c, o) => { o.events = false; G.maybeEvent = function () { return false; }; }],
  ['傭ﾍｲをなくす', (G, B, c, o) => { o.mercenary = false; G.canHireMercenary = function () { return false; }; }],
  ['魔王命令をなくす', (G, B, c, o) => { o.command = false; }],
  ['戦場の不祥事をなくす', (G, B, c, o) => { const H = vm.runInContext('BATTLE_HAPPENINGS', c); if (H) H.length = 0; }],
  ['階級・戦功をなくす', (G, B, c, o) => { G.awardMerit = function () {}; }]
];

console.log(`=== ${RUNS}ラン／条件ごとに切除して比較 ===`);
console.log('（クリア率と最大CHAINが動かない＝勝敗にも快感にも効いていない）\n');
const base = measure(cases[0][0], cases[0][1]);
const row = (r, b) => {
  const d = (v, bv, unit, digits) => {
    const diff = v - bv;
    const sign = diff > 0 ? '+' : '';
    return `${v.toFixed(digits)}${unit}` + (b ? ` (${sign}${diff.toFixed(digits)})` : '');
  };
  console.log(`  ${r.label.padEnd(30, '　')}`
    + ` クリア ${d(r.clear, b && b.clear, '%', 0).padStart(16)}`
    + ` 平均勝利 ${d(r.wins, b && b.wins, '戦', 1).padStart(16)}`
    + ` 最大CHAIN ${d(r.chain, b && b.chain, '', 2).padStart(16)}`
    + ` 発火種類 ${d(r.kinds, b && b.kinds, '', 1).padStart(15)}`
    + ` 判断 ${d(r.decisions, b && b.decisions, '回/ラン', 0).padStart(18)}`);
};
row(base, null);
for (const [label, fn] of cases.slice(1)) row(measure(label, fn), base);
