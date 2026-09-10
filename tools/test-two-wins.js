// 実験：進軍2勝で攻略段階を1つ進める。小数の攻略値で敵段階を壊さないことも固定する。
const fs = require("fs"), vm = require("vm");
const files = [
  "src/data/traits.js", "src/data/skills.js", "src/data/battle_happenings.js", "src/data/monsters.js",
  "src/data/bonds.js", "src/data/promotions.js", "src/data/synergies.js", "src/data/enemies.js",
  "src/data/missions.js", "src/data/counterattack.js", "src/data/departments.js", "src/data/events.js",
  "src/data/demon_kings.js", "src/core/util.js", "src/core/storage.js", "src/core/synergy.js",
  "src/core/battle.js", "src/core/chain.js", "src/core/run.js"
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
const Game = vm.runInContext("Game", ctx);
const MISSION_TYPES = vm.runInContext("MISSION_TYPES", ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

Game.newRun();
const st = Game.state;
const invade = MISSION_TYPES.find(m => m.id === "invade");
assert(invade.conquestDelta === 0.5, "進軍の攻略値は0.5ずつ進む");
Game.applyMissionOutcome(invade, []);
assert(st.conquest === 0.5, "1勝目では攻略0.5に留まる");
assert(Game.stageData().stage === 1 && Game.campaignLevel() === 1, "1勝目は敵段階を進めない");
Game.applyMissionOutcome(invade, []);
assert(st.conquest === 1, "2勝目で攻略1に到達する");
assert(Game.stageData().stage === 2 && Game.campaignLevel() === 2, "2勝目で敵段階が1つ進む");
