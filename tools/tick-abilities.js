// 「人物を戦力ではなく、手段にする」だけを検証する。
//   node tools/tick-abilities.js [本数]
//
// 前回の測定：「誰をどこに置くか」型の介入は、20本中18〜20本が同じ結末だった。
// 今回はそこを一点だけ変える。**その人物がいるから打てる手**を3つ用意し、
// 同じ勇者襲来を何本も回して、手段ごとに何が変わるかを見る。
//
// 見るのは「因果の種類が多いか」ではない（乱数を強くすれば簡単に増え、
// 予測できない＝判断できない、になるだけ）。見るのは次の三つ。
//   ① 手段ごとに結末の傾向が違うか        …選ぶ意味があるか
//   ② 同じ手段なら、だいたい同じになるか  …予測できるか＝学習できるか
//   ③ 勝敗のあとに残るものが手段ごとに違うか …「勝つけど、どの傷を残すか」になるか
const path = require('path');
const C = require(path.resolve(__dirname, '../src/prototype/castle_tick.js'));

function build(seed, opts = {}) {
  const w = C.makeWorld({ seed });
  w.furnaceUnstable = !!opts.unstableFurnace;   // 前回の事故を持ち越した状態
  w.add({ name: "ゴブ太", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "ゴブ次", room: "gate", hp: 26, atk: 5, def: 2, traits: ["coward"] });
  w.add({ name: "ガロ", room: "kitchen", hp: 46, atk: 11, def: 4, traits: ["loyalfoe", "drunk", "brave"], order: "free" });
  w.add({ name: "リゼ", room: "lab", hp: 24, atk: 13, def: 1, traits: ["dutiful", "brave"], magic: true, order: "free", post: "lab" });
  w.add({ name: "ボグリ", room: "yard", hp: 30, atk: 7, def: 3, traits: ["coward"], order: "free", post: "yard" });
  w.add({ name: "ガンツ", room: "gate", hp: 52, atk: 6, def: 7, traits: ["dutiful", "brave"], order: "free", post: "gate" });
  w.add({ name: "モルモ", room: "hall", hp: 10, atk: 1, def: 0, traits: ["coward"], role: "herald", order: "free", post: "hall", noncombat: true });
  for (const h of [["アレン", 52, 11, 3], ["ドルフ", 45, 10, 4], ["ミラ", 27, 10, 2]])
    w.add({ side: "hero", room: "outside", name: h[0], hp: h[1], atk: h[2], def: h[3], traits: ["brave"] });
  return w;
}

const CHOICES = {
  "手を使わない": null,
  "ガロを叩き起こす": { id: "rouse", target: "gate" },
  "魔力炉を過負荷運転": { id: "overload", target: "hall" },
  "ボグリに偽装撤退": { id: "feign", target: "dungeon" }
};

function play(seed, choice, opts) {
  const w = build(seed, opts);
  for (let t = 0; t < 80 && !w.over; t++) {
    if (w.tick === 3 && choice) C.useAbility(w, choice.id, choice.target);
    C.step(w);
  }
  return {
    win: w.over && w.over.kind === "repelled",
    tick: w.over ? w.over.tick : 80,
    lost: w.agents.filter(a => !a.alive && a.side === "demon").map(a => a.name),
    heroLeft: w.agents.filter(a => a.alive && a.side === "hero").length,
    after: C.aftermath(w)
  };
}

const N = Number(process.argv[2] || 20);
const pct = (n) => String(Math.round(n * 100)) + "%";

function report(label, choice, opts) {
  const rows = [];
  for (let s = 1; s <= N; s++) rows.push(play(s, choice, opts));
  const wins = rows.filter(r => r.win).length;
  const afterCount = {};
  for (const r of rows) for (const a of r.after) afterCount[a] = (afterCount[a] || 0) + 1;
  const lostCount = {};
  for (const r of rows) for (const n of r.lost) lostCount[n] = (lostCount[n] || 0) + 1;
  console.log(`\n■ ${label}`);
  console.log(`  撃退 ${pct(wins / N)}（${wins}/${N}）　平均決着 t${(rows.reduce((a, r) => a + r.tick, 0) / N).toFixed(1)}　勇者の生き残り 平均${(rows.reduce((a, r) => a + r.heroLeft, 0) / N).toFixed(1)}人`);
  const after = Object.entries(afterCount).sort((a, b) => b[1] - a[1]);
  console.log(`  あとに残ったもの: ${after.length ? after.map(([k, v]) => `${k} ${pct(v / N)}`).join(" / ") : "なし"}`);
  const lost = Object.entries(lostCount).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(`  よく倒れた者: ${lost.map(([k, v]) => `${k} ${pct(v / N)}`).join(" / ")}`);
  return { label, wins: wins / N, after: afterCount };
}

console.log(`同じ勇者襲来を、手段ごとに ${N} 本ずつ。`);
console.log(`見るのは「選ぶ意味があるか」「予測できるか」「あとに何が残るか」。\n`);
console.log(`【モルモの助言（内部状態を、判断できる言葉にする）】`);
{
  const w = build(1);
  for (const { ability, owner } of C.availableAbilities(w)) {
    console.log(`  ${ability.name.padEnd(12)}「${ability.advise(w, owner)}」`);
  }
  const w2 = build(1, { unstableFurnace: true });
  const ov = C.availableAbilities(w2).find(x => x.ability.id === "overload");
  if (ov) console.log(`  （炉が不安定なとき）「${ov.ability.advise(w2, ov.owner)}」`);
}

const results = [];
for (const [label, choice] of Object.entries(CHOICES)) results.push(report(label, choice));

console.log(`\n■ 魔力炉を過負荷運転（前回の事故で炉が不安定なまま）`);
report("　　同上・炉が不安定", CHOICES["魔力炉を過負荷運転"], { unstableFurnace: true });

console.log(`\n──────── 読み方 ────────`);
const ws = results.map(r => r.wins);
console.log(`① 選ぶ意味: 撃退率の幅 ${pct(Math.min(...ws))}〜${pct(Math.max(...ws))}（差が無ければ手段は飾り）`);
const sets = results.map(r => Object.keys(r.after).sort().join("|"));
console.log(`② 残るもの: ${new Set(sets).size}/${results.length} 通りの組み合わせ（同じなら「どの傷を残すか」にならない）`);
