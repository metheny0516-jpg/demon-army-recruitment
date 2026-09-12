// 前哨戦と本戦（docs/SPEC_TWO_STAGE_BATTLES_2026-09-12.md）。
//   node tools/test-two-stage.js
// 進軍は2戦。征服度が進むのは本戦の勝ちだけ。勇者戦と段階1は一発勝負。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const ENEMY_STAGES = vm.runInContext('ENEMY_STAGES', ctx);
const MISSION_TYPES = vm.runInContext('MISSION_TYPES', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 900, atk: 90, def: 40, spd: 20, salary: 3, loyalty: 60, traits: [], skills: [], tags: [],
  department: "combat", injured: 0, relicIds: [],
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 } }, x || {});
const invadeType = () => MISSION_TYPES.find(t => t.id === 'invade');

function freshRun(extra) {
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false;
  st.applicants = []; st.hiresLeft = 0;
  st.food = 400; st.gold = 800;
  st.roster = [member(101, 'カタブツ')];
  st.activeUids = [101];
  for (const m of st.roster) Game.baseOf(m);
  Game.syncDepartments();
  Object.assign(st, extra || {});
  return st;
}
// 進軍を1回戦う（作戦会議 → 選ぶ → 出撃 → 決着）
function invadeOnce(st) {
  Game.prepareMissions(true);
  const at = st.missionOffers.findIndex(m => m.missionKind === 'invade');
  Game.selectMission(at);
  st.phase = 'formation';
  const mission = st.selectedMission;
  Game.deploy();
  return mission;
}

// ── 1. 作戦カード：前哨戦の顔 ─────────────────────
{
  const st = freshRun({ conquest: 2 });
  const outpost = Game.buildMission(invadeType());
  assert(outpost.missionPhase === 'outpost', `征服2は前哨戦から（${outpost.missionPhase}）`);
  assert(/前哨戦：/.test(outpost.missionTitle), `題に「前哨戦」（${outpost.missionTitle}）`);
  assert(outpost.conquestDelta === 0, `前哨では征服度が進まない（${outpost.conquestDelta}）`);
  const main = (() => { st.outpost = { stage: 2, cleared: true, formationId: outpost.formationId }; return Game.buildMission(invadeType()); })();
  assert(main.missionPhase === 'main', `前哨を制したら本戦（${main.missionPhase}）`);
  assert(main.conquestDelta === 1, `本戦は征服度+1（${main.conquestDelta}）`);
  assert(outpost.units.length === Math.ceil(main.units.length / 2),
    `前哨の敵は本戦の半分（${outpost.units.length}/${main.units.length}）`);
  assert(outpost.units.every(u => main.units.some(m => m.name === u.name)),
    `前哨の敵は本戦の部分集合（${outpost.units.map(u => u.name).join(',')}）`);
  const ROLES = ['shield', 'archer', 'priest', 'caster', 'commander', 'rogue', 'brute'];
  const mainRoles = main.units.filter(u => ROLES.includes(u.role));
  if (mainRoles.length) {
    assert(outpost.units.some(u => ROLES.includes(u.role)),
      `役つきの敵が前哨にも1体は出る（${outpost.units.map(u => u.role || 'fighter').join(',')}）`);
  } else {
    assert(true, '（この段階の本戦に役つきの敵が居ないので省略）');
  }
  assert(outpost.reward < main.reward, `報酬は本戦より少ない（前哨${outpost.reward} / 本戦${main.reward}）`);
  assert(Math.abs(outpost.reward - Math.round(main.reward * 0.5)) <= 1,
    `前哨の報酬は本戦のおよそ50%（${outpost.reward} vs ${Math.round(main.reward * 0.5)}）`);
  assert(outpost.alertDelta === Math.ceil(main.alertDelta / 2),
    `警戒も半分（前哨${outpost.alertDelta} / 本戦${main.alertDelta}）`);
  assert(outpost.foodReward === 2, `前哨の食料は2（${outpost.foodReward}）`);
  assert(outpost.formationId === main.formationId,
    `前哨で見た隊列が本戦の隊列（${outpost.formationName} → ${main.formationName}）`);
}

// ── 2. 段階1と勇者戦は一発勝負 ──────────────────
{
  const st = freshRun({ conquest: 0 });
  const m = Game.buildMission(invadeType());
  assert(m.missionPhase === 'main' && m.conquestDelta === 1,
    `段階1に前哨は無い（${m.missionPhase}）`);
  assert(!Game.outpostNeeded(0), 'outpostNeeded(0) は false');
}
{
  const st = freshRun({ conquest: ENEMY_STAGES.length - 1 });
  const m = Game.buildMission(invadeType());
  assert(m.missionPhase === 'main', `王都（最終段階）は前哨なし（${m.missionPhase}）`);
  assert(!Game.outpostNeeded(Game.MAX_CONQUEST - 1), '最終段階の outpostNeeded は false');
}
{
  // 討伐・鎮圧は2戦制にしない
  const st = freshRun({ conquest: 3 });
  for (const id of ['raid', 'suppress']) {
    const t = MISSION_TYPES.find(x => x.id === id);
    if (!t) continue;
    const m = Game.buildMission(t);
    assert(m.missionPhase === 'main' && !m.twoStage, `${id} は今までどおり1戦（${m.missionPhase}）`);
  }
}

