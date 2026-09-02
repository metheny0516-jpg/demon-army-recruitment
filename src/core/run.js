// 1ラン（第N代魔王軍）の状態管理。UIはここのメソッドを呼んで再描画するだけ。
const Game = {
  state: null,

  power(m) { return m.hp + m.atk * 3 + m.def * 2 + m.spd; },
  armyPower(roster) { return roster.reduce((s, m) => s + this.power(m), 0); },

  RETRIES_PER_RUN: 1,
  MAX_CONQUEST: ENEMY_STAGES.length,
  MAX_ARMY: 20,
  MAX_DEPLOY: 5,
  OPENING_DAYS: 3,

  // 旧1ターン分を3日へ整数のまま配る。1,1,1 のような少量も3日合計で元量に戻る。
  dailyShare(total, day) {
    const n = Math.max(0, Number(total) || 0);
    const d = U.clamp(Number(day) || 1, 1, this.OPENING_DAYS);
    return Math.floor(n * d / this.OPENING_DAYS) - Math.floor(n * (d - 1) / this.OPENING_DAYS);
  },

  // KPI（第14節）は「あれば呼ぶ」。kpi.js を読み込まない環境でも進行を壊さない。
  kpi(method, ...args) {
    if (typeof KPI === "undefined" || typeof KPI[method] !== "function") return null;
    return KPI[method](...args);
  },

  newRun(demonKingId) {
    const history = Storage.loadHistory();
    const legacyReturn = this.chooseLegacyReturn(history);
    const demonKing = DEMON_KINGS.find(k => k.id === demonKingId) || DEMON_KINGS[0];
    this.state = {
      demonKingId: demonKing.id,
      generation: history.length + 1,
      stage: 1,
      turn: 1,
      day: 1,
      openingPrototype: true,
      dailySettledDay: 0,
      expeditionUsedToday: false,
      openingDefenseWon: false,
      conquest: 0,
      alert: 0,
      battlesWon: 0,
      missionOffers: [],
      selectedMission: null,
      missionCounts: { raid: 0, suppress: 0, invade: 0 },
      gold: demonKing.start.gold,
      food: demonKing.start.food,
      materials: demonKing.start.materials,
      buildProgress: 0,
      facilityLevel: 0,
      lastDepartmentReport: null,
      payrollPolicy: "regular",
      payrollChoices: { regular: 0, withhold: 0, advance: 0 },
      lastPayrollReport: null,
      roster: [],
      activeUids: [],
      applicants: [],
      phase: "recruit",
      hiresLeft: demonKing.start.hires,
      maxPower: 0,
      maxArmySize: 0,
      mercenaryOffers: [],
      mercenaries: [],
      kingSlimeMerge: true,   // 出撃時に合体するか（既定は合体。編成画面で断れる）
      maxChain: 0,        // ラン全体の主要記録その1（設計憲法 第11節）
      maxOverkill: 0,     // 同その2。%で持つ
      raceCounts: {},
      recruitedTplIds: [],
      discoveredSynergyIds: [],
      uidSeq: 1,
      lastBattle: null,
      retriesLeft: this.RETRIES_PER_RUN,
      retriesUsed: 0,
      rerollsThisPhase: 0,
      pendingEvent: null,
      eventOutcome: null,
      laborDispute: null,
      legacyReturn,
      legacyOffered: false,
      pendingVacancies: 0,
      fallenTotal: 0,
      fallenRoll: [],
      lastFallen: [],
      lastPromotions: [],
      generalsMade: [],
      battleIncidentTotal: 0,
      checkpoint: null
    };
    this.genApplicants();
    this.saveCheckpoint();
    this.save();
    this.kpi("runStarted", this.state);
  },

  // ── チェックポイントと再起 ──────────────────
  // 自動戦闘は乱数を含むため、同じ戦闘をそのまま振り直せると採用・編成の
  // 判断がすべて無意味になる。そこで巻き戻す先を「戦闘の直前」ではなく
  // 「採用フェーズの開始時点」にして、やり直せるのはサイコロではなく
  // “編成の判断”になるようにしている。
  saveCheckpoint() {
    const st = this.state;
    const copy = {};
    for (const k of Object.keys(st)) {
      if (k === "checkpoint") continue;   // 入れ子になるのを防ぐ
      copy[k] = st[k];
    }
    st.checkpoint = JSON.parse(JSON.stringify(copy));
  },

  canRetry() {
    const st = this.state;
    return !!st && st.retriesLeft > 0 && !!st.checkpoint;
  },

  retry() {
    const st = this.state;
    if (!this.canRetry()) return false;
    const restored = st.checkpoint;
    const retriesLeft = st.retriesLeft - 1;
    const retriesUsed = (st.retriesUsed || 0) + 1;
    // state を別インスタンスに差し替えず、中身だけ入れ替える。
    // 参照を掴んでいる呼び出し側が古い状態を見続けるのを防ぐため。
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, restored);
    this.migrateState();
    st.retriesLeft = retriesLeft;
    st.retriesUsed = retriesUsed;
    st.gold = Math.floor(st.gold / 2);  // 軍を立て直す出費
    st.checkpoint = null;
    this.saveCheckpoint();
    this.save();
    return true;
  },

  // 再起せず敗北を確定させる
  concede() {
    const st = this.state;
    if (!st || st.phase !== "defeat") return;
    st.phase = "gameover";
    this.endRun(false);
  },

  save() { Storage.saveRun(this.state); },
  load() {
    const s = Storage.loadRun();
    if (!s || typeof s !== "object") return false;
    this.state = s;
    this.migrateState();
    return true;
  },

  // 新しい状態項目を追加しても、既存プレイヤーの LocalStorage セーブを壊さない。
  migrateState() {
    const st = this.state;
    if (!st || typeof st !== "object") return;
    const legacyCampaign = st.conquest === undefined;
    if (legacyCampaign) {
      const legacyStage = U.clamp(Number(st.stage) || 1, 1, ENEMY_STAGES.length);
      st.conquest = legacyStage - 1;
      st.turn = legacyStage;
      st.battlesWon = Math.max(0, legacyStage - 1);
      st.alert = 0;
      st.missionOffers = [];
      st.selectedMission = null;
      st.missionCounts = { raid: 0, suppress: 0, invade: st.conquest };
      // 旧セーブの編成画面には選択済み作戦が無い。安全に作戦会議へ戻す。
      if (st.phase === "formation") st.phase = "mission";
    }
    const defaults = {
      demonKingId: "standard",
      roster: [], activeUids: [], applicants: [], hiresLeft: 1, maxPower: 0, maxArmySize: 0,
      maxChain: 0, maxOverkill: 0, mercenaryOffers: [], mercenaries: [], kingSlimeMerge: true, raceCounts: {}, recruitedTplIds: [], discoveredSynergyIds: [], uidSeq: 1,
      lastBattle: null, retriesLeft: this.RETRIES_PER_RUN, retriesUsed: 0,
      rerollsThisPhase: 0, pendingEvent: null, eventOutcome: null, laborDispute: null, checkpoint: null,
      pendingVacancies: 0, fallenTotal: 0, fallenRoll: [], lastFallen: [],
      lastPromotions: [],
      generalsMade: [],
      battleIncidentTotal: 0,
      turn: 1, conquest: 0, alert: 0, battlesWon: 0,
      day: 1, openingPrototype: false, dailySettledDay: 0, expeditionUsedToday: false, openingDefenseWon: false,
      missionOffers: [], selectedMission: null,
      missionCounts: { raid: 0, suppress: 0, invade: 0 },
      food: DEPARTMENT_RULES.startingFood, materials: 0,
      buildProgress: 0, facilityLevel: 0, lastDepartmentReport: null,
      payrollPolicy: "regular",
      payrollChoices: { regular: 0, withhold: 0, advance: 0 },
      lastPayrollReport: null,
      legacyReturn: null, legacyOffered: false
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (st[key] === undefined || st[key] === null) st[key] = Array.isArray(value) ? [] : value;
    }
    if (!Array.isArray(st.roster)) st.roster = [];
    if (!Array.isArray(st.activeUids)) st.activeUids = st.roster.slice(0, this.MAX_DEPLOY).map(m => m.uid);
    if (!Array.isArray(st.applicants)) st.applicants = [];
    if (!Array.isArray(st.missionOffers)) st.missionOffers = [];
    if (!Array.isArray(st.generalsMade)) st.generalsMade = [];
    if (!Array.isArray(st.recruitedTplIds)) st.recruitedTplIds = [];
    if (!Array.isArray(st.discoveredSynergyIds)) st.discoveredSynergyIds = [];
    for (const m of st.roster) {
      if (m.tplId && !st.recruitedTplIds.includes(m.tplId)) st.recruitedTplIds.push(m.tplId);
    }
    st.day = Math.max(1, Number(st.day) || 1);
    st.dailySettledDay = Math.max(0, Number(st.dailySettledDay) || 0);
    st.openingPrototype = !!st.openingPrototype;
    st.expeditionUsedToday = !!st.expeditionUsedToday;
    st.openingDefenseWon = !!st.openingDefenseWon;
    if (typeof st.raceCounts !== "object" || Array.isArray(st.raceCounts)) st.raceCounts = {};
    if (typeof st.missionCounts !== "object" || Array.isArray(st.missionCounts)) {
      st.missionCounts = { raid: 0, suppress: 0, invade: 0 };
    }
    if (!PAYROLL_POLICIES[st.payrollPolicy]) st.payrollPolicy = "regular";
    if (!DEMON_KINGS.some(k => k.id === st.demonKingId)) st.demonKingId = "standard";
    if (typeof st.payrollChoices !== "object" || Array.isArray(st.payrollChoices)) {
      st.payrollChoices = { regular: 0, withhold: 0, advance: 0 };
    }
    for (const id of PAYROLL_POLICY_ORDER) st.payrollChoices[id] = Number(st.payrollChoices[id]) || 0;
    for (const m of [...st.roster, ...st.applicants]) {
      if (!DEPARTMENTS[m.department]) m.department = "combat";
      if (!Array.isArray(m.traits)) m.traits = [];
      if (m.tplId === "goblin" && !m.traits.includes("pickpocket")) m.traits.push("pickpocket");
      if (m.tplId === "ogre" && !m.traits.includes("big_eater")) m.traits.push("big_eater");
      if (m.tplId === "necromancer" && !m.traits.includes("gravekeeper")) m.traits.push("gravekeeper");
      if ((m.job || "").includes("料理人") && !m.traits.includes("demon_cook")) m.traits.push("demon_cook");
    }
    const rosterIds = new Set(st.roster.filter(m => m.department === "combat").map(m => m.uid));
    st.activeUids = st.activeUids.filter((uid, i, ids) => rosterIds.has(uid) && ids.indexOf(uid) === i)
      .slice(0, this.MAX_DEPLOY);
    if (st.activeUids.length === 0 && st.roster.length) {
      st.activeUids = st.roster.filter(m => m.department === "combat").slice(0, this.MAX_DEPLOY).map(m => m.uid);
    }
    st.maxArmySize = Math.max(st.maxArmySize || 0, st.roster.length);
    st.stage = Math.min(this.MAX_CONQUEST, st.conquest + 1); // 旧イベントとの互換用
    for (const m of [...st.roster, ...st.applicants]) {
      m.unpaid = !!m.unpaid;
      m.unpaidStreak = m.unpaidStreak || 0;
      m.merit = Math.max(0, Number(m.merit) || 0);
      m.rankId = m.rankId || this.rankForMerit(m.merit).id;
    }
  },

  stageData() {
    if (this.state.selectedMission) return this.state.selectedMission;
    return ENEMY_STAGES[Math.min(this.state.conquest, ENEMY_STAGES.length - 1)];
  },

  salaryTotal() {
    return this.salaryAssignments().reduce((sum, entry) => sum + entry.amount, 0);
  },

  demonKing() {
    return DEMON_KINGS.find(k => k.id === this.state.demonKingId) || DEMON_KINGS[0];
  },

  payrollPolicy() {
    return PAYROLL_POLICIES[this.state.payrollPolicy] || PAYROLL_POLICIES.regular;
  },

  payrollQuote(policyId) {
    const policy = PAYROLL_POLICIES[policyId] || this.payrollPolicy();
    const daily = this.state.openingPrototype && this.state.phase === "preparation";
    const base = daily
      ? this.salaryAssignments().reduce((sum, entry) => sum + this.dailyShare(entry.amount, this.state.day), 0)
      : this.salaryTotal();
    const cost = policy.id === "advance" ? Math.ceil(base * policy.costRate) : base * policy.costRate;
    return { policy, base, cost, affordable: policy.id !== "advance" || this.state.gold >= cost };
  },

  setPayrollPolicy(policyId) {
    const st = this.state;
    if (!["formation", "preparation"].includes(st.phase) || !PAYROLL_POLICIES[policyId]) return false;
    st.payrollPolicy = policyId;
    this.save();
    return true;
  },

  departmentOf(monster) {
    return DEPARTMENTS[monster && monster.department] || DEPARTMENTS.combat;
  },

  departmentRoster(id) {
    return this.state.roster.filter(m => this.departmentOf(m).id === id);
  },

  // 軍団全体の部門適性の合計。UI・給与・部門処理はすべてここを通す。
  // 「何人置いたか」ではなく「誰を置いたか」で数字が変わる唯一の入口。
  departmentOutput() {
    const st = this.state;
    const out = { food: 0, material: 0, wage: 0, recruit: 0, appetite: 0, contributors: [] };
    for (const m of st.roster) {
      const deptId = this.departmentOf(m).id;
      const c = Aptitude.contribution(m, deptId);
      out.food += c.food;
      out.material += c.material;
      out.wage += c.wage;
      out.recruit += c.recruit;
      out.appetite += c.appetite;
      if (c.food || c.material || c.wage || c.recruit) {
        out.contributors.push({ uid: m.uid, name: m.name, department: deptId, ...c });
      }
    }
    // 給与割引だけは青天井にしない。無給の軍団は経営judgementが消えるため上限60%。
    out.wage = Math.min(60, out.wage);
    return out;
  },

  // 食料消費は頭数ではなく食う量で決まる。アンデッドは0、オーガは3。
  // 分母3は旧仕様（頭数÷3）と同じ尺度を保つためのもので、軍団規模の感覚を壊さない。
  foodNeed() {
    const appetite = this.departmentOutput().appetite;
    return appetite > 0 ? Math.max(1, Math.ceil(appetite / DEPARTMENT_RULES.foodPerRoster)) : 0;
  },

  foodNeedFor(monsters) {
    const appetite = (monsters || []).reduce((sum, m) => sum + Aptitude.of(m).appetite, 0);
    return appetite > 0 ? Math.max(1, Math.ceil(appetite / DEPARTMENT_RULES.foodPerRoster)) : 0;
  },

  battleRationQuote() {
    const foodBefore = Math.max(0, this.state.food || 0);
    const totalNeed = this.foodNeed();
    const need = this.foodNeedFor(this.activeRoster());
    const consumed = Math.min(foodBefore, need);
    return {
      need, totalNeed, remainingNeed: Math.max(0, totalNeed - need),
      consumed, shortage: Math.max(0, need - consumed), foodBefore,
      foodAfter: foodBefore - consumed,
      emptied: foodBefore > 0 && foodBefore - consumed === 0
    };
  },

  prepareBattleRations(notes) {
    const quote = this.battleRationQuote();
    this.state.food = quote.foodAfter;
    notes.push(`戦闘糧食 ${quote.consumed}/${quote.need} を前払い（備蓄 ${this.state.food}）`);
    if (quote.shortage) notes.push(`戦闘糧食が ${quote.shortage} 不足`);
    return quote;
  },

  wageDiscount() {
    return this.departmentOutput().wage;
  },

  salaryAssignments() {
    const active = new Set(this.state.activeUids);
    const discount = this.wageDiscount();
    const cut = amount => Math.max(1, Math.round(amount * (1 - discount / 100)));
    const out = [];
    for (const m of this.state.roster) {
      const dept = this.departmentOf(m);
      if (active.has(m.uid)) {
        out.push({ monster: m, amount: cut(m.salary), department: "combat" });
      } else if (dept.id !== "combat") {
        out.push({
          monster: m,
          amount: cut(Math.max(1, Math.ceil(m.salary * dept.wageRate))),
          department: dept.id
        });
      }
    }
    return out;
  },

  facilityInfo(level) {
    const wanted = level === undefined ? this.state.facilityLevel : level;
    return FACILITY_LEVELS[U.clamp(Number(wanted) || 0, 0, FACILITY_LEVELS.length - 1)];
  },

  preparedRoster(rations) {
    const facility = this.facilityInfo();
    const active = this.activeRoster();
    const cook = active.find(m => (m.traits || []).includes("demon_cook"));
    const hungering = active.some(m => (m.traits || []).includes("hunger_demon"));
    const foodTarget = active.slice().sort((a, b) => Aptitude.of(b).appetite - Aptitude.of(a).appetite)[0];
    const foodBoost = cook && rations ? Math.min(0.8, rations.consumed * 0.08) : 0;
    return active.map(m => {
      let dmgMult = 1, takenMult = 1;
      if (rations && rations.consumed > 0 && (m.traits || []).includes("big_eater")) dmgMult *= 1.25;
      if (foodTarget && m.uid === foodTarget.uid) dmgMult *= 1 + foodBoost;
      if (rations && rations.emptied && hungering) { dmgMult *= 2; takenMult *= 1.3; }
      return {
        ...m,
        hp: Math.max(1, Math.round(m.hp * facility.hpMult)),
        def: Math.max(0, m.def + facility.defBonus),
        battleDmgMult: dmgMult, battleTakenMult: takenMult
      };
    });
  },

  activeRoster() {
    const byId = new Map(this.state.roster.map(m => [m.uid, m]));
    return this.state.activeUids.map(uid => byId.get(uid)).filter(Boolean);
  },

  rankForMerit(merit) {
    return PROMOTION_RANKS.slice().reverse().find(rank => merit >= rank.threshold) || PROMOTION_RANKS[0];
  },

  rankOf(monster) {
    return PROMOTION_RANKS.find(rank => rank.id === monster.rankId) || PROMOTION_RANKS[0];
  },

  nextRank(monster) {
    const index = PROMOTION_RANKS.findIndex(rank => rank.id === this.rankOf(monster).id);
    return PROMOTION_RANKS[index + 1] || null;
  },

  // 応募者の質は征服だけでなく経過作戦でも上がる。ただし寄り道だけで
  // 無限に膨張しないよう、従来の8段階を上限にする。
  campaignLevel() {
    const st = this.state;
    return U.clamp(Math.max(st.conquest + 1, Math.ceil(st.turn * 0.75)), 1, ENEMY_STAGES.length);
  },

  // ── 作戦会議 ────────────────────────────
  prepareMissions(force) {
    const st = this.state;
    if (!force && Array.isArray(st.missionOffers) && st.missionOffers.length === MISSION_TYPES.length) {
      st.phase = "mission";
      return st.missionOffers;
    }
    const previous = new Map((st.missionOffers || []).map(m => [m.missionKind, m.formationId]));
    st.selectedMission = null;
    st.missionOffers = MISSION_TYPES.map(type => this.buildMission(type, previous.get(type.id)));
    st.phase = "mission";
    this.save();
    return st.missionOffers;
  },

  buildMission(type, previousFormationId) {
    const st = this.state;
    const baseIndex = U.clamp(st.conquest + type.enemyTierOffset, 0, ENEMY_STAGES.length - 1);
    const base = ENEMY_STAGES[baseIndex];
    const formations = [
      { id: "standard", name: "基本隊列", hint: "王国軍の標準的な隊列。", units: base.units },
      ...(base.variants || [])
    ];
    const formation = formations.find(f => f.id === previousFormationId) || U.pick(formations);
    // 大軍は選抜の自由度が高いぶん敵にも察知される。隠し補正にせず
    // mission.armyPressure として作戦カードへ渡し、解雇・維持の判断材料にする。
    const armyPressure = Math.min(6, Math.max(0, st.roster.length - this.MAX_DEPLOY) * 2);
    const scale = type.enemyMult * (1 + st.alert * 0.02) * (1 + armyPressure / 100);
    const stat = (value, min) => Math.max(min, Math.round(value * scale));
    const units = formation.units.map((unit, index) => ({
      ...unit,
      name: type.enemyNames ? type.enemyNames[index % type.enemyNames.length] : unit.name,
      hp: stat(unit.hp, 1),
      atk: stat(unit.atk, 1),
      def: stat(unit.def, 0),
      spd: stat(unit.spd, 1)
    }));
    const jitter = U.randInt(type.rewardJitter[0], type.rewardJitter[1]);
    // 略奪は「給与を払ったうえで少し蓄えられる」資金調達策にする。
    // 固定額だけでは大所帯ほど赤字になり、寄り道する意味が逆転してしまう。
    const payrollSupport = Math.round(this.salaryTotal() * (type.payrollCoverage || 0));
    const reward = Math.max(1, Math.round(base.reward * type.rewardMult) + payrollSupport + jitter);
    const variant = type.armies ? U.randInt(0, type.armies.length - 1) : 0;
    const isInvade = type.id === "invade";
    return {
      stage: st.turn,
      missionKind: type.id,
      missionTitle: type.title,
      description: U.pick(type.descriptions),
      difficulty: type.difficulty,
      army: isInvade ? base.army : type.armies[variant],
      region: isInvade ? base.region : type.regions[variant],
      reward,
      alertDelta: type.alertDelta,
      conquestDelta: type.conquestDelta,
      loyaltyDelta: type.loyaltyDelta,
      foodReward: type.foodReward || 0,
      materialReward: type.materialReward || 0,
      armyPressure,
      baseStage: base.stage,
      formationId: formation.id,
      formationName: formation.name,
      formationHint: formation.hint,
      units
    };
  },

  selectMission(index) {
    const st = this.state;
    if (st.phase !== "mission") return false;
    const mission = st.missionOffers[index];
    if (!mission) return false;
    st.selectedMission = JSON.parse(JSON.stringify(mission));
    st.payrollPolicy = "regular";
    st.lastPayrollReport = null;
    st.phase = "formation";
    this.save();
    return true;
  },

  backToRecruit() {
    const st = this.state;
    if (st.phase !== "mission") return false;
    st.phase = "recruit";
    st.hiresLeft = 0;
    st.applicants = [];
    this.save();
    return true;
  },

  backToMissions() {
    const st = this.state;
    if (st.phase !== "formation") return false;
    st.selectedMission = null;
    this.prepareMissions(true); // 出撃隊変更後の維持費と敵情報で作り直す
    return true;
  },

  finishRecruitment() {
    const st = this.state;
    st.hiresLeft = 0;
    st.applicants = [];
    if (st.openingPrototype) {
      this.beginOpeningPreparation();
      return;
    }
    if (st.roster.length === 0) {
      st.phase = "formation";
      this.save();
      return;
    }
    st.missionOffers = [];
    this.prepareMissions(true);
  },

  // ── 応募者生成 ────────────────────────────
  // 応募者は基本3名。非戦闘部門に人事適性を持つ者が居ると、その人数だけ増える（上限6名）。
  // 「人事担当（死者）を生活部門に置いたら応募が増えた」という発見を作るための接続。
  applicantCount() {
    return U.clamp(3 + this.departmentOutput().recruit, 3, 6);
  },

  genApplicants() {
    const st = this.state;
    st.applicants = [];
    const n = this.applicantCount();
    for (let i = 0; i < n; i++) st.applicants.push(this.rollApplicant());
    if (st.legacyReturn && !st.legacyOffered && st.applicants.length) {
      const legacy = st.legacyReturn;
      const returning = this.rollApplicant(legacy.tplId);
      Object.assign(returning, {
        name: legacy.name,
        job: legacy.job || returning.job,
        prevJob: legacy.prevJob || returning.prevJob,
        motive: legacy.motive || returning.motive,
        flaw: legacy.flaw || returning.flaw,
        quote: legacy.quote || returning.quote,
        legacy: {
          generation: legacy.generation,
          formerMerit: legacy.merit || 0,
          formerRankId: legacy.rankId || "soldier"
        }
      });
      const sameName = st.applicants.findIndex(m => m.name === returning.name);
      const slot = sameName >= 0 ? sameName : U.randInt(0, st.applicants.length - 1);
      st.applicants[slot] = returning;
      st.legacyOffered = true;
    }
  },

  beginOpeningPreparation() {
    const st = this.state;
    if (!st || !st.openingPrototype || st.day > this.OPENING_DAYS) return false;
    st.applicants = [];
    st.selectedMission = null;
    st.missionOffers = [];
    st.phase = "preparation";
    this.save();
    return true;
  },

  prepareOpeningBattle(kind) {
    const st = this.state;
    if (!st || !st.openingPrototype || st.phase !== "preparation") return false;
    if (st.day < this.OPENING_DAYS && (kind !== "raid" || st.expeditionUsedToday)) return false;
    if (st.day === this.OPENING_DAYS && kind !== "invade") return false;
    const type = MISSION_TYPES.find(m => m.id === kind);
    if (!type) return false;
    st.selectedMission = this.buildMission(type);
    st.phase = "formation";
    return true;
  },

  rollApplicant(forcedTplId) {
    const st = this.state;
    const level = this.campaignLevel();
    // 作戦と征服が進むほど高ティアが出やすい
    const weights = MONSTER_TEMPLATES.map(t => {
      if (t.tier === 1) return level <= 3 ? 6 : 2;
      if (t.tier === 2) return level <= 2 ? 2 : 5;
      return level <= 2 ? 0.5 : (level <= 4 ? 2 : 5);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = U.rand() * total;
    let tpl = MONSTER_TEMPLATES.find(t => t.id === forcedTplId) || MONSTER_TEMPLATES[0];
    if (!forcedTplId) {
      for (let i = 0; i < MONSTER_TEMPLATES.length; i++) {
        r -= weights[i];
        if (r <= 0) { tpl = MONSTER_TEMPLATES[i]; break; }
      }
    }
    // 進行補正：後から来る応募者ほど強い
    const scale = 1 + 0.12 * (level - 1);
    const vary = v => Math.max(1, Math.round(v * scale * (0.85 + U.rand() * 0.3)));
    const job = U.pick(tpl.jobs);
    const traits = (tpl.fixedTraits || [tpl.fixedTrait]).filter(Boolean).slice();
    if (tpl.traitPool.length > 0 && U.chance(0.5)) {
      const extra = U.pick(tpl.traitPool);
      if (!traits.includes(extra)) traits.push(extra);
    }
    if (job.includes("料理人") && !traits.includes("demon_cook")) traits.push("demon_cook");
    return {
      uid: st.uidSeq++,
      tplId: tpl.id,
      name: this.uniqueName(tpl.names),
      race: tpl.race,
      job,
      hp: vary(tpl.base.hp),
      atk: vary(tpl.base.atk),
      def: Math.max(0, Math.round(tpl.base.def * (0.8 + U.rand() * 0.4))),
      spd: Math.max(1, Math.round(tpl.base.spd * (0.85 + U.rand() * 0.3))),
      salary: U.randInt(tpl.salary[0], tpl.salary[1]) + Math.floor(level / 4),
      loyalty: U.randInt(tpl.loyalty[0], tpl.loyalty[1]),
      traits,
      tags: tpl.tags.slice(),
      quote: U.pick(tpl.quotes),
      prevJob: U.pick(tpl.prevJobs),
      motive: U.pick(tpl.motives),
      flaw: U.pick(tpl.flaws),
      unpaid: false,
      department: "combat",
      merit: 0,
      rankId: "soldier"
    };
  },

  // 同じ軍団に同名が並ぶと戦闘ログが読めなくなるので、名前は重複させない
  uniqueName(pool) {
    const used = new Set([
      ...this.state.roster.map(m => m.name),
      ...this.state.applicants.map(m => m.name)
    ]);
    const free = pool.filter(n => !used.has(n));
    if (free.length) return U.pick(free);
    const base = U.pick(pool);
    for (const suffix of ["二世", "三世", "四世", "五世"]) {
      if (!used.has(base + suffix)) return base + suffix;
    }
    return base + "・改";
  },

  // ── 求人の出し直し ────────────────────────
  // 目当ての種族が来ない回に何もできないと、狙った編成を組む戦略だけが
  // 一方的に不利になる。かといって無料で引き直せると緊張感が消えるので、
  // 「広告費」として所持金を払わせ、給与の支払いと競合させる。
  // 同じ面接内では倍々に高くなるため、無限に引き直すことはできない。
  // 最初の FREE_REROLLS 回は無料。それ以降は広告費が倍々に増える。
  FREE_REROLLS: 1,
  REROLL_BASE_COST: 2,

  // ── 傭兵市場 ──────────────────────────────
  // 稼いだ金貨の出口。中盤で略奪した金が終盤の戦闘に対して何もしないのが、
  // 略奪ビルドが「中盤は無双、終盤で詰む」原因だった（実測：ゴブリン5体は
  // 第6戦100%→第7戦8%、そして5体そろえたランのクリア率は12%で最低）。
  // 出撃5枠は壊さず、金貨で**その戦闘だけの6体目**を買えるようにする
  // （設計憲法 第3節「6体目以降は高コストな特殊解禁として扱う」）。
  // 同族を雇えば種族シナジーの頭数も増えるので、「硬い者を雇うか、噛み合う者を雇うか」
  // という判断になる（実測：ゴブリン5＋オーガ傭兵61% vs ＋ゴブリン傭兵91%）。
  MERCENARY_COSTS: [10, 20],
  MERCENARY_OFFERS: 2,
  // 顔なじみ価格。出撃隊に同じ種族がいるほど安く来る（1体につき10%、最大40%引き）。
  // 傭兵市場だけだと「誰でも雇えば強くなる」に寄り、稼ぐビルドが報われない
  // （実測：略奪ビルド +20点に対し、稼がないビルドも +17点）。
  // 種族を統一したコミットに対して「雇いやすさ」で報いる。倍率は増やさない。
  MERCENARY_KIN_DISCOUNT: 0.1,
  MERCENARY_MAX_DISCOUNT: 0.4,

  // 出撃隊にいる同じ種族の数（傭兵は数えない＝雇うほど安くなる連鎖は作らない）
  mercenaryKinCount(race) {
    return this.activeRoster().filter(m => m.race === race).length;
  },

  mercenaryBaseCost() {
    const hired = (this.state.mercenaries || []).length;
    return this.MERCENARY_COSTS[hired] !== undefined
      ? this.MERCENARY_COSTS[hired]
      : Infinity;   // 上限に達したら雇えない
  },

  // index を渡すとその候補の顔なじみ価格。省略時は割引前の値段
  mercenaryCost(index) {
    const base = this.mercenaryBaseCost();
    if (!Number.isFinite(base) || index === undefined) return base;
    const offer = this.mercenaryOffers()[index];
    if (!offer) return base;
    const discount = Math.min(this.MERCENARY_MAX_DISCOUNT,
      this.MERCENARY_KIN_DISCOUNT * this.mercenaryKinCount(offer.race));
    return Math.max(1, Math.round(base * (1 - discount)));
  },

  // 候補は作戦ごとに固定する。編成をいじるたびに引き直せると、
  // 「今いる候補で決める」という判断が消えるため。
  mercenaryOffers() {
    const st = this.state;
    if (!Array.isArray(st.mercenaryOffers)) st.mercenaryOffers = [];
    if (!st.mercenaryOffers.length && (this.state.mercenaries || []).length < this.MERCENARY_COSTS.length) {
      st.mercenaryOffers = Array.from({ length: this.MERCENARY_OFFERS }, () => {
        const merc = this.rollApplicant();
        merc.mercenary = true;
        return merc;
      });
      this.save();
    }
    return st.mercenaryOffers;
  },

  canHireMercenary(index) {
    const st = this.state;
    if (!st || !["formation", "preparation"].includes(st.phase)) return false;
    if ((st.mercenaries || []).length >= this.MERCENARY_COSTS.length) return false;
    if (!this.mercenaryOffers()[index]) return false;
    return st.gold >= this.mercenaryCost(index);
  },

  hireMercenary(index) {
    if (!this.canHireMercenary(index)) return false;
    const st = this.state;
    const cost = this.mercenaryCost(index);
    const merc = st.mercenaryOffers[index];
    st.gold -= cost;
    st.mercenaries = (st.mercenaries || []).concat([{ ...merc, hiredFor: cost }]);
    st.mercenaryOffers = st.mercenaryOffers.filter((_, i) => i !== index);
    this.kpi("formationChanged");   // 傭兵も編成の判断
    this.save();
    return true;
  },

  // 合体の可否と、合体したらどうなるかの見込み。編成画面が判断材料に使う。
  kingSlimePreview() {
    const slimes = this.activeRoster().filter(m => m.race === "スライム").slice(0, 3);
    if (slimes.length < 3) return null;
    return {
      members: slimes.map(m => ({ uid: m.uid, name: m.name })),
      before: {
        count: slimes.length,
        hp: slimes.reduce((s, m) => s + m.hp, 0),
        atk: slimes.reduce((s, m) => s + m.atk, 0),
        salary: slimes.reduce((s, m) => s + m.salary, 0)
      },
      after: {
        count: 1,
        hp: Math.round(slimes.reduce((s, m) => s + m.hp, 0) * 1.2),
        atk: slimes.reduce((s, m) => s + m.atk, 0),
        def: Math.max(...slimes.map(m => m.def)) + 2,
        spd: Math.round(slimes.reduce((s, m) => s + m.spd, 0) / 3),
        salary: Math.max(1, slimes.reduce((s, m) => s + m.salary, 0) - 2)
      }
    };
  },

  setKingSlimeMerge(on) {
    const st = this.state;
    if (!st) return false;
    if (!this.kingSlimePreview()) return false;   // 対象がいなければ設定しない
    st.kingSlimeMerge = !!on;
    this.kpi("formationChanged");
    this.save();
    return true;
  },

  // 戦闘へ出す形にする。城の補正は自軍と同じく効くが、給与も戦功も持たない。
  preparedMercenaries() {
    const facility = this.facilityInfo();
    return (this.state.mercenaries || []).map(m => ({
      ...m,
      hp: Math.max(1, Math.round(m.hp * facility.hpMult)),
      def: Math.max(0, m.def + facility.defBonus),
      battleDmgMult: 1, battleTakenMult: 1
    }));
  },


  rerollCost() {
    const n = this.state.rerollsThisPhase || 0;
    if (n < this.FREE_REROLLS) return 0;
    return this.REROLL_BASE_COST * Math.pow(2, n - this.FREE_REROLLS);
  },

  canReroll() {
    const st = this.state;
    return st.phase === "recruit" && st.applicants.length > 0 && st.gold >= this.rerollCost();
  },

  reroll() {
    if (!this.canReroll()) return false;
    const st = this.state;
    st.gold -= this.rerollCost();
    st.rerollsThisPhase = (st.rerollsThisPhase || 0) + 1;
    this.genApplicants();
    this.save();
    return true;
  },

  // ── 採用・解雇・編成 ──────────────────────
  canHire() { return this.state.roster.length < this.MAX_ARMY; },

  hire(index) {
    const st = this.state;
    if (!this.canHire()) return false;
    const m = st.applicants[index];
    if (!m) return false;
    st.roster.push(m);
    st.maxArmySize = Math.max(st.maxArmySize || 0, st.roster.length);
    if (st.activeUids.length < this.MAX_DEPLOY) st.activeUids.push(m.uid);
    st.raceCounts[m.race] = (st.raceCounts[m.race] || 0) + 1;
    if (m.tplId && !st.recruitedTplIds.includes(m.tplId)) st.recruitedTplIds.push(m.tplId);
    st.hiresLeft = (st.hiresLeft || 1) - 1;
    // 設立期など採用枠が残っていれば、続けて次の応募者を面接する
    if (st.hiresLeft > 0 && this.canHire()) {
      st.rerollsThisPhase = 0;   // 新しい面接なので広告費もリセット
      this.genApplicants();
    } else {
      this.finishRecruitment();
    }
    this.save();
    return true;
  },

  skipHire() {
    this.finishRecruitment();
  },

  fire(uid) {
    const st = this.state;
    st.roster = st.roster.filter(m => m.uid !== uid);
    st.activeUids = st.activeUids.filter(id => id !== uid);
    this.save();
  },

  toggleDeploy(uid) {
    const st = this.state;
    const monster = st.roster.find(m => m.uid === uid);
    if (!monster || this.departmentOf(monster).id !== "combat") return false;
    const index = st.activeUids.indexOf(uid);
    if (index >= 0) {
      st.activeUids.splice(index, 1);
    } else {
      if (st.activeUids.length >= this.MAX_DEPLOY) return false;
      st.activeUids.push(uid);
    }
    this.save();
    this.kpi("formationChanged");
    return true;
  },

  assignDepartment(uid, departmentId) {
    const st = this.state;
    const monster = st.roster.find(m => m.uid === uid);
    if (!monster || !DEPARTMENTS[departmentId]) return false;
    monster.department = departmentId;
    if (departmentId === "combat") {
      if (!st.activeUids.includes(uid) && st.activeUids.length < this.MAX_DEPLOY) st.activeUids.push(uid);
    } else {
      st.activeUids = st.activeUids.filter(id => id !== uid);
    }
    this.save();
    this.kpi("formationChanged");
    return true;
  },

  moveDeployed(uid, dir) {
    const r = this.state.activeUids;
    const index = r.indexOf(uid);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= r.length) return;
    [r[index], r[next]] = [r[next], r[index]];
    this.save();
    this.kpi("formationChanged");
  },

  moveUnit(index, dir) {
    const r = this.state.roster;
    const j = index + dir;
    if (j < 0 || j >= r.length) return;
    [r[index], r[j]] = [r[j], r[index]];
    this.save();
  },

  // ── 出撃と戦闘処理 ────────────────────────
  deploy() {
    const st = this.state;
    if (this.activeRoster().length === 0) return null;
    const openingBattle = !!st.openingPrototype;
    // 旧セーブやテストが直接 formation を作った場合だけ、次の侵攻作戦を補う。
    if (!st.selectedMission) {
      const invade = MISSION_TYPES.find(m => m.id === "invade");
      st.selectedMission = this.buildMission(invade);
    }
    const notes = [];

    // 未払いはこの戦闘から特性・不祥事・BGMへ効く。厚遇は戦う前に実際に支払う。
    // 支払い後に合体するスライムも含め、画面で提示した給与総額と実額を一致させる。
    if (!openingBattle && !this.preparePayrollForBattle(notes)) return null;

    // キングスライム合体（出撃時・永続）。既定では従来どおり合体するが、**断れる**。
    // 3体が1体になるので、硬く重くなる代わりに頭数で伸びるもの（低賃金大量採用・
    // 群れの本能・出撃枠の圧）を失う。どちらが得かは編成によるので判断へ返した。
    // 既定を「合体しない」にして測ったらスライム統一のクリア率が48%→29%へ落ちたので、
    // 既定は合体のままにしてある（黙って弱くしない）。
    const kingSyn = SYNERGIES.find(s => s.id === "king_slime");
    let kingMerged = false;
    if (kingSyn && st.kingSlimeMerge !== false && kingSyn.check(this.rosterAsUnits())) {
      kingMerged = this.mergeKingSlime(notes);
    }

    const battleRations = openingBattle ? null : this.prepareBattleRations(notes);
    const playerUnits = this.preparedRoster(battleRations).map(m => Battle.makeUnit(m, "player"));
    // 雇った傭兵は出撃5枠の外から加わる。戦闘が終われば去る（次の戦闘には残らない）
    for (const merc of this.preparedMercenaries()) {
      const unit = Battle.makeUnit(merc, "player");
      unit.flags.mercenary = true;
      playerUnits.push(unit);
    }
    const stageData = this.stageData();
    // ビルド試行の判定は戦闘前に取る（戦死・合体で編成が変わる前の「何を試したか」を見るため）
    this.kpi("battleStarted", st, stageData);
    const enemyUnits = stageData.units.map(e => Battle.makeUnit(e, "enemy"));

    const rationContext = battleRations ? {
      ...battleRations,
      cookUid: playerUnits.find(u => u.traits.includes("demon_cook"))?.uid || null,
      bigEaterUids: playerUnits.filter(u => u.traits.includes("big_eater")).map(u => u.uid),
      hungerUid: playerUnits.find(u => u.traits.includes("hunger_demon"))?.uid || null,
      feastUid: battleRations.consumed >= 4
        ? playerUnits.slice().sort((a, b) => a.spd - b.spd)[0]?.uid || null : null
    } : null;
    const extortionLedger = st.facilityLevel >= 1
      && this.activeRoster().some(m => (m.job || "").includes("会計"));
    const graveyard = st.facilityLevel >= 1
      && this.departmentRoster("construction").some(m => m.tplId === "necromancer");
    const result = Battle.simulate(playerUnits, enemyUnits, { rations: rationContext, extortionLedger, graveyard });
    // 合体は simulate() の前に処理するため、そのままでは通常のシナジー判定に
    // 残らない。タイムラインへ戻すことで、ログ・カットイン・結果表示を揃える。
    if (kingMerged) this.addMergeSynergy(result, kingSyn);
    this.recordDiscoveredSynergies(result);

    // 最大戦力を記録（魔界史用）
    st.maxPower = Math.max(st.maxPower, this.armyPower(this.activeRoster()));

    // ラン全体の主要記録は最大CHAINと最大OVERKILLの2つだけ（設計憲法 第11節）。
    // 勝敗を問わず更新する。再起で巻き戻したときはチェックポイントごと戻るのが正しい
    // （やり直した歴史の記録は残さない）ので、ここに別のテレメトリは持たない。
    st.maxChain = Math.max(st.maxChain || 0, (result.chainSummary && result.chainSummary.maxChain) || 0);
    st.maxOverkill = Math.max(st.maxOverkill || 0, (result.overkillSummary && result.overkillSummary.maxPercent) || 0);

    const goldBefore = st.gold;
    const lootGold = Math.max(0, Number(result.resourceChanges && result.resourceChanges.gold) || 0);
    if (result.victory) {
      st.gold += stageData.reward + lootGold;
      notes.push(`勝利報酬 ${stageData.reward}G を獲得（所持金 ${st.gold}G）`);
      if (lootGold > 0) notes.push(`戦闘中の略奪 ${lootGold}G を確定（所持金 ${st.gold}G）`);
      this.processCasualties(result.contribution, notes);
      this.awardMerit(result.contribution, notes);
      this.applyMissionOutcome(stageData, notes);
      if (openingBattle) {
        const foodReward = Math.max(0, stageData.foodReward || 0);
        const materialReward = Math.max(0, stageData.materialReward || 0);
        st.food += foodReward;
        st.materials += materialReward;
        if (foodReward || materialReward) notes.push(`作戦資源：食料 +${foodReward} / 建材 +${materialReward}`);
      }
      if (!openingBattle) {
      this.processDepartments(stageData, notes, undefined, battleRations);
        this.paySalaries(notes);
        this.processDepartures(notes);
      }
      st.battlesWon += 1;
      if (!openingBattle) st.turn += 1;
      st.stage = Math.min(this.MAX_CONQUEST, st.conquest + 1); // 旧イベントとの互換用
      st.missionOffers = [];
      if (openingBattle && st.day < this.OPENING_DAYS) {
        st.expeditionUsedToday = true;
        st.phase = "result";
      } else if (openingBattle) {
        st.openingDefenseWon = true;
        this.advanceDay(st.day);
        st.turn += 1;
        st.phase = "result";
        this.genApplicants();
      } else if (st.conquest >= this.MAX_CONQUEST) {
        st.phase = "clear";   // 記録の確定は deploy() の末尾でまとめて行う
      } else {
        st.phase = "result";
        this.genApplicants();
      }
    } else {
      // 敗北。再起の余地があるうちは魔界史に確定させない
      st.phase = "defeat";
    }

    st.lastBattle = {
      victory: result.victory,
      missionKind: stageData.missionKind,
      missionTitle: stageData.missionTitle,
      army: stageData.army,
      region: stageData.region,
      reward: result.victory ? stageData.reward : 0,
      lootGold: result.victory ? lootGold : 0,
      battleRations,
      goldBefore,
      synergies: result.activeSynergies,
      incidents: result.incidents || [],
      notes,
      logLength: result.log.length,
      contribution: this.attachVoices(result.contribution, result.victory),
      nearMiss: result.nearMiss,
      chainSummary: result.chainSummary,
      overkillSummary: result.overkillSummary,
      summonCount: result.summonCount || 0
    };
    st.battleIncidentTotal = (st.battleIncidentTotal || 0) + (result.incidents || []).length;
    // 傭兵は契約終了。次の戦闘は新しい候補から選び直す
    if ((st.mercenaries || []).length) {
      notes.push(`傭兵${st.mercenaries.length}名との契約が終了した（${st.mercenaries.map(m => m.name).join("、")}）`);
    }
    st.mercenaries = [];
    st.mercenaryOffers = [];

    // 記録の確定とセーブの後始末は必ず最後に行う。先に endRun してから
    // save すると、消したはずのセーブが書き戻ってしまう。
    if (st.phase === "clear") {
      this.endRun(true);
    } else if (st.phase === "defeat" && !this.canRetry()) {
      st.phase = "gameover";
      this.endRun(false);
    } else {
      this.save();
    }
    return { result, notes, stageData };
  },

  applyMissionOutcome(mission, notes) {
    const st = this.state;
    st.alert = Math.max(0, st.alert + (mission.alertDelta || 0));
    st.conquest = U.clamp(st.conquest + (mission.conquestDelta || 0), 0, this.MAX_CONQUEST);
    const kind = mission.missionKind || "invade";
    st.missionCounts[kind] = (st.missionCounts[kind] || 0) + 1;
    if (mission.conquestDelta) {
      notes.push(`王国攻略 ${st.conquest}/${this.MAX_CONQUEST}。王都へ一歩近づいた`);
    }
    if (mission.loyaltyDelta) {
      for (const m of st.roster) {
        m.loyalty = U.clamp(m.loyalty + mission.loyaltyDelta, 0, 100);
      }
      notes.push(`反乱鎮圧の威光により、生存者全員の忠誠+${mission.loyaltyDelta}`);
    }
    if (mission.alertDelta) {
      notes.push(`王国警戒度+${mission.alertDelta}（現在 ${st.alert}）`);
    }
  },

  // 戦闘で得た資源を、非戦闘部門が次の戦いへつなぐ。
  // 生活は食料を生み、建設は備蓄建材を施設進捗へ変換する。
  processDepartments(mission, notes, dailyDay, battleRations) {
    const st = this.state;
    const lifeWorkers = this.departmentRoster("life");
    const builders = this.departmentRoster("construction");
    const output = this.departmentOutput();
    const foodReward = Math.max(0, mission.foodReward || 0);
    const materialReward = Math.max(0, mission.materialReward || 0);
    const normalized = dailyDay !== undefined;
    const foodProduced = normalized ? this.dailyShare(output.food, dailyDay) : output.food;
    const postBattleRoster = st.roster.filter(m => !st.activeUids.includes(m.uid));
    const remainingNeed = battleRations
      ? battleRations.remainingNeed
      : this.foodNeedFor(postBattleRoster);
    const foodConsumed = normalized ? this.dailyShare(this.foodNeed(), dailyDay) : remainingNeed;

    st.food += foodReward + foodProduced;
    const pantryShortage = Math.max(0, foodConsumed - st.food);
    const rationShortage = normalized ? 0 : Math.max(0, battleRations?.shortage || 0);
    const foodShortage = pantryShortage + rationShortage;
    st.food = Math.max(0, st.food - foodConsumed);
    let loyaltyDelta = 0;
    if (foodShortage > 0) {
      loyaltyDelta = -Math.min(24, foodShortage * DEPARTMENT_RULES.foodShortageLoyaltyPenalty);
    } else if (lifeWorkers.length > 0) {
      loyaltyDelta = normalized ? this.dailyShare(1, dailyDay) : 1;
    }
    if (loyaltyDelta) {
      for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + loyaltyDelta, 0, 100);
    }

    st.materials += materialReward;
    const beforeLevel = st.facilityLevel;
    const maxLevel = FACILITY_LEVELS.length - 1;
    const canBuild = st.facilityLevel < maxLevel;
    // 供養代行：建設部門の死霊術師は、直前の戦没者を建材へ変える（墓石も城壁も石である）。
    // 戦死という損失が別部門の資源になる、いちばん短い接続。
    const mourners = builders.filter(m => m.tplId === "necromancer").length;
    const salvageTotal = mourners > 0 ? mourners * (st.pendingVacancies || 0) * 2 : 0;
    const salvage = normalized ? this.dailyShare(salvageTotal, dailyDay) : salvageTotal;
    st.materials += salvage;
    const buildCapacity = normalized ? this.dailyShare(output.material, dailyDay) : output.material;
    const materialUsed = canBuild ? Math.min(st.materials, buildCapacity) : 0;
    st.materials -= materialUsed;
    st.buildProgress += materialUsed;
    while (st.facilityLevel < maxLevel
      && st.buildProgress >= FACILITY_LEVELS[st.facilityLevel + 1].buildThreshold) {
      st.facilityLevel += 1;
    }

    st.lastDepartmentReport = {
      foodReward,
      foodProduced,
      foodConsumed,
      foodShortage,
      loyaltyDelta,
      materialReward,
      materialUsed,
      buildCapacity,
      salvage,
      wageDiscount: output.wage,
      recruitBonus: output.recruit,
      facilityBefore: beforeLevel,
      facilityAfter: st.facilityLevel,
      builders: builders.length,
      lifeWorkers: lifeWorkers.length
    };

    notes.push(`生活部門：食料 +${foodReward + foodProduced} / 消費 ${foodConsumed}（備蓄 ${st.food}）`);
    if (output.wage > 0) notes.push(`経理部の働きで給与総額を ${output.wage}% 圧縮した`);
    if (foodShortage > 0) {
      notes.push(`食料不足 ${foodShortage}！ 軍団全員の忠誠${loyaltyDelta}`);
    } else if (lifeWorkers.length > 0) {
      notes.push(`生活部門の温かい食事で軍団全員の忠誠+1`);
    }
    if (salvage > 0) {
      notes.push(`供養代行：戦没者を弔い、墓石ぶんの建材 +${salvage} を得た……`);
    }
    notes.push(`建設部門：建材 +${materialReward} / 投入 ${materialUsed}`
      + `（施工能力 ${buildCapacity}・備蓄 ${st.materials}）`);
    if (st.facilityLevel > beforeLevel) {
      const facility = this.facilityInfo();
      notes.push(`施設完成【${facility.name}】出撃隊 HP+${Math.round((facility.hpMult - 1) * 100)}%・防御+${facility.defBonus}`);
    }
  },

  awardMerit(contribution, notes) {
    const st = this.state;
    st.lastPromotions = [];
    const survivors = (contribution || []).filter(c => c.survived !== false);
    if (!survivors.length) return;
    const topDealer = survivors.reduce((best, c) => !best || c.dealt > best.dealt ? c : best, null);
    const topTanker = survivors.reduce((best, c) => !best || c.taken > best.taken ? c : best, null);
    for (const c of survivors) {
      const monster = st.roster.find(m => m.uid === c.uid);
      if (!monster) continue;
      let gained = 1 + Math.min(2, c.kills || 0);
      if (topDealer && c.uid === topDealer.uid && c.dealt > 0) gained += 2;
      if (topTanker && c.uid === topTanker.uid && c.taken > 0 && c.uid !== topDealer.uid) gained += 1;
      monster.merit = (monster.merit || 0) + gained;
      const targetRank = this.rankForMerit(monster.merit);
      while (monster.rankId !== targetRank.id) {
        const next = this.nextRank(monster);
        if (!next || next.threshold > monster.merit) break;
        this.promote(monster, next, notes);
      }
    }
  },

  promote(monster, rank, notes) {
    const boost = rank.boost || {};
    monster.rankId = rank.id;
    monster.hp = Math.max(1, Math.round(monster.hp * (boost.hp || 1)));
    monster.atk = Math.max(1, Math.round(monster.atk * (boost.atk || 1)));
    monster.def = Math.max(0, monster.def + (boost.def || 0));
    monster.loyalty = U.clamp(monster.loyalty + (boost.loyalty || 0), 0, 100);
    monster.salary += boost.salary || 0;
    const entry = { uid: monster.uid, name: monster.name, rankId: rank.id, rankName: rank.name, message: rank.message };
    this.state.lastPromotions.push(entry);
    if (rank.id === "general" && !this.state.generalsMade.some(g => g.uid === monster.uid)) {
      this.state.generalsMade.push({ uid: monster.uid, name: monster.name, race: monster.race });
    }
    notes.push(`昇進！ ${monster.name} は【${rank.name}】となった。${rank.message}`);
  },

  // 戦果に応じて各モンスターの一言を選ぶ。
  // 状況の優先度: 戦死 > 給与未払い > 殊勲 > 何もできず > 被弾最多 > 勝敗。
  // 画面の再描画で台詞が変わらないよう、ここで一度だけ選んで保存する。
  attachVoices(contribution, victory) {
    if (!contribution || contribution.length === 0) return contribution;
    // 配列の並び順に依存しないよう、最大値を明示的に求める
    const topDealer = contribution.reduce((b, c) => (c.dealt > 0 && (!b || c.dealt > b.dealt)) ? c : b, null);
    const topTanker = contribution.reduce((b, c) => (c.taken > 0 && (!b || c.taken > b.taken)) ? c : b, null);
    for (const c of contribution) {
      const tpl = MONSTER_TEMPLATES.find(t => t.id === c.tplId);
      const v = (tpl && tpl.voices) || SPECIAL_MONSTER_VOICES[c.tplId];
      if (!v) { c.voice = null; continue; }
      let key;
      if (c.survived === false) key = "dead";
      else if (c.unpaid) key = "unpaid";
      else if (topDealer && c.id === topDealer.id) key = "mvp";
      else if (c.dealt === 0) key = "idle";
      else if (topTanker && c.id === topTanker.id) key = "hurt";
      else key = victory ? "win" : "lose";
      const pool = (v[key] && v[key].length) ? v[key] : v[victory ? "win" : "lose"];
      c.voice = (pool && pool.length) ? U.pick(pool) : null;
    }
    return contribution;
  },

  addMergeSynergy(result, synergy) {
    const event = {
      eventId: `merge-${synergy.id}`, type: "synergy", id: synergy.id, name: synergy.name, desc: synergy.desc, emphasis: 3,
      text: `シナジー発動【${synergy.name}】 ${synergy.desc}`, cls: "synergy"
    };
    const startAt = result.timeline.findIndex(e => e.type === "battle_start");
    result.timeline.splice(Math.max(0, startAt + 1), 0, event);
    result.log.unshift({ t: event.text, c: event.cls });
    result.activeSynergies.unshift(synergy.name);
  },

  rosterAsUnits() {
    // シナジー判定用に mods/traits を持つ簡易ビューを作る
    return this.activeRoster();
  },

  mergeKingSlime(notes) {
    const st = this.state;
    const slimes = this.activeRoster().filter(m => m.race === "スライム").slice(0, 3);
    if (slimes.length < 3) return false;
    const merit = slimes.reduce((sum, m) => sum + (m.merit || 0), 0);
    const rank = this.rankForMerit(merit);
    const king = {
      uid: st.uidSeq++,
      tplId: "king_slime",
      name: `キング${slimes[0].name}`,
      race: "キングスライム",
      job: "王",
      hp: Math.round(slimes.reduce((s, m) => s + m.hp, 0) * 1.2),
      atk: slimes.reduce((s, m) => s + m.atk, 0),
      def: Math.max(...slimes.map(m => m.def)) + 2,
      spd: Math.round(slimes.reduce((s, m) => s + m.spd, 0) / 3),
      salary: Math.max(1, slimes.reduce((s, m) => s + m.salary, 0) - 2),
      loyalty: Math.round(slimes.reduce((s, m) => s + m.loyalty, 0) / 3),
      traits: ["slime_body", "regen"],
      tags: [],
      quote: "……！（すごく大きくなった）",
      prevJob: `スライム3体（${slimes.map(m => m.name).join("・")}）`,
      motive: "みんなで、ひとつに、なりました",
      flaw: "もう、もどれない",
      unpaid: slimes.some(m => m.unpaid),
      unpaidStreak: Math.max(0, ...slimes.map(m => m.unpaidStreak || 0)),
      department: "combat",
      merit,
      rankId: rank.id
    };
    const removed = new Set(slimes.map(m => m.uid));
    const idx = st.roster.findIndex(m => removed.has(m.uid));
    st.roster = st.roster.filter(m => !removed.has(m.uid));
    st.roster.splice(Math.min(idx, st.roster.length), 0, king);
    const activeIndex = Math.min(...slimes.map(m => st.activeUids.indexOf(m.uid)).filter(i => i >= 0));
    st.activeUids = st.activeUids.filter(uid => !removed.has(uid));
    st.activeUids.splice(Math.min(activeIndex, st.activeUids.length), 0, king.uid);
    st.raceCounts["キングスライム"] = (st.raceCounts["キングスライム"] || 0) + 1;
    if (rank.id === "general" && !st.generalsMade.some(g => g.uid === king.uid)) {
      st.generalsMade.push({ uid: king.uid, name: king.name, race: king.race });
    }
    notes.push(`スライム3体が合体して ${king.name} が誕生した！！`);
    return true;
  },

  paySalaries(notes, dailyDay) {
    const st = this.state;
    const assignments = this.salaryAssignments().map(entry => ({
      ...entry,
      amount: dailyDay === undefined ? entry.amount : this.dailyShare(entry.amount, dailyDay)
    }));
    const total = assignments.reduce((sum, entry) => sum + entry.amount, 0);
    const paidRoster = assignments.map(entry => entry.monster);
    if (total === 0) return;
    const policy = this.payrollPolicy();
    if (policy.id === "advance" && dailyDay === undefined) return; // 従来進行では出撃前に支払い済み
    if (policy.id === "withhold") {
      if (dailyDay !== undefined) {
        const penalty = this.dailyShare(15, dailyDay);
        for (const m of paidRoster) {
          m.unpaid = true;
          m.loyalty = U.clamp(m.loyalty - penalty, 0, 100);
          if (dailyDay === this.OPENING_DAYS) m.unpaidStreak = (m.unpaidStreak || 0) + 1;
        }
        st.lastPayrollReport = { policyId: policy.id, base: total, paid: 0, loyaltyDelta: -penalty };
        notes.push(`魔王命令により本日の給与を未払い。勤務者の忠誠-${penalty}`);
        return;
      }
      const worst = this.applyUnpaidPenalty(paidRoster);
      st.lastPayrollReport = { policyId: policy.id, base: total, paid: 0, loyaltyDelta: -worst };
      notes.push(`魔王命令により給与・部門手当${total}Gを意図的に未払い。勤務者の忠誠が最大 ${worst} 下がった`);
      return;
    }
    const payable = policy.id === "advance" ? Math.ceil(total * policy.costRate) : total;
    if (st.gold >= payable) {
      st.gold -= payable;
      const loyaltyGain = dailyDay === undefined
        ? (policy.id === "advance" ? 8 : 2)
        : this.dailyShare(policy.id === "advance" ? 8 : 2, dailyDay);
      for (const m of paidRoster) {
        m.unpaid = false;
        m.unpaidStreak = 0;
        m.loyalty = U.clamp(m.loyalty + loyaltyGain, 0, 100);
      }
      st.lastPayrollReport = { policyId: policy.id, base: total, paid: payable, loyaltyDelta: loyaltyGain };
      notes.push(`給与・部門手当 ${payable}G を支払った（所持金 ${st.gold}G）勤務者の忠誠+${loyaltyGain}`);
    } else {
      // 連続で未払いにするほど痛手が大きくなる。固定値だと8戦のランでは
      // 忠誠0に届かず、離脱の脅しが空砲になっていた（実測 300ラン中1回）。
      let worst;
      if (dailyDay !== undefined) {
        worst = this.dailyShare(15, dailyDay);
        for (const m of paidRoster) {
          m.unpaid = true;
          m.loyalty = U.clamp(m.loyalty - worst, 0, 100);
          if (dailyDay === this.OPENING_DAYS) m.unpaidStreak = (m.unpaidStreak || 0) + 1;
        }
      } else {
        worst = this.applyUnpaidPenalty(paidRoster);
      }
      st.lastPayrollReport = { policyId: policy.id, base: total, paid: 0, loyaltyDelta: -worst, insufficient: true };
      notes.push(`金庫が足りない！ 給与・部門手当${total}G が未払いに……勤務者の忠誠が最大 ${worst} 下がった`);
    }
  },

  // 日次決算の唯一の入口。同じ日は一度しか処理せず、戦闘の有無とは切り離す。
  advanceDay(expectedDay) {
    const st = this.state;
    if (!st || !st.openingPrototype || st.day > this.OPENING_DAYS) return false;
    if (expectedDay !== undefined && Number(expectedDay) !== st.day) return false;
    if (st.dailySettledDay >= st.day) return false;
    if (st.day === this.OPENING_DAYS && !st.openingDefenseWon) return false;
    const notes = [];
    this.processDepartments({}, notes, st.day);
    this.paySalaries(notes, st.day);
    this.processDepartures(notes);
    st.dailySettledDay = st.day;
    st.lastDailyReport = { day: st.day, notes: notes.slice() };
    if (st.day < this.OPENING_DAYS) {
      st.day += 1;
      st.expeditionUsedToday = false;
      st.phase = "preparation";
    } else {
      st.openingPrototype = false;
    }
    this.save();
    return st.lastDailyReport;
  },

  recordDiscoveredSynergies(result) {
    for (const event of (result.timeline || []).filter(e => e.type === "synergy" && e.id)) {
      if (!SYNERGIES.some(s => s.id === event.id)) continue;
      if (this.state.discoveredSynergyIds.includes(event.id)) continue;
      this.state.discoveredSynergyIds.push(event.id);
      // 重要度の印。このランで初めて見たシナジーは描画側で尺を縮めない。
      // 「初めて」はラン内の基準（魔界史全体にすると2代目以降ほぼ祝えなくなる）。
      event.firstDiscovery = true;
    }
  },

  // 過去の英雄は能力ではなく「名前と経歴」を継ぐ。毎ラン一度だけ低確率で戻る。
  chooseLegacyReturn(history) {
    const candidates = (history || []).map(r => r && r.hallOfFame).filter(h =>
      h && h.tplId && MONSTER_TEMPLATES.some(t => t.id === h.tplId)
    );
    return candidates.length > 0 && U.chance(0.25) ? { ...U.pick(candidates) } : null;
  },

  hallOfFameMember() {
    const roster = this.state.roster || [];
    if (!roster.length) return null;
    const m = roster.reduce((best, current) => {
      if (!best) return current;
      const meritDiff = (current.merit || 0) - (best.merit || 0);
      return meritDiff > 0 || (meritDiff === 0 && this.power(current) > this.power(best)) ? current : best;
    }, null);
    return {
      name: m.name, tplId: m.tplId, race: m.race, job: m.job,
      prevJob: m.prevJob, motive: m.motive, flaw: m.flaw, quote: m.quote,
      generation: this.state.generation, merit: m.merit || 0, rankId: m.rankId || "soldier"
    };
  },

  preparePayrollForBattle(notes) {
    const st = this.state;
    const quote = this.payrollQuote();
    const policy = quote.policy;
    const assignments = this.salaryAssignments();
    const workers = assignments.map(entry => entry.monster);
    if (policy.id === "advance") {
      if (!quote.affordable) return false;
      st.gold -= quote.cost;
      for (const m of workers) {
        m.unpaid = false;
        m.unpaidStreak = 0;
        m.loyalty = U.clamp(m.loyalty + 8, 0, 100);
      }
      st.lastPayrollReport = { policyId: policy.id, base: quote.base, paid: quote.cost, loyaltyDelta: 8 };
      notes.push(`給与・部門手当を ${quote.cost}G で前払い・厚遇した（所持金 ${st.gold}G）勤務者の忠誠+8`);
    } else if (policy.id === "withhold") {
      for (const m of workers) m.unpaid = true;
      st.lastPayrollReport = { policyId: policy.id, base: quote.base, paid: 0, loyaltyDelta: 0, pending: true };
      notes.push(`魔王命令：今回は給与を払わない。勤務者は未払いのまま出撃する`);
    } else {
      st.lastPayrollReport = { policyId: policy.id, base: quote.base, paid: 0, loyaltyDelta: 0, pending: true };
    }
    st.payrollChoices[policy.id] = (st.payrollChoices[policy.id] || 0) + 1;
    return true;
  },

  applyUnpaidPenalty(roster) {
    let worst = 0;
    for (const m of roster) {
      m.unpaid = true;
      m.unpaidStreak = (m.unpaidStreak || 0) + 1;
      const penalty = 15 + 15 * (m.unpaidStreak - 1);
      worst = Math.max(worst, penalty);
      m.loyalty = U.clamp(m.loyalty - penalty, 0, 100);
    }
    return worst;
  },

  // 戦死した者を軍から外す。給与計算より前に呼ぶので、死者に給料は出ない。
  //
  // これが無いと「死んだのに次の戦いで全快で復帰する」ことになり、最期の台詞も
  // 戦果パネルの戦死バッジも意味を失う。同時に、採用フェーズが「欠員が出たから
  // 募集する」という本来の意味を持つようになる。
  //
  // 判定に died（一度でも倒れたか）ではなく survived（最終的に生きていたか）を
  // 使うのが要点。これにより死霊術・執念・白骨といった蘇生系の特性が
  // 「永久退場を防ぐ保険」として機能する。
  processCasualties(contribution, notes) {
    const st = this.state;
    st.pendingVacancies = 0;
    st.lastFallen = [];
    // 傭兵は軍団員ではない。倒れても欠員にならず、戦没者名簿にも載らない
    const fallen = (contribution || []).filter(c => c.survived === false && !c.mercenary);
    if (fallen.length === 0) return;

    const uids = new Set(fallen.map(c => c.uid));
    st.roster = st.roster.filter(m => !uids.has(m.uid));
    st.activeUids = st.activeUids.filter(uid => !uids.has(uid));
    st.pendingVacancies = fallen.length;
    st.fallenTotal = (st.fallenTotal || 0) + fallen.length;
    st.lastFallen = fallen.map(c => ({ name: c.name, race: c.race }));
    st.fallenRoll = (st.fallenRoll || []).concat(st.lastFallen);
    notes.push(`戦没：${fallen.map(c => c.name).join("、")}（${fallen.length}名）。`
      + `この者たちへの給与支払いは不要になった`);
  },

  processDepartures(notes) {
    const st = this.state;
    const leaving = st.roster.filter(m => m.loyalty <= 0);
    for (const m of leaving) {
      notes.push(`${m.name} は愛想を尽かして軍を去った……`);
    }
    if (leaving.length > 0) {
      const ids = new Set(leaving.map(m => m.uid));
      st.roster = st.roster.filter(m => !ids.has(m.uid));
      st.activeUids = st.activeUids.filter(uid => !ids.has(uid));
    }
  },

  // ── ラン終了と魔界史 ──────────────────────
  endRun(cleared) {
    const st = this.state;
    const won = st.battlesWon || 0;
    const finalMission = st.selectedMission || this.stageData();
    const mainRace = Object.entries(st.raceCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "なし";
    const record = {
      gen: st.generation,
      demonKingId: this.demonKing().id,
      demonKingName: this.demonKing().name,
      cleared,
      battlesWon: won,
      conquest: st.conquest || 0,
      alert: st.alert || 0,
      missionCounts: { ...(st.missionCounts || {}) },
      payrollChoices: { ...(st.payrollChoices || {}) },
      reignYears: won * 4 + U.randInt(1, 3),
      maxPower: st.maxPower,
      maxChain: st.maxChain || 0,
      maxOverkill: st.maxOverkill || 0,
      mainRace,
      region: cleared ? "王都（制圧）" : finalMission.region,
      cause: cleared ? "人間界を征服し引退" : `${finalMission.army}に敗北`,
      retriesUsed: st.retriesUsed || 0,
      fallenTotal: st.fallenTotal || 0,
      fallenRoll: (st.fallenRoll || []).map(f => f.name),
      generalsMade: (st.generalsMade || []).map(g => ({ name: g.name, race: g.race })),
      battleIncidentTotal: st.battleIncidentTotal || 0,
      facilityLevel: st.facilityLevel || 0,
      finalResources: { food: st.food || 0, materials: st.materials || 0 },
      departmentCounts: Object.fromEntries(DEPARTMENT_ORDER.map(id => [id, this.departmentRoster(id).length])),
      finalRoster: st.roster.map(m => ({
        name: m.name, tplId: m.tplId, race: m.race, job: m.job, rankId: m.rankId,
        merit: m.merit || 0, department: this.departmentOf(m).id
      })),
      recruitedTplIds: (st.recruitedTplIds || []).slice(),
      discoveredSynergyIds: (st.discoveredSynergyIds || []).slice(),
      hallOfFame: this.hallOfFameMember(),
      maxArmySize: Math.max(st.maxArmySize || 0, st.roster.length),
      date: new Date().toISOString().slice(0, 10)
    };
    st.record = record;
    Storage.appendHistory(record);
    Storage.clearRun();
    // KPIはラン状態の外にあるので、再起で巻き戻しても減らない（第14節・意図的）
    this.kpi("runEnded", st, record);
  },

  // ── ハプニング ────────────────────────────
  EVENT_CHANCE: 0.45,

  // 戦闘後に何か起きるか抽選する。起きれば phase を "event" にする。
  maybeEvent() {
    const st = this.state;
    st.pendingEvent = null;
    st.eventOutcome = null;
    if (st.roster.length === 0) return false;
    if (!U.chance(this.EVENT_CHANCE)) return false;

    const pool = EVENTS.filter(e => { try { return e.check(st); } catch (err) { return false; } });
    if (pool.length === 0) return false;

    // 重み付き抽選
    const total = pool.reduce((sum, e) => sum + (e.weight || 1), 0);
    let r = U.rand() * total;
    let ev = pool[0];
    for (const e of pool) { r -= (e.weight || 1); if (r <= 0) { ev = e; break; } }

    const cast = ev.cast(st);
    if (!cast) return false;

    st.pendingEvent = { id: ev.id, cast, text: ev.text(st, this.resolveCast(cast)) };
    st.phase = "event";
    this.save();
    return true;
  },

  // uid で保存した登場人物を、その場のモンスターに解決する
  // （セーブをまたいでも壊れないよう、参照ではなく uid で持つ）
  resolveCast(cast) {
    const out = {};
    for (const k of Object.keys(cast || {})) {
      out[k] = this.state.roster.find(m => m.uid === cast[k]) || null;
    }
    return out;
  },

  currentEvent() {
    const pe = this.state.pendingEvent;
    return pe ? EVENTS.find(e => e.id === pe.id) : null;
  },

  // いま選べる選択肢（所持金が足りないものは除く）
  eventOptions() {
    const ev = this.currentEvent();
    if (!ev) return [];
    const st = this.state;
    return ev.options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => !o.check || o.check(st));
  },

  chooseEvent(index) {
    const st = this.state;
    const ev = this.currentEvent();
    if (!ev || !ev.options[index]) return false;
    const cast = this.resolveCast(st.pendingEvent.cast);
    // 登場人物が既に居ない場合は何も起こさない
    for (const k of Object.keys(cast)) if (cast[k] === null && st.pendingEvent.cast[k] !== undefined) {
      st.eventOutcome = "……当人はもう軍にいなかった。話は流れた。";
      st.pendingEvent = null;
      this.save();
      return true;
    }
    const notes = [];
    st.eventOutcome = ev.options[index].apply(st, cast) || "";
    this.processDepartures(notes);
    if (notes.length) st.eventOutcome += "\n" + notes.join("\n");
    st.pendingEvent = null;
    this.save();
    return true;
  },

  // 勝利後「次へ」→ 採用フェーズへ
  // 結果画面の「次へ」。ハプニングが起きればそちらを先に見せる。
  afterResult() {
    const st = this.state;
    if (st.openingPrototype && st.day < this.OPENING_DAYS) {
      st.phase = "preparation";
      st.selectedMission = null;
      this.save();
      return "preparation";
    }
    if (this.maybeEvent()) return "event";
    this.nextRecruit();
    return "recruit";
  },

  nextRecruit() {
    const st = this.state;
    st.phase = "recruit";
    // 欠員が出た分だけ追加で採用できる（欠員募集）
    st.hiresLeft = 1 + (st.pendingVacancies || 0);
    st.pendingVacancies = 0;
    st.rerollsThisPhase = 0;
    st.pendingEvent = null;
    st.eventOutcome = null;
    st.selectedMission = null;
    st.missionOffers = [];
    this.saveCheckpoint();   // ここが「一戦手前」の戻り先になる
    this.save();
  }
};
