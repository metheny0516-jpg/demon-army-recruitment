// 経験による共通特性の定義と既存 battle フックの契約。
//   node tools/test-experience-traits.js
const fs = require("fs"), vm = require("vm");
const files = [
  "src/data/traits.js", "src/data/battle_happenings.js", "src/data/monsters.js",
  "src/data/promotions.js", "src/data/synergies.js", "src/data/enemies.js",
  "src/core/util.js", "src/core/synergy.js", "src/core/battle.js"
];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
vm.runInContext("U.chance = () => true; U.pick = xs => xs[0]; U.rand = () => 0.5;", ctx);
const Battle = vm.runInContext("Battle", ctx);
const TRAITS = vm.runInContext("TRAITS", ctx);
const templates = vm.runInContext("MONSTER_TEMPLATES", ctx);
let failed = 0;
const assert = (condition, message) => {
  if (condition) console.log(`✓ ${message}`);
  else { failed++; console.log(`✗ ${message}`); }
};
const mk = (name, traits, side, extra) => Battle.makeUnit(Object.assign({
  uid: name, name, race: "オーク", hp: 1000, atk: 1, def: 0, spd: 1,
  traits, tags: [], loyalty: 80
}, extra || {}), side);
const firstHit = (result, fromId, toId) => result.timeline.find(e =>
  e.type === "attack" && e.fromId === fromId && e.toId === toId);

// 同じ決定的な攻撃を一発だけ比べる。防御などの別の減算要因は入れない。
{
  const plain = mk("通常", [], "player");
  const hardy = mk("頑丈", ["hardy"], "player");
  const enemyA = mk("敵A", [], "enemy", { hp: 1000, atk: 100, spd: 10 });
  const enemyB = mk("敵B", [], "enemy", { hp: 1000, atk: 100, spd: 10 });
  const a = Battle.simulate([plain], [enemyA]);
  const b = Battle.simulate([hardy], [enemyB]);
  const normalHit = firstHit(a, enemyA.id, plain.id);
  const hardyHit = firstHit(b, enemyB.id, hardy.id);
  assert(!!normalHit && !!hardyHit && hardyHit.dmg === Math.round(normalHit.dmg * 0.85),
    "頑丈は同じ被ダメージを85%にする");
}

// 致死を一度だけ止める。敵の速度を上げ、プレイヤーの反撃では倒れないようにする。
{
  const survivor = mk("しぶとい", ["die_hard"], "player", { hp: 10 });
  const enemy = mk("敵", [], "enemy", { hp: 1000, atk: 100, spd: 10 });
  const result = Battle.simulate([survivor], [enemy]);
  const hits = result.timeline.filter(e => e.type === "attack" && e.fromId === enemy.id && e.toId === survivor.id);
  assert(hits.length >= 2 && hits[0].hp === 1 && !hits[0].dead && hits[1].dead,
    "しぶといは一戦闘に一度だけHP1で耐え、次の致死で倒れる");
}

// 白骨とは使用済みフラグを共有しない。指定順でしぶとい→白骨の二回を使う。
{
  const survivor = mk("骨もしぶとい", ["die_hard", "bone"], "player", { hp: 10 });
  const enemy = mk("敵", [], "enemy", { hp: 1000, atk: 100, spd: 10 });
  const result = Battle.simulate([survivor], [enemy]);
  const hits = result.timeline.filter(e => e.type === "attack" && e.fromId === enemy.id && e.toId === survivor.id);
  assert(hits.length >= 3 && hits[0].hp === 1 && !hits[0].dead && hits[1].hp === 1 && !hits[1].dead && hits[2].dead,
    "しぶといと白骨を両方持つ者は致死を二回耐える");
}

{
  const ids = ["hardy", "die_hard", "carried_before", "castle_keeper"];
  const counters = new Set(["battles", "downed", "carried", "homeStays"]);
  for (const id of ids) {
    const trait = TRAITS[id] || {};
    const lines = trait.lines && trait.lines.earned;
    assert(counters.has(trait.earned && trait.earned.counter)
      && Number.isInteger(trait.earned && trait.earned.at) && trait.earned.at > 0,
    `${id} は経験カウンタと正の閾値を宣言する`);
    assert(Array.isArray(lines) && lines.length >= 3
      && lines.every(line => line.length <= 28 && !/[0-9０-９]/.test(line)),
    `${id} は28文字以内・数字なしの獲得台詞を3本以上持つ`);
    assert(typeof trait.relic === "string" && trait.relic.length > 0,
      `${id} は継承用の遺物名を持つ`);
  }
}

{
  const ids = new Set(["hardy", "die_hard", "carried_before", "castle_keeper"]);
  const assigned = templates.flatMap(template => [
    ...(template.traitPool || []),
    ...(template.fixedTraits || []),
    ...(template.fixedTrait ? [template.fixedTrait] : [])
  ]);
  assert(!assigned.some(id => ids.has(id)),
    "経験特性は応募者のtraitPool・fixedTrait(s)に含まれない");
}

console.log(failed ? `\n${failed} 件失敗` : "\nすべて通過");
process.exit(failed ? 1 : 0);