// ── 3. 決着：前哨→本戦で征服度が進む ────────────────
{
  const st = freshRun({ conquest: 2 });
  const first = invadeOnce(st);
  assert(first.missionPhase === 'outpost', '（前提）1戦目は前哨');
  assert(st.lastBattle.victory, '（前提）前哨に勝った');
  assert(st.conquest === 2, `前哨では征服度が進まない（${st.conquest}）`);
  assert(Game.outpostCleared(), '前哨の札が立つ');
  assert(st.outpost.stage === 2 && st.outpost.cleared, `札の中身（${JSON.stringify(st.outpost)}）`);
  assert(st.lastBattle.notes.some(n => /前哨を制した/.test(n)), '日誌に「前哨を制した」');
  const second = invadeOnce(st);
  assert(second.missionPhase === 'main', '2戦目は本戦');
  assert(second.formationId === first.formationId, `隊列は前哨と同じ（${second.formationName}）`);
  assert(st.conquest === 3, `本戦の勝ちで征服度+1（${st.conquest}）`);
  assert(st.outpost === null, '本戦のあと札は返る（次の段階はまた前哨から）');
  assert(Game.buildMission(invadeType()).missionPhase === 'outpost', '次の段階はまた前哨から');
}

// ── 4. 本戦に負けたら前哨からやり直し ───────────────
{
  const st = freshRun({ conquest: 3 });
  st.outpost = { stage: 3, cleared: true, formationId: 'standard' };
  assert(Game.outpostCleared(), '（前提）前哨は制してある');
  // 紙1枚で本戦へ行って退く
  st.roster = [member(201, 'ヨワシ', { hp: 1, atk: 1, def: 0, spd: 1 })];
  st.activeUids = [201];
  Game.baseOf(st.roster[0]); Game.syncDepartments();
  Game.prepareMissions(true);
  const at = st.missionOffers.findIndex(m => m.missionKind === 'invade');
  Game.selectMission(at); st.phase = 'formation';
  assert(st.selectedMission.missionPhase === 'main', '（前提）本戦へ出た');
  Game.deploy({ offerRetreat: true });
  if (st.pendingBattle) Game.settleBattle('retreat');
  assert(st.conquest === 3, `征服度は進まない（${st.conquest}）`);
  assert(st.outpost === null, '本戦に負けたら札は返る');
  assert(Game.buildMission(invadeType()).missionPhase === 'outpost', '前哨からやり直し');
  assert(st.lastBattle.notes.some(n => /前哨から立て直す/.test(n)),
    `日誌に「前哨から立て直す」（${st.lastBattle.notes.filter(n => /前哨/.test(n)).join(' / ')}）`);
}
{
  // 前哨に負けても札は変わらない（もう一度前哨）
  const st = freshRun({ conquest: 3 });
  st.roster = [member(202, 'ヨワシ', { hp: 1, atk: 1, def: 0, spd: 1 })];
  st.activeUids = [202];
  Game.baseOf(st.roster[0]); Game.syncDepartments();
  Game.prepareMissions(true);
  const at = st.missionOffers.findIndex(m => m.missionKind === 'invade');
  Game.selectMission(at); st.phase = 'formation';
  assert(st.selectedMission.missionPhase === 'outpost', '（前提）前哨へ出た');
  Game.deploy({ offerRetreat: true });
  if (st.pendingBattle) Game.settleBattle('retreat');
  assert(!Game.outpostCleared() && st.conquest === 3, `前哨のまま（札=${JSON.stringify(st.outpost)}）`);
}

// ── 5. 前哨も1戦として数える（技の開放は record.battles） ──
{
  const st = freshRun({ conquest: 2 });
  invadeOnce(st);
  const m = st.roster.find(x => x.uid === 101);
  assert(m && Game.memberRecord(m).battles === 1, `前哨も戦歴1戦（${m && Game.memberRecord(m).battles}）`);
  assert((st.stageFights[2] || 0) >= 1, `慣れも前哨で1回進む（${st.stageFights[2]}）`);
}

// ── 6. 防衛戦が挟まっても前哨の札は据え置き ──────────
{
  const st = freshRun({ conquest: 2 });
  st.outpost = { stage: 2, cleared: true, formationId: 'standard' };
  st.alert = 99;
  Game.checkCounterattack();
  Game.prepareMissions(true);
  assert(st.missionOffers[0].missionKind === 'defend', '（前提）防衛の一択');
  Game.selectMission(0); st.phase = 'formation';
  Game.deploy();
  assert(Game.outpostCleared(), `防衛戦のあとも前哨の札は残る（${JSON.stringify(st.outpost)}）`);
}

// ── 7. 旧セーブ ───────────────────────────
{
  Game.newRun();
  const st = Game.state;
  delete st.outpost;
  Game.migrateState();
  assert(st.outpost === null, `outpost の無い旧セーブは前哨から（${JSON.stringify(st.outpost)}）`);
}

// ── 8. 報酬の補正（2戦に割ったぶん） ─────────────────
{
  const st = freshRun({ conquest: 3 });
  st.outpost = { stage: 3, cleared: true, formationId: 'standard' };
  const main = Game.buildMission(invadeType());
  const stage = ENEMY_STAGES[3];
  assert(Math.abs(main.reward - Math.round(stage.reward * Game.TWO_STAGE_REWARD_MULT)) <= 1,
    `本戦の報酬は段階表の1.15倍（段階${stage.reward} → ${main.reward}）`);
  st.outpost = null;
  const outpost = Game.buildMission(invadeType());
  assert(outpost.reward + main.reward > stage.reward,
    `前哨+本戦の合計は1段階ぶんより多い（${outpost.reward}+${main.reward} > ${stage.reward}）`);
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
