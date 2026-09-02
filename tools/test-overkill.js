// 致死時の余剰ダメージをOVERKILLイベント・ランク・戦果へ一貫して記録する。
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
const make = (name, hp, atk, side) => Battle.makeUnit({
  uid:name, name, race:'試験体', hp, atk, def:0, spd:side === 'player' ? 10 : 1,
  traits:[], tags:[], loyalty:100
}, side);

const attacker = make('魔王砲', 100, 500, 'player');
const target = make('標的', 100, 1, 'enemy');
const result = Battle.simulate([attacker], [target]);
const hit = result.timeline.find(e => e.type === 'attack');
const overkill = result.timeline.find(e => e.type === 'overkill');
assert(overkill && overkill.excess === 400 && overkill.percent === 400, '残HP100へ500ダメージで余剰400・400%を記録する');
assert(overkill.rank === '粉砕' && overkill.rankId === 'pulverize', '300%以上を粉砕ランクにする');
assert(overkill.parentEventId === hit.eventId && overkill.chainId === hit.chainId,
  'OVERKILLを致死攻撃の子イベントとして同じCHAINへ接続する');
assert(result.overkillSummary.count === 1 && result.overkillSummary.maxPercent === 400
  && result.overkillSummary.totalExcess === 400, 'タイムラインからOVERKILL戦果を集計する');
assert(result.contribution[0].overkillCount === 1 && result.contribution[0].maxOverkill === 400,
  '実行者の貢献度へOVERKILLを記録する');
assert(result.chainSummary.maxChain >= 2, 'OVERKILLがCHAIN深度を進める');

const exact = Battle.simulate([make('適量砲', 100, 100, 'player')], [make('標的2', 100, 1, 'enemy')]);
assert(!exact.timeline.some(e => e.type === 'overkill'), '残HPと同値の致死ダメージはOVERKILLにしない');
assert(exact.overkillSummary.count === 0 && exact.overkillSummary.maxPercent === 0, '未発生時は0で安全に集計する');

assert(Battle.overkillRank(100).name === '蹂躙'
  && Battle.overkillRank(500).name === '消滅'
  && Battle.overkillRank(1000).name === '魔王級殲滅', '各OVERKILL閾値を固定する');

const butcher = make('連鎖砲', 100, 1000, 'player');
butcher.traits.push('chain_massacre');
const victims = [make('標的A', 100, 1, 'enemy'), make('標的B', 50, 1, 'enemy'),
  make('標的C', 20, 1, 'enemy'), make('標的D', 10, 1, 'enemy'), make('標的E', 10, 1, 'enemy')];
const chain = Battle.simulate([butcher], victims);
const spreads = chain.timeline.filter(e => e.type === 'splash' && e.label === '連鎖虐殺');
assert(spreads.length === 3, '連鎖虐殺の伝播を最大3体で停止する');
assert(spreads[0].dmg === 270 && spreads[1].dmg === 66 && spreads[2].dmg === 14,
  '各撃破の余剰ダメージ30%を次の敵へ渡す');
assert(chain.timeline.filter(e => e.type === 'trait_trigger' && e.traitId === 'chain_massacre').length === 3,
  'OVERKILLごとに連鎖虐殺の発火理由を記録する');
assert(chain.chainSummary.maxChain >= 7, '攻撃から複数のOVERKILL伝播が一つの深いCHAINになる');
console.log('OVERKILL基盤テスト完了');
