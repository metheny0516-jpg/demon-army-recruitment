// 施設Jokerの「いま発火できるか」（Game.facilityReadiness / facilityChoices）。
//
// 見ているのは文言ではなく契約:
// 判定が deploy() の発火条件（帳簿＝会計職の出撃者／厨房＝大食漢か料理人の出撃者／
// 墓地＝建設部門の死霊術師）と同じ規則で決まり、配置を変えると同じ入口で結果が変わること。
// 選択画面と sim はここを読むので、「発火可能」と表示して実戦で発火しない、が起きない。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

Game.newRun();
const st = Game.state;
let seq = 1;
const add = (over, department) => {
  const m = { uid: seq++, tplId: 'test', name: `試験${seq}`, race: '試験魔族', job: '', hp: 10, atk: 1, def: 0, spd: 5,
    salary: 1, loyalty: 100, traits: [], tags: [], department: department || 'combat', ...over };
  st.roster.push(m);
  if (m.department === 'combat') st.activeUids.push(m.uid);
  return m;
};
st.roster = []; st.activeUids = [];

// ── 1. 空の軍団では3施設とも不足で、不足の中身が配置指示になっている ──
let choices = Game.facilityChoices();
assert(choices.length === 3 && choices.every(f => !f.readiness.ready && f.readiness.count === 0),
  '誰も居なければ3施設とも発火不可');
assert(choices.every(f => f.readiness.text.startsWith('不足：') && f.readiness.need),
  '不足時は「誰をどこへ置くか」を返す');

// ── 2. 帳簿：会計職は出撃していないと数えない ──
const clerk = add({ job: '会計係（どんぶり勘定）' });
assert(Game.facilityReadiness('extortion_ledger').ready, '会計職を出撃隊に置くと帳簿が発火可能');
Game.assignDepartment(clerk.uid, 'life');
assert(!Game.facilityReadiness('extortion_ledger').ready, '同じ会計職でも生活部門へ移すと帳簿は不足に戻る');

// ── 3. 厨房：大食漢と料理人を合算し、出撃者だけを数える ──
add({ traits: ['big_eater'] });
add({ traits: ['demon_cook'] });
const kitchen = Game.facilityReadiness('grand_kitchen');
assert(kitchen.ready && kitchen.count === 2, '大食漢と魔界料理人の出撃者を合わせて数える');
add({ traits: ['big_eater'] }, 'construction');
assert(Game.facilityReadiness('grand_kitchen').count === 2, '建設部門の大食漢は厨房の頭数に入らない');

// ── 4. 墓地：死霊術師は出撃ではなく建設部門に居るときだけ ──
const necro = add({ tplId: 'necromancer' });
assert(!Game.facilityReadiness('graveyard').ready, '出撃隊の死霊術師では墓地は発火しない');
Game.assignDepartment(necro.uid, 'construction');
assert(Game.facilityReadiness('graveyard').ready, '死霊術師を建設部門へ移すと墓地が発火可能');

// ── 5. 判定は deploy() が Battle に渡す条件と同じである（規則の二重化を防ぐ） ──
st.activeFacilityId = 'graveyard';
st.facilityLevel = 1;
vm.runInContext(`
  var __passed = [];
  var __original = Battle.simulate;
  Battle.simulate = function (p, e, options) { __passed.push(options); return __original.call(Battle, p, e, options); };
`, ctx);
st.phase = 'formation';
Game.deploy();
vm.runInContext('Battle.simulate = __original;', ctx);
const passed = vm.runInContext('__passed', ctx);
assert(passed.length === 1 && passed[0].graveyard === true
  && passed[0].graveyard === Game.facilityReadiness('graveyard').ready,
  'deploy() が Battle へ渡す墓地条件は facilityReadiness と一致する');

// ── 6. 知らない施設IDは静かに不可 ──
const unknown = Game.facilityReadiness('nope');
assert(!unknown.ready && unknown.count === 0, '未知の施設IDは発火不可として返す');

console.log('all facility readiness tests passed');
