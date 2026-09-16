// 経済トレース: 戦闘ごとの 報酬／略奪／給与／純増 と所持金の推移を測る（ブラウザ不要）
//   使い方: node tools/econ-trace.js [ラン数=50] [戦略=greedy|careful|raid]
// sim.js と同じ固定ロジックで回すので「人間の判断の実測」ではなく、
// 「給与と報酬の比がどう動くか」を見るためのもの。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/bonds.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/counterattack.js','src/data/departments.js','src/data/events.js','src/data/demon_kings.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/battle.js','src/core/chain.js','src/core/spotlight.js','src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } } };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;
const N = Number(process.argv[2] || 50);
const mode = process.argv[3] || 'careful';

const rows = []; // {battle, kind, gold0, reward, loot, salary, gold1, roster, home}
const spends = { hire: 0, reroll: 0, merc: 0, event: 0 };
let endGold = [], endBattles = [];
for (let r = 0; r < N; r++) {
  Game.newRun();
  const st = Game.state;
  let guard = 0, battles = 0;
  while (st.phase !== 'gameover' && st.phase !== 'clear' && guard++ < 300) {
    while (st.phase === 'recruit' && st.applicants.length) {
      if (st.hiresLeft <= 0) { Game.skipHire(); break; }
      if (!Game.canHire()) { Game.skipHire(); break; }
      Game.hire(st.applicants.reduce((b,m,i)=> power(m) > power(st.applicants[b]) ? i : b, 0));
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      const best = st.roster.slice().sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day); else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      let kind = 'invade';
      const salary = Game.salaryTotal();
      if (mode === 'raid' && (st.missionCounts.raid || 0) < 4) kind = 'raid';
      if (mode === 'careful') {
        if (st.roster.some(m => m.loyalty < 45) && (st.missionCounts.suppress || 0) < 2) kind = 'suppress';
        else if (st.gold < salary + 5 && (st.missionCounts.raid || 0) < 4) kind = 'raid';
      }
      const d = st.missionOffers.findIndex(m => m.missionKind === 'defend');
      if (d >= 0) Game.selectMission(d);
      else { const i = st.missionOffers.findIndex(m => m.missionKind === kind); Game.selectMission(i >= 0 ? i : Math.min(2, st.missionOffers.length - 1)); }
    }
    if (st.phase === 'formation') {
      let pool = st.roster.slice();
      if (st.roster.length >= 3) { const sup = st.roster.slice().sort((a,b)=> power(a)-power(b)).slice(0,2).map(m=>m.uid); pool = pool.filter(m => !sup.includes(m.uid)); }
      const best = pool.sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      const gold0 = st.gold, salary = Game.salaryTotal(), roster = st.roster.length;
      const mission = Game.currentMission ? Game.currentMission() : st.selectedMission;
      const out = Game.deploy();
      if (!out) break;
      battles++;
      const rep = st.lastPayrollReport || {};
      rows.push({ battle: battles, kind: (mission && mission.missionKind) || '?', victory: out.result.victory,
        gold0, reward: out.result.victory ? (mission ? mission.reward : 0) : 0, salary, paid: rep.paid ?? null, gold1: st.gold, roster, home: roster - st.activeUids.length });
    }
    if (Game.canSeizeStronghold()) Game.seizeStronghold();
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'facility') Game.chooseFacility('graveyard');
    if (st.phase === 'event') {
      if (st.pendingEvent) { const o = Game.eventOptions(); if (o.length) Game.chooseEvent(o[Math.floor(Math.random()*o.length)].i); }
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') { if (Game.canRetry()) Game.retry(); else Game.concede(); }
  }
  endGold.push(st.gold); endBattles.push(battles);
}
const by = new Map();
for (const r of rows) { if (!by.has(r.battle)) by.set(r.battle, []); by.get(r.battle).push(r); }
const avg = (a, f) => a.length ? a.reduce((s,x)=>s+f(x),0)/a.length : 0;
console.log(`■ 戦略 ${mode}  ${N}ラン  平均戦闘数 ${avg(endBattles,x=>x).toFixed(1)}  終了時所持金 平均 ${avg(endGold,x=>x).toFixed(1)}G`);
console.log('戦闘# 件数  出撃前G  報酬   給与   純増(勝)  勝率  軍団/留守  作戦内訳');
for (const [b, list] of [...by.entries()].sort((a,b)=>a[0]-b[0])) {
  if (b > 20) break;
  const wins = list.filter(r => r.victory);
  const kinds = {}; for (const r of list) kinds[r.kind] = (kinds[r.kind]||0)+1;
  console.log(`${String(b).padStart(4)}  ${String(list.length).padStart(3)}  ${avg(list,r=>r.gold0).toFixed(1).padStart(6)}  ${avg(wins,r=>r.reward).toFixed(1).padStart(5)}  ${avg(list,r=>r.salary).toFixed(1).padStart(5)}  ${avg(wins,r=>r.gold1-r.gold0).toFixed(1).padStart(7)}  ${(wins.length/list.length*100).toFixed(0).padStart(3)}%  ${avg(list,r=>r.roster).toFixed(1)}/${avg(list,r=>r.home).toFixed(1)}  ${Object.entries(kinds).map(([k,v])=>k+':'+v).join(' ')}`);
}
const inv = rows.filter(r => r.kind === 'invade' && r.victory);
console.log(`侵攻勝利 ${inv.length}件: 報酬平均 ${avg(inv,r=>r.reward).toFixed(1)}  給与平均 ${avg(inv,r=>r.salary).toFixed(1)}  報酬<給与 の割合 ${(inv.filter(r=>r.reward<r.salary).length/inv.length*100).toFixed(0)}%`);
const raid = rows.filter(r => r.kind === 'raid' && r.victory);
console.log(`略奪勝利 ${raid.length}件: 報酬平均 ${avg(raid,r=>r.reward).toFixed(1)}  給与平均 ${avg(raid,r=>r.salary).toFixed(1)}  純増平均 ${avg(raid,r=>r.gold1-r.gold0).toFixed(1)}`);
