// tick エンジンの「本数を跨いだ多様性」を測る。
//   node tools/tick-measure.js [本数]
//
// 見るのは勝率ではない。**同じ設定で回したとき、結末と因果が何種類に分かれるか**である。
// 1本のログが面白くても、20本が同じなら「毎回同じ映画」であって世界ではない。
// 介入の有無・種類でこの数字が動かなければ、プレイヤーがいる意味が無いということ。
const path = require('path');
const C = require(path.resolve(__dirname, '../src/prototype/castle_tick.js'));

function build(seed) {
  const w = C.makeWorld({ seed });
  w.add({ name: "ゴブ太", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "ゴブ次", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "ゴブ三", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "ガロ", room: "kitchen", hp: 46, atk: 11, def: 4, traits: ["loyalfoe", "drunk", "brave"], order: "free" });
  w.add({ name: "ぷに", room: "dungeon", hp: 34, atk: 4, def: 5, traits: ["lazy"], order: "free" });
  w.add({ name: "リゼ", room: "lab", hp: 24, atk: 13, def: 1, traits: ["dutiful", "curious", "brave"], order: "free", post: "lab" });
  w.add({ name: "ガンツ", room: "yard", hp: 52, atk: 6, def: 7, traits: ["dutiful", "brave"], order: "free", post: "gate" });
  w.add({ name: "モルモ", room: "hall", hp: 10, atk: 1, def: 0, traits: ["coward"], role: "herald", order: "free", post: "hall", noncombat: true });
  for (const h of [["アレン", 60, 12, 4], ["ドルフ", 52, 10, 5], ["ミラ", 30, 11, 2]])
    w.add({ side: "hero", room: "outside", name: h[0], hp: h[1], atk: h[2], def: h[3], traits: ["brave"] });
  return w;
}
const find = (w, n) => w.agents.find(a => a.name === n);

// 魔王の方針。どれも「誰をどこに置くか」でしかない点に注意（後述）。
const POLICIES = {
  "介入なし": () => {},
  "全員を大広間へ集める": (w, t) => {
    if (t !== 3) return;
    for (const n of ["ガロ", "リゼ", "ぷに", "ガンツ"]) {
      const a = find(w, n); if (a && a.alive) C.intervene(w, { kind: "send", who: a.id, room: "hall" });
    }
  },
  "門を捨てて奥で待つ": (w, t) => {
    if (t === 2) for (const n of ["ゴブ太", "ゴブ次", "ゴブ三", "ガンツ"]) {
      const a = find(w, n); if (a && a.alive) C.intervene(w, { kind: "pull", who: a.id, room: "hall" });
    }
    if (t === 4) C.intervene(w, { kind: "seal", from: "gate", to: "yard" });
  },
  "経路を封じて食堂へ誘う": (w, t) => {
    if (t === 2) C.intervene(w, { kind: "seal", from: "gate", to: "hall" });
    if (t === 5) { const a = find(w, "リゼ"); if (a && a.alive) C.intervene(w, { kind: "send", who: a.id, room: "kitchen" }); }
  }
};

const N = Number(process.argv[2] || 20);
console.log(`各方針 ${N} 本ずつ。見るのは勝率ではなく「何種類に分かれるか」。\n`);
console.log("方針".padEnd(22) + "結末".padEnd(34) + "因果の種類  戦没の顔ぶれ  決着tick");
for (const [name, policy] of Object.entries(POLICIES)) {
  const outcomes = {}, chains = new Set(), dead = new Set(), ticks = [];
  for (let s = 1; s <= N; s++) {
    const w = build(s);
    for (let t = 0; t < 80 && !w.over; t++) { policy(w, w.tick + 1); C.step(w); }
    const k = w.over ? (w.over.kind === "throne_reached" ? "玉座到達(敗北)" : "撃退") : "決着せず";
    outcomes[k] = (outcomes[k] || 0) + 1;
    ticks.push(w.over ? w.over.tick : 80);
    chains.add(w.events.filter(e => e.type === "decide").map(e => e.whoName + ":" + e.rule).join(">"));
    dead.add(w.agents.filter(a => !a.alive && a.side === "demon").map(a => a.name).sort().join(","));
  }
  console.log(
    name.padEnd(22) +
    Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join(" / ").padEnd(34) +
    `${String(chains.size).padStart(4)}/${N}` +
    `${String(dead.size).padStart(11)}/${N}` +
    `   ${Math.min(...ticks)}〜${Math.max(...ticks)}`
  );
}
console.log(`
読み方：因果の種類が本数に近ければ「毎回ちがう」。1〜数種類なら「毎回同じ映画」。
方針を変えても結末の内訳が動かないなら、その介入は世界を分岐させていない。`);
