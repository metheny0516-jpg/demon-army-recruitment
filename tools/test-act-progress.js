// 幕の進行：第一幕の着地でランは終わらず、第二幕が始まる。
//   node tools/test-act-progress.js
// 名簿・施設・蔵・魔王軍レベルは持ち越し、警戒は0から、段階表と応募の種族が広がる。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/traces.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const get = n => vm.runInContext(n, ctx);
const Game = get('Game'), ENEMY_STAGES = get('ENEMY_STAGES'), MONSTER_TEMPLATES = get('MONSTER_TEMPLATES');
const MISSION_TYPES = get('MISSION_TYPES');
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const fix = src => vm.runInContext(src, ctx);
fix('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];');

const ACT2_IDS = ['succubus', 'minotaur', 'lich'];
const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 900, atk: 90, def: 40, spd: 20, salary: 3, loyalty: 60, traits: [], tags: [],
  department: "combat", injured: 0, relicIds: [],
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0, homeStays: 0 } }, x || {});

function freshRun(extra) {
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false;
  st.applicants = []; st.hiresLeft = 0;
  st.food = 90; st.gold = 500; st.alert = 0; st.counterattack = null;
  st.roster = [member(101, 'カタブツ')];
  st.activeUids = [101];
  Game.baseOf(st.roster[0]);
  Game.syncDepartments();
  Object.assign(st, extra || {});
  return st;
}
// 応募の抽選は重み付き。U.rand を 0.5 に固定したままだと毎回同じテンプレートしか出ないので、
// この検査のあいだだけ本物の乱数に戻す。
const drawTiers = (st, times) => {
  fix('U.rand = Math.random;');
  const seen = new Set();
  for (let i = 0; i < times; i++) seen.add(Game.rollApplicant().tplId);
  fix('U.rand = () => 0.5;');
  return seen;
};

// ── 1. 第一幕は今までどおり ──────────────────────────
{
  const st = freshRun();
  assert(st.act === 1, `新しいランは第一幕（${st.act}）`);
  assert(Game.MAX_CONQUEST === 8, `第一幕の征服上限は8（${Game.MAX_CONQUEST}）`);
  assert(Game.actStages().length === 8, `第一幕の段階表は8（${Game.actStages().length}）`);
  assert(Game.templates().length === MONSTER_TEMPLATES.length,
    `第一幕の応募テンプレは既存のまま（${Game.templates().length}）`);
  const leaked = ACT2_IDS.filter(id => drawTiers(st, 200).has(id));
  assert(leaked.length === 0, `第一幕では新種族が応募に混ざらない（${leaked.join(",") || "混ざらない"}）`);
  st.conquest = 7; st.turn = 40;
  assert(Game.armyLevel() === 8, `第一幕の魔王軍レベルの上限は8（${Game.armyLevel()}）`);
}

// ── 2. 勇者を退けると第二幕（ランは終わらない）──────────────
{
  const st = freshRun({ conquest: ENEMY_STAGES.length - 1, alert: 6 });
  const rosterBefore = st.roster.length, goldBefore = st.gold;
  Game.checkCounterattack();
  assert(st.counterattack && st.counterattack.kind === "hero", '（前提）勇者が来る');
  Game.prepareMissions(true); Game.selectMission(0); st.phase = "formation";
  Game.deploy();
  assert(st.phase === "result", `ランは終わらない（${st.phase}）`);
  assert(st.act === 2, `第二幕になる（${st.act}）`);
  assert(st.lastBattle.actAdvance && st.lastBattle.actAdvance.by === "defense",
    `幕替わりの印（${JSON.stringify(st.lastBattle.actAdvance)}）`);
  assert(st.alert === 0, `警戒は0から（${st.alert}）`);
  assert(st.counterattack === null && st.heroCame === false, '勇者はまた来る（予約も heroCame も戻る）');
  assert(st.conquest === ENEMY_STAGES.length - 1, `征服は持ち越す（防衛は攻略ではないので7のまま：${st.conquest}）`);
  assert(st.roster.length === rosterBefore && st.gold >= goldBefore - 50, '名簿と金庫は持ち越す');
  assert(st.lastBattle.notes.some(n => /第2幕/.test(n)), '幕替わりが notes に残る');
  assert((st.traces || []).some(t => t.kind === "act"), '痕跡に「幕」が残る');
  assert(st.applicants.length > 0, '新しい顔が面接に並ぶ');
  assert(st.actHistory.length === 1 && st.actHistory[0].by === "defense", '幕の履歴が残る');
}

// ── 3. 王都を落としても第二幕 ──────────────────────────
{
  const st = freshRun({ conquest: ENEMY_STAGES.length - 1 });
  Game.prepareMissions(true);
  const invade = st.missionOffers.findIndex(m => m.missionKind === "invade");
  Game.selectMission(invade); st.phase = "formation";
  Game.deploy();
  assert(st.conquest >= 8, '（前提）征服が上限に達した');
  assert(st.act === 2 && st.phase === "result", `攻めた着地でも第二幕（act=${st.act} phase=${st.phase}）`);
  assert(st.lastBattle.actAdvance.by === "conquest", '幕替わりの理由は「攻めた」');
}

