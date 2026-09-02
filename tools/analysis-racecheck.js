// 純粋な種族統一軍と、混成の強豪軍を、同じ敵にぶつけて直接比較する
const fs=require('fs'), vm=require('vm');
const store={};
const ctx={console,Math,Date,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
for(const f of ['src/data/traits.js','src/data/monsters.js','src/data/synergies.js','src/data/enemies.js','src/data/departments.js','src/data/demon_kings.js',
                'src/core/util.js','src/core/storage.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const Battle=vm.runInContext('Battle',ctx), T=vm.runInContext('MONSTER_TEMPLATES',ctx),
      E=vm.runInContext('ENEMY_STAGES',ctx), Syn=vm.runInContext('Synergy',ctx);

// 終盤(stage7相当)の個体を作る
function mk(tplId, i){
  const t=T.find(x=>x.id===tplId), sc=1+0.12*6;
  return { tplId, name:t.race+i, race:t.race, job:'',
    hp:Math.round(t.base.hp*sc), atk:Math.round(t.base.atk*sc),
    def:t.base.def, spd:t.base.spd,
    salary:Math.round((t.salary[0]+t.salary[1])/2)+1, loyalty:70,
    traits:(t.fixedTraits || [t.fixedTrait]).filter(Boolean), tags:t.tags.slice(), unpaid:false };
}
function winRate(roster, stageIdx, n=400){
  let w=0;
  for(let i=0;i<n;i++){
    const p=roster.map(m=>Battle.makeUnit(JSON.parse(JSON.stringify(m)),'player'));
    const e=E[stageIdx].units.map(u=>Battle.makeUnit(u,'enemy'));
    if(Battle.simulate(p,e).victory) w++;
  }
  return (w/n*100).toFixed(0)+'%';
}
const armies = {
  'ゴブリン×5(純粋)': [0,1,2,3,4].map(i=>mk('goblin',i)),
  '骸骨兵×5(純粋)':   [0,1,2,3,4].map(i=>mk('skeleton',i)),
  'スライム×5(純粋)': [0,1,2,3,4].map(i=>mk('slime',i)),
  '魔法結社×5(純粋)': [mk('mage',1),mk('mage',2),mk('imp',3),mk('necromancer',4),mk('mage',5)],
  '死の軍勢(骸骨+術師)':[mk('necromancer',1),mk('skeleton',2),mk('skeleton',3),mk('zombie',4),mk('skeleton',5)],
  '混成の強豪':        [mk('ogre',1),mk('orc',2),mk('mage',3),mk('skeleton',4),mk('zombie',5)],
};
console.log('編成'.padEnd(20), '第6戦', '第7戦', '第8戦', ' 発動シナジー');
for(const [name,r] of Object.entries(armies)){
  const syn = Syn.active(r).map(s=>s.name).join('・') || 'なし';
  console.log(name.padEnd(20), winRate(r,5).padStart(4), winRate(r,6).padStart(5), winRate(r,7).padStart(5), ' ', syn);
}
