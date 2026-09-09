// 魔王城 tick エンジンの生ログを出す。
//   node tools/tick-sim.js [seed] [tick数]
//   node tools/tick-sim.js --runs 5      連続5本を続けて出す
//
// **出てきたものを編集せずに読むための道具。** 面白い回だけを選んで見せない。
// 「世界が勝手に回っている」が成立していなければ、ここで退屈なログが出るはずである。
const path = require('path');
const C = require(path.resolve(__dirname, '../src/prototype/castle_tick.js'));

// 城の顔ぶれ。プレイヤーが採用した結果のつもりで、固定で置く。
// 特性は規則の入口でしかない。個別の筋書きはどこにも書いていない。
function setup(seed) {
  const w = C.makeWorld({ seed });
  // 魔王軍
  w.add({ name: "ゴブ太", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "ゴブ次", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "ゴブ三", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "オーク隊長ガロ", room: "kitchen", hp: 46, atk: 11, def: 4, traits: ["loyalfoe", "drunk", "brave"], order: "free" });
  w.add({ name: "スライムぷに", room: "dungeon", hp: 34, atk: 4, def: 5, traits: ["lazy"], order: "free" });
  w.add({ name: "魔術師リゼ", room: "lab", hp: 24, atk: 13, def: 1, traits: ["dutiful", "curious", "brave"], order: "free", post: "lab" });
  w.add({ name: "門番ガンツ", room: "yard", hp: 52, atk: 6, def: 7, traits: ["dutiful", "brave"], order: "free", post: "gate" });
  w.add({ name: "モルモ", room: "hall", hp: 10, atk: 1, def: 0, traits: ["coward"], role: "herald", order: "free", post: "hall", noncombat: true });
  // 勇者一行
  const hero = { side: "hero", room: "outside" };
  w.add(Object.assign({ name: "勇者アレン", hp: 60, atk: 12, def: 4, traits: ["brave"] }, hero));
  w.add(Object.assign({ name: "戦士ドルフ", hp: 52, atk: 10, def: 5, traits: ["brave"] }, hero));
  w.add(Object.assign({ name: "賢者ミラ", hp: 30, atk: 11, def: 2, traits: [] }, hero));
  return w;
}

function runOne(seed, maxTicks) {
  const w = setup(seed);
  const lines = [];
  for (let t = 0; t < maxTicks && !w.over; t++) {
    const before = w.log.length;
    C.step(w);
    const fresh = w.log.slice(before);
    if (!fresh.length) continue;
    lines.push({ tick: w.tick, rows: fresh });
  }
  return { w, lines };
}

function render(seed, maxTicks) {
  const { w, lines } = runOne(seed, maxTicks);
  const out = [];
  out.push(`════ seed ${seed} ════`);
  for (const { tick, rows } of lines) {
    // 部屋ごとにまとめる。どこで何が起きているかが読めないと意味がない。
    const byRoom = {};
    for (const r of rows) (byRoom[r.room] = byRoom[r.room] || []).push(r);
    out.push(`\n[t${String(tick).padStart(2)}]`);
    for (const [room, rs] of Object.entries(byRoom)) {
      out.push(`  《${C.ROOMS[room].name}》`);
      for (const r of rs) out.push(`    ${r.text}${r.cause ? `  ←${r.cause}` : ""}`);
    }
  }
  out.push(`\n── 結末 ── ${w.over ? (w.over.kind === "throne_reached" ? `玉座到達（t${w.over.tick}）` : `撃退（t${w.over.tick}）`) : "決着せず"}`);
  const dead = w.agents.filter(a => !a.alive).map(a => a.name);
  out.push(`戦没: ${dead.length ? dead.join("、") : "なし"}`);
  out.push(`生存: ${w.agents.filter(a => a.alive).map(a => `${a.name}(${a.hp})`).join(" ")}`);
  // 因果の連なりを1本だけ辿って見せる（作文ではなく台帳から）
  const chains = w.events.filter(e => e.type === "decide" && e.cause);
  if (chains.length) {
    out.push(`\n── 因果（台帳から機械的に復元）──`);
    for (const d of chains.slice(0, 6)) {
      const cause = w.events.find(e => e.id === d.cause);
      out.push(`  ${d.whoName} が動いた ← ${cause ? C.describe(cause) : "?"} ［規則: ${d.rule}］`);
    }
  }
  return out.join("\n");
}

const args = process.argv.slice(2);
if (args[0] === "--runs") {
  const n = Number(args[1] || 5);
  for (let i = 1; i <= n; i++) console.log(render(i, 60) + "\n");
} else {
  console.log(render(Number(args[0] || 1), Number(args[1] || 60)));
}
