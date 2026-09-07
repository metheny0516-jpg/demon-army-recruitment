// KPIのCHAIN観測を「定義バージョン別」に分ける契約の回帰。
//
// chainMax / chainAbilityMax / chainSample は数え方が変わると意味が変わる。
// V1（親を持つ因果イベントを種類を問わず+1段）とV2（同じ実効果を一度だけ数える）を
// 同じ平均・最大・代表値へ混ぜると、どちらの定義でもない数字ができる。
// ここで見るのは「混ざらないこと」と「V1だけの入力では従来と1文字も変わらないこと」。
const fs = require('fs'), vm = require('vm'), os = require('os'), pathMod = require('path');
const { execFileSync } = require('child_process');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js', 'src/data/achievements.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
].filter(f => fs.existsSync(f));
let store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: k => k in store ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
} };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const KPI = vm.runInContext('KPI', ctx), Chain = vm.runInContext('Chain', ctx);
const Game = vm.runInContext('Game', ctx), Battle = vm.runInContext('Battle', ctx);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`✓ ${msg}`); };

// ── 固定の入力 ────────────────────────────────────────
const run = (over) => ({
  gen: 1, demonKingId: 'standard', startedAt: 0, endedAt: 1, cleared: false, conquest: 0,
  battles: 3, buildAttempts: 2, formationChanges: 1, speedChanges: 0, logSkips: 0, reportSkips: 0,
  mercenariesHired: 0, mercenaryGold: 0, kinHires: 0, mergesRefused: 0, paidHires: 0, paidHireGold: 0,
  triggerKinds: { 'trait:greedy': 3, 'facility:graveyard': 1 },
  chainMax: 0, chainAbilityMax: 0, chainSample: null, chainBattles: 3,
  retriesUsed: 0, sessionRun: 1, quickRetry: false, seconds: 600, ...over
});
const v1a = run({ chainDefVersion: 1, chainMax: 8, chainAbilityMax: 4,
  chainSample: { depth: 8, abilities: ['追い剥ぎ', '強欲', '連鎖虐殺', '墓地'] } });
const v1b = run({ chainDefVersion: 1, chainMax: 4, chainAbilityMax: 2,
  chainSample: { depth: 4, abilities: ['強欲', '墓地'] } });
const v2a = run({ chainDefVersion: 2, chainMax: 3, chainAbilityMax: 3,
  chainSample: { depth: 3, abilities: ['追い剥ぎ', '強欲', '墓地'] } });
const v2b = run({ chainDefVersion: 2, chainMax: 2, chainAbilityMax: 1,
  chainSample: { depth: 2, abilities: ['暴食の宴'] } });
// バージョン欠落・不正の旧KPI
const legacy = run({ chainMax: 6, chainAbilityMax: 3,
  chainSample: { depth: 6, abilities: ['強欲', '魂の徴収', '墓地'] } });
delete legacy.chainDefVersion;
const broken = run({ chainDefVersion: 'x', chainMax: 5, chainAbilityMax: 2,
  chainSample: { depth: 5, abilities: ['墓地', '強欲'] } });

// ── 1. 版ごとに分かれる ───────────────────────────────
const onlyV1 = KPI.chainStatsByVersion([v1a, v1b]);
assert(onlyV1.length === 1 && onlyV1[0].defVersion === 1, 'V1のみ → V1の1群だけ');
assert(onlyV1[0].chainMaxMean === 6 && onlyV1[0].chainMaxTop === 8,
  'V1のみ: 平均6・最高8（そのバージョンのランだけから作る）');

const onlyV2 = KPI.chainStatsByVersion([v2a, v2b]);
assert(onlyV2.length === 1 && onlyV2[0].defVersion === 2, 'V2のみ → V2の1群だけ');
assert(onlyV2[0].chainMaxMean === 2.5 && onlyV2[0].chainMaxTop === 3, 'V2のみ: 平均2.5・最高3');

const mix = KPI.chainStatsByVersion([v1a, v2a, v1b, v2b]);
assert(mix.length === 2 && mix[0].defVersion === 1 && mix[1].defVersion === 2,
  '混在 → V1とV2の2群に分かれ、版の昇順で返る');
assert(mix[0].runs === 2 && mix[1].runs === 2, '各群のラン数がそれぞれ数えられている');

