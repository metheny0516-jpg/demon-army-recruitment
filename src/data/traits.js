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
    relic: "短刀",
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
    relic: "遠吠え笛",
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
    relic: "鈴",
    desc: "ラウンド1のダメージ+30%",
    order: { label: "先制を仕掛けろ", cost: 1, note: "ラウンドに関係なく先制が乗り、真っ先に動く" },
    lines: { order: ["はいっ、参ります！", "一番槍、いただきます！", "誰より早く！"] },
    modDealt(ctx) {
      if (ctx.round === 1 || ctx.ordered) {
        ctx.mult *= 1.3;
        ctx.notes.push("先制");
      }
    }
  },
  loyal_dog: {
    name: "忠犬",
    relic: "首輪",
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
    relic: "こん棒",
    desc: "20%の確率でダメージ2倍",
    // 号令（戦闘中の個人への指示）。魔王が名指しで命じると、次の一撃で技が必ず出る。
    // 条件の代わりに代償を払う（号令の共通規則は battle.js：与ダメ+50%、次の手番は息切れ）。
    order: { label: "怪力を出せ", cost: 1, note: "次の一撃が必ず怪力になる" },
    lines: { order: ["おうよ！", "任せろ、魔王様！", "潰す！"] },
    modDealt(ctx) {
      if (ctx.ordered || ctx.rng() < 0.2) {
        ctx.mult *= 2;
        ctx.notes.push("怪力");
      }
    }
  },
  rage_unpaid: {
    name: "血の気",
    relic: "請求書",
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
    relic: "巾着",
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
    relic: "財布",
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
    relic: "弁当箱",
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
        "チーズだ。こんなもん持って攻めてきたのか",
        "握り飯か。冷める前にもらう",
        "水筒があるな。……喉が渇いた",
        "林檎だ。ひと口だけならいいだろ",
        "干し魚か。戦場にしては上等だ",
        "堅パンだな。噛むのに時間がかかる"
      ],
      busy: [
        "まだ食ってる",
        "……もぐ。待て、あと一口",
        "パンが固い",
        "飲み終わってからだ",
        "今、口いっぱいだ",
        "急かすな。喉につまる",
        "最後のひとかけだ。待て",
        "水筒の蓋が開かん"
      ]
    }
  },
  demon_cook: {
    name: "魔界料理人",
    relic: "エプロン",
    desc: "戦闘糧食1消費につき、最も食欲旺盛な味方の与ダメージ+8%（最大80%）",
    links: { reacts: ["食料消費"], emits: ["食事強化"] }
  },
  starved: {
    name: "飢餓適応",
    relic: "空の椀",
    desc: "3戦続けて飢えを生き延びた体。もう食料を消費しないが、最大HPは15%痩せた",
    links: { reacts: ["食料不足"], emits: ["食料0"] }
  },
  hunger_demon: {
    name: "飢餓の悪魔",
    relic: "空き瓶",
    desc: "戦闘糧食で食料が0になった瞬間、全軍与ダメージ×2・被ダメージ+30%",
    links: { reacts: ["食料0"] }
  },
  tough_skin: {
    name: "硬皮",
    relic: "うろこ",
    desc: "受けるダメージ-2（最低1）",
    modTaken(ctx) {
      return Math.max(1, ctx.dmg - 2);
    }
  },
  slime_body: {
    name: "粘体",
    relic: "水袋",
    desc: "受けるダメージ-30%",
    modTaken(ctx) {
      return Math.max(1, Math.round(ctx.dmg * 0.7));
    }
  },
  regen: {
    name: "再生",
    relic: "尻尾",
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
    relic: "肋骨",
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
    relic: "遺髪",
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
    relic: "杖",
    desc: "攻撃時、別の敵1体にも50%のダメージ（魔法結社で全体化）",
    order: { label: "火球を放て", cost: 1, note: "次の火球が敵全体に広がる" },
    lines: { order: ["承知しました", "詠唱、省きます", "火を、お届けします"] },
    postAttack(ctx) {
      const others = ctx.enemies.filter(u => u.alive && u !== ctx.target);
      if (others.length === 0) return;
      const targets = (ctx.attacker.mods.fireballAll || ctx.ordered) ? others : [ctx.pick(others)];
      for (const t of targets) {
        const d = Math.max(1, Math.round(ctx.dmg * 0.5));
        ctx.dealRaw(ctx.attacker, t, d, "火球");
      }
    }
  },
  necromancy: {
    name: "死霊術",
    relic: "呪符",
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
    relic: "墓標",
    desc: "味方が初めて死亡するたび魂を1獲得（召喚物を除く）",
    links: { reacts: ["味方死亡"], emits: ["魂獲得"] }
  },
  soul_harvest: {
    name: "魂の徴収",
    relic: "香炉",
    desc: "味方の蘇生時、魂1を消費して生存中のアンデッド与ダメージ+20%（最大5回）",
    links: { reacts: ["蘇生", "召喚", "魂獲得"], emits: ["アンデッド強化"] }
  },
  chain_massacre: {
    name: "連鎖虐殺",
    relic: "鎖",
    desc: "100%以上OVERKILL：余剰の30%→40%→50%を次の敵へ伝播（最大3体）",
    links: { reacts: ["OVERKILL"], emits: ["伝播攻撃"] }
  },
  mischief: {
    name: "悪戯",
    relic: "悪戯玉",
    desc: "攻撃した敵の攻撃力を1下げる",
    order: { label: "悪戯を仕込め", cost: 1, note: "次の悪戯で相手の攻撃力を3下げる" },
    lines: { order: ["ひひっ、任せてよ", "いいの？ 本気でやるよ", "ちょっと痛いかもね"] },
    postAttack(ctx) {
      if (ctx.target.alive && ctx.target.atk > 1) {
        ctx.target.atk = Math.max(1, ctx.target.atk - (ctx.ordered ? 3 : 1));
        ctx.log(`　${ctx.attacker.name}の【悪戯】 ${ctx.target.name}の攻撃力が下がった`, "trait");
      }
    }
  },
  guardian_prayer: {
    name: "回復の祈り",
    relic: "数珠",
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
    relic: "額当て",
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
  // 留守番に置くと糧食を樽で寝かせて発酵させ、戦闘で誰か（食べた者）が酔って遅刻する。
  // 本人は戦場にいない。任せた仕事の結果が、あとから戦闘の順番に出る。lines は「酔った側」の台詞。
  // 施設能力+15%のような数値にはしない（オーナー指示）。
  tinkerer: {
    name: "改造癖",
    relic: "工具袋",
    desc: "任されたものを勝手に良くしようとする。留守番にいると糧食が樽で発酵し、戦闘で誰かが酔って遅刻する",
    // 応募者に付く確率（戦闘特性の traitPool とは別枠で独立に抽選。枠を奪って軍を弱くしない）と、
    // 留守番にいるときに「その戦闘の糧食が発酵している」確率。毎回なら癖ではなく税金になる。
    quirk: { species: ["zombie", "kobold"], chance: 0.18 },
    ferment: { chance: 0.4 },
    lines: {
      absent: [
        "{name}殿、糧食で酔ってマス。{by}殿の樽デス",
        "{name}殿が厨房で寝てマス。{by}殿の改良デス",
        "{name}殿、来られません。{by}殿の糧食が酒に",
        "{name}殿が酔って迷子デス。{by}殿の糧食で",
        "{name}殿、樽の前で寝てマス。{by}殿作デス",
        "{name}殿が水を探してマス。{by}殿の仕業デス"
      ],
      absentSelf: [
        "……飯が、回る",
        "誰だ、糧食に何か入れたのは",
        "……うまかったんだ、あれは",
        "動けん。飯のせいだ",
        "床が、勝手に揺れている",
        "少し寝れば、たぶん治る"
      ],
      arrive: [
        "……悪い、飯で。もう大丈夫だ",
        "あの糧食、誰が作った",
        "腹の中が、まだ揺れてる",
        "来た。……何を食ったんだ、俺は",
        "遅れた。樽の匂いはもう抜けた",
        "立てるようになった。行くぞ"
      ]
    }
  },
  // 人物の癖を「数値」ではなく「出来事の順番」に効かせる最初の一つ。
  // 2026-09-09 の隔離試作で、攻撃+60%/命中-40%版は笑えず、「杯を置かずに遅刻する」版だけが笑えた。
  // 開戦時に不在で、1〜2ラウンド遅れて summon イベントで到着する（battle.js の lateArrival フック）。
  drunkard: {
    name: "酒好き",
    relic: "杯",
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
        "{name}殿、まだデス！ もう始まってますヨ！",
        "{name}殿、二日酔いで起きられないそうデス",
        "{name}殿を止めたのですが、もう一杯だけと……",
        "{name}殿、昨夜の賭けで杯を取り返しているそうデス",
        "{name}殿、寝坊して戦場への道も間違えたそうデス",
        "{name}殿から伝言デス。酒場の勘定が終わらない、と"
      ],
      absentSelf: [
        "……今行く。今",
        "一杯だけのつもりだった",
        "戦は逃げんだろ",
        "誰だ、こんな朝っぱらから攻めてきた奴は",
        "飯の途中だ。……ああ、分かった",
        "止めるな。これは景気づけだ",
        "頭が痛い。声を落とせ",
        "道を間違えた。酒場はどっちだ"
      ],
      arrive: [
        "待たせたな",
        "まだ間に合うか？",
        "……で、どいつを殴ればいい",
        "杯は置いてきた。たぶん",
        "待たせたな。……杯は置いてきた",
        "誰だ、先に始めたのは",
        "勘定は済ませた。今度こそ行く",
        "道には迷ったが、敵は見つけた",
        "酔いは醒めた。たぶん",
        "遅刻じゃない。景気づけが長引いただけだ"
      ]
    }
  },
  // 候補。ロジック未実装（proposed）。付与もされない。台詞と「何が起きるか」の言葉だけを先に用意する。
  timid: {
    name: "怖がり",
    relic: "盾",
    proposed: true,
    desc: "味方が倒れると逃げ出そうとする。誰かが引き留めれば踏みとどまる",
    lines: {
      flinch: [
        "む、無理だ。ここから離れる",
        "今のを見たか。次は俺だ",
        "足が勝手に後ろへ……",
        "帰る。帰ってから考える",
        "まだ逃げ道は空いてるな",
        "悪い、勇気を置いてきた"
      ],
      held: [
        "{by}、こっちを見ろ。まだ終わってない",
        "{by}、逃げるなら俺の後ろへ来い",
        "{by}、今は立っているだけでいい",
        "{by}、帰る道は勝ってから探せ",
        "{by}、足が動くなら前へ出ろ",
        "{by}、震えてても武器は持てる"
      ],
      back: [
        "……戻った。置いていくな",
        "逃げ道が、よく分からなかった",
        "まだ生きてる。なら、やる",
        "今のは後退だ。逃げてない",
        "怖いままだが、戻ってきた",
        "次は、先に逃げるなよ"
      ]
    }
  },
  show_off: {
    name: "見栄っ張り",
    relic: "兜",
    proposed: true,
    desc: "開戦時、勝手に最前列へ出る。並びが崩れる",
    lines: {
      front: [
        "先頭は俺だ。よく見てろ",
        "道を開けろ。俺が決める",
        "後ろじゃ顔が見えないだろ",
        "一番槍はもらった",
        "歓声は前で受けるものだ",
        "俺の見せ場から始めるぞ"
      ],
      mormo: [
        "{name}殿が勝手に前へ出ましたデス！",
        "魔王様、{name}殿が隊列を崩していマス！",
        "{name}殿、そこは先頭ではありませんヨ！",
        "ああっ、{name}殿が目立つ方へ行きました！"
      ]
    }
  },

  // ── 経験で身に付く共通特性 ─────────────────────────────
  // 付与判定は後続の run.js が earned を読む。応募者プールへは絶対に入れない。
  hardy: {
    name: "頑丈",
    relic: "胸当て",
    desc: "受けるダメージ-15%",
    earned: { counter: "battles", at: 8, unless: "downed" },
    lines: { earned: ["まだ、倒れる気がしない", "傷の数だけ、立ち方を覚えた", "このくらいなら平気だ"] },
    modTaken(ctx) {
      return Math.max(1, Math.round(ctx.dmg * 0.85));
    }
  },
  die_hard: {
    name: "しぶとい",
    relic: "お守り",
    desc: "一度だけ致死ダメージをHP1で耐える",
    earned: { counter: "downed", at: 2 },
    lines: { earned: ["まだ、帰る番じゃない", "倒れ方だけは覚えた", "今度は、起き上がれる"] },
    onLethal(ctx) {
      if (ctx.unit.flags.dieHardUsed) return false;
      ctx.unit.flags.dieHardUsed = true;
      ctx.log(`　${ctx.unit.name}の【しぶとい】 まだ立てる！ HP1で耐えた`, "trait");
      return true;
    }
  },
  carried_before: {
    name: "担がれ慣れ",
    relic: "担架の布",
    desc: "撤退で担がれても負傷しない",
    earned: { counter: "carried", at: 1 },
    injuryFree: true,
    lines: { earned: ["担がれるなら、もう慣れた", "次は自分で帰るつもりだ", "運ばれ方にも、こつがある"] }
  },
  castle_keeper: {
    name: "城の主",
    relic: "鍵束",
    desc: "留守番のとき食料の調達+1",
    earned: { counter: "homeStays", at: 5 },
    homeFood: 1,
    lines: { earned: ["城の音で、腹が減る刻が分かる", "留守は任せろ。火も見ている", "この城の勝手は、もう知ってる"] }
  },

  // ── 種族技 tier 2 ──────────────────────────────────────
  // フック本体は battle.js 側の対応と同時に追加する。ここでは置換契約と、
  // プレイヤーへ見せる効果・台詞を先に定義して、既存特性には触れない。
  ogre_charge: {
    name: "ぶちかまし",
    desc: "敵が3体以上立っているとき、攻撃が敵全体に本来の70%で及ぶ。本人も与えた合計の10%を反動で受ける。覚えた直後の戦いで一度だけ勝手に出る。以後は号令で",
    skill: { species: "ogre", tier: 2, replaces: "brute" },
    autoLimit: 1,
    order: { label: "ぶちかませ", cost: 3, note: "敵の数に関係なく、次の一撃が全体に及ぶ" },
    lines: {
      unlock: ["……体が、覚えた", "次は全部まとめてだ", "壁ごと押し通る"],
      use: ["どけぇッ！", "まとめて潰す！", "道を開けろ！"],
      order: ["……行くぞ", "全部、まとめてだな", "壁ごと、だ"]
    },
    modDealt(ctx) {
      if (ctx.ordered || ctx.enemies.filter(u => u.alive && !u.flags.absent).length >= 3) ctx.mult *= 0.7;
    },
    postAttack(ctx) {
      const targets = ctx.enemies.filter(u => u.alive && !u.flags.absent && u !== ctx.target);
      if (targets.length < (ctx.ordered ? 1 : 2)) return;
      const trigger = ctx.trigger("ogre_charge");
      let total = ctx.dmg;
      for (const target of targets) total += ctx.dealRaw(ctx.attacker, target, ctx.dmg, "ぶちかまし", trigger);
      ctx.dealRaw(ctx.attacker, ctx.attacker, Math.max(1, Math.round(total * 0.1)), "反動", trigger);
    }
  },
  great_fireball: {
    name: "大火球",
    desc: "奇数ラウンドの攻撃時、別の敵全員にも本来の70%を与え、燃焼で次ラウンド開始時に最大HPの8%を削る。覚えた直後の戦いで一度だけ勝手に出る。以後は号令で",
    skill: { species: "mage", tier: 2, replaces: "fireball" },
    autoLimit: 1,
    order: { label: "大火球を放て", cost: 3, note: "偶数ラウンドでも大火球が出る" },
    lines: {
      unlock: ["火加減など、もう要りません", "術式が一段、ほどけました", "これは火球ではない。火の海です"],
      use: ["燃えなさい！", "避け場はありません", "火の雨をどうぞ！"],
      order: ["お望みのままに", "火加減は、抜きで", "焼き払います"]
    },
    postAttack(ctx) {
      if (ctx.round % 2 !== 1 && !ctx.ordered) return;
      const targets = ctx.enemies.filter(u => u.alive && !u.flags.absent && u !== ctx.target);
      if (!targets.length) return;
      const trigger = ctx.trigger("great_fireball");
      for (const target of targets) {
        ctx.dealRaw(ctx.attacker, target, Math.round(ctx.dmg * 0.7), "大火球", trigger);
        target.flags.burn = { source: ctx.attacker, parentEvent: trigger, at: ctx.round + 1 };
      }
    }
  },
  blood_howl: {
    name: "血の雄叫び",
    desc: "自分の攻撃で敵を倒した直後、もう一撃を放つ。覚えた直後の戦いで一度だけ勝手に出る。以後は号令で",
    skill: { species: "orc", tier: 2, replaces: "brute" },
    autoLimit: 1,
    order: { label: "吠えろ", cost: 3, note: "倒せなくても、もう一撃が出る" },
    lines: {
      unlock: ["まだ足りん。もっと寄越せ", "倒れたなら次だ", "喉が勝手に吠えやがる"],
      use: ["次だァ！", "まだ終わってねえ！", "血が騒ぐ！"],
      order: ["おうッ、吠えてやる！", "待ってたぜ、その号令！", "二度は言わせねえ！"]
    },
    postAttack(ctx) {
      if ((!ctx.target.alive || ctx.ordered) && ctx.attacker.flags.bloodHowlRound !== ctx.round && ctx.enemies.some(ctx.onField)) {
        ctx.attacker.flags.bloodHowlRound = ctx.round;
        const trigger = ctx.trigger("blood_howl");
        ctx.extraAction(trigger, "血の雄叫び");
      }
    }
  },
  goblin_tactics: {
    name: "集団戦法",
    desc: "出撃中のゴブリンが3体以上いるとき、自分の攻撃がゴブリン数−2回追加で当たる（各50%）。覚えた直後の戦いで一度だけ勝手に出る。以後は号令で",
    skill: { species: "goblin", tier: 2, replaces: "pickpocket" },
    autoLimit: 1,
    order: { label: "囲め", cost: 2, note: "ゴブリンが少なくても集団戦法が出る" },
    lines: {
      unlock: ["一人で盗るより、みんなで囲むっす", "数えられる仲間が増えたっす", "合図、覚えたっすよ"],
      use: ["囲むっす！", "今っす、みんな！", "一発じゃ帰さないっすよ！"],
      order: ["合図、聞こえたっす！", "みんな、魔王様の号令っす！", "囲むっすよ、今っす！"]
    },
    postAttack(ctx) {
      const count = ctx.allies.filter(u => ctx.onField(u) && u.race === "ゴブリン").length;
      if (count < 3 && !ctx.ordered) return;
      const trigger = ctx.trigger("goblin_tactics");
      for (let i = 0; i < Math.max(ctx.ordered ? 1 : 0, count - 2); i++) {
        const target = ctx.enemies.find(ctx.onField);
        if (!target) break;
        ctx.dealRaw(ctx.attacker, target, Math.round(ctx.dmg * 0.5), "集団戦法", trigger);
      }
    }
  },
  gale: {
    name: "疾風",
    desc: "ラウンド1〜2は先制の与ダメージ+30%が続き、ラウンド1は必ず最初に動く",
    skill: { species: "kobold", tier: 2, replaces: "first_strike" },
    order: { label: "疾風で駆けろ", cost: 2, note: "ラウンドに関係なく疾風が乗り、真っ先に動く" },
    lines: {
      unlock: ["風より先に参ります！", "二歩目まで、もう見えています！", "先陣の務め、承知しました！"],
      use: ["先に参ります！", "風の道、確保！", "遅れません、魔王様！"],
      order: ["風になります！", "号令、承りました！", "誰より先に、参ります！"]
    },
    modDealt(ctx) {
      if (ctx.round <= 2 || ctx.ordered) { ctx.mult *= 1.3; ctx.notes.push("疾風"); }
    },
    postAttack(ctx) {
      if (ctx.round <= 2 || ctx.ordered) ctx.trigger("gale");
    }
  },
  split: {
    name: "分裂",
    desc: "致死ダメージを受けたとき（1戦闘1回）、HP40%の自分とHP40%の分身に分かれる",
    skill: { species: "slime", tier: 2, replaces: "slime_body" },
    lines: {
      unlock: ["ふたつに……なれる", "いたいの、わけられる", "まだ、ひとりじゃない"],
      use: ["われる……！", "こっちも、いる", "ふたつで、がんばる"]
    },
    onLethal(ctx) {
      if (ctx.unit.flags.splitUsed) return false;
      ctx.unit.flags.splitUsed = true;
      ctx.trigger("split");
      const hp = Math.max(1, Math.round(ctx.unit.maxHp * 0.4));
      ctx.summon({ name: `${ctx.unit.name}の分身`, hp, maxHp: ctx.unit.maxHp, atk: ctx.unit.atk, def: ctx.unit.def, spd: ctx.unit.spd, traits: [], tags: ctx.unit.tags.slice() });
      return { survive: true, hp };
    }
  },
  bone_wall: {
    name: "骨の壁",
    desc: "味方が攻撃を受けるとき、最初の一撃を肩代わりし、自分が60%のダメージで受ける（1ラウンド1回）",
    skill: { species: "skeleton", tier: 2, replaces: "bone" },
    lines: {
      unlock: ["骨は、壁にもなれましょう", "この身、盾としてお使いください", "砕ける順番を、選べるようになりました"],
      use: ["こちらで受けますぞ！", "お下がりください！", "骨の壁、展開！"]
    },
    onAllyHit(ctx) {
      if (ctx.unit.flags.boneWallRound === ctx.round) return null;
      ctx.unit.flags.boneWallRound = ctx.round;
      return ctx.dmg * 0.6;
    }
  },
  decay: {
    name: "腐敗",
    desc: "自分の攻撃が当たると、相手の攻撃力を2下げる。倒れて戻ったあとは3下げる",
    skill: { species: "zombie", tier: 2, replaces: "tenacity" },
    lines: {
      unlock: ["さわると……くさる……", "もどったあと……もっと、くさい", "からだ……まだ、つかえる"],
      use: ["くさって……", "さわった……", "におい……うつる……"]
    },
    postAttack(ctx) {
      if (!ctx.target.alive || ctx.target.atk <= 1) return;
      const amount = ctx.attacker.flags.wasRevived ? 3 : 2;
      ctx.target.atk = Math.max(1, ctx.target.atk - amount);
      ctx.trigger("decay");
    }
  },
  fire_play: {
    name: "火遊び",
    desc: "ラウンド開始時、敵が2体以上いれば敵の先頭を一つ後ろへ下げる（1戦闘2回）",
    skill: { species: "imp", tier: 2, replaces: "mischief" },
    lines: {
      unlock: ["火をつける場所が分かってきました！", "ちょっと押すだけで、列は崩れますよ", "遊びがいのある火種です"],
      use: ["前、どいてくださいな！", "熱っ、あぶなっ！", "順番、変わりましたねぇ？"]
    },
    onRoundEnd(ctx) {
      if ((ctx.unit.flags.firePlayCount || 0) >= 2 || ctx.enemies.filter(ctx.onField).length < 2) return;
      if (ctx.moveEnemyBack(ctx.enemies.find(ctx.onField))) {
        ctx.unit.flags.firePlayCount = (ctx.unit.flags.firePlayCount || 0) + 1;
        ctx.trigger("fire_play");
      }
    }
  },
  grand_summon: {
    name: "大召集",
    desc: "ラウンド終了時、倒れた味方が2体以上いれば、2体までをHP50%で蘇生する（1戦闘1回）",
    skill: { species: "necromancer", tier: 2, replaces: "necromancy" },
    lines: {
      unlock: ["欠員が多いほど、呼びやすいのです", "二名様まで、再雇用を承ります", "死者の名簿が、少し広がりました"],
      use: ["皆様、お戻りを", "二名まで起きてください", "臨時招集です"]
    },
    onRoundEnd(ctx) {
      if (ctx.unit.flags.grandSummonUsed || !ctx.unit.alive) return;
      const dead = ctx.allies.filter(u => !u.alive).slice(0, 2);
      if (dead.length < 2) return;
      ctx.unit.flags.grandSummonUsed = true;
      ctx.trigger("grand_summon");
      for (const target of dead) {
        target.alive = true;
        target.hp = Math.max(1, Math.round(target.maxHp * 0.5));
        if (!target.tags.includes("undead")) target.tags.push("undead");
        target.flags.reviveSourceId = ctx.unit.id;
        target.flags.reviveTraitId = "grand_summon";
      }
    }
  },
  tidal_wave: {
    name: "大波",
    desc: "自分のHPが50%以上のとき、攻撃が敵全体に本来の50%で及ぶ",
    skill: { species: "king_slime", tier: 2, replaces: "slime_body" },
    lines: {
      unlock: ["おおきく……ゆれる", "みんなのぶん、ひろがる", "王さまの、なみ……"],
      use: ["のむ……よ", "おおなみ……！", "まとめて、ぷるるる……！"]
    },
    postAttack(ctx) {
      if (ctx.attacker.hp < ctx.attacker.maxHp * 0.5) return;
      const targets = ctx.enemies.filter(u => u.alive && !u.flags.absent && u !== ctx.target);
      if (!targets.length) return;
      const trigger = ctx.trigger("tidal_wave");
      for (const target of targets) ctx.dealRaw(ctx.attacker, target, Math.round(ctx.dmg * 0.5), "大波", trigger);
    }
  }
};
