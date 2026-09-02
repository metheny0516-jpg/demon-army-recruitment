// キングスライムの特殊経路（合体・戦果台詞・カットイン用イベント）と
// 旧セーブの不足項目補完を、ブラウザなしで確認する軽量スモークテスト。
const fs = require("fs");

global.localStorage = { setItem() {}, getItem() { return null; }, removeItem() {} };

const files = [
  "src/core/util.js", "src/data/traits.js", "src/data/battle_happenings.js", "src/data/monsters.js",
  "src/data/promotions.js", "src/data/synergies.js", "src/data/enemies.js", "src/data/missions.js",
  "src/data/departments.js", "src/data/events.js", "src/data/demon_kings.js", "src/core/storage.js",
  "src/core/synergy.js", "src/core/battle.js", "src/core/run.js"
];
const source = files.map(file => fs.readFileSync(file, "utf8")).join("\n");

new Function(source + `
  Storage.loadRun = () => ({ stage: 1, gold: 10, roster: [], applicants: [], phase: "recruit" });
  if (!Game.load() || Game.state.retriesLeft !== 1 || Game.state.rerollsThisPhase !== 0) {
    throw new Error("old save was not migrated");
  }

  const slime = MONSTER_TEMPLATES.find(t => t.id === "slime");
  const makeSlime = uid => ({
    uid, tplId: slime.id, name: "slime" + uid, race: slime.race, job: slime.jobs[0],
    hp: 26, atk: 5, def: 2, spd: 4, salary: 1, loyalty: 80,
    traits: ["slime_body", "regen"], tags: [], unpaid: false
  });
  Game.newRun();
  Object.assign(Game.state, {
    gold: 10, roster: [makeSlime(1), makeSlime(2), makeSlime(3)], activeUids: [1, 2, 3],
    applicants: [], phase: "formation", uidSeq: 4, selectedMission: null
  });
  const output = Game.deploy();
  const king = output.result.contribution.find(c => c.tplId === "king_slime");
  if (!king || !king.voice) throw new Error("king slime voice missing");
  const mergeEvent = output.result.timeline.find(e => e.type === "synergy" && e.id === "king_slime");
  if (!mergeEvent) {
    throw new Error("king slime cutin event missing");
  }
  if (!mergeEvent.eventId) throw new Error("king slime event id missing");
`)();

console.log("king slime and save migration: ok");
