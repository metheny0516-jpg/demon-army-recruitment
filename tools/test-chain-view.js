// 戦果へのV2要約保存（lastBattle.chainView）の回帰。
//
// 承認範囲は「加算保存」だけである（docs/CHAIN_V2_UI_PLAN_2026-09-07.md 第3節A）。
// 表示・maxChain・KPI・倍率・閾値は切り替えない。したがってこのテストは
//   ・保存した代表経路と帰属が、保存→ロードを挟んでも1つも変わらないこと
//   ・再起で「その時点の戦果」へ戻ること
//   ・既存V1の chainSummary が壊れていないこと
//   ・旧セーブから推定生成しないこと
// を見る。経路の中身そのものの契約は tools/chain-audit.js --paths の担当。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js', 'src/data/achievements.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
].filter(f => fs.existsSync(f));
let store = {};
let seed = 12345;
const M = Object.create(Math);
M.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ctx = { console, Math: M, Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx), Chain = vm.runInContext('Chain', ctx);
const Storage = vm.runInContext('Storage', ctx);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`✓ ${msg}`); };

// ── 実際に戦闘を1回通して lastBattle を作る ───────────────
// 経路のある戦果が欲しいので、chainView.deepest が付くまで seed を変えて回す。
const power = m => m.hp + m.atk * 3 + m.def * 2 + m.spd;
function playUntilBattle() {
  const st = Game.state;
  let guard = 0;
  while (st.phase !== 'gameover' && st.phase !== 'clear' && guard++ < 200) {
    while (st.phase === 'recruit' && st.applicants.length) {
      if (st.hiresLeft <= 0 || !Game.canHire()) { Game.skipHire(); break; }
      Game.hire(st.applicants.reduce((b, m, i) => power(m) > power(st.applicants[b]) ? i : b, 0));
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      const best = Game.state.roster.slice()
        .sort((a, b) => power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      st.activeUids = best.map(m => m.uid);
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day);
      else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      const i = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(i >= 0 ? i : 0);
    }
    if (st.phase === 'formation') {
      const best = Game.state.roster.slice()
        .sort((a, b) => power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      st.activeUids = best.map(m => m.uid);
      if (!Game.deploy()) break;
      // 1段だけの経路では「帰属が一致する」の検査にならない。結合と宣言者を含む
      // 2段以上の代表経路が出るまで探す。
      const v = st.lastBattle && st.lastBattle.chainView;
      if (v) seenDepths.push(v.maxDepth || 0);
      if (v && v.deepest && v.deepest.steps.length >= 2
        && v.deepest.steps.some(s => s.declaredBy)) return true;
    }
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'facility') Game.chooseFacility('graveyard');
    if (st.phase === 'event') { st.pendingEvent = null; Game.nextRecruit(); }
    if (st.phase === 'defeat') { if (Game.canRetry()) Game.retry(); else Game.concede(); }
  }
  return false;
}
let found = false;
let seenDepths = [];
for (let attempt = 0; attempt < 80 && !found; attempt++) {
  store = {}; seed = 1000 + attempt * 7919; seenDepths = [];
  Game.newRun();
  found = playUntilBattle();
}
assert(found, '2段以上かつ宣言結合を含む代表経路の戦果を、実際の戦闘から作れた');

const battle = Game.state.lastBattle;
const view = battle.chainView;

// ── 1. 保存する形 ──────────────────────────────────────
assert(view.defVersion === Chain.DEF_VERSION, 'chainView に API出力契約のバージョンが入る');
assert(Number.isFinite(view.maxDepth) && Number.isFinite(view.rawMaxDepth),
  '正規化段数と raw 段数の両方を保存する');
assert(Object.keys(view).sort().join(',') === 'deepest,defVersion,maxDepth,rawMaxDepth',
  '保存するのは defVersion / maxDepth / rawMaxDepth / deepest の4つだけ');
assert(Object.keys(view.deepest).join(',') === 'steps',
  'deepest は steps だけを持つ（pathTo などの関数は保存しない）');
assert(view.deepest.steps.length >= 2, '代表経路の step が2段以上保存されている');
assert(view.deepest.steps.some(s => s.declaredBy),
  '宣言によって起きた step（《能力》による○○）が含まれている');
assert(JSON.stringify(JSON.parse(JSON.stringify(view))) === JSON.stringify(view),
  'chainView は JSON化できる値だけでできている');

// step が timeline なしで再表示できるだけの情報を持つ
const keys = ['stepId', 'depth', 'rawDepth', 'effectKind', 'role', 'actorId', 'actorName',
  'abilityId', 'abilityName', 'declaredBy', 'effect', 'sharedDeclaration', 'eventIds', 'types'];
assert(view.deepest.steps.every(s => keys.every(k => k in s)),
  'step は行為者・宣言者・能力・効果・根拠イベントIDを保持する');
assert(view.deepest.steps.every(s => 'targetId' in s.effect && 'eventId' in s.effect),
  'step の effect は対象と根拠イベントIDを持つ');

