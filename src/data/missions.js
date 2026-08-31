// 作戦選択のデータ。毎回「略奪・鎮圧・侵攻」の3系統を提示する。
// 数値や文言を増やすときはここへ追記し、進行ロジックは run.js に閉じ込める。
const MISSION_TYPES = [
  {
    id: "raid",
    icon: "🔥",
    title: "辺境を略奪する",
    descriptions: [
      "守りの薄い辺境から軍資金を奪う。儲かるが、王国には派手に気づかれる。",
      "商隊と村の金庫を狙う。正義とは、勝った側の帳簿に書かれる言葉だ。",
      "給料日前の臨時徴収。人間側はこれを略奪と呼んでいる。"
    ],
    armies: ["辺境の自警団", "王国商隊の護衛", "村おこし勇者団"],
    regions: ["辺境の村", "人間界の街道", "国境市場"],
    enemyTierOffset: -1,
    enemyMult: 0.85,
    rewardMult: 0.75,
    payrollCoverage: 1,
    rewardJitter: [1, 3],
    alertDelta: 2,
    conquestDelta: 0,
    loyaltyDelta: 0,
    difficulty: "低"
  },
  {
    id: "suppress",
    icon: "⚖",
    title: "魔界の反乱を鎮圧する",
    descriptions: [
      "魔界内部の揉め事を武力で解決する。収入は少ないが、軍の結束は戻る。",
      "反乱軍から統治能力を疑われている。話し合いの予定はない。",
      "留守中に独立を宣言した者たちへ、組織図の読み方を教えに行く。"
    ],
    armies: ["魔界反乱軍", "独立を宣言した元部下", "臨時魔王を名乗る一団"],
    regions: ["魔界の旧砦", "地下食堂跡", "勝手に建てられた新魔王城"],
    enemyNames: ["反乱兵バズ", "反乱兵ガロ", "扇動者モルド", "自称将軍ザガン"],
    enemyTierOffset: 0,
    enemyMult: 0.90,
    rewardMult: 0.55,
    payrollCoverage: 0.5,
    rewardJitter: [0, 1],
    alertDelta: 1,
    conquestDelta: 0,
    loyaltyDelta: 8,
    difficulty: "中"
  },
  {
    id: "invade",
    icon: "🏰",
    title: "王国へ進軍する",
    descriptions: [
      "王国の重要拠点を正面から攻略する。勝てば王都への道が一歩開く。"
    ],
    enemyTierOffset: 0,
    enemyMult: 1,
    rewardMult: 1,
    payrollCoverage: 0,
    rewardJitter: [0, 0],
    alertDelta: 0,
    conquestDelta: 1,
    loyaltyDelta: 0,
    difficulty: "高"
  }
];
