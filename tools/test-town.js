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

// 前借り（docs/SPEC_BANK_ADVANCE_2026-09-19.md）。利子は無い。担保の戦功で借りられる口が決まる。
st.gold = 0; st.turn = 10;
const weak = Game.rollApplicant('goblin'); weak.uid = 91; weak.merit = 0;
const strong = Game.rollApplicant('orc'); strong.uid = 92; strong.merit = 30;
st.roster = [weak, strong];
assert(Town.advancesFor(st, weak).map(a => a.id).join(',') === 'small', '戦功0の者を担保にできるのは小口だけ');
assert(Town.advancesFor(st, strong).length === 3, '戦功30なら大口まで借りられる');
assert(!Town.canBorrow(st, 'large', 91), '戦功が足りない担保では大口は借りられない');
assert(Town.borrow(Game, 'small', 91) && st.gold === 15, `小口 15G を受け取る（${st.gold}）`);
assert(st.town.advance.repay === 20 && st.town.advance.settlesLeft === 3, '返す額と期限は契約時に確定する');
assert(!Town.canBorrow(st, 'small', 92), '契約中は次を借りられない');

// 期限：決着ごとに1つ減り、0 で返済。払えなければ run.js が2択を出す印を立てる
notes = []; st.conquest = 0; Town.settle(Game, notes, {});
assert(st.town.advance.settlesLeft === 2 && notes.some(n => /あと2決着/.test(n)), '期限が近づくと催促が出る');
st.gold = 100;
notes = []; Town.settle(Game, notes, {}); notes = []; const out = Town.settle(Game, notes, {});
assert(st.town.advance === null && st.gold === 80 && out.advance.settled === 'repaid',
  `期限に払えれば黙って完済（所持金 ${st.gold}）`);

// 払えないとき：担保の者が連れて行かれ、蔵に借用書が残り、そのランはもう借りられない
st.gold = 0; st.relics = [];
assert(Town.borrow(Game, 'small', 91), '小口をもう一度借りる');
notes = []; Town.settle(Game, notes, {}); notes = []; Town.settle(Game, notes, {});
notes = []; Game.settleAdvance(Town.settle(Game, notes, {}).advance, notes);
assert(st.advancePrompt && st.advancePrompt.kind === 'overdue', '払えないと2択を聞く印が立つ');
const taken = Game.advanceHandOver();
assert(taken && !st.roster.some(m => m.uid === 91), '連れて行かせると名簿から消える');
assert(st.relics.some(r => r.note), '蔵に借用書が残る');
assert(st.town.advance === null && st.town.credit === false, '契約は帳消し、そのランはもう借りられない');
assert(!Town.canBorrow(st, 'small', 92), '踏み倒した後は借りられない');

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
// 工場が無くても金4→建材2 は決着ごと1回（建材0で工場が建てられない詰みを防ぐ、2026-09-13 試遊）
{
  const t = st.town; t.buildings = {}; t.exchangedTurn = null; t.exchanged = 0; st.gold = 10; st.materials = 0; st.turn = (st.turn || 0) + 1;
  assert(Town.lv(st, 'factory') === 0 && Town.exchangeLeft(st) === 0, '工場なし：建材→金は 0 回');
  assert(Town.exchangeLeft(st, 'toMaterials') === 1 && Town.canExchangeBack(st), '工場なし：金→建材は 1 回できる');
  assert(Town.exchangeBack(Game) && st.gold === 6 && st.materials === 2, '行商：金4→建材2');
  assert(!Town.canExchangeBack(st), '同じ決着で 2 回目はできない');
  st.turn += 1;
  assert(Town.canExchangeBack(st), '次の決着でまた 1 回');
}

