// 《改造癖》run.js 側：生活部門に改造癖の者がいると、出撃の糧食伝票に「発酵」が書かれる。
//   node tools/test-tinkerer-run.js
// battle.js 側（読む側）は test-tinkerer.js。ここは書く側だけを見る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
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
const Battle = vm.runInContext('Battle', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };

// 出撃で Battle.simulate に渡った options を捕まえる（戦闘そのものは本物を走らせる）
let captured = null;
const orig = Battle.simulate;
Battle.simulate = function (p, e, o) { captured = o; return orig.call(this, p, e, o); };

function freshRun() {
  Game.newRun();
  const st = Game.state;
  // 開幕3日は糧食伝票が無い（openingBattle）。通常ループへ入れる（browser-tests/helpers と同じ手順）
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = Math.max(st.food, 10);
  // 開幕スキップ後は名簿が空なので、素のオークを6人入れる（特性なし＝発酵の判定に混ざらない）
  st.roster = [];
  for (let i = 0; i < 6; i++) st.roster.push({ uid: 100 + i, tplId: "orc", name: `オーク${i + 1}`, race: "オーク", job: "兵",
    hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [], department: "combat" });
  st.activeUids = st.roster.slice(0, 5).map(m => m.uid);
  if (st.phase !== "mission") Game.prepareMissions(true);
  Game.selectMission(0);
  return st;
}

// 1. 生活部門に改造癖 → 伝票に発酵が書かれる
{
  const st = freshRun();
  const cook = st.roster.find(m => true);
  const fighters = st.roster.filter(m => m !== cook);
  cook.traits = (cook.traits || []).filter(t => t !== "tinkerer").concat(["tinkerer"]);
  Game.assignDepartment(cook.uid, "life");
  st.activeUids = fighters.slice(0, 5).map(m => m.uid);
  captured = null;
  // 発酵は確率（TRAITS.tinkerer.ferment.chance）。ここでは「起きた回」を固定して伝票の中身を見る
  const U = vm.runInContext('U', ctx);
  const origChance = U.chance;
  U.chance = () => true;
  try { Game.deploy(); } finally { U.chance = origChance; }
  assert(!!captured && !!captured.rations, '出撃で糧食の伝票が battle.js に渡る');
  assert(captured.rations.fermentedBy === cook.uid, '生活部門の改造癖の者が fermentedBy に書かれる');
  assert(captured.rations.fermentedByName === cook.name, '名前も渡る（モルモの一言に出すため）');
}
// 2. 改造癖が戦闘部門にいるだけでは発酵しない（任せた仕事が違う）
{
  const st = freshRun();
  const m = st.roster[0];
  m.traits = (m.traits || []).concat(["tinkerer"]);
  Game.assignDepartment(m.uid, "combat");
  st.activeUids = st.roster.slice(0, 5).map(x => x.uid);
  captured = null;
  Game.deploy();
  assert(!!captured && captured.rations && captured.rations.fermentedBy === null, '戦闘部門にいる改造癖は糧食を触らない');
}
// 3. 生活部門に改造癖がいなければ発酵しない
{
  const st = freshRun();
  Game.assignDepartment(st.roster[0].uid, "life");
  st.activeUids = st.roster.slice(1, 6).map(x => x.uid);
  captured = null;
  Game.deploy();
  assert(!!captured && captured.rations && captured.rations.fermentedBy === null, '改造癖がいなければ伝票に発酵は無い');
}
Battle.simulate = orig;
console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
