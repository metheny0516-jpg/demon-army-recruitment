// 敵編成の揺らぎが「見える差」であり、戻る操作で引き直せないことを検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const ENEMY_STAGES = vm.runInContext('ENEMY_STAGES', ctx);
const MISSION_TYPES = vm.runInContext('MISSION_TYPES', ctx);
const invade = MISSION_TYPES.find(m => m.id === 'invade');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const power = units => units.reduce((sum, u) => sum + u.hp + u.atk * 3 + u.def * 2 + u.spd, 0);

for (const stage of ENEMY_STAGES.slice(0, -1)) {
  assert(stage.variants && stage.variants.length >= 1, `第${stage.stage}段階に代替編成がある`);
  for (const variant of stage.variants) {
    const ratio = power(variant.units) / power(stage.units);
    assert(ratio >= 0.88 && ratio <= 1.12,
      `第${stage.stage}段階 ${variant.name} の総合力が基本編成の±12%以内 (${ratio.toFixed(2)})`);
    assert(variant.name && variant.hint, `${variant.name} は出撃前に特徴を説明できる`);
  }
}
assert(!(ENEMY_STAGES[7].variants || []).length, '最終戦の勇者アレン一行は固定編成');

Game.newRun();
const st = Game.state;
const seen = new Set();
st.conquest = 3;
for (let i = 0; i < 40; i++) seen.add(Game.buildMission(invade).formationId);
assert(seen.has('standard') && seen.has('pilgrim_guard'), '同じ攻略段階でも通常・代替の両編成が抽選される');

st.conquest = 2;
st.roster = [{
  uid: 1, tplId: 'goblin', name: '試験兵', race: 'ゴブリン', job: '兵士',
  hp: 10, atk: 3, def: 1, spd: 2, salary: 3, loyalty: 70,
  traits: [], tags: [], department: 'combat', unpaid: false
}];
st.activeUids = [1];
Game.prepareMissions(true);
const before = st.missionOffers.map(m => `${m.missionKind}:${m.formationId}`).join('|');
Game.selectMission(0);
Game.backToMissions();
const after = st.missionOffers.map(m => `${m.missionKind}:${m.formationId}`).join('|');
assert(after === before, '編成画面から戻っても敵編成を引き直せない');
assert(st.missionOffers.every(m => m.formationName && m.formationHint), '全作戦カードに編成名と攻略ヒントがある');

console.log('✓ P4: 敵編成の揺らぎが事前開示され、作戦会議中は固定される');
