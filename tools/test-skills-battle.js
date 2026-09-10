// 種族技の戦闘契約。解放・成長は test-skills-run.js（コミットC）で扱う。
// node tools/test-skills-battle.js
const fs = require("fs"), vm = require("vm");
const files = ["src/data/traits.js", "src/data/skills.js", "src/data/battle_happenings.js", "src/data/monsters.js",
  "src/data/promotions.js", "src/data/synergies.js", "src/data/enemies.js", "src/core/util.js", "src/core/synergy.js", "src/core/battle.js"];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
vm.runInContext("U.chance = () => true; U.pick = a => a[0]; U.rand = () => 0;", ctx);
const Battle = vm.runInContext("Battle", ctx);
let failed = 0;
const assert = (condition, text) => {
  if (condition) console.log(`✓ ${text}`);
  else { failed++; console.log(`✗ ${text}`); }
};
const mk = (name, traits, side, extra) => Battle.makeUnit(Object.assign({
  uid: name, name, race: "オーク", hp: 100, atk: 20, def: 0, spd: 10, traits, tags: [], loyalty: 80
}, extra || {}), side);
const run = (players, enemies) => Battle.simulate(players, enemies, { incidents: false });
const triggers = (result, traitId) => result.timeline.filter(e => e.type === "trait_trigger" && e.traitId === traitId);
const splashes = (result, label) => result.timeline.filter(e => e.type === "splash" && e.label === label);
const rounds = result => {
  let round = 0;
  return result.timeline.map(e => {
    if (e.type === "round_start") round = e.round;
    return Object.assign({ round }, e);
  });
};

// ぶちかまし：3体なら全体＋反動、2体なら通常攻撃だけ。
{
  const ogre = mk("オーガ", ["ogre_charge"], "player", { race: "オーガ", atk: 30, spd: 30 });
  const r = run([ogre], [mk("敵1", [], "enemy", { hp: 500 }), mk("敵2", [], "enemy", { hp: 500 }), mk("敵3", [], "enemy", { hp: 500 })]);
  assert(triggers(r, "ogre_charge").length > 0 && splashes(r, "ぶちかまし").length >= 2 && splashes(r, "反動").some(e => e.toId === ogre.id), "ぶちかましは敵3体で全体へ及び、本人も反動を受ける");
  const reported = r.contribution.find(row => row.uid === "オーガ").dealt;
  const actual = r.timeline.filter(e => (e.type === "attack" || e.type === "splash") && e.fromId === ogre.id && e.toId !== ogre.id).reduce((sum, e) => sum + e.dmg, 0);
  assert(reported === actual, "反動の自傷は被ダメージであり、与ダメージへは数えない");
  const normal = run([mk("オーガ", ["ogre_charge"], "player", { race: "オーガ", spd: 30 })], [mk("敵1", [], "enemy", { hp: 500 }), mk("敵2", [], "enemy", { hp: 500 })]);
  assert(triggers(normal, "ogre_charge").length === 0, "ぶちかましは敵2体では発動しない");
}

// 大火球：奇数ラウンドだけ別標的へ飛び、燃焼は次ラウンド開始に解決する。
{
  const mage = mk("術師", ["great_fireball"], "player", { race: "魔法使い", atk: 30, spd: 30 });
  const r = run([mage], [mk("敵1", [], "enemy", { hp: 1000 }), mk("敵2", [], "enemy", { hp: 1000 }), mk("敵3", [], "enemy", { hp: 1000 })]);
  const all = rounds(r);
  assert(all.some(e => e.round === 1 && e.type === "splash" && e.label === "大火球") && !all.some(e => e.round === 2 && e.type === "splash" && e.label === "大火球"), "大火球はラウンド1だけ別の敵へ飛び、ラウンド2は通常攻撃");
  const start2 = all.findIndex(e => e.type === "round_start" && e.round === 2);
  const burn2 = all.findIndex(e => e.round === 2 && e.type === "splash" && e.label === "燃焼");
  const firstAttack2 = all.findIndex(e => e.round === 2 && e.type === "attack");
  assert(burn2 > start2 && (firstAttack2 < 0 || burn2 < firstAttack2), "燃焼は次ラウンド開始時に先に減る");
  const noTargets = run([mk("術師", ["great_fireball"], "player", { race: "魔法使い", spd: 30 })], [mk("敵", [], "enemy", { hp: 1000 })]);
  assert(triggers(noTargets, "great_fireball").length === 0, "大火球は別の敵がいなければ発動しない");
}

