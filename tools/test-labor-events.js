// 連続未払いが給与抗議を経てストライキ行進へ連鎖するか。
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
const EVENTS = vm.runInContext('EVENTS', ctx);
const event = id => EVENTS.find(e => e.id === id);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const unit = over => Object.assign({
  uid: 1, tplId: 'goblin', name: '未払太郎', race: 'ゴブリン', job: '会計係（どんぶり勘定）',
  hp: 20, atk: 5, def: 2, spd: 4, salary: 4, loyalty: 60, traits: [], tags: [],
  department: 'combat', unpaid: true, unpaidStreak: 2, merit: 0, rankId: 'soldier'
}, over || {});

function reset() {
  Game.newRun();
  const st = Game.state;
  st.roster = [unit(), unit({ uid: 2, name: '同僚', job: '雑用', unpaidStreak: 1 })];
  st.activeUids = [1, 2];
  st.gold = 20;
  st.pendingEvent = null;
  st.eventOutcome = null;
  st.laborDispute = null;
  return st;
}

function resolve(id, optionIndex) {
  const ev = event(id);
  const cast = ev.cast(Game.state);
  Game.state.pendingEvent = { id, cast, text: ev.text(Game.state, Game.resolveCast(cast)) };
  Game.state.phase = 'event';
  assert(Game.chooseEvent(optionIndex), `${id} を解決できる`);
}

for (const id of ['wage_protest', 'strike_march']) {
  assert(!!event(id), `${id} が登録されている`);
  assert(event(id).options.length === 3, `${id} に3つの異なる解決策がある`);
}

{
  const st = reset();
  assert(event('wage_protest').check(st), '未払い2回で給与抗議が候補になる');
  assert(event('wage_protest').cast(st).actor === 1, '未払いが最長の人材が代表になる');
  assert(!event('wage_demand').check(st), '深刻な未払い時は通常の賃上げ要求と重複しない');
  resolve('wage_protest', 2);
  assert(st.laborDispute && st.laborDispute.stage === 'march', '要求を無視すると後続の行進を予約する');
  assert(event('strike_march').check(st), '予約後はストライキ行進が候補になる');
  const salary = st.roster[0].salary;
  resolve('strike_march', 1);
  assert(st.laborDispute === null, '行進を解決するとチェーン状態を消す');
  assert(st.roster[0].department === 'life' && !st.activeUids.includes(1), '代表を生活部門へ異動できる');
  assert(st.roster[0].salary === salary + 1 && st.roster[0].loyalty === 80,
    '労務担当への任命は将来給与と忠誠へ返る');
}

{
  const st = reset();
  resolve('wage_protest', 2);
  resolve('strike_march', 0);
  assert(st.gold === 12 && st.roster.every(m => !m.unpaid && m.unpaidStreak === 0),
    '8Gの緊急支給で軍団全体の未払いを解消する');
}

{
  const st = reset();
  delete st.laborDispute;
  Game.migrateState();
  assert(st.laborDispute === null, '旧セーブには労使紛争なしを補う');
}

console.log('✓ 給与抗議 → ストライキ行進が、支払い・将来給与・配属・忠誠へ接続');
