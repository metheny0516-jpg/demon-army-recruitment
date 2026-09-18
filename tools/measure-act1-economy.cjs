// 第一幕・固定5人の経済測定。手順と限界は docs/ACT1_ECONOMY_HANDOFF_2026-09-16.md。
// 経済トレース: 戦闘ごとの 報酬／略奪／給与／純増 と所持金の推移を測る（ブラウザ不要）
//   ECON_OUTPUT=/tmp/economy.json node tools/measure-act1-economy.cjs
// sim.js と同じ固定ロジックで回すので「人間の判断の実測」ではなく、
// 「給与と報酬の比がどう動くか」を見るためのもの。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/bonds.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/counterattack.js','src/data/departments.js','src/data/town.js','src/data/events.js','src/data/incidents.js','src/data/demon_kings.js','src/data/territories.js','src/data/enemy_captains.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/skill_effects.js','src/core/battle.js','src/core/chain.js','src/core/spotlight.js','src/core/town.js','src/core/traces.js','src/core/incidents.js','src/core/territory.js','src/core/captains.js','src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } } };
vm.createContext(ctx);
for (const f of files) vm.runInContext(process.env.ECON_BASE_REF && f==='src/core/run.js' ? require('child_process').execFileSync('git',['show',process.env.ECON_BASE_REF+':'+f],{encoding:'utf8'}) : fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);

const U=vm.runInContext('U',ctx), Town=vm.runInContext('Town',ctx), Territory=vm.runInContext('Territory',ctx);
let variant=process.env.ECON_BASE_REF?'baseline':'current';
const data=[];
const avg=(a,k)=>a.length?a.reduce((s,x)=>s+x[k],0)/a.length:null;
{
 for(const mode of ['invade','raid'])for(let seed=1;seed<=30;seed++){
  for(const k of Object.keys(store))delete store[k]; U.rand=U.seeded(seed);Game.newRun();const st=Game.state;
  st.roster=['goblin','slime','kobold','orc','skeleton'].map(id=>Game.rollApplicant(id));st.activeUids=st.roster.map(m=>m.uid);
  for(const m of st.roster){Game.memberRecord(m);Game.baseOf(m);}
  st.applicants=[];st.phase='mission';Game.prepareMissions(true);
  let battle=0,guard=0,firstMarket=null,firstSafeMarket=null,prevEnd=st.gold,rows=[];
  while(st.act===1 && !['clear','gameover','defeat'].includes(st.phase) && battle<12 && guard++<100){
   if(st.roster.length!==5)break;
   if(st.phase==='recruit'){Game.skipHire();continue;}
   if(st.phase==='result'){Game.afterResult();continue;}
   if(st.phase==='event'){if(st.pendingEvent){const opts=Game.eventOptions();if(opts.length)Game.chooseEvent(opts[0].i);}Game.nextRecruit();continue;}
   if(st.phase==='mission'){
    let i=st.missionOffers.findIndex(m=>m.missionKind==='defend');
    if(i<0)i=st.missionOffers.findIndex(m=>m.missionKind===(mode==='raid' && (st.missionCounts.raid||0)<3?'raid':'invade'));
    if(i<0)i=st.missionOffers.findIndex(m=>m.territoryMode==='take');if(i<0)break;Game.selectMission(i);continue;
   }
   if(st.phase!=='formation')break;
   st.activeUids=st.roster.map(m=>m.uid);Game.setPayrollPolicy('regular');
   const m=st.selectedMission, gold0=st.gold, salary0=Game.salaryTotal(), n=st.roster.length;
   const between=gold0-prevEnd;
   const out=Game.deploy();if(!out)break;battle++;
   const notes=st.lastBattle.notes||[];const sum=re=>notes.reduce((s,t)=>s+Number((t.match(re)||[])[1]||0),0);
   const reward=out.result.victory?m.reward:0, loot=out.result.victory?(out.result.resourceChanges?.gold||0):0;
   const tax=sum(/からの税収 \+(\d+)G/), port=sum(/港の荷から金 \+(\d+)G/), bounty=sum(/首級 \+(\d+)G/);
   const paid=st.lastPayrollReport?.paid||0,due=st.lastPayrollReport?.base||0,interest=sum(/利子 (\d+)G/);
   const delta=st.gold-gold0, other=delta-reward-loot-tax-port-bounty+paid+interest;
   const market=Town.canBuild(Game,'market').ok;
   const safe=market && st.gold>=Town.buildCost(Game,'market').gold+Game.salaryTotal();
   if(market&&firstMarket===null)firstMarket=battle;if(safe&&firstSafeMarket===null)firstSafeMarket=battle;
   rows.push({battle,kind:m.missionKind,phase:m.missionPhase,place:m.territoryId,win:out.result.victory,gold0,reward,tax,port,bounty,loot,due,paid,interest,other,between,delta,contractNet:delta+paid-due,gold1:st.gold,materials:st.materials,salary0,unpaid:!!st.lastPayrollReport?.insufficient,market,safe,n,remaining:st.roster.length,shortage:st.lastDepartmentReport?.foodShortage||0});prevEnd=st.gold;
  }
  data.push({variant,mode,seed,rows,firstMarket,firstSafeMarket,endReason:st.roster.length!==5?'roster_changed':st.act!==1?'act2':st.phase});
 }
}
if(process.env.ECON_OUTPUT) fs.writeFileSync(process.env.ECON_OUTPUT,JSON.stringify(data,null,2));
for(const v of [variant])for(const mode of ['invade','raid']){
 const runs=data.filter(x=>x.variant===v&&x.mode===mode),all=runs.flatMap(x=>x.rows),w=all.filter(x=>x.win);
 const stats={variant:v,mode,battles:all.length,wins:w.length,unpaid:w.filter(x=>x.unpaid).length,negativeAfterDue:w.filter(x=>x.reward+x.tax+x.port+x.bounty+x.loot+x.other-x.due-x.interest<0).length,firstMarket:runs.map(x=>x.firstMarket),firstSafeMarket:runs.map(x=>x.firstSafeMarket),kinds:{}};
 for(const k of ['invade','raid','defend','suppress']){const a=w.filter(x=>x.kind===k && x.remaining===5);stats.kinds[k]={n:a.length,...Object.fromEntries(['reward','tax','loot','bounty','due','paid','delta','contractNet'].map(f=>[f,avg(a,f)]))};}console.log(JSON.stringify(stats));
}
