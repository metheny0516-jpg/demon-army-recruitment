// 正規化API（src/core/chain.js）と、CHAIN定義バージョンの保存を固定する。
//
// 新規ランの表示・記録・KPIはV2。既存V1ランはV1のまま継続する。
// 倍率は保存版に従い、新規V2ランだけV2へ切り替える。演出閾値・ハプニング条件と
// Battle.summarizeChains() はraw V1を維持する。
//
// 経路の中身・分岐・行為者の区別・未実行の予告は tools/chain-audit.js --paths が
// 同じ src/core/chain.js に対して assert する（そちらが契約の本体）。
// ここでは本体へ組み込んだ状態での不変性とバージョン保存を見る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js', 'src/data/achievements.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
].filter(f => fs.existsSync(f));
let store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx), Battle = vm.runInContext('Battle', ctx);
const Chain = vm.runInContext('Chain', ctx), Storage = vm.runInContext('Storage', ctx);
const KPI = vm.runInContext('KPI', ctx);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`✓ ${msg}`); };

// ── 1. バージョンの意味 ────────────────────────────────
assert(Chain.DEF_VERSION === 2, 'APIの出力契約バージョンは 2');
assert(Chain.RECORDED_VERSION === 2,
  '新規ランが実際に記録するCHAIN値のバージョンは 2');
assert(Chain.RECORDED_VERSION === Chain.DEF_VERSION,
  'APIの契約版と新規ランの記録版がV2で揃う');

// バージョン不明は V1。推定変換をしない
assert(Chain.versionOf(null) === 1, 'バージョン不明（null）は V1 として扱う');
assert(Chain.versionOf({}) === 1, 'バージョン欠落の旧データは V1 として扱う');
assert(Chain.versionOf({ chainDefVersion: 2 }) === 2, '明示された版はそのまま読む');
assert(Chain.versionOf({ chainDefVersion: 'x' }) === 1, '壊れた版の値は V1 へ落とす');

// ── 2. 実戦タイムラインでのAPIの形 ─────────────────────
const foes = stage => ENEMY(stage).units.map((u, j) => Battle.makeUnit({
  ...u, uid: 900 + j, name: u.name || '敵', maxHp: u.hp, traits: u.traits || [], tags: u.tags || []
}, 'enemy'));
const ENEMY = stage => vm.runInContext('ENEMY_STAGES', ctx)[Math.min(
  vm.runInContext('ENEMY_STAGES', ctx).length - 1, Math.max(0, stage))];

// 乱数は種で固定する。以前はここが素の Math.random で、CHAIN 3段へ届くかが運任せだった。
// そのため「V2倍率が実際に発火する戦闘を検証している」が8回に3〜4回落ちていた。
// 落ちる原因はゲーム側ではなくテストの作り方なので、こちらを直す。
//
// ただし種を1つ決め打ちにはしない。バランスが動けばその種でも届かなくなり、同じ形で腐る。
// **倍率が発火する戦闘に当たるまで種を引き直し**、当たらなかったときだけ落とす。
// こうすると「倍率が一度も発火しなくなった」という本物の異常だけがこのテストを赤くする。
const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hasMultiplier = f => f.timeline.some(e => (e.traits || []).some(t => String(t).startsWith('CHAIN ')));
const SEED_TRIES = 60;
let fight = null, usedSeed = -1;
for (let seed = 1; seed <= SEED_TRIES && !fight; seed++) {
  ctx.Math.random = seeded(seed * 7919);
  vm.runInContext('U.rand = Math.random;', ctx);
  Game.newRun();
  const squad = ['goblin', 'ogre', 'skeleton', 'necromancer', 'orc']
    .map(id => Battle.makeUnit(Game.rollApplicant(id), 'player'));
  const trial = Battle.simulate(squad, foes(4),
    { graveyard: true, extortionLedger: true, facilityWorks: 2, chainDefVersion: 2 });
  if (hasMultiplier(trial)) { fight = trial; usedSeed = seed; }
}
assert(fight !== null,
  `CHAIN倍率が発火する戦闘が ${SEED_TRIES} 通りの種の中に存在する（倍率が死んでいない）`);
