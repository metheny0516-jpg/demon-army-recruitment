const fs=require('fs'), vm=require('vm');
const store={};
const ctx={console,Math,Date,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
for(const f of ['src/data/traits.js','src/data/monsters.js','src/data/portraits.js','src/data/synergies.js','src/data/enemies.js',
                'src/core/util.js','src/core/storage.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const Game=vm.runInContext('Game',ctx);
const power=m=>m.hp+m.atk*3+m.def*2+m.spd;
let battles=0, unpaidBattles=0, departures=0, runsWithDeparture=0, minLoyaltySeen=100, rageUnpaidProcs=0;
const N=300;
for(let i=0;i<N;i++){
  Game.newRun(); const st=Game.state; let g=0, hadDep=false;
  while(st.phase!=='gameover'&&st.phase!=='clear'&&g++<100){
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
      const before=st.roster.length;
      const out=Game.deploy(); if(!out) break;
      battles++;
      if(st.roster.some(m=>m.unpaid)) unpaidBattles++;
      for(const m of st.roster) minLoyaltySeen=Math.min(minLoyaltySeen,m.loyalty);
      const dep=(out.notes||[]).filter(n=>n.includes('愛想を尽かして')).length;
      if(dep){ departures+=dep; hadDep=true; }
      if(out.result.log.some(l=>l.t&&l.t.includes('血の気'))) rageUnpaidProcs++;
    }
    if(st.phase==='result') Game.nextRecruit();
    if(st.phase==='defeat'){ Game.canRetry()?Game.retry():Game.concede(); }
  }
  if(hadDep) runsWithDeparture++;
}
console.log(`${N}ラン / 全${battles}戦での実測`);
console.log(`  給与未払いが発生した戦闘 : ${unpaidBattles} (${(unpaidBattles/battles*100).toFixed(0)}%)`);
console.log(`  忠誠切れで離脱した回数   : ${departures}`);
console.log(`  離脱が起きたラン         : ${runsWithDeparture} / ${N} (${(runsWithDeparture/N*100).toFixed(1)}%)`);
console.log(`  観測された最低忠誠       : ${minLoyaltySeen}`);
console.log(`  オークの「血の気」発動戦闘: ${rageUnpaidProcs}`);
