// 技の開放（run.js 側）：種族技は3戦、上位技は8戦、裏方の職は倍かかる代わりに城で1つ多く働く。
//   node tools/test-skill-unlock.js
// 技そのものの効き方（戦闘）は test-skills-command.js。ここは「いつ覚えるか」と移行だけを見る。
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
const SKILL_RULES = vm.runInContext('SKILL_RULES', ctx);
const SPECIES_SKILL = vm.runInContext('SPECIES_SKILL', ctx);
const SKILLS = vm.runInContext('SKILLS', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], skills: [], tags: [],
  department: "combat", injured: 0, relicIds: [],
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 } }, x || {});
const fresh = () => { Game.newRun(); const st = Game.state; st.roster = []; st.activeUids = []; return st; };

// ── 1. 規則の値 ───────────────────────────────
{
  const r = Game.skillRules();
  assert(r.speciesUnlockBattles === 3, `種族技は3戦（${r.speciesUnlockBattles}）`);
  assert(r.unlockBattles === 8, `上位技は8戦（${r.unlockBattles}）`);
  assert(SKILL_RULES.unlockBattles === 8, 'data 側も8戦');
}

// ── 2. 種族技は3戦で覚える ───────────────────────
{
  const st = fresh();
  const m = member(101, 'ガロ');
  st.roster = [m];
  const notes = [];
  for (const n of [0, 1, 2]) {
    Game.memberRecord(m).battles = n;
    assert(Game.checkSpeciesSkill(m, notes) === null, `${n}戦では覚えない`);
  }
  Game.memberRecord(m).battles = 3;
  const got = Game.checkSpeciesSkill(m, notes);
  assert(!!got && got.skillId === SPECIES_SKILL.orc, `3戦で覚える（${got && got.skillName}）`);
  assert(m.skills.includes(SPECIES_SKILL.orc), 'skills に入る');
  assert(notes.some(n => /技【.+】を覚えた。次から指示で出せる/.test(n)),
    `モルモの一言（${notes.find(n => /覚えた/.test(n))}）`);
  assert(Game.checkSpeciesSkill(m, notes) === null, '二度は覚えない');
  assert(!m.traits.includes('brute'), '癖（怪力）は付かない。技は skills だけに入る');
}
{
  // 技を持たない種族でも落ちない（SPECIES_SKILL に無い tplId）
  const m = member(102, 'ナシオ', { tplId: 'unknown_species' });
  assert(Game.checkSpeciesSkill(m, []) === null, '技の無い種族は覚えない（落ちない）');
  const merc = member(103, 'ヤトイ', { mercenary: true });
  Game.memberRecord(merc).battles = 20;
  assert(Game.checkSpeciesSkill(merc, []) === null, '傭兵は覚えない');
}

// ── 3. 上位技は8戦。1段目を持っていなくても種族が合えば覚える ──
{
  const st = fresh();
  const m = member(104, 'レキセン');            // traits は空（怪力は技へ移った）
  st.roster = [m];
  Game.memberRecord(m).battles = 7;
  assert(Game.checkSkillUnlock(m, []) === null, '7戦ではまだ');
  Game.memberRecord(m).battles = 8;
  const got = Game.checkSkillUnlock(m, []);
  assert(!!got && got.skillId === 'blood_howl', `8戦で上位技（${got && got.skillName}）`);
  assert(m.traits.includes('blood_howl') && m.skillTier === 2, 'traits に入り skillTier が2');
  assert(st.skillLore.orc === 'blood_howl', '種族の伝承に残る');
}
{
  // 種族技と上位技は両立する（技は skills、上位技は traits）
  const st = fresh();
  const m = member(105, 'リョウホウ');
  st.roster = [m];
  Game.memberRecord(m).battles = 8;
  Game.checkSpeciesSkill(m, []);
  Game.checkSkillUnlock(m, []);
  assert(m.skills.includes(SPECIES_SKILL.orc) && m.traits.includes('blood_howl'),
    `両方持てる（skills=${m.skills} traits=${m.traits}）`);
}

