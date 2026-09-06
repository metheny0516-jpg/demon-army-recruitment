const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => true; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const unit = (uid, name, loyalty, unpaid) => Battle.makeUnit({ uid, name, race:'ゴブリン', hp:40, atk:8, def:2, spd:8-uid, salary:2, loyalty, unpaid, traits:[], tags:[], rankId:'soldier' }, 'player');
const enemy = () => Battle.makeUnit({ name:'訓練かかし', hp:100, atk:1, def:0, spd:1, traits:[], tags:[] }, 'enemy');
let result = Battle.simulate([unit(1, '未払い兵', 60, true)], [enemy()]);
assert(result.incidents.some(i => i.id === 'strike'), '給与未払いで戦場ストライキが発生');
result = Battle.simulate([unit(2, '反乱兵', 10, false), unit(3, '巻き添え', 80, false)], [enemy()]);
assert(result.incidents.some(i => i.id === 'mutiny'), '低忠誠で仲間割れが発生');
assert(result.timeline.some(e => e.type === 'splash' && e.label === '仲間割れ'), '仲間へのダメージを構造化イベントで記録');

const happenings = vm.runInContext('BATTLE_HAPPENINGS', ctx);
assert(happenings.length === 10, 'ハプニングは既存3件＋追加7件');
const byId = id => happenings.find(h=>h.id===id);
const contexts = [
  ['hunger_taste',{starved:true,traits:['hunger_demon']}],
  ['empty_lunch',{starved:true,traits:['big_eater']}],
  ['cook_forage',{starved:true,traits:['demon_cook']}],
  ['feast_belt',{feast:true,traits:['big_eater']}],
  ['feast_receipt',{feast:true,traits:['greedy']}],
  ['chain_receipt',{chainDepth:3,traits:['greedy']}],
  ['chain_stagefright',{chainDepth:3,traits:['coward']}]
];
for (const [id, values] of contexts) {
  const h=byId(id), u={starved:false,feast:false,chainDepth:1,traits:[],...values};
  assert(h.check(u),id+' は必要な状態と特性で成立');
  assert(!h.check({...u,starved:false,feast:false,chainDepth:1}),id+' は平常時に発生しない');
  assert(!h.check({...u,traits:[]}),id+' は特性のない者へ発生しない');
}
let hungry=unit(1,'飢えた料理人',80,false); hungry.traits=['demon_cook'];
result=Battle.simulate([hungry],[enemy()],{rations:{consumed:0,need:1,shortage:1}});
assert(result.incidents.filter(i=>i.id==='cook_forage').length===1,'食料不足を接続し1体1戦1回まで');
let undead=unit(1,'食事不要',80,false); undead.tags=['undead']; undead.traits=['demon_cook'];
result=Battle.simulate([undead],[enemy()],{rations:{consumed:0,need:1,shortage:1}});
assert(result.incidents.length===0,'食事不要の者を糧食不足だけで飢えさせない');
let diner=unit(1,'宴の客',80,false); diner.traits=['big_eater'];
result=Battle.simulate([diner],[enemy()],{rations:{consumed:4,need:4,shortage:0,feastUid:1}});
assert(result.incidents.some(i=>i.id==='feast_belt'),'実際に宴が成立した戦闘だけ宴フラグが立つ');
let greedy=unit(1,'小銭好き',80,false); greedy.traits=['pickpocket','greedy'];
result=Battle.simulate([greedy],[enemy()]);
const interrupted=result.timeline.find(e=>e.type==='incident' && e.id==='chain_receipt');
const parent=result.timeline.find(e=>e.eventId===interrupted?.parentEventId);
assert(parent?.traitId==='greedy' && interrupted.chainId===parent.chainId,'追撃中の不祥事を実際の強欲に因果接続');
assert(!result.timeline.some(e=>e.type==='attack' && e.label==='強欲'),'発生時はその追撃だけを休む');
let captured=[];
vm.runInContext('U.chance = p => { capture(p); return false; };',Object.assign(ctx,{capture:p=>captured.push(p)}));
let leader=unit(2,'将軍',80,false);leader.rankId='general';
greedy=unit(1,'小銭好き',80,false);greedy.traits=['pickpocket','greedy'];
Battle.simulate([greedy,leader],[enemy()]);
assert(captured.some(p=>Math.abs(p-0.003*0.35)<1e-10),'新しい連鎖ハプニングにも将軍の抑制を適用');
