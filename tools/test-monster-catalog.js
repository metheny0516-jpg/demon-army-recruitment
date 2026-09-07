// 戦死者を含む採用履歴が、ラン終了後の図鑑用記録へ残ることを検証する。
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
const hired = Game.state.applicants[0];
Game.state.hiresLeft = 1;
Game.hire(0);
assert(Game.state.recruitedTplIds.includes(hired.tplId), '採用時にテンプレートIDを図鑑候補へ登録する');
Game.state.roster = [];
Game.state.activeUids = [];
Game.endRun(false);
const record = JSON.parse(store.maou_history)[0];
assert(record.recruitedTplIds.includes(hired.tplId), '戦死・離反後も採用記録を魔界史へ残す');

Game.state = { roster: [{ tplId: 'slime', department: 'combat', merit: 0 }], recruitedTplIds: null };
Game.migrateState();
assert(Game.state.recruitedTplIds.includes('slime'), '旧セーブは現在の軍団から図鑑候補を補完する');
console.log('魔物採用図鑑テスト完了');
