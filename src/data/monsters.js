// 種族テンプレート。応募者はここから乱数で個体生成される。
// tier: 出現しやすくなる時期 (1=序盤, 2=中盤, 3=終盤)
// tags: シナジー判定用 (undead=アンデッド, caster=魔法職)
// fixedTrait: 必ず持つ特性 / traitPool: 50%で追加される2つ目の特性候補
const MONSTER_TEMPLATES = [
  {
    id: "goblin", race: "ゴブリン", tier: 1, tags: [],
    jobs: ["盗賊", "斥候", "暴れ者"],
    base: { hp: 20, atk: 8, def: 3, spd: 7 },
    salary: [2, 3], loyalty: [55, 80],
    fixedTrait: "coward", traitPool: ["pack"],
    names: ["グルグ", "ザグ", "ポポ", "ギリ", "ヌゴ", "ドブ"],
    quotes: [
      "危なくなったら逃げますけど、それでもいいっすか？",
      "給料日はいつっすか？　前払いは？",
      "俺、弱い奴には強いっすよ。",
      "仲間が多いと調子出るんすよねぇ。"
    ]
  },
  {
    id: "slime", race: "スライム", tier: 1, tags: [],
    jobs: ["雑用", "壁", "掃除係"],
    base: { hp: 26, atk: 5, def: 2, spd: 4 },
    salary: [1, 2], loyalty: [70, 95],
    fixedTrait: "slime_body", traitPool: ["regen"],
    names: ["ぷに", "べちゃ", "ぬる", "とろ", "ぷるん"],
    quotes: [
      "……（ぷるぷるしている）",
      "たべもの、くれたら、はたらく。",
      "なかまが3びき、そろうと……？",
      "つぶれても、へいき。"
    ]
  },
  {
    id: "kobold", race: "コボルト", tier: 1, tags: [],
    jobs: ["歩兵", "伝令", "猟犬係"],
    base: { hp: 18, atk: 7, def: 3, spd: 9 },
    salary: [2, 3], loyalty: [65, 90],
    fixedTrait: "first_strike", traitPool: ["pack", "loyal_dog"],
    names: ["ワフ", "ガウ", "クン", "ベル", "ロボ"],
    quotes: [
      "魔王様のためなら、いつでも先陣を切ります！",
      "ワン！　……失礼、癖で。",
      "足の速さなら誰にも負けません！",
      "ご主人と呼んでもいいですか？"
    ]
  },
  {
    id: "orc", race: "オーク", tier: 2, tags: [],
    jobs: ["戦士", "破壊兵", "用心棒"],
    base: { hp: 34, atk: 11, def: 5, spd: 5 },
    salary: [4, 6], loyalty: [50, 75],
    fixedTrait: "brute", traitPool: ["rage_unpaid", "tough_skin"],
    names: ["ドガ", "バルグ", "ゴズ", "ウガ", "ザン"],
    quotes: [
      "給料さえ払えば、なんでも壊す。",
      "俺の斧に耐えた奴はいない。",
      "未払い？　……おい、今なんつった？",
      "細かい話は苦手だ。殴っていいか？"
    ]
  },
  {
    id: "skeleton", race: "骸骨兵", tier: 2, tags: ["undead"],
    jobs: ["剣士", "槍兵", "番兵"],
    base: { hp: 22, atk: 9, def: 6, spd: 6 },
    salary: [3, 4], loyalty: [85, 99],
    fixedTrait: "bone", traitPool: ["tough_skin"],
    names: ["カラン", "コロン", "ガシャ", "ホネオ", "リッチ三男"],
    quotes: [
      "カタカタ……（忠誠を誓っている）",
      "生前は騎士でした。今は骨です。",
      "肉体がない分、経費は浮きますぞ。",
      "砕かれても、骨は残ります。"
    ]
  },
  {
    id: "zombie", race: "ゾンビ", tier: 2, tags: ["undead"],
    jobs: ["前衛", "肉壁", "夜勤"],
    base: { hp: 30, atk: 8, def: 2, spd: 3 },
    salary: [2, 3], loyalty: [85, 99],
    fixedTrait: "tenacity", traitPool: ["regen"],
    names: ["ゾン太", "グズ", "モタ", "ヨロ", "ドロ"],
    quotes: [
      "ウゥ……アァ……（働きたいらしい）",
      "一度死んでるので、怖いものはないです。",
      "歩くのは遅いですが、諦めも悪いです。",
      "残業……得意……夜型なので……"
    ]
  },
  {
    id: "imp", race: "インプ", tier: 2, tags: ["caster"],
    jobs: ["妖術師", "斥候", "いたずら屋"],
    base: { hp: 16, atk: 7, def: 2, spd: 10 },
    salary: [3, 4], loyalty: [40, 70],
    fixedTrait: "mischief", traitPool: ["coward"],
    names: ["ピキ", "チッチ", "ズル", "ニヤ", "コロポ"],
    quotes: [
      "ヒヒッ、勇者の顔にツバ吐いてきますね。",
      "真面目に働くのは性に合わないんで、嫌がらせ専門で。",
      "契約書の細かい字、ちゃんと読みました？",
      "逃げ足の速さは保証しますよ。ヒヒッ。"
    ]
  },
  {
    id: "mage", race: "魔法使い", tier: 3, tags: ["caster"],
    jobs: ["炎術師", "宮廷魔導士（左遷）", "研究者"],
    base: { hp: 15, atk: 12, def: 1, spd: 6 },
    salary: [6, 8], loyalty: [55, 80],
    fixedTrait: "fireball", traitPool: ["coward"],
    names: ["メラリ", "ヴォル", "イグナ", "ピロ", "ボーボ"],
    quotes: [
      "人間の宮廷はクビになりました。燃やしすぎて。",
      "研究費さえ出れば、火力は保証します。",
      "前衛の後ろに置いてください。紙より脆いので。",
      "同業者が3人集まると、面白いことが起きますよ。"
    ]
  },
  {
    id: "necromancer", race: "死霊術師", tier: 3, tags: ["caster"],
    jobs: ["死霊術師", "墓守", "人事担当（死者）"],
    base: { hp: 17, atk: 9, def: 2, spd: 5 },
    salary: [7, 9], loyalty: [50, 75],
    fixedTrait: "necromancy", traitPool: ["mischief"],
    names: ["ネクロ", "モルス", "ドクロ婆", "ハカバ", "ヨミ"],
    quotes: [
      "死者は文句を言いません。良い労働力です。",
      "アンデッドの部下がいると、私の腕が活きますよ。",
      "葬式は任せてください。すぐ起こしますが。",
      "死は終わりではありません。再雇用です。"
    ]
  },
  {
    id: "ogre", race: "オーガ", tier: 3, tags: [],
    jobs: ["重戦士", "破城槌", "門番"],
    base: { hp: 45, atk: 14, def: 6, spd: 4 },
    salary: [7, 9], loyalty: [45, 70],
    fixedTrait: "brute", traitPool: ["tough_skin"],
    names: ["ゴーン", "ドスン", "バキ", "ゲンコ", "オグ"],
    quotes: [
      "メシ、多め。それが条件だ。",
      "門番歴30年。通した敵はいない。",
      "難しい話はいい。誰を潰す？",
      "高いだと？　俺は壁で兵器で門だぞ。"
    ]
  }
];
