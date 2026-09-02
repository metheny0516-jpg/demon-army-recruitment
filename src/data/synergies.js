// シナジー定義。check(units) が真なら発動し、apply(units) で戦闘用の mods を書き換える。
// type "merge" のものは出撃時に run.js が特別処理する（キングスライム合体）。
// 能力と発火条件はUIで公開し、複数能力を組み合わせた結果と壊れ方をプレイヤーが発見する。
const SYNERGIES = [
  {
    id: "general_command",
    name: "将軍の号令",
    condition: "将軍が1体以上",
    desc: "将軍が率いる出撃隊は全員の与ダメージ+15%",
    check(units) { return units.some(u => u.rankId === "general"); },
    apply(units) {
      for (const u of units) u.mods.dmgMult *= 1.15;
    }
  },
  {
    // 3体で頭打ちの固定値だと、4体目・5体目が何も足さず「全振り」が
    // 報われない。頭数に応じて伸ばすことで、種族を統一するコスト
    // （弱い個体で枠を埋めること）に見合う爆発力を持たせる。
    id: "goblin_horde",
    name: "ゴブリン軍団",
    condition: "ゴブリンが3体以上",
    desc: "ゴブリンの与ダメージ+15%刻み。敵撃破時、さらに1Gを略奪予約",
    count(units) { return units.filter(u => u.race === "ゴブリン").length; },
    check(units) { return this.count(units) >= 3; },
    apply(units) {
      const mult = 1 + 0.15 * (this.count(units) - 2);
      for (const u of units) if (u.race === "ゴブリン") u.mods.dmgMult *= mult;
    }
  },
  {
    id: "king_slime",
    name: "キングスライム",
    condition: "スライム3体で出撃",
    desc: "スライム3体が1体に合体する！",
    type: "merge",
    check(units) { return units.filter(u => u.race === "スライム").length >= 3; },
    apply() { /* 出撃時に run.js が合体処理を行う */ }
  },
  {
    id: "legion_of_dead",
    name: "死の軍勢",
    condition: "死霊術師＋アンデッド2体以上",
    desc: "アンデッドの与ダメージ+30%（2体目以降、1体増えるごとにさらに+30%）、死霊術の復活が全快に",
    count(units) { return units.filter(u => u.tags.includes("undead")).length; },
    check(units) {
      const necro = units.some(u => u.traits.includes("necromancy"));
      return necro && this.count(units) >= 2;
    },
    apply(units) {
      const mult = 1 + 0.3 * (this.count(units) - 1);
      for (const u of units) {
        if (u.tags.includes("undead")) u.mods.dmgMult *= mult;
        if (u.traits.includes("necromancy")) u.mods.necroFull = true;
      }
    }
  },
  {
    id: "arcane_circle",
    name: "魔法結社",
    condition: "魔法職が3体以上",
    desc: "魔法職の与ダメージ+35%（3体目以降、1体増えるごとにさらに+35%）、火球が敵全体に広がる",
    count(units) { return units.filter(u => u.tags.includes("caster")).length; },
    check(units) { return this.count(units) >= 3; },
    apply(units) {
      const mult = 1 + 0.35 * (this.count(units) - 2);
      for (const u of units) {
        if (u.tags.includes("caster")) {
          u.mods.dmgMult *= mult;
          u.mods.fireballAll = true;
        }
      }
    }
  },
  {
    id: "cheap_labor",
    name: "低賃金大量採用",
    condition: "4体以上かつ給与総額8G以下",
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
    condition: "3体以下かつ全員の給与5G以上",
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
