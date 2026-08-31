// 軍団20体・出撃隊5体の状態契約をブラウザなしで検証する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/events.js',
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

Game.newRun();
const st = Game.state;
st.roster = Array.from({ length: 10 }, (_, i) => ({
  uid: i + 1, name: `兵${i + 1}`, race: 'ゴブリン', job: '兵士', hp: 10, atk: 3, def: 1, spd: 2,
  salary: 3, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false
}));
st.activeUids = [1, 2, 3, 4, 5];
st.maxArmySize = 10;

assert(Game.MAX_ARMY === 20 && Game.MAX_DEPLOY === 5, '軍団20体・出撃5体の上限');
assert(Game.activeRoster().length === 5, '出撃隊だけを抽出');
assert(Game.salaryTotal() === 15, '給与は出撃5体分だけで控えは0G');
st.gold = 100;
Game.paySalaries([]);
assert(st.roster.find(m => m.uid === 1).loyalty === 72 && st.roster.find(m => m.uid === 6).loyalty === 70,
  '給与支払いと忠誠上昇は出撃隊だけが対象');
assert(!Game.toggleDeploy(6), '満員の出撃隊へ6体目を追加できない');
Game.toggleDeploy(5);
assert(Game.toggleDeploy(6) && Game.activeRoster().map(m => m.uid).join(',') === '1,2,3,4,6', '控えとの入れ替え');
Game.processCasualties([{ uid: 2, name: '兵2', race: 'ゴブリン', survived: false }], []);
assert(!st.roster.some(m => m.uid === 2) && !st.activeUids.includes(2), '戦死者を軍団と出撃隊の両方から除外');
st.phase = 'mission';
assert(Game.backToRecruit() && st.phase === 'recruit', '作戦会議から面接・軍団確認へ戻れる');
st.phase = 'formation';
st.selectedMission = { missionKind: 'invade' };
assert(Game.backToMissions() && st.phase === 'mission' && st.selectedMission === null, '編成から作戦会議へ戻れる');
