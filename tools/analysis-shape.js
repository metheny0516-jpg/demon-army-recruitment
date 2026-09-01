// 戦闘の「形」を測る: ラウンド数・ログ行数・1ラウンドあたりの単調さ
const fs=require('fs'), vm=require('vm');
const files=['src/data/traits.js','src/data/monsters.js','src/data/synergies.js','src/data/enemies.js','src/data/departments.js','src/data/demon_kings.js',
             'src/core/util.js','src/core/storage.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'];
const store={};
const ctx={console,Math,Date,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
for(const f of files) vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const Game=vm.runInContext('Game',ctx);
const power=m=>m.hp+m.atk*3+m.def*2+m.spd;

const per={};  // stage -> {rounds:[], lines:[]}
for(let run=0; run<200; run++){
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
      (per[s]=per[s]||{rounds:[],lines:[]});
      per[s].rounds.push(out.result.rounds);
      per[s].lines.push(out.result.log.length);
    }
    if(st.phase==='result') Game.nextRecruit();
  }
}
const avg=a=>(a.reduce((x,y)=>x+y,0)/a.length);
console.log('stage  平均R  最大R  平均ログ行  最大ログ行  推定視聴秒(55ms/行)');
for(const s of Object.keys(per).sort((a,b)=>a-b)){
  const p=per[s];
  console.log(`  ${s}  ${avg(p.rounds).toFixed(1).padStart(5)} ${String(Math.max(...p.rounds)).padStart(5)} ${avg(p.lines).toFixed(0).padStart(9)} ${String(Math.max(...p.lines)).padStart(10)} ${(avg(p.lines)*0.055).toFixed(1).padStart(12)}秒`);
}
// 1戦闘の全ログを1つ吐いて、単調さを目視する
Game.newRun(); const st=Game.state;
while(st.phase==='recruit'&&st.applicants.length){ if(!Game.canHire())break; Game.hire(0); }
if(st.phase==='recruit') Game.skipHire();
st.stage=6; st.roster.forEach(m=>{m.hp*=3;m.atk*=2;});
const out=Game.deploy();
console.log(`\n── 中盤戦(S6)のログ全文 ${out.result.log.length}行 ──`);
console.log(out.result.log.map(l=>l.t).join('\n'));