// ── 4. 遅咲き（裏方の職）は倍かかる ──────────────────
{
  const st = fresh();
  const late = member(106, 'ソロバン', { job: '会計担当', lateBloomer: true, homeBonus: 'food' });
  st.roster = [late];
  assert(Game.isLateBloomer(late), '会計は遅咲き');
  assert(Game.unlockBattlesFor(late, 'species') === 6 && Game.unlockBattlesFor(late, 'order') === 12,
    `6戦と12戦（${Game.unlockBattlesFor(late, 'species')}／${Game.unlockBattlesFor(late, 'order')}）`);
  Game.memberRecord(late).battles = 5;
  assert(Game.checkSpeciesSkill(late, []) === null, '5戦ではまだ覚えない');
  Game.memberRecord(late).battles = 6;
  assert(!!Game.checkSpeciesSkill(late, []), '6戦で種族技');
  Game.memberRecord(late).battles = 11;
  assert(Game.checkSkillUnlock(late, []) === null, '11戦ではまだ上位技は来ない');
  Game.memberRecord(late).battles = 12;
  assert(!!Game.checkSkillUnlock(late, []), '12戦で上位技');
}
{
  const plain = member(107, 'ヘイシ', { job: '兵' });
  assert(!Game.isLateBloomer(plain), '兵は遅咲きではない');
  for (const job of ['倉庫番', '広報担当', '伝令', '受付', '経理', '備品管理', '配達']) {
    assert(Game.isLateBloomer(member(108, 'X', { job })), `${job} は遅咲き`);
  }
}
{
  // 代わりに城の仕事を1つぶん多くこなす
  const st = fresh();
  const late = member(109, 'ソロバン', { job: '会計担当', lateBloomer: true, homeBonus: 'food', department: 'life' });
  st.roster = [late];
  Game.syncDepartments();
  const home = Game.departmentOf(late).id;
  const withBonus = Game.contributionOf(late, home).food;
  late.homeBonus = null;
  const without = Game.contributionOf(late, home).food;
  assert(withBonus === without + 1, `留守番の調達が+1（${without} → ${withBonus}）`);
  late.homeBonus = 'food';
  assert(Game.contributionOf(late, 'combat').food === 0, '出撃中は城の仕事をしない（+1も乗らない）');
}
{
  // 採用の時点で決まる（職業欄から）
  const st = fresh();
  let found = null, allEmpty = true;
  vm.runInContext('U.rand = Math.random; U.pick = arr => arr[Math.floor(Math.random() * arr.length)];', ctx);
  for (let i = 0; i < 400 && !found; i++) {
    const a = Game.rollApplicant();
    if (a.lateBloomer) found = a;
    if (!Array.isArray(a.skills) || a.skills.length) allEmpty = false;
  }
  vm.runInContext('U.rand = () => 0.5; U.pick = arr => arr[0];', ctx);
  assert(allEmpty, '応募者は技を持たずに来る（採用後に3戦で覚える）');
  if (found) {
    assert(Game.LATE_BLOOMER_FIELDS.includes(found.homeBonus),
      `遅咲きには内政の伸びが付く（${found.job}／${found.homeBonus}）`);
  } else {
    console.log('  （この乱数では遅咲きの応募者が出なかった。職業欄の判定は上のテストで見ている）');
  }
}

// ── 5. 移行：癖が消えて技が入る ───────────────────
{
  Game.newRun();
  const st = Game.state;
  st.roster = [
    // 3戦以上：癖が消えて技が入る
    member(201, 'フルカブ', { traits: ['brute', 'drunkard'], record: { battles: 5 } }),
    // 3戦未満：癖だけ消える（まだ覚えていない）
    member(202, 'シンジン', { traits: ['brute'], record: { battles: 1 } }),
    // 裏方は6戦から
    member(203, 'ソロバン', { job: '会計担当', traits: ['brute'], record: { battles: 5 } })
  ];
  for (const m of st.roster) delete m.skills;
  Game.migrateState();
  const [old_, rookie, late] = st.roster;
  assert(!old_.traits.includes('brute'), '技へ移した癖（怪力）が消える');
  assert(old_.traits.includes('drunkard'), 'それ以外の癖は残る');
  assert(old_.skills.includes(SPECIES_SKILL.orc), `5戦の者には種族技（${old_.skills}）`);
  assert(!rookie.traits.includes('brute') && rookie.skills.length === 0,
    `1戦の者は癖だけ消えて技はまだ（${rookie.skills}）`);
  assert(late.lateBloomer === true && late.skills.length === 0,
    `裏方の5戦はまだ覚えていない（${late.skills}）`);
  assert(st.roster.every(m => Array.isArray(m.skills)), 'skills が無い旧セーブは []');
}
{
  // TRAITS からは消していない（敵・遺物・魔界史が参照する）
  const TRAITS = vm.runInContext('TRAITS', ctx);
  for (const id of Game.MOVED_TO_SKILL) assert(!!TRAITS[id], `TRAITS.${id} は残っている`);
}

// ── 6. 気合：技で払った分と、戦いで高まった分 ─────────
{
  Game.newRun();
  const st = Game.state;
  const m = member(301, 'キアイ', { spirit: 1 });
  st.roster = [m];
  const pending = { result: { spiritSpent: { 301: 1 }, spiritGained: { 301: 2 } } };
  Game.applySpiritChanges(pending.result, pending);
  assert(m.spirit === 2, `払った1を引き、高まった2を足す（1 → ${m.spirit}）`);
  Game.applySpiritChanges(pending.result, pending);
  assert(m.spirit === 2, '同じ決着で二度は反映しない');
}
{
  Game.newRun();
  const st = Game.state;
  const max = Game.spiritRules().max;
  const m = member(302, 'マンタン', { spirit: max });
  st.roster = [m];
  Game.applySpiritChanges({ spiritGained: { 302: 3 } }, {});
  assert(m.spirit === max, `上限を超えない（${m.spirit}/${max}）`);
}

// ── 7. 決着を通した実地：3戦で技が入る ──────────────
{
  Game.newRun();
  const st = Game.state;
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = 200; st.gold = 600;
  const tank = member(401, 'カタブツ', { hp: 900, atk: 60, def: 30, spd: 8 });
  st.roster = [tank]; st.activeUids = [401];
  Game.baseOf(tank); Game.syncDepartments();
  for (let i = 0; i < 3; i++) {
    if (st.phase === 'gameover' || st.phase === 'clear') break;
    Game.prepareMissions(true); Game.selectMission(0); st.phase = 'formation';
    Game.deploy();
  }
  const after = st.roster.find(x => x.uid === 401);
  assert(!!after && Game.memberRecord(after).battles >= 3, `3戦した（${after && Game.memberRecord(after).battles}戦）`);
  assert(!!after && after.skills.includes(SPECIES_SKILL.orc),
    `決着処理から種族技が呼ばれている（${after && after.skills}）`);
  assert(!!st.lastBattle && (st.lastBattle.unlocked || []).some(u => u.species),
    '結果画面へ「技を覚えた」が渡る');
  assert(!!SKILLS[SPECIES_SKILL.orc], '技の定義がある');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
