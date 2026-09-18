// 城下町（2026-09-12・docs/DESIGN_ECONOMY_2026-09-12.md）。税で回し、施設に投資し、足りなければ借りる。
// 2026-09-13：戦場で効く施設（巨大厨房・墓地）もここへ統合し、建て方を1種類にした（docs/SPEC_TOWN_MERGE_2026-09-13.md）。
// group が "army" の2つは城下町の札で「軍」の見出しにまとまる。恐喝帳簿は施設ではないので廃止。
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
  { id: "factory", icon: "🏭", name: "工場", line: "金と建材を両替する",
    effect: lv => `建材2→金3、または金4→建材2 の両替を決着ごとに${lv}回まで`, jobs: ["倉庫", "配達", "備品"],
    cost: [{ gold: 15, materials: 2 }, { gold: 24, materials: 3 }, { gold: 33, materials: 4 }] },
  // ── 軍（戦場で効く2施設。2026-09-13 に旧「戦闘の施設」から統合した） ──
  // 建て方は町の6つと同じ（金と建材で即時・1決着1件）。旧の「施工で積む」仕組みは消した。
  { id: "grand_kitchen", icon: "🍖", name: "巨大厨房", group: "army", line: "よく食べてよく殴る",
    effect: lv => `戦闘糧食を追加で1消費し、大食漢と料理人の食事強化が ${lv + 1} 倍`, jobs: ["料理", "給食"],
    cost: [{ gold: 15, materials: 3 }, { gold: 24, materials: 5 }, { gold: 33, materials: 7 }] },
  { id: "graveyard", icon: "🪦", name: "墓地", group: "army", line: "死んだ仲間が骸骨になって戻る",
    effect: lv => `留守番の死霊術師が、戦死者を骸骨従者として ${lv} 体まで召喚（死霊術師が城に残っていないと発火しない）`,
    jobs: ["死霊術"],
    cost: [{ gold: 18, materials: 3 }, { gold: 29, materials: 5 }, { gold: 40, materials: 7 }] }
];

// 銀行員（ミミックの親戚）。台詞はくすっと。
const TOWN_BANK_LINES = {
  borrow: ["毎度どうも。利子は決着ごとに一割。忘れても、こちらは忘れませんので", "はい、耳を揃えて。返すときは、蓋を叩いてください"],
  repay: ["おや、律儀な魔王様。次もご贔屓に", "完済ですか。寂しくなりますねぇ"],
  seize: ["お支払いがないので、施設の看板を一枚いただきます。恨みっこなしで", "差し押さえです。魔界にも法はあるんですよ"]
};

if (typeof module !== "undefined") module.exports = { TOWN_RULES, TOWN_FACILITIES, TOWN_BANK_LINES };
