// ラン開始時の不足の形を変える魔王。恒久強化ではなく、その代の経営方針を選ぶ。
const DEMON_KINGS = [
  {
    id: "standard", name: "若き魔王", icon: "👑",
    desc: "標準的な10G・食料3・採用2名で始める。",
    start: { gold: 10, food: 3, materials: 0, hires: 2 }
  },
  {
    id: "recruiter", name: "人事魔王", icon: "📋",
    desc: "初回に3名採用できるが、所持金7G。人手と給与難を同時に抱える。",
    start: { gold: 7, food: 4, materials: 0, hires: 3 }
  },
  {
    id: "architect", name: "築城魔王", icon: "🏰",
    desc: "所持金6Gの代わりに建材5。早い施設完成を狙える。",
    start: { gold: 6, food: 3, materials: 5, hires: 2 }
  }
];
