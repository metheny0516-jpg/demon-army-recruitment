// 撤廃した冒頭3日間へ新規・旧セーブのどちらからも入らないことを検証する。
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

Game.newRun('standard');
const st = Game.state;
assert(st.openingPrototype === false && st.phase === 'recruit', '新規ランは3日間を挟まず採用から始まる');
st.roster = [{ uid: 1, tplId: 'orc', name: '門番', race: 'オーク', job: '門番', hp: 30, atk: 8, def: 4, spd: 3,
  salary: 3, loyalty: 80, traits: [], tags: [], department: 'combat', unpaid: false, unpaidStreak: 0 }];
st.activeUids = [1];
Game.finishRecruitment();
assert(st.phase === 'mission' && st.missionOffers.length === 3,
  '採用終了後は準備日ではなく通常の作戦会議へ直行する');

const legacyOpening = JSON.parse(JSON.stringify(st));
legacyOpening.openingPrototype = true;
legacyOpening.phase = 'preparation';
legacyOpening.day = 2;
legacyOpening.expeditionUsedToday = true;
legacyOpening.openingDefenseWon = false;
Game.state = legacyOpening;
Game.migrateState();
assert(Game.state.openingPrototype === false && Game.state.phase === 'mission',
  '3日間途中の旧セーブを通常の作戦会議へ移行する');
assert(Game.state.roster.length === 1 && Game.state.activeUids[0] === 1,
  '移行時に人材と編成を失わない');
assert(!Game.state.expeditionUsedToday && !Game.state.openingDefenseWon,
  '廃止した日程専用フラグを消す');
console.log('✓ 開幕3日間の撤廃テスト完了');
