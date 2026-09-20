const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({console, Math});
for (const path of ['src/core/util.js','src/core/traces.js','src/data/story_act1.js','src/core/story.js']) {
  vm.runInContext(fs.readFileSync(path,'utf8'),ctx,{filename:path});
}
const {Story,Traces,U} = vm.runInContext('({Story,Traces,U})',ctx);
Story.enabled=true; Story.ROAD_CHANCE=1;
const actor={uid:1,name:'コロ',tplId:'kobold',traits:['first_strike']};
const next={uid:2,name:'ゴロ',tplId:'orc',traits:['brute']};
const initial=()=>({roster:[actor,next],traces:[],day:1,turn:1});
const battle=()=>({mission:{},enemyUnits:[{name:'兵1',hp:10,atk:2},{name:'兵2',hp:10,atk:2}],notes:[]});
let wins=0,losses=0;
for(let seed=1;seed<=60;seed++) {
  U.rand=U.seeded(seed);
  let st=initial(), b=battle();
  const first=Story.rollScenes(st,'road',[actor],b);
  assert.equal(first.length,1);
  assert.equal(Story.count(st,'charged_early'),1);
  if(b.enemyUnits.length===3){losses++;assert.match(first[0].text,/一人じゃなかった/);assert.match(b.notes[0],/増援/);}
  else {wins++;assert.equal(b.enemyUnits.length,1);}
  for(const who of [actor,next]) {
    b=battle();const before=JSON.stringify(b);
    assert.equal(Story.rollScenes(st,'road',[who],b).length,0);
    assert.equal(JSON.stringify(b),before,'抑止時は敵も通知も変えない');
  }
  // 保存・読み込み後にも既存の記録から抑止。
  st=JSON.parse(JSON.stringify(st));
  assert.equal(Story.rollScenes(st,'road',[actor],battle()).length,0);
  Traces.record(st.traces,{kind:'downed',subject:2,data:{}});
  assert.equal(Story.rollScenes(st,'road',[next],battle()).length,0,'無関係な人に経験を移さない');
  b=battle();const enemies=JSON.stringify(b.enemyUnits);
  const follow=Story.rollScenes(st,'road',[actor],b);
  assert.equal(follow.length,1);assert.match(follow[0].text,/今度は、命令を待つ/);
  assert.equal(JSON.stringify(b.enemyUnits),enemies);
  assert.equal(Story.count(st,'waited'),1);
  assert.equal(Story.rollScenes(st,'road',[actor],battle()).length,0);
}
assert.ok(wins>0&&losses>0);
assert.equal(Story.rollScenes(initial(),'road',[actor],battle()).length,1,'新しい周回は再び発生');
console.log(`scout repeat: 60 seeds passed, first success ${wins}, first failure ${losses}`);
