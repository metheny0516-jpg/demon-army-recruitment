// 噂の札（docs/SPEC_INCIDENTS_IMPL_2026-09-14.md 1節、中身は docs/INCIDENTS_BATCH2.md）。
//
// **この表は「文」と「条件」だけを持つ。効果は run.js の `Game.INCIDENT_EFFECTS` にある。**
// CodeX が 12 枚を写すときは gain/apply を書かなくてよい（書いてあっても run.js の表が優先される）。
// ここに数値を書き始めると、バランスを測る側（tools/sim.js）から効果が見えなくなる。
//
// 器が通ることを確かめるため、いまは slime_pond の1枚だけを手で書いてある（CodeX の12枚待ち）。
const INCIDENTS = [
  {
    id: "slime_pond", tier: "mid", door: "A",
    title: "池からの同居人",
    subject: { kind: "race", race: "スライム" },
    traces: ["sparked", "ate", "carried_materials"],
    state: st => (typeof Town !== "undefined" ? Town.lv(st, "hostel") : 0) >= 1,
    stateLabel: "宿舎Lv1以上",
    rumor: "宿舎裏の池で、スライムの数だけ水面の顔が増えている。",
    choices: ["池を調べる", "やめる"],
    pick: "viewer",
    hidden: {
      label: "同種族が2体以上（名簿のスライム数）",
      value: st => st.roster.filter(m => m.race === "スライム").length >= 2 ? "2体以上" : "1体"
    },
    branches: {
      "2体以上": {
        text: "池の光を浴びて力が湧いた。帰りには、スライムたちが分身を連れ帰り、空き寝台を埋めていた。",
        mormo: "お名前より先に、寝床が決まりましたネ。"
      },
      "1体": {
        text: "池の光を浴びて力が湧いた。一体だけのスライムは水面の顔を自分だと思い、今日も弁当を二つ持って出かけた。",
        mormo: "鏡のぶんまで、お腹が空くんでしょうか。"
      }
    }
  }
];

if (typeof module !== "undefined") module.exports = { INCIDENTS };
