// 戦闘・建設・生活の配属、資源循環、施設効果をブラウザなしで検証する。
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

Game.newRun();
const st = Game.state;
assert(st.food === 3 && st.materials === 0 && st.facilityLevel === 0, '新規ランの食料・建材・施設初期値');

st.roster = [
  { uid: 1, name: '戦士', race: 'ゴブリン', job: '兵士', hp: 20, atk: 4, def: 2, spd: 3,
    salary: 4, loyalty: 60, traits: [], tags: [], department: 'combat' },
  { uid: 2, name: '大工', race: 'オーク', job: '建築士', hp: 24, atk: 5, def: 3, spd: 2,
    salary: 5, loyalty: 60, traits: [], tags: [], department: 'construction' },
  { uid: 3, name: '料理人', race: 'コボルト', job: '料理人', hp: 18, atk: 3, def: 1, spd: 5,
    salary: 3, loyalty: 60, traits: [], tags: [], department: 'life' }
];
st.activeUids = [1];
assert(Game.salaryTotal() === 9, '出撃は満額、建設・生活は半額手当');

st.food = 0;
st.materials = 2;
st.buildProgress = 2;
const notes = [];
Game.processDepartments({ foodReward: 0, materialReward: 1 }, notes);
assert(st.food === 1, '生活1名が食料2を調達し、3名分の食料1を消費');
assert(st.roster.every(m => m.loyalty === 61), '食事が足りると軍団全員の忠誠+1');
assert(st.facilityLevel === 1 && st.buildProgress === 3 && st.materials === 2, '建設1名が建材を投入して仮設兵舎を完成');

const prepared = Game.preparedRoster()[0];
assert(prepared.hp === 21 && prepared.def === 2, '仮設兵舎のHP+5%を出撃時だけ適用');
assert(st.roster[0].hp === 20, '施設効果で保存中の個体値を汚さない');

Game.assignDepartment(1, 'life');
assert(st.activeUids.length === 0 && Game.departmentRoster('life').length === 2, '非戦闘部門へ移すと出撃隊から外れる');
Game.assignDepartment(1, 'combat');
assert(st.activeUids[0] === 1, '戦闘部門へ戻すと空き枠へ自動選抜');

delete st.roster[0].department;
Game.migrateState();
assert(st.roster[0].department === 'combat', '旧セーブの所属を戦闘部門へ移行');
