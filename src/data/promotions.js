// 戦功による昇進。threshold は累計戦功、boost は昇進時に一度だけ適用する。
// 最上位の将軍は synergies.js の「将軍の号令」へ接続される。
const PROMOTION_RANKS = [
  { id: "soldier", name: "兵卒", threshold: 0, boost: null },
  {
    id: "squad_leader", name: "小隊長", threshold: 4,
    boost: { hp: 1.05, atk: 1.05, def: 0, loyalty: 5, salary: 0 },
    message: "現場を知る者として、小隊を任された"
  },
  {
    id: "demon_lord", name: "魔将", threshold: 10,
    boost: { hp: 1.08, atk: 1.08, def: 1, loyalty: 8, salary: 1 },
    message: "魔王軍の幹部席と、責任と、わずかな昇給を与えられた"
  },
  {
    id: "general", name: "将軍", threshold: 22,
    boost: { hp: 1.20, atk: 1.20, def: 2, loyalty: 12, salary: 2 },
    message: "魔王から濃密な魔力を授かり、軍を率いる存在へ進化した"
  }
];
