// V2b: 食事強化の因果（起点・対象・量・対象者の最初の有効打）を戦闘側で追えるか検証する。
// 守りたい性質:
//   1. 既存イベントへの情報追加だけで、新しいイベントを増やさない。
//   2. ダメージ・発火順・回数・chainDepth を1つも変えない（伝票あり/なし、変更前/後の両方で）。
//   3. 伝票が無い戦闘（古いセーブ・opening）では従来どおり何も足さない。
//   4. 対象者が一度も有効打を出さなければ firstHit は null（嘘の着地を作らない）。
//   5. 食欲0の者への強化は現行維持。印だけ残す。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
// 変更前の battle.js（引数で渡す）と比較するため、任意のファイル差し替えで文脈を作れるようにする
function makeCtx(overrides) {
  const store = {};
  const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
    getItem: key => store[key] || null, setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  } };
  vm.createContext(ctx);
  for (const file of files) {
    const src = (overrides && overrides[file]) ? fs.readFileSync(overrides[file], 'utf8') : fs.readFileSync(file, 'utf8');
    vm.runInContext(src, ctx, { filename: file });
  }
  return ctx;
}
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

// 決定的な乱数（同じ入力なら同じ戦闘になる）
const SEED_SRC = 'U.__s = 12345;'
  + 'U.rand = () => { U.__s |= 0; U.__s = (U.__s + 0x6D2B79F5) | 0;'
  + ' let t = Math.imul(U.__s ^ (U.__s >>> 15), 1 | U.__s);'
  + ' t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;'
  + ' return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };'
  + 'U.chance = p => U.rand() < p; U.pick = arr => arr[Math.floor(U.rand() * arr.length)];';

const roster = () => [
  { uid: 1, tplId: 'goblin', race: 'ゴブリン', name: '料理長ミミ', job: '魔界料理人（味見が多い）',
    hp: 40, atk: 8, def: 2, spd: 7, salary: 2, loyalty: 90, traits: ['demon_cook'], tags: [] },
  { uid: 2, tplId: 'ogre', race: 'オーガ', name: '大食いドン', job: '暴れ者',
    hp: 90, atk: 14, def: 4, spd: 4, salary: 7, loyalty: 80, traits: ['big_eater'], tags: [],
    battleDmgMult: 1.5 * 1.24 },
  { uid: 3, tplId: 'orc', race: 'オーク', name: '前衛ガロ', job: '戦士',
    hp: 70, atk: 10, def: 3, spd: 5, salary: 4, loyalty: 80, traits: ['tough_skin'], tags: [] }
];
const enemies = () => [
  { name: '神殿騎士ユーグ', hp: 38, atk: 12, def: 7, spd: 5 },
  { name: '従軍僧リタ', hp: 22, atk: 7, def: 3, spd: 6 }
];
const MEAL = {
  consumed: 3, need: 3, shortage: 0, emptied: false, kitchen: false, kitchenMult: 1,
  cookUid: 1, cookName: '料理長ミミ', targetUid: 2, targetName: '大食いドン', targetAppetite: 3,
  tiedUids: [2], boost: 0.24, boostPercent: 24, targetEatsNothing: false,
  bigEaterMult: 1.25, bigEaters: [{ uid: 2, name: '大食いドン', mult: 1.25 }],
  hungerUid: null, hungerName: null, feast: null
};
const RATIONS = { consumed: 3, need: 3, shortage: 0, emptied: false, kitchen: false,
  cookUid: 1, bigEaterUids: [2], hungerUid: null, feastUid: null };

