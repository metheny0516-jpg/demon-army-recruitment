// 敵の成長の作り替え：通常作戦の敵は征服度だけで決まり、同じ段階で戦うほど「慣れ」で少し強くなる。
// 防衛戦（王国の反撃）は今までどおり魔王軍レベル基準＝時間の圧力はそちらで払う。
//   node tools/test-enemy-growth.js
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
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);
const Game = vm.runInContext('Game', ctx);
const MISSION_TYPES = vm.runInContext('MISSION_TYPES', ctx);
const ENEMY_STAGES = vm.runInContext('ENEMY_STAGES', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 900, atk: 90, def: 40, spd: 20, salary: 3, loyalty: 60, traits: [], tags: [], department: "combat" }, x || {});
function freshRun(extra) {
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false;
  st.applicants = []; st.hiresLeft = 0; st.food = 60; st.gold = 300;
  st.roster = [member(1, 'カタブツ')]; st.activeUids = [1];
  for (const m of st.roster) Game.baseOf(m);
  Game.syncDepartments();
  Object.assign(st, extra || {});
  return st;
}
const invade = MISSION_TYPES.find(t => t.id === 'invade');
const raid = MISSION_TYPES.find(t => t.id === 'raid');
const hp = m => m.units.reduce((s, u) => s + u.hp, 0);

// 1. 通常作戦の段階は征服度で決まり、ターンでは上がらない
{
  const st = freshRun({ conquest: 0, turn: 1 });
  const early = Game.buildMission(invade);
  st.turn = 20;
  const late = Game.buildMission(invade);
  assert(early.baseStage === 1 && late.baseStage === 1, `ターン20でも征服0なら段階1（${early.baseStage}/${late.baseStage}）`);
  assert(hp(early) === hp(late), 'ターンが進んでも敵の能力は同じ（慣れ0・警戒0）');
  st.conquest = 3;
  assert(Game.buildMission(invade).baseStage === 4, '征服3なら進軍の段階は4');
  assert(Game.buildMission(raid).baseStage === 3, '略奪は一段下（offset −1）');
}

// 2. 慣れ：同じ段階で戦うほど +4%、5回で止まる
{
  const st = freshRun({ conquest: 2, turn: 1 });
  const base = Game.buildMission(invade);
  assert(base.familiarity === 0, '戦う前は慣れ0');
  st.stageFights = { 2: 2 };
  const m2 = Game.buildMission(invade);
  assert(m2.familiarity === 8 && hp(m2) > hp(base), `2回戦った段階は +8%（${m2.familiarity}）`);
  st.stageFights = { 2: 9 };
  assert(Game.buildMission(invade).familiarity === 20, '上限は5回分＝+20%');
  st.stageFights = { 1: 9 };
  assert(Game.buildMission(invade).familiarity === 0, '別の段階の慣れは効かない');
}

// 3. 決着で stageFights が増える（勝ち・撤退どちらでも）。防衛戦は数えない
{
  const st = freshRun({ conquest: 1, turn: 1 });
  Game.prepareMissions(true);
  const i = st.missionOffers.findIndex(m => m.missionKind === 'invade');
  Game.selectMission(i); st.phase = 'formation';
  Game.deploy();
  assert((st.stageFights[1] || 0) === 1, `進軍の決着で段階2の回数が1（${JSON.stringify(st.stageFights)}）`);
  st.counterattack = { pending: true, kind: 'punitive', armyName: '討伐隊' };
  st.phase = 'mission'; st.missionOffers = [];
  Game.prepareMissions(true);
  const d = st.missionOffers.findIndex(m => m.missionKind === 'defend');
  assert(d >= 0, '（前提）防衛戦が予約されている');
  const before = JSON.stringify(st.stageFights);
  const defend = st.missionOffers[d];
  assert(defend.familiarity === 0, '防衛戦に慣れは掛からない');
  Game.selectMission(d); st.phase = 'formation';
  Game.deploy();
  assert(JSON.stringify(st.stageFights) === before, '防衛戦の決着では回数が増えない');
}

// 4. 防衛戦（討伐隊）は魔王軍レベル基準＝時間で厚くなる
{
  const st = freshRun({ conquest: 0, turn: 1, counterattack: { pending: true, kind: 'punitive', armyName: '討伐隊' } });
  Game.prepareMissions(true);
  const early = st.missionOffers.find(m => m.missionKind === 'defend');
  const st2 = freshRun({ conquest: 0, turn: 10, counterattack: { pending: true, kind: 'punitive', armyName: '討伐隊' } });
  Game.prepareMissions(true);
  const late = st2.missionOffers.find(m => m.missionKind === 'defend');
  assert(early && late && late.baseStage > early.baseStage, `討伐隊はターンで厚くなる（${early && early.baseStage} → ${late && late.baseStage}）`);
  assert(late.baseStage <= ENEMY_STAGES.length - 1, '討伐隊は段階7まで');
}

// 5. 旧セーブ：stageFights が無くても落ちない
{
  const st = freshRun({ conquest: 1 });
  delete st.stageFights;
  Game.migrateState();
  assert(st.stageFights && typeof st.stageFights === 'object', 'migrate で stageFights が入る');
  assert(Game.buildMission(invade).familiarity === 0, '無い状態からでも作戦が作れる');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
