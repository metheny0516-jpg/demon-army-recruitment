// KPI測定契約（GAME_DESIGN_PRINCIPLES.md 第14節）。
//
// 見ているのは「行動が記録されること」と「記録がゲーム進行へ一切影響しないこと」。
// 特にビルド試行は「同じ編成の連戦を数えない」という性質そのものを測る。
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
const Game = vm.runInContext('Game', ctx), KPI = vm.runInContext('KPI', ctx),
  Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

// 時計を手で進められるようにする（60秒判定を実時間で待たないため）
let clock = 1000000;
KPI.now = () => clock;

// ── 1. ラン開始とセッション内ラン数 ───────────────────────
KPI.reset();
Game.newRun();
assert(KPI.current && KPI.current.buildAttempts === 0, 'ラン開始でカウンタが用意される');
assert(KPI.current.sessionRun === 1, 'セッション内ラン数を数える');
assert(KPI.current.quickRetry === false, '最初のランは「60秒以内の再挑戦」ではない');

// ── 2. ビルド試行は「前戦から変わった戦闘」だけ ────────────────
const st = Game.state;
while (st.applicants.length && st.roster.length < 3 && Game.canHire()) Game.hire(0);
st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
const stage = { missionKind: 'invade' };
assert(KPI.battleStarted(st, stage) === true, '初戦は必ずビルド試行として数える');
assert(KPI.battleStarted(st, stage) === false, '同じ編成の連戦は試行に数えない');
assert(KPI.current.battles === 2 && KPI.current.buildAttempts === 1, '戦闘数と試行数を別に持つ');

st.facilityLevel = 1;
assert(KPI.battleStarted(st, stage) === true, '施設が変われば新しい試行');
st.payrollPolicy = 'withhold';
assert(KPI.battleStarted(st, stage) === true, '狙う資源状態（給与方針）が変われば新しい試行');
assert(KPI.battleStarted(st, { missionKind: 'raid' }) === true, '作戦（狙う資源）が変われば新しい試行');
const moved = st.activeUids.slice();
if (moved.length >= 2) {
  st.activeUids = [moved[1], moved[0], ...moved.slice(2)];
  assert(KPI.battleStarted(st, { missionKind: 'raid' }) === true, '並び順が変われば新しい試行');
}
// 合体するかどうかも「今回の仮説」に含める
st.kingSlimeMerge = false;
assert(KPI.battleStarted(st, { missionKind: 'raid' }) === true, '合体するかどうかの判断も試行');

const target = st.roster[0];
const traitsBefore = target.traits.slice();
target.traits = [...traitsBefore, 'pickpocket'];
assert(KPI.battleStarted(st, { missionKind: 'raid' }) === true, '特性が変われば新しい試行');
target.traits = traitsBefore;

// ── 2b. 実際の deploy() が試行を記録しているか ──────────────
// 上の判定は KPI 側の性質。ここで production の呼び出し経路そのものを固定する
// （run.js のフックを外すとこのアサーションが落ちる）。
{
  KPI.reset();
  Game.newRun();
  const run = Game.state;
  let guard = 0;
  while (run.phase !== 'formation' && run.phase !== 'preparation' && guard++ < 20) {
    if (run.phase === 'recruit') { if (run.applicants.length && Game.canHire()) Game.hire(0); else Game.skipHire(); }
    if (run.phase === 'preparation') break;
    if (run.phase === 'mission') Game.selectMission(0);
  }
  if (run.phase === 'preparation') {
    run.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
    if (run.day < Game.OPENING_DAYS) Game.advanceDay(run.day); else Game.prepareOpeningBattle('invade');
  }
  const before = KPI.current.buildAttempts;
  const out = Game.deploy();
  assert(out && KPI.current.buildAttempts === before + 1 && KPI.current.battles >= 1,
    '実際の deploy() がビルド試行として記録される');
}
KPI.reset();
Game.newRun();
{
  const run = Game.state;
  while (run.hiresLeft > 0 && run.applicants.length && run.roster.length < 3 && Game.canHire()) Game.hire(0);
  run.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
  KPI.battleStarted(run, { missionKind: 'invade' });
  KPI.battleStarted(run, { missionKind: 'invade' });
}

