// Story有効・能力値/資源の補正なしで正規筋を追う簡易方策。
// node tools/sim-story-route.js 5
// 人間の判断や手動コマンドを再現しない。ブラウザ試遊の代用ではない。
const fs = require('fs'), vm = require('vm');
const ctx = {console, Math, Date, JSON, localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
vm.createContext(ctx);
for (const [, f] of fs.readFileSync('index.html','utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)) vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const {Game,Story,Town,U} = vm.runInContext('({Game,Story,Town,U})',ctx);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;
const n = Math.max(1,Number(process.argv[2]) || 5);
for (let seed=1;seed<=n;seed++) {
  U.rand=U.seeded(seed); Story.enabled=true; Game.newRun();
  let guard=0,battles=0;
  while (Game.state.act===1 && !['clear','gameover'].includes(Game.state.phase) && guard++<700 && battles<80) {
    const st=Game.state;
    if (st.phase==='story') {if(Story.currentBeat(st)?.id==='route_defense_choice')Game.storyChoose('continue');else Game.storyDone();continue;}
    if (st.phase==='recruit') {
      let count=0;
      while(st.hiresLeft>0 && st.applicants.length && count++<25) {
        const index=st.applicants.reduce((best,m,i)=>power(m)>power(st.applicants[best])?i:best,0);
        const before=st.roster.length;Game.hire(index);
        if(st.roster.length===before)break;
      }
      if(st.phase==='recruit')Game.skipHire();continue;
    }
    if(st.phase==='mission') {
      const list=Game.prepareMissions();
      const step=Story.routeStep(st), wp=step?.place?Story.routeWaypoint(st,step.place):null;
      let i=list.findIndex(m=>m.missionKind==='defend');
      if(i<0)i=list.findIndex(m=>m.story==='goblin_rescue');
      if(i<0)i=step?.place?list.findIndex(m=>m.territoryId===wp?.id&&m.territoryMode==='take'):list.findIndex(m=>m.storyRoute===step?.id);
      if(i<0)i=list.findIndex(m=>m.territoryMode==='take');
      if(i<0)break;Game.selectMission(i);continue;
    }
    if(st.phase==='formation') {
      st.activeUids=st.roster.filter(m=>!m.staff&&!Game.isInjured(m.uid)).sort((a,b)=>power(b)-power(a)).slice(0,Game.MAX_DEPLOY).sort((a,b)=>b.hp-a.hp).map(m=>m.uid);
      Game.setPayrollPolicy('regular');
      if(!Game.deploy())break;battles++;
      for(const id of ['market','tavern',...Town.facilities().map(f=>f.id)])if(Town.canBuild(Game,id).ok){Town.build(Game,id);break;}
      continue;
    }
    if(st.phase==='result'){Game.afterResult();continue;}
    if(st.phase==='event'){const options=Game.eventOptions();if(options.length)Game.chooseEvent(options[0].i);Game.nextRecruit();continue;}
    if(st.phase==='defeat'){if(Game.canRetry())Game.retry();else Game.concede();continue;}
    break;
  }
  const st=Game.state;
  console.log(JSON.stringify({seed,act:st.act,phase:st.phase,battles,by:st.actHistory?.find(a=>a.act===1)?.by||null,completed:Object.keys(st.story?.route?.completed||{}),next:Story.routeStep(st)?.id||null,gold:st.gold,roster:st.roster.length}));
}
