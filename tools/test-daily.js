// 冒頭3日の日次決算契約をブラウザなしで検証する。
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

Game.newRun('standard');
const st = Game.state;
st.roster = [
  { uid: 1, tplId: 'goblin', name: '兵士', race: 'ゴブリン', job: '兵士', hp: 20, atk: 4, def: 2, spd: 3,
    salary: 3, loyalty: 60, traits: [], tags: [], department: 'combat', unpaid: false, unpaidStreak: 0 },
  { uid: 2, tplId: 'orc', name: '大工', race: 'オーク', job: '建築士', hp: 24, atk: 5, def: 3, spd: 2,
    salary: 3, loyalty: 60, traits: [], tags: [], department: 'construction', unpaid: false, unpaidStreak: 0 },
  { uid: 3, tplId: 'kobold', name: '料理人', race: 'コボルト', job: '料理人', hp: 18, atk: 3, def: 1, spd: 5,
    salary: 3, loyalty: 60, traits: [], tags: [], department: 'life', unpaid: false, unpaidStreak: 0 }
];
st.activeUids = [1];
st.gold = 20; st.food = 3; st.materials = 3;
Game.beginOpeningPreparation();
assert(st.phase === 'preparation', '準備日は戦闘せず開始できる');
const assignments = JSON.stringify(st.roster.map(m => [m.uid, m.department]));
const before = { gold: st.gold, food: st.food, build: st.buildProgress };
assert(Game.advanceDay(1), '1日目を本日の業務終了で進められる');
const once = { gold: st.gold, food: st.food, build: st.buildProgress };
assert(Game.advanceDay(1) === false, '同じ日の二重決算を拒否する');
assert(JSON.stringify(once) === JSON.stringify({ gold: st.gold, food: st.food, build: st.buildProgress }),
  '二重実行拒否時に給与・食料・建設が変化しない');
assert(st.day === 2 && st.phase === 'preparation', '1日目から2日目へ進む');
assert(JSON.stringify(st.roster.map(m => [m.uid, m.department])) === assignments, '配置は翌日に維持される');
assert(Game.advanceDay(2) && st.day === 3, '2日目から3日目へ進む');
assert(Game.advanceDay(3) && st.openingPrototype === false, '3日目の決算後に従来進行へ戻れる');
assert(before.gold - st.gold === 7, '3日分の給与合計は旧1ターン分と一致する');
assert(st.buildProgress === 3, '3日分の建設進行は旧1ターン分と一致する');

const legacy = JSON.parse(JSON.stringify(st));
delete legacy.day; delete legacy.openingPrototype; delete legacy.dailySettledDay; delete legacy.expeditionUsedToday;
Game.state = legacy;
Game.migrateState();
assert(Game.state.day === 1 && Game.state.openingPrototype === false, 'dayのない既存セーブは従来進行として読める');
console.log('✓ 日次進行テスト完了');
