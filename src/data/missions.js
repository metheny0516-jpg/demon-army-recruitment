// 作戦選択のデータ。毎回「略奪・鎮圧・侵攻」の3系統を提示する。
// 数値や文言を増やすときはここへ追記し、進行ロジックは run.js に閉じ込める。
const MISSION_TYPES = [
  {
    id: "raid",
    icon: "🔥",
    title: "辺境を略奪する",
    strategyLabel: "資金・食料を補給",
    strategyHint: "王国攻略を進めず、給与と兵糧を蓄える寄り道。警戒度は大きく上がる。",
    descriptions: [
      "守りの薄い辺境から軍資金を奪う。儲かるが、王国には派手に気づかれる。",
      "商隊と村の金庫を狙う。正義とは、勝った側の帳簿に書かれる言葉だ。",
      "給料日前の臨時徴収。人間側はこれを略奪と呼んでいる。"
    ],
    armies: ["辺境の自警団", "王国商隊の護衛", "村おこし勇者団"],
    regions: ["辺境の村", "人間界の街道", "国境市場"],
    enemyTierOffset: -1,
    enemyMult: 1.0,     // 2026-09-15 オーナー「通常戦はひやひやがない」→ 0.85 から引き上げ
    rewardMult: 0.75,
    payrollCoverage: 1,
    rewardJitter: [1, 3],
    foodReward: 3,
    materialReward: 0,
    alertDelta: 2,
    conquestDelta: 0,
    loyaltyDelta: 0,
    difficulty: "低"
  },
  {
    id: "suppress",
    icon: "⚖",
    title: "魔界の反乱を鎮圧する",
    strategyLabel: "忠誠回復・建材確保",
    strategyHint: "反乱軍の砦を接収して建材を得る。施工は建設担当が勝利後に行う。",
    descriptions: [
      "魔界内部の揉め事を武力で解決する。収入は少ないが、軍の結束は戻る。",
      "反乱軍から統治能力を疑われている。話し合いの予定はない。",
      "留守中に独立を宣言した者たちへ、組織図の読み方を教えに行く。"
    ],
    armies: ["魔界反乱軍", "独立を宣言した元部下", "臨時魔王を名乗る一団"],
    regions: ["魔界の旧砦", "地下食堂跡", "勝手に建てられた新魔王城"],
    enemyNames: ["自称将軍ザガン", "反乱兵バズ", "反乱兵ガロ", "扇動者モルド"],   // 先頭が首謀者（REBEL_LOOKS.leaders の姿）
    enemyTierOffset: 0,
    enemyMult: 1.05,    // 2026-09-15 同上。0.90 から
    rewardMult: 0.55,
    payrollCoverage: 0.5,
    rewardJitter: [0, 1],
    foodReward: 1,
    materialReward: 2,
    alertDelta: 1,
    conquestDelta: 0,
    loyaltyDelta: 8,
    difficulty: "中"
  },
  {
    id: "invade",
    icon: "🏰",
    title: "王国へ進軍する",
    strategyLabel: "決戦へ進む",
    strategyHint: "王国攻略が1進む。寄り道せず最終決戦へ近づく。",
    descriptions: [
      "王国の重要拠点を正面から攻略する。勝てば王都への道が一歩開く。"
    ],
    // 前哨戦（2026-09-12）。本戦の前に斥候隊を叩いて、隊列を見ておく戦い。
    outpostDescriptions: [
      "本隊の前に出ている斥候隊を叩く。敵の顔ぶれは、そのまま本戦の顔ぶれになる。",
      "街道の手前で斥候隊とぶつかる。ここで隊列を見ておけば、本戦で慌てずに済む。",
      "偵察に出た一隊を先に潰す。得るものは少ないが、次に何が来るかが分かる。"
    ],
    enemyTierOffset: 0,
    enemyMult: 1.15,    // 2026-09-15 同上。1 から。防衛戦（勇者）は据え置き
    rewardMult: 1,
    payrollCoverage: 0,
    rewardJitter: [0, 0],
    foodReward: 0,
    materialReward: 1,
    alertDelta: 0,   // 反撃Bで COUNTERATTACK.invadeAlert（2）を run.js が読む。データ層だけで挙動を変えない
    conquestDelta: 1,
    loyaltyDelta: 0,
    difficulty: "高"
  }
];

