// 城下町（2026-09-12・docs/DESIGN_ECONOMY_2026-09-12.md）。税で回し、施設に投資し、足りなければ借りる。
// 覚えることは3つ：「領地＝税」「施設＝投資」「借金＝利子」。効果は一文で言えるものだけ、3段階まで。
const TOWN_RULES = {
  taxPerTerritory: { 1: 2, 2: 3, 3: 3 },   // 幕ごとの、領地1つあたりの税（決着ごと）
  buildsPerSettle: 1,                       // 1決着に建てられる件数
  jobDiscount: 0.2,                         // 留守番に合う職業の者がいれば建設費2割引
  bank: { choices: [10, 20, 30], cap: 50, interest: 0.1 }   // 借入の3択・上限・利子（決着ごと、残高の1割）
};

const TOWN_FACILITIES = [
  { id: "market", icon: "🏪", name: "市場", line: "領地の税が増える",
    effect: lv => `税収 +${lv}G／領地`, jobs: ["会計", "受付", "広報", "経理"],
    cost: [{ gold: 15, materials: 3 }, { gold: 24, materials: 5 }, { gold: 33, materials: 7 }] },
  { id: "tavern", icon: "🍺", name: "酒場", line: "みんな機嫌がよくなる。安く雇える",
    effect: lv => `留守番の忠誠 +${lv}／決着${lv >= 2 ? `・応募者の希望給与 -${lv - 1}` : ""}`, jobs: ["料理", "呼び込み", "酒"],
    cost: [{ gold: 12, materials: 2 }, { gold: 19, materials: 3 }, { gold: 26, materials: 4 }] },
  { id: "smithy", icon: "⚒️", name: "鍛冶場", line: "気合をもっと貯められる",
    effect: lv => `気合の上限 +${lv}`, jobs: ["石工", "鍛冶", "工事", "橋"],
    cost: [{ gold: 20, materials: 4 }, { gold: 32, materials: 6 }, { gold: 44, materials: 9 }] },
  { id: "lab", icon: "🔬", name: "研究所", line: "技を早く覚える",
    effect: lv => `種族技を覚える戦闘数 -${lv}${lv >= 3 ? "・上位技 -2" : ""}`, jobs: ["備品", "経理", "研究", "書記"],
    cost: [{ gold: 25, materials: 3 }, { gold: 40, materials: 5 }, { gold: 55, materials: 7 }] },
  { id: "hostel", icon: "🏚️", name: "宿舎", line: "もっと雇える。早く治る",
    effect: lv => `軍団の上限 +${lv}${lv >= 2 ? "・負傷の回復が1決着早い" : ""}`, jobs: [],
    cost: [{ gold: 10, materials: 5 }, { gold: 16, materials: 8 }, { gold: 22, materials: 11 }] },
  { id: "factory", icon: "🏭", name: "工場", line: "余った建材を金に",
    effect: lv => `建材2 → 金3 の両替を決着ごとに${lv}回まで`, jobs: ["倉庫", "配達", "備品"],
    cost: [{ gold: 15, materials: 2 }, { gold: 24, materials: 3 }, { gold: 33, materials: 4 }] }
];

// 銀行員（ミミックの親戚）。台詞はくすっと。
const TOWN_BANK_LINES = {
  borrow: ["毎度どうも。利子は決着ごとに一割。忘れても、こちらは忘れませんので", "はい、耳を揃えて。返すときは、蓋を叩いてください"],
  repay: ["おや、律儀な魔王様。次もご贔屓に", "完済ですか。寂しくなりますねぇ"],
  seize: ["お支払いがないので、施設の看板を一枚いただきます。恨みっこなしで", "差し押さえです。魔界にも法はあるんですよ"]
};

if (typeof module !== "undefined") module.exports = { TOWN_RULES, TOWN_FACILITIES, TOWN_BANK_LINES };
