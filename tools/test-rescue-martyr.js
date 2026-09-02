// 全滅直後の救済と、蘇生→撃破→殉職手当→最終戦死時没収を検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js'
];
const ctx = { console, Math: Object.create(Math), Date, JSON };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => true; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const player = (uid, name, traits, hp, atk, spd) => Battle.makeUnit({
  uid, tplId:'test', name, race:'試験魔族', job:'', hp, atk, def:0, spd,
  salary:0, loyalty:100, traits, tags:[]
}, 'player');
const enemy = (name, hp, atk, spd) => Battle.makeUnit({
  name, race:'人間', hp, atk, def:0, spd, salary:0, traits:[], tags:[]
}, 'enemy');

let victim = player(1, '最後の戦没者', [], 10, 8, 12);
let result = Battle.simulate([victim], [enemy('処刑人', 999, 30, 1)], { graveyard:true });
let death = result.timeline.find(e => e.type === 'death' && e.unitId === victim.id);
let facility = result.timeline.find(e => e.type === 'facility_trigger' && e.facilityId === 'graveyard');
let summon = result.timeline.find(e => e.type === 'summon');
assert(death && facility && facility.parentEventId === death.eventId
  && summon && summon.parentEventId === facility.eventId,
  '全滅直後も敗北確定前に墓地の因果連鎖を解決する');
const summonIndex = result.timeline.indexOf(summon);
assert(result.timeline.slice(summonIndex + 1).some(e => e.type === 'attack' && e.fromId === summon.unit.id),
  '墓地で全滅救済された骸骨従者が次ラウンドに行動する');

victim = player(2, '救済なし', [], 10, 8, 12);
result = Battle.simulate([victim], [enemy('通常処刑人', 999, 30, 1)]);
assert(!result.victory && !result.timeline.some(e => e.type === 'revive' || e.type === 'summon'),
  '救済能力がなければ従来どおり全滅で敗北する');

vm.runInContext('U.rand = () => 0;', ctx);
victim = player(3, '執念の一兵', ['tenacity'], 10, 8, 12);
result = Battle.simulate([victim], [enemy('執念試験官', 999, 30, 1)]);
let revive = result.timeline.find(e => e.type === 'revive' && e.unitId === victim.id);
const reviveIndex = result.timeline.indexOf(revive);
assert(revive && revive.traitId === 'tenacity', '全滅直後に執念だけを救済フックとして発火する');
assert(result.timeline.slice(reviveIndex + 1).some(e => e.type === 'attack' && e.fromId === victim.id),
  '執念で全滅救済された本人が次ラウンドに再行動する');

vm.runInContext('U.rand = () => 0.5;', ctx);
const martyrBattle = finalDeath => {
  const revived = player(10, '再雇用候補', [], 10, 30, 12);
  const necro = player(11, '労務担当ネクロ', ['necromancy'], 100, 1, 2);
  const looter = player(12, '手当財源係', ['pickpocket'], 100, 1, 1);
  const enemies = [enemy('最初の標的', 50, 30, 10), enemy('残務処理係', finalDeath ? 999 : 10, finalDeath ? 30 : 1, 11)];
  return { revived, result: Battle.simulate([revived, necro, looter], enemies) };
};

let scenario = martyrBattle(false);
result = scenario.result;
assert(result.activeSynergies.includes('殉職手当'), '死霊術と金貨特性で殉職手当が成立する');
revive = result.timeline.find(e => e.type === 'revive' && e.unitId === scenario.revived.id);
const allowance = result.timeline.find(e => e.type === 'resource_gain' && e.label === '殉職手当');
const allowanceKill = allowance && result.timeline.find(e => e.eventId === allowance.parentEventId);
assert(revive && allowance && allowance.amount === 2 && allowanceKill && allowanceKill.type === 'death',
  '蘇生者の最初の敵撃破から殉職手当2Gを予約する');
assert(!result.timeline.some(e => e.type === 'resource_forfeit' && e.label === '殉職手当'),
  '蘇生者が生還すれば殉職手当を維持する');

scenario = martyrBattle(true);
result = scenario.result;
const gain = result.timeline.find(e => e.type === 'resource_gain' && e.label === '殉職手当');
const forfeit = result.timeline.find(e => e.type === 'resource_forfeit' && e.label === '殉職手当');
death = [...result.timeline].reverse().find(e => e.type === 'death' && e.unitId === scenario.revived.id);
assert(gain && forfeit && forfeit.amount === 2 && forfeit.parentEventId === death.eventId,
  '手当獲得後に最終戦死した場合、最後の死亡から2G没収を因果接続する');
const totalGains = result.timeline.filter(e => e.type === 'resource_gain' && e.resource === 'gold')
  .reduce((sum, e) => sum + e.amount, 0);
assert(result.resourceChanges.gold === totalGains - 2,
  '資源集計は殉職手当の没収を差し引く');
assert(result.timeline.filter(e => e.type === 'resource_gain' && e.label === '殉職手当').length === 1,
  '殉職手当は蘇生者1体につき1戦闘1回だけ発火する');

console.log('全滅救済・殉職手当テスト完了');
