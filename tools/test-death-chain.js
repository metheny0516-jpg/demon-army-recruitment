// 死亡→魂→蘇生→魂消費→アンデッド強化の縦切りを検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => store[key] || null, setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx), Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const unit = (uid, tplId, name, traits, tags, hp, atk, spd) => Battle.makeUnit({
  uid, tplId, name, race: tplId, job: '', hp, atk, def: 0, spd,
  salary: 0, loyalty: 90, traits, tags
}, 'player');

const fallen = unit(1, 'goblin', '再雇用候補', [], [], 10, 4, 12);
const collector = unit(2, 'skeleton', '魂の会計係', ['bone', 'soul_harvest'], ['undead'], 40, 2, 3);
const keeper = unit(3, 'necromancer', '墓守ネクロ', ['necromancy', 'gravekeeper'], ['caster'], 40, 2, 2);
const enemy = Battle.makeUnit({ name:'処刑人', race:'人間', hp:999, atk:30, def:0, spd:10, traits:[], tags:[] }, 'enemy');
const result = Battle.simulate([fallen, collector, keeper], [enemy]);

const death = result.timeline.find(e => e.type === 'death' && e.unitId === fallen.id);
const soul = result.timeline.find(e => e.type === 'resource_gain' && e.resource === 'soul');
const revive = result.timeline.find(e => e.type === 'revive' && e.unitId === fallen.id);
const harvest = result.timeline.find(e => e.type === 'trait_trigger' && e.traitId === 'soul_harvest');
const consume = result.timeline.find(e => e.type === 'resource_consume' && e.resource === 'soul');
assert(death && soul && soul.parentEventId === death.eventId, '味方死亡から墓守が魂を獲得する');
assert(revive && revive.parentEventId === death.eventId && revive.traitId === 'necromancy', '死亡から死霊術の蘇生を因果接続する');
assert(harvest && harvest.parentEventId === revive.eventId, '蘇生から魂の徴収が発火する');
assert(consume && consume.parentEventId === harvest.eventId && consume.remaining === 0, '魂の徴収が魂を1消費する');
assert(fallen.tags.includes('undead'), '死霊術で蘇生した味方を戦闘中アンデッド化する');
assert(collector.mods.dmgMult === 1.2 && fallen.mods.dmgMult === 1.2, '生存中のアンデッドへ累積可能な20%強化を適用する');
const reviveIndex = result.timeline.indexOf(revive);
assert(result.timeline.slice(reviveIndex + 1).some(e => e.type === 'attack' && e.fromId === fallen.id),
  '蘇生した味方が強化後に再攻撃する');
assert(result.timeline.filter(e => e.type === 'resource_gain' && e.resource === 'soul' && e.targetId === fallen.id).length === 1,
  '同じ個体が再死亡しても魂は1戦闘1回だけ');

Game.state = { roster: [{ uid:9, tplId:'necromancer', name:'旧ネクロ', traits:['necromancy'], department:'combat' }],
  applicants: [], activeUids:[9] };
Game.migrateState();
assert(Game.state.roster[0].traits.includes('gravekeeper'), '旧セーブの死霊術師へ墓守を補う');

console.log('戦死・蘇生CHAINテスト完了');