// ── 統合（2026-09-13、docs/SPEC_TOWN_MERGE_2026-09-13.md）──────────
{
  // 1. 8施設・2つの群
  assert(Town.facilities().length === 8, `施設は8つ（${Town.facilities().length}）`);
  assert(Town.facilitiesOf('town').length === 6 && Town.facilitiesOf('army').length === 2,
    `町6・軍2（${Town.facilitiesOf('town').length}／${Town.facilitiesOf('army').length}）`);
  assert(!Town.facility('extortion_ledger'), '恐喝帳簿は施設ではない（建てられない）');
  assert(!!Town.facility('grand_kitchen') && !!Town.facility('graveyard'), '巨大厨房と墓地がある');

  // 2. 建てれば戦場の options に乗る（2つ同時に持てる）
  Game.newRun();
  const s2 = Game.state;
  Town.init(s2);
  s2.town.lv.grand_kitchen = 2; s2.town.lv.graveyard = 1;
  assert(Game.facilityLv('grand_kitchen') === 2 && Game.facilityLv('graveyard') === 1,
    '2つの施設を同時に持てる');
  const works = Game.facilityWorks();
  assert(works.grand_kitchen === 2 && works.graveyard === 1,
    `facilityWorks は施設ごとの Lv を渡す（${JSON.stringify(works)}）`);

  // 3. 墓地は留守番に死霊術師がいないと働かない
  s2.roster = []; s2.activeUids = [];
  assert(Game.facilityReady('grand_kitchen') === true, '巨大厨房は建てれば働く');
  assert(Game.facilityReady('graveyard') === false, '墓地は死霊術師が城に残っていないと働かない');
  s2.roster = [{ uid: 1, tplId: 'necromancer', name: 'ホネ', race: '死霊術師', job: '墓守',
    hp: 10, atk: 1, def: 1, spd: 1, salary: 1, loyalty: 50, traits: [], tags: [], department: 'home' }];
  s2.activeUids = [];
  Game.syncDepartments();
  assert(Game.facilityReady('graveyard') === true, '留守番に死霊術師がいれば墓地が働く');

  // 4. demolishOne：一番 Lv が高いもの、同点なら値段が高いもの
  Town.init(s2);
  s2.town.lv = { market: 2, graveyard: 2, tavern: 1, smithy: 0, lab: 0, hostel: 0, factory: 0, grand_kitchen: 0 };
  const lost = Town.demolishOne(s2);
  assert(lost && lost.id === 'graveyard' && lost.from === 2 && lost.to === 1,
    `同点なら値段が高い方が落ちる（${lost && lost.id}）`);
  s2.town.lv = { market: 0, tavern: 0, smithy: 0, lab: 0, hostel: 0, factory: 0, grand_kitchen: 0, graveyard: 0 };
  assert(Town.demolishOne(s2) === null, '何も建っていなければ落とすものが無い（null）');

  // 5. 旧セーブの移行：巨大厨房はそのまま、帳簿は建材で返る
  Game.newRun();
  const s3 = Game.state;
  s3.facilityLevel = 2; s3.activeFacilityId = 'grand_kitchen'; s3.buildProgress = 7;
  const beforeMat = s3.materials || 0;
  Game.migrateState();
  assert(Town.level(s3, 'grand_kitchen') === 2, `巨大厨房は同じ Lv で城下町へ（${Town.level(s3, 'grand_kitchen')}）`);
  assert(s3.materials === beforeMat + 3, `建てかけは建材で返る（半分・上限6：${s3.materials - beforeMat}）`);
  assert(s3.facilityLevel === undefined && s3.activeFacilityId === undefined && s3.buildProgress === undefined,
    '旧3欄は消える');
  Game.newRun();
  const s4 = Game.state;
  s4.facilityLevel = 3; s4.activeFacilityId = 'extortion_ledger';
  const mat4 = s4.materials || 0;
  Game.migrateState();
  assert(Town.level(s4, 'extortion_ledger') === 0 || !Town.facility('extortion_ledger'), '帳簿は城下町に写らない');
  assert(s4.materials === mat4 + 9, `帳簿は Lv×3 の建材で返る（+${s4.materials - mat4}）`);
  assert((s4.lastFacilityMigration || []).some(l => /帳簿/.test(l)), '日誌に一行残る');

}

// ── 生んだもの（docs/SPEC_FACILITY_DETAIL_2026-09-13.md §2）──
// 施設ごとに数字1本と、建てた日・増築の日。旧セーブは空のまま。
{
  Game.newRun();
  const s6 = Game.state;
  s6.turn = 4; s6.gold = 200; s6.materials = 60; s6.conquest = 3; s6.act = 1;
  Town.build(Game, 'market');
  const market = Town.statOf(s6, 'market');
  assert(market.built === 4 && market.upgraded.length === 0, `建てた日が残る（第${market.built}決着）`);
  s6.turn = 9;
  Town.build(Game, 'market');
  assert(Town.statOf(s6, 'market').upgraded[0] === 9, `増築の日が残る（${JSON.stringify(Town.statOf(s6, 'market').upgraded)}）`);

  // 市場が生んだもの＝市場が無ければ入らなかった上乗せ分だけ（税の総額ではない）
  s6.turn = 10;
  const before = Town.statOf(s6, 'market').value;
  Town.settle(Game, [], {});
  const gained = Town.statOf(s6, 'market').value - before;
  assert(gained === 3 * Town.lv(s6, 'market'), `市場は上乗せ分だけ数える（領地3 × Lv${Town.lv(s6, 'market')} ＝ ${gained}）`);

  // 荒らされた決着は税が入らないので、market も増えない（無かったものは数えない）
  const kept = Town.statOf(s6, 'market').value;
  s6.turn = 11;
  Town.settle(Game, [], { ransacked: true });
  assert(Town.statOf(s6, 'market').value === kept, `荒らされた決着では増えない（${Town.statOf(s6, 'market').value}）`);

  // 旧セーブ（stats が無い）は空で用意され、表示側が読んでも壊れない
  delete s6.town.stats;
  Town.init(s6);
  assert(JSON.stringify(s6.town.stats) === '{}' && Town.statOf(s6, 'lab').value === 0,
    '旧セーブは空から数え始める');
}

console.log(failed ? `\n失敗 ${failed}` : '\n全通過');
process.exitCode = failed ? 1 : 0;
