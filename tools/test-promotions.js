// 戦功・三段階昇進・将軍シナジーをブラウザなしで検証する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/departments.js','src/data/events.js',
  'src/core/util.js','src/core/storage.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const Battle = vm.runInContext('Battle', ctx);
const Synergy = vm.runInContext('Synergy', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

Game.newRun();
const veteran = {
  uid: 99, tplId: 'goblin', name: '古参グルグ', race: 'ゴブリン', job: '盗賊',
  hp: 30, atk: 8, def: 3, spd: 8, salary: 2, loyalty: 60,
  traits: [], tags: [], unpaid: false, merit: 0, rankId: 'soldier'
};
Game.state.roster = [veteran];
Game.state.activeUids = [veteran.uid];
const contribution = [{ uid: veteran.uid, name: veteran.name, dealt: 20, taken: 10, kills: 0, survived: true }];
const notes = [];

Game.awardMerit(contribution, notes);
Game.awardMerit(contribution, notes);
assert(veteran.merit === 6 && veteran.rankId === 'squad_leader', '戦功4以上で小隊長へ昇進');
Game.awardMerit(contribution, notes);
Game.awardMerit(contribution, notes);
assert(veteran.merit === 12 && veteran.rankId === 'demon_lord', '戦功10以上で魔将へ昇進');
Game.awardMerit(contribution, notes);
Game.awardMerit(contribution, notes);
Game.awardMerit(contribution, notes);
Game.awardMerit(contribution, notes);
assert(veteran.merit === 24 && veteran.rankId === 'general', '戦功22で将軍へ昇進');
assert(Game.state.generalsMade[0].name === veteran.name, '輩出した将軍を魔界史用に記録');

const units = [Battle.makeUnit(veteran, 'player'), Battle.makeUnit({ ...veteran, uid: 100, name: '部下', rankId: 'soldier', salary: 1 }, 'player')];
const active = Synergy.applyAll(units);
assert(active.some(s => s.id === 'general_command'), '将軍の号令が発動');
assert(units.every(unit => Math.abs(unit.mods.dmgMult - 1.15) < 0.001), '号令で出撃隊全員の与ダメージ+15%');
