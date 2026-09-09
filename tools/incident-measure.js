// 事件《スライム大増殖》の手ごとの傾向を測る。
//   node tools/incident-measure.js [本数]
// 見るのは「手ごとに結果の傾向が違うか」「あとに残るものが違うか」。
const path = require('path');
const I = require(path.resolve(__dirname, '../src/prototype/incident_slime.js'));
const N = Number(process.argv[2] || 100);
const pct = n => Math.round(n * 100) + "%";

function play(seed, optionId, opts) {
  const run = I.newRun(Object.assign({ seed }, opts));
  let inc = null, guard = 0;
  while (!inc && guard++ < 12) inc = I.advanceDay(run);
  if (!inc) return null;
  const opt = I.OPTIONS.find(o => o.id === optionId);
  if (opt.kind === "noBattle") return { victory: null, after: I.settle(run, optionId, null), rounds: 0, lost: [] };
  const res = I.buildBattle(run, optionId);
  const after = I.settle(run, optionId, res);
  return { victory: res.victory, rounds: res.rounds, motherDown: res.motherDown,
    lost: res.party.filter(p => !p.survived).map(p => p.name), after };
}

console.log(`各手 ${N} 本ずつ\n`);
for (const opt of I.OPTIONS) {
  const rows = [];
  for (let s = 1; s <= N; s++) { const r = play(s, opt.id); if (r) rows.push(r); }
  if (!rows.length) continue;
  const battles = rows.filter(r => r.victory !== null);
  const wins = battles.filter(r => r.victory).length;
  const afterCount = {}, lostCount = {};
  for (const r of rows) {
    for (const a of r.after) afterCount[a] = (afterCount[a] || 0) + 1;
    for (const n of r.lost) lostCount[n] = (lostCount[n] || 0) + 1;
  }
  console.log(`■ ${opt.name}`);
  if (battles.length) {
    console.log(`  鎮圧 ${pct(wins / battles.length)}　平均${(battles.reduce((a, r) => a + r.rounds, 0) / battles.length).toFixed(1)}R　親撃破 ${pct(battles.filter(r => r.motherDown).length / battles.length)}`);
    console.log(`  倒れた者: ${Object.entries(lostCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / rows.length)}`).join(" / ") || "なし"}`);
  } else console.log(`  戦闘なし`);
  console.log(`  あとに残ったもの: ${Object.entries(afterCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / rows.length)}`).join(" / ")}\n`);
}
// 前回の事故を持ち越したとき
const rows = [];
for (let s = 1; s <= N; s++) { const r = play(s, "burn", { furnaceUnstable: true }); if (r) rows.push(r); }
const w = rows.filter(r => r.victory).length;
const acc = rows.filter(r => r.after.includes("魔力炉が事故を起こした")).length;
console.log(`■ リゼに焼き払わせる（前回の事故で炉が不安定なまま）`);
console.log(`  鎮圧 ${pct(w / rows.length)}　炉の事故 ${pct(acc / rows.length)}`);
