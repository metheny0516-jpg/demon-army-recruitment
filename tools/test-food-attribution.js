// V2a: 食事強化の「起点・対象・効果量」が計算側から渡っているかを検証する。
// 守りたい性質:
//   1. 対象は食欲が最大の1体。同値なら出撃順（activeUids）の先頭。
//   2. 予告（Game.mealPlan）と本番（deploy が戦闘へ渡した伝票）が一致する。
//   3. 効果量は実際に掛かった battleDmgMult と一致する（二重適用しない）。
//   4. 伝票を足しても戦闘の発火順・回数は変わらない。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => store[key] || null, setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx), Battle = vm.runInContext('Battle', ctx);
const Aptitude = vm.runInContext('Aptitude', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// race で食欲が決まる（オーガ3 / オーク2 / ゴブリン1 / 骸骨兵0）
const monster = (uid, tplId, race, name, traits) => ({
  uid, tplId, race, name,
  job: traits.includes('demon_cook') ? '魔界料理人（味見が多い）' : '戦士',
  hp: 60, atk: 10, def: 1, spd: 5, salary: 0, loyalty: 90,
  traits: traits.slice(), tags: tplId === 'skeleton' ? ['undead'] : [], unpaid: false,
  department: 'combat', merit: 0, rankId: 'soldier'
});

function setup(roster, food, facilityId) {
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false;
  st.roster = roster.map(m => ({ ...m, traits: m.traits.slice() }));
  st.activeUids = st.roster.map(m => m.uid);
  st.food = food;
  st.gold = 200;
  st.facilityLevel = facilityId ? 1 : 0;
  st.activeFacilityId = facilityId || null;
  st.pendingFacilityChoiceLevel = null;
  st.feastPending = null;
  return st;
}

// ── 1. 対象は食欲が最大の1体 ─────────────────────────
setup([
  monster(1, 'goblin', 'ゴブリン', '料理長', ['demon_cook']),
  monster(2, 'ogre', 'オーガ', '大食い', ['brute']),
  monster(3, 'orc', 'オーク', '並の食欲', ['brute'])
], 12);
let plan = Game.mealPlan(Game.battleRationQuote());
assert(plan.cookUid === 1 && plan.cookName === '料理長', '起点（料理人）が伝票に載る');
assert(plan.targetUid === 2 && plan.targetName === '大食い', '対象は食欲が最大の1体（オーガ）');
assert(plan.targetAppetite === Aptitude.of(Game.state.roster[1]).appetite, '対象の食欲が根拠として載る');
assert(plan.boost > 0 && plan.boostPercent === Math.round(plan.boost * 100), '効果量が数値で載る');

// ── 2. 同値なら出撃順の先頭。並べ替えると対象も入れ替わる ──────
const tie = [
  monster(1, 'goblin', 'ゴブリン', '料理長', ['demon_cook']),
  monster(2, 'ogre', 'オーガ', '甲', ['brute']),
  monster(3, 'ogre', 'オーガ', '乙', ['brute'])
];
setup(tie, 12);
plan = Game.mealPlan(Game.battleRationQuote());
assert(plan.targetUid === 2, '食欲が同値なら出撃順の先頭が受ける');
assert(plan.tiedUids.length === 2 && plan.tiedUids[0] === 2 && plan.tiedUids[1] === 3,
  '同値で並んだ者を伝票に残す（先頭が受ける規則を説明できる）');
const st2 = setup(tie, 12);
st2.activeUids = [1, 3, 2];                       // 乙を先へ
plan = Game.mealPlan(Game.battleRationQuote());
assert(plan.targetUid === 3, '並べ替えると対象も出撃順どおりに入れ替わる');

// 同じ状態で2回呼んでも結果が変わらない（再描画で理由が入れ替わらない）
const again = Game.mealPlan(Game.battleRationQuote());
assert(again.targetUid === plan.targetUid && near(again.boost, plan.boost), '同じ状態なら何度呼んでも同じ伝票');

// ── 3. 効果量は実際に掛かった倍率と一致する（二重適用しない）───
const st3 = setup([
  monster(1, 'goblin', 'ゴブリン', '料理長', ['demon_cook']),
  monster(2, 'ogre', 'オーガ', '大食い', ['brute', 'big_eater'])
], 12);
const quote = Game.battleRationQuote();
plan = Game.mealPlan(quote);
let prepared = Game.preparedRoster(quote, plan);
const target = prepared.find(m => m.uid === plan.targetUid);
assert(near(target.battleDmgMult, (1 + 0.25 * plan.kitchenMult) * (1 + plan.boost)),
  '対象の倍率＝大食漢×食事強化。伝票の効果量とぴったり一致する');
const cookUnit = prepared.find(m => m.uid === 1);
assert(near(cookUnit.battleDmgMult, 1), '料理人自身には食事強化が乗らない（対象は1体だけ）');
// 伝票を渡さずに呼んでも同じ（preparedRoster が内部で同じ関数を読む）
assert(near(Game.preparedRoster(quote).find(m => m.uid === plan.targetUid).battleDmgMult,
  target.battleDmgMult), '伝票を渡しても渡さなくても倍率は同じ（二重計算していない）');

// ── 4. 巨大厨房で効果量が濃くなる ────────────────────
setup([
  monster(1, 'goblin', 'ゴブリン', '料理長', ['demon_cook']),
  monster(2, 'ogre', 'オーガ', '大食い', ['brute'])
], 12, 'grand_kitchen');
const kitchenPlan = Game.mealPlan(Game.battleRationQuote());
assert(kitchenPlan.kitchen && kitchenPlan.kitchenMult === 1 + Game.facilityWorks(),
  '巨大厨房の倍率が伝票に載る');
assert(kitchenPlan.boost > plan.boost, '厨房ありの方が効果量が大きい');

// ── 5. 料理人がいない／消費0なら対象も効果量も無い ──────────
setup([
  monster(1, 'orc', 'オーク', '前衛', ['brute']),
  monster(2, 'ogre', 'オーガ', '大食い', ['brute'])
], 12);
let none = Game.mealPlan(Game.battleRationQuote());
assert(none.cookUid === null && none.targetUid === null && none.boost === 0,
  '料理人がいなければ起点も対象も効果量も無い');
setup([
  monster(1, 'goblin', 'ゴブリン', '料理長', ['demon_cook']),
  monster(2, 'ogre', 'オーガ', '大食い', ['brute'])
], 0);
none = Game.mealPlan(Game.battleRationQuote());
assert(none.consumed === 0 && none.targetUid === null && none.boost === 0,
  '糧食を消費できなければ対象を立てない（0%の強化を誰かに帰属させない）');

// ── 6. 食べない軍団に料理が乗る現行の挙動を、事実として報告する ──
setup([
  monster(1, 'skeleton', '骸骨兵', '骨の料理長', ['demon_cook']),
  monster(2, 'skeleton', '骸骨兵', '骨兵', ['bone'])
], 12);
const undeadPlan = Game.mealPlan(Game.battleRationQuote());
if (undeadPlan.boost > 0) {
  assert(undeadPlan.targetEatsNothing === true && undeadPlan.targetAppetite === 0,
    '食欲0の者へ強化が乗る場合、その事実を伝票に印として残す（挙動は変えない）');
} else {
  assert(undeadPlan.targetUid === null, '食欲0だけの軍団では対象を立てない');
}

// ── 7. deploy が渡した伝票が、予告と一致して戦果にも残る ────────
const st7 = setup([
  monster(1, 'goblin', 'ゴブリン', '料理長', ['demon_cook']),
  monster(2, 'ogre', 'オーガ', '大食い', ['brute', 'big_eater']),
  monster(3, 'orc', 'オーク', '前衛', ['brute'])
], 12);
st7.conquest = 1;
const forecast = Game.mealPlan(Game.battleRationQuote());   // 出撃前に画面が出せる予告
st7.selectedMission = Game.buildMission(vm.runInContext('MISSION_TYPES', ctx).find(m => m.id === 'invade'));
st7.phase = 'formation';
const out = Game.deploy();
const recorded = Game.state.lastBattle.mealPlan;
assert(!!out && !!recorded, '戦果に食事の伝票が残る');
assert(recorded.cookUid === forecast.cookUid && recorded.targetUid === forecast.targetUid
  && near(recorded.boost, forecast.boost),
  '予告（編成画面）と本番（戦闘へ渡した伝票）の起点・対象・効果量が一致する');
assert(recorded.targetUid === 2, '食欲最大のオーガが対象として戦果に残る');

// ── 8. 伝票を足しても戦闘の発火順・回数は変わらない ──────────
const mkUnits = () => [
  Battle.makeUnit({ ...monster(1, 'goblin', 'ゴブリン', '料理長', ['demon_cook']), battleDmgMult: 1 }, 'player'),
  Battle.makeUnit({ ...monster(2, 'ogre', 'オーガ', '大食い', ['brute', 'big_eater']), battleDmgMult: 1.5 }, 'player')
];
const mkEnemies = () => [Battle.makeUnit({ name: '剣士', hp: 40, atk: 6, def: 2, spd: 4 }, 'enemy')];
const baseRations = { consumed: 3, need: 3, shortage: 0, emptied: false, kitchen: false,
  cookUid: 1, bigEaterUids: [2], hungerUid: null, feastUid: null };
const withMeal = { ...baseRations, meal: forecast, boostSourceUid: 1, boostTargetUid: 2, boostAmount: 0.24 };
const types = rations => Battle.simulate(mkUnits(), mkEnemies(), { rations })
  .timeline.map(e => `${e.type}:${e.traitId || e.resource || ''}`).join('|');
assert(types(baseRations) === types(withMeal),
  '伝票フィールドを足しても発火順・回数・種別が1つも変わらない');

console.log('\n食事の帰属（V2a）: すべて通過');
