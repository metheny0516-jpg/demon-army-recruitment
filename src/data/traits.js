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
    desc: "忠誠80以上ならダメージ+30%",
    modDealt(ctx) {
      if ((ctx.attacker.loyalty ?? 0) >= 80) {
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
    links: { emits: ["金貨獲得"], on: "自分が敵へ初めてダメージを与えたとき", once: true },
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
    links: { reacts: ["金貨獲得"], emits: ["追加攻撃"], on: "味方が金貨を得るたび（同じ連鎖で各1回）" },
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
    desc: "戦闘糧食を食べられた戦闘では与ダメージ+25%。敵を倒すと、その場で飯を食い始めることがある（次の一手が遅れる）",
    links: { reacts: ["食料消費"] },
    // 倒した敵が持っていた飯を食う。効くのは数値ではなく順番：次の行動を一回飛ばす。
    // 一口で少し回復するのは食べた結果であって、これが目的ではない。1戦闘2回まで。
    eat: { chance: 0.35, maxPerBattle: 2, healRate: 0.15 },
    // 食べるのは相手ではなく、相手が持っていた飯。相手が人間なので、ここを曖昧にすると人を食っているように読める。
    // 台詞にも必ず「弁当」「干し肉」「酒」など物を出す。
    lines: {
      eat: [
        "……こいつ、弁当を持ってた。もらうぞ",
        "干し肉だ。悪いな、先に食う",
        "腰の袋に、パンと酒。……戦の途中だが",
        "こいつの携行食、まだ温かい。……食う",
        "チーズだ。こんなもん持って攻めてきたのか"
      ],
      busy: ["まだ食ってる", "……もぐ。待て、あと一口", "パンが固い", "飲み終わってからだ"]
    }
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
    links: { reacts: ["OVERKILL"], emits: ["伝播攻撃"] }
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
  guardian_prayer: {
    name: "回復の祈り",
    desc: "ラウンド終了時、最もHP割合の低い味方をHPの15%回復",
    onRoundEnd(ctx) {
      const u = ctx.unit;
      if (!u.alive) return;
      const target = ctx.allies
        .filter(a => a.alive && a.hp < a.maxHp)
        .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (!target) return;
      const heal = Math.min(target.maxHp - target.hp, Math.ceil(target.maxHp * 0.15));
      if (heal <= 0) return;
      target.hp += heal;
      ctx.log(`　${u.name}の【回復の祈り】 ${target.name}のHPが${heal}回復`, "trait");
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
  // 改造癖。任されたものを勝手に良くしようとする。
  // 生活部門に置くと糧食を樽で寝かせて発酵させ、戦闘で誰か（食べた者）が酔って遅刻する。
  // 本人は戦場にいない。任せた仕事の結果が、あとから戦闘の順番に出る。lines は「酔った側」の台詞。
  // 施設能力+15%のような数値にはしない（オーナー指示）。
  tinkerer: {
    name: "改造癖",
    desc: "任されたものを勝手に良くしようとする。生活部門に置くと糧食が樽で発酵し、戦闘で誰かが酔って遅刻する",
    lines: {
      absent: [
        "{name}殿が……糧食で酔っています。{by}殿が樽で寝かせたそうデス",
        "{name}殿、来られません。今日の糧食、{by}殿が「改良」したとかで……",
        "{name}殿が厨房で寝ています。糧食が、お酒になっていたようデス"
      ],
      absentSelf: [
        "……飯が、回る",
        "誰だ、糧食に何か入れたのは",
        "……うまかったんだ、あれは",
        "動けん。飯のせいだ"
      ],
      arrive: [
        "……悪い、飯で。もう大丈夫だ",
        "あの糧食、誰が作った",
        "腹の中が、まだ揺れてる",
        "来た。……何を食ったんだ、俺は"
      ]
    }
  },
  // 人物の癖を「数値」ではなく「出来事の順番」に効かせる最初の一つ。
  // 2026-09-09 の隔離試作で、攻撃+60%/命中-40%版は笑えず、「杯を置かずに遅刻する」版だけが笑えた。
  // 開戦時に不在で、1〜2ラウンド遅れて summon イベントで到着する（battle.js の lateArrival フック）。
  drunkard: {
    name: "酒好き",
    desc: "開戦時、杯を置くのに手間取る。1〜2ラウンド遅れて戦場に着く",
    lateArrival(ctx) { return 1 + (ctx.rng() < 0.5 ? 1 : 0); },
    // 台詞。absent は開戦時にモルモが言う（本人は居ない）。arrive は本人が着いたときに言う。
    // 増やすときはここに足す。人物ごとの脚本にはしない。
    // 開幕は二拍：モルモが「いない」と言い、本人が舞台裏から一言。到着でもう一言。
    // 毎回同じ決め台詞にしない。候補を数種類持ち、そこから引く。
    lines: {
      absent: [
        "……{name}殿、まだ食堂にいるようデス",
        "{name}殿が見当たりません。……杯の音が、します",
        "{name}殿、まだデス！ もう始まってますヨ！"
      ],
      absentSelf: [
        "……今行く。今",
        "一杯だけのつもりだった",
        "戦は逃げんだろ",
        "誰だ、こんな朝っぱらから攻めてきた奴は",
        "飯の途中だ。……ああ、分かった"
      ],
      arrive: [
        "待たせたな",
        "まだ間に合うか？",
        "……で、どいつを殴ればいい",
        "杯は置いてきた。たぶん",
        "待たせたな。……杯は置いてきた",
        "誰だ、先に始めたのは"
      ]
    }
  }
};
