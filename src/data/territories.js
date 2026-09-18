// 地図の上の戦争（docs/DESIGN_WORLD_CAMPAIGN_2026-09-15.md）：土地20＋部族10のデータ。
//
// 「征服度 1〜8 の一本道」を「土地の面」に置き換えるための表。ブラウザAPIは使わない（core/data の約束 2-3）。
// - 人間界の土地（TERRITORY_LANDS）は kind（種類）を持ち、kind が「落とすと何が起きるか」を決める（TERRITORY_KINDS）。
// - 魔界の部族圏（TERRITORY_TRIBES）は race（種族）を持つ。首領（chief）はいる所といない所がある（「ぽつぽつ」）。
// - garrison は守備隊に使う既存の段階表（ENEMY_STAGES）の stage 番号。敵データは増やさない。
// - adj は隣接。落とせる（従えられる）のは、いま領土の場所に隣接する場所だけ。魔王城の id は "castle"。
// - 効き目は一つの場所につき数字1本（施設の詳細画面と同じ約束）。数値は TERRITORY_KINDS / TERRITORY_RULES にだけ置く。
//
// 座標（地図の絵の上の位置）はここには置かない。表示は src/data/map.js の座標表が別に持つ（段階E）。

const TERRITORY_KINDS = {
  village:    { name: "村",   icon: "🌾", line: "食料が毎決着 +2",            effect: { food: 2 } },
  hamlet:     { name: "集落", icon: "🏘️", line: "応募者が毎決着 +1",          effect: { applicants: 1 } },
  bridge:     { name: "橋",   icon: "🌉", line: "向こう側の土地が開く",        effect: {} },
  pass:       { name: "峠",   icon: "⛰️", line: "向こう側の土地が開く",        effect: {} },
  checkpoint: { name: "関所", icon: "🚧", line: "防衛戦が城の手前で起きる",    effect: { defenseLine: 1 } },
  fort:       { name: "砦",   icon: "🏰", line: "防衛戦が城の手前で起きる",    effect: { defenseLine: 1 } },
  port:       { name: "港",   icon: "⚓", line: "金が毎決着 +3",              effect: { gold: 3 } },
  temple:     { name: "神殿", icon: "⛪", line: "討伐隊に僧侶が来なくなる",    effect: { noPriest: 1 } },
  town:       { name: "町",   icon: "🏙️", line: "応募者 +2、給与相場が下がる", effect: { applicants: 2, wageMult: 0.9 } },
  capital:    { name: "都",   icon: "👑", line: "幕の着地",                    effect: { landing: 1 } }
};

// 人間界の土地20。act 1 は 12（辺境の村〜王都）、act 2 は 8（隣国国境〜連合本陣）。
// garrison は既存の段階表の番号（1〜8 が第一幕、9〜14 が第二幕）。gate は関門（越えるまで先の進軍が出ない）。
const TERRITORY_LANDS = [
  { id: "h01", act: 1, kind: "village",    name: "辺境の村",   garrison: 1, adj: ["castle", "h02", "h03"] },
  { id: "h02", act: 1, kind: "hamlet",     name: "渡し場",     garrison: 1, adj: ["h01", "h04"] },
  { id: "h03", act: 1, kind: "hamlet",     name: "街道の集落", garrison: 2, adj: ["h01", "h04", "h05"] },
  { id: "h04", act: 1, kind: "bridge",     name: "大橋",       garrison: 3, adj: ["h02", "h03", "h06"] },
  { id: "h05", act: 1, kind: "village",    name: "山村",       garrison: 2, adj: ["h03", "h07"] },
  { id: "h06", act: 1, kind: "checkpoint", name: "関所",       garrison: 3, adj: ["h04", "h08", "h09"] },
  { id: "h07", act: 1, kind: "pass",       name: "峠",         garrison: 3, adj: ["h05", "h09"] },
  { id: "h08", act: 1, kind: "port",       name: "港町",       garrison: 4, adj: ["h06", "h10"] },
  { id: "h09", act: 1, kind: "temple",     name: "大神殿",     garrison: 4, adj: ["h06", "h07", "h10"] },
  { id: "h10", act: 1, kind: "town",       name: "城塞都市",   garrison: 5, adj: ["h08", "h09", "h11"] },
  { id: "h11", act: 1, kind: "fort",       name: "王都の砦",   garrison: 6, adj: ["h10", "h12"], gate: true },   // 関門（将軍ガレス）
  { id: "h12", act: 1, kind: "capital",    name: "王都",       garrison: 8, adj: ["h11", "h13"] },               // 第一幕の着地（勇者一行）
  { id: "h13", act: 2, kind: "checkpoint", name: "隣国国境",   garrison: 9,  adj: ["h12", "h14", "h15"] },
  { id: "h14", act: 2, kind: "fort",       name: "街道の砦",   garrison: 10, adj: ["h13", "h16"] },
  { id: "h15", act: 2, kind: "port",       name: "河港",       garrison: 10, adj: ["h13", "h17"] },
  { id: "h16", act: 2, kind: "temple",     name: "大聖堂",     garrison: 11, adj: ["h14", "h18"] },
  { id: "h17", act: 2, kind: "pass",       name: "高地",       garrison: 12, adj: ["h15", "h18"] },
  { id: "h18", act: 2, kind: "town",       name: "交易都市",   garrison: 12, adj: ["h16", "h17", "h19"] },
  { id: "h19", act: 2, kind: "fort",       name: "連合本陣前", garrison: 13, adj: ["h18", "h20"], gate: true },
  { id: "h20", act: 2, kind: "capital",    name: "連合本陣",   garrison: 14, adj: ["h19"] }                       // 第二幕の着地（勇者一行・再）
];

