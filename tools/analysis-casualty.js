const fs=require('fs'), vm=require('vm');
const store={};
const ctx={console,Math,Date,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
for(const f of ['src/data/traits.js','src/data/monsters.js','src/data/portraits.js','src/data/synergies.js',
                'src/data/enemies.js','src/data/events.js','src/core/util.js','src/core/storage.js',
                'src/core/synergy.js','src/core/battle.js','src/core/run.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const Game=vm.runInContext('Game',ctx);
const power=m=>m.hp+m.atk*3+m.def*2+m.spd;

const byStage={}; let wins=0, totalDead=0, wipeWins=0, revived=0;
const dist={};
for(let i=0;i<300;i++){
  Game.newRun(); const st=Game.state; let g=0;
  while(st.phase!=='gameover'&&st.phase!=='clear'&&g++<120){
    while(st.phase==='recruit'&&st.applicants.length){
      const idx=st.applicants.reduce((b,m,j)=>power(m)>power(st.applicants[b])?j:b,0);
      if(!Game.canHire()){
        const w=st.roster.reduce((b,m)=>power(m)<power(b)?m:b, st.roster[0]);
        if(power(st.applicants[idx])>power(w)*1.1) Game.fire(w.uid); else {Game.skipHire();break;}
      }
      Game.hire(idx);
    }
    if(st.phase==='recruit') Game.skipHire();
    if(st.phase==='formation'){
      const stage=st.stage, n=st.roster.length;
      const out=Game.deploy(); if(!out) break;
      if(out.result.victory){
        wins++;
        const c=out.result.contribution||[];
        const dead=c.filter(x=>x.died).length;
        totalDead+=dead; dist[dead]=(dist[dead]||0)+1;
        (byStage[stage]=byStage[stage]||{w:0,d:0,n:0}); byStage[stage].w++; byStage[stage].d+=dead; byStage[stage].n+=n;
        if(dead===n) wipeWins++;   // 全滅しながら勝った＝蘇生で生き返った
        if(out.result.timeline.some(e=>e.type==='revive')) revived++;
      }
    }
    if(st.phase==='result') Game.afterResult();
    if(st.phase==='event'){ if(st.pendingEvent){const o=Game.eventOptions(); if(o.length)Game.chooseEvent(o[0].i);} Game.nextRecruit(); }
    if(st.phase==='defeat'){ Game.canRetry()?Game.retry():Game.concede(); }
  }
}
console.log(`勝利した戦闘 ${wins}回 での戦死者`);
console.log(`  平均戦死数: ${(totalDead/wins).toFixed(2)}体/勝利`);
console.log('  戦死数の分布:');
for(const k of Object.keys(dist).sort((a,b)=>a-b))
  console.log(`    ${k}体死亡: ${dist[k]}回 (${(dist[k]/wins*100).toFixed(0)}%)`);
console.log(`  蘇生が起きた勝利: ${revived}回 (${(revived/wins*100).toFixed(0)}%)`);
console.log('\nステージ別（平均戦死数 / 平均部隊数）');
for(const s of Object.keys(byStage).sort((a,b)=>a-b)){
  const b=byStage[s];
  console.log(`  第${s}戦: ${(b.d/b.w).toFixed(2)}体 / ${(b.n/b.w).toFixed(1)}体編成`);
}
