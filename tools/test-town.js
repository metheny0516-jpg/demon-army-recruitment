// 城下町の経済（2026-09-12）：税・施設・両替・銀行・差し押さえ・家計簿・効果の差し込み。
//   node tools/test-town.js
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js', 'src/data/town.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/traces.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/town.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx), Town = vm.runInContext('Town', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };

Game.newRun();
const st = Game.state;
assert(st.town && st.town.debt === 0 && Town.lv(st, 'market') === 0, 'newRun で town が空で用意される');
st.conquest = 3; st.act = 1;
assert(Town.taxPerSettle(st) === 6, `税は 領地3 × 2G = 6G（${Town.taxPerSettle(st)}）`);
let notes = []; st.gold = 10; st.turn = 5;
Town.settle(Game, notes, {});
assert(st.gold === 16 && notes.some(n => /税収 \+6G/.test(n)), `決着で税が入る（所持金 ${st.gold}）`);
notes = []; Town.settle(Game, notes, { ransacked: true });
assert(st.gold === 16 && notes.some(n => /荒らされた/.test(n)), '荒らされた決着は税が無い');

// 建設：金と建材。1決着に1件。職業一致で2割引
st.gold = 100; st.materials = 20; st.turn = 6;
const m = Game.rollApplicant('goblin'); m.uid = 1; m.job = '倉庫番'; m.department = 'home'; st.roster = [m]; st.activeUids = [];
const cost = Town.buildCost(Game, 'factory');
assert(cost && cost.discount && cost.gold === 12 && cost.materials === 2, `工場：倉庫番が留守番にいれば 15G→12G（${cost && cost.gold}）`);
assert(Town.build(Game, 'factory') && Town.lv(st, 'factory') === 1 && st.gold === 88 && st.materials === 18, '建てると金と建材が減り Lv1');
assert(!Town.canBuild(Game, 'market').ok && /1決着に1件/.test(Town.canBuild(Game, 'market').why), '同じ決着では2件目は建てられない');
st.turn = 7;
assert(Town.canBuild(Game, 'market').ok && Town.build(Game, 'market'), '次の決着なら建てられる');
assert(Town.taxPerSettle(st) === 9, `市場Lv1で税 +1G/領地 → 9G（${Town.taxPerSettle(st)}）`);
st.gold = 1; st.turn = 8;
assert(!Town.canBuild(Game, 'tavern').ok && /金が足りない/.test(Town.canBuild(Game, 'tavern').why), '金が無ければ建てられず理由が出る');

// 両替：建材2→金3、Lv回まで
st.gold = 0; st.materials = 10; st.turn = 9;
assert(Town.exchangeLeft(st) === 1 && Town.exchange(Game) && st.gold === 3 && st.materials === 8, '工場Lv1：両替1回（建材2→金3）');
assert(!Town.canExchange(st) && !Town.canExchangeBack(st), '同じ決着では2回目はできない（逆向きも）');
st.turn = 12; st.gold = 4; st.materials = 0;
assert(Town.canExchangeBack(st) && Town.exchangeBack(Game) && st.gold === 0 && st.materials === 2, '逆向き：金4→建材2（建材が渋いときの入口）');
assert(!Town.canExchangeBack(st), '金が無ければ逆向きはできない');
st.turn = 9; st.gold = 0; st.materials = 8;

// 銀行：3択・上限50・利子1割・返済
st.gold = 0; st.turn = 10;
assert(Town.canBorrow(st, 20) && Town.borrow(Game, 20) && st.gold === 20 && st.town.debt === 20, '20G 借りる');
assert(!Town.canBorrow(st, 15), '3択以外は借りられない');
assert(Town.borrow(Game, 30) && !Town.canBorrow(st, 10), '合計50で上限');
assert(Town.interest(st) === 5, `利子は残高の1割（${Town.interest(st)}）`);
notes = []; st.conquest = 0; st.gold = 20; Town.settle(Game, notes, {});
assert(st.gold === 15 && notes.some(n => /利子 5G/.test(n)), '決着で利子を払う');
assert(Town.repay(Game, 25) && st.town.debt === 35 && st.gold === 0, `返せる分だけ返す（所持金15 → 15G返済、残高 ${st.town.debt}）`);

// 差し押さえ：払えないと施設が1段落ちる
st.gold = 0; st.turn = 11; notes = [];
Town.settle(Game, notes, {});
assert(Town.lv(st, 'market') === 0 || Town.lv(st, 'factory') === 0, `利子が払えず施設が1段落ちる（${notes.find(n => /差し押さえ/.test(n))}）`);
assert(st.town.ledger.length >= 3 && st.town.ledger[st.town.ledger.length - 1].seized, '家計簿に差し押さえが残る');

// 効果の差し込み：鍛冶場・研究所・宿舎・酒場
st.town.lv.smithy = 2;
assert(Game.spiritRules().max === 5, `鍛冶場Lv2で気合の上限 3→5（${Game.spiritRules().max}）`);
const g = Game.rollApplicant('ogre'); g.uid = 2; g.job = '兵卒'; g.lateBloomer = false;
st.town.lv.lab = 1;
assert(Game.unlockBattlesFor(g, 'species') === 2 && Game.unlockBattlesFor(g, 'order') === 8, `研究所Lv1で種族技 3→2、上位技は据え置き（${Game.unlockBattlesFor(g, 'species')}/${Game.unlockBattlesFor(g, 'order')}）`);
st.town.lv.lab = 3;
assert(Game.unlockBattlesFor(g, 'order') === 6, `研究所Lv3で上位技 8→6（${Game.unlockBattlesFor(g, 'order')}）`);
st.town.lv.hostel = 2;
assert(Game.maxArmy() === Game.MAX_ARMY + 2, `宿舎Lv2で軍団の上限 +2（${Game.maxArmy()}）`);
st.town.lv.tavern = 3;
let cheaper = 0;
for (let i = 0; i < 20; i++) { const a = Game.rollApplicant('goblin'); if (a.salary <= 1) cheaper++; }
assert(cheaper > 0, `酒場Lv3で応募者の希望給与 -2（20人中 ${cheaper} 人が 1G）`);

// 旧セーブ：town が無くても migrateState で用意される
delete st.town;
Game.migrateState();
assert(st.town && typeof st.town.debt === 'number', '旧セーブに town が無ければ migrateState が用意する');
console.log(failed ? `\n失敗 ${failed}` : '\n全通過');
process.exitCode = failed ? 1 : 0;
