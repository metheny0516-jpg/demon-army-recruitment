const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const ctx = {console, Math};
vm.createContext(ctx);
for (const f of ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/synergies.js','src/core/util.js','src/core/synergy.js','src/core/battle.js']) vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
const {Battle, Synergy, SYNERGIES} = vm.runInContext('({Battle,Synergy,SYNERGIES})',ctx);
assert.equal(SYNERGIES.length,17);
const make = (race, traits=[], tags=[]) => Battle.makeUnit({name:race,race,hp:100,atk:8,def:0,spd:8,salary:3,loyalty:80,traits,tags},'player');
const cases = [
  ['slime_collection',[make('ゴブリン'),make('ゴブリン'),make('スライム'),make('スライム')],2,'pickpocket'],
  ['bone_fire',[make('魔法使い',['fireball'],['caster']),make('死霊術師',['necromancy'],['caster']),make('骸骨兵',[],['undead']),make('ゾンビ',[],['undead'])],0,'fireballAll'],
  ['hound_audit',[make('コボルト'),make('コボルト'),make('ゴブリン'),make('ゴブリン')],0,'greedy'],
  ['grave_shift',[make('ゾンビ'),make('ゾンビ'),make('骸骨兵'),make('骸骨兵'),make('死霊術師',['necromancy'])],0,'necromancy'],
  ['orc_imp_collection',[make('オーク'),make('オーク'),make('インプ'),make('インプ')],0,'pickpocket'],
  ['ogre_account',[make('オーガ'),make('ゴブリン'),make('ゴブリン'),make('ゴブリン')],0,'greedy'],
  ['imp_salvage',[make('インプ'),make('インプ'),make('骸骨兵',[],['undead']),make('ゾンビ',[],['undead'])],0,'gravekeeper']
];
for (const [id,pool,index,effect] of cases) {
  const syn = SYNERGIES.find(s=>s.id===id), squad = [pool[index]];
  const before = JSON.stringify(pool);
  assert.ok(syn.check(squad,{pool}),id+': 控えも数える');
  assert.ok(!syn.check([],{pool}),id+': 効果対象不在なら発動しない');
  const removed = pool.filter((_,i)=>i !== (index===0?1:0));
  assert.ok(!syn.check(squad,{pool:removed}),id+': 条件不足は発動しない');
  Synergy.preview(squad,{pool,slots:5});
  assert.equal(JSON.stringify(pool),before,id+': 予告は元データを変えない');
  const copy = Synergy.sandbox(squad);
  syn.apply(copy,{pool}); syn.apply(copy,{pool});
  assert.ok(copy[0].mods[effect] || copy[0].traits.includes(effect),id+': 既存能力へ接続');
  assert.equal(new Set(copy[0].traits).size,copy[0].traits.length,id+': 特性を重複付与しない');
  assert.equal(JSON.stringify(pool),before,id+': 戦闘コピー以外は不変');
}
vm.runInContext('U.chance = () => false; U.rand = () => 0.5;',ctx);
const pool = [make('コボルト'),make('コボルト'),make('ゴブリン',['pickpocket']),make('ゴブリン')];
const result = Battle.simulate([pool[0],pool[2]],[Battle.makeUnit({name:'かかし',hp:1000,atk:1,def:0,spd:1},'enemy')],{synergyPool:pool});
assert.ok(result.timeline.some(e=>e.type==='attack' && e.label==='強欲' && e.fromId==='p0'),'異種の金貨でコボルトが実際に追撃する');
console.log('混成7種: 条件・控え・予告の非破壊・特性重複防止・異種追撃 OK');
