// 最新の表示メタデータを除けば、基点と戦闘結果・全イベント・乱数が一致すること。
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const BASE='fe89ca0';
const files=['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/skill_effects.js','src/core/battle.js'];
const load=old=>{const c=vm.createContext({console,Math:Object.create(Math)});for(const f of files)vm.runInContext(old&&['src/core/battle.js','src/core/skill_effects.js'].includes(f)?cp.execFileSync('git',['show',BASE+':'+f],{encoding:'utf8'}):fs.readFileSync(f,'utf8'),c,{filename:f});vm.runInContext('globalThis.api={Battle,U,SKILLS};',c);return c.api;};
const old=load(true),current=load(false),covered=new Set(),outcomes=new Set();
function run(api,id,seed){
 const {Battle,U,SKILLS}=api;U.rand=U.seeded(seed);
 const sk=SKILLS[id];
 const mk=(name,side,extra={})=>Battle.makeUnit({uid:name,name,tplId:sk.species||'goblin',race:'ゴブリン',hp:500,atk:18,def:3,spd:10,spirit:50,loyalty:100,traits:[],tags:[],skills:[],...extra},side);
 const p=[mk('actor','player',{skills:[id],traits:sk.trait?[sk.trait]:[],hp:500}),mk('ally1','player',{spd:8}),mk('ally2','player',{spd:7})];
 p[0].hp=id==='king_wave'?450:170;p[1].hp=150;p[2].hp=100;
 if(id==='necro_hand'){p[1].alive=false;p[1].hp=0;}
 if(id==='mandragora_wake'){p[1].flags.stunned=true;p[2].flags.burn={at:99};p[2].flags.charmed=true;}
 const e=[mk('enemy1','enemy',{hp:1000,atk:4,spd:1}),mk('enemy2','enemy',{hp:1000,atk:4,spd:2}),mk('enemy3','enemy',{hp:1000,atk:4,spd:3})];
 if(id==='knight_ittou')e[0].hp=100;
 const b=Battle.start(p,e,{rations:{consumed:3,need:3,shortage:0}});
 let step=b.next();
 for(let n=0;n<5&&step.type==='commands';n++){
  const commands={};for(const a of step.allies)commands[a.id]=a.name==='actor'?{cmd:'skill',id,target:sk.target==='ally'?'p1':sk.target==='fallen'?'p1':'e0'}:{cmd:'guard'};
  step=b.next(commands);
 }
 return {timeline:b.timeline,step,rand:U.rand(),units:[...p,...e]};
}
const normalized=value=>JSON.stringify(value,(key,value)=>key==='motion'?undefined:value);
for(const id of Object.keys(current.SKILLS))for(let seed=1;seed<=6;seed++){
 const before=run(old,id,seed),after=run(current,id,seed);
 assert.equal(normalized(after),normalized(before),id+' seed '+seed+': 戦闘データ・乱数は不変');
 for(const ev of after.timeline)if(ev.motion){covered.add(ev.motion.skillId);outcomes.add(ev.motion.outcome);assert.ok(current.SKILLS[ev.motion.skillId]);if(ev.fromId===ev.toId&&ev.fromId)throw Error('反動を技本体に割当');}
}
console.log('実戦闘メタデータ:', [...covered].sort().join(', '));
const missing=Object.keys(current.SKILLS).filter(id=>!covered.has(id));
assert.deepEqual(missing,[],'31技すべて実エンジンの効果へ接続');
for(const outcome of ['bound','miss','cover','buff','cleanse','scatter','heal','revive','resource_gain'])assert.ok(outcomes.has(outcome),outcome+' を通過');
console.log('✓ 31技×6seed：戦闘結果・全イベント（motion以外）・次乱数一致、実効果接続');
