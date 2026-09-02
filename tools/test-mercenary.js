// 傭兵市場（稼いだ金貨の出口）。
//
// 守りたい性質は「金貨を払うとその戦闘だけ頭数が増える」ことと、
// 「傭兵は軍団員ではない」こと（戦功・昇進・欠員・戦没者・給与に入らない）。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

// 出撃直前の状態を作る
const ready = (gold) => {
  Game.newRun();
  const st = Game.state;
  while (st.applicants.length && st.roster.length < 2 && Game.canHire()) Game.hire(0);
  st.openingPrototype = false;
  st.openingDefenseWon = true;
  st.applicants = [];
  Game.prepareMissions(true);
  Game.selectMission(st.missionOffers.findIndex(m => m.missionKind === 'invade'));
  st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
  st.gold = gold;
  return st;
};

// ── 1. 候補と価格 ───────────────────────────────
let st = ready(50);
const offers = Game.mercenaryOffers();
assert(offers.length === Game.MERCENARY_OFFERS, `出撃前に傭兵候補が${Game.MERCENARY_OFFERS}名提示される`);
assert(offers.every(m => m.mercenary === true), '候補には傭兵の印が付く');
assert(JSON.stringify(Game.mercenaryOffers()) === JSON.stringify(offers),
  '候補は作戦ごとに固定される（画面を描くたびに引き直さない）');
assert(Game.mercenaryCost() === Game.MERCENARY_COSTS[0], '1人目の値段は定数どおり');

// ── 2. 雇うと金貨が減り、頭数が増える ─────────────────────
const goldBefore = st.gold;
const hiredName = offers[0].name;
assert(Game.hireMercenary(0) === true, '金貨を払って傭兵を雇える');
assert(st.gold === goldBefore - Game.MERCENARY_COSTS[0], '雇用費を所持金から引く');
assert(st.mercenaries.length === 1 && st.mercenaries[0].name === hiredName, '雇った傭兵を保持する');
assert(Game.mercenaryOffers().length === Game.MERCENARY_OFFERS - 1, '雇った候補は市場から消える');
assert(Game.mercenaryCost() === Game.MERCENARY_COSTS[1], '2人目は値段が上がる');
assert(!st.roster.some(m => m.name === hiredName), '傭兵はロスターに入らない（軍団員ではない）');
assert(!st.activeUids.includes(st.mercenaries[0].uid), '出撃5枠を消費しない');

Game.hireMercenary(0);
assert(st.mercenaries.length === 2, '上限まで雇える');
assert(Game.canHireMercenary(0) === false && Game.mercenaryCost() === Infinity,
  '上限を超えては雇えない');

// ── 3. 金貨が足りなければ雇えない ──────────────────────
const poor = ready(3);
assert(Game.mercenaryCost() > poor.gold && Game.canHireMercenary(0) === false,
  '所持金が足りなければ雇えない');
assert(Game.hireMercenary(0) === false && poor.gold === 3, '雇えない操作で所持金が動かない');

// ── 4. 戦闘に参加し、終われば去る ───────────────────────
st = ready(50);
Game.hireMercenary(0);
const mercName = st.mercenaries[0].name;
const squadBefore = Game.activeRoster().length;
const out = Game.deploy();
assert(out, '出撃できる');
const start = out.result.timeline.find(e => e.type === 'battle_start');
assert(start.player.length === squadBefore + 1, '傭兵が出撃隊の外から加わって戦う');
assert(out.result.contribution.some(c => c.mercenary === true), '戦果に傭兵として出る');
assert(out.result.contribution.filter(c => c.mercenary).length === 1, '傭兵は1名だけ');
assert(Game.state.mercenaries.length === 0 && Game.state.mercenaryOffers.length === 0,
  '戦闘が終われば契約は終了し、次の戦闘は候補から選び直す');
assert(!Game.state.roster.some(m => m.name === mercName), '傭兵は軍団に残らない');

// ── 5. 傭兵は軍団員として数えない ───────────────────────
const casualties = [
  { uid: 9001, name: '傭兵A', race: 'ゴブリン', survived: false, died: true, mercenary: true, dealt: 5, taken: 9, kills: 0 },
  { uid: 9002, name: '正規兵', race: 'オーガ', survived: false, died: true, dealt: 5, taken: 9, kills: 0 }
];
Game.state.roster = [{ uid: 9002, name: '正規兵', race: 'オーガ', tplId: 'ogre', hp: 10, atk: 5, def: 1, spd: 5,
  salary: 3, loyalty: 60, merit: 0, rankId: 'soldier', traits: [], tags: [], department: 'combat' }];
Game.state.activeUids = [9002];
Game.state.fallenTotal = 0;
Game.processCasualties(casualties, []);
assert(Game.state.pendingVacancies === 1, '傭兵の死は欠員に数えない（正規兵1名ぶんだけ）');
assert(Game.state.fallenTotal === 1 && !Game.state.lastFallen.some(f => f.name === '傭兵A'),
  '傭兵は戦没者名簿に載らない');

Game.state.roster = [{ uid: 9003, name: '生存兵', race: 'オーガ', tplId: 'ogre', hp: 10, atk: 5, def: 1, spd: 5,
  salary: 3, loyalty: 60, merit: 0, rankId: 'soldier', traits: [], tags: [], department: 'combat' }];
Game.awardMerit([
  { uid: 9004, name: '傭兵B', survived: true, dealt: 999, taken: 0, kills: 5, mercenary: true },
  { uid: 9003, name: '生存兵', survived: true, dealt: 1, taken: 0, kills: 0 }
], []);
assert(Game.state.roster[0].merit === 1, '傭兵がどれだけ働いても軍団員の戦功計算は変わらない');
assert(Game.state.lastPromotions.length === 0, '傭兵は昇進しない');

// ── 6. 旧セーブの移行 ──────────────────────────────
const legacy = JSON.parse(JSON.stringify(Game.state));
delete legacy.mercenaries;
delete legacy.mercenaryOffers;
Game.state = legacy;
Game.migrateState();
assert(Array.isArray(Game.state.mercenaries) && Game.state.mercenaries.length === 0,
  'フィールドの無い旧セーブを空で移行する');

console.log('傭兵市場テスト完了');