function run(ctx, rations, overrideRoster) {
  vm.runInContext(SEED_SRC, ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const player = (overrideRoster || roster()).map(m => Battle.makeUnit(m, 'player'));
  const foes = enemies().map(e => Battle.makeUnit(e, 'enemy'));
  return Battle.simulate(player, foes, { rations });
}
// 比較用の指紋: 種別・当事者・ダメージ・生死・連鎖の親と深さ。
// V2bで足した説明用フィールド（targetId / mealBoost / amount など）は**わざと含めない**。
// ここに含めると「変わっていないこと」ではなく「足したこと」を測ってしまう。
const fingerprint = result => result.timeline.map(e =>
  [e.type, e.eventId, e.parentEventId || '', e.chainDepth || '',
   e.fromId || e.sourceId || e.unitId || '', e.toId || '',
   e.dmg === undefined ? '' : e.dmg, e.hp === undefined ? '' : e.hp,
   e.dead ? 'D' : '', e.traitId || '', e.resource || ''].join(':')).join('\n');

const now = makeCtx();

// ── 1. 起点・対象・量が既存イベントに載る ─────────────────
const withMeal = run(now, { ...RATIONS, meal: MEAL });
const cookEvents = withMeal.timeline.filter(e => e.type === 'trait_trigger' && e.traitId === 'demon_cook');
assert(cookEvents.length === 1, '料理人のイベントは1件のまま（新しいイベントを増やしていない）');
const cookEvent = cookEvents[0];
assert(cookEvent.targetId && cookEvent.targetName === '大食いドン',
  '料理人イベントに強化の対象が載る');
assert(cookEvent.amountPercent === 24 && Math.abs(cookEvent.amount - 0.24) < 1e-9,
  '料理人イベントに効果量が載る（文言から推測しない）');
assert(cookEvent.text.includes('大食いドン') && cookEvent.text.includes('+24%'),
  'ログ本文にも誰をどれだけ強化したかが出る');
assert(Array.isArray(cookEvent.tiedIds) && cookEvent.tiedIds.length >= 1,
  '食欲が同値で並んだ者も載る（なぜこの人が受けたかを説明できる）');

// ── 2. 対象者の最初の有効打を追跡できる ────────────────────
const marked = withMeal.timeline.filter(e => e.mealBoost && e.mealBoost.first);
assert(marked.length === 1, '「強化された者の最初の有効打」は1件だけ印が付く');
const hit = marked[0];
assert(hit.fromId === cookEvent.targetId && hit.dmg > 0,
  '印が付くのは強化された本人の、ダメージが出た一撃');
const beforeHit = withMeal.timeline.slice(0, withMeal.timeline.indexOf(hit));
assert(!beforeHit.some(e => (e.type === 'attack' || e.type === 'splash') && e.fromId === hit.fromId && e.dmg > 0),
  'それより前に本人の有効打は無い（本当に「最初」である）');
assert(hit.mealBoost.sourceName === '料理長ミミ' && hit.mealBoost.amountPercent === 24,
  '一撃の側からも起点と効果量が読める');

// ── 3. 導出サマリ ────────────────────────────────
const summary = withMeal.mealSummary;
assert(summary && summary.targetName === '大食いドン' && summary.amountPercent === 24,
  'mealSummary に起点・対象・量が導出される');
assert(summary.firstHit && summary.firstHit.eventId === hit.eventId,
  'mealSummary から最初の有効打のイベントを引ける');

// ── 4. ダメージ・発火順・回数・chainDepth を変えない ──────────
const withoutMeal = run(now, RATIONS);
assert(fingerprint(withMeal) === fingerprint(withoutMeal),
  '伝票あり／なしで、種別・順序・回数・ダメージ・chainDepth が完全に一致する');
assert(withoutMeal.mealSummary === null && !withoutMeal.timeline.some(e => e.mealBoost),
  '伝票が無ければ何も足さない（古いセーブ・開幕戦はそのまま）');
// 変更前の battle.js が手元にあるときだけ、直接つき合わせる。
//   git show <変更前のcommit>:src/core/battle.js > /tmp/battle_old.js
// を用意して BATTLE_BEFORE=/tmp/battle_old.js で走らせる。
const beforePath = process.env.BATTLE_BEFORE;
if (beforePath && fs.existsSync(beforePath)) {
  const oldCtx = makeCtx({ 'src/core/battle.js': beforePath });
  const before = run(oldCtx, { ...RATIONS, meal: MEAL });
  assert(fingerprint(before) === fingerprint(withMeal),
    '変更前の battle.js と比べても、指紋が1文字も違わない');
} else {
  console.log('- 変更前の battle.js との直接比較はスキップ（BATTLE_BEFORE 未指定）');
}

// ── 5. 対象が有効打を出さなければ、着地を捏造しない ───────────
const sleeper = roster();
sleeper[1] = { ...sleeper[1], atk: 1, spd: 1, hp: 5 };     // 先に倒れて攻撃できない想定
const idle = run(now, { ...RATIONS, meal: MEAL }, sleeper);
const idleHits = idle.timeline.filter(e => e.mealBoost);
if (!idleHits.length) {
  assert(idle.mealSummary && idle.mealSummary.firstHit === null,
    '強化された者が有効打を出さなければ firstHit は null（嘘の着地を作らない）');
} else {
  assert(idleHits.length === 1 && idleHits[0].dmg > 0, '有効打があれば1件だけ印が付く');
}

// ── 6. 食欲0への強化は現行維持。印だけ残す ──────────────────
const zeroMeal = { ...MEAL, targetAppetite: 0, targetEatsNothing: true };
const zero = run(now, { ...RATIONS, meal: zeroMeal });
const zeroCook = zero.timeline.find(e => e.type === 'trait_trigger' && e.traitId === 'demon_cook');
assert(zeroCook.targetEatsNothing === true && zeroCook.amountPercent === 24,
  '食欲0の者への強化も従来どおり乗り、印だけを添える（挙動は変えない）');
assert(fingerprint(zero) === fingerprint(withoutMeal), '食欲0の印を足しても戦闘は1つも変わらない');

console.log('\n食事の因果と着地（V2b）: すべて通過');
