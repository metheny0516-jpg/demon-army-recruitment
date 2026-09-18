const fs=require('fs'),vm=require('vm'),assert=require('assert');
const store={},ctx={console,Math,Date,JSON,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]}};
vm.createContext(ctx);
const files=[...fs.readFileSync('index.html','utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)].map(m=>m[1]);
for(const f of files)vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
const {Game,Incidents,INCIDENTS,Traces}=vm.runInContext('({Game,Incidents,INCIDENTS,Traces})',ctx);
let passed=0;
function test(name,fn){try{fn();passed++;console.log('✓ '+name);}catch(e){console.error('✗ '+name,e);process.exitCode=1;}}
function fresh(ids=['slime']){Game.newRun();const st=Game.state;st.turn=10;st.roster=ids.map((id,i)=>Object.assign(Game.rollApplicant(id),{uid:i+1}));st.traces=[];st.incidents=undefined;Incidents.init(st);st.town.lv.hostel=1;st.gold=100;st.materials=10;return st;}
function trace(st,kind,uid=1,data={}){Game.trace(kind,uid,null,data);}
function offer(st,id){const card=Incidents.card(id),o=Incidents.candidate(st,card,2);assert(o, id+' candidate');st.incidents.offered[id]=o;return o;}
test('異なる2種・証拠固定・見学だけでは効果なし・一度だけ',()=>{const st=fresh();trace(st,'ate');trace(st,'ate');assert(!Incidents.candidate(st,Incidents.card('slime_pond'),2));trace(st,'sparked');const o=offer(st,'slime_pond'),by=JSON.stringify(o.by);assert(Incidents.open(Game,'slime_pond').pick);assert(!st.incidents.done.slime_pond);trace(st,'carried_materials');assert.equal(JSON.stringify(o.by),by);const r=Incidents.open(Game,'slime_pond',1);assert.equal(r.branch,'1体');assert(r.why.includes(st.roster[0].name));assert(r.why.includes('1体'));assert(r.why.includes(r.text));assert(!Incidents.open(Game,'slime_pond',1));});
test('同時2枚まで・一決着に1枚・旧セーブから初期化',()=>{const st=fresh(['slime','goblin']);st.town.lv.market=1;trace(st,'ate');trace(st,'sparked');trace(st,'hired',2);trace(st,'carried_materials',2);Incidents.settle(Game);assert.equal(Object.keys(st.incidents.offered).length,1);Incidents.settle(Game);assert.equal(Object.keys(st.incidents.offered).length,2);Incidents.settle(Game);assert.equal(Object.keys(st.incidents.offered).length,2);});
test('3回乾いた次だけ1種でも提示',()=>{const st=fresh();trace(st,'ate');for(let i=0;i<3;i++)Incidents.settle(Game);assert.equal(Object.keys(st.incidents.offered).length,0);Incidents.settle(Game);assert(st.incidents.offered.slime_pond);});
test('60決着より古い記録では成立しない',()=>{const st=fresh();trace(st,'ate');trace(st,'sparked');st.turn+=61;assert(!Incidents.candidate(st,Incidents.card('slime_pond'),2));});
test('個人は死亡で失効・種族は元の記録者が死んでも残る',()=>{const st=fresh(['slime','slime','goblin']);st.town.lv.market=1;trace(st,'ate');trace(st,'sparked');trace(st,'hired',3);trace(st,'carried_materials',3);offer(st,'slime_pond');offer(st,'goblin_market');st.roster=st.roster.filter(m=>m.uid===2);Incidents.settle(Game);assert(st.incidents.offered.slime_pond);assert(!st.incidents.offered.goblin_market);assert(st.traces.some(t=>t.kind==='incident'&&t.data.phase==='lost'));});
test('施設の作業先は記録時のもの・施設消滅で失効',()=>{const st=fresh();st.town.lv.lab=1;trace(st,'trained');trace(st,'carried_materials');assert(!Incidents.candidate(st,Incidents.card('mage_lab_light'),2));trace(st,'trained',1,{facility:'lab'});trace(st,'carried_materials',1,{facility:'lab'});offer(st,'mage_lab_light');st.town.lv.lab=0;Incidents.settle(Game);assert(!st.incidents.offered.mage_lab_light);});
test('期限切れは開けない・Aを断っても効果や完了記録なし',()=>{let st=fresh();trace(st,'ate');trace(st,'sparked');offer(st,'slime_pond');const n=st.traces.length;Incidents.decline(Game,'slime_pond');assert.equal(st.traces.length,n);assert(!st.incidents.done.slime_pond);offer(st,'slime_pond');st.turn+=3;assert.equal(Incidents.open(Game,'slime_pond',1),null);});
test('Bの関わらないは効果なしで日誌に残る',()=>{const st=fresh(['skeleton']);trace(st,'hired');trace(st,'cooked');Incidents.settle(Game);const before=st.food;assert.equal(st.incidents.stats.natural,1);Incidents.decline(Game,'skeleton_choir');assert.equal(st.food,before);assert.equal(st.incidents.done.skeleton_choir.branch,'ignored');});
test('模擬戦は同点なら挑戦者が譲る・提示後に数値が変わっても固定',()=>{const st=fresh(['ogre','orc']);st.roster.forEach(m=>Object.assign(m,{rankId:'general',atk:10,def:10,loyalty:80,epithet:'岩山'}));trace(st,'promoted');trace(st,'trained',2);const o=offer(st,'general_duel');assert.equal(o.loserUid,1);st.roster[0].atk=100;Incidents.open(Game,'general_duel');assert.equal(st.roster[1].epithetOverride,'岩山');assert.equal(st.roster[0].epithet,'岩山');Incidents.settle(Game);assert.equal(st.roster[0].spiritMaxBonus,0);assert(st.roster[1].epithetOverride);Incidents.settle(Game);assert(!st.roster[1].epithetOverride);assert(st.incidents.tail.ready);});
test('分身は通常応募者・占有は解除・続きは一度だけ',()=>{const st=fresh(['slime','slime']);trace(st,'ate');trace(st,'sparked');offer(st,'slime_pond');Incidents.open(Game,'slime_pond',1);const n=st.roster.length;for(let i=0;i<3;i++)Incidents.settle(Game);assert(st.incidents.tail.ready);Incidents.finishTail(Game,true);assert.equal(st.roster.length,n);assert.equal(st.incidentApplicants.length,1);assert.equal(st.incidents.bedReserved,0);assert(!Incidents.finishTail(Game,true));});
test('12枚の全枝が実行でき、状態はJSON保存できる',()=>{for(const card of INCIDENTS)for(const branch of Object.keys(card.branches)){const st=fresh(['slime','orc','goblin']);const c={game:Game,subject:st.roster[0],viewer:st.roster[1],members:st.roster.slice(0,2),winner:st.roster[0],loser:st.roster[1]};st.relics=[{id:'test',traitId:'brave',holderUid:1}];card.gain(st,c);card.branches[branch].apply(st,c);assert.doesNotThrow(()=>JSON.stringify(st));}});
test('火球は本人だけに恒久習得し、元の名簿は保持',()=>{const st=fresh(['orc','orc']);const c={game:Game,viewer:st.roster[0]};Game.incidentEffect('mage_lab_light','術師以外',c);assert(st.roster[0].skills.includes('mage_fireball'));assert(!st.roster[1].skills.includes('mage_fireball'));});
test('手入れは遺物そのものの特性を一戦だけ増やし、元の名簿を汚さない',()=>{const st=fresh(['orc']);st.activeUids=[1];st.relics=[{id:'r',traitId:'coward',holderUid:null}];Game.incidentEffect('mimic_appraisal','gain',{subject:st.roster[0]});const ordinary=st.roster[0].traits.filter(t=>t==='coward').length;assert.equal(Game.preparedRoster()[0].traits.filter(t=>t==='coward').length,ordinary+1);Incidents.settle(Game);assert.equal(Game.preparedRoster()[0].traits.filter(t=>t==='coward').length,ordinary);assert.equal(st.relics.length,1);});
test('教材の無料稽古は資金ゼロでも未払い・飢餓を起こさず一度で終わる',()=>{const st=fresh(['orc']);st.openingPrototype=false;st.day=4;st.gold=0;st.food=0;st.activeUids=[1];st.incidents.freeTraining=true;const m=st.roster[0];m.hp=1000;m.atk=100;m.loyalty=80;Game.prepareMissions();Game.selectMission(st.missionOffers.findIndex(m=>m.training));Game.deploy();assert(st.lastBattle.training);assert.equal(st.lastPayrollReport.paid,0);assert(!m.unpaid);assert.equal(st.lastDepartmentReport.foodShortage,0);assert(!st.incidents.freeTraining);});
test('前の主の防衛戦は隊列名を使い、別の反撃を上書きしない',()=>{const st=fresh();st.incidents.masterVisit={name:'骨吉の元の主'};st.incidents.tail={id:'necro_visitor_tail',parent:'necro_visitor',branch:'遺物あり',ready:true};st.counterattack={pending:true,kind:'hero',armyName:'勇者'};Incidents.finishTail(Game,true);assert.equal(st.counterattack.kind,'hero');assert(st.incidents.tail);st.counterattack=null;Incidents.finishTail(Game,true);Game.prepareMissions();assert.equal(st.missionOffers.find(m=>m.missionKind==='defend').army,'骨吉の元の主');});
test('提示を保存して復元しても根拠・敗者・選択済みは変わらない',()=>{const st=fresh();trace(st,'ate');trace(st,'sparked');offer(st,'slime_pond');const snapshot=JSON.stringify(st.incidents.offered);Game.state=JSON.parse(JSON.stringify(st));assert.equal(JSON.stringify(Incidents.init(Game.state).offered),snapshot);Incidents.open(Game,'slime_pond',1);assert(Game.state.incidents.done.slime_pond);});

// ── 移植（2026-09-14）：退避した Opus 版の検査から、ここに無かったものだけを足す。
// 直近60決着の窓と二人組の腕比べは上で見ているので重ねない。
test('痕跡は23種で、日常の仕事3種と札の記録がある',()=>{
  const TRACE_KINDS=vm.runInContext('TRACE_KINDS',ctx);
  assert.equal(Object.keys(TRACE_KINDS).length,23);
  assert.equal(Traces.MAX_KINDS,23);
  for(const kind of ['carried_materials','cooked','trained','incident']) assert(TRACE_KINDS[kind],kind);
});
test('状態を満たさない札は出ない',()=>{
  const st=fresh();st.town.lv.hostel=0;trace(st,'ate');trace(st,'sparked');
  assert(!Incidents.candidate(st,Incidents.card('slime_pond'),2));
  st.town.lv.hostel=1;
  assert(Incidents.candidate(st,Incidents.card('slime_pond'),2));
});
test('状態式が読めない場面（城下町が無い等）でも決着は止まらない',()=>{
  const st=fresh();trace(st,'ate');trace(st,'sparked');
  const card=Incidents.card('slime_pond'),state=card.state;
  card.state=()=>{throw new ReferenceError('Town is not defined');};
  try {
    assert.doesNotThrow(()=>Incidents.settle(Game));
    assert(!st.incidents.offered.slime_pond,'読めない札は黙って見送る');
  } finally { card.state=state; }
  assert(Incidents.candidate(st,card,2),'式が読めれば今までどおり出る');
});
test('全札の全枝が、黙って何もしないまま終わらない',()=>{
  // データの枝名と run.js の switch がずれると、実行はできるのに何も起きない。
  // 状態が動いたかで見張る（動かないのは筋書きだけの枝＝下の3本に限る）。
  const quiet=['harpy_letter:未制圧','goblin_market:なし','training_visitor:最多でない'];
  // 札を足したらここも増えるので、枚数も一緒に見ておく（データと検査のずれを防ぐ）
  assert.equal(INCIDENTS.length,13,'札は13枚');
  const silent=[];
  for(const card of INCIDENTS) for(const branch of Object.keys(card.branches)) {
    const st=fresh(['slime','orc','goblin']);
    st.relics=[{id:'test',traitId:'brave',holderUid:1}];
    st.roster.forEach(m=>Object.assign(m,{rankId:'general',loyalty:80}));
    const c={game:Game,subject:st.roster[0],viewer:st.roster[1],members:st.roster.slice(0,2),
      winner:st.roster[0],loser:st.roster[1]};
    const before=JSON.stringify(st);
    card.gain(st,c); card.branches[branch].apply(st,c);
    if(JSON.stringify(st)===before) silent.push(card.id+':'+branch);
  }
  assert.deepEqual(silent.filter(x=>!quiet.includes(x)),[],'何も起きない枝: '+silent.join('、'));
});
test('旧セーブ（札の器が無い）でも決着が通り、器が入る',()=>{
  // 器は trace() と settle() が入れる。どちらも冪等。
  const st=fresh();delete st.incidents;
  assert.doesNotThrow(()=>Incidents.settle(Game));
  assert(st.incidents&&st.incidents.offered,'決着を1回通せば器が入る');
});

// ── 堕騎士の札「王国からの使者」（docs/DESIGN_HUMAN_SWORDSMAN_2026-09-14.md 2節）──
test('使者は忠誠80から来る。斬れば王国が気づき、断れば後日 元同僚が討伐隊に混ざる',()=>{
  const build=loyal=>{
    const st=fresh(['fallen_knight']);
    Object.assign(st.roster[0],{race:'堕騎士',loyalty:loyal});
    st.traces=[];trace(st,'hired',1,{day:1});trace(st,'promoted',1,{rank:'兵長'});
    return st;
  };
  // 忠誠が足りなければ出ない
  const cold=build(70);
  assert(!Incidents.candidate(cold,Incidents.card('knight_envoy'),2),'忠誠80未満では出ない');
  // 90未満＝断る。忠誠が上がり、続きで元同僚が討伐隊に混ざる
  const refuse=build(85);
  Incidents.settle(Game);
  assert(refuse.incidents.offered.knight_envoy,'忠誠80以上で出る');
  assert.equal(refuse.incidents.stats.natural,1,'自然発生（door B）として数える');
  const r=Incidents.open(Game,'knight_envoy');
  assert.equal(r.branch,'90未満');
  assert.equal(refuse.roster[0].loyalty,100,'会わせて+5、断って+10');
  assert.equal(refuse.alert,0,'断った側は王国警戒度を上げない');
  refuse.incidents.tail.ready=true;refuse.counterattack=null;
  Incidents.finishTail(Game,true);
  assert(/元同僚/.test(refuse.counterattack.armyName),'元同僚が討伐隊の隊列名になる');
  // 90以上＝斬る。警戒度+5・戦功+3
  const cut=build(95);
  Incidents.settle(Game);
  const before=cut.roster[0].merit||0;
  const r2=Incidents.open(Game,'knight_envoy');
  assert.equal(r2.branch,'90以上');
  assert.equal(cut.alert,5,'王国警戒度 +5');
  assert.equal(cut.roster[0].merit,before+3,'戦功 +3');
  // 関わらない（B なので記録は残る）
  const ignore=build(85);
  Incidents.settle(Game);
  const food=ignore.food;
  Incidents.decline(Game,'knight_envoy');
  assert.equal(ignore.incidents.done.knight_envoy.branch,'ignored','関わらないは記録に残る');
  assert.equal(ignore.food,food,'関わらなければ何も起きない');
});

// ── 張り紙を待たない（docs/SPEC_FORCED_OMEN_2026-09-16.md §2-1・§2-2・§4）──
test('決着で出た札は待ち行列に積まれ、順は 予兆＞続き＞自然発生＞噂の札',()=>{
  const st=fresh(['slime']);trace(st,'ate');trace(st,'sparked');
  Incidents.settle(Game);
  assert.deepEqual(st.incidents.pending.map(p=>p.id),['slime_pond'],'出た札が待ち行列に入る');
  assert.equal(st.incidents.pending[0].kind,'A');
  // 続きと予兆を足すと、予兆＞続き＞札 の順に並び替わる
  st.incidents.tail={id:'slime_pond_tail',parent:'slime_pond',ready:true,due:0};
  Incidents.pushOmen(Game,{id:'swamp_moves',text:'沼が動いているそうデス'});
  Incidents.syncPending(st);
  assert.deepEqual(st.incidents.pending.map(p=>p.kind),['arc','tail','A']);
});
test('1決着に出すのは2件まで。残りは次の決着へ繰り越す',()=>{
  const st=fresh(['slime']);trace(st,'ate');trace(st,'sparked');
  Incidents.settle(Game);
  Incidents.pushOmen(Game,{id:'o1',text:'ひとつめ'});
  Incidents.pushOmen(Game,{id:'o2',text:'ふたつめ'});
  assert.equal(st.incidents.pending.length,3);
  // presentPending は UI 側。器としては「2件見せたら残る」ことを見る
  Incidents.markPresented(st,st.incidents.pending[0].id);
  Incidents.markPresented(st,st.incidents.pending[0].id);
  assert.equal(st.incidents.pending.length,1,'3件目は繰り越す');
  Incidents.settle(Game);
  assert.equal(st.incidents.pending[0].id,'slime_pond','繰り越した札は次の決着でも先頭に残る');
});
test('見せた札は待ち行列から外れ、二度目は積み直さない',()=>{
  const st=fresh(['slime']);trace(st,'ate');trace(st,'sparked');
  Incidents.settle(Game);
  Incidents.later(Game,'slime_pond');
  assert.equal(st.incidents.pending.length,0,'「あとで」で待ち行列から外れる');
  assert(st.incidents.offered.slime_pond,'offered には残る＝張り紙で読み返せる');
  Incidents.settle(Game);
  assert.equal(st.incidents.pending.length,0,'次の決着でも積み直さない');
});
test('めくる・断るでも待ち行列から外れる',()=>{
  const st=fresh(['slime']);trace(st,'ate');trace(st,'sparked');
  Incidents.settle(Game);Incidents.open(Game,'slime_pond',1);
  assert.equal(st.incidents.pending.length,0);
  const st2=fresh(['skeleton']);trace(st2,'hired');trace(st2,'cooked');
  Incidents.settle(Game);assert.equal(st2.incidents.pending.length,1);
  Incidents.decline(Game,'skeleton_choir');
  assert.equal(st2.incidents.pending.length,0);
});
test('失効・主役の死で消えた札は待ち行列からも消える。あとでと言った札の失効は日誌に1行',()=>{
  // 主役が死ねば札ごと消える（再提示もされない）
  const st=fresh(['slime','goblin']);st.town.lv.market=1;
  trace(st,'ate');trace(st,'sparked');
  Incidents.settle(Game);
  assert.equal(st.incidents.pending.length,1);
  st.roster=st.roster.filter(m=>m.uid===2);
  Incidents.settle(Game);
  assert(!st.incidents.pending.some(p=>p.id==='slime_pond'),'消えた札は待ち行列に残らない');
  assert(!st.traces.some(t=>t.kind==='incident'&&t.data.phase==='blown'),'見せていない札では日誌に出ない');
  // 「あとで」と言った札が失効したときだけ1行
  const st2=fresh(['slime']);trace(st2,'ate');trace(st2,'sparked');
  Incidents.settle(Game);Incidents.later(Game,'slime_pond');
  st2.turn+=3;Incidents.settle(Game);
  assert(st2.traces.some(t=>t.kind==='incident'&&t.data.phase==='blown'),'張り紙が風で飛んだ');
});
test('予兆は初回だけ積む。モルモの本文は mormoLine を優先する',()=>{
  const st=fresh(['slime']);
  assert.equal(Incidents.pushOmen(Game,{id:'swamp',text:'沼が動くデス'}),true);
  assert.equal(Incidents.pushOmen(Game,{id:'swamp',text:'沼が動くデス'}),false,'2回目は積まない');
  assert.equal(Incidents.pendingText(st,st.incidents.pending[0]),'沼が動くデス');
  trace(st,'ate');trace(st,'sparked');Incidents.settle(Game);
  const entry=st.incidents.pending.find(p=>p.id==='slime_pond');
  assert.equal(Incidents.pendingText(st,entry),Incidents.card('slime_pond').mormoLine);
});
test('同じ予兆は2決着目に積まれない（見せたあとも言い直さない）',()=>{
  // markPresented は omens から落とすので、omens だけを見ていると毎決着に再表示される。
  const st=fresh(['slime']);
  let shown=0;
  for(let i=0;i<4;i++){
    Incidents.pushOmen(Game,{id:'swamp',text:'沼が動いているそうデス'});
    if(st.incidents.pending.some(p=>p.id==='swamp')){ shown++; Incidents.markPresented(st,'swamp'); }
    Incidents.settle(Game);
  }
  assert.equal(shown,1,'4決着回しても予兆が出るのは初回だけ');
});
test('run.js の予兆の口は、差し込まれた分だけ積む',()=>{
  const st=fresh(['slime']);
  assert.equal(Game.noteArcOmens(),0,'既定では何も積まない');
  Game.arcOmens=()=>[{id:'lab_smoke',text:'研究所から煙が上がっているデス'}];
  try {
    assert.equal(Game.noteArcOmens(),1);
    assert.equal(Game.noteArcOmens(),0,'同じ予兆は初回だけ');
    assert.equal(st.incidents.pending[0].kind,'arc');
  } finally { delete Game.arcOmens; }
});

console.log(`${passed} incident tests passed`);
