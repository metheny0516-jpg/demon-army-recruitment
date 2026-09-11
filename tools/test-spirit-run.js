// 気合（号令の限定）・run.js 側：採用で1、出撃して決着で+1、留守番で+2、上限3、名指しで cost を引く。
//   node tools/test-spirit-run.js
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => store[key] || null, setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const MONSTER_RULES = vm.runInContext('MONSTER_RULES', ctx);
const TRAITS = vm.runInContext('TRAITS', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const clone = v => JSON.parse(JSON.stringify(v));
const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [], department: "combat" }, x || {});
let FIXED_MISSION = null;
function freshRun(spirits) {
  Game.newRun();
  const st = Game.state;
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = 40; st.gold = 200;
  st.roster = [member(101, 'ヨワシ', { hp: 8, atk: 2, def: 0, spd: 9, spirit: spirits[0] }),
               member(102, 'ガロ', { hp: 260, atk: 14, def: 8, spd: 4, traits: ['brute'], spirit: spirits[1] }),
               member(103, 'ルスバン', { hp: 30, atk: 4, def: 2, spd: 2, spirit: spirits[2] })];
  st.activeUids = [101, 102];
  Game.syncDepartments();
  if (st.phase !== "mission") Game.prepareMissions(true);
  Game.selectMission(0);
  if (!FIXED_MISSION) FIXED_MISSION = clone(st.selectedMission);
  st.selectedMission = clone(FIXED_MISSION);
  return st;
}
const rules = MONSTER_RULES.spirit;
const spiritOf = (st, uid) => (st.roster.find(m => m.uid === uid) || {}).spirit;

// 1. 採用で start、旧セーブの移行でも start
{
  const st = freshRun([1, 1, 1]);
  Game.genApplicants();
  st.hiresLeft = 1; st.phase = 'recruit';
  const before = st.roster.length;
  if (st.applicants.length) { Game.hire(0); }
  assert(st.roster.length === before + 1 && st.roster[st.roster.length - 1].spirit === rules.start, `採用時の気合は ${rules.start}`);
  delete st.roster[0].spirit;
  Game.migrateState();
  assert(st.roster[0].spirit === rules.start, '旧セーブ（spirit 無し）は移行で start');
}

// 2. 出撃して決着で +perBattle、留守番で +perHomeTurn、上限 max
{
  const st = freshRun([1, 1, 1]);
  Game.deploy();
  assert(spiritOf(st, 102) === 1 + rules.perBattle || !st.roster.some(m => m.uid === 102), `出撃者は決着で +${rules.perBattle}`);
  assert(spiritOf(st, 103) === Math.min(rules.max, 1 + rules.perHomeTurn), `留守番は +${rules.perHomeTurn}（上限 ${rules.max}）`);
  const st2 = freshRun([3, 3, 3]);
  Game.deploy();
  assert(spiritOf(st2, 103) === rules.max, '上限を超えない');
}

// 3. 名指しで cost を引く。足りなければ候補に出ない
{
  let got = null;
  for (let i = 0; i < 40 && !got; i++) {
    const st = freshRun([1, 3, 1]);
    const out = Game.deploy({ offerRetreat: true });
    if (out && out.result.orderOffer) got = { st, out };
  }
  assert(!!got, '（前提）気合3のガロで号令の節目が出る戦闘を引ける');
  if (got) {
    const { st, out } = got;
    const cand = out.result.orderOffer.candidates.find(c => c.skillId === 'brute');
    assert(cand && cand.cost === 1 && cand.spirit === 3, '候補に cost 1・気合3 が載る');
    Game.answerOrder(cand.unitId);
    const after = spiritOf(st, 102);
    // 引いて（3→2）、決着で出撃の +1 が戻る（→3）。撤退の提案が後に控えていれば決着前なので 2。
    assert(after === 2 || after === 3, `名指しで cost を引く（3 → ${after}）`);
  }
  let none = true;
  for (let i = 0; i < 25 && none; i++) {
    const st = freshRun([1, 0, 1]);
    const out = Game.deploy({ offerRetreat: true });
    if (out && out.result.orderOffer) none = false;
    if (st.pendingBattle) Game.answerOrder('none');
    if (st.pendingBattle) Game.settleBattle('continue');
  }
  assert(none, '気合0のガロ（cost 1）では提案が出ない');
}

// 4. 技を覚えた直後の戦いだけ debutSkill が立ち、その決着で消える
{
  const st = freshRun([1, 1, 1]);
  const garo = st.roster.find(m => m.uid === 102);
  garo.record = { battles: 5, wins: 5, downed: 0, carried: 0, late: 0, ate: 0 };
  Game.deploy();
  const g2 = st.roster.find(m => m.uid === 102);
  if (g2 && g2.skillTier === 2) {
    assert(g2.debutSkill === g2.traits.find(id => (TRAITS[id] || {}).skill), `覚えた直後は debutSkill が立つ（${g2.debutSkill}）`);
    st.phase = 'mission'; st.missionOffers = []; Game.prepareMissions(true); Game.selectMission(0); st.selectedMission = clone(FIXED_MISSION); st.phase = 'formation';
    Game.deploy();
    const g3 = st.roster.find(m => m.uid === 102);
    assert(!g3 || g3.debutSkill === null, 'お披露目の決着で debutSkill が消える');
  } else assert(true, '（6戦目で技を覚えなかった／戦死したので省略）');
}

// 5. 種族の伝承：誰かが上位技を覚えたら、同じ種族の新入りは覚えた状態で来る（お披露目付き）
{
  const st = freshRun([1, 1, 1]);
  const garo = st.roster.find(m => m.uid === 102);
  garo.record = { battles: 5, wins: 5, downed: 0, carried: 0, late: 0, ate: 0 };
  Game.deploy();
  const g2 = st.roster.find(m => m.uid === 102);
  if (g2 && g2.skillTier === 2) {
    assert(st.skillLore.orc === 'blood_howl', `伝承に記録される（${JSON.stringify(st.skillLore)}）`);
    const rookie = Game.rollApplicant('orc');
    assert(Game.loreSkillFor(rookie) && Game.loreSkillFor(rookie).id === 'blood_howl', '応募者の札に伝承の技が見える');
    st.applicants = [rookie]; st.hiresLeft = 1; st.phase = 'recruit'; st.gold = 500;
    Game.hire(0);
    const hired = st.roster[st.roster.length - 1];
    assert(hired.traits.includes('blood_howl') && !hired.traits.includes('brute') && hired.skillTier === 2, '採用した新入りは上位技を持って来る');
    assert(hired.debutSkill === 'blood_howl', '新入りにもお披露目の戦いがある');
    const gob = Game.rollApplicant('goblin');
    assert(!Game.loreSkillFor(gob), '別の種族には乗らない');
  } else assert(true, '（6戦目で技を覚えなかった／戦死したので省略）');
  delete st.skillLore;
  Game.migrateState();
  assert(st.skillLore && (st.roster.some(m => m.skillTier === 2) ? Object.keys(st.skillLore).length >= 1 : true), '旧セーブは今いる上位技持ちから伝承を埋める');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
