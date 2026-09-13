// 全体マップの座標（docs/WORLD_MAP_DESIGN_2026-09-13.md 2・7節）。
//
// **座標は絵に埋めない。** 背景（assets/map/bg.webp、390×2200）を描き直しても、
// ここの数字だけを直せば済むようにしてある。x/y は背景の原寸（390×2200）での中心。
// 表示側（src/ui/map.js）が幅に合わせて % へ直すので、背景の縦横比を変えない限り
// スマホでもPCでも同じ位置に乗る。
//
// 地点名は src/data/enemies.js の region が正（8節）。stage は段階表の番号と一致させること。
const MAP_SIZE = { w: 390, h: 2200 };

// 地点14。下（村はずれ）から上（連合本陣）へ道が続く。
// 背景の目印に合わせて測った：関所＝丸太の門、大神殿＝緑の屋根の神殿、城塞都市＝城壁の街、
// 大平原＝羊のいる草原、王都城門＝青い旗の門、王都＝大きな城、街道の砦＝滝の門、大聖堂＝尖塔の聖堂、
// 連合本陣＝赤い旗の陣地。
const MAP_POINTS = [
  { id: "p1",  stage: 1,  act: 1, name: "村はずれ",   x: 194, y: 1385 },
  { id: "p2",  stage: 2,  act: 1, name: "街道",       x: 215, y: 1298 },
  { id: "p3",  stage: 3,  act: 1, name: "関所",       x: 190, y: 1224 },
  { id: "p4",  stage: 4,  act: 1, name: "大神殿",     x: 128, y: 1132 },
  { id: "p5",  stage: 5,  act: 1, name: "城塞都市",   x: 190, y: 1052 },
  { id: "p6",  stage: 6,  act: 1, name: "大平原",     x: 166, y: 968 },
  { id: "p7",  stage: 7,  act: 1, name: "王都城門",   x: 190, y: 898 },
  { id: "p8",  stage: 8,  act: 1, name: "王都",       x: 192, y: 812 },
  { id: "p9",  stage: 9,  act: 2, name: "隣国国境",   x: 206, y: 660 },
  { id: "p10", stage: 10, act: 2, name: "街道の砦",   x: 190, y: 506 },
  { id: "p11", stage: 11, act: 2, name: "大聖堂",     x: 190, y: 306 },
  { id: "p12", stage: 12, act: 2, name: "高地",       x: 234, y: 204 },
  { id: "p13", stage: 13, act: 2, name: "連合本陣前", x: 213, y: 132 },
  { id: "p14", stage: 14, act: 2, name: "連合本陣",   x: 196, y: 56 }
];

// 城下町の区画8。背景の空き地（杭と縄）の中心。左列と右列に4段。
// 施設は6つなので、余る2区画は空き地のまま（後から施設が増えてもここに置ける）。
const MAP_LOTS = [
  { slot: 1, x: 135, y: 1682 }, { slot: 2, x: 255, y: 1682 },
  { slot: 3, x: 135, y: 1728 }, { slot: 4, x: 255, y: 1728 },
  { slot: 5, x: 135, y: 1776 }, { slot: 6, x: 255, y: 1776 },
  { slot: 7, x: 135, y: 1824 }, { slot: 8, x: 255, y: 1824 }
];

// 施設 → 区画。TOWN_FACILITIES の並びを変えてもここが正。
// 絵がある施設（assets/map/facility/<id>-<lv>.webp、Lv1〜3。空き地は lot-0.webp）。CodeX が描いた順に足す。
const MAP_FACILITY_ART = ["market", "hostel"];

const MAP_FACILITY_SLOTS = {
  market: 1, tavern: 2, smithy: 3, lab: 4, hostel: 5, factory: 6
};

// 魔王城と金庫（魔界銀行）。金庫は城の隣（設計3節）。
const MAP_LANDMARKS = {
  castle: { x: 194, y: 2010, name: "魔王城" },
  bank:   { x: 305, y: 1930, name: "魔界銀行" }
};

if (typeof module !== "undefined") {
  module.exports = { MAP_SIZE, MAP_POINTS, MAP_LOTS, MAP_FACILITY_SLOTS, MAP_LANDMARKS, MAP_FACILITY_ART };
}
