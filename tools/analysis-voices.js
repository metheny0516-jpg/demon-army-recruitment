const fs=require('fs'), vm=require('vm');
const files=['src/data/traits.js','src/data/monsters.js','src/data/synergies.js','src/data/enemies.js','src/data/departments.js','src/data/demon_kings.js',
             'src/core/util.js','src/core/storage.js','src/core/synergy.js','src/core/battle.js','src/core/chain.js','src/core/run.js'];
const store={};
const ctx={console,Math,Date,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
for(const f of files) vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const Game=vm.runInContext('Game',ctx);

// 状況ごとに正しいキーが選ばれるか（合成データで直接検証）
console.log('▼ 状況判定の検証');
const cases = [
  {label:'戦死',       c:{id:'p0',tplId:'goblin',dealt:10,taken:5,died:true, unpaid:false}},
  {label:'給与未払い', c:{id:'p0',tplId:'orc',   dealt:10,taken:5,died:false,unpaid:true}},
  {label:'殊勲(最多)', c:{id:'p0',tplId:'mage',  dealt:99,taken:0,died:false,unpaid:false}},
  {label:'出番なし',   c:{id:'p1',tplId:'slime', dealt:0, taken:0,died:false,unpaid:false}},
  {label:'被弾最多',   c:{id:'p1',tplId:'ogre',  dealt:5, taken:99,died:false,unpaid:false}},
];
for (const {label,c} of cases) {
  // 単体で判定させるため、比較対象のダミーを添える
  const list = [ {...c}, {id:'pX',tplId:'kobold',dealt:50,taken:1,died:false,unpaid:false} ];
  if (label==='殊勲(最多)' || label==='出番なし' || label==='被弾最多') list[1].dealt = (label==='殊勲(最多)')?1:50;
  Game.attachVoices(list, true);
  console.log(`  ${label.padEnd(12)} → 「${list[0].voice}」`);
}

// 実際のランで全種族の声が出るか
console.log('\n▼ 実プレイ100ランでの出現状況');
const power=m=>m.hp+m.atk*3+m.def*2+m.spd;
const seen={}, byRace={};
for(let i=0;i<100;i++){
  Game.newRun(); const st=Game.state; let g=0;
  while(st.phase!=='gameover'&&st.phase!=='clear'&&g++<100){
    while(st.phase==='recruit'&&st.applicants.length){
      const idx=st.applicants.reduce((b,m,i)=>power(m)>power(st.applicants[b])?i:b,0);
      if(!Game.canHire()){Game.skipHire();break;}
      Game.hire(idx);
    }
    if(st.phase==='recruit') Game.skipHire();
    if(st.phase==='formation'){ const o=Game.deploy(); if(!o) break;
      for(const c of (st.lastBattle.contribution||[])) {
        if(c.voice){ seen[c.voice]=1; byRace[c.race]=(byRace[c.race]||0)+1; }
        else console.log('  ⚠ 声なし:', c.name, c.race, c.tplId);
      }
    }
    if(st.phase==='result') Game.nextRecruit();
    if(st.phase==='defeat'){ Game.canRetry()?Game.retry():Game.concede(); }
  }
}
console.log('  ユニークな台詞数:', Object.keys(seen).length);
console.log('  種族別の発話回数:', JSON.stringify(byRace));
