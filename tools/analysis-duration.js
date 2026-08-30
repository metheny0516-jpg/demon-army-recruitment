const fs=require('fs'), vm=require('vm');
const files=['src/data/traits.js','src/data/monsters.js','src/data/synergies.js','src/data/enemies.js',
             'src/core/util.js','src/core/storage.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'];
const store={};
const ctx={console,Math,Date,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
for(const f of files) vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const Game=vm.runInContext('Game',ctx);
const power=m=>m.hp+m.atk*3+m.def*2+m.spd;
// battle_scene.js と同じ尺テーブル
const D={0:300,1:400,2:560,3:760};
const S={battle_start:260,round_start:420,synergy:1450,note:170,death:460,revive:780,survive:420,heal:300,result:900};
const dur=e=> S[e.type]!==undefined ? S[e.type] : (D[e.emphasis]||300);
const AUTO_CAP=20000, MIN_SCALE=0.45;
const autoScaleOf=(timeline)=>{
  const raw = timeline.reduce((a,e)=>a+dur(e),0);
  return raw > AUTO_CAP ? Math.max(MIN_SCALE, AUTO_CAP/raw) : 1;
};

const per={};
for(let r=0;r<200;r++){
  Game.newRun(); const st=Game.state; let g=0;
  while(st.phase!=='gameover'&&st.phase!=='clear'&&g++<100){
    while(st.phase==='recruit'&&st.applicants.length){
      if(!Game.canHire()){Game.skipHire();break;}
      Game.hire(st.applicants.reduce((b,m,i)=>power(m)>power(st.applicants[b])?i:b,0));
    }
    if(st.phase==='recruit') Game.skipHire();
    if(st.phase==='formation'){
      st.roster.sort((a,b)=>b.hp-a.hp);
      const s=st.stage, out=Game.deploy(); if(!out) break;
      const raw=out.result.timeline.reduce((a,e)=>a+dur(e),0);
      const scale=autoScaleOf(out.result.timeline);
      (per[s]=per[s]||[]).push(raw*scale);
    }
    if(st.phase==='result') Game.nextRecruit();
  }
}
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('stage  演出尺x1   x2     最長x1');
let tot=0;
for(const s of Object.keys(per).sort((a,b)=>a-b)){
  const a=avg(per[s]);
  tot+=a;
  console.log(`  ${s}   ${(a/1000).toFixed(1)}秒  ${(a/2000).toFixed(1)}秒  ${(Math.max(...per[s])/1000).toFixed(1)}秒`);
}
console.log(`\n8戦合計 x1: ${(tot/1000/60).toFixed(1)}分 / x2: ${(tot/2000/60).toFixed(1)}分`);
