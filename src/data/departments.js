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

const FACILITIES = [
  { id: "extortion_ledger", icon: "📒", name: "恐喝帳簿", desc: "会計職を出撃させ、予約金貨3Gで次の味方攻撃+40%" },
  { id: "grand_kitchen", icon: "🍖", name: "巨大厨房", desc: "戦闘糧食を追加で1消費し、大食漢と魔界料理人の食事強化を2倍化" },
  { id: "graveyard", icon: "🪦", name: "墓地", desc: "建設部門の死霊術師が、最初の戦死者を骸骨従者として召喚" }
];

const DEPARTMENT_RULES = {
  startingFood: 3,
  foodPerRoster: 3,
  foodShortageLoyaltyPenalty: 8
};

// 給与を固定の後処理ではなく、出撃前の戦術にする。
// 通常支給は既存挙動を保ち、未払いと厚遇だけが明示的なリスク・投資になる。
const PAYROLL_POLICIES = {
  regular: {
    id: "regular",
    icon: "📜",
    name: "通常支給",
    short: "通常",
    description: "勝利後に通常額を支払う。足りなければ自動的に未払い。",
    costRate: 1
  },
  withhold: {
    id: "withhold",
    icon: "🔥",
    name: "今回は未払い",
    short: "未払い",
    description: "0G。出撃時から未払い扱い。血の気は乗るが、ストライキと忠誠低下を招く。",
    costRate: 0
  },
  advance: {
    id: "advance",
    icon: "✨",
    name: "前払い・厚遇",
    short: "厚遇",
    description: "通常額の1.5倍を出撃前に支払い、未払いを解消して勤務者の忠誠+8。",
    costRate: 1.5
  }
};

const PAYROLL_POLICY_ORDER = ["regular", "withhold", "advance"];

// ── 部門適性 ─────────────────────────────────
// 「誰を置いても同じ」を無くすための層。人数ではなく、その人材が何者かで部門効果が変わる。
//
// 効きは4本だけに絞る（増やすと配置判断が読めなくなる）:
//   food     生活部門に居るとき調達する食料
//   material 建設部門に居るとき投入できる建材
//   wage     非戦闘部門に居るとき軍団の給与総額を下げる％（会計・経理の適性）
//   recruit  非戦闘部門に居るとき次の応募者を増やす人数（人事の適性）
// これとは別に appetite（食う量）は部門を問わず常にかかる。
//
// 適性は「種族ベース ＋ 履歴書の職業欄」で決まる。職業欄はもともと表示用の
// フレーバーだったが、ここで初めてゲーム判断に接続される（設計原則 第8節）。
// food/material の平均が2前後になるよう置いてある（旧仕様の一律2と同じ尺度）。
// 差をつけるのが目的であって、全体の厳しさを上げるのが目的ではない。
const RACE_APTITUDES = {
  goblin:      { food: 2, material: 1, appetite: 1 },
  slime:       { food: 1, material: 2, appetite: 1 },
  kobold:      { food: 3, material: 1, appetite: 1 },
  orc:         { food: 3, material: 3, appetite: 2 },
  skeleton:    { food: 0, material: 2, appetite: 0 },
  zombie:      { food: 2, material: 1, appetite: 0 },
  imp:         { food: 2, material: 1, appetite: 1 },
  mage:        { food: 1, material: 2, appetite: 1 },
  necromancer: { food: 0, material: 1, appetite: 1 },
  ogre:        { food: 1, material: 4, appetite: 3 },
  king_slime:  { food: 4, material: 4, appetite: 3 }
};

// 未登録の種族が来ても壊れないための既定値。新モンスターは登録しなくても遊べる。
const DEFAULT_APTITUDE = { food: 1, material: 1, wage: 0, recruit: 0, appetite: 1 };

// 職業欄の部分一致で加算する。上から順に見て、当たったものは全部効く。
// 既存の職業名を変えずに拾えるようにしてあるので、モンスター側の追記だけで増やせる。
const JOB_APTITUDES = [
  { match: "会計",     label: "どんぶり勘定", wage: 15 },
  { match: "取り立て", label: "取り立て",     wage: 10 },
  { match: "契約書",   label: "契約書の偽造", wage: 20 },
  { match: "人事",     label: "人事",         recruit: 1 },
  { match: "受付",     label: "受付",         recruit: 1 },
  { match: "営業",     label: "営業",         recruit: 1 },
  { match: "解体",     label: "解体",         food: 2, material: 1 },
  { match: "猟犬",     label: "猟犬係",       food: 2 },
  { match: "在庫管理", label: "在庫管理",     food: 2 },
  { match: "掃除",     label: "掃除係",       food: 1 },
  { match: "雑用",     label: "雑用",         food: 1, material: 1 },
  { match: "運搬",     label: "重量物運搬",   material: 3 },
  { match: "破壊",     label: "破壊",         material: 2 },
  { match: "破城槌",   label: "破城槌",       material: 2 },
  { match: "つみあげ", label: "つみあげ",     material: 2 },
  { match: "墓守",     label: "墓守",         material: 1 },
  { match: "供養",     label: "供養代行",     material: 1 },
  { match: "研究",     label: "研究",         material: 1, wage: 5 },
  { match: "壁",       label: "壁（本業）",   material: 1 }
];

const Aptitude = {
  // 1体ぶんの適性。部門に関係なく同じ値を返し、どれを使うかは配属先が決める。
  of(monster) {
    const base = RACE_APTITUDES[monster && monster.tplId] || DEFAULT_APTITUDE;
    const out = {
      food: base.food === undefined ? DEFAULT_APTITUDE.food : base.food,
      material: base.material === undefined ? DEFAULT_APTITUDE.material : base.material,
      wage: base.wage || 0,
      recruit: base.recruit || 0,
      appetite: base.appetite === undefined ? DEFAULT_APTITUDE.appetite : base.appetite,
      labels: []
    };
    const job = (monster && monster.job) || "";
    for (const entry of JOB_APTITUDES) {
      if (job.indexOf(entry.match) === -1) continue;
      out.food += entry.food || 0;
      out.material += entry.material || 0;
      out.wage += entry.wage || 0;
      out.recruit += entry.recruit || 0;
      out.labels.push(entry.label);
    }
    if ((monster && monster.traits || []).includes("big_eater")) {
      out.appetite += 3;
      out.labels.push("大食漢");
    }
    return out;
  },

  // 配属先で実際に効く値だけを取り出す。戦闘部門に居る会計士は給与を下げない
  // （現場に出ている者は経理をしていない）ため、配置の判断がここで生まれる。
  contribution(monster, departmentId) {
    const apt = this.of(monster);
    return {
      food: departmentId === "life" ? apt.food : 0,
      material: departmentId === "construction" ? apt.material : 0,
      wage: departmentId === "combat" ? 0 : apt.wage,
      recruit: departmentId === "combat" ? 0 : apt.recruit,
      appetite: apt.appetite
    };
  }
};
