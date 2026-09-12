// 種族技と小成長の共通パラメータ。解放・成長の適用は run.js が担当する。
// speciesUnlockBattles：種族技（SKILLS）を覚える戦闘数。unlockBattles：上位技（TRAITS の tier 2）。
const SKILL_RULES = {
  speciesUnlockBattles: 3,
  unlockBattles: 8,
  growthPerBattle: 0.02,
  growthCapBattles: 12
};

// ── 技（気合を払って自分で選ぶ行動。仕様 docs/SPEC_SKILLS_2026-09-12.md 2節） ──
// 癖（TRAITS）は勝手に効く。技はコマンドバトルの指示窓で選び、気合を払う。
//   kind   : strike / aoe / heal / rest / buff / debuff / cover / stun / charm / push / revive / random / steal
//   target : enemy（敵1体をタップ）/ ally（味方1体）/ fallen（倒れた味方）/ self / all_enemies / all_allies / none
//   power  : 攻撃倍率（strike/aoe/steal）、最大HP比（heal/rest/revive）、倍率（buff）
//   制限   : hit（命中）/ order（"last"/"first"）/ recoil（与えた割合を自分が受ける）/ winded（次ラウンド動けない）
//            / selfHp（自分の最大HP比を払う）/ chance（stun・charm の成功率）/ condition（"hp50"＝HP50%以上のときだけ）
//   note   : 指示窓の一行。書けない技は作らない（一技一制限）。
const SKILLS = {
  ogre_smash: {
    name: "振り下ろす", species: "ogre", cost: 1, kind: "strike", target: "enemy", power: 2.0, hit: 0.7, order: "last",
    note: "×2.0　最後に動く・命中70%",
    lines: { use: ["……潰す", "どっせい！", "腹に力、入れたぞ"], miss: ["……逃げるな", "ぬう、踏み込みすぎた"] }
  },
  orc_cleave: {
    name: "薙ぎ払い", species: "orc", cost: 1, kind: "strike", target: "enemy", power: 1.4, splash: 0.5, order: "last",
    note: "×1.4・隣の敵にも50%　最後に動く",
    lines: { use: ["まとめて薙ぐ！", "どけどけぇ！", "横一列、覚悟しろ"], miss: ["ちっ、間合いが遠い", "踏ん張りをしくじった"] }
  },
  imp_rob: {
    name: "追い剥ぎ", species: "imp", cost: 1, kind: "steal", target: "enemy", power: 0.7, hit: 0.8, gold: 2,
    note: "×0.7・勝てば+2G　命中80%",
    lines: { use: ["財布、預かりますねぇ", "ヒヒッ、いただき！", "経費はこちら持ちで、ね？"], miss: ["ヒヒ……手を読まれた", "おっと、袖をつかまれた"] }
  },
  mage_fireball: {
    name: "火球", species: "mage", cost: 1, kind: "aoe", target: "all_enemies", power: 0.6, winded: true,
    note: "敵全体に60%　次のラウンドは息切れ",
    lines: { use: ["術式展開。火球、放ちます", "少し大きめに燃やします", "研究成果をご覧ください"], miss: ["照準がずれました……", "術式が安定しません"] }
  },
  goblin_warcry: {
    name: "鬨の声", species: "goblin", cost: 1, kind: "buff", target: "all_allies", power: 1.3,
    note: "味方全員このラウンド攻撃+30%　自分は攻撃しない",
    lines: { use: ["みんな、行くっすよ！", "声だけなら負けないっす！", "今っす！ 一緒に押すっす！"], miss: ["あれ、声が裏返ったっす", "ちょ、誰も聞いてないっす？"] }
  },
  slime_cling: {
    name: "粘りつく", species: "slime", cost: 1, kind: "stun", target: "enemy", chance: 0.55, retaliate: true,
    note: "敵1体を動けなくする（55%）　外すと殴られる",
    lines: { use: ["ぷるぷる……べたっ", "はなさ……ない……", "くっつく……よ……"], miss: ["ぷる……すべった……", "あっ……はがれた……"] }
  },
  skeleton_wall: {
    name: "骨の壁", species: "skeleton", cost: 1, kind: "cover", target: "ally", power: 0.6,
    note: "味方1体をかばう（自分が60%で受ける）",
    lines: { use: ["カタカタ……この身を盾に", "拙者の後ろへお下がりを", "骨身を惜しまず、お守りします"], miss: ["間に合いませぬ……！", "カタ……足の骨が絡まりました"] }
  },
  zombie_bite: {
    name: "腐敗の一噛み", species: "zombie", cost: 1, kind: "debuff", target: "enemy", power: 0.5, atkDown: 3,
    note: "×0.5・敵の攻撃-3（ずっと）",
    lines: { use: ["ウ……ガブ", "くち……あける……", "ひとくち……だけ……"], miss: ["あご……はずれた……", "とど……かない……"] }
  },
  kobold_feint: {
    name: "かく乱", species: "kobold", cost: 1, kind: "scatter", target: "none",
    note: "敵の狙いを散らす（自分が狙われやすくなる）",
    lines: { use: ["こちらですワン！", "お仲間には近づけません！", "陽動、引き受けます！"], miss: ["見向きもされませんワン……", "足がもつれました……！"] }
  },
  necro_hand: {
    name: "死者の手", species: "necromancer", cost: 2, kind: "revive", target: "fallen", power: 0.3, selfHp: 0.2,
    note: "倒れた味方をHP30%で起こす　気合2・自分HP-20%",
    lines: { use: ["起きてください。まだ勤務中です", "退職届は受け取っておりません", "呼び戻します。こちらへ手を"], miss: ["呼びかけが届きません……", "手が、すり抜けました……"] }
  },
  succubus_charm: {
    name: "魅惑", species: "succubus", cost: 2, kind: "charm", target: "enemy", chance: 0.7,
    note: "敵1体の次の攻撃を同僚へ向ける（70%）　気合2",
    lines: { use: ["ねぇ、あなた……こっちを見て", "隣の人、嫌いでしょう？", "私のお願い、聞いてくださる？"], miss: ["あら、目を逸らすのね", "つれない方。聞いてもくださらない"] }
  },
  troll_rest: {
    name: "休む", species: "troll", cost: 1, kind: "rest", target: "self", power: 0.3,
    note: "自分のHP30%回復　このラウンドは動かない",
    lines: { use: ["……少し寝る", "石は待てる", "ひと息……つく……"], miss: ["……落ち着かん", "寝床が……とがってる"] }
  },
  mino_rush: {
    name: "突進", species: "minotaur", cost: 1, kind: "strike", target: "enemy", power: 1.5, push: true, recoil: 0.1,
    note: "×1.5・敵の先頭を押し下げる　与えた10%を反動",
    lines: { use: ["ブモォォ！", "道を、開けろ！", "今度は真っすぐ行くぞ！"], miss: ["ぬう、曲がる方を間違えた", "勢い余ったわ！"] }
  },
  lich_pulse: {
    name: "死の脈動", species: "lich", cost: 3, kind: "aoe", target: "all_enemies", power: 0.4, burn: 0.08,
    note: "敵全体に40%＋燃焼　気合3",
    lines: { use: ["脈動せよ、死の波", "永年勤続の術、お見せしましょう", "古い術ですが、現役ですよ"], miss: ["ふむ、詠唱を取り違えました", "昔とは勝手が違いますね"] }
  },
  mimic_box: {
    name: "宝箱の中身", species: "mimic", cost: 1, kind: "random", target: "none",
    note: "何が出るか分からない（回復／全体攻撃／金貨）",
    table: [
      { kind: "heal", target: "all_allies", power: 0.15, name: "宝箱の中身：薬草" },
      { kind: "aoe", target: "all_enemies", power: 0.5, name: "宝箱の中身：爆弾" },
      { kind: "steal", target: "none", gold: 3, name: "宝箱の中身：金貨" }
    ],
    lines: { use: ["ガチャ……何が出るかな", "開けてのお楽しみ", "返品は受け付けませーん"], miss: ["あれっ、ふたが開かない", "中身が引っかかっちゃった"] }
  },
  harpy_dive: {
    name: "急降下", species: "harpy", cost: 1, kind: "strike", target: "enemy", power: 1.3, hit: 0.85, order: "first",
    note: "×1.3　最初に動く・命中85%",
    lines: { use: ["上から失礼！", "風、もらった！", "急ぎのお届けっ！"], miss: ["きゃっ、風に流された！", "あっ、通り過ぎちゃった！"] }
  },
  king_wave: {
    name: "大波", species: "king_slime", cost: 1, kind: "aoe", target: "all_enemies", power: 0.5, condition: "hp50",
    note: "敵全体に50%　HP50%以上のときだけ",
    lines: { use: ["ぷるるるる……ドバァ！", "さんにん……いっしょに……ざばぁ", "みんなで……おおなみ……"], miss: ["あっ……ばらばら……", "みぎと……ひだり……あわない……"] }
  }
};

// 種族 → 3戦目で覚える技。run.js の開放と、面接の札（「3戦で【…】」）が読む。
const SPECIES_SKILL = Object.fromEntries(Object.entries(SKILLS).map(([id, s]) => [s.species, id]));

if (typeof module !== "undefined") module.exports = { SKILL_RULES, SKILLS, SPECIES_SKILL };