console.log(`  （倍率が発火する戦闘: 種 ${usedSeed}／${SEED_TRIES}通り目までで確定・以後この戦闘で検証する）`);

const before = JSON.stringify(fight.timeline);
const sum = Chain.summarize(fight.timeline);
assert(JSON.stringify(fight.timeline) === before,
  'Chain.summarize() はタイムラインを書き換えない（読むだけ）');

assert(sum.defVersion === Chain.DEF_VERSION, '出力に定義バージョンが乗る');
assert(Number.isFinite(sum.maxDepth) && Number.isFinite(sum.rawMaxDepth),
  '正規化段数と raw 段数の両方を返す');
assert(sum.rawMaxDepth >= sum.maxDepth, 'raw 段数は正規化段数以上（結合で減ることはあっても増えない）');
assert(Array.isArray(sum.events) && sum.events.every(e => Array.isArray(e.stepIds)),
  'イベント別の所属（stepIds）を全イベントが持つ');
assert(Array.isArray(sum.chains) && sum.chains.every(c => Number.isFinite(c.maxDepth) && Number.isFinite(c.rawMaxDepth)),
  'チェーン別に正規化段数と raw 段数を持つ');
assert(typeof sum.pathTo === 'function', '任意のイベントで終わる代表経路を取り出せる');

const deep = sum.deepest;
assert(deep && Array.isArray(deep.steps) && deep.steps.length > 0, '結合後の代表経路を返す');
const stepKeys = ['stepId', 'depth', 'rawDepth', 'effectKind', 'role',
  'actorId', 'actorName', 'abilityId', 'abilityName', 'declaredBy', 'effect', 'sharedDeclaration'];
assert(deep.steps.every(s => stepKeys.every(k => k in s)),
  'step は UI用の行為者・宣言者・能力・効果情報を持つ');
assert(deep.steps.every(s => 'targetId' in s.effect && 'targetName' in s.effect),
  'step の effect は対象を持つ（UIが text を解析しなくてよい）');
assert(deep.steps.every(s => !('text' in s)), 'step は表示文字列を持たない（UIが組み立てる）');

// ── 3. 生の因果グラフを変更していない ──────────────────
const raws = fight.timeline.filter(e => e.eventId && (e.parentEventId || e.chainId));
assert(raws.length > 0 && raws.every(e => Number.isFinite(e.chainDepth)),
  'raw の parentEventId / chainId / chainDepth はそのまま残っている');
const byId = new Map(sum.events.map(e => [e.eventId, e]));
assert(raws.every(e => {
  const got = byId.get(e.eventId);
  return got && got.rawDepth >= 1 && got.parentEventId === (e.parentEventId || null);
}), '正規化は raw の親子関係を保ったまま別の値として並記する');
assert(raws.every(e => e.v2Depth === byId.get(e.eventId).depth),
  'productionの逐次V2段数は正規化APIの後読み結果と全イベントで一致する');

// ── 4. 既存のV1契約が変わっていない ────────────────────
const v1 = Battle.summarizeChains(fight.timeline);
assert(v1.maxChain === fight.timeline.reduce((m, e) => Math.max(m, e.chainDepth || 0), 0),
  'Battle.summarizeChains() は従来どおり raw の chainDepth の最大値を返す（V1のまま）');
assert(fight.chainSummary.maxChain === v1.maxChain,
  '戦闘結果の chainSummary.maxChain はV1の値を返し続ける');
assert(v1.deepest === null || v1.deepest.depth === v1.maxChain,
  '既存の代表経路契約（deepest.depth === maxChain）を壊していない');
