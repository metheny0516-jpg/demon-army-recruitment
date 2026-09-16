// 対象を絞った経済回帰。node tools/test-act1-invasion-reward.js
// a2dc60d の run.js を比較基準に、同じ入力で報酬以外の差を確認する。
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const { execFileSync } = require('child_process');
const BASE = 'a2dc60dc15d2e3a1b34b8970f321751a4b791a8c';
const files = [...fs.readFileSync('index.html', 'utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)].map(m => m[1]);
function engine(base = false) {
  const store = {}, ctx = {console, Math, Date, JSON, localStorage: {
    getItem: k => store[k] ?? null, setItem: (k,v) => { store[k] = String(v); }, removeItem: k => {delete store[k];}
  }};
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(base && f === 'src/core/run.js'
    ? execFileSync('git', ['show', `${BASE}:${f}`], {encoding:'utf8'}) : fs.readFileSync(f,'utf8'), ctx, {filename:f});
  const get = s => vm.runInContext(s,ctx);
  return {Game:get('Game'), U:get('U'), types:get('MISSION_TYPES'), Territory:get('Territory'), Town:get('Town')};
}
const old = engine(true), now = engine();
function setup(e, opt = {}) {
  const {Game:g,U,types,Territory} = e; U.rand = U.seeded(3); g.newRun();
  const st=g.state; st.act=opt.act||1; st.conquest=opt.conquest||0; st.turn=1; st.alert=0;
  st.gold=1000; st.food=100; st.applicants=[];
  st.roster=['goblin','slime','kobold','orc','skeleton'].map(id=>g.rollApplicant(id));
  for (const m of st.roster) { Object.assign(m,{hp:1000,atk:200,def:100,spd:100,traits:[],skills:[]}); g.baseOf(m); g.memberRecord(m); }
  st.activeUids=st.roster.map(m=>m.uid);st.phase='formation';
  const kind=opt.kind||'invade';
  if(kind==='defend')st.counterattack={pending:true,kind:opt.hero?'hero':'punitive'};
  if(opt.main)st.outpost={stage:st.conquest,place:null,cleared:true,formationId:'standard'};
  const type=types.find(x=>x.id===kind)||types[kind]||(kind==='patrol'?g.PATROL_TYPE:null);
  const place=opt.land ? Territory.byId(opt.land) : null;
  st.selectedMission=g.buildMission(type,null,place);
  return st;
}
let checks=0;
function check(label, fn) { fn(); checks++; console.log('✓ '+label); }
const scenarios=[
  ['単戦',{},12],['前哨戦',{conquest:1},12],['本戦',{conquest:1,main:true},12],
  ['領土侵攻',{land:'h01'},12],['第二幕',{act:2},0],['略奪',{kind:'raid'},0],
  ['鎮圧',{kind:'suppress'},0],['訓練',{kind:'train'},0],['通常防衛',{kind:'defend'},0],
  ['勇者防衛',{kind:'defend',hero:true},0],['巡回',{kind:'patrol'},0]
];
for(const [label,opt,bonus] of scenarios) check(label,()=>{
  const a=setup(old,opt),b=setup(now,opt),ma=a.selectedMission,mb=b.selectedMission;
  assert.equal(mb.reward-ma.reward,bonus);assert.equal(mb.invasionRewardBonus,bonus);
  assert.equal(JSON.stringify(ma.units),JSON.stringify(mb.units),'敵は同じ');
  for(let i=0;i<3;i++)now.Game.applyInvasionReward(mb);
  assert.equal(mb.reward-ma.reward,bonus,'再計算で重複しない');
  const ra=old.Game.deploy(),rb=now.Game.deploy();assert(ra.result.victory&&rb.result.victory);
  assert.equal(b.gold-a.gold,bonus,'実際の入金差');
  assert.equal(JSON.stringify(a.lastPayrollReport),JSON.stringify(b.lastPayrollReport),'給与据え置き');
  assert.equal(a.food,b.food);assert.equal(a.materials,b.materials);
  assert.equal(b.lastBattle.reward-a.lastBattle.reward,bonus,'結果表示');
});
check('敵将賞金に上乗せを含めない',()=>{
  for(const e of [old,now]) {
    const st=setup(e);const m={missionKind:'invade',reward:20,captainIds:['polka']};
    if(e===now)e.Game.applyInvasionReward(m);
    e.Game.settleCaptains(m,{victory:true,spared:[],timeline:[{type:'attack',dead:true,toCaptain:'polka'}]},[]);
    assert.equal(st.gold,1010);
  }
});
function manual(e,opt={}) {
  const st=setup(e,opt),out=e.Game.deploy({manual:true}),pending=st.pendingBattle;
  let step=out.handle.next({}),guard=0;
  while(step?.type==='commands'&&guard++<40){const cmds={};for(const a of step.allies)cmds[a.id]={cmd:'attack'};step=out.handle.next(cmds);}
  return {st,pending,result:step?.result||out.handle.result};
}
check('手動勝利・同一決着の再送・保存後ロードで再入金なし',()=>{
  const {st,pending,result}=manual(now);assert(result.victory);
  now.Game.finishManualBattle(result);const gold=st.gold,turn=st.turn;
  assert.equal(now.Game.finishManualBattle(result),false);
  now.Game.settleContinue(pending);now.Game.settleRetreat(pending);
  assert.equal(st.gold,gold);assert.equal(st.turn,turn);
  now.Game.save();now.Game.load();assert.equal(now.Game.state.gold,gold);
});
check('撤退は増額なし・続行への再送でも入金なし',()=>{
  for(const e of [old,now]){const r=manual(e);r.result.retreated=true;e.Game.finishManualBattle(r.result);}
  assert.equal(now.Game.state.gold,old.Game.state.gold);
  const r=manual(now);r.result.retreated=true;now.Game.finishManualBattle(r.result);
  const gold=r.st.gold;now.Game.settleContinue(r.pending);assert.equal(r.st.gold,gold);assert.equal(r.st.lastBattle.reward,0);
});
check('判定負けは増額なし',()=>{
  for(const e of [old,now]){const r=manual(e);r.result.victory=false;e.Game.finishManualBattle(r.result);}
  assert.equal(now.Game.state.gold,old.Game.state.gold);assert.equal(now.Game.state.lastBattle.reward,0);
});
check('全滅敗北は増額なし',()=>{
  for(const e of [old,now]) { const st=setup(e);st.selectedMission.units.forEach(m=>Object.assign(m,{hp:100000,atk:100000,def:100000,spd:10000}));const out=e.Game.deploy();assert(!out.result.victory);assert(e.Game.wipeOf(out.result)); }
  assert.equal(now.Game.state.gold,old.Game.state.gold);assert.equal(now.Game.state.lastBattle.reward,0);
});
check('第一幕最終侵攻は＋12・第二幕へ移行しても二重加算なし',()=>{
  const a=setup(old,{conquest:7,land:'h12'}),b=setup(now,{conquest:7,land:'h12'});
  for(const [e,st] of [[old,a],[now,b]])for(const land of e.Territory.lands().filter(x=>x.act===1&&x.id!=='h12'))e.Territory.take(st,land.id);
  old.Game.deploy();now.Game.deploy();assert.equal(a.act,2);assert.equal(b.act,2);assert.equal(b.gold-a.gold,12);
});
check('旧セーブの選択済み作戦を移行しても1回だけ',()=>{
  const st=setup(now);st.selectedMission.reward-=12;delete st.selectedMission.invasionRewardBonus;
  const before=st.selectedMission.reward;now.Game.save();now.Game.load();
  assert.equal(now.Game.state.selectedMission.reward,before+12);
  now.Game.save();now.Game.load();assert.equal(now.Game.state.selectedMission.reward,before+12);
});
check('旧セーブの戦闘中ロードは＋12を1回・再ロードでは増えない',()=>{
  for(const e of [old,now]) {
    setup(e);e.Game.deploy({manual:true});
    if(e===now){const m=e.Game.state.pendingBattle.stageData;m.reward-=12;delete m.invasionRewardBonus;}
    e.Game.save();e.Game.load();
  }
  assert.equal(now.Game.state.gold-old.Game.state.gold,12);
  const gold=now.Game.state.gold;now.Game.load();assert.equal(now.Game.state.gold,gold);
});
console.log(`${checks} scenarios passed`);
