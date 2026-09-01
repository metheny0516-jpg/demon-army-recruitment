// 殿堂入り保存と、能力を引き継がない再応募をブラウザなしで検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/run.js'
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
const U = vm.runInContext('U', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const member = (over) => Object.assign({
  uid: 1, tplId: 'goblin', name: '古参グルグ', race: 'ゴブリン', job: '斥候',
  hp: 30, atk: 8, def: 3, spd: 8, salary: 2, loyalty: 60,
  traits: [], tags: [], quote: 'また雇ってくださいよ。',
  prevJob: '前魔王軍の斥候', motive: '魔界史にもう一度名を残したい', flaw: '昔話が長い',
  unpaid: false, department: 'combat', merit: 18, rankId: 'demon_lord'
}, over || {});

Game.newRun();
Game.state.roster = [member(), member({ uid: 2, name: '怪力ボゴ', merit: 18, hp: 99, atk: 20 })];
Game.state.activeUids = [1, 2];
Game.endRun(false);
let history = JSON.parse(store.maou_history);
assert(history[0].hallOfFame.name === '怪力ボゴ', '戦功同点なら戦力が高い生存者を殿堂入りに選ぶ');
assert(history[0].hallOfFame.generation === 1, '出身世代を魔界史へ保存する');
assert(history[0].hallOfFame.hp === undefined && history[0].hallOfFame.atk === undefined,
  '殿堂入り記録へ能力値を保存しない');

const chance = U.chance;
U.chance = () => true;
Game.newRun();
U.chance = chance;
const returning = Game.state.applicants.find(m => m.legacy);
assert(returning && returning.name === '怪力ボゴ', '過去の殿堂入り人材が同じ名前で再応募する');
assert(returning.prevJob === '前魔王軍の斥候' && returning.legacy.generation === 1,
  '履歴書と出身世代を引き継ぐ');
assert(returning.merit === 0 && returning.rankId === 'soldier', '戦功と階級は新任としてリセットする');
assert(returning.hp !== 99 || returning.atk !== 20, '過去の能力値は引き継がない');
Game.genApplicants();
assert(!Game.state.applicants.some(m => m.legacy), '同じランで再応募者を何度も出さない');

console.log('殿堂入りテスト完了');
