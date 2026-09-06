// 特性定義。ロジックはフック関数として持ち、battle.js が呼び出す。
// フック:
//   modDealt(ctx)  与ダメージ倍率を変更 (ctx.mult に乗算し、ctx.notes に発動名を積む)
//   modTaken(ctx)  被ダメージを変更して返す (ctx.dmg を読み、数値を返す)
//   postAttack(ctx) 攻撃後の追加効果 (火球・デバフ等)
//   onTriggeredEvents(ctx) postAttack群が生成したイベントへ反応（資源獲得→追加行動など）
//   onRoundEnd(ctx) ラウンド終了時 (再生・蘇生等。死亡中も呼ばれるので unit.alive を確認)
//   onLethal(ctx)  致死ダメージを受けた瞬間。true を返すと HP1 で耐える
const TRAITS = {
  coward: {
    name: "卑怯者",
    desc: "敵のHPが50%以下ならダメージ+50%",
    modDealt(ctx) {
      if (ctx.target.hp <= ctx.target.maxHp * 0.5) {
        ctx.mult *= 1.5;
        ctx.notes.push("卑怯者");
      }
    }
  },
  pack: {
    name: "群れの本能",
    desc: "生存中の同種族の味方1体につきダメージ+10%",
    modDealt(ctx) {
      const n = ctx.allies.filter(u => u.alive && u !== ctx.attacker && u.race === ctx.attacker.race).length;
      if (n > 0) {
        ctx.mult *= 1 + 0.1 * n;
        ctx.notes.push(`群れの本能x${n}`);
      }
    }
  },
  first_strike: {
    name: "先制",
    desc: "ラウンド1のダメージ+30%",
    modDealt(ctx) {
      if (ctx.round === 1) {
        ctx.mult *= 1.3;
        ctx.notes.push("先制");
      }
    }
  },
  loyal_dog: {
    name: "忠犬",
    // 消さずに閾値を下げた。忠誠80は給与・食料・残業で削られて実プレイでは届かず、
    // 24ランの計測で所持4回に対して発火0だった。ただしこれは**忠誠を戦闘火力へ
    // 変える唯一の接続**で、消すと「払う・食わせる」判断が戦場から切れてしまう。
    // 孤児として削除する代わりに、届く距離（70）へ寄せてある。
    desc: "忠誠70以上ならダメージ+30%",
    modDealt(ctx) {
      if ((ctx.attacker.loyalty ?? 0) >= 70) {
        ctx.mult *= 1.3;
        ctx.notes.push("忠犬");
      }
    }
  },
  brute: {
    name: "怪力",
    desc: "20%の確率でダメージ2倍",
    modDealt(ctx) {
      if (ctx.rng() < 0.2) {
        ctx.mult *= 2;
        ctx.notes.push("怪力");
      }
    }
  },
  rage_unpaid: {
    name: "血の気",
    desc: "給与が未払いだとダメージ+60%",
    modDealt(ctx) {
      if (ctx.attacker.unpaid) {
        ctx.mult *= 1.6;
        ctx.notes.push("血の気");
      }
    }
  },
  pickpocket: {
    name: "追い剥ぎ",
    desc: "自身が敵へ初めてダメージを与えたとき、勝利時に1Gを略奪",
    links: { emits: ["金貨獲得"] },
    postAttack(ctx) {
      const u = ctx.attacker;
      if (ctx.dmg <= 0 || u.flags.pickpocketUsed) return;
      u.flags.pickpocketUsed = true;
      ctx.gainResource("gold", 1, "追い剥ぎ");
    }
  },
  greedy: {
    name: "強欲",
    desc: "味方が金貨獲得：威力70%で追撃（各人、同じ連鎖で1回）",
    links: { reacts: ["金貨獲得"], emits: ["追加攻撃"] },
    onTriggeredEvents(ctx) {
      const gold = ctx.events.find(e => e.type === "resource_gain" && e.resource === "gold");
      if (!gold) return;
      const used = ctx.attacker.flags.greedyChains || (ctx.attacker.flags.greedyChains = {});
      if (used[gold.chainId]) return;
      used[gold.chainId] = true;
      ctx.extraAction(0.7, gold, "強欲");
    }
  },
  big_eater: {
    name: "大食漢",
    desc: "戦闘糧食を食べられた戦闘では与ダメージ+25%",
    links: { reacts: ["食料消費"] }
  },
  demon_cook: {
    name: "魔界料理人",
    desc: "戦闘糧食1消費につき、最も食欲旺盛な味方の与ダメージ+8%（最大80%）",
    links: { reacts: ["食料消費"], emits: ["食事強化"] }
  },
  starved: {
    name: "飢餓適応",
    desc: "3戦続けて飢えを生き延びた体。もう食料を消費しないが、最大HPは15%痩せた",
    links: { reacts: ["食料不足"], emits: ["食料0"] }
  },
  hunger_demon: {
    name: "飢餓の悪魔",
    desc: "戦闘糧食で食料が0になった瞬間、全軍与ダメージ×2・被ダメージ+30%",
    links: { reacts: ["食料0"] }
  },
  tough_skin: {
    name: "硬皮",
    desc: "受けるダメージ-2（最低1）",
    modTaken(ctx) {
      return Math.max(1, ctx.dmg - 2);
    }
  },
  slime_body: {
    name: "粘体",
    desc: "受けるダメージ-30%",
    modTaken(ctx) {
      return Math.max(1, Math.round(ctx.dmg * 0.7));
    }
  },
  regen: {
    name: "再生",
    desc: "ラウンド終了時、最大HPの10%回復",
    onRoundEnd(ctx) {
      const u = ctx.unit;
      if (u.alive && u.hp < u.maxHp) {
        const heal = Math.min(u.maxHp - u.hp, Math.ceil(u.maxHp * 0.1));
        u.hp += heal;
        ctx.log(`　${u.name}の【再生】 HPが${heal}回復`, "trait");
      }
    }
  },
  bone: {
    name: "白骨",
    desc: "一度だけ致死ダメージをHP1で耐える",
    onLethal(ctx) {
      if (!ctx.unit.flags.boneUsed) {
        ctx.unit.flags.boneUsed = true;
        ctx.log(`　${ctx.unit.name}の【白骨】 砕けても骨は残る！ HP1で耐えた`, "trait");
        return true;
      }
      return false;
    }
  },
  tenacity: {
    name: "執念",
    desc: "死亡後、ラウンド終了時に25%でHP30%で自力復活（1戦闘1回）",
    // 全滅した瞬間にも、敗北確定前の救済フックとしてだけ実行してよい。
    rescueOnWipe: true,
    onRoundEnd(ctx) {
      const u = ctx.unit;
      if (!u.alive && !u.flags.selfRevived && ctx.rng() < 0.25) {
        u.flags.selfRevived = true;
        u.alive = true;
        u.hp = Math.max(1, Math.round(u.maxHp * 0.3));
        ctx.log(`　${u.name}の【執念】 死してなお起き上がる！`, "revive");
      }
    }
  },
  fireball: {
    name: "火球",
    desc: "攻撃時、別の敵1体にも50%のダメージ（魔法結社で全体化）",
    postAttack(ctx) {
      const others = ctx.enemies.filter(u => u.alive && u !== ctx.target);
      if (others.length === 0) return;
      const targets = ctx.attacker.mods.fireballAll ? others : [ctx.pick(others)];
      for (const t of targets) {
        const d = Math.max(1, Math.round(ctx.dmg * 0.5));
        ctx.dealRaw(ctx.attacker, t, d, "火球");
      }
    }
  },
  necromancy: {
    name: "死霊術",
    desc: "ラウンド終了時、死亡した味方1体をHP50%で復活（1戦闘1回。死の軍勢で全快に）",
    links: { reacts: ["味方死亡"], emits: ["蘇生", "アンデッド化"] },
    onRoundEnd(ctx) {
      const u = ctx.unit;
      if (!u.alive || u.flags.necroUsed) return;
      const dead = ctx.allies.find(a => !a.alive && !a.flags.beingRevived);
      if (!dead) return;
      u.flags.necroUsed = true;
      dead.alive = true;
      const ratio = u.mods.necroFull ? 1.0 : 0.5;
      dead.hp = Math.max(1, Math.round(dead.maxHp * ratio));
      if (!dead.tags.includes("undead")) dead.tags.push("undead");
      dead.flags.reviveSourceId = u.id;
      dead.flags.reviveTraitId = "necromancy";
      ctx.log(`　${u.name}の【死霊術】 ${dead.name}がアンデッドとして蘇った！`, "revive");
    }
  },
  gravekeeper: {
    name: "墓守",
    desc: "味方が初めて死亡するたび魂を1獲得（召喚物を除く）",
    links: { reacts: ["味方死亡"], emits: ["魂獲得"] }
  },
  soul_harvest: {
    name: "魂の徴収",
    desc: "味方の蘇生時、魂1を消費して生存中のアンデッド与ダメージ+20%（最大5回）",
    links: { reacts: ["蘇生", "召喚", "魂獲得"], emits: ["アンデッド強化"] }
  },
  chain_massacre: {
    name: "連鎖虐殺",
    desc: "100%以上OVERKILL：余剰の30%→40%→50%を次の敵へ伝播（最大3体）",
    links: { reacts: ["OVERKILL"], emits: ["伝播攻撃", "連鎖"] }
  },
  mischief: {
    name: "悪戯",
    desc: "攻撃した敵の攻撃力を1下げる",
    postAttack(ctx) {
      if (ctx.target.alive && ctx.target.atk > 1) {
        ctx.target.atk -= 1;
        ctx.log(`　${ctx.attacker.name}の【悪戯】 ${ctx.target.name}の攻撃力が下がった`, "trait");
      }
    }
  },
  hero_awaken: {
    name: "覚醒",
    desc: "自身のHPが50%以下になると覚醒し、以後ダメージ+50%（1戦闘1回）",
    modDealt(ctx) {
      const u = ctx.attacker;
      if (!u.flags.awakened && u.hp <= u.maxHp * 0.5) {
        u.flags.awakened = true;
        u.mods.dmgMult *= 1.5;
        ctx.mult *= 1.5;
        ctx.notes.push("覚醒");
      }
    }
  },

  // ---- 連鎖段数を参照する能力群（設計原則 第4節「既存要素との接続数」） ----
  // 共通の入力は ctx.chainDepth（この行動が鎖の何段目か）だけ。
  // 「伸ばす役（押し出し）／深さを火力にする役（深追い・深淵の恐怖）／
  //   深さを資源にする役（歩合）」がそろって初めて壊れる。
  // 代償は戦闘の外にある。深い連鎖は戦闘後に「残業」として忠誠と食料を削る。
  escalate: {
    name: "深追い",
    desc: "連鎖3段目以降、1段深まるごとにダメージ+60%",
    links: { reacts: ["伝播攻撃", "連鎖"], emits: ["OVERKILL"] },
    modDealt(ctx) {
      const over = (ctx.chainDepth || 1) - 2;
      if (over <= 0) return;
      ctx.mult *= 1 + 0.6 * over;
      ctx.notes.push(`深追い${ctx.chainDepth}段`);
    }
  },
  deep_dread: {
    name: "深淵の恐怖",
    desc: "連鎖が深いほど敵の防御を無視（1段につき15%・最大75%）",
    links: { reacts: ["伝播攻撃", "連鎖"] },
    modDealt(ctx) {
      const over = (ctx.chainDepth || 1) - 1;
      if (over <= 0) return;
      ctx.defIgnore = Math.max(ctx.defIgnore || 0, Math.min(0.75, 0.15 * over));
      ctx.notes.push(`深淵の恐怖${Math.round(ctx.defIgnore * 100)}%`);
    }
  },
  // 押し出し・歩合はフックを持たない。battle.js が連鎖の構造そのものを見て発火する
  // （どちらも「鎖の中でしか意味を持たない」ため、攻撃単体のフックでは書けない）。
  relay_kick: {
    name: "押し出し",
    desc: "連鎖の中で仲間が敵を倒すと、まだ動いていない自分が威力60%で追撃（1鎖1回）",
    links: { reacts: ["伝播攻撃", "連鎖"], emits: ["連鎖"] }
  },
  chain_toll: {
    name: "歩合",
    desc: "連鎖が3段目に達するたび、深さに応じた金貨を略奪予約（1鎖1回）",
    links: { reacts: ["伝播攻撃", "連鎖"], emits: ["金貨獲得"] }
  }
};
