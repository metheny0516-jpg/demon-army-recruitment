const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('src/data/monsters.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('src/ui/battle_scene.js', 'utf8') + '\nglobalThis.scene = BattleScene;', ctx);
const b = { victory: true, reward: 18, lootGold: 2, contribution: [
  { name: '戦没者', survived: false, voice: '出さない' },
  { name: 'ゴブ太', survived: true, voice: '査定に響きますよね？' }
], unlocked: [{ uid: 1, name: 'ゴブ太', skillName: '連撃' }] };
const growth = [{uid:1,name:'ゴブ太',key:'hp',delta:1},{uid:1,name:'ゴブ太',key:'atk',delta:2}];
const before = JSON.stringify({b,growth});
const lines = ctx.scene.reportLines(b, growth);
assert.equal(lines.length, 4);
assert.equal(lines[0].name, 'ゴブ太');
assert.equal(lines[1].text, 'HPが1アップ、攻撃が2アップ！');
assert.equal(lines[2].text, '《連撃》を覚えた！');
assert.equal(lines[3].text, '獲得報酬 18G ／ 戦利金 2G');
assert.equal(JSON.stringify({b,growth}), before, '表示で決着データを変更しない');
assert.equal(ctx.scene.reportLines({retreated:true},[])[0].text, '撤退・報酬なし');
assert.equal(ctx.scene.reportLines({training:true},[])[0].text, '稽古終了');
assert.equal(ctx.scene.reportLines(null,[]).length,0);
console.log('battle result bubbles: passed');
let speech = 0;
Object.assign(ctx.scene, {units:{p0:{side:'player',tplId:'goblin'}},chainFlare(){},tellChain(){},setLife(){},float(){},bubble(){speech++;}});
ctx.scene.render({type:'death',unitId:'p0',permanent:false});
ctx.scene.render({type:'death',unitId:'p0',permanent:false});
assert.equal(speech,1,'蘇生後に倒れても一戦に一度');
ctx.scene.downQuoteShown.clear();
ctx.scene.render({type:'death',unitId:'p0',permanent:true});
assert.equal(speech,1,'永久戦死に冗談を出さない');
console.log('downed speech: passed');

for (const id of ['goblin', 'orc', 'slime', 'succubus', 'king_slime']) {
  const pool = vm.runInContext(`([...MONSTER_TEMPLATES, ...MONSTER_TEMPLATES_ACT2].find(t => t.id === '${id}')?.voices || SPECIAL_MONSTER_VOICES['${id}']).dead`, ctx);
  assert.ok(pool.includes(ctx.scene.downedVoice({tplId:id})), id + ': 既存の本人の台詞');
}
assert.equal(ctx.scene.downedVoice({tplId:'unknown'}), null, '台詞なしに共通の遺書を足さない');
const voices = ctx.scene.reportLines({contribution:[
  {name:'一人目',voice:'既存1',survived:true},
  {name:'二人目',voice:'既存2',survived:true},
  {name:'負傷者',voice:'出さない',survived:true,injured:true}
]}, []).filter(x => x.kind === 'voice');
assert.equal(JSON.stringify(voices.map(x => x.text)), JSON.stringify(['既存1','既存2']));
console.log('existing character voices: passed');
const ordered = ctx.scene.reportLines({contribution:[
  {name:'甲',survived:true,voice:'甲の声'}, {name:'乙',survived:true,voice:'乙の声'}
], unlocked:[{name:'甲',skillName:'甲の技'}]}, [{uid:1,name:'甲',key:'hp',delta:1}]);
assert.equal(JSON.stringify(ordered.slice(0,4).map(r => [r.name,r.kind])),
  JSON.stringify([['甲','voice'],['甲','growth'],['甲','skill'],['乙','voice']]));
let timers = 0;
const strip = {textContent:'',dataset:{}};
ctx.clearTimeout = () => {};
ctx.setTimeout = () => {timers++;};
ctx.document = {querySelectorAll:()=>[],getElementById:()=>strip};
Object.assign(ctx.scene,{units:{},reportQueue:[{text:'待って読む',kind:'growth'},{text:'次の行',kind:'reward'}]});
ctx.scene.advanceReport();
assert.equal(strip.textContent,'待って読む');
assert.equal(ctx.scene.reportQueue.length,1);
assert.equal(timers,0,'自動送りタイマーを登録しない');
ctx.scene.advanceReport();
assert.equal(strip.textContent,'次の行');
assert.equal(ctx.scene.reportTimer,null);
console.log('manual report and person ordering: passed');
