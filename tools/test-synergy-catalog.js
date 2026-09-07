// 実戦で発動したシナジーだけが魔界史用記録へ残ることを検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

Game.newRun();
Game.recordDiscoveredSynergies({ timeline: [
  { type: 'synergy', id: 'goblin_horde' },
  { type: 'synergy', id: 'goblin_horde' },
  { type: 'note', id: 'arcane_circle' },
  { type: 'synergy', id: 'not_real' }
] });
assert(Game.state.discoveredSynergyIds.length === 1 && Game.state.discoveredSynergyIds[0] === 'goblin_horde',
  '実際の synergy イベントだけを重複なく登録する');
Game.state.roster = [];
Game.endRun(false);
const record = JSON.parse(store.maou_history)[0];
assert(record.discoveredSynergyIds[0] === 'goblin_horde', '発見済みシナジーを魔界史へ保存する');

Game.state = { roster: [], discoveredSynergyIds: null };
Game.migrateState();
assert(Array.isArray(Game.state.discoveredSynergyIds), '旧セーブへ空の発見記録を補う');
console.log('シナジー図鑑テスト完了');
