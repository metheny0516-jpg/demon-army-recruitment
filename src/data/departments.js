// 3部門の最小循環。数値はここに集め、進行ロジックやUIへ散らさない。
const DEPARTMENTS = {
  combat: {
    id: "combat",
    icon: "⚔",
    name: "戦闘部門",
    shortName: "戦闘",
    wageRate: 1,
    description: "勇者迎撃と遠征を担当。出撃隊だけが満額給与を受け取る。"
  },
  construction: {
    id: "construction",
    icon: "🔨",
    name: "建設・施設部門",
    shortName: "建設",
    wageRate: 0.5,
    materialUse: 1,
    description: "建材を施設進捗へ変える。部門手当は希望給与の半額。"
  },
  life: {
    id: "life",
    icon: "🍲",
    name: "食料・生活部門",
    shortName: "生活",
    wageRate: 0.5,
    foodProduction: 2,
    description: "食料を調達し、軍団の生活を支える。部門手当は希望給与の半額。"
  }
};

const DEPARTMENT_ORDER = ["combat", "construction", "life"];

// buildThreshold は累計建材投入数。施設効果は保存中の個体値を変えず、出撃時だけ加える。
const FACILITY_LEVELS = [
  { level: 0, name: "空き部屋", buildThreshold: 0, hpMult: 1, defBonus: 0 },
  { level: 1, name: "仮設兵舎", buildThreshold: 3, hpMult: 1.05, defBonus: 0 },
  { level: 2, name: "整備工房", buildThreshold: 7, hpMult: 1.08, defBonus: 1 },
  { level: 3, name: "魔王城作業区", buildThreshold: 12, hpMult: 1.12, defBonus: 2 }
];

const DEPARTMENT_RULES = {
  startingFood: 3,
  foodPerRoster: 3,
  foodShortageLoyaltyPenalty: 8
};