// ── 4. 第二幕の規則 ──────────────────────────────
{
  const st = freshRun({ act: 2, conquest: 8, turn: 20 });
  assert(Game.MAX_CONQUEST === 14, `第二幕の征服上限は14（${Game.MAX_CONQUEST}）`);
  assert(Game.actStages().length === 14, `段階表が14に伸びる（${Game.actStages().length}）`);
  assert(Game.templates().length === MONSTER_TEMPLATES.length + 3,
    `応募テンプレに新種族3体が混ざる（${Game.templates().length}）`);
  // 進軍で段階9が引ける
  Game.prepareMissions(true);
  const invade = st.missionOffers.find(m => m.missionKind === "invade");
  assert(invade && invade.baseStage === 9, `進軍で段階9の作戦が作れる（${invade && invade.baseStage}）`);
  // 魔王軍レベルは14まで
  st.conquest = 13; st.turn = 60;
  assert(Game.armyLevel() === 14, `魔王軍レベルが14まで伸びる（${Game.armyLevel()}）`);
  st.conquest = 8;
  // 新種族が応募に来る
  const seen = drawTiers(st, 200);
  const arrived = ACT2_IDS.filter(id => seen.has(id));
  assert(arrived.length > 0, `第二幕では新種族が応募に混ざる（${arrived.join(",") || "混ざらない"}）`);
}
{
  // 討伐隊の下限は段階9
  const st = freshRun({ act: 2, conquest: 8, turn: 10, alert: 6 });
  assert(Game.armyLevel() < 14, '（前提）まだ勇者の段階ではない');
  Game.checkCounterattack();
  assert(st.counterattack.kind === "punitive", '（前提）討伐隊が来る');
  Game.prepareMissions(true);
  assert(st.missionOffers[0].baseStage >= 9,
    `第二幕の討伐隊は段階9以上（${st.missionOffers[0].baseStage}）`);
}
{
  // 勇者（再）は段階14
  const st = freshRun({ act: 2, conquest: 13, turn: 60, alert: 6 });
  assert(Game.armyLevel() === 14, '（前提）魔王軍レベルが上限');
  Game.checkCounterattack();
  assert(st.counterattack.kind === "hero", `勇者（再）が来る（${st.counterattack.kind}）`);
  assert(/再/.test(st.counterattack.armyName), `名に「再」が入る（${st.counterattack.armyName}）`);
  Game.prepareMissions(true);
  assert(st.missionOffers[0].baseStage === 14, `勇者戦は段階14（${st.missionOffers[0].baseStage}）`);
}

// ── 5. 第二幕の着地でクリア ────────────────────────
{
  const st = freshRun({ act: 2, conquest: 13, turn: 60, alert: 6 });
  Game.checkCounterattack();
  Game.prepareMissions(true); Game.selectMission(0); st.phase = "formation";
  Game.deploy();
  assert(st.phase === "clear", `第二幕で勇者を退ければクリア（${st.phase}）`);
  assert(!st.lastBattle.actAdvance, '最後の幕では幕替わりしない');
  assert(st.record && /第2幕/.test(st.record.cause), `魔界史の cause に幕（${st.record && st.record.cause}）`);
  assert(st.record.act === 2 && st.record.actHistory.length >= 0, '記録に幕と履歴が入る');
}
{
  const st = freshRun({ act: 2, conquest: 13, turn: 20 });
  Game.prepareMissions(true);
  const invade = st.missionOffers.findIndex(m => m.missionKind === "invade");
  Game.selectMission(invade); st.phase = "formation";
  Game.deploy();
  assert(st.conquest >= 14 && st.phase === "clear", `征服14でクリア（conquest=${st.conquest} phase=${st.phase}）`);
  assert(/第2幕・王都攻略/.test(st.record.cause), `攻めた着地の cause（${st.record.cause}）`);
}

// ── 6. 第二幕で城陥落しても幕はそのまま ──────────────────
{
  const st = freshRun({ act: 2, conquest: 13, turn: 60, alert: 6 });
  st.roster = [member(201, 'ヨワシ', { hp: 1, atk: 1, def: 0, spd: 1 })];
  st.activeUids = [201]; Game.baseOf(st.roster[0]); Game.syncDepartments();
  Game.checkCounterattack();
  Game.prepareMissions(true); Game.selectMission(0); st.phase = "formation";
  const out = Game.deploy({ offerRetreat: true });
  if (st.pendingBattle) Game.settleBattle('retreat');
  assert(st.act === 2, `城陥落でも幕は戻らない（${st.act}）`);
  assert(st.lastBattle && st.lastBattle.castleFell, '勇者の防衛戦に負ければ城は落ちる');
  assert(st.castleFalls === 1 && st.heroCame === false, `城陥落の記録（${st.castleFalls}/${st.heroCame}）`);
  assert(st.phase !== "clear", `城陥落はクリアではない（${st.phase}）`);
  assert(Game.MAX_CONQUEST === 14, '城が落ちても第二幕の上限は14のまま');
}

// ── 7. 旧セーブ ───────────────────────────────
{
  Game.newRun();
  const st = Game.state;
  delete st.act; delete st.actHistory; delete st.actStartedTurn;
  Game.migrateState();
  assert(st.act === 1, `幕が無い旧セーブは第一幕（${st.act}）`);
  assert(Array.isArray(st.actHistory), 'actHistory が入る');
  assert(Game.MAX_CONQUEST === 8, '旧セーブの征服上限も8');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