// ── 2. 正規化APIの出力と一致している（UIで作り直さない） ──
const direct = Chain.viewOf(battle.timeline || []);
assert(!battle.timeline, '戦果はタイムラインを保存しない（だから要約が要る）');
assert(JSON.stringify(direct) === JSON.stringify(Chain.viewOf([])),
  'タイムラインが無ければ空の要約しか作れない＝ロード後は保存値が唯一の情報源');

// ── 3. 保存 → ロードで代表経路と全帰属が一致 ─────────────
Game.save();
const raw = JSON.parse(store[Storage.SAVE_KEY]);
assert(JSON.stringify(raw.lastBattle.chainView) === JSON.stringify(view),
  '保存された chainView は保存前と完全一致（欠落も丸めも無い）');
Game.state = null;
Game.load();
const loaded = Game.state.lastBattle.chainView;
assert(JSON.stringify(loaded) === JSON.stringify(view),
  'ロード後の chainView が保存前と完全一致');
assert(loaded.deepest.steps.length === view.deepest.steps.length,
  'ロード後も代表経路の段数が一致');
for (let i = 0; i < view.deepest.steps.length; i++) {
  const a = view.deepest.steps[i], b = loaded.deepest.steps[i];
  const same = a.stepId === b.stepId && a.depth === b.depth && a.rawDepth === b.rawDepth
    && a.actorId === b.actorId && a.actorName === b.actorName
    && a.abilityId === b.abilityId && a.abilityName === b.abilityName
    && JSON.stringify(a.declaredBy) === JSON.stringify(b.declaredBy)
    && JSON.stringify(a.effect) === JSON.stringify(b.effect)
    && a.sharedDeclaration === b.sharedDeclaration;
  assert(same, `ロード後も step${i + 1} の全帰属が一致（行為者・宣言者・能力・効果・分岐印）`);
}

// ── 4. raw V1契約を残しつつ、新規ランの記録はV2 ──────────
assert(Game.state.lastBattle.chainSummary
  && Number.isFinite(Game.state.lastBattle.chainSummary.maxChain),
  '既存V1の chainSummary はそのまま残っている');
assert(!('chainView' in Game.state.lastBattle.chainSummary),
  'chainView を chainSummary の中へ入れていない（V1の形を変えない）');
assert(Game.state.chainDefVersion === 2,
  '切替後に始めた新規ランの記録値は V2');
assert(view.defVersion === Game.state.chainDefVersion,
  'API出力契約の版と新規ランの記録版がV2で揃う');
// maxChain はラン通算の最大値。今回の戦果が最深とは限らない（前の戦闘で3段が出ていることがある）。
assert(Game.state.maxChain >= view.maxDepth && Game.state.maxChain === Math.max(...seenDepths),
  '新規V2ランの maxChain は、各戦闘の正規化済み maxDepth のラン通算最大を記録する');

// ── 5. 再起で対応する戦果へ戻る ────────────────────────
// チェックポイント時点の戦果（＝いまの lastBattle）を控え、別の戦果で上書きしてから戻す。
Game.state.checkpoint = null;
Game.saveCheckpoint();
const atCheckpoint = JSON.parse(JSON.stringify(Game.state.lastBattle.chainView));
const marker = { defVersion: 2, maxDepth: 99, rawMaxDepth: 99, deepest: { steps: [] } };
Game.state.lastBattle = { ...Game.state.lastBattle, chainView: marker };
Game.state.retriesLeft = Math.max(1, Game.state.retriesLeft || 0);
Game.state.phase = 'defeat';
assert(Game.canRetry(), '再起できる状態を作れている');
Game.retry();
assert(JSON.stringify(Game.state.lastBattle.chainView) === JSON.stringify(atCheckpoint),
  '再起でチェックポイント時点の戦果（chainView）へ戻る');
assert(Game.state.lastBattle.chainView.maxDepth !== 99,
  '巻き戻した後の戦果に、やり直した歴史の要約が残らない');

// ── 6. 旧セーブから推定生成しない ──────────────────────
const old = JSON.parse(JSON.stringify(Game.state));
delete old.lastBattle.chainView;
delete old.chainDefVersion;
store[Storage.SAVE_KEY] = JSON.stringify(old);
Game.load();
assert(!('chainView' in Game.state.lastBattle),
  'chainView の無い旧セーブに、ロード時に要約を作らない（V1表示へ戻す）');
assert(Game.state.lastBattle.chainSummary
  && Number.isFinite(Game.state.lastBattle.chainSummary.maxChain),
  '旧セーブでもV1の chainSummary はそのまま読める');
assert(Chain.versionOf(Game.state) === 1, 'バージョン不明の旧セーブは V1 として扱う');

// 空・壊れたタイムラインでも落ちない（保存側の安全弁）
const empty = Chain.viewOf([]);
assert(empty.maxDepth === 0 && empty.deepest === null, '経路が無ければ deepest は null');
assert(Chain.viewOf(null).deepest === null, 'タイムラインが無くても落ちない');

console.log('\nOK: 戦果へのV2要約の加算保存。V1の表示・記録・KPI・倍率は不変。');
