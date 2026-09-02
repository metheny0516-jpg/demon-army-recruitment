// 既存の戦闘挙動を変えず、タイムラインから因果とCHAINを導出できることを検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/core/util.js', 'src/core/synergy.js', 'src/core/battle.js'
];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => true; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const make = (name, side, overrides) => Battle.makeUnit(Object.assign({
  name, race: side === 'player' ? 'ゴブリン' : '人間', hp: 20, atk: 5, def: 0, spd: 5,
  salary: 1, loyalty: 70, traits: [], tags: [], rankId: 'soldier'
}, overrides || {}), side);

let result = Battle.simulate(
  [make('一撃兵', 'player', { atk: 50, spd: 10 })],
  [make('標的', 'enemy', { hp: 10, atk: 1, spd: 1 })]
);
const attack = result.timeline.find(e => e.type === 'attack');
const death = result.timeline.find(e => e.type === 'death' && e.unitId === attack.toId);
assert(attack.eventId && attack.chainId === attack.eventId && attack.chainDepth === 1,
  '通常攻撃が因果チェーンの起点になる');
assert(death.parentEventId === attack.eventId && death.chainId === attack.chainId && death.chainDepth === 2,
  '撃破による死亡が攻撃の子イベントになる');
assert(result.chainSummary.maxChain === 2 && result.chainSummary.chainCount === 1,
  '結果から最大CHAINとチェーン数を集計する');

result = Battle.simulate(
  [make('火球使い', 'player', { atk: 10, spd: 10, traits: ['fireball'] })],
  [make('前衛', 'enemy', { hp: 100, atk: 1, spd: 1 }), make('後衛', 'enemy', { hp: 100, atk: 1, spd: 1 })]
);
const fireAttack = result.timeline.find(e => e.type === 'attack');
const splash = result.timeline.find(e => e.type === 'splash' && e.label === '火球');
assert(splash.parentEventId === fireAttack.eventId && splash.chainDepth === 2,
  '火球の追撃が元の攻撃へ因果接続する');

result = Battle.simulate(
  [
    make('犠牲者', 'player', { hp: 4, atk: 1, spd: 10 }),
    make('死霊術師', 'player', { hp: 40, atk: 1, spd: 1, traits: ['necromancy'], tags: ['caster'] })
  ],
  [make('処刑人', 'enemy', { hp: 100, atk: 20, spd: 5 })]
);
const victimDeath = result.timeline.find(e => e.type === 'death' && e.unitId === 'p0');
const revive = result.timeline.find(e => e.type === 'revive' && e.unitId === 'p0');
assert(victimDeath && revive && revive.parentEventId === victimDeath.eventId,
  '蘇生が直前の対象死亡へ因果接続する');
assert(revive.chainId === victimDeath.chainId && revive.chainDepth === victimDeath.chainDepth + 1,
  '死亡から蘇生まで同じCHAINを引き継ぐ');

const synthetic = Battle.summarizeChains([
  { eventId: 'a', chainId: 'a', chainDepth: 1 },
  { eventId: 'b', parentEventId: 'a', chainId: 'a', chainDepth: 2 },
  { eventId: 'c', chainId: 'c', chainDepth: 1 },
  { type: 'note' }
]);
assert(synthetic.maxChain === 2 && synthetic.chainCount === 2 && synthetic.eventCount === 3,
  '集計は因果メタデータだけを正本にする');

assert(result.timeline.every(e => e.eventId), 'Battleが生成する全イベントに一意IDがある');
assert(new Set(result.timeline.map(e => e.eventId)).size === result.timeline.length,
  'Battleが生成するイベントIDは戦闘内で重複しない');

console.log('CHAINイベント契約テスト完了');