assert(v1.maxChain !== sum.maxDepth || v1.maxChain === 0,
  'V1の maxChain と 正規化の maxDepth は別の値として共存する（片方に寄せていない）');
assert(!('defVersion' in v1) && !('maxDepth' in v1),
  '既存の chainSummary に新しい鍵を足していない（表示側の契約は不変）');

// 新規V2ランの倍率タグは、正規化した逐次段数で出る。
const tagged = fight.timeline.filter(e => (e.traits || []).some(t => String(t).startsWith('CHAIN ')));
assert(tagged.length > 0, 'V2倍率が実際に発火する戦闘を検証している');
assert(tagged.every(e => (e.traits || []).some(t => t === `CHAIN ${e.v2Depth} ×${
  (e.v2Depth === 3 ? 1.25 : Math.min(2.5, 1.75 + (e.v2Depth - 4) * .25)).toFixed(2)}`)),
  '新規ランの倍率タグは逐次V2段数で付いている');

// ── 5. 定義バージョンの保存 ────────────────────────────
// 新規ラン
store = {}; Game.newRun();
assert(Game.state.chainDefVersion === 2, '新規ランの保存バージョンは V2（いま記録している値と一致）');

// 途中ラン（保存 → 読み直し）
Game.state.maxChain = 7;
Game.save();
assert(JSON.parse(store[Storage.SAVE_KEY]).chainDefVersion === 2, '途中ランの保存にバージョンが入る');
Game.load();
assert(Game.state.chainDefVersion === 2 && Game.state.maxChain === 7,
  'ロードしてもバージョンは変化しない');

// 再起（チェックポイント巻き戻し）でも変化しない
const beforeRetry = Game.state.chainDefVersion;
Game.state.checkpoint = JSON.parse(JSON.stringify(Game.state));
Game.state.retriesLeft = Math.max(1, Game.state.retriesLeft || 0);
Game.state.phase = 'defeat';
assert(Game.canRetry(), '再起できる状態を作れている（この assert が本当に再起を通す保証）');
Game.retry();
assert(Game.state.chainDefVersion === beforeRetry, '再起しても保存バージョンは変化しない');

// 保存 → 別セッションで読み直し（再起動）
Game.save();
const saved = JSON.parse(store[Storage.SAVE_KEY]);
Game.state = null;
Game.load();
assert(Game.state.chainDefVersion === saved.chainDefVersion,
  '再起動（保存を読み直す）でも保存バージョンは変化しない');

// バージョン不明の旧セーブ
const old = JSON.parse(JSON.stringify(saved));
delete old.chainDefVersion;
old.maxChain = 9;
store[Storage.SAVE_KEY] = JSON.stringify(old);
Game.load();
assert(Game.state.chainDefVersion === 1, 'バージョン不明の旧セーブは V1 として扱う');
assert(Game.state.maxChain === 9, '旧セーブの maxChain を推定変換しない（値はそのまま）');

// 魔界史のレコード
store = {}; Game.newRun();
Game.state.maxChain = 5;
Game.endRun(false);
const history = Storage.loadHistory();
assert(history.length === 1 && history[0].chainDefVersion === 2,
  '魔界史のレコードに記録時のバージョンが入る');
assert(history[0].maxChain === 5, '魔界史の maxChain はそのまま（変換しない）');
assert(Chain.versionOf({ maxChain: 3 }) === 1, 'バージョン欠落の旧魔界史は V1 として扱う');

// KPI
const kpi = KPI.load();
const entry = (kpi.runs || [])[kpi.runs.length - 1];
assert(entry && entry.chainDefVersion === 2, 'KPIのランにも記録時のバージョンが入る');
assert(Chain.versionOf({ chainMax: 4 }) === 1, 'バージョン欠落の旧KPIは V1 として扱う');

console.log('\nOK: 新規ランはV2、既存V1はV1。倍率・戦闘結果のraw契約は不変。');
