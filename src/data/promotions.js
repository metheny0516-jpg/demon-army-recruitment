// 戦功による昇進。階級は「兵卒 → 将軍」の2段だけ（2026-09-13、docs/SPEC_GENERAL_2026-09-13.md）。
// 途中の階段（小隊長・魔将）は「分かりづらく、効果もぴんと来ない」ため廃止した。
// 将軍は昇進ではなく**転身**：魔王の魔力を受けて体が変わる。中身は run.js の promote() が持つ
// （boost だけでは書けない要素——気合上限・将軍技・二つ名——があるため）。
// 最上位の将軍は synergies.js の「将軍の号令」へ接続される（rankId は変えないこと）。
const PROMOTION_RANKS = [
  { id: "soldier", name: "兵卒", threshold: 0, boost: null },
  {
    id: "general", name: "将軍", threshold: 22,
    boost: { hp: 1.40, atk: 1.40, def: 2, loyalty: 15, salary: 2 },
    message: "魔王から濃密な魔力を授かり、軍を率いる存在へ転身した"
  }
];

// 転身で足すもの（数値以外）。promote() が読む。
const GENERAL_TRANSFORM = {
  skillId: "general_might",   // 将軍技（src/data/skills.js の GENERAL_SKILL）
  spiritMaxBonus: 1,          // 気合の上限+1（エンジンは unit.spiritMaxBonus を見る）
  fallbackEpithet: "将軍"     // epithets.js がまだ無い間の仮の二つ名
};
