// 出撃前の給与方針が、支払い・忠誠・未払い状態へ正しく接続することを検証する。
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
const Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

function setup() {
  Game.newRun();
  const st = Game.state;
  st.phase = 'formation';
  st.roster = [
    { uid: 1, tplId: 'orc', name: '前衛', race: 'オーク', job: '兵士', hp: 20, atk: 5, def: 2, spd: 2,
      salary: 4, loyalty: 60, traits: ['rage_unpaid'], tags: [], department: 'combat', unpaid: true, unpaidStreak: 1 },
    { uid: 2, tplId: 'kobold', name: '炊事', race: 'コボルト', job: '料理人', hp: 15, atk: 2, def: 1, spd: 4,
      salary: 4, loyalty: 60, traits: [], tags: [], department: 'life', unpaid: true, unpaidStreak: 1 }
  ];
  st.activeUids = [1];
  st.payrollPolicy = 'regular';
  st.payrollChoices = { regular: 0, withhold: 0, advance: 0 };
  return st;
}

let st = setup();
assert(Game.salaryTotal() === 6, '通常給与4G＋生活手当2Gを集計');
assert(Game.payrollQuote('advance').cost === 9, '厚遇費は通常額の1.5倍を切り上げ');
assert(!Game.setPayrollPolicy('invalid') && Game.setPayrollPolicy('advance'), '編成中だけ有効な給与方針を選べる');

st.gold = 8;
const before = JSON.stringify(st.roster);
assert(!Game.preparePayrollForBattle([]), '資金不足では厚遇出撃を拒否');
assert(st.gold === 8 && JSON.stringify(st.roster) === before && st.payrollChoices.advance === 0,
  '拒否された厚遇は資金・人材・選択回数を汚さない');

st.gold = 20;
const advanceNotes = [];
assert(Game.preparePayrollForBattle(advanceNotes), '資金があれば厚遇を確定できる');
assert(st.gold === 11 && st.roster.every(m => !m.unpaid && m.unpaidStreak === 0 && m.loyalty === 68),
  '厚遇は出撃前に9G払い、未払い解消・忠誠+8');
Game.paySalaries(advanceNotes);
assert(st.gold === 11, '厚遇は勝利後に二重払いしない');

st = setup();
st.gold = 20;
Game.setPayrollPolicy('withhold');
const withholdNotes = [];
assert(Game.preparePayrollForBattle(withholdNotes), '意図的未払いを確定できる');
assert(st.roster.every(m => m.unpaid && m.loyalty === 60), '未払い状態は戦闘前から立つが忠誠精算は勝利後');
assert(Battle.makeUnit(st.roster[0], 'player').unpaid, '未払いが戦闘ユニットへ渡る');
Game.paySalaries(withholdNotes);
assert(st.gold === 20 && st.roster.every(m => m.loyalty === 30 && m.unpaidStreak === 2),
  '連続未払いは支出0Gで忠誠-30');
assert(st.lastPayrollReport.policyId === 'withhold' && st.lastPayrollReport.paid === 0,
  '勤務報告に意図的未払いを記録');

st = setup();
st.gold = 100;
st.roster.forEach(m => { m.unpaid = true; m.unpaidStreak = 2; });
const regularNotes = [];
assert(Game.preparePayrollForBattle(regularNotes), '通常支給を確定できる');
assert(st.roster.every(m => m.unpaid), '通常支給は勝利前の未払いを先に消さない');
Game.paySalaries(regularNotes);
assert(st.gold === 94 && st.roster.every(m => !m.unpaid && m.unpaidStreak === 0 && m.loyalty === 62),
  '通常支給は勝利後に支払い、未払いを解消して忠誠+2');

delete st.payrollPolicy;
delete st.payrollChoices;
Game.migrateState();
assert(st.payrollPolicy === 'regular' && st.payrollChoices.regular === 0,
  '旧セーブへ通常支給の既定値を補う');