// 魔界の部族圏10。従えると、その種族の応募者が毎決着1人混ざる（recruit）。
// chief がいる部族は「反乱」の糸の相手。放っておくと周りをまとめて魔界側から攻めてくる（段階B）。
// garrison は守備隊の段階（姿と名前は段階Bで種族に差し替える）。
const TERRITORY_TRIBES = [
  { id: "t01", act: 1, race: "goblin",      name: "ゴブリンの丘", garrison: 2,  adj: ["castle", "t02", "t03"], chief: { id: "zagan",          name: "自称将軍ザガン", role: "commander" } },
  { id: "t02", act: 1, race: "slime",       name: "沼",           garrison: 1,  adj: ["castle", "t01", "t04"], chief: null },
  { id: "t03", act: 1, race: "skeleton",    name: "骨の谷",       garrison: 3,  adj: ["t01", "t05"],           chief: { id: "gravekeeper",    name: "墓守",           role: "priest" } },
  { id: "t04", act: 1, race: "harpy",       name: "断崖",         garrison: 2,  adj: ["t02", "t06"],           chief: null },
  { id: "t05", act: 1, race: "orc",         name: "オークの荒野", garrison: 3,  adj: ["t03", "t07"],           chief: { id: "blood_chief",    name: "血の族長",       role: "brute" } },
  { id: "t06", act: 1, race: "kobold",      name: "鉱山",         garrison: 2,  adj: ["t04", "t08"],           chief: null },
  { id: "t07", act: 1, race: "mandragora",  name: "森の奥",       garrison: 4,  adj: ["t05", "t08"],           chief: { id: "elder",          name: "森の長老",       role: "priest" } },
  { id: "t08", act: 1, race: "necromancer", name: "廃墟の塔",     garrison: 4,  adj: ["t06", "t07"],           chief: { id: "tower_lord",     name: "塔の主",         role: "caster" } },
  { id: "t09", act: 2, race: "minotaur",    name: "迷宮",         garrison: 10, adj: ["t05", "t10"],           chief: { id: "labyrinth_lord", name: "迷宮の主",       role: "brute" } },
  { id: "t10", act: 2, race: "lich",        name: "死者の塔",     garrison: 12, adj: ["t08", "t09"],           chief: null }
];

// 数値はここだけ。
const TERRITORY_RULES = {
  // 一決着に出す候補の数。人間界と魔界は決着の偶奇で厚い方を交互にする。
  candidates: 3,
  // 贈る（戦わずに従える）：守備段階に応じた金と食料。首領がいる部族は贈れない（首領は討つか、戦って従えるか）。
  tribute: { goldPerStage: 8, foodPerStage: 4 },
  // 巡回の札（何度でも戦える雑魚戦）：守備段階の下限と上限、報酬の倍率。征服は進まず警戒も上がらない。
  patrol: { stageMin: 1, stageMax: 2, rewardMult: 0.4 },
  // 略奪（落とさず殴って帰る）：金の倍率、上がる警戒、次にその土地を落とすときの守備段階の上乗せ。
  raid: { rewardMult: 0.75, alert: 2, garrisonBonus: 1 },
  // 既存の「征服度（0〜8）」との互換：第一幕の人間界の土地の数から写す（12 土地で 8）。
  conquestPerLand: 8 / 12
};
