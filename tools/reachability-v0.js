// V0: 通常ランでの到達性を測る。
//   使い方: node tools/reachability-v0.js [ラン数]
//
// 固定編成（tools/vertical-v0.js）で成立しても、普通に遊んで届かなければ体験は無い。
// ここでは sim.js と同じ「人間の判断を模した戦略」でランを回し、
//   1. 採用画面に「今の軍団と繋がる応募者」が何人並んだか（最初の3回の面接）
//   2. 3系統の小成功が、何戦目に初めて起きたか／起きたランの割合
// を数える。ゲーム側は一切変更しない。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/departments.js','src/data/events.js','src/data/demon_kings.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'];
let rngState = 1;
function mulberry32() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const seededMath = Object.create(Math);
seededMath.random = mulberry32;
const store = {};
const ctx = { console, Math: seededMath, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
const KPI = vm.runInContext('KPI', ctx);
const Synergy = vm.runInContext('Synergy', ctx);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;

// 応募者1人が「今の軍団と繋がるか」を2通りで測る。
//  linksRows … 能力どうしの接続語彙（Synergy.connections）。採用カードの1行目になる予定のもの
//  newSynergy … その1人を採るだけで新しく発動するシナジー（種族数などlinksに出ない条件を拾う）
function offerOf(candidate, roster) {
  let rows = 0, gained = [];
  try { rows = Synergy.connections(candidate, roster, []).length; } catch (e) { rows = 0; }
  try {
    const asUnits = list => list.map(m => ({ ...m, alive: true, traits: (m.traits||[]).slice(), tags: (m.tags||[]).slice(), mods: { dmgMult: 1, takenMult: 1 } }));
    const before = new Set(Synergy.active(asUnits(roster), { pool: asUnits(roster) }).map(s => s.id));
    const after = asUnits([...roster, candidate]);
    gained = Synergy.active(after, { pool: after }).map(s => s.id).filter(id => !before.has(id));
  } catch (e) { gained = []; }
  return { rows, gained: gained.length };
}

function runOnce(strat, acc) {
  Game.newRun();
  const st = Game.state;
  let guard = 0, interviews = 0, battles = 0;
  const first = { loot: 0, lootCross: 0, food: 0, death: 0 };
  while (st.phase !== 'gameover' && st.phase !== 'clear' && guard++ < 300) {
    if (st.phase === 'recruit' && st.applicants.length) {
      interviews++;
      if (interviews <= 3) {
        const offers = st.applicants.map(m => offerOf(m, st.roster));
        const iv = acc.interview[interviews - 1];
        iv.total++;
        iv.links += offers.filter(o => o.rows > 0).length;
        iv.syn += offers.filter(o => o.gained > 0).length;
        iv.any += offers.filter(o => o.rows > 0 || o.gained > 0).length;
        if (offers.some(o => o.rows > 0)) iv.runsWithLink++;
        if (offers.some(o => o.rows > 0 || o.gained > 0)) iv.runsWithAny++;
      }
    }
    while (st.phase === 'recruit' && st.applicants.length) {
      if (st.hiresLeft <= 0) { Game.skipHire(); break; }
      if (!Game.canHire()) {
        const weakest = st.roster.reduce((b,m)=> power(m) < power(b) ? m : b, st.roster[0]);
        const idx = st.applicants.reduce((b,m,i)=> power(m) > power(st.applicants[b]) ? i : b, 0);
        if (power(st.applicants[idx]) > power(weakest) * 1.1) Game.fire(weakest.uid);
        else { Game.skipHire(); break; }
      }
      Game.hire(st.applicants.reduce((b,m,i)=> power(m) > power(st.applicants[b]) ? i : b, 0));
    }
    if (st.phase === 'recruit') Game.skipHire();
    const formUp = () => {
      if (strat.departments === 'balanced' && st.roster.length >= 3) {
        for (const m of st.roster) Game.assignDepartment(m.uid, 'combat');
        const support = st.roster.slice().sort((a,b)=> power(a) - power(b));
        Game.assignDepartment(support[0].uid, 'life');
        Game.assignDepartment(support[1].uid, 'construction');
      }
      const best = Game.departmentRoster('combat').slice().sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      best.sort((a,b)=> b.hp - a.hp);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
    };
    if (st.phase === 'preparation') { formUp(); Game.prepareOpeningBattle('invade'); }
    if (st.phase === 'mission') {
      const index = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(index >= 0 ? index : 2);
    }
    if (st.phase === 'formation') {
      formUp();
      const out = Game.deploy();
      if (!out) break;
      battles++;
      const tl = out.result.timeline;
      const has = pred => tl.some(pred);
      const rations = (st.lastBattle && st.lastBattle.battleRations) || {};
      // 小成功の定義（設計書 3.1〜3.3 の「入口」）
      const lootPair = has(e => e.type === 'synergy_trigger' && e.synergyId === 'goblin_pair');
      const lootCross = has(e => e.type === 'trait_trigger' && e.traitId === 'greedy');
      const lootHit = lootPair || lootCross;
      const foodHit = rations.consumed > 0
        && has(e => e.type === 'trait_trigger' && (e.traitId === 'demon_cook' || e.traitId === 'big_eater' || e.traitId === 'hunger_demon'));
      const revived = tl.filter(e => e.type === 'revive');
      const deathHit = revived.some(r => {
        const i = tl.indexOf(r);
        return tl.slice(i + 1).some(e => (e.type === 'attack' || e.type === 'splash') && e.fromId === r.unitId);
      }) || has(e => e.type === 'summon');
      if (lootHit && !first.loot) first.loot = battles;
      if (lootCross && !first.lootCross) first.lootCross = battles;
      if (foodHit && !first.food) first.food = battles;
      if (deathHit && !first.death) first.death = battles;
    }
    if (Game.canSeizeStronghold()) Game.seizeStronghold();
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'facility') Game.chooseFacility(strat.facility || 'extortion_ledger');
    if (st.phase === 'event') {
      if (st.pendingEvent) {
        const opts = Game.eventOptions();
        if (opts.length) Game.chooseEvent(opts[Math.floor(Math.random()*opts.length)].i);
      }
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') { if (Game.canRetry()) Game.retry(); else Game.concede(); }
  }
  acc.battles.push(battles);
  for (const k of ['loot','lootCross','food','death']) {
    if (first[k]) { acc.first[k].push(first[k]); if (first[k] <= 3) acc.within3[k]++; }
  }
  acc.runs++;
  KPI.reset();
}

const N = Number(process.argv[2] || 60);
const strategies = [
  { name: '最強優先（普通に強い人材を採る）', facility: 'extortion_ledger' },
  { name: '三部門均衡（部門へも配属する）', departments: 'balanced', facility: 'grand_kitchen' }
];
for (const s of strategies) {
  const acc = { runs: 0, battles: [], first: { loot: [], lootCross: [], food: [], death: [] },
    within3: { loot: 0, lootCross: 0, food: 0, death: 0 },
    interview: [0,1,2].map(() => ({ total: 0, links: 0, syn: 0, any: 0, runsWithLink: 0, runsWithAny: 0 })) };
  for (let i = 0; i < N; i++) { rngState = 5000 + i; runOnce(s, acc); }
  const mean = a => a.length ? (a.reduce((x,y)=>x+y,0)/a.length).toFixed(2) : '—';
  console.log(`\n■ ${s.name}（${acc.runs}ラン・平均 ${mean(acc.battles)}戦）`);
  for (const [k, label] of [['loot','略奪(コンビ含む)'],['lootCross','略奪(人材間の強欲追撃)'],['food','食料'],['death','死霊']]) {
    const rate = (acc.first[k].length / acc.runs * 100).toFixed(0);
    const w3 = (acc.within3[k] / acc.runs * 100).toFixed(0);
    console.log(`  ${label}の小成功: 到達 ${rate}%のラン　初回 平均 ${mean(acc.first[k])}戦目　最初の3戦以内 ${w3}%`);
  }
  acc.interview.forEach((iv, i) => {
    if (!iv.total) return;
    console.log(`  ${i+1}回目の面接: links接続 平均 ${(iv.links/iv.total).toFixed(2)}人／採用で新規シナジー 平均 ${(iv.syn/iv.total).toFixed(2)}人／どちらか 平均 ${(iv.any/iv.total).toFixed(2)}人　どちらかが1人以上いた面接 ${(iv.runsWithAny/iv.total*100).toFixed(0)}%（links単独 ${(iv.runsWithLink/iv.total*100).toFixed(0)}%）`);
  });
}
