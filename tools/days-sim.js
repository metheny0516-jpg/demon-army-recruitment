// 10日間を台本どおりに回して、生ログを読む。面白いかは読んで決める。
//   node tools/days-sim.js [seed] [policy]
// policy: pasture（グドを牧場に）/ kitchen（グドを厨房に）
const path = require('path');
const D = require(path.resolve(__dirname, '../src/prototype/castle_days.js'));
const seed = Number(process.argv[2] || 1);
const policy = process.argv[3] || "pasture";

const w = D.newRun({ seed });
const out = [];
const say = s => out.push(s);

// 戦闘の代役（数値だけ）。UI では本物の BattleScene を使う。
function realBattle(w) {
  const party = D.battleParty(w);
  for (const p of w.pending) say(`  ⚡ ${p.text}`); w.pending = [];
  const n = w.facilities.pasture.slimes;
  const res = D.buildSlimeBattle(w, party);
  say(`  ⚔ 鎮圧戦：${party.map(p => p.name).join("・")} vs ${n}匹 → ${res.rounds}R、${res.killed}匹処分（${res.victory ? "生還" : "押し負け"}）`);
  D.afterBattle(w, res);
}

function pick(w) {
  const acts = D.actions(w);
  const byId = id => acts.find(a => a.id === id);
  if (byId("recruit")) return [byId("recruit"), [
    { id: "gudo", place: policy === "kitchen" ? "kitchen" : "pasture" },
    { id: "garo", place: "kitchen" },
    { id: "vira", place: "lab" }]];
  if (byId("seal")) return [byId("seal")];
  if (byId("research") && w.known.regen) return [byId("research")];
  if (byId("fight") && !w.known.regen) return [byId("fight")];
  if (byId("research")) return [byId("research")];
  if (byId("revert")) return [byId("revert")];
  if (byId("cook") && w.day % 3 === 0) return [byId("cook")];
  if (w.day % 3 === 2) return [byId("inspect")];
  const talk = acts.filter(a => a.id === "talk");
  if (talk.length && w.day % 3 === 0) return [talk[(w.day / 3) % talk.length | 0]];
  return [byId("inspect")];
}

while (!w.done) {
  const digest = D.morning(w);
  say(`\n═══ ${w.day}日目 ═══`);
  if (digest.length) { say(`モルモ「おはようございます、魔王様」`); for (const d of digest) say(`  ${d.notable ? "❗" : "・"} ${d.text}`); }
  const [action, payload] = pick(w);
  say(`▶ ${action.name}`);
  const r = D.act(w, action, payload);
  for (const l of r.lines) say(`  ${l}`);
  for (const p of w.pending) say(p.kind === "mormo" ? `  【モルモ】${p.text}` : `  ⚡ ${p.text}`);
  w.pending = [];
  if (r.battle) realBattle(w);
  w.pending = [];
  D.night(w);
  for (const p of w.pending) say(`  【夜・モルモ】${p.text}`);
  w.pending = [];
}
const s = D.summary(w);
say(`\n═══ 10日間の振り返り ═══`);
for (const p of s.people) { say(`${p.name}${p.alive ? "" : "（戦没）"}：命令していないのにやったこと`); for (const u of p.unordered) say(`  ${u}`); }
say(`事件：${s.incident.join(" / ")}`);
say(`最終：スライム${s.slimes}匹 ${s.resolved ? "／収束" : "／未解決"}`);
console.log(out.join("\n"));
