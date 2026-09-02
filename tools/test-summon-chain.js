// 死亡→墓地→骸骨召喚→魂の徴収→次ラウンド行動を検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js'
];
const ctx = { console, Math: Object.create(Math), Date, JSON };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => true; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const make = (uid, name, traits, tags, hp, atk, spd) => Battle.makeUnit({
  uid, tplId:'test', name, race:'試験魔族', hp, atk, def:0, spd,
  salary:0, loyalty:100, traits, tags
}, 'player');

const victim = make(1, '戦没候補', [], [], 10, 8, 12);
const collector = make(2, '魂の徴収役', ['soul_harvest'], ['undead'], 100, 2, 3);
const keeper = make(3, '墓守', ['gravekeeper'], [], 100, 2, 2);
const enemy = Battle.makeUnit({ name:'処刑人', race:'人間', hp:999, atk:30, def:0, spd:10,
  traits:[], tags:[] }, 'enemy');
const result = Battle.simulate([victim, collector, keeper], [enemy], { graveyard:true });

const death = result.timeline.find(e => e.type === 'death' && e.unitId === victim.id);
const facility = result.timeline.find(e => e.type === 'facility_trigger' && e.facilityId === 'graveyard');
const summon = result.timeline.find(e => e.type === 'summon');
assert(death && facility && facility.parentEventId === death.eventId, '最初の味方死亡から墓地が発火する');
assert(summon && summon.parentEventId === facility.eventId && summon.sourceUnitId === victim.id,
  '墓地から骸骨従者の召喚を因果接続する');
assert(summon.unit.summoned && summon.unit.id === 'ps1' && summon.unit.tplId === 'skeleton',
  '召喚物へ戦闘内専用IDと完全な表示スナップショットを付ける');
assert(summon.unit.maxHp === 3 && summon.unit.atk === 4 && summon.unit.spd === 5,
  '骸骨従者を元の最大HP30%・攻撃50%・固定速度で作る');
const harvest = result.timeline.find(e => e.type === 'trait_trigger' && e.traitId === 'soul_harvest'
  && e.parentEventId === summon.eventId);
assert(harvest, '召喚イベントへ魂の徴収が反応する');
const summonIndex = result.timeline.indexOf(summon);
assert(result.timeline.slice(summonIndex + 1).some(e => e.type === 'attack' && e.fromId === summon.unit.id),
  '召喚された骸骨従者が次ラウンドから行動する');
assert(result.timeline.filter(e => e.type === 'summon').length === 1 && result.summonCount === 1,
  '墓地召喚は1戦闘1体まで');
assert(result.contribution.length === 3 && !result.contribution.some(c => c.id === summon.unit.id),
  '召喚物を給与・戦功・永久戦死へ渡す個人戦果から除外する');

const noGraveyard = Battle.simulate([
  make(4, '通常戦没者', [], [], 10, 1, 12), make(5, '通常生存者', [], [], 100, 1, 2)
], [Battle.makeUnit({ name:'敵', race:'人間', hp:200, atk:30, def:0, spd:10, traits:[], tags:[] }, 'enemy')]);
assert(!noGraveyard.timeline.some(e => e.type === 'summon'), '墓地が無効なら従来どおり召喚しない');

console.log('墓地召喚CHAINテスト完了');
