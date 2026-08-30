// シナジー定義。check(units) が真なら発動し、apply(units) で戦闘用の mods を書き換える。
// type "merge" のものは出撃時に run.js が特別処理する（キングスライム合体）。
// 条件はUIにはあえて全て表示せず、発動時のみ見せる（プレイヤーの発見を重視）。
const SYNERGIES = [
  {
    id: "goblin_horde",
    name: "ゴブリン軍団",
    desc: "ゴブリンの与ダメージ+30%",
    check(units) { return units.filter(u => u.race === "ゴブリン").length >= 3; },
    apply(units) {
      for (const u of units) if (u.race === "ゴブリン") u.mods.dmgMult *= 1.3;
    }
  },
  {
    id: "king_slime",
    name: "キングスライム",
    desc: "スライム3体が1体に合体する！",
    type: "merge",
    check(units) { return units.filter(u => u.race === "スライム").length >= 3; },
    apply() { /* 出撃時に run.js が合体処理を行う */ }
  },
  {
    id: "legion_of_dead",
    name: "死の軍勢",
    desc: "アンデッドの与ダメージ+30%、死霊術の復活が全快に",
    check(units) {
      const undead = units.filter(u => u.tags.includes("undead")).length;
      const necro = units.some(u => u.traits.includes("necromancy"));
      return necro && undead >= 2;
    },
    apply(units) {
      for (const u of units) {
        if (u.tags.includes("undead")) u.mods.dmgMult *= 1.3;
        if (u.traits.includes("necromancy")) u.mods.necroFull = true;
      }
    }
  },
  {
    id: "arcane_circle",
    name: "魔法結社",
    desc: "魔法職の与ダメージ+40%、火球が敵全体に広がる",
    check(units) { return units.filter(u => u.tags.includes("caster")).length >= 3; },
    apply(units) {
      for (const u of units) {
        if (u.tags.includes("caster")) {
          u.mods.dmgMult *= 1.4;
          u.mods.fireballAll = true;
        }
      }
    }
  },
  {
    id: "cheap_labor",
    name: "低賃金大量採用",
    desc: "全員の与ダメージ+45%",
    check(units) {
      const total = units.reduce((s, u) => s + u.salary, 0);
      return units.length >= 4 && total <= 8;
    },
    apply(units) {
      for (const u of units) u.mods.dmgMult *= 1.45;
    }
  },
  {
    id: "elite_few",
    name: "精鋭主義",
    desc: "全員の与ダメージ+80%・被ダメージ-40%",
    check(units) {
      return units.length > 0 && units.length <= 3 && units.every(u => u.salary >= 5);
    },
    apply(units) {
      for (const u of units) {
        u.mods.dmgMult *= 1.8;
        u.mods.takenMult *= 0.6;
      }
    }
  }
];