// ── 3. 編成変更・テンポ操作 ─────────────────────────
const now = Game.state;
const changesBefore = KPI.current.formationChanges;
Game.toggleDeploy(now.roster[0].uid);
Game.toggleDeploy(now.roster[0].uid);
assert(KPI.current.formationChanges === changesBefore + 2, '出撃隊の入れ替えを編成変更として数える');
Game.assignDepartment(now.roster[0].uid, 'life');
assert(KPI.current.formationChanges === changesBefore + 3, '部門配属の変更も編成変更として数える');

// 金貨の出口が使われたかも残す
KPI.mergeRefused();
KPI.paidHire(4); KPI.paidHire(8);
assert(KPI.current.paidHires === 2 && KPI.current.paidHireGold === 12,
  '有料追加採用の人数と紹介料を記録する');
assert(KPI.current.mergesRefused === 1, '合体を断った回数を数える（既定を覆す判断）');

// ── 3b. シナジー観測（異なる条件がどれだけ繋がったか） ─────────
// 手組みのタイムラインを渡し、「発火したトリガー種類」と
// 「代表CHAINを構成した異なる能力数」が因果メタデータだけから導出されることを固定する。
{
  const timeline = [
    { eventId: 'e1', type: 'attack', chainId: 'e1', chainDepth: 1 },
    { eventId: 'e2', type: 'overkill', parentEventId: 'e1', chainId: 'e1', chainDepth: 2, percent: 140, rank: 'OVERKILL' },
    { eventId: 'e3', type: 'trait_trigger', traitId: 'chain_massacre', name: '連鎖虐殺',
      parentEventId: 'e2', chainId: 'e1', chainDepth: 3 },
    { eventId: 'e4', type: 'splash', label: '連鎖虐殺', parentEventId: 'e3', chainId: 'e1', chainDepth: 4 },
    { eventId: 'e5', type: 'death', parentEventId: 'e4', chainId: 'e1', chainDepth: 5 },
    { eventId: 'e6', type: 'facility_trigger', facilityId: 'graveyard', name: '墓地',
      parentEventId: 'e5', chainId: 'e1', chainDepth: 6 },
    { eventId: 'e7', type: 'summon', parentEventId: 'e6', chainId: 'e1', chainDepth: 7 },
    // 連鎖に参加していない単発攻撃は「繋がった」とは数えない
    { eventId: 'e8', type: 'attack' }
  ];
  const result = { timeline, chainSummary: Battle.summarizeChains(timeline) };
  const seen = KPI.battleFinished(result);
  assert(KPI.current.chainMax === 7, '最大CHAIN（深さ）を記録する');
  assert(seen.abilities.join('→') === 'OVERKILL→連鎖虐殺→死→墓地→召喚',
    `代表CHAINを能力の並びとして残す（${seen.abilities.join('→')}）`);
  assert(KPI.current.chainAbilityMax === 5,
    '代表CHAINを構成した異なる能力数を数える（特性とその追撃は1つ／起点の通常攻撃は数えない）');
  const kinds = Object.keys(KPI.current.triggerKinds);
  assert(kinds.includes('trait:chain_massacre') && kinds.includes('facility:graveyard'),
    '特性と施設を別の種類として数える');
  assert(!kinds.includes('event:attack'), '連鎖の起点でない単発攻撃はトリガー種類に数えない');
  assert(KPI.current.triggerKinds['event:overkill'] === 1, '種類ごとの発火回数を持つ');

  // 同じ能力が何段続いても「1種類」。深さではなく接続の種類数を見るため
  const flat = [{ eventId: 'f1', type: 'attack', chainId: 'f1', chainDepth: 1 }];
  for (let i = 2; i <= 9; i++) {
    flat.push({ eventId: `f${i}`, type: 'trait_trigger', traitId: 'chain_massacre', name: '連鎖虐殺',
      parentEventId: `f${i - 1}`, chainId: 'f1', chainDepth: i });
  }
  const flatSeen = KPI.battleFinished({ timeline: flat, chainSummary: Battle.summarizeChains(flat) });
  assert(flatSeen.abilities.join('→') === '連鎖虐殺',
    '同じ能力が続くだけの連鎖は種類として増えない（深さと別物）');
  assert(KPI.current.chainMax === 9, 'より深い連鎖なら最大CHAINは伸びる');
  assert(KPI.current.chainAbilityMax === 5, '代表CHAINの記録は「いちばん条件をまたいだ1本」を保つ');
  assert(KPI.current.chainSample.abilities.length === 5 && KPI.current.chainSample.depth === 7,
    '代表CHAINの中身と、そのときの深さを残す');
  assert(KPI.current.triggerKinds['trait:chain_massacre'] === 9,
    '同じ能力の繰り返しは回数として積む（種類は1つのまま）');

  // 因果メタデータの無い旧データでも落ちない
  KPI.battleFinished({ timeline: [{ type: 'attack' }], chainSummary: null });
  assert(KPI.current.chainBattles === 3, '連鎖の無い戦闘も観測回数には数える');
}

