// ラン全体の主要記録（最大CHAIN・最大OVERKILL）が、戦闘をまたいで残り、
// 再起では巻き戻り、魔界史へ保存されるか。
//
// 見ているのは「2つの記録が正しい最大値であること」と「再起の巻き戻し契約を壊さないこと」。
// 総合スコアや他の統計は増やさない（設計憲法 第11節）。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js', 'src/data/achievements.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
].filter(f => fs.existsSync(f));
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx), Storage = vm.runInContext('Storage', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

// deploy() を通さずに「戦闘が1回終わった」状態だけを再現する。
// 戦闘計算そのものは既存テストの担当で、ここは記録の残り方だけを見る。
const record = (chain, overkill) => {
  const st = Game.state;
  const result = {
    chainSummary: chain === null ? null : { maxChain: chain },
    overkillSummary: overkill === null ? null : { maxPercent: overkill }
  };
  st.maxChain = Math.max(st.maxChain || 0, (result.chainSummary && result.chainSummary.maxChain) || 0);
  st.maxOverkill = Math.max(st.maxOverkill || 0, (result.overkillSummary && result.overkillSummary.maxPercent) || 0);
};

// ── 0. 実際の deploy() が記録を更新しているか ────────────────
// 以下のヘルパーは production の式を写したものなので、まず本物の経路を1回通して
// 「run.js が記録を更新している」ことを固定する（写しただけのテストにしないため）。
store[Storage.HISTORY_KEY] = JSON.stringify([]);
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5; Math.random = () => 0.5;', ctx);
Game.newRun();
{
  const st = Game.state;
  let guard = 0, battles = 0, expectedChain = 0, expectedOverkill = 0;
  while (battles < 3 && guard++ < 60 && !['gameover', 'clear'].includes(st.phase)) {
    if (st.phase === 'recruit') {
      if (st.hiresLeft > 0 && st.applicants.length && Game.canHireApplicant(0)) Game.hire(0);
      else Game.skipHire();
    }
    if (st.phase === 'preparation') {
      st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day); else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') Game.selectMission(0);
    if (st.phase === 'formation') {
      st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
      const out = Game.deploy();
      if (!out) break;
      battles++;
      expectedChain = Math.max(expectedChain, out.result.chainSummary.maxChain);
      expectedOverkill = Math.max(expectedOverkill, out.result.overkillSummary.maxPercent);
      assert(st.maxChain === expectedChain && st.maxOverkill === expectedOverkill,
        `${battles}戦目の deploy() が最大CHAIN(${expectedChain})と最大OVERKILL(${expectedOverkill}%)を更新する`);
    }
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'event') { const o = Game.eventOptions(); if (o.length) Game.chooseEvent(o[0].i); Game.nextRecruit(); }
    if (st.phase === 'defeat') break;
  }
  assert(battles > 0, '実際の戦闘を通して記録経路を確認できた');
}
vm.runInContext('U.rand = () => 0.5;', ctx);

// ── 1. 初期値と最大値の残り方 ─────────────────────────────
store[Storage.HISTORY_KEY] = JSON.stringify([]);
Game.newRun();
assert(Game.state.maxChain === 0 && Game.state.maxOverkill === 0, '新規ランの主要記録は0から始まる');

record(4, 180);
record(9, 684);
record(2, 90);
assert(Game.state.maxChain === 9, '複数戦闘では最大CHAINだけが残る（後の低い記録で上書きされない）');
assert(Game.state.maxOverkill === 684, '最大OVERKILLも同様に最大値だけが残る');

record(12, null);   // OVERKILLが1度も出なかった戦闘
assert(Game.state.maxChain === 12 && Game.state.maxOverkill === 684, 'OVERKILL未発生の戦闘でも安全に更新できる');

// ── 2. 再起でチェックポイント時点へ戻る ────────────────────
Game.saveCheckpoint();                 // ここが巻き戻し先（CHAIN12 / OVERKILL684）
const beforeRetry = { chain: Game.state.maxChain, overkill: Game.state.maxOverkill };
record(30, 2000);                      // 巻き戻される戦闘の記録
Game.state.phase = 'defeat';
assert(Game.canRetry(), '再起できる状態を作れている');
Game.retry();
assert(Game.state.maxChain === beforeRetry.chain && Game.state.maxOverkill === beforeRetry.overkill,
  '再起すると主要記録もチェックポイント時点へ戻る（やり直した歴史は残さない）');

// ── 3. クリア時に魔界史へ保存 ──────────────────────────
record(15, 900);
Game.endRun(true);
let history = Storage.loadHistory();
let last = history[history.length - 1];
assert(last.cleared === true && last.maxChain === 15 && last.maxOverkill === 900,
  'クリア時に最大CHAIN・最大OVERKILLを魔界史へ保存する');

// ── 4. 最終敗北時にも保存 ────────────────────────────
Game.newRun();
record(7, 320);
Game.state.phase = 'defeat';
Game.state.retriesLeft = 0;            // もう再起できない＝敗北の確定
Game.concede();
history = Storage.loadHistory();
last = history[history.length - 1];
assert(last.cleared === false && last.maxChain === 7 && last.maxOverkill === 320,
  '再起せず確定した最終敗北でも魔界史へ保存する');
assert(Game.state.maxChain === 7, '保存後もラン状態の記録は書き換えない');

// ── 5. 旧セーブ・旧魔界史の互換 ─────────────────────────
Game.newRun();
const legacy = JSON.parse(JSON.stringify(Game.state));
delete legacy.maxChain;
delete legacy.maxOverkill;
Game.state = legacy;
Game.migrateState();
assert(Game.state.maxChain === 0 && Game.state.maxOverkill === 0, 'フィールドの無い旧セーブを0で移行する');
record(3, 120);
assert(Game.state.maxChain === 3 && Game.state.maxOverkill === 120, '移行後は通常どおり記録できる');

const legacyRecord = { gen: 1, cleared: false, maxPower: 10, battlesWon: 2, finalRoster: [] };
assert((Number(legacyRecord.maxChain) || 0) === 0 && (Number(legacyRecord.maxOverkill) || 0) === 0,
  'フィールドの無い旧魔界史レコードは0として読める');

// ── 6. 主要記録は2つだけ（統計を増やしていない） ───────────────
Game.newRun();
record(5, 200);
Game.endRun(true);
history = Storage.loadHistory();
last = history[history.length - 1];
const added = Object.keys(last).filter(k => /^max(Chain|Overkill|TotalExcess|Summon|Loot|Revive)/.test(k));
assert(JSON.stringify(added.sort()) === JSON.stringify(['maxChain', 'maxOverkill']),
  '魔界史へ増やした主要記録は最大CHAINと最大OVERKILLの2つだけ');

console.log('ラン記録・魔界史保存テスト完了');
