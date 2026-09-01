const fs=require('fs'), vm=require('vm');
const store={};
const ctx={console,Math,Date,JSON,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}};
vm.createContext(ctx);
for(const f of ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/portraits.js',
                'src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js',
                'src/data/departments.js','src/data/events.js','src/core/util.js','src/core/storage.js',
                'src/core/synergy.js','src/core/battle.js','src/core/run.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const Game=vm.runInContext('Game',ctx), EVENTS=vm.runInContext('EVENTS',ctx);
const power=m=>m.hp+m.atk*3+m.def*2+m.spd;

const seen={}, outcomes={}, errors=[];
let events=0, battles=0, departures=0, runsWithDeparture=0, unpaidBattles=0;
const N=300;
for(let i=0;i<N;i++){
  Game.newRun(); const st=Game.state; let g=0, hadDep=false;
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
    if(st.phase==='mission') {
      // 部門由来イベントも実際のランで観測するため、3体以上なら生活・建設を最低1名ずつ置く。
      if(st.roster.length >= 3 && Game.departmentRoster('life').length === 0) {
        const support = st.roster.slice().sort((a,b)=>power(a)-power(b))[0];
        Game.assignDepartment(support.uid, 'life');
      }
      if(st.roster.length >= 3 && Game.departmentRoster('construction').length === 0) {
        const support = st.roster.filter(m=>m.department==='combat').sort((a,b)=>power(a)-power(b))[0];
        if(support) Game.assignDepartment(support.uid, 'construction');
      }
      const invade = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(invade >= 0 ? invade : 0);
    }
    if(st.phase==='formation'){
      const out=Game.deploy(); if(!out) break;
      battles++;
      if(st.roster.some(m=>m.unpaid)) unpaidBattles++;
      if((out.notes||[]).some(n=>n.includes('愛想を尽かして'))){ departures++; hadDep=true; }
    }
    if(st.phase==='result') Game.afterResult();
    if(st.phase==='event'){
      if(st.pendingEvent){
        const id=st.pendingEvent.id; seen[id]=(seen[id]||0)+1; events++;
        const opts=Game.eventOptions();
        if(!opts.length){ errors.push(id+': 選択肢が0'); }
        const pick=opts[Math.floor(Math.random()*opts.length)];
        try {
          Game.chooseEvent(pick.i);
          if(!st.eventOutcome) errors.push(id+': 結果テキストが空');
          (outcomes[id]=outcomes[id]||new Set()).add(st.eventOutcome.slice(0,30));
        } catch(e){ errors.push(id+': 例外 '+e.message); }
      }
      Game.nextRecruit();
    }
    if(st.phase==='defeat'){ Game.canRetry()?Game.retry():Game.concede(); }
  }
  if(hadDep) runsWithDeparture++;
}
console.log(`${N}ラン / ${battles}戦 / ハプニング${events}回\n`);
console.log(`▼ イベントの出現回数（全${EVENTS.length}種が出るか）`);
for(const e of EVENTS) console.log(`  ${e.title.padEnd(12)} ${String(seen[e.id]||0).padStart(4)}回  ${seen[e.id]?'✓':'✗ 一度も出ていない'}`);
console.log('\n▼ 未払いと離脱（修正前は 300ラン中1回=0.3%）');
console.log(`  未払いの戦闘   : ${unpaidBattles} (${(unpaidBattles/battles*100).toFixed(0)}%)`);
console.log(`  離脱が起きたラン: ${runsWithDeparture}/${N} (${(runsWithDeparture/N*100).toFixed(1)}%)`);
console.log(errors.length ? '\n✗ エラー:\n  '+[...new Set(errors)].join('\n  ') : '\n✓ 全イベントがエラーなく解決した');
