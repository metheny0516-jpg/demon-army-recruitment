// 無料枠の終了後も、追加紹介か明示終了をプレイヤーが選べることを検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
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
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

Game.newRun('standard');
Game.hire(0); Game.hire(0);
assert(Game.state.phase === 'recruit' && Game.state.hiresLeft === 0 && Game.state.applicants.length >= 3,
  '無料枠を使い切っても次の応募者を見たまま面接に留まる');
assert(Game.hireCost() === 4 && Game.canHireApplicant(0), '最初の追加紹介料は4G');
const before = Game.state.gold;
Game.hire(0);
assert(Game.state.gold === before - 4 && Game.state.extraHiresThisPhase === 1 && Game.hireCost() === 8,
  '追加採用は紹介料を払い、次の料金が8Gへ上がる');
Game.state.gold = 7;
assert(!Game.canHireApplicant(0) && Game.hire(0) === false, '紹介料が足りなければ追加採用できない');
Game.skipHire();
assert(Game.state.phase === 'mission' && Game.state.applicants.length === 0, '明示終了で作戦会議へ進む');

Game.nextRecruit();
assert(Game.state.hiresLeft >= 1 && Game.state.extraHiresThisPhase === 0 && Game.hireCost() === 0,
  '次の面接では無料枠と追加料金段階がリセットされる');
Game.state = { roster: [], applicants: [], hiresLeft: 0, phase: 'recruit' };
Game.migrateState();
assert(Game.state.extraHiresThisPhase === 0 && Game.state.hiresLeft === 0, '旧セーブを追加採用0回として移行する');
console.log('採用主導権テスト完了');