// 訓練（2026-09-13、docs/DESIGN_TRAINING_2026-09-13.md）。作戦会議の4枚目。
// 死なない・金も建材も入らない・王国に知られない。食料は減り、給与は半分出る。
// 相手は3段階で、解放は征服度で決まる（run.js の trainingOpponents が判定する）。
MISSION_TYPES.train = {
  id: "train",
  icon: "🥊",
  title: "訓練場で稽古する",
  strategyLabel: "死なずに鍛える",
  strategyHint: "王国攻略も警戒度も動かない。金は入らず、食料と半分の給与を払う。",
  descriptions: [
    "城の脇の訓練場。木剣と藁束と、少しばかりの本気。",
    "誰も死なない戦い。だが体は、本番と同じだけ覚える。",
    "勝っても何も奪えない。奪うものが無いから、みんな遠慮なく打ち合える。"
  ],
  // 相手の3段階。mult は本戦の隊列に掛ける倍率、merit は生存者に入る戦功。
  opponents: [
    { id: "scarecrow", name: "案山子隊", armyName: "案山子隊", conquest: 0, mult: 0.6, merit: 1,
      line: "案山子隊と練習試合", note: "本戦の隊列を 0.6 倍にした相手。まず形から" },
    { id: "mock", name: "模擬戦", armyName: "模擬部隊", conquest: 2, mult: 1, merit: 1,
      line: "本戦の顔ぶれで", note: "次の本戦と同じ隊列。予行演習になる" },
    { id: "veteran", name: "猛者", armyName: "城の猛者たち", conquest: 4, mult: 1.2, merit: 2,
      commander: true, line: "隊長つきの稽古", note: "隊長を1体足して 1.2 倍。将軍を狙う者の稽古" }
  ],
  enemyTierOffset: 0,
  enemyMult: 1,
  rewardMult: 0,
  payrollCoverage: 0,
  rewardJitter: [0, 0],
  foodReward: 0,
  materialReward: 0,
  alertDelta: 0,
  conquestDelta: 0,
  loyaltyDelta: 0,
  difficulty: "稽古"
};

// 力試し（docs/SPEC_TRIAL_BATTLE_2026-09-18.md）。第二幕決着後の作戦会議にだけ出る。
// 稽古と同じ経路（training: true）なので誰も死なず、全滅してもランは終わらない。
// 相手は勝つたびに強くなる梯子で、顔ぶれと倍率は run.js の trialUnits / trialMult が決める。
MISSION_TYPES.trial = {
  id: "trial",
  icon: "🏆",
  title: "力試し",
  strategyLabel: "強敵に挑む",
  strategyHint: "誰も死なない。勝てば報酬と称号、負けても失うのは面目だけ。相手は勝つたびに強くなる。",
  descriptions: [
    "勝っても土地は増えない。負けても誰も死なない。ただ、どこまで行けるかが分かる。",
    "モルモが審判。判定は甘くない。",
    "相手はこちらの噂を聞いて、前より本気で来る。"
  ],
  enemyTierOffset: 0,
  enemyMult: 1,
  rewardMult: 0,
  payrollCoverage: 0.5,
  rewardJitter: [0, 0],
  foodReward: 0,
  materialReward: 0,
  alertDelta: 0,
  conquestDelta: 0,
  loyaltyDelta: 0,
  difficulty: "極"
};

// 防衛は反撃の予約時だけ run.js が明示的に選ぶ。通常の3択にはまだ混ぜない。
MISSION_TYPES.defend = {
  id: "defend",
  icon: "🛡",
  title: "城を守る",
  strategyLabel: "討伐隊を迎え撃つ",
  strategyHint: "王国の討伐隊が城へ向かっている。防衛の報酬はない。",
  descriptions: [
    "魔王城へ迫る討伐隊を迎え撃つ。ここを失えば、蓄えが荒らされる。"
  ],
  enemyTierOffset: 1,
  enemyMult: 1,
  rewardMult: 0,
  payrollCoverage: 0,
  rewardJitter: [0, 0],
  foodReward: 0,
  materialReward: 0,
  alertDelta: 0,
  conquestDelta: 0,
  loyaltyDelta: 0,
  difficulty: "高"
};
