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
    id: "goblin_pair",
    name: "追い剥ぎコンビ",
    condition: "ゴブリン2体以上で出撃",
    desc: "金貨を略奪するたび、次の味方攻撃+25%",
    check(units) { return units.filter(u => u.race === "ゴブリン").length >= 2; },
    apply() { /* 金貨獲得時の発火は battle.js が因果イベントとして処理する */ }
  },
  {
    // 3体で頭打ちの固定値だと、4体目・5体目が何も足さず「全振り」が
    // 報われない。頭数に応じて伸ばすことで、種族を統一するコスト
    // （弱い個体で枠を埋めること）に見合う爆発力を持たせる。
    id: "goblin_horde",
    name: "ゴブリン軍団",
    condition: "軍団にゴブリンが4体以上",
    desc: "出撃したゴブリンの与ダメージ+12%刻み。敵撃破時、さらに1Gを略奪予約",
    // 数えるのは軍団全体（pool）、強くなるのは出撃した者だけ。
    // 出撃5枠で3体そろえる必要が無くなり、他のシナジーと枠を奪い合わなくなる。
    count(units, ctx) { return Synergy.pool(units, ctx).filter(u => u.race === "ゴブリン").length; },
    check(units, ctx) { return this.count(units, ctx) >= 4; },
    apply(units, ctx) {
      const mult = 1 + 0.12 * (this.count(units, ctx) - 3);
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
    condition: "軍団に死霊術師＋アンデッド3体以上",
    desc: "出撃したアンデッドの与ダメージ+22%（3体目以降、1体増えるごとにさらに+22%）、死霊術の復活が全快に",
    // 死霊術師は供養代行で建設部門に置かれることが多い。枠で数えると死の軍勢が永久に立たない。
    count(units, ctx) { return Synergy.pool(units, ctx).filter(u => u.tags.includes("undead")).length; },
    check(units, ctx) {
      const necro = Synergy.pool(units, ctx).some(u => u.traits.includes("necromancy"));
      return necro && this.count(units, ctx) >= 3;
    },
    apply(units, ctx) {
      const mult = 1 + 0.22 * (this.count(units, ctx) - 2);
      for (const u of units) {
        if (u.tags.includes("undead")) u.mods.dmgMult *= mult;
        if (u.traits.includes("necromancy")) u.mods.necroFull = true;
      }
    }
  },
  {
    id: "arcane_circle",
    name: "魔法結社",
    condition: "軍団に魔法職が4体以上",
    desc: "出撃した魔法職の与ダメージ+18%（4体目以降、1体増えるごとにさらに+18%）、火球が敵全体に広がる",
    count(units, ctx) { return Synergy.pool(units, ctx).filter(u => u.tags.includes("caster")).length; },
    check(units, ctx) { return this.count(units, ctx) >= 4; },
    apply(units, ctx) {
      const mult = 1 + 0.18 * (this.count(units, ctx) - 3);
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
  },
  {
    // 重ねがけの2段目。個々のシナジーは足し算で終わるので、
    // 「いくつ同時に立てたか」自体を発火条件にして掛け算の段を作る。
    // 狙うのは強さではなく「揃った瞬間の快感」なので、条件は数だけにして
    // どの組み合わせで到達したかは問わない（毎ラン違う形で壊れる）。
    id: "overload",
    name: "魔王軍完成",
    condition: "シナジーが2つ以上同時発動",
    desc: "同時発動数-1につき、出撃隊全員の与ダメージ+20%",
    meta: true,
    check(units, ctx) { return ((ctx && ctx.activeCount) || 0) >= 2; },
    apply(units, ctx) {
      const stacks = ((ctx && ctx.activeCount) || 0) - 1;
      if (stacks <= 0) return;
      const mult = 1 + 0.2 * stacks;
      for (const u of units) u.mods.dmgMult *= mult;
    }
  },
  {
    id: "martyr_allowance",
    name: "殉職手当",
    condition: "死霊術＋追い剥ぎか強欲",
    desc: "蘇生者の初撃破で2G予約。戦闘終了時に本人が死亡していれば没収",
    check(units) {
      const necromancy = units.some(u => u.traits.includes("necromancy"));
      const economy = units.some(u => u.traits.includes("pickpocket") || u.traits.includes("greedy"));
      return necromancy && economy;
    },
    apply() { /* 発火は蘇生者の撃破時に battle.js が因果イベントとして処理する */ }
  }
];

// ── 混成シナジー（2026-09-05・CodeX 下書き → Claude 調整）──
// 異種の採用で、既存の特性を別の種族に「貸す」。付与は戦闘コピーだけに限定する。
// grant: true の型は《魔王軍完成》の発動数に数えない。
// 必要数は「2体＋2体」を基本にし、8体前後の軍団でも狙って揃う大きさにした（下書きは3体＋2体）。
// 数えると、ゴブリン3〜4体を条件に持つ3件がゴブリン軍だけに+60%を乗せ、
// ゴブリン統一+求人が16%→66%に跳ねた（下書き時の実測）。接続は増やすが、倍率の段は増やさない。
SYNERGIES.push(
  {
    grant: true,
    id: "slime_collection", name: "粘着集金班",
    condition: "軍団にゴブリン2体＋スライム2体、スライムが出撃",
    desc: "出撃スライムに追い剥ぎ。初ダメージで1G予約→味方の強欲へ接続",
    check(units, ctx) {
      const p = Synergy.pool(units, ctx);
      return p.filter(u => u.race === "ゴブリン").length >= 2 && p.filter(u => u.race === "スライム").length >= 2 && units.some(u => u.race === "スライム");
    },
    apply(units) { for (const u of units) if (u.race === "スライム" && !u.traits.includes("pickpocket")) u.traits.push("pickpocket"); }
  },
  {
    grant: true,
    id: "bone_fire", name: "骨炭魔術",
    condition: "軍団に魔法職2体＋アンデッド2体、火球持ちが出撃",
    desc: "火球が敵全体へ広がる。撃破の余剰はOVERKILLと戦意へ",
    check(units, ctx) {
      const p = Synergy.pool(units, ctx);
      return p.filter(u => u.tags.includes("caster")).length >= 2 && p.filter(u => u.tags.includes("undead")).length >= 2 && units.some(u => u.traits.includes("fireball"));
    },
    apply(units) { for (const u of units) if (u.traits.includes("fireball")) u.mods.fireballAll = true; }
  },
  {
    grant: true,
    id: "hound_audit", name: "嗅ぎつける監査",
    condition: "軍団にコボルト2体＋ゴブリン2体、コボルトが出撃",
    desc: "出撃コボルトに強欲。味方の金貨獲得に威力70%で追撃（同じ連鎖で各1回）",
    check(units, ctx) {
      const p = Synergy.pool(units, ctx);
      return p.filter(u => u.race === "コボルト").length >= 2 && p.filter(u => u.race === "ゴブリン").length >= 2 && units.some(u => u.race === "コボルト");
    },
    apply(units) { for (const u of units) if (u.race === "コボルト" && !u.traits.includes("greedy")) u.traits.push("greedy"); }
  },
  {
    grant: true,
    id: "grave_shift", name: "夜勤の引き継ぎ",
    condition: "軍団にゾンビ2体＋骸骨兵2体、ゾンビが出撃",
    desc: "出撃ゾンビに死霊術。倒れた同僚を蘇生→魂の徴収・殉職手当へ",
    check(units, ctx) {
      const p = Synergy.pool(units, ctx);
      return p.filter(u => u.race === "ゾンビ").length >= 2 && p.filter(u => u.race === "骸骨兵").length >= 2 && units.some(u => u.race === "ゾンビ");
    },
    apply(units) { for (const u of units) if (u.race === "ゾンビ" && !u.traits.includes("necromancy")) u.traits.push("necromancy"); }
  },
  {
    grant: true,
    id: "orc_imp_collection", name: "取り立て実習",
    condition: "軍団にオーク2体＋インプ2体、オークが出撃",
    desc: "出撃オークに追い剥ぎ。初ダメージの1G予約で強欲や恐喝帳簿を動かす",
    check(units, ctx) {
      const p = Synergy.pool(units, ctx);
      return p.filter(u => u.race === "オーク").length >= 2 && p.filter(u => u.race === "インプ").length >= 2 && units.some(u => u.race === "オーク");
    },
    apply(units) { for (const u of units) if (u.race === "オーク" && !u.traits.includes("pickpocket")) u.traits.push("pickpocket"); }
  },
  {
    grant: true,
    id: "ogre_account", name: "巨人の成功報酬",
    condition: "軍団にオーガ1体＋ゴブリン3体、オーガが出撃",
    desc: "出撃オーガに強欲。味方の金貨獲得に威力70%で追撃（同じ連鎖で各1回）",
    check(units, ctx) {
      const p = Synergy.pool(units, ctx);
      return p.some(u => u.race === "オーガ") && p.filter(u => u.race === "ゴブリン").length >= 3 && units.some(u => u.race === "オーガ");
    },
    apply(units) { for (const u of units) if (u.race === "オーガ" && !u.traits.includes("greedy")) u.traits.push("greedy"); }
  },
  {
    grant: true,
    id: "imp_salvage", name: "遺品回収係",
    condition: "軍団にインプ2体＋アンデッド2体、インプが出撃",
    desc: "出撃インプに墓守。味方の死亡で魂を回収→アンデッド復帰時の魂の徴収へ",
    check(units, ctx) {
      const p = Synergy.pool(units, ctx);
      return p.filter(u => u.race === "インプ").length >= 2 && p.filter(u => u.tags.includes("undead")).length >= 2 && units.some(u => u.race === "インプ");
    },
    apply(units) { for (const u of units) if (u.race === "インプ" && !u.traits.includes("gravekeeper")) u.traits.push("gravekeeper"); }
  }
);