// ── 2. 合算されていない ───────────────────────────────
const allMax = [v1a, v2a, v1b, v2b].map(r => r.chainMax);
const combinedMean = allMax.reduce((a, b) => a + b, 0) / allMax.length;   // 4.25
assert(mix[0].chainMaxMean === 6 && mix[1].chainMaxMean === 2.5,
  '混在でも各版の平均はV1のみ/V2のみと同じ値（合算していない）');
assert(mix.every(g => g.chainMaxMean !== combinedMean), '全体平均(4.25)はどこにも現れない');
assert(mix[0].chainMaxTop === 8 && mix[1].chainMaxTop === 3,
  '最大も版ごと。V1の8がV2群の最高値にならない');
assert(mix[1].chainMaxTop !== Math.max(...allMax), '版をまたいだ最高値を作らない');
assert(mix[0].chainAbilityMean === 3 && mix[1].chainAbilityMean === 2,
  '代表CHAINの能力数の平均も版ごと');
// 代表経路も版ごとに選ばれる
assert(mix[0].sample.chainSample.depth === 8 && mix[1].sample.chainSample.depth === 3,
  '代表CHAINは版ごとに選ぶ（V2群がV1の深さ8を代表にしない）');
assert(mix[1].sample.chainSample.abilities.join(',') === '追い剥ぎ,強欲,墓地',
  'V2群の代表経路はV2のランのもの');

// ── 3. バージョン欠落・不正はV1、推定変換しない ─────────
const legacyGroups = KPI.chainStatsByVersion([legacy, broken]);
assert(legacyGroups.length === 1 && legacyGroups[0].defVersion === 1,
  'バージョン欠落・不正な旧KPIはV1として扱う');
assert(legacyGroups[0].chainMaxTop === 6 && legacyGroups[0].chainMaxMean === 5.5,
  '旧KPIの値を推定変換しない（6と5がそのまま入る）');
assert(Chain.versionOf(legacy) === 1 && Chain.versionOf(broken) === 1,
  '版の読み出しは Chain.versionOf に集約されている');
const withLegacy = KPI.chainStatsByVersion([legacy, v2a]);
assert(withLegacy.length === 2 && withLegacy[0].defVersion === 1,
  '旧KPIとV2が混ざれば、旧KPIはV1群として分離される');

// ── 4. ラン開始時に固定した版を battleFinished が維持する ──
store = {};
Game.newRun();
KPI.runStarted(Game.state);
assert(KPI.current.chainDefVersion === 1, 'ラン開始時に記録定義バージョンが固定される');
// ラン途中で切替コミットを跨いだ状況を作る（本体の定数だけ 2 へ動かす）
const savedRecorded = Chain.RECORDED_VERSION;
Chain.RECORDED_VERSION = 2;
KPI.battleFinished({ chainSummary: { maxChain: 5, deepest: null }, timeline: [] });
assert(KPI.current.chainDefVersion === 1,
  'battleFinished はラン開始時の版を維持する（途中で Chain.RECORDED_VERSION が変わっても混ざらない）');
Chain.RECORDED_VERSION = savedRecorded;
const entry = KPI.runEnded(Game.state, { cleared: false });
assert(entry.chainDefVersion === 1, 'ラン終了時のエントリも開始時の版を持つ');
assert(entry.chainMax === 5, '観測値そのものは従来どおり記録される');

// ── 5. ロード・再起・再起動で版が変わらない ────────────
// KPIはラン状態の外にあるので、保存済みエントリは Game 側の操作で書き換わってはいけない。
const before = JSON.stringify(KPI.load().runs.map(r => [r.chainDefVersion, r.chainMax]));
Game.save();
Game.load();
Game.state.checkpoint = null;
Game.saveCheckpoint();
Game.state.retriesLeft = Math.max(1, Game.state.retriesLeft || 0);
Game.state.phase = 'defeat';
assert(Game.canRetry(), '再起できる状態を作れている');
Game.retry();
Game.save();
Game.state = null;
Game.load();                       // 再起動（保存を読み直す）
assert(JSON.stringify(KPI.load().runs.map(r => [r.chainDefVersion, r.chainMax])) === before,
  'ロード・再起・再起動でKPIランの定義バージョンと値が変わらない');

