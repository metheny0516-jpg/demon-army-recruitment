// 王国の反撃に関する調整値。進行ロジックは run.js が読む。
const COUNTERATTACK = {
  threshold: 6,
  invadeAlert: 2,        // 進軍に勝ったときの警戒度（反撃Bで run.js が決着処理で足す。missions.js の invade.alertDelta は 0 のまま）
  wipeAlert: 3,          // 全滅の警戒度（同上）
  nearChance: 0.5,
  ransack: { facilityLevels: 1, foodRatio: 0.5, relics: 1 },
  seize: { materials: 2, food: 2 }
};
