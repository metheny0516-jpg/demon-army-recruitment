// 戦闘・建設・生活の配属、資源循環、施設効果をブラウザなしで検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
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
const Aptitude = vm.runInContext('Aptitude', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

Game.newRun();
const st = Game.state;
assert(st.food === 3 && st.materials === 0 && st.facilityLevel === 0, '新規ランの食料・建材・施設初期値');

st.roster = [
  { uid: 1, tplId: 'goblin', name: '戦士', race: 'ゴブリン', job: '兵士', hp: 20, atk: 4, def: 2, spd: 3,
    salary: 4, loyalty: 60, traits: [], tags: [], department: 'combat' },
  { uid: 2, tplId: 'orc', name: '大工', race: 'オーク', job: '建築士', hp: 24, atk: 5, def: 3, spd: 2,
    salary: 5, loyalty: 60, traits: [], tags: [], department: 'construction' },
  { uid: 3, tplId: 'kobold', name: '料理人', race: 'コボルト', job: '料理人', hp: 18, atk: 3, def: 1, spd: 5,
    salary: 3, loyalty: 60, traits: [], tags: [], department: 'life' }
];
st.activeUids = [1];
assert(Game.salaryTotal() === 9, '出撃は満額、建設・生活は半額手当');

// ── 部門適性 ──
// 「何人置いたか」ではなく「誰を置いたか」で数字が変わることを守る。
assert(Aptitude.of(st.roster[1]).material === 3, 'オークは建設適性3（種族ベース）');
assert(Aptitude.of(st.roster[2]).food === 3, 'コボルトは食料適性3（種族ベース）');
assert(Aptitude.of({ tplId: 'ogre', job: '重量物運搬' }).material === 7, '履歴書の前職が適性に乗る（オーガ+重量物運搬）');
assert(Aptitude.of({ tplId: 'skeleton', job: '剣士' }).appetite === 0, 'アンデッドは食事が要らない');
assert(Aptitude.contribution({ tplId: 'orc', job: '解体屋' }, 'life').material === 0,
  '配属先で効く適性だけが働く（生活部門のオークは建材を出さない）');

const output = Game.departmentOutput();
assert(output.food === 3 && output.material === 3, '部門出力は所属者の適性合計');
assert(output.appetite === 4 && Game.foodNeed() === 2, '食料消費は頭数ではなく食う量で決まる');

st.food = 0;
st.materials = 2;
st.buildProgress = 2;
const notes = [];
Game.processDepartments({ foodReward: 0, materialReward: 1 }, notes);
assert(st.food === 1, '調達した食料3から消費2を引いて1が残る');
assert(st.roster.every(m => m.loyalty === 61), '食事が足りると軍団全員の忠誠+1');
assert(st.facilityLevel === 1 && st.buildProgress === 5 && st.materials === 0,
  'オーク1名の施工能力3が建材を投入して仮設兵舎を完成');

const prepared = Game.preparedRoster()[0];
assert(prepared.hp === 21 && prepared.def === 2, '仮設兵舎のHP+5%を出撃時だけ適用');
assert(st.roster[0].hp === 20, '施設効果で保存中の個体値を汚さない');

Game.assignDepartment(1, 'life');
assert(st.activeUids.length === 0 && Game.departmentRoster('life').length === 2, '非戦闘部門へ移すと出撃隊から外れる');
Game.assignDepartment(1, 'combat');
assert(st.activeUids[0] === 1, '戦闘部門へ戻すと空き枠へ自動選抜');

// ── 経理・人事の適性が経営へ接続する ──
const accountant = { uid: 4, tplId: 'goblin', name: '帳簿', race: 'ゴブリン', job: '会計係（どんぶり勘定）',
  hp: 10, atk: 1, def: 1, spd: 1, salary: 4, loyalty: 60, traits: [], tags: [], department: 'combat' };
st.roster.push(accountant);
assert(Game.wageDiscount() === 0, '戦闘部門に置いた会計係は経理をしない');
Game.assignDepartment(4, 'life');
assert(Game.wageDiscount() === 15, '生活部門へ回すと給与総額が15%下がる');

const hr = { uid: 5, tplId: 'necromancer', name: '人事', race: '死霊術師', job: '人事担当（死者）',
  hp: 10, atk: 1, def: 1, spd: 1, salary: 4, loyalty: 60, traits: [], tags: [], department: 'life' };
st.roster.push(hr);
assert(Game.applicantCount() === 4, '人事適性のぶんだけ応募者が増える');

// ── 供養代行：戦死が別部門の資源になる ──
Game.assignDepartment(5, 'construction');
st.pendingVacancies = 2;
st.materials = 0;
st.facilityLevel = 0;
st.buildProgress = 0;
const notes2 = [];
Game.processDepartments({ foodReward: 20, materialReward: 0 }, notes2);
assert((st.lastDepartmentReport.salvage || 0) === 4,
  '建設部門の死霊術師が戦没者2名を建材4へ変える');

delete st.roster[0].department;
Game.migrateState();
assert(st.roster[0].department === 'combat', '旧セーブの所属を戦闘部門へ移行');
