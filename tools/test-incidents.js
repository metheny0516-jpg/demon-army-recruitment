// 噂の札の器（docs/SPEC_INCIDENTS_IMPL_2026-09-14.md 1〜3節）。
// 成立判定・2枚上限・失効・乾き・B の「関わらない」・「なぜ」欄の生成を見る。
//   node tools/test-incidents.js
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/counterattack.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/incidents.js',
  'src/data/town.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/chain.js',
  'src/core/traces.js', 'src/core/town.js', 'src/core/incidents.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
} };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Game = vm.runInContext('Game', ctx);
const Incidents = vm.runInContext('Incidents', ctx);
const Traces = vm.runInContext('Traces', ctx);
const TRACE_KINDS = vm.runInContext('TRACE_KINDS', ctx);
const ok = (c, m) => { if (!c) { console.log('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };

// スライム2体・宿舎Lv1のランを作る（slime_pond の状態条件）
function freshRun(slimes = 2) {
  Game.newRun('standard');
  const st = Game.state;
  st.roster = [];
  for (let i = 0; i < slimes; i++) {
    st.roster.push({ uid: i + 1, tplId: 'slime', name: `スラ${i + 1}`, race: 'スライム', job: '門番',
      hp: 30, atk: 6, def: 3, spd: 3, salary: 2, loyalty: 70, traits: [], tags: [],
      department: 'combat', injured: 0, merit: 0, skills: [], spiritMaxBonus: 0, unpaid: false, unpaidStreak: 0 });
  }
  st.activeUids = st.roster.map(m => m.uid);
  st.town.lv.hostel = 1;
  st.turn = 5;
  Incidents.init(st);
  return st;
}
const spark = (st, uid) => Game.trace('sparked', uid, null, { skill: '火球' });
const haul = (st, uid) => Game.trace('carried_materials', uid, null, { amount: 2, facility: null });

// ── 痕跡の器 ───────────────────────────────────────────────
ok(Object.keys(TRACE_KINDS).length === 22 && Traces.MAX_KINDS === 22,
  `痕跡は22種（${Object.keys(TRACE_KINDS).length} / 上限 ${Traces.MAX_KINDS}）`);
for (const kind of ['carried_materials', 'cooked', 'trained', 'incident']) {
  ok(!!TRACE_KINDS[kind], `新しい痕跡 ${kind} がある`);
}

// ── 成立判定：異なる2種でだけ開く ─────────────────────────────
{
  const st = freshRun();
  ok(Incidents.settle(Game) === null, '痕跡が無ければ札は出ない');
  spark(st, 1); spark(st, 2);
  ok(Incidents.settle(Game) === null, '同じ種類の痕跡が2本でも開かない（異なる2種が要る）');
  haul(st, 2);
  ok(Incidents.settle(Game) === 'slime_pond', '異なる2種が揃うと札が出る');
  const row = st.incidents.offered.slime_pond;
  ok(Array.isArray(row.by) && row.by.length === 2, `開いた2本を控える（${JSON.stringify(row.by)}）`);
  ok(row.expires === st.turn + 3, `3決着で失効する（expires ${row.expires}）`);
}

// ── 状態が満たされていなければ出ない ───────────────────────────
{
  const st = freshRun();
  st.town.lv.hostel = 0;
  spark(st, 1); haul(st, 2);
  ok(Incidents.settle(Game) === null, '状態（宿舎Lv1以上）を満たさなければ出ない');
}

// ── 主役（種族）が全滅したら消える ──────────────────────────────
{
  const st = freshRun();
  spark(st, 1); haul(st, 2);
  Incidents.settle(Game);
  st.roster = [];
  Incidents.settle(Game);
  ok(!st.incidents.offered.slime_pond, '主役の種族がいなくなったら札は消える');
}

// ── 失効（3決着） ──────────────────────────────────────────
{
  const st = freshRun();
  spark(st, 1); haul(st, 2);
  Incidents.settle(Game);
  st.turn += 3;
  Incidents.settle(Game);
  ok(!st.incidents.offered.slime_pond, 'めくらなければ3決着で消える');
}

// ── 2枚上限（札が3枚あっても、出るのは2枚）────────────────────────
{
  const INCIDENTS = vm.runInContext('INCIDENTS', ctx);
  const base = INCIDENTS[0];
  INCIDENTS.push({ ...base, id: 'slime_pond_b' }, { ...base, id: 'slime_pond_c' });
  const st = freshRun();
  spark(st, 1); haul(st, 2);
  const got = [Incidents.settle(Game), Incidents.settle(Game), Incidents.settle(Game)];
  ok(Object.keys(st.incidents.offered).length === 2, `同時に出るのは2枚まで（${Object.keys(st.incidents.offered).join('・')}）`);
  ok(got[2] === null, '3枚目は足されない');
  ok(got[0] !== got[1], '1決着に足すのは1枚だけ');
  INCIDENTS.length = 1;
}

// ── 乾き（0が3回続いたら次だけ1本で判定） ────────────────────────
{
  const st = freshRun();
  spark(st, 1);                       // 1種だけ
  ok(Incidents.settle(Game) === null && st.incidents.dry === 1, '出せない決着で乾きが1つ進む');
  Incidents.settle(Game); Incidents.settle(Game);
  ok(st.incidents.dry === 3, `乾きが3まで溜まる（${st.incidents.dry}）`);
  ok(Incidents.settle(Game) === 'slime_pond', '乾いた次の決着だけ痕跡1本で出る');
  ok(st.incidents.dry === 0, '出たら乾きは戻る');
}

// ── めくる：得と枝と痕跡と「なぜ」 ────────────────────────────
{
  const st = freshRun(2);
  spark(st, 1); haul(st, 2);
  Incidents.settle(Game);
  const before = st.roster[0].spiritMaxBonus || 0;
  const out = Incidents.open(Game, 'slime_pond', 1);
  ok(!!out && out.branch === '2体以上', `隠れた状態で枝が決まる（${out && out.branch}）`);
  ok(st.roster[0].spiritMaxBonus === before + 1, '得は意図どおり（見学者の気合の上限 +1）');
  ok((st.incidentApplicants || []).length === 1, '思わぬ向き：分身が次の面接に並ぶ（強制採用ではない）');
  ok(!st.incidents.offered.slime_pond && !!st.incidents.done.slime_pond, 'めくった札は done へ移る');
  ok(Traces.count(st.traces, { kind: 'incident' }) === 1, '痕跡 incident が1本残る');
  ok(/火の粉|建材/.test(out.why) && /2体以上/.test(out.why), `「なぜ」が痕跡と状態を名指しする（${out.why}）`);
  // 貸したものは決着ごとに返る
  st.turn += 1;
  Game.expireIncidentFx();
  ok(st.roster[0].spiritMaxBonus === before, '次の決着で気合の上限は戻る');
  // 同じ札は1ランに1回
  spark(st, 1); haul(st, 2);
  ok(Incidents.settle(Game) === null, '同じ札は1ランに1回だけ');
}

// ── 隠れた状態が違えば別の枝 ────────────────────────────────
{
  const st = freshRun(1);
  spark(st, 1); haul(st, 1);
  Incidents.settle(Game);
  const food = st.food;
  const out = Incidents.open(Game, 'slime_pond', 1);
  ok(out.branch === '1体', `スライムが1体なら別の枝（${out.branch}）`);
  ok(st.food === food - 1, `弁当を投げる（食料 ${food} → ${st.food}）`);
}

// ── やめる：A は無記録、B は「関わらない」を記録 ─────────────────
{
  const st = freshRun();
  spark(st, 1); haul(st, 2);
  Incidents.settle(Game);
  Incidents.decline(Game, 'slime_pond');
  ok(!st.incidents.offered.slime_pond, 'やめた札は消える');
  ok(!st.incidents.done.slime_pond, 'A の札は無記録（また出る余地を残す）');
  // B の札を同じ器で確かめる（データが1枚しか無いので door だけ差し替えて見る）
  const card = Incidents.card('slime_pond');
  const door = card.door;
  card.door = 'B';
  Incidents.settle(Game);
  Incidents.decline(Game, 'slime_pond');
  ok(st.incidents.done.slime_pond && st.incidents.done.slime_pond.branch === 'ignored',
    'B の札は「関わらない」でも起きたことが残る');
  card.door = door;
}

// ── 12枚ぶんの効果が run.js にある ────────────────────────────
{
  const ids = ['slime_pond', 'mage_lab_light', 'kobold_dig', 'necro_visitor', 'harpy_letter', 'general_duel',
    'mimic_appraisal', 'mimic_hostel_locker', 'goblin_market', 'training_visitor', 'skeleton_choir', 'succubus_party'];
  const missing = ids.filter(id => !Game.INCIDENT_EFFECTS[id]);
  ok(missing.length === 0, `12枚の効果が run.js にある（欠け: ${missing.join('・') || 'なし'}）`);
  const noBranch = ids.filter(id => Object.keys(Game.INCIDENT_EFFECTS[id].branches || {}).length !== 2);
  ok(noBranch.length === 0, `どの札も枝が2本ある（${noBranch.join('・') || 'すべて2本'}）`);
  const noGain = ids.filter(id => typeof Game.INCIDENT_EFFECTS[id].gain !== 'function');
  ok(noGain.length === 0, `どの札にも得がある（${noGain.join('・') || 'すべてあり'}）`);
}

// ── 旧セーブ（incidents が無い）でも落ちない ──────────────────────
{
  const st = freshRun();
  delete st.incidents;
  Game.migrateState();
  ok(!!Game.state.incidents && !!Game.state.incidents.offered, '旧セーブは migrateState で器が入る');
  ok(Incidents.settle(Game) === null, '器が無かったセーブでも決着が通る');
}

console.log(process.exitCode ? '\n失敗あり' : '\n全件通過');