KPI.speedChanged();
KPI.logSkipped();
KPI.reportSkipped();
KPI.reportSkipped();
assert(KPI.current.speedChanges === 1 && KPI.current.logSkips === 1 && KPI.current.reportSkips === 2,
  '速度変更・スキップ・報告早送りを数える');
assert(KPI.load().totals.reportSkips === 2, '端末内の累計にも積む');

// ── 4. 最後にいた画面と攻略段階 ──────────────────────
now.phase = 'formation';
now.conquest = 3;
KPI.screen(now);
const screen = KPI.load().lastScreen;
assert(screen.phase === 'formation' && screen.conquest === 3, '最後にいた画面と攻略段階を残す');
assert(KPI.load().lastScreen.at === clock, '記録時刻を持つ');

// ── 5. 再起では減らない（魔界史の記録とは逆の扱い） ─────────────
Game.saveCheckpoint();
KPI.battleStarted(now, { missionKind: 'invade' });
const attemptsBeforeRetry = KPI.current.buildAttempts;
now.phase = 'defeat';
Game.retry();
assert(KPI.current.buildAttempts === attemptsBeforeRetry,
  '再起で巻き戻してもビルド試行は減らない（試した回数は事実として残す）');

// ── 6. ラン終了と60秒以内の再挑戦 ───────────────────────
const ended = Game.endRun(false);
const saved = KPI.load();
const lastRun = saved.runs[saved.runs.length - 1];
assert(lastRun && lastRun.cleared === false && lastRun.buildAttempts === attemptsBeforeRetry,
  'ラン終了時に端末内へ記録を保存する');
assert(lastRun.endedAt === clock && lastRun.seconds === 0, '経過秒を記録する');
assert(KPI.current === null, '終了後は進行中カウンタを持たない');

clock += 30000;                       // 30秒後にもう1回
Game.newRun();
assert(KPI.current.quickRetry === true, 'ラン終了から60秒以内の再挑戦を記録する');
assert(KPI.current.sessionRun === 2, 'セッション内ラン数が増える');
assert(KPI.load().totals.quickRetries === 1, '累計のリトライ数へも積む');

Game.endRun(false);
clock += 120000;                      // 2分後
Game.newRun();
assert(KPI.current.quickRetry === false, '60秒を超えた再開はリトライに数えない');

// ── 7. 記録はゲーム進行へ影響しない ──────────────────────
const before = JSON.parse(JSON.stringify(Game.state));
KPI.speedChanged(); KPI.logSkipped(); KPI.reportSkipped(); KPI.screen(Game.state);
KPI.battleStarted(Game.state, { missionKind: 'invade' });
const after = JSON.parse(JSON.stringify(Game.state));
assert(JSON.stringify(before) === JSON.stringify(after), 'KPIの記録がラン状態を書き換えない');
assert(Game.state.kpi === undefined && Game.state.buildAttempts === undefined,
  'ラン状態（セーブ）へKPIを混ぜない');

// ── 8. 保存の頑丈さ ────────────────────────────
store[KPI.KEY] = '{壊れたJSON';
assert(KPI.load().runs.length === 0, '壊れた保存データでも空として読める');
store[KPI.KEY] = JSON.stringify({ runs: 'ちがう型' });
assert(Array.isArray(KPI.load().runs), '型が違う保存データでも安全に読める');
KPI.reset();
assert(KPI.load().totals.runsStarted === 0, 'リセットできる');

const many = KPI.blank();
for (let i = 0; i < KPI.MAX_RUNS + 10; i++) many.runs.push({ gen: i });
KPI.save(many);
KPI.update(data => { data.runs.push({ gen: 999 }); });
const capped = KPI.load();
assert(capped.runs.length === KPI.MAX_RUNS && capped.runs[capped.runs.length - 1].gen === 999,
  '古い記録から捨てて上限内に収める');

console.log('KPI測定契約テスト完了');
