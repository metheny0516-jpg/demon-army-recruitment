// 魔王選択が初期資源・採用枠と魔界史へ反映されることを検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
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

Game.newRun('recruiter');
assert(Game.state.gold === 7 && Game.state.food === 4 && Game.state.hiresLeft === 3,
  '人事魔王は資金を減らして初回採用枠を3名にする');
Game.state.roster = [];
Game.endRun(false);
let record = JSON.parse(store.maou_history)[0];
assert(record.demonKingId === 'recruiter' && record.demonKingName === '人事魔王', '選んだ魔王を魔界史へ残す');

Game.newRun('architect');
assert(Game.state.gold === 6 && Game.state.materials === 5 && Game.state.hiresLeft === 2,
  '築城魔王は資金を建材へ振り替える');
Game.newRun('unknown');
assert(Game.state.demonKingId === 'standard' && Game.state.gold === 10, '不明なIDは標準魔王へ戻す');

Game.state = { roster: [], demonKingId: null };
Game.migrateState();
assert(Game.state.demonKingId === 'standard', '旧セーブは標準魔王として移行する');
console.log('複数魔王テスト完了');