// 血の雄叫び：撃破直後だけ、同一ラウンドの追加は一回。
{
  const orc = mk("オーク", ["blood_howl"], "player", { atk: 40, spd: 30 });
  const r = run([orc], [mk("小敵", [], "enemy", { hp: 10 }), mk("大敵", [], "enemy", { hp: 1000 })]);
  assert(triggers(r, "blood_howl").length > 0 && rounds(r).filter(e => e.round === 1 && e.type === "attack" && e.fromId === orc.id).length === 2, "血の雄叫びは撃破直後に一撃だけ追加する");
  const noKill = run([mk("オーク", ["blood_howl"], "player", { spd: 30 })], [mk("大敵", [], "enemy", { hp: 1000 })]);
  assert(triggers(noKill, "blood_howl").length === 0, "血の雄叫びは撃破なしでは発動しない");
}

// 集団戦法：ゴブリン数−2回。ここでは最初の本人攻撃に続く splash だけ数える。
{
  const check = count => {
    const lead = mk("隊長", ["goblin_tactics"], "player", { race: "ゴブリン", spd: 30 });
    const allies = [lead];
    for (let i = 1; i < count; i++) allies.push(mk(`仲間${i}`, [], "player", { race: "ゴブリン", spd: 1 }));
    const r = run(allies, [mk("的", [], "enemy", { hp: 5000, atk: 1 })]);
    const first = r.timeline.findIndex(e => e.type === "attack" && e.fromId === lead.id);
    let n = 0;
    for (let i = first + 1; i < r.timeline.length && r.timeline[i].type !== "attack"; i++) if (r.timeline[i].label === "集団戦法") n++;
    return { r, n };
  };
  assert(check(3).n === 1 && check(4).n === 2, "集団戦法はゴブリン3体で1回、4体で2回追加する");
  assert(check(2).n === 0, "集団戦法はゴブリン2体では発動しない");
}

// 疾風：速度が最低でもラウンド1先頭、強化はラウンド2まで。
{
  const gale = mk("コボルト", ["gale"], "player", { race: "コボルト", spd: 1, atk: 10 });
  const r = run([gale], [mk("速敵", [], "enemy", { hp: 1000, atk: 1, spd: 50 })]);
  const all = rounds(r);
  assert(all.find(e => e.type === "attack").fromId === gale.id, "疾風はラウンド1に必ず最初に動く");
  assert(triggers(r, "gale").length >= 2 && all.some(e => e.round === 1 && e.type === "attack" && e.traits.includes("疾風")) && all.some(e => e.round === 2 && e.type === "attack" && e.traits.includes("疾風")) && !all.some(e => e.round === 3 && e.type === "attack" && e.traits.includes("疾風")), "疾風の+30%はラウンド2までで、3には残らない");
}

// 分裂：一度だけ生存＋分身。二度目の致死は普通に倒れる。
{
  const slime = mk("スライム", ["split"], "player", { race: "スライム", hp: 100, spd: 1 });
  const r = run([slime], [mk("処刑人", [], "enemy", { hp: 1000, atk: 200, spd: 30 })]);
  assert(triggers(r, "split").length === 1 && r.timeline.some(e => e.type === "summon" && e.sourceUnitId === slime.id && /分身/.test(e.unit.name)) && r.timeline.some(e => e.type === "survive" && e.unitId === slime.id && e.hp === 40), "分裂は致死でHP40%の本人と分身を残す");
  assert(r.timeline.some(e => e.type === "death" && e.unitId === slime.id), "分裂は二度目の致死では耐えない");
  const plain = mk("普通スライム", [], "player", { race: "スライム", hp: 100, spd: 1 });
  const noSkill = run([plain], [mk("処刑人", [], "enemy", { hp: 1000, atk: 200, spd: 30 })]);
  assert(!noSkill.timeline.some(e => e.type === "summon" && e.sourceUnitId === plain.id), "分裂を持たない者は分身しない");
}

// 骨の壁：最初だけ肩代わりし、同ラウンド二発目は本来の味方へ通る。
{
  const ally = mk("仲間", [], "player", { hp: 100, spd: 1 });
  const wall = mk("骨兵", ["bone_wall"], "player", { race: "骸骨兵", hp: 100, spd: 1 });
  const r = run([ally, wall], [mk("敵1", [], "enemy", { hp: 1000, atk: 20, spd: 40 }), mk("敵2", [], "enemy", { hp: 1000, atk: 20, spd: 30 })]);
  const hits = rounds(r).filter(e => e.round === 1 && e.type === "attack" && e.fromId.startsWith("e"));
  assert(triggers(r, "bone_wall").length > 0 && hits[0].toId === wall.id && hits[1].toId === ally.id, "骨の壁は最初だけ60%で肩代わりする");
  const noWall = run([mk("仲間", [], "player", { spd: 1 })], [mk("敵", [], "enemy", { hp: 1000, atk: 20, spd: 40 })]);
  assert(triggers(noWall, "bone_wall").length === 0, "骨の壁を持たなければ肩代わりしない");
}

