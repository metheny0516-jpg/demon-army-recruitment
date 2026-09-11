// 経験で身につく共通特性：頑丈・しぶとい・担がれ慣れ・城の主を、決着ごとに付ける。
//   node tools/test-experience-grant.js
// 定義（earned: { counter, at, unless }）は traits.js。ここは付ける側と、効果の接続を見る。
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
const TRAITS = vm.runInContext('TRAITS', ctx);
const Aptitude = vm.runInContext('Aptitude', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [],
  department: "combat", injured: 0, relicIds: [],
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0, homeStays: 0 } }, x || {});

let FIXED = null;
function freshRun(roster, activeUids) {
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false;
  st.applicants = []; st.hiresLeft = 0;
  st.food = 80; st.gold = 400; st.alert = 0;
  st.counterattack = null;
  st.roster = roster; st.activeUids = activeUids;
  for (const m of st.roster) Game.baseOf(m);
  Game.syncDepartments();
  Game.prepareMissions(true); Game.selectMission(0);
  if (!FIXED) FIXED = JSON.parse(JSON.stringify(st.selectedMission));
  st.selectedMission = JSON.parse(JSON.stringify(FIXED));
  return st;
}

// 1. 定義側の前提（id をベタ書きせず earned から引く）
{
  const earnable = Object.keys(TRAITS).filter(id => TRAITS[id].earned);
  assert(earnable.length === 4, `経験で身につく特性は4つ（${earnable.join(",")}）`);
  for (const id of earnable) {
    const r = TRAITS[id].earned;
    assert(!!r.counter && typeof r.at === "number", `${id} に counter と at がある`);
    assert(Array.isArray((TRAITS[id].lines || {}).earned), `${id} に身についた一言がある`);
  }
  // 応募者には付かない（traitPool に入っていない）
  const pools = vm.runInContext('MONSTER_TEMPLATES', ctx).flatMap(t => t.traitPool || []);
  assert(earnable.every(id => !pools.includes(id)), '4つとも traitPool には入っていない（応募者には付かない）');
}

// 2. 頑丈：8戦倒れずに戦った者
{
  const st = freshRun([member(101, 'ムキズ')], [101]);
  const m = st.roster[0];
  m.record.battles = 7; m.record.downed = 0;
  assert(Game.grantExperienceTraits([]).length === 0, '7戦では頑丈にならない');
  m.record.battles = 8;
  const got = Game.grantExperienceTraits([]);
  assert(got.length === 1 && got[0].traitId === 'hardy', `8戦倒れずで頑丈（${got[0] && got[0].traitId}）`);
  assert(m.traits.includes('hardy'), '特性が本人に入る');
  assert(!!got[0].quote && TRAITS.hardy.lines.earned.includes(got[0].quote),
    `本人の一言が earned のプールから（${got[0].quote}）`);
  assert(Game.grantExperienceTraits([]).length === 0, '二度は付かない');
}
{
  // 一度でも倒れていれば頑丈にはならない（unless: downed）
  const st = freshRun([member(102, 'コロンダ')], [102]);
  const m = st.roster[0];
  m.record.battles = 20; m.record.downed = 1;
  assert(!Game.grantExperienceTraits([]).some(e => e.traitId === 'hardy'),
    '一度でも倒れていれば頑丈にはならない');
}

// 3. しぶとい：2回倒れた者
{
  const st = freshRun([member(103, 'シブトイ')], [103]);
  const m = st.roster[0];
  m.record.downed = 1;
  assert(Game.grantExperienceTraits([]).length === 0, '1回倒れただけでは付かない');
  m.record.downed = 2;
  const got = Game.grantExperienceTraits([]);
  assert(got.length === 1 && got[0].traitId === 'die_hard', `2回倒れてしぶとい（${got[0] && got[0].traitId}）`);
}

// 4. 1決着につき1人1つまで
{
  const st = freshRun([member(104, 'ヨクバリ')], [104]);
  const m = st.roster[0];
  m.record.battles = 20; m.record.downed = 2; m.record.carried = 3; m.record.homeStays = 9;
  const first = Game.grantExperienceTraits([]);
  assert(first.length === 1, `一度に身につくのは1つだけ（${first.length}）`);
  const second = Game.grantExperienceTraits([]);
  assert(second.length === 1 && second[0].traitId !== first[0].traitId, '次の決着で次の1つが身につく');
}

