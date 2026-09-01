// 魔界史から後計算する実績。報酬で能力は上げず、次のランで試す目標だけを示す。
const ACHIEVEMENTS = [
  {
    id: "first_history", name: "歴史の第一頁", desc: "第1代魔王軍の結末を魔界史へ刻む",
    check(history) { return history.length >= 1; }
  },
  {
    id: "conquer_world", name: "魔王らしい仕事", desc: "人間界を一度制圧する",
    check(history) { return history.some(r => r.cleared); }
  },
  {
    id: "black_employer", name: "魔界労基重点監視", desc: "意図的未払いを通算5回選ぶ",
    check(history) {
      return history.reduce((n, r) => n + Number((r.payrollChoices || {}).withhold || 0), 0) >= 5;
    }
  },
  {
    id: "castle_complete", name: "城は現場が建てた", desc: "施設Lv.3でランを終える",
    check(history) { return history.some(r => Number(r.facilityLevel || 0) >= 3); }
  },
  {
    id: "true_general", name: "伝説の人事記録", desc: "戦功22以上の人材を殿堂入りさせる",
    check(history) { return history.some(r => r.hallOfFame && Number(r.hallOfFame.merit || 0) >= 22); }
  },
  {
    id: "all_species", name: "魔族雇用に差別なし", desc: "全種族を一度は採用する",
    check(history) {
      const ids = new Set(history.flatMap(r => r.recruitedTplIds || []));
      return MONSTER_TEMPLATES.every(t => ids.has(t.id));
    }
  },
  {
    id: "all_synergies", name: "組織を壊した者", desc: "全シナジーを一度は実戦で発動する",
    check(history) {
      const ids = new Set(history.flatMap(r => r.discoveredSynergyIds || []));
      return SYNERGIES.every(s => ids.has(s.id));
    }
  }
];