// 腐敗：通常は-2、蘇生後の二回目は-3。
{
  const zombie = mk("ゾンビ", ["decay", "tenacity"], "player", { race: "ゾンビ", hp: 100, atk: 20, spd: 30 });
  const foe = mk("敵", [], "enemy", { hp: 1000, atk: 200, spd: 20 });
  const r = run([zombie], [foe]);
  assert(triggers(r, "decay").length >= 2 && foe.atk === 195, "腐敗は通常-2、蘇生後は-3下げる");
  const plainZombie = mk("ゾンビ", ["decay"], "player", { race: "ゾンビ", hp: 100, atk: 20, spd: 30 });
  const plainFoe = mk("敵", [], "enemy", { hp: 1000, atk: 200, spd: 20 });
  run([plainZombie], [plainFoe]);
  assert(plainFoe.atk === 198, "腐敗は蘇生なしなら-2だけ");
}

// 火遊び：次ラウンドの先頭を後ろへ。最大二回。
{
  const imp = mk("インプ", ["fire_play"], "player", { race: "インプ", hp: 1000, spd: 30 });
  const r = run([imp], [mk("前", [], "enemy", { hp: 1000, atk: 1, spd: 1 }), mk("後", [], "enemy", { hp: 1000, atk: 1, spd: 1 })]);
  const all = rounds(r);
  assert(triggers(r, "fire_play").length === 2 && all.find(e => e.round === 2 && e.type === "attack" && e.fromId === imp.id).toId === "e1", "火遊びは敵先頭を次ラウンドへ押し下げ、二回まで");
  const noMove = run([mk("インプ", ["fire_play"], "player", { race: "インプ", hp: 1000, spd: 30 })], [mk("一人", [], "enemy", { hp: 1000, atk: 1 })]);
  assert(triggers(noMove, "fire_play").length === 0, "火遊びは敵一体では発動しない");
}

// 大召集：死者二名を同じ終了時に戻し、二回目は行わない。
{
  const a = mk("死者A", [], "player", { hp: 20, spd: 1 });
  const b = mk("死者B", [], "player", { hp: 20, spd: 1 });
  const necro = mk("死霊術師", ["grand_summon"], "player", { race: "死霊術師", hp: 100, spd: 1 });
  const r = run([a, b, necro], [mk("敵1", [], "enemy", { hp: 1000, atk: 100, spd: 40 }), mk("敵2", [], "enemy", { hp: 1000, atk: 100, spd: 30 })]);
  assert(triggers(r, "grand_summon").length === 1 && r.timeline.filter(e => e.type === "revive" && [a.id, b.id].includes(e.unitId)).length === 2, "大召集は死者二名を同時にHP50%で戻す（1戦闘1回）");
  const oneDead = run([mk("死者", [], "player", { hp: 20, spd: 1 }), mk("術師", ["grand_summon"], "player", { race: "死霊術師", hp: 100, spd: 1 })], [mk("敵", [], "enemy", { hp: 1000, atk: 100, spd: 40 })]);
  assert(triggers(oneDead, "grand_summon").length === 0, "大召集は死者一名では発動しない");
}

// 大波：HP半分以上だけ別の敵へ届く。
{
  const king = mk("王", ["tidal_wave"], "player", { race: "キングスライム", hp: 100, atk: 20, spd: 30 });
  const r = run([king], [mk("敵1", [], "enemy", { hp: 1000 }), mk("敵2", [], "enemy", { hp: 1000 }), mk("敵3", [], "enemy", { hp: 1000 })]);
  assert(triggers(r, "tidal_wave").length > 0 && splashes(r, "大波").length >= 2, "大波はHP半分以上で敵全体へ届く");
  const hurtKing = mk("王", ["tidal_wave"], "player", { race: "キングスライム", hp: 100, atk: 20, spd: 10 });
  const noWave = run([hurtKing], [mk("敵1", [], "enemy", { hp: 1000, atk: 60, spd: 30 }), mk("敵2", [], "enemy", { hp: 1000, atk: 1 }), mk("敵3", [], "enemy", { hp: 1000, atk: 1 })]);
  assert(triggers(noWave, "tidal_wave").length === 0, "大波はHP半分未満では発動しない");
}

console.log(failed ? `\n${failed} 件失敗` : "\nすべて通過");
process.exit(failed ? 1 : 0);