// 5. 城の主：留守番の決着を5回。留守番でしか育たない
{
  const st = freshRun([member(201, 'デバン', { hp: 900, atk: 90, def: 40, spd: 20 }),
                       member(202, 'ルスバン')], [201]);
  const home = st.roster.find(m => m.uid === 202);
  const out = st.roster.find(m => m.uid === 201);
  assert(Game.departmentOf(home).id === "home", '（前提）202 は留守番');
  Game.deploy();
  assert(Game.memberRecord(home).homeStays === 1, `留守番の決着で homeStays が増える（${Game.memberRecord(home).homeStays}）`);
  assert(Game.memberRecord(out).homeStays === 0, '出撃した者は増えない');
  home.record.homeStays = 5;
  const got = Game.grantExperienceTraits([]);
  assert(got.some(e => e.uid === 202 && e.traitId === 'castle_keeper'),
    `留守番5回で城の主（${got.map(e => e.traitId).join(",")}）`);
  // 効果：留守番の食料調達+1
  const before = Aptitude.contribution({ ...home, traits: [] }, "home").food;
  const after = Aptitude.contribution(home, "home").food;
  assert(after === before + TRAITS.castle_keeper.homeFood,
    `城の主は留守番の食料調達+${TRAITS.castle_keeper.homeFood}（${before}→${after}）`);
  assert(Aptitude.contribution(home, "combat").food === 0, '出撃中は食料を調達しない（今までどおり）');
}

// 6. 担がれ慣れ：担がれたら身につき、次の撤退では負傷しない
{
  const st = freshRun([member(301, 'ヨワシ', { hp: 8, atk: 2, def: 0, spd: 9 }),
                       member(302, 'カタブツ', { hp: 900, atk: 40, def: 30, spd: 4 })], [301, 302]);
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  const weak = st.roster.find(m => m.uid === 301);
  assert(!!weak && Game.memberRecord(weak).carried === 1, '（前提）担がれた');
  assert(weak.traits.includes('carried_before'), '担がれたら担がれ慣れが身につく');
  assert(weak.injured === 1, 'この回はまだ負傷する（身についたのは決着の最後）');
  assert((st.lastBattle.earned || []).some(e => e.traitId === 'carried_before'),
    'lastBattle.earned に載る（結果画面が読む）');
  // 次の撤退では負傷しない
  weak.injured = 0;
  st.activeUids = [301, 302]; Game.syncDepartments();
  Game.prepareMissions(true); Game.selectMission(0);
  st.selectedMission = JSON.parse(JSON.stringify(FIXED));
  st.phase = "formation";
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  const again = st.roster.find(m => m.uid === 301);
  assert(!!again, '担がれ慣れでも名簿に残る（引退しない）');
  assert(again.injured === 0, `担がれ慣れなら負傷しない（injured=${again.injured}）`);
  assert(st.lastBattle.notes.some(n => /担いで/.test(n)), '「担いで戻った」に名前は残る');
  assert(st.activeUids.includes(301), '負傷しないので出撃隊から外れない');
}

// 7. 決着を通すと結果画面の材料が揃う
{
  const st = freshRun([member(401, 'ベテラン', { hp: 900, atk: 90, def: 40, spd: 20 })], [401]);
  st.roster[0].record.battles = 7; st.roster[0].record.downed = 0;
  Game.deploy();
  assert((st.lastBattle.earned || []).some(e => e.traitId === 'hardy'),
    '8戦目の決着で頑丈が lastBattle.earned に入る');
  assert(st.lastBattle.notes.some(n => /【頑丈】になった/.test(n)), 'notes にも残る');
}

// 8. 傭兵には付かない／旧セーブ
{
  const st = freshRun([member(501, 'ヤトイ', { mercenary: true })], [501]);
  st.roster[0].record.battles = 20;
  assert(Game.grantExperienceTraits([]).length === 0, '傭兵には付かない');
}
{
  Game.newRun();
  const st = Game.state;
  st.roster = [{ uid: 601, tplId: 'orc', name: '旧人', race: 'オーク', job: '兵',
    hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [] }];
  Game.migrateState();
  assert(Game.memberRecord(st.roster[0]).homeStays === 0, '旧セーブに homeStays が入る');
  assert(Game.grantExperienceTraits([]).length === 0, '旧セーブでも落ちない');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
