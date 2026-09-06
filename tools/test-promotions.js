// 戦功・三段階昇進・将軍シナジーをブラウザなしで検証する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/departments.js','src/data/events.js','src/data/demon_kings.js',
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

// ここから先は「将軍の号令」単体の検査。他のシナジーが混ざると、
// 1.15 という期待値が何の効果なのか分からなくなる（低賃金大量採用や
// ゴブリン軍団が乗れば倍率は簡単に変わる）。そこで、
//   1) 将軍がいない同じ編成では何も発動しないこと
//   2) 将軍を入れると発動するのが general_command **だけ** であること
// を先に固定してから倍率を見る。無関係なシナジーが増えたら 2) で落ちる。
const squadOf = general => [
  Battle.makeUnit({ ...veteran, rankId: general ? 'general' : 'soldier' }, 'player'),
  Battle.makeUnit({ ...veteran, uid: 100, name: '部下', rankId: 'soldier', salary: 1 }, 'player')
];

const plainSquad = squadOf(false);
const plainActive = Synergy.applyAll(plainSquad);
assert(plainActive.length === 0,
  `将軍がいなければ何も発動しない（実際: ${plainActive.map(s => s.id).join(',') || 'なし'}）`);
assert(plainSquad.every(unit => Math.abs(unit.mods.dmgMult - 1) < 0.001), '号令なしの与ダメージは等倍');

const units = squadOf(true);
const active = Synergy.applyAll(units);
assert(active.length === 1 && active[0].id === 'general_command',
  `将軍の号令だけが発動（実際: ${active.map(s => s.id).join(',') || 'なし'}）`);
assert(units.every(unit => Math.abs(unit.mods.dmgMult - 1.15) < 0.001), '号令で出撃隊全員の与ダメージ+15%');
assert(units.length === 2 && units.filter(u => u.rankId === 'general').length === 1,
  '将軍本人だけでなく部下にも乗る');