// ── 6. 既存V1 KPIのJSON契約を壊していない ──────────────
const kept = KPI.load().runs[0];
for (const key of ['gen', 'demonKingId', 'startedAt', 'endedAt', 'cleared', 'conquest', 'battles',
  'buildAttempts', 'formationChanges', 'speedChanges', 'logSkips', 'reportSkips', 'mercenariesHired',
  'mercenaryGold', 'kinHires', 'mergesRefused', 'paidHires', 'paidHireGold', 'triggerKinds',
  'chainMax', 'chainAbilityMax', 'chainSample', 'chainBattles', 'retriesUsed', 'sessionRun',
  'quickRetry', 'seconds']) {
  if (!(key in kept)) throw new Error(`既存KPIの鍵が消えている: ${key}`);
}
assert(true, '既存V1 KPIの鍵をひとつも落としていない（変更は加算的）');
assert(KPI.blank().version === 1, 'KPIストアのスキーマ版(version)は据え置き');

// ── 7. レポートの出し分け ─────────────────────────────
const tmp = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'kpi-'));
const write = (name, list) => {
  const file = pathMod.join(tmp, name);
  fs.writeFileSync(file, JSON.stringify({ version: 1, runs: list,
    totals: { runsStarted: list.length, quickRetries: 0, speedChanges: 0, logSkips: 0, reportSkips: 0 },
    lastRunEndedAt: 0, lastScreen: null }));
  return file;
};
const report = file => execFileSync('node', ['tools/kpi-report.js', file], { encoding: 'utf8' });

const outV1 = report(write('v1.json', [v1a, v1b]));
assert(outV1.includes('  最大CHAIN: 平均 6.0（最高 8）'),
  'V1のみ: 従来どおりの見出しと数字（インデントも同じ）');
assert(outV1.includes('  代表CHAINを構成した異なる能力数: 平均 3.0（最高 4）'),
  'V1のみ: 能力数の行も従来どおり');
assert(outV1.includes('  いちばん条件をまたいだ代表CHAIN（第1代 / 深さ8）:'),
  'V1のみ: 代表CHAINの見出しに版を足していない');
assert(!outV1.includes('定義V'), 'V1のみ: 版の見出しを出さない（単一版なら従来の見た目）');
assert(!outV1.includes('混在'), 'V1のみ: 混在警告を出さない');

const outMix = report(write('mix.json', [v1a, v2a, v1b, v2b]));
assert(outMix.includes('定義バージョンが混在している'), '混在: 警告を出す');
assert(outMix.includes('── 定義V1（2ラン）') && outMix.includes('── 定義V2（2ラン）'),
  '混在: 版ごとの見出しとラン数を出す');
assert(outMix.includes('最大CHAIN: 平均 6.0（最高 8）') && outMix.includes('最大CHAIN: 平均 2.5（最高 3）'),
  '混在: 版ごとの平均・最大を出す');
assert(!outMix.includes('平均 4.3') && !outMix.includes('平均 4.2'),
  '混在: 統合した平均CHAIN(4.25)を出さない');
assert((outMix.match(/最大CHAIN: 平均/g) || []).length === 2,
  '混在: 最大CHAINの行は版の数だけ（統合行を足さない）');
assert((outMix.match(/いちばん条件をまたいだ代表CHAIN/g) || []).length === 2,
  '混在: 代表CHAINも版ごとに1本ずつ（統合した代表を出さない）');
assert(outMix.includes('（定義V1）') && outMix.includes('（定義V2）'),
  '混在: どちらの版の代表経路か明示する');
assert((outMix.match(/判定:/g) || []).length >= 2 + 2,
  '混在: CHAINの判定も版ごとに出す（1つの結論へまとめない）');

const outLegacy = report(write('legacy.json', [legacy, broken]));
assert(outLegacy.includes('  最大CHAIN: 平均 5.5（最高 6）'),
  'バージョン欠落の旧KPIだけ: V1の単一版として従来どおり出る');
assert(!outLegacy.includes('定義V'), '旧KPIだけ: 版の見出しを出さない');

const outV2 = report(write('v2.json', [v2a, v2b]));
assert(outV2.includes('  最大CHAIN: 平均 2.5（最高 3）'), 'V2のみ: 単一版として従来の見た目で出る');
assert(!outV2.includes('定義V'), 'V2のみ: 版の見出しを出さない');
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\nOK: KPIのCHAIN観測を定義バージョン別に分離。V1のみの出力と値は不変。');
