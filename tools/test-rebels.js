// 魔界の反乱軍は魔物の姿（2026-09-14）：鎮圧の敵は数値は段階表のまま、tplId/race/icon だけ REBEL_LOOKS に差し替わる。
//   node tools/test-rebels.js
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js', 'src/data/town.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/town.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const MISSION_TYPES = vm.runInContext('MISSION_TYPES', ctx);
const REBEL_LOOKS = vm.runInContext('REBEL_LOOKS', ctx);
const ENEMY_STAGES = vm.runInContext('ENEMY_STAGES', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const type = id => MISSION_TYPES.find(t => t.id === id);

Game.newRun();
Game.state.conquest = 2;
const sup = Game.buildMission(type('suppress'));
const leaderIds = REBEL_LOOKS.leaders.map(l => l.tplId), gruntIds = REBEL_LOOKS.grunts.map(g => g.tplId);
assert(sup.units.length >= 2, `鎮圧の敵が ${sup.units.length} 体`);
assert(leaderIds.includes(sup.units[0].tplId) && sup.units[0].rebel, `先頭は首謀者の姿（${sup.units[0].tplId}・${sup.units[0].name}）`);
assert(sup.units.slice(1).every(u => gruntIds.includes(u.tplId)), `残りは初期種族の雑魚（${sup.units.slice(1).map(u => u.tplId).join(',')}）`);
assert(sup.units.every(u => u.race && u.icon && !/🗡|🏹|🛡️|🪨/.test(u.icon)), '種族名と魔物の絵文字が入り、人間の武器アイコンは残らない');
assert(sup.units.every(u => u.role), '役（role）はそのまま残る');
const inv = Game.buildMission(type('invade'));
assert(inv.units.every(u => !u.rebel && !leaderIds.concat(gruntIds).includes(u.tplId)), '進軍（王国）の敵は人間のまま');
const raid = Game.buildMission(type('raid'));
assert(raid.units.every(u => !u.rebel), '略奪の敵も変えない');
console.log(failed ? `\n失敗 ${failed}` : '\n全通過');
process.exitCode = failed ? 1 : 0;
