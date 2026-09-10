// 1ラン（第N代魔王軍）の状態管理。UIはここのメソッドを呼んで再描画するだけ。
const Game = {
  state: null,

  power(m) { return m.hp + m.atk * 3 + m.def * 2 + m.spd; },
  armyPower(roster) { return roster.reduce((s, m) => s + this.power(m), 0); },

  RETRIES_PER_RUN: 1,
  MAX_CONQUEST: ENEMY_STAGES.length,
  MAX_ARMY: 20,
  MAX_DEPLOY: 5,
  EXTRA_HIRE_BASE_COST: 4,
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
    // 教訓は前代の敗北画面で選ばれている。読んだら消す（1ランに1つだけ効く）
    const lessonId = Storage.loadLesson();
    Storage.clearLesson();
    const demonKing = DEMON_KINGS.find(k => k.id === demonKingId) || DEMON_KINGS[0];
    this.state = {
      demonKingId: demonKing.id,
      generation: history.length + 1,
      stage: 1,
      turn: 1,
      day: 1,
      // 3日間の開幕プロトタイプは2026-09-03に撤廃。最初から通常ループへ入る。
      openingPrototype: false,
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
      activeFacilityId: null,
      pendingFacilityChoiceLevel: null,
      seizeUsed: false,
      lastDepartmentReport: null,
      payrollPolicy: "regular",
      payrollChoices: { regular: 0, withhold: 0, advance: 0 },
      lastPayrollReport: null,
      roster: [],
      activeUids: [],
      applicants: [],
      phase: "recruit",
      hiresLeft: demonKing.start.hires,
      extraHiresThisPhase: 0,
      maxPower: 0,
      maxArmySize: 0,
      mercenaryOffers: [],
      mercenaries: [],
      kingSlimeMerge: true,   // 出撃時に合体するか（既定は合体。編成画面で断れる）
      maxChain: 0,        // ラン全体の主要記録その1（設計憲法 第11節）
      maxOverkill: 0,     // 同その2。%で持つ
      // maxChain をどの数え方で記録するか。新規ランは現在の記録版、旧セーブは migrateState() が
      // V1のまま保つ。ラン途中で定数を読み直さず、保存値を正本にする。
      chainDefVersion: (typeof Chain !== "undefined" ? Chain.RECORDED_VERSION : 1),
      raceCounts: {},
      recruitedTplIds: [],
      discoveredSynergyIds: [],
      uidSeq: 1,
      lastBattle: null,
      // 魔界史へ残す「記憶」1件（R3）。ラン状態の中にあるので、再起で巻き戻せば
      // 記憶も一緒に戻る（やり直した歴史の出来事は残さない）。
      memory: null,
      // 前回出撃の確定値（R2）。次の出撃で「何を変えたか」を出すための基準。
      // ラン状態の中にあるので、再起では比較の基準もチェックポイントへ戻る。
      lastBuildSnapshot: null,
      retriesLeft: this.RETRIES_PER_RUN,
      retriesUsed: 0,
      rerollsThisPhase: 0,
      briefId: null,
      briefsThisPhase: 0,
      pendingEvent: null,
      eventOutcome: null,
      // 結果画面でも立ち絵と吹き出しを出すため、当事者の uid だけ残す（表示専用）
      eventCast: null,
      laborDispute: null,
      // 「得だが後で祟る」選択のツケ（伝票の配列。契約は下の oweDebt() 節）
      debts: [],
      legacyReturn,
      legacyOffered: false,
      lessonId: this.lessonById(lessonId) ? lessonId : null,
      pendingVacancies: 0,
      fallenTotal: 0,
      fallenRoll: [],
      lastFallen: [],
      lastPromotions: [],
      generalsMade: [],
      battleIncidentTotal: 0,
      // 撤退（2026-09-10）
      retreatCount: 0,
      pendingBattle: null,
      // 全滅の回数（2026-09-10・再建）
      wipeCount: 0,
      // 王国の反撃（2026-09-10）。開幕の値は newRun() の末尾で入れる。
      counterattack: null,
      heroCame: false,
      defenses: { won: 0, lost: 0 },
      ransackCount: 0,
      plundered: [],
      renownBonus: 0,
      clearedBy: null,
      castleFell: false,
      // 継承（2026-09-10）。永久離脱の履歴・蔵の品・次の面接に混ざる縁の者の予約。
      // **migrateState の defaults と両方に足すこと**（新規ランはこちらしか通らない）。
      departed: [],
      relics: [],
      relicSeq: 0,
      pendingBond: null,
      checkpoint: null
    };
    // 仕様2.5「開幕の勇者襲来を最初の反撃にする」は**開幕3日間プロトタイプ限定**にした。
    // 開幕モードは 2026-09-03 に撤廃されていて `openingPrototype` は常に false なので、
    // ここは今のところ動かない。通常ループの1戦目をいきなり防衛戦にすると、
    // 何もしていないのに討伐隊（段階+1）が来ることになり、「こちらの動きで警戒が溜まる」
    // という時計の意味そのものが壊れる（既存テスト3本もそれで落ちた）。
    // 開幕モードを復活させるなら、この分岐がそのまま最初の反撃になる。
    if (this.state.openingPrototype) {
      const rules = this.counterRules();
      const stage = ENEMY_STAGES[0];
      this.state.alert = rules.threshold;
      this.state.counterattack = { pending: true, kind: "punitive", armyName: `${stage.army}討伐隊` };
    }
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

  save() { this.syncDepartments(); Storage.saveRun(this.state); },
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
      roster: [], activeUids: [], applicants: [], hiresLeft: 1, extraHiresThisPhase: 0, maxPower: 0, maxArmySize: 0,
      // 旧セーブに chainDefVersion は無い。V1 として扱い、maxChain を推定変換しない。
      // 既に入っている値は defaults では上書きされない（下の undefined/null チェック）ので、
      // 途中ラン・ロード・再起で保存済みバージョンは変化しない。
      chainDefVersion: 1,
      maxChain: 0, maxOverkill: 0, mercenaryOffers: [], mercenaries: [], kingSlimeMerge: true, raceCounts: {}, recruitedTplIds: [], discoveredSynergyIds: [], uidSeq: 1,
      lastBattle: null, retriesLeft: this.RETRIES_PER_RUN, retriesUsed: 0,
      // 魔界史へ残す「記憶」1件（R3）。ラン状態の中にあるので、再起で巻き戻せば
      // 記憶も一緒に戻る（やり直した歴史の出来事は残さない）。旧セーブには無い。
      memory: null,
      // 前回出撃の確定値（R2）。旧セーブには無いので、読み直した最初の1戦は
      // 「比較する前がない」＝差分なしとして扱う（無いものを差分として捏造しない）。
      lastBuildSnapshot: null,
      rerollsThisPhase: 0, briefId: null, briefsThisPhase: 0, pendingEvent: null, eventOutcome: null, eventCast: null, laborDispute: null, checkpoint: null,
      pendingVacancies: 0, fallenTotal: 0, fallenRoll: [], lastFallen: [],
      lastPromotions: [],
      generalsMade: [],
      battleIncidentTotal: 0,
      turn: 1, conquest: 0, alert: 0, battlesWon: 0,
      day: 1, openingPrototype: false, dailySettledDay: 0, expeditionUsedToday: false, openingDefenseWon: false,
      missionOffers: [], selectedMission: null,
      missionCounts: { raid: 0, suppress: 0, invade: 0 },
      food: DEPARTMENT_RULES.startingFood, materials: 0,
      buildProgress: 0, facilityLevel: 0, activeFacilityId: null, pendingFacilityChoiceLevel: null,
      seizeUsed: false, lastDepartmentReport: null,
      payrollPolicy: "regular",
      payrollChoices: { regular: 0, withhold: 0, advance: 0 },
      lastPayrollReport: null,
      legacyReturn: null, legacyOffered: false, lessonId: null,
      feastPending: null, hungerStreak: 0,
      // 撤退（2026-09-10）。旧セーブには無い。pendingBattle は「答える前の戦闘」で、
      // ロード時には続行として決着させる（同じ戦闘を二度見せない）。
      retreatCount: 0, pendingBattle: null, wipeCount: 0,
      // 王国の反撃（2026-09-10）
      counterattack: null, heroCame: false, defenses: { won: 0, lost: 0 },
      ransackCount: 0, plundered: [], renownBonus: 0, clearedBy: null, castleFell: false,
      // 継承（2026-09-10）。旧セーブには無い。departed は永久離脱の履歴、
      // relics は蔵の品、pendingBond は「次の面接に混ざる縁の者」の予約。
      departed: [], relics: [], relicSeq: 0, pendingBond: null,
      debts: []
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (st[key] === undefined || st[key] === null) st[key] = Array.isArray(value) ? [] : value;
    }
    if (!Array.isArray(st.roster)) st.roster = [];
    if (!Array.isArray(st.activeUids)) st.activeUids = st.roster.slice(0, this.MAX_DEPLOY).map(m => m.uid);
    if (!Array.isArray(st.applicants)) st.applicants = [];
    if (!Array.isArray(st.debts)) st.debts = [];
    if (!Array.isArray(st.missionOffers)) st.missionOffers = [];
    if (!FACILITIES.some(f => f.id === st.activeFacilityId)) st.activeFacilityId = null;
    if (st.pendingFacilityChoiceLevel !== null) {
      st.pendingFacilityChoiceLevel = U.clamp(Number(st.pendingFacilityChoiceLevel) || 0, 1, FACILITY_LEVELS.length - 1);
    }
    if (!st.activeFacilityId && !st.pendingFacilityChoiceLevel && Number(st.facilityLevel) >= 1) {
      st.pendingFacilityChoiceLevel = U.clamp(Number(st.facilityLevel), 1, FACILITY_LEVELS.length - 1);
    }
    st.hiresLeft = Math.max(0, Number(st.hiresLeft) || 0);
    st.extraHiresThisPhase = Math.max(0, Number(st.extraHiresThisPhase) || 0);
    if (!Array.isArray(st.generalsMade)) st.generalsMade = [];
    if (!Array.isArray(st.recruitedTplIds)) st.recruitedTplIds = [];
    if (!Array.isArray(st.discoveredSynergyIds)) st.discoveredSynergyIds = [];
    for (const m of st.roster) {
      if (m.tplId && !st.recruitedTplIds.includes(m.tplId)) st.recruitedTplIds.push(m.tplId);
    }
    for (const m of st.roster) {
      if (!m.injured) m.injured = 0;   // 旧セーブに負傷は無い
      if (!Array.isArray(m.relicIds)) m.relicIds = [];
      this.memberRecord(m);            // record が無い者に record.battles++ すると落ちる
      this.baseOf(m);                  // base が無い旧セーブは現在値を基礎値にする
      if (!m.skillTier) m.skillTier = (m.traits || []).some(id => ((TRAITS[id] || {}).skill || {}).tier === 2) ? 2 : 1;
    }
    if (!Array.isArray(st.departed)) st.departed = [];
    if (!Array.isArray(st.relics)) st.relics = [];
    // 答える前の戦闘が保存されていたら、続行として決着させる。
    // 再生し直すと同じ戦闘を二度見ることになり、撤退の機会もリロードで取り直せてしまう。
    if (st.phase === "battle" && st.pendingBattle) {
      const pending = st.pendingBattle;
      st.pendingBattle = null;
      this.settleContinue(pending);
    } else if (st.phase === "battle") {
      st.pendingBattle = null;
      st.phase = "formation";
    }
    st.day = Math.max(1, Number(st.day) || 1);
    st.dailySettledDay = Math.max(0, Number(st.dailySettledDay) || 0);
    // 旧セーブが開幕3日間の途中なら、その日程だけを捨てて通常ループへ合流する。
    // 人材・資源・配置はそのまま残す。準備画面には選択中の通常作戦が無いため作戦会議へ戻す。
    const retiredOpening = !!st.openingPrototype;
    st.openingPrototype = false;
    if (retiredOpening) {
      st.dailySettledDay = 0;
      st.expeditionUsedToday = false;
      st.openingDefenseWon = false;
      if (st.phase === "preparation") {
        st.phase = "mission";
        st.selectedMission = null;
        st.missionOffers = [];
      }
    }
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
      m.department = DEPARTMENT_ID(m.department);  // 旧3部門（建設・生活）は留守番へ
      if (!DEPARTMENTS[m.department]) m.department = "combat";
      if (!Array.isArray(m.traits)) m.traits = [];
      if (m.tplId === "goblin" && !m.traits.includes("pickpocket")) m.traits.push("pickpocket");
      if (m.tplId === "ogre" && !m.traits.includes("big_eater")) m.traits.push("big_eater");
      if (m.tplId === "necromancer" && !m.traits.includes("gravekeeper")) m.traits.push("gravekeeper");
      if ((m.job || "").includes("料理人") && !m.traits.includes("demon_cook")) m.traits.push("demon_cook");
    }
    // 出撃隊（activeUids）に入っていない者は全員留守番。「控え」は無い（2026-09-10 オーナー決定）。
    const rosterIds = new Set(st.roster.map(m => m.uid));
    st.activeUids = st.activeUids.filter((uid, i, ids) => rosterIds.has(uid) && ids.indexOf(uid) === i)
      .slice(0, this.MAX_DEPLOY);
    if (st.activeUids.length === 0 && st.roster.length) {
      const preferred = st.roster.filter(m => m.department === "combat");
      st.activeUids = (preferred.length ? preferred : st.roster).slice(0, this.MAX_DEPLOY).map(m => m.uid);
    }
    this.syncDepartments();
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

  // 部門は出撃隊（activeUids）から導出する。出撃していれば出撃隊、それ以外は全員留守番。
  // monster.department は保存・KPI・旧コード互換のための写しで、syncDepartments() が揃える。
  departmentOf(monster) {
    if (!monster) return DEPARTMENTS.combat;
    const st = this.state;
    const active = st && Array.isArray(st.activeUids) && st.activeUids.includes(monster.uid);
    return active ? DEPARTMENTS.combat : DEPARTMENTS.home;
  },

  syncDepartments() {
    const st = this.state;
    if (!st || !Array.isArray(st.roster)) return;
    for (const m of st.roster) m.department = this.departmentOf(m).id;
  },

  // 旧ID（construction / life）で呼ばれても留守番を返す。
  departmentRoster(id) {
    const want = DEPARTMENT_ID(id);
    return this.state.roster.filter(m => this.departmentOf(m).id === want);
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

  // 収支を1か所で作る。HUD・採用・編成が同じ数字を見ないと「わかりにくい」が直らない。
  // produce は生活部門の調達、need は軍団全体の消費、delta が黒字か赤字か。
  foodBalance(roster) {
    const list = roster || this.state.roster;
    let produce = 0;
    for (const m of list) {
      produce += Aptitude.contribution(m, this.departmentOf(m).id).food;
    }
    const need = this.foodNeedFor(list);
    return { produce, need, delta: produce - need, stock: Math.max(0, this.state.food || 0) };
  },

  // 「この応募者を採ったら収支がどう動くか」を採用前に見せるための試算。
  // 正解を出さず、判断材料だけを出す（設計原則 第15節）。
  foodBalanceIfHired(monster) {
    const before = this.foodBalance();
    // 新人は既定部門に入る。配属前なので調達は数えず、食う量だけが確実に増える。
    const after = this.foodNeedFor([...this.state.roster, monster]);
    return { before, needAfter: after, needDelta: after - before.need };
  },

  battleRationQuote() {
    const foodBefore = Math.max(0, this.state.food || 0);
    const kitchen = this.state.activeFacilityId === "grand_kitchen";
    const totalNeed = this.foodNeed() + (kitchen ? 1 : 0);
    const need = this.foodNeedFor(this.activeRoster()) + (kitchen ? 1 : 0);
    const consumed = Math.min(foodBefore, need);
    return {
      need, totalNeed, remainingNeed: Math.max(0, totalNeed - need),
      consumed, shortage: Math.max(0, need - consumed), foodBefore,
      foodAfter: foodBefore - consumed,
      emptied: foodBefore > 0 && foodBefore - consumed === 0,
      kitchen
    };
  },

  // 飢餓の連鎖を、単調な忠誠低下から「飢餓適応」への到達点に変える。
  // 3戦を耐えた者はもう食わない。生活部門を捨てる逆方向のビルドが、ここで初めて成立する。
  HUNGER_ADAPT_TURNS: 3,

  advanceHunger(shortage, notes) {
    const st = this.state;
    if (!shortage) { st.hungerStreak = 0; return []; }
    st.hungerStreak = (st.hungerStreak || 0) + 1;
    if (st.hungerStreak < this.HUNGER_ADAPT_TURNS) {
      const left = this.HUNGER_ADAPT_TURNS - st.hungerStreak;
      if (notes) notes.push(`飢餓${st.hungerStreak}戦目。あと${left}戦を生き延びた者は、食わない体になる`);
      return [];
    }
    const adapted = [];
    for (const m of st.roster) {
      if (Aptitude.of(m).appetite === 0) continue;
      if (!Array.isArray(m.traits)) m.traits = [];
      m.traits.push("starved");
      // ただで手に入る出口にはしない。飢えた体は痩せる。
      // 食料問題は消えるが軍団は脆くなり、戦死と墓地の側へ寄っていく。
      m.hp = Math.max(1, Math.round(m.hp * 0.85));
      adapted.push(m.name);
    }
    st.hungerStreak = 0;
    if (adapted.length && notes) {
      notes.push(`飢餓適応：${adapted.join("・")}は、もう食料を必要としない体になった（最大HP-15%）。`
        + `軍団は飢えを克服したのではなく、飢えの側へ寄っていった`);
    }
    return adapted;
  },

  // 備蓄には上限がある。上限が無いと余剰はただ積み上がり、
  // 「保険」として無限に強くなるので、食料を使う判断が永久に生まれない。
  // 上限は軍団の消費に比例するので、大軍団が一方的に損をすることはない。
  foodCapacity() {
    return Math.max(8, this.foodNeed() * 4);
  },

  // 腐敗は罰ではなく合図。「そろそろ宴だ」と気づかせるためにログへ出す。
  spoilFood(notes) {
    const cap = this.foodCapacity();
    const over = Math.max(0, (this.state.food || 0) - cap);
    if (over > 0) {
      this.state.food = cap;
      if (notes) notes.push(`備蓄庫の上限 ${cap} を超えた食料 ${over} が傷んだ。腐らせる前に宴を開くべきだった`);
    }
    return over;
  },

  // 宴：余った食料の使い道。余剰は今まで死に資源で、黒字にする理由がなかった。
  // 効くのは「食う者」だけなので、アンデッド軍団では宴そのものが成立しない。
  // 大食漢は食う量が倍になる代わりに効果も倍。負債だったオーガが資産に変わる。
  feastQuote() {
    const st = this.state;
    const active = this.activeRoster();
    const eaters = st.roster.filter(m => Aptitude.of(m).appetite > 0);
    const activeEaters = active.filter(m => Aptitude.of(m).appetite > 0);
    const bigEaters = active.filter(m => (m.traits || []).includes("big_eater")).length;
    const cook = active.some(m => (m.traits || []).includes("demon_cook"));
    const base = Math.max(1, this.foodNeed());
    // 大食漢がいれば倍食う。料理人がいれば同じ量で足りる。
    let cost = base * (bigEaters > 0 ? 2 : 1);
    if (cook) cost = Math.max(1, Math.ceil(cost / 2));
    const stock = Math.max(0, st.food || 0);
    const dmgBonus = bigEaters > 0 ? .30 : .15;
    const loyaltyGain = bigEaters > 0 ? 10 : 6;
    return {
      cost, stock, dmgBonus, loyaltyGain,
      bigEaters, cook,
      eaters: eaters.length,
      activeEaters: activeEaters.length,
      held: !!st.feastPending,
      // 宴は「余剰の使い道」であって、備蓄を削る博打にはしない。
      // 宴のあとに2戦ぶんの糧食が残らないなら開けない。連打しても飢えないようにする。
      affordable: stock >= cost + base * 2,
      possible: eaters.length > 0
    };
  },

  holdFeast() {
    const st = this.state;
    const q = this.feastQuote();
    if (st.feastPending || !q.possible || !q.affordable) return null;
    st.food = Math.max(0, st.food - q.cost);
    let fed = 0;
    for (const m of st.roster) {
      if (Aptitude.of(m).appetite === 0) continue;
      m.loyalty = U.clamp(m.loyalty + q.loyaltyGain, 0, 100);
      fed++;
    }
    st.feastPending = { dmgBonus: q.dmgBonus, cost: q.cost, fed, bigEaters: q.bigEaters };
    return st.feastPending;
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

  // 施設Lv.は大型Jokerが1戦闘に働ける回数として効く。稼働施設が無ければ0。
  facilityWorks() {
    const st = this.state;
    if (!st.activeFacilityId) return 0;
    const info = this.facilityInfo();
    return Math.max(0, Number(info.works) || 0);
  },

  activeFacility() {
    return FACILITIES.find(f => f.id === this.state.activeFacilityId) || null;
  },

  // 選んだ施設が「この出撃で実際に働けるか」。
  // deploy() が Battle へ渡す条件と同じ判定をここへ置き、編成画面の見取り図が
  // 同じ答えを読む。二重に書くと、片方だけ直したときに画面だけ嘘をつく。
  facilityReady(facilityId) {
    const id = facilityId || this.state.activeFacilityId;
    if (!id) return false;
    if (id === "extortion_ledger") return this.activeRoster().some(m => (m.job || "").includes("会計"));
    if (id === "graveyard") return this.departmentRoster("home").some(m => m.tplId === "necromancer");
    if (id === "grand_kitchen") return true;
    return false;
  },

  // 拠点接収：建設部門に誰も置かないと施設は「存在しない」ままだった。
  // 勝利した拠点をそのまま接収することで、施工役なしでも1ランに一度だけ最初の施設へ届く。
  // ただし奪った拠点は目立つ（警戒度+3＝以後の敵が約6%強くなる）。
  // Lv.2以降は従来どおり建設部門の仕事であり、この入口は「最初のJokerを試す」ためだけにある。
  SEIZE_ALERT_COST: 1,

  seizeQuote() {
    const st = this.state;
    const target = FACILITY_LEVELS[1];
    const need = Math.max(0, target.buildThreshold - (st.buildProgress || 0));
    return {
      need,
      have: st.materials || 0,
      alertCost: this.SEIZE_ALERT_COST,
      affordable: (st.materials || 0) >= need
    };
  },

  // 表示・sim・実プレイで同じ条件を使う。結果画面でのみ、施設ゼロのときだけ提示する。
  canSeizeStronghold() {
    const st = this.state;
    if (!st || st.phase !== "result") return false;
    if (st.seizeUsed) return false;
    if ((st.facilityLevel || 0) >= 1 || st.pendingFacilityChoiceLevel) return false;
    if (!st.lastBattle || !st.lastBattle.victory) return false;
    return this.seizeQuote().affordable;
  },

  seizeStronghold() {
    if (!this.canSeizeStronghold()) return false;
    const st = this.state;
    const quote = this.seizeQuote();
    st.materials -= quote.need;
    st.buildProgress += quote.need;
    st.facilityLevel = 1;
    st.pendingFacilityChoiceLevel = 1;
    st.seizeUsed = true;
    st.alert = Math.max(0, st.alert + this.SEIZE_ALERT_COST);
    if (st.lastBattle && Array.isArray(st.lastBattle.notes)) {
      st.lastBattle.notes.push(`拠点接収：建材 ${quote.need} を投じて敵拠点を接収した`
        + `（施設Lv.1／王国警戒度+${this.SEIZE_ALERT_COST} 現在 ${st.alert}）`);
    }
    this.save();
    return true;
  },

  chooseFacility(id) {
    const st = this.state;
    if (st.phase !== "facility" || !st.pendingFacilityChoiceLevel) return false;
    if (!FACILITIES.some(f => f.id === id)) return false;
    st.activeFacilityId = id;
    st.pendingFacilityChoiceLevel = null;
    if (this.maybeEvent()) return true;
    this.nextRecruit();
    return true;
  },

  // シナジーの発火条件を数える母集団。出撃隊ではなく軍団全体を渡す。
  // 部門へ回した者も条件に参加できるので、「戦力か経営か」の二択が
  // 「どちらでも同じ札が効く」に変わり、同時発動が起きる。
  synergyPool() {
    return this.state.roster.map(m => ({
      ...m,
      alive: true,
      traits: (m.traits || []).slice(),
      tags: (m.tags || []).slice(),
      mods: { dmgMult: 1, takenMult: 1 }
    }));
  },

  // ── 食事強化の伝票（V2a・2026-09-06）────────────────
  // 「誰の料理が、誰を、どれだけ強くしたか」を1か所で決める。
  // preparedRoster()（本番の倍率）も、編成画面の予告も、戦闘入力へ渡す根拠も
  // **すべてこの関数の戻り値を読む**。二重に計算しないので、表示だけが古くなることが起きない。
  //
  // 対象は食欲（appetite）が最大の1体。同値なら **出撃順（activeUids）の先頭**が受ける。
  // sort は安定なので、この規則は並び順だけで決まり、再描画や予告で入れ替わらない。
  // 数値・発火条件は従来のまま。ここで変えているのは「根拠を持ち回るかどうか」だけである。
  mealPlan(rations) {
    const active = this.activeRoster();
    const feast = this.state.feastPending;
    const cook = active.find(m => (m.traits || []).includes("demon_cook")) || null;
    const hunger = active.find(m => (m.traits || []).includes("hunger_demon")) || null;
    const consumed = rations ? Math.max(0, Number(rations.consumed) || 0) : 0;
    const ranked = active.slice().sort((a, b) => Aptitude.of(b).appetite - Aptitude.of(a).appetite);
    const target = ranked[0] || null;
    const topAppetite = target ? Aptitude.of(target).appetite : 0;
    // 巨大厨房は Lv.+1 倍。Lv.1で従来どおりの2倍、Lv.3で4倍まで濃くなる。
    const kitchenMult = rations && rations.kitchen ? 1 + this.facilityWorks() : 1;
    const boost = cook && rations ? Math.min(0.8, consumed * 0.08 * kitchenMult) : 0;
    const bigEaterMult = 1 + 0.25 * kitchenMult;
    return {
      consumed,
      need: rations ? rations.need || 0 : 0,
      shortage: rations ? rations.shortage || 0 : 0,
      emptied: !!(rations && rations.emptied),
      kitchen: !!(rations && rations.kitchen),
      kitchenMult,
      // 起点（誰の仕事か）
      cookUid: cook ? cook.uid : null,
      cookName: cook ? cook.name : null,
      // 対象（誰が受けるか）と、その根拠
      targetUid: target && boost > 0 ? target.uid : null,
      targetName: target && boost > 0 ? target.name : null,
      targetAppetite: topAppetite,
      // 同じ食欲で並んだ者。先頭が受けるという規則を表示側が説明できるようにする
      tiedUids: active.filter(m => Aptitude.of(m).appetite === topAppetite).map(m => m.uid),
      // 効果量（文言から推測させない）
      boost, boostPercent: Math.round(boost * 100),
      // 対象の食欲が0＝「食べない者に料理が乗っている」状態。現行の挙動をそのまま報告する。
      // ここを変えると数値が動くので、可否の判断は V2b へ回す（V2aは根拠を渡すだけ）。
      targetEatsNothing: !!(boost > 0 && topAppetite === 0),
      bigEaterMult,
      bigEaters: consumed > 0
        ? active.filter(m => (m.traits || []).includes("big_eater"))
            .map(m => ({ uid: m.uid, name: m.name, mult: bigEaterMult }))
        : [],
      hungerUid: hunger && rations && rations.emptied ? hunger.uid : null,
      hungerName: hunger && rations && rations.emptied ? hunger.name : null,
      feast: feast ? { dmgBonus: feast.dmgBonus, fed: feast.fed } : null
    };
  },

  preparedRoster(rations, plan) {
    const active = this.activeRoster();
    const feast = this.state.feastPending;
    const meal = plan || this.mealPlan(rations);
    const hungering = active.some(m => (m.traits || []).includes("hunger_demon"));
    return active.map(m => {
      let dmgMult = 1, takenMult = 1;
      if (rations && rations.consumed > 0 && (m.traits || []).includes("big_eater")) dmgMult *= meal.bigEaterMult;
      if (meal.targetUid !== null && m.uid === meal.targetUid) dmgMult *= 1 + meal.boost;
      if (rations && rations.emptied && hungering) { dmgMult *= 2; takenMult *= 1.3; }
      // 宴を食えた者だけが強くなる。食事不要の軍団に宴の効果はない。
      if (feast && Aptitude.of(m).appetite > 0) dmgMult *= 1 + feast.dmgBonus;
      // 施設の一律HP・防御補正は撤去した（設計憲法 第9節）。施設Lv.は
      // 大型Jokerが働ける回数（facilityWorks）としてのみ効く。
      return { ...m, battleDmgMult: dmgMult, battleTakenMult: takenMult };
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
    // ターン側の係数は data に置く（MONSTER_RULES.levelPerTurn）。0.75 のままだと
    // ターン10で最終段階に達し、敵を連動させたときに征服2で聖騎士団が来る。
    const perTurn = (typeof MONSTER_RULES !== "undefined" && MONSTER_RULES.levelPerTurn) || 0.5;
    return U.clamp(Math.max(st.conquest + 1, Math.ceil(st.turn * perTurn)), 1, ENEMY_STAGES.length);
  },

  // 魔王軍レベル。campaignLevel() の別名で、中身は同じ一つの値。
  // 新しいパラメータは作らない（応募者・敵・HUD が全部これを読む）。
  armyLevel() {
    return this.campaignLevel();
  },

  // 軍団の文化。撤退と戦死の比から導く**表示専用**の札。
  // 数値・確率・抽選には一切効かせない（仕様4.5）。効かせ始めた瞬間に
  // 「文化を狙って作る」最適化ゲームになり、痕跡が記録ではなくパラメータになる。
  armyCulture() {
    const st = this.state;
    const retreats = st.retreatCount || 0;
    const fallen = st.fallenTotal || 0;
    if (retreats >= 2 && retreats >= fallen * 2) return "生きて帰るのが武勲";
    if (fallen >= 2 && fallen >= retreats * 2) return "仲間を置いて逃げない";
    return null;
  },

  // ── 作戦会議 ────────────────────────────
  prepareMissions(force) {
    const st = this.state;
    // 王国の反撃が予約されていれば、次の作戦会議は「城を守る」一択。
    // **作り直しの判断は「今出ている札が今の状況と合っているか」で行う。**
    // 長さだけで判断していたので、予約が立った直後に3択のまま残ることがあった。
    const pending = !!(st.counterattack && st.counterattack.pending);
    const offers = st.missionOffers;
    const stale = !Array.isArray(offers) || !offers.length
      || (pending ? offers.some(m => m.missionKind !== "defend") || offers.length !== 1
        : offers.length !== MISSION_TYPES.length || offers.some(m => m.missionKind === "defend"));
    if (!force && !stale) {
      st.phase = "mission";
      return offers;
    }
    const previous = new Map((offers || []).map(m => [m.missionKind, m.formationId]));
    st.selectedMission = null;
    st.missionOffers = pending
      ? [this.buildMission(MISSION_TYPES.defend, previous.get("defend"))]
      : MISSION_TYPES.map(type => this.buildMission(type, previous.get(type.id)));
    st.phase = "mission";
    this.save();
    return st.missionOffers;
  },

  buildMission(type, previousFormationId) {
    const st = this.state;
    // 敵も魔王軍レベルに連動する（仕様2.3）。征服段階だけで引いていた頃は、
    // 略奪を繰り返せば応募者だけ強くして敵を据え置きにできた。
    // 征服段階は「どこまで攻め落としたか（クリア判定）」の意味だけ残す。
    let baseIndex = U.clamp(this.armyLevel() - 1 + type.enemyTierOffset, 0, ENEMY_STAGES.length - 1);
    // 防衛戦（王国の反撃）。討伐隊は段階7（聖騎士団）まで。勇者は段階8で固定。
    const counter = type.id === "defend" ? (st.counterattack || {}) : null;
    if (counter) {
      baseIndex = counter.kind === "hero"
        ? ENEMY_STAGES.length - 1
        : Math.min(baseIndex, ENEMY_STAGES.length - 2);
    }
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
    // 討伐隊の名は段階表から作る（固有の敵を足すときは段階表に行を足すだけで済む）。
    const defenseArmy = counter
      ? (counter.kind === "hero" ? base.army : `${base.army}討伐隊`)
      : null;
    return {
      stage: st.turn,
      missionKind: type.id,
      missionTitle: type.title,
      strategyLabel: type.strategyLabel,
      strategyHint: type.strategyHint,
      description: U.pick(type.descriptions),
      difficulty: type.difficulty,
      army: defenseArmy || (isInvade ? base.army : type.armies[variant]),
      region: counter ? "魔王城" : (isInvade ? base.region : type.regions[variant]),
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

  // ── 前代の教訓（ロードマップ⑦：失敗を方向転換の材料に） ─────────
  // 敗北がただの損失で終わっていた。魔界史に名前は残るが、次のランは毎回まっさらで、
  // 「負けたから次はこうする」がゲームの側に一切繋がっていなかった。
  //
  // 効果は意図的に「攻撃力+1%」型にしない（設計憲法 第9節）。教訓が変えるのは強さではなく
  // **応募プールの偏り＝次に引ける手札**である。何を学んだことにするかはプレイヤーが選ぶ。
  // それが「方向転換の材料」であって、押しつけの補正はただのバフになる。
  LESSONS: [
    { id: "mason", name: "石工の記憶", icon: "🧱",
      when: "城をひとつも建てられずに滅びた",
      effect: "建設に向く者が応募に来やすくなる",
      test: r => (r.facilityLevel || 0) === 0,
      favor: ["orc", "ogre"] },
    { id: "mourning", name: "弔いの記憶", icon: "🕯",
      when: "あまりに多くの戦死者を出した",
      effect: "死を扱う者が応募に来やすくなる",
      test: r => (r.fallenTotal || 0) >= 5,
      favor: ["necromancer", "skeleton", "zombie"] },
    { id: "unpaid", name: "未払いの記憶", icon: "💸",
      when: "給与と不祥事で軍が荒れた",
      effect: "未払いでこそ荒ぶる者が応募に来やすくなる",
      test: r => ((r.payrollChoices || {}).withhold || 0) >= 3 || (r.battleIncidentTotal || 0) >= 10,
      favor: ["orc", "goblin"] },
    { id: "rations", name: "兵糧の記憶", icon: "🍖",
      when: "食料が尽きたまま最期を迎えた",
      effect: "食を支える者が応募に来やすくなる",
      test: r => ((r.finalResources || {}).food || 0) === 0,
      favor: ["kobold", "slime"] },
    { id: "arcane", name: "未完の記憶", icon: "🔮",
      when: "連鎖がほとんど起きなかった",
      effect: "術を扱う者が応募に来やすくなる",
      test: r => (r.maxChain || 0) <= 2,
      favor: ["mage", "imp", "necromancer"] },
    { id: "rout", name: "敗走の記憶", icon: "🏳",
      when: "何も試せないまま早々に敗走した",
      effect: "毎回の面接に応募者がもう1名増える",
      test: r => (r.battlesWon || 0) <= 3,
      favor: [], extraApplicant: true }
  ],

  lessonById(id) { return this.LESSONS.find(l => l.id === id) || null; },

  // 前代の記録に当てはまる教訓を先に、足りなければ残りで埋めて必ず3つ返す。
  // 「当てはまったものだけ」にすると、綺麗に負けたランで選択肢が消えてしまう。
  lessonOffers(record) {
    const r = record || {};
    const matched = this.LESSONS.filter(l => { try { return l.test(r); } catch (e) { return false; } });
    const rest = this.LESSONS.filter(l => !matched.includes(l));
    return matched.concat(rest).slice(0, 3);
  },

  // 敗北確定画面で選ぶ。次に newRun したときに一度だけ効く。
  chooseLesson(id) {
    if (!this.lessonById(id)) return false;
    Storage.saveLesson(id);
    if (this.state) this.state.chosenLessonId = id;
    return true;
  },

  activeLesson() { return this.state ? this.lessonById(this.state.lessonId) : null; },

  // ── 応募者生成 ────────────────────────────
  // 応募者は基本3名。非戦闘部門に人事適性を持つ者が居ると、その人数だけ増える（上限6名）。
  // 「人事担当（死者）を生活部門に置いたら応募が増えた」という発見を作るための接続。
  applicantCount() {
    const lesson = this.activeLesson();
    const bonus = lesson && lesson.extraApplicant ? 1 : 0;
    // 討伐隊を退けた直後だけ、噂を聞いて1人多く来る。読んだら消える（1回きり）。
    const renown = this.state.renownBonus ? 1 : 0;
    if (renown) this.state.renownBonus = 0;
    return U.clamp(3 + this.departmentOutput().recruit + bonus + renown, 3, 8);
  },

  genApplicants() {
    const st = this.state;
    st.applicants = [];
    const n = this.applicantCount();
    for (let i = 0; i < n; i++) st.applicants.push(this.rollApplicant());
    let legacySlot = -1;
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
      legacySlot = slot;
    }
    this.addBondApplicant(legacySlot);
  },

  // 離脱が起きた次の面接に、故人と縁のある者が1人混ざる。
  // **legacyReturn（魔界史の帰還者）とは別の枠。** 同じ枠に入れると片方が消える。
  // 能力は魔王軍レベルどおりで、強くはしない。継いだ者は同じ人物にならない。
  addBondApplicant(excludeSlot) {
    const st = this.state;
    const bond = st.pendingBond;
    if (!bond || !st.applicants.length) return null;
    const slots = st.applicants.map((_, i) => i).filter(i => i !== excludeSlot);
    if (!slots.length) return null;
    st.pendingBond = null;
    // 種族は故人と同じが 60%。残りは通常の抽選（縁でも血筋でもない者も来る）。
    const sameRace = U.chance(0.6);
    const applicant = this.rollApplicant(sameRace ? bond.tplId : undefined);
    const kind = bond.cause === "fallen" ? U.pick(["admirer", "kin", "avenger"])
      : bond.cause === "retired" ? "admirer" : "rumor";
    applicant.bond = { name: bond.name, cause: bond.cause, kind, army: bond.army || null };
    const pool = (typeof BOND_MOTIVES !== "undefined" && BOND_MOTIVES[kind]) || null;
    if (pool && pool.length) {
      applicant.motive = U.pick(pool)
        .replace(/\{name\}/g, bond.name)
        .replace(/\{army\}/g, bond.army || "あの軍");
    }
    // 故人の遺物が蔵にあれば、半分の確率で「持って来る」。どこで拾ったのやら。
    const relic = bond.relicId ? this.relicOf(bond.relicId) : null;
    if (relic && relic.holderUid === null && U.chance(0.5)) applicant.relicId = relic.id;
    st.applicants[U.pick(slots)] = applicant;
    return applicant;
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
    // 教訓は出現率を3倍に寄せるだけ。確定ではないので「来なかった」も起こる。
    const favored = new Set((this.activeLesson() || {}).favor || []);
    // 指名求人：条件に合う者へ重みを寄せる。確定ではないので「出したのに来ない」も起きる。
    const brief = this.activeBrief();
    const weights = MONSTER_TEMPLATES.map(t => {
      let w;
      // 低ティアはレベル5以上で来ること自体が珍しくなる（2 → 1）。
      // 珍しくするのは「来たときに歴戦の顔をしている」ための下ごしらえ。
      if (t.tier === 1) w = level <= 3 ? 6 : (level <= 4 ? 2 : 1);
      else if (t.tier === 2) w = level <= 2 ? 2 : 5;
      else w = level <= 2 ? 0.5 : (level <= 4 ? 2 : 5);
      if (favored.has(t.id)) w *= 3;
      if (brief) {
        // 金を払って条件を出した以上は寄る。ただし外れも残す。
        let hit = false;
        try { hit = !!brief.match(t); } catch (e) { hit = false; }
        w = hit ? w * this.BRIEF_WEIGHT : w * 0.35;
        // 指名求人は「強い奴を寄越せ」でもある。高ティアの目をさらに上げる。
        if (hit && t.tier >= 2) w *= 1.5;
      }
      return w;
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
    // 進行補正：後から来る応募者ほど強い。伸び率は data（MONSTER_RULES.applicantGrowth）。
    // 敵は段階1→4でHP約2.7倍になるのに応募者は1.36倍しか伸びず、
    // 中盤に来た新人がそのまま使えなかった（オーナー指摘）。
    const growth = (typeof MONSTER_RULES !== "undefined" && MONSTER_RULES.applicantGrowth) || 0.22;
    // 叩き上げ：終盤に来た低ティアは、伸び率が1.5倍。
    // 平均ごと持ち上げる（k を上げる）とゲームが易しくなるだけで、低ティアは相対的に弱いまま
    // だった（前回の計測。Lv8のコボルトが敵1体の57%）。**格差のつまみは k とは別に置く。**
    // 数値の理屈ではなく「ここまで生き延びた奴だけが今さら来る」という理由付きの伸び。
    const veteranMult = (typeof MONSTER_RULES !== "undefined" && MONSTER_RULES.lowTierVeteranMult) || 1.7;
    const veteran = tpl.tier === 1 && level >= this.VETERAN_LEVEL;
    const scale = 1 + growth * (level - 1) * (veteran ? veteranMult : 1);
    const vary = v => Math.max(1, Math.round(v * scale * (0.85 + U.rand() * 0.3)));
    const job = U.pick(tpl.jobs);
    const traits = (tpl.fixedTraits || [tpl.fixedTrait]).filter(Boolean).slice();
    if (tpl.traitPool.length > 0 && U.chance(0.5)) {
      const extra = U.pick(tpl.traitPool);
      if (!traits.includes(extra)) traits.push(extra);
    }
    if (job.includes("料理人") && !traits.includes("demon_cook")) traits.push("demon_cook");
    // 癖（改造癖など）は戦闘特性の枠とは別に独立で付ける。traitPool に混ぜると戦闘特性を薄めて軍が弱くなる
    // （sim で15戦略中14が下がった）。
    const quirk = TRAITS.tinkerer && TRAITS.tinkerer.quirk;
    if (quirk && quirk.species.includes(tpl.id) && U.chance(quirk.chance) && !traits.includes("tinkerer")) traits.push("tinkerer");
    return {
      uid: st.uidSeq++,
      tplId: tpl.id,
      // 叩き上げの印（表示用）。札の「🎖 歴戦」とモルモの一言だけが読む。
      // 縁の者になった場合は志望理由を bond 側が上書きする（縁のほうが具体的な理由なので）。
      veteran,
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
      // 叩き上げには専用の志望理由。「なぜ今さらこの種族が来るのか」の理由を持たせる。
      motive: veteran && typeof VETERAN_MOTIVES !== "undefined" && VETERAN_MOTIVES.length
        ? U.pick(VETERAN_MOTIVES) : U.pick(tpl.motives),
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
    this.kpi("mercenaryHired", merc, cost, this.mercenaryKinCount(merc.race) > 0);
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
    if (st.kingSlimeMerge !== false && on === false) this.kpi("mergeRefused");
    st.kingSlimeMerge = !!on;
    this.kpi("formationChanged");
    this.save();
    return true;
  },

  // 戦闘へ出す形にする。給与も戦功も持たない。
  // 施設の一律補正は撤去したので、自軍と同じく素の値で出る。
  preparedMercenaries() {
    return (this.state.mercenaries || []).map(m => ({
      ...m, battleDmgMult: 1, battleTakenMult: 1
    }));
  },


  // ── 指名求人 ────────────────────────────
  // 「こういう奴を寄越せ」と条件を指定して出す有料の求人。
  // 中盤から解禁するのは、序盤に狙い撃ちできると「まず何が出るか見る」段階が消えるため。
  // 条件はシナジーの発火条件と同じ語彙なので、これが爆発を自分で狙う手段になる。
  BRIEF_UNLOCK_LEVEL: 3,
  BRIEF_BASE_COST: 6,
  BRIEF_WEIGHT: 6,

  briefUnlocked() {
    return this.campaignLevel() >= this.BRIEF_UNLOCK_LEVEL;
  },

  activeBrief() {
    const id = this.state && this.state.briefId;
    if (!id) return null;
    return RECRUIT_BRIEFS.find(b => b.id === id) || null;
  },

  // 指名は面接ごとに倍々。連打で理想の軍団を組み上げるのは経営judgementを消す。
  briefCost() {
    return this.BRIEF_BASE_COST * Math.pow(2, this.state.briefsThisPhase || 0);
  },

  canPostBrief(briefId) {
    const st = this.state;
    if (!st || st.phase !== "recruit" || !this.briefUnlocked()) return false;
    if (!RECRUIT_BRIEFS.some(b => b.id === briefId)) return false;
    return st.gold >= this.briefCost();
  },

  postBrief(briefId) {
    if (!this.canPostBrief(briefId)) return false;
    const st = this.state;
    st.gold -= this.briefCost();
    st.briefsThisPhase = (st.briefsThisPhase || 0) + 1;
    st.briefId = briefId;
    this.genApplicants();
    // 指名で入れ替えた応募者は、そのまま無料枠で採れる（求人費とは別の話にしない）
    this.save();
    return true;
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

  additionalHireCost() {
    return this.EXTRA_HIRE_BASE_COST * Math.pow(2, this.state.extraHiresThisPhase || 0);
  },

  hireCost() {
    return this.state.hiresLeft > 0 ? 0 : this.additionalHireCost();
  },

  canHireApplicant(index) {
    const st = this.state;
    return st.phase === "recruit" && !!st.applicants[index]
      && this.canHire() && st.gold >= this.hireCost();
  },

  hire(index) {
    const st = this.state;
    if (!this.canHireApplicant(index)) return false;
    const m = st.applicants[index];
    const cost = this.hireCost();
    if (cost > 0) {
      st.gold -= cost;
      st.extraHiresThisPhase += 1;
      this.kpi("paidHire", cost);
    } else {
      st.hiresLeft -= 1;
    }
    st.roster.push(m);
    this.memberRecord(m);
    this.baseOf(m);                  // 採用時の値を控える（昇進の boost を含まない基礎値）
    if (!m.skillTier) m.skillTier = 1;
    if (!Array.isArray(m.relicIds)) m.relicIds = [];
    // 縁の者が「持って来た」遺物は、採用した時点で本人の物になる（4.2）。
    // それ以外の受け渡しは編成画面の蔵で魔王が決裁する（自動では渡さない）。
    if (m.relicId) { const relicId = m.relicId; delete m.relicId; this.giveRelic(relicId, m.uid); }
    st.maxArmySize = Math.max(st.maxArmySize || 0, st.roster.length);
    if (st.activeUids.length < this.MAX_DEPLOY) st.activeUids.push(m.uid);
    st.raceCounts[m.race] = (st.raceCounts[m.race] || 0) + 1;
    if (m.tplId && !st.recruitedTplIds.includes(m.tplId)) st.recruitedTplIds.push(m.tplId);
    // 採用後も面接は閉じない。次の候補を見て、追加紹介料を払うか自分で終了する。
    if (this.canHire()) {
      st.rerollsThisPhase = 0;   // 新しい面接なので広告費もリセット
      st.briefsThisPhase = 0;
      st.briefId = null;
      this.genApplicants();
    } else {
      st.applicants = [];
    }
    this.save();
    return true;
  },

  skipHire() {
    this.finishRecruitment();
  },

  // ── 離脱と継承 ─────────────────────────────
  // 人は消えるが、その人が軍団に残したものは消えない。
  // **永久離脱の4種（戦死・解雇・逃亡・引退）は全部この関数を通す。**
  // 4か所に書くと、片方だけ遺物を残さない・片方だけ履歴に載らない、が静かに起きる。
  // 傭兵と召喚物は軍団員ではないので対象外（呼ぶ側が弾く）。
  recordDeparture(monster, cause, extra = {}) {
    const st = this.state;
    if (!monster || monster.mercenary) return null;
    const record = this.memberRecord(monster);
    const entry = {
      uid: monster.uid, name: monster.name, race: monster.race, tplId: monster.tplId,
      job: monster.job, traits: (monster.traits || []).slice(),
      rankId: monster.rankId || (this.rankOf(monster) || {}).id || "soldier",
      merit: monster.merit || 0,
      cause,
      day: st.day, turn: st.turn,
      army: extra.army || null,          // 戦死・引退のときの相手。解雇・逃亡は null
      record: { ...record },
      relicId: null
    };
    // 持っていた遺物は蔵へ戻る（特性も外れる）。持ち主ごと消えても品は残る。
    for (const relicId of (monster.relicIds || []).slice()) this.storeRelic(relicId);
    const relic = this.mintRelic(monster, entry);
    if (relic) entry.relicId = relic.id;
    st.departed = st.departed || [];
    st.departed.push(entry);
    // 縁の応募者は「離脱が起きた次の面接」に混ざる。ここで予約する。
    st.pendingBond = { name: entry.name, race: entry.race, tplId: entry.tplId,
      cause, army: entry.army, relicId: entry.relicId };
    return entry;
  },

  // 目立った者だけが遺物を残す。無名のまま消えた者は履歴だけ。
  // 「クビにした奴の斧が倉庫に残っている」も物語なので、解雇・逃亡でも残す。
  // ランの戦闘数は 7〜13。6戦は「ランの半ばまで生きた者」には遅すぎて、
  // 序盤の離脱では蔵が一度も出ないままだった（オーナー試遊。未決U1の見直し）。
  NOTABLE_BATTLES: 4,

  // このレベル以上で来た低ティア（tier1）は「叩き上げ」。出現は珍しくなり、伸びは1.5倍。
  VETERAN_LEVEL: 5,

  // 全滅したときに上がる警戒度。負けの代償は「人」ではなく「時間と敵の圧力」で払わせる。
  WIPE_ALERT: 3,
  mintRelic(monster, entry) {
    const st = this.state;
    const rank = entry.rankId || "soldier";
    const notable = (entry.record.battles || 0) >= this.NOTABLE_BATTLES
      || rank !== "soldier" || (entry.record.carried || 0) >= 1;
    if (!notable) return null;
    // 種族固有の特性は「その人のもの」ではないので品に宿らない。
    const tpl = MONSTER_TEMPLATES.find(t => t.id === monster.tplId) || {};
    const fixed = new Set((tpl.fixedTraits || [tpl.fixedTrait]).filter(Boolean));
    const candidates = (entry.traits || []).filter(id => !fixed.has(id) && TRAITS[id]);
    if (!candidates.length) return null;         // 宿るものが無ければ品も残らない
    const traitId = U.pick(candidates);
    const noun = (TRAITS[traitId] && TRAITS[traitId].relic) || "兜";
    st.relics = st.relics || [];
    const relic = {
      id: `relic_${st.relicSeq = (st.relicSeq || 0) + 1}`,
      name: `${entry.name}の${noun}`,
      traitId,
      from: { name: entry.name, race: entry.race, cause: entry.cause, army: entry.army, turn: entry.turn },
      holderUid: null
    };
    st.relics.push(relic);
    return relic;
  },

  relicOf(relicId) {
    return (this.state.relics || []).find(r => r.id === relicId) || null;
  },

  // 遺物を誰かに渡す。癖が一つ移るだけで、数値は動かない。
  // 既に同じ特性を持っていれば何も起きない（それも「らしい」）。
  giveRelic(relicId, uid) {
    const st = this.state;
    const relic = this.relicOf(relicId);
    const monster = st.roster.find(m => m.uid === uid);
    if (!relic || !monster) return false;
    if (relic.holderUid === uid) return true;
    if (relic.holderUid !== null) this.storeRelic(relicId);
    relic.holderUid = uid;
    monster.relicIds = monster.relicIds || [];
    if (!monster.relicIds.includes(relicId)) monster.relicIds.push(relicId);
    monster.traits = monster.traits || [];
    // 実際にこの品が特性を足したのかを品が覚える。元から持っていた者から
    // 取り上げてしまわないため（「杯を返したら酒好きが治った」は起きない）。
    relic.granted = !monster.traits.includes(relic.traitId);
    if (relic.granted) monster.traits.push(relic.traitId);
    this.save();
    return true;
  },

  // 蔵へ戻す。品が宿らせていた特性は外れる。
  // ただし**元から持っていた特性は外さない**（他の遺物や種族固有と重なる場合）。
  storeRelic(relicId) {
    const st = this.state;
    const relic = this.relicOf(relicId);
    if (!relic) return false;
    const holder = st.roster.find(m => m.uid === relic.holderUid);
    relic.holderUid = null;
    if (holder) {
      holder.relicIds = (holder.relicIds || []).filter(id => id !== relicId);
      // 同じ特性を宿した別の品をまだ持っているなら外さない
      const stillGranted = (holder.relicIds || []).some(id => {
        const other = this.relicOf(id);
        return other && other.granted && other.traitId === relic.traitId;
      });
      if (relic.granted && !stillGranted) {
        holder.traits = (holder.traits || []).filter(id => id !== relic.traitId);
      }
    }
    relic.granted = false;
    this.save();
    return true;
  },

  // ── 育成：種族技と小成長 ─────────────────────
  // 出撃を重ねた者だけが育つ（留守番では伸びない）。経験値は持たず、出撃数がそのまま経験。
  skillRules() {
    const rules = (typeof SKILL_RULES !== "undefined" && SKILL_RULES) || {};
    return {
      unlockBattles: rules.unlockBattles !== undefined ? rules.unlockBattles : 6,
      growthPerBattle: rules.growthPerBattle !== undefined ? rules.growthPerBattle : 0.025,
      growthCapBattles: rules.growthCapBattles !== undefined ? rules.growthCapBattles : 12
    };
  },

  // 採用時の値を控える。**昇進の boost は含めない**（含めると伸びが昇進に比例して膨らむ）。
  // 旧セーブは現在値を base にする（それまでの伸びは既に現在値に入っている扱い）。
  baseOf(monster) {
    if (!monster.base) {
      monster.base = { hp: monster.hp, atk: monster.atk, def: monster.def };
      // 旧セーブの分の伸びは「もう入っている」ことにする。ここで 0 にすると、
      // 次の決着で base からの伸びが丸ごと足されて古参が突然強くなる。
      monster.grown = { hp: 0, atk: 0, def: 0 };
    }
    if (!monster.grown) monster.grown = { hp: 0, atk: 0, def: 0 };
    return monster.base;
  },

  // 小成長。基礎値の 2.5%／戦、12戦で頭打ち（合計 +30%）。spd は伸びない。
  //
  // 仕様は「毎回 base から現在値を組み直す」だが、**差分だけを足す**形にした。
  // 城内事件は HP を恒久的に減らす（`events.js` の負傷）ので、組み直すとその傷が
  // 黙って治ってしまう。差分方式でも二重加算は起きない（積んだ量を `m.grown` が覚えている）。
  applyGrowth(monster) {
    if (!monster || monster.mercenary) return;
    const rules = this.skillRules();
    const base = this.baseOf(monster);
    const battles = this.memberRecord(monster).battles || 0;
    const steps = Math.min(battles, rules.growthCapBattles);
    for (const key of ["hp", "atk", "def"]) {
      const target = Math.round((base[key] || 0) * rules.growthPerBattle * steps);
      const delta = target - (monster.grown[key] || 0);
      if (!delta) continue;
      monster[key] = Math.max(key === "def" ? 0 : 1, (monster[key] || 0) + delta);
      monster.grown[key] = target;
    }
  },

  // その者が次に覚える上位技。既に覚えている／技の無い種族なら null。
  // 面接の札（「6戦で【…】」）も同じ関数を読む。**二か所で探さない。**
  nextSkillFor(monster) {
    if (!monster || monster.mercenary) return null;
    const traits = monster.traits || [];
    for (const id of traits) {
      const skill = (TRAITS[id] || {}).skill;
      if (skill && skill.tier === 2) return null;      // もう覚えている
    }
    // **種族で絞る。** 1段目は種族をまたいで共有されている
    // （怪力＝オーガとオーク、粘体＝スライムとキングスライム）ので、
    // `replaces` だけで引くとオークが「ぶちかまし」を覚える。
    for (const id of traits) {
      const candidates = Object.keys(TRAITS).filter(key => {
        const skill = TRAITS[key].skill;
        return skill && skill.tier === 2 && skill.replaces === id;
      });
      if (!candidates.length) continue;
      const mine = candidates.find(key => TRAITS[key].skill.species === monster.tplId);
      if (mine) return { id: mine, ...TRAITS[mine] };
      // 種族が一致しない（テンプレートに無い1段目を遺物などで持っている）なら覚えない。
      // 他種族の技を拾わせない。
    }
    return null;
  },

  // 上位技の解放。1段目（種族固有特性）が上位技に**置き換わる**。
  // 遺物由来の特性・癖・共通特性はそのまま（replaces が指す id だけが消える）。
  // 傭兵は育たない（金で雇った一時要員に軍団の経験は乗らない）。
  checkSkillUnlock(monster, notes) {
    if (!monster || monster.mercenary) return null;
    const rules = this.skillRules();
    if ((this.memberRecord(monster).battles || 0) < rules.unlockBattles) return null;
    const skill = this.nextSkillFor(monster);
    if (!skill) return null;
    const replaced = skill.skill.replaces;
    monster.traits = (monster.traits || []).filter(id => id !== replaced);
    monster.traits.push(skill.id);
    monster.skillTier = 2;
    const quote = U.pick((skill.lines && skill.lines.unlock) || ["……体が、覚えた"]);
    if (notes) notes.push(`${monster.name}が【${skill.name}】を覚えた`);
    return { uid: monster.uid, name: monster.name, skillId: skill.id, skillName: skill.name, quote };
  },

  // 一戦の決着ごとに、出撃した者を育てる。
  // **settleContinue と settleRetreat の両方から呼ぶ。** deploy() の途中に書くと
  // 引数なし呼び出し（sim・テスト）と UI 経由（offerRetreat）で結果がずれる。
  // 数えるのは contribution の uid（出撃した者だけ。留守番は育たない）。
  trainSurvivors(contribution, notes) {
    const st = this.state;
    const unlocked = [];
    for (const row of contribution || []) {
      if (row.mercenary) continue;
      if (row.survived === false) continue;      // この戦いで戦死した者は育たない
      const monster = st.roster.find(m => m.uid === row.uid);
      if (!monster) continue;
      const gained = this.checkSkillUnlock(monster, notes);
      if (gained) unlocked.push(gained);
      this.applyGrowth(monster);
    }
    return unlocked;
  },

  // 個人カウンタ。痕跡の器（src/core/traces.js、別仕様）が入るまでのつなぎ。
  // 旧セーブには無いので、読むときに必ずここを通して補う。
  memberRecord(monster) {
    if (!monster) return { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 };
    if (!monster.record) monster.record = { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 };
    for (const key of ["battles", "wins", "downed", "carried", "late", "ate"]) {
      if (typeof monster.record[key] !== "number") monster.record[key] = 0;
    }
    return monster.record;
  },

  // 一戦の決着ごとに、出撃した者のカウンタを進める。
  // **settleContinue と settleRetreat の両方から呼ぶ。** deploy() の途中に書くと
  // 引数なし呼び出し（sim・テスト）と UI 経由（offerRetreat）で結果がずれる。
  // retreated のときは contribution が提案時点のもの（担がれた者に injured）。
  tallyBattleRecords(contribution, won) {
    const st = this.state;
    for (const row of contribution || []) {
      if (row.mercenary) continue;
      const monster = st.roster.find(m => m.uid === row.uid);
      if (!monster) continue;              // 既に戦死で名簿から消えた者は数えない
      const record = this.memberRecord(monster);
      record.battles += 1;
      if (won) record.wins += 1;
      if (row.survived === false || row.injured) record.downed += 1;
      if (row.injured) record.carried += 1;
      if (row.late > 0) record.late += 1;
    }
  },

  fire(uid) {
    const st = this.state;
    const monster = st.roster.find(m => m.uid === uid);
    if (monster) this.recordDeparture(monster, "fired");
    st.roster = st.roster.filter(m => m.uid !== uid);
    st.activeUids = st.activeUids.filter(id => id !== uid);
    this.save();
  },

  // 出撃隊と留守番の往復。外せば留守番、入れれば出撃隊（枠が無ければ失敗）。
  toggleDeploy(uid) {
    const st = this.state;
    const monster = st.roster.find(m => m.uid === uid);
    if (!monster) return false;
    const index = st.activeUids.indexOf(uid);
    if (index >= 0) {
      st.activeUids.splice(index, 1);
    } else {
      if (st.activeUids.length >= this.MAX_DEPLOY) return false;
      if (monster.injured > 0) return false;   // 負傷者は次の1戦だけ出撃できない
      st.activeUids.push(uid);
    }
    this.syncDepartments();
    this.save();
    this.kpi("formationChanged");
    return true;
  },

  assignDepartment(uid, departmentId) {
    const st = this.state;
    const monster = st.roster.find(m => m.uid === uid);
    departmentId = DEPARTMENT_ID(departmentId);
    if (!monster || !DEPARTMENTS[departmentId]) return false;
    if (departmentId === "combat") {
      if (!st.activeUids.includes(uid)) {
        if (st.activeUids.length >= this.MAX_DEPLOY) return false;
        if (monster.injured > 0) return false;   // 負傷者は次の1戦だけ出撃できない
        st.activeUids.push(uid);
      }
    } else {
      st.activeUids = st.activeUids.filter(id => id !== uid);
    }
    this.syncDepartments();
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

  moveDeployedToFront(uid) {
    const r = this.state.activeUids;
    const index = r.indexOf(uid);
    if (index <= 0) return false;
    r.splice(index, 1);
    r.unshift(uid);
    this.save();
    this.kpi("formationChanged");
    return true;
  },

  moveUnit(index, dir) {
    const r = this.state.roster;
    const j = index + dir;
    if (j < 0 || j >= r.length) return;
    [r[index], r[j]] = [r[j], r[index]];
    this.save();
  },

  // ── 出撃と戦闘処理 ────────────────────────
  // 引数なしの deploy() は今までどおり「シミュレーションして即決着」。
  // sim.js とテストはこの経路を通るので、既定の挙動は変えないこと。
  // options.offerRetreat を渡すのは UI だけ。撤退の提案が出た戦闘では決着を保留し、
  // settleBattle("continue" | "retreat") が呼ばれるまで所持金も名簿も動かさない。
  deploy(options = {}) {
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
    const feastUsed = st.feastPending;
    // 食事の伝票は倍率を掛ける前に一度だけ作り、戦闘入力・戦果・予告で同じものを読む（V2a）
    const mealPlan = battleRations ? this.mealPlan(battleRations) : null;
    const playerUnits = this.preparedRoster(battleRations, mealPlan).map(m => Battle.makeUnit(m, "player"));
    if (feastUsed) {
      notes.push(`宴の余韻：${feastUsed.fed}名が満腹のまま戦場へ出た（与ダメージ+${Math.round(feastUsed.dmgBonus * 100)}%）`);
      st.feastPending = null;
    }
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

    // 改造癖の者が留守番にいれば、糧食は樽で寝かされて発酵している。
    // ここでは印を付けるだけ。誰が酔って遅刻するかは battle.js が決める（本人は出撃していない）。
    const tinkerer = this.departmentRoster("home").find(m => (m.traits || []).includes("tinkerer")) || null;
    const fermentChance = (TRAITS.tinkerer && TRAITS.tinkerer.ferment && TRAITS.tinkerer.ferment.chance) || 0;
    const fermenter = tinkerer && U.chance(fermentChance) ? tinkerer : null;
    const rationContext = battleRations ? {
      ...battleRations,
      fermentedBy: fermenter ? fermenter.uid : null,
      fermentedByName: fermenter ? fermenter.name : null,
      cookUid: playerUnits.find(u => u.traits.includes("demon_cook"))?.uid || null,
      bigEaterUids: playerUnits.filter(u => u.traits.includes("big_eater")).map(u => u.uid),
      hungerUid: playerUnits.find(u => u.traits.includes("hunger_demon"))?.uid || null,
      feastUid: battleRations.consumed >= 4
        ? playerUnits.slice().sort((a, b) => a.spd - b.spd)[0]?.uid || null : null,
      // V2a: 食事強化の起点・対象・効果量。battle.js はまだ読んでいないが、
      // 追加フィールドは無視されるだけで発火順・回数・chainDepth を変えない。
      // 因果イベントとして出すのは V2b（battle.js 側）の仕事。
      meal: mealPlan,
      boostSourceUid: mealPlan ? mealPlan.cookUid : null,
      boostTargetUid: mealPlan ? mealPlan.targetUid : null,
      boostAmount: mealPlan ? mealPlan.boost : 0
    } : null;
    const extortionLedger = st.activeFacilityId === "extortion_ledger" && this.facilityReady("extortion_ledger");
    const graveyard = st.activeFacilityId === "graveyard" && this.facilityReady("graveyard");
    // 前回出撃との差分（R2）。戦闘へ入る前の確定値で撮る。
    // 戦闘の結果は一切見ないので、「変えたから勝った」の材料にはならない。
    const buildSnapshot = this.buildSnapshot(stageData);
    const buildChanges = this.buildChanges(st.lastBuildSnapshot, buildSnapshot);
    st.lastBuildSnapshot = buildSnapshot;
    const result = Battle.simulate(playerUnits, enemyUnits,
      { rations: rationContext, extortionLedger, graveyard, facilityWorks: this.facilityWorks(),
        synergyPool: this.synergyPool(), chainDefVersion: Chain.versionOf(st),
        // 未決U1の既定：開幕3日間の防衛戦では退けない（城を明け渡す意味になるので、
        // 防衛戦の撤退はLPの仕様と一緒に決める）。遠征では提案する。
        noRetreatOffer: openingBattle });
    // 合体は simulate() の前に処理するため、そのままでは通常のシナジー判定に
    // 残らない。タイムラインへ戻すことで、ログ・カットイン・結果表示を揃える。
    if (kingMerged) this.addMergeSynergy(result, kingSyn);
    this.recordDiscoveredSynergies(result);

    // 最大戦力を記録（魔界史用）
    st.maxPower = Math.max(st.maxPower, this.armyPower(this.activeRoster()));

    // ラン全体の主要記録は最大CHAINと最大OVERKILLの2つだけ（設計憲法 第11節）。
    // 勝敗を問わず更新する。再起で巻き戻したときはチェックポイントごと戻るのが正しい
    // （やり直した歴史の記録は残さない）ので、ここに別のテレメトリは持たない。
    const chainView = Chain.viewOf(result.timeline);
    const recordedChain = Chain.versionOf(st) >= 2
      ? chainView.maxDepth
      : ((result.chainSummary && result.chainSummary.maxChain) || 0);
    st.maxChain = Math.max(st.maxChain || 0, recordedChain);
    st.maxOverkill = Math.max(st.maxOverkill || 0, (result.overkillSummary && result.overkillSummary.maxPercent) || 0);
    // 「どの条件がどこへ繋がったか」の観測。KPI側で読むだけで、ラン状態には触らない
    // （したがって再起で巻き戻しても消えない＝試した事実として残る）。
    if (typeof KPI !== "undefined") KPI.battleFinished(result);

    const pending = {
      result, stageData, notes, battleRations, mealPlan, openingBattle, buildChanges, chainView,
      // spotlight は「今回変えた人」の戦闘中IDを要る。playerUnits ごと持ち回ると
      // セーブが太るので、必要な対応だけをここで解いておく。
      highlightIds: playerUnits
        .filter(u => (buildChanges && buildChanges.changedUids || []).includes(u.uid))
        .map(u => u.id).filter(Boolean)
    };
    // 退く道がある戦闘だけ、UI の求めに応じて決着を保留する。
    // 保留中はラン状態を一切変えない（所持金・名簿・警戒度は答えを聞いてから動く）。
    if (options.offerRetreat && result.retreatOffer) {
      st.pendingBattle = pending;
      st.phase = "battle";
      this.save();
      return { result, notes, stageData };
    }
    this.settleContinue(pending);
    return { result, notes, stageData };
  },

  // 撤退の提案に答える。UI だけが呼ぶ。戻り値は決着後のフェーズ名。
  settleBattle(choice) {
    const st = this.state;
    const pending = st.pendingBattle;
    if (!pending) return false;
    st.pendingBattle = null;
    if (choice === "retreat") this.settleRetreat(pending);
    else this.settleContinue(pending);
    return st.phase;
  },

  // 続けた場合の決着。**これが唯一の続行経路**（引数なし deploy() もここを通る）。
  // 二つ持つと「テストは通るのに UI からだけ結果が違う」が起きる。
  settleContinue(pending) {
    const st = this.state;
    const { result, stageData, notes, battleRations, mealPlan, openingBattle, buildChanges, chainView } = pending;
    const goldBefore = st.gold;
    const lootGold = Math.max(0, Number(result.resourceChanges && result.resourceChanges.gold) || 0);
    // 判定負け（30ラウンド経過。全滅ではない）は撤退と同じ結末にする。
    // 倒れていた者は担いで帰り、報酬は無い。**決着の経路は二つのまま**
    // （ここで委譲する。カウンタと育成を二度走らせないよう tally より前で分ける）。
    if (!result.victory && !this.wipeOf(result)) return this.settleRetreat(pending, { lostOnPoints: true });
    // 個人カウンタは名簿が動く前に進める（戦死で消えた者を数え損なわないため）。
    this.tallyBattleRecords(result.contribution, result.victory);
    // 育成はカウンタの直後。出撃した者だけが技を覚え、少し伸びる。
    const unlocked = this.trainSurvivors(result.contribution, notes);
    let wipedFallen = null, wipedRelics = null;
    // 防衛戦（王国の反撃）。勇者戦かどうかは段階で決まる。
    const isDefense = this.isDefenseBattle(stageData);
    const heroDefense = isDefense && (st.counterattack || {}).kind === "hero";
    let defenseOutcome = null, castleFell = false;
    if (result.victory) {
      st.gold += stageData.reward + lootGold;
      notes.push(`勝利報酬 ${stageData.reward}G を獲得（所持金 ${st.gold}G）`);
      if (lootGold > 0) notes.push(`戦闘中の略奪 ${lootGold}G を確定（所持金 ${st.gold}G）`);
      this.processCasualties(result.contribution, notes);
      this.awardMerit(result.contribution, notes);
      if (this.isDefenseBattle(stageData)) {
        // 城を守った。報酬は無いが、討伐隊の荷を押収する。
        const rules = this.counterRules();
        st.alert = Math.max(0, st.alert - rules.threshold);
        st.materials += rules.seize.materials;
        st.food += rules.seize.food;
        notes.push(`討伐隊を退けた。押収：建材 +${rules.seize.materials} / 食料 +${rules.seize.food}`);
        notes.push(`王国の警戒がひとまず引いた（現在 ${st.alert}）`);
        // 名が上がる。次の面接だけ応募者が1人増える。
        st.renownBonus = 1;
        st.defenses = st.defenses || { won: 0, lost: 0 };
        st.defenses.won += 1;
        defenseOutcome = { defended: true };
        if (heroDefense) st.heroCame = true;
        st.counterattack = null;
      } else {
        this.applyMissionOutcome(stageData, notes);
      }
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
      } else if (heroDefense) {
        // 魔王城で勇者を退けた。攻めた着地と同じ「クリア」だが、辿り方が違う。
        st.clearedBy = "defense";
        st.phase = "clear";
      } else if (st.conquest >= this.MAX_CONQUEST) {
        st.clearedBy = "conquest";
        st.phase = "clear";   // 記録の確定は deploy() の末尾でまとめて行う
      } else {
        st.phase = "result";
        this.genApplicants();
      }
    } else {
      // 出撃隊の全滅。**敗北であって終了ではない。**
      // 出撃した軍団員は全員戦死し、留守番と金で軍団を建て直す。
      // 戦死は processCasualties が recordDeparture を通すので、履歴・遺物・縁の者が
      // そのまま付いてくる（名簿から消すだけにすると、いちばん多い離脱の形で継承が発火しない）。
      const relicsBefore = (st.relics || []).length;
      this.processCasualties(result.contribution, notes);
      const relicsLeft = (st.relics || []).slice(relicsBefore).map(r => ({ name: r.name }));
      wipedFallen = (st.lastFallen || []).slice();
      wipedRelics = relicsLeft;
      // 倒れる前の働きは残る。戦功は戦死者にも付く（昇進はもう意味が無いが記録は残る）。
      this.awardMerit(result.contribution, notes);
      // 征服は進まない。だが王国は「魔王軍は崩れた」と見る。
      // 再建して殴り続ける遊び方に、反撃が先に来るようにする（設計判断 2026-09-10・案2＋4）。
      const alertDelta = this.WIPE_ALERT;
      st.alert = Math.max(0, st.alert + alertDelta);
      notes.push(`王国警戒度+${alertDelta}（現在 ${st.alert}）`);
      // 留守番の仕事と手当は続く。城は落ちていない。
      // 出撃隊は死んでいるので給与は発生しない（paySalaries は名簿を見るが、もう外れている）。
      if (!openingBattle) {
        this.processDepartments(stageData, notes, undefined, battleRations);
        this.paySalaries(notes);
        this.processDepartures(notes);
      }
      if (this.isDefenseBattle(stageData)) {
        defenseOutcome = { ransacked: this.ransack(notes) };
        const rules = this.counterRules();
        st.alert = Math.max(0, st.alert - Math.floor(rules.threshold / 2));
        st.defenses = st.defenses || { won: 0, lost: 0 };
        st.defenses.lost += 1;
        st.counterattack = null;
        if (heroDefense) { st.heroCame = true; castleFell = true; }
      }
      st.turn += 1;
      st.missionOffers = [];
      st.wipeCount = (st.wipeCount || 0) + 1;
      // 再起（時の巻き戻し）は「軍団が空で、雇う金も無い」ときの最後の手段だけに縮めた。
      // それ以外の全滅は通常の流れへ戻り、面接で建て直す。
      if (castleFell) {
        // 勇者に城を明け渡した。再建は無い。
        st.phase = "gameover";
        st.castleFell = true;
      } else if (this.canRebuild()) {
        st.phase = "result";
        this.genApplicants();
      } else {
        st.phase = "defeat";
      }
    }

    // ツケの取り立ては勝敗を問わない。負ければ踏み倒せるなら、
    // ツケは「判断」ではなく「わざと負ければ消える抜け道」になる。
    this.settleDebts(notes);

    st.lastBattle = {
      victory: result.victory,
      // 防衛戦（王国の反撃）の結末（表示用）。
      defense: isDefense,
      defended: !!(defenseOutcome && defenseOutcome.defended),
      ransacked: (defenseOutcome && defenseOutcome.ransacked) || null,
      // 出撃隊の全滅（表示用）。戻らなかった者と、蔵に残った品。
      wiped: !!wipedFallen,
      fallen: wipedFallen || [],
      relicsLeft: wipedRelics || [],
      // この戦いで技を覚えた者（表示用）。覚えた者がいない戦い・旧セーブには無い。
      unlocked,
      missionKind: stageData.missionKind,
      missionTitle: stageData.missionTitle,
      army: stageData.army,
      region: stageData.region,
      reward: result.victory ? stageData.reward : 0,
      lootGold: result.victory ? lootGold : 0,
      battleRations,
      // 食事強化の根拠。戦果・モルモ・魔界史が「誰の料理が誰を強化したか」を
      // 文言から推測せずに書けるようにする（V2a）。古い戦果には無いので表示側は省略する。
      mealPlan,
      goldBefore,
      synergies: result.activeSynergies,
      incidents: result.incidents || [],
      notes,
      logLength: result.log.length,
      contribution: this.attachVoices(result.contribution, result.victory),
      nearMiss: result.nearMiss,
      chainSummary: result.chainSummary,
      // V2の代表経路を、ロード後の戦果でも出せるように保存しておく（加算保存）。
      // 戦闘中はタイムラインから正規化できるが、lastBattle はタイムラインを持たないため、
      // これが無いとロードした戦果でV2経路を作り直せない。
      // **既存V1の chainSummary は壊さない。**新規V2ランはchainView、保存済みV1ランは
      // chainSummaryを表示側が選ぶ。
      // 旧セーブにこの鍵は無い。読む側は「無ければV1表示」で、推定生成してはいけない。
      chainView,
      overkillSummary: result.overkillSummary,
      // 戦意（momentum）の到達倍率。戦闘中は帯に出続けるが、終わると消えてしまい
      // 「今日はどれだけ乗ったのか」が戦果に残らなかった。タイムラインから導出するだけで、
      // 戦闘式・数値は変えていない。古いセーブには無いので表示側で 1 として扱う。
      momentumPeak: (result.timeline || []).reduce((max, e) =>
        e.type === "momentum" && Number.isFinite(e.mult) ? Math.max(max, e.mult) : max, 1),
      summonCount: result.summonCount || 0,
      // 施設は「誰の手柄か」を個人へ付けない代わりに、戦果へ短い要約として残す。
      // 共通補正（Lv）と稼働施設（Joker）を分けて書き、どちらを体感したか読めるようにする。
      facility: (() => {
        const info = this.facilityInfo();
        const active = this.activeFacility();
        return {
          level: st.facilityLevel || 0, name: info.name, works: this.facilityWorks(),
          hpMult: info.hpMult, defBonus: info.defBonus,
          activeId: active ? active.id : null, activeName: active ? active.name : null
        };
      })(),
      facilitySummary: result.facilitySummary || { facilities: [], rescuedFromWipe: false },
      deathChains: result.deathChains || [],
      // 戦果の1文の材料（B1）。「誰の能力が誰の何を動かし、結果どうなったか」を
      // 根拠イベントID付きで最大1件。証拠が揃わない戦闘では null になり、表示側は
      // その1文だけを省く。**日本語はここで作らない**（ui.js が組み立てる）。
      // 旧セーブにこの鍵は無い。無ければ出さないのが正しく、推定生成してはいけない。
      // 何を変えたかの記録（R2）。表示側は「変えたから勝った」と書かないこと。
      buildChanges,
      // 戦果の1文の材料（B1）。設計書6.1の優先順1番目「今回変えた人の確実な働き」を
      // 効かせるため、今回動かした人の**戦闘中ID**を渡す。対応表は simulate が id を
      // 埋めたあとの playerUnits から作る（battle.js のスナップショットは触らない）。
      spotlight: typeof Spotlight !== "undefined" ? Spotlight.of(result.timeline, {
        highlightIds: pending.highlightIds || []
      }) : null
    };
    this.rememberSpotlight(st.lastBattle.spotlight, stageData, result.victory);
    st.battleIncidentTotal = (st.battleIncidentTotal || 0) + (result.incidents || []).length;
    // 傭兵は契約終了。次の戦闘は新しい候補から選び直す
    if ((st.mercenaries || []).length) {
      notes.push(`傭兵${st.mercenaries.length}名との契約が終了した（${st.mercenaries.map(m => m.name).join("、")}）`);
    }
    st.mercenaries = [];
    st.mercenaryOffers = [];

    this.recoverInjuries();
    // 王国の反撃の判定は決着の最後。予告は必ず1手番前になる（奇襲はしない）。
    if (st.phase !== "clear" && st.phase !== "gameover") this.checkCounterattack();

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
    return st.phase;
  },

  // 退いた場合の決着。勝利でも敗北でもない第三の結末。
  // 倒れていた軍団員は担いで帰る（戦死しない）が、報酬は無く、征服も進まない。
  settleRetreat(pending, options = {}) {
    const st = this.state;
    const { result, stageData, notes, battleRations, mealPlan, chainView } = pending;
    const goldBefore = st.gold;
    const lostOnPoints = !!options.lostOnPoints;
    // 提案時点の戦果。倒れていた軍団員は survived: true / injured: true になっている。
    // 判定負けは「押し返された」だけで全滅ではないので、終了時点の戦果を使い、
    // 倒れていた者はここで担いで帰る扱いにする（撤退と同じ。仕様2.2）。
    const contribution = lostOnPoints
      ? result.contribution.map(row => (row.mercenary || row.survived) ? row
        : { ...row, survived: true, injured: true })
      : ((result.retreatOffer && result.retreatOffer.contribution) || result.contribution);
    const carried = contribution.filter(c => c.injured && !c.mercenary);
    // 個人カウンタは名簿が動く前に進める（引退・戦死で消えた者を数え損なわないため）。
    this.tallyBattleRecords(contribution, false);
    // 退いた戦いも1戦。出撃はした（仕様2.2）。
    const unlocked = this.trainSurvivors(contribution, notes);
    // 「今回担がれた時点で、まだ前の負傷が明けていなかった者」＝引退。
    // recoverInjuries() の**前**に控えないと、回復済みの 0 しか見えなくなる。
    const stillInjured = new Set(carried.filter(c => {
      const m = st.roster.find(x => x.uid === c.uid);
      return m && m.injured > 0;
    }).map(c => c.uid));
    // この戦闘の決着ぶんの回復を先に済ませてから、今回担いで帰った者へ負傷を付ける。
    this.recoverInjuries();

    notes.push(lostOnPoints
      ? `${stageData.army} に押し返された。`
        + (carried.length ? `${carried.map(c => c.name).join("、")}を担いで戻った（報酬は無い）` : "報酬は無い")
      : `${stageData.army} から退いた。`
        + (carried.length ? `${carried.map(c => c.name).join("、")}を担いで帰った（報酬は無い）` : "報酬は無い"));
    // 戦闘中に略奪した金貨も確定しない。無傷で持ち帰れるなら、退くのが常に正解になる。
    const lootGold = Math.max(0, Number(result.resourceChanges && result.resourceChanges.gold) || 0);
    if (lootGold > 0) notes.push(`略奪した ${lootGold}G は戦場へ置いてきた`);

    // 誰も欠けていないが、pendingVacancies / lastFallen をここで揃えておく
    // （前の戦闘の戦没者が結果画面に残らないように）。
    this.processCasualties(contribution, notes);
    // 倒れる前の働きは残る。戦功は提案時点の contribution で数える。
    this.awardMerit(contribution, notes);
    // 担いで帰った者は次の1戦だけ休む。
    const retiring = [];
    for (const row of carried) {
      const monster = st.roster.find(m => m.uid === row.uid);
      if (!monster) continue;
      // 負傷が明ける前にもう一度担がれた＝もう戦えない。引退して名簿から消える。
      // 「二度も担いで帰った」は損失ではなく、その人物の物語の終わり方のひとつ。
      if (stillInjured.has(monster.uid)) {
        this.recordDeparture(monster, "retired", { army: stageData.army });
        retiring.push(monster.uid);
        notes.push(`${monster.name} は二度目の負傷で引退した。もう戦えない`);
        continue;
      }
      monster.injured = 1;   // 次の1戦だけ休む
      // 負傷者は出撃隊から外す（次の編成画面で「出せない者が枠を塞いでいる」を作らない）
      st.activeUids = st.activeUids.filter(uid => uid !== row.uid);
    }
    if (retiring.length) {
      st.roster = st.roster.filter(m => !retiring.includes(m.uid));
      st.activeUids = st.activeUids.filter(uid => !retiring.includes(uid));
    }
    if (carried.length) this.syncDepartments();
    // 防衛戦から退く＝城を明け渡して山へ逃げる。人は連れて帰れるが、城は荒らされる。
    const isDefense = this.isDefenseBattle(stageData);
    const heroDefense = isDefense && (st.counterattack || {}).kind === "hero";
    let defenseOutcome = null, castleFell = false;
    if (isDefense) {
      defenseOutcome = { ransacked: this.ransack(notes) };
      const rules = this.counterRules();
      st.alert = Math.max(0, st.alert - Math.floor(rules.threshold / 2));
      notes.push(`王国は荒らして満足し、引き上げた（警戒 ${st.alert}）`);
      st.defenses = st.defenses || { won: 0, lost: 0 };
      st.defenses.lost += 1;
      st.counterattack = null;
      if (heroDefense) { st.heroCame = true; castleFell = true; }
    } else {
      // 征服は進まない。だが敵に見つかった事実は残る。
      const alertDelta = Number(stageData.alertDelta) || 1;
      st.alert = Math.max(0, st.alert + alertDelta);
      notes.push(`王国警戒度+${alertDelta}（現在 ${st.alert}）`);
    }

    // 留守番の仕事は戦場の結果と無関係。給与も払う
    // （撤退したから払わない、は「わざと退けば給与が浮く」抜け道になる）。
    this.processDepartments(stageData, notes, undefined, battleRations);
    this.paySalaries(notes);
    this.processDepartures(notes);
    this.settleDebts(notes);

    st.turn += 1;
    st.missionOffers = [];
    // 押し返されたのは撤退ではない。退いた回数（軍風の材料）には数えない。
    if (!lostOnPoints) st.retreatCount = (st.retreatCount || 0) + 1;
    // 勇者に城を明け渡したら終わり。再建は無い。
    st.phase = castleFell ? "gameover"
      : this.canRebuild() ? "result" : "defeat";
    if (castleFell) st.castleFell = true;

    st.lastBattle = {
      victory: false,
      retreated: !lostOnPoints,
      lostOnPoints,
      defense: isDefense,
      defended: false,
      ransacked: (defenseOutcome && defenseOutcome.ransacked) || null,
      unlocked,
      missionKind: stageData.missionKind,
      missionTitle: stageData.missionTitle,
      army: stageData.army,
      region: stageData.region,
      reward: 0,
      lootGold: 0,
      battleRations, mealPlan, goldBefore,
      synergies: result.activeSynergies,
      incidents: result.incidents || [],
      notes,
      logLength: result.log.length,
      contribution: this.attachVoices(contribution, false),
      nearMiss: result.nearMiss,
      chainSummary: result.chainSummary,
      chainView,
      overkillSummary: result.overkillSummary,
      momentumPeak: (result.timeline || []).reduce((max, e) =>
        e.type === "momentum" && Number.isFinite(e.mult) ? Math.max(max, e.mult) : max, 1),
      summonCount: result.summonCount || 0,
      facility: (() => {
        const info = this.facilityInfo();
        const active = this.activeFacility();
        return {
          level: st.facilityLevel || 0, name: info.name, works: this.facilityWorks(),
          hpMult: info.hpMult, defBonus: info.defBonus,
          activeId: active ? active.id : null, activeName: active ? active.name : null
        };
      })(),
      facilitySummary: result.facilitySummary || { facilities: [], rescuedFromWipe: false },
      deathChains: result.deathChains || [],
      buildChanges: pending.buildChanges,
      spotlight: typeof Spotlight !== "undefined" ? Spotlight.of(result.timeline, {
        highlightIds: pending.highlightIds || []
      }) : null
    };
    this.rememberSpotlight(st.lastBattle.spotlight, stageData, false);
    st.battleIncidentTotal = (st.battleIncidentTotal || 0) + (result.incidents || []).length;
    if ((st.mercenaries || []).length) {
      notes.push(`傭兵${st.mercenaries.length}名との契約が終了した（${st.mercenaries.map(m => m.name).join("、")}）`);
    }
    st.mercenaries = [];
    st.mercenaryOffers = [];

    // 王国の反撃の判定は決着の最後（続行側と同じ場所）。
    if (st.phase !== "gameover") this.checkCounterattack();
    if (st.phase === "result") this.genApplicants();
    // 城陥落はここで終わる。deploy() の末尾を通らない経路なので、自分で記録を確定させる。
    if (st.phase === "gameover") this.endRun(false);
    this.save();
    return st.phase;
  },

  // 全滅の印。**battle.js の戻り値にはこの鍵が無く、タイムラインの result イベントにだけ載る。**
  // "player"（味方が全滅）／"enemy"（敵が全滅）／null（判定決着）。
  wipeOf(result) {
    const event = ((result && result.timeline) || []).find(e => e.type === "result");
    return (event && event.wipe) || null;
  },

  // ── 王国の反撃 ─────────────────────────────
  counterRules() {
    const rules = (typeof COUNTERATTACK !== "undefined" && COUNTERATTACK) || {};
    return {
      threshold: rules.threshold !== undefined ? rules.threshold : 6,
      nearChance: rules.nearChance !== undefined ? rules.nearChance : 0.5,
      ransack: rules.ransack || { facilityLevels: 1, foodRatio: 0.5, relics: 1 },
      seize: rules.seize || { materials: 2, food: 2 }
    };
  },

  isDefenseBattle(stageData) {
    return !!(stageData && stageData.missionKind === "defend");
  },

  // 決着処理の最後に呼ぶ。警戒が閾値に届けば討伐隊を予約する。
  // 予告は必ず1手番前（奇襲はしない）。備える時間を作るのが目的なので、
  // 予約中の面接・編成は通常どおり動く。
  checkCounterattack() {
    const st = this.state;
    if (st.counterattack && st.counterattack.pending) return null;
    const rules = this.counterRules();
    const alert = st.alert || 0;
    if (alert < rules.threshold - 1) return null;
    if (alert < rules.threshold && !U.chance(rules.nearChance)) return null;
    // 魔王軍レベルが上限に達していれば、来るのは討伐隊ではなく勇者。ラン中1回だけ。
    const hero = this.armyLevel() >= ENEMY_STAGES.length && !st.heroCame;
    if (!hero && st.heroCame) return null;   // 勇者を退けた後はもう来ない
    const stage = hero
      ? ENEMY_STAGES[ENEMY_STAGES.length - 1]
      : ENEMY_STAGES[U.clamp(this.armyLevel(), 0, ENEMY_STAGES.length - 2)];
    st.counterattack = {
      pending: true,
      kind: hero ? "hero" : "punitive",
      armyName: hero ? stage.army : `${stage.army}討伐隊`
    };
    return st.counterattack;
  },

  // 城を守れなかった。**人は取らない**（それは戦場で決まっている）。
  // 持っていかれるのは、積み上げたもの——施設・蓄え・蔵の品。
  ransack(notes) {
    const st = this.state;
    const rules = this.counterRules().ransack;
    const before = { facility: st.facilityLevel || 0, food: st.food || 0 };
    if (st.facilityLevel > 0) {
      st.facilityLevel = Math.max(0, st.facilityLevel - (rules.facilityLevels || 1));
      // 進捗はその段階の入口まで戻す（次の1投入で上がり直すのは早すぎる）
      st.buildProgress = (FACILITY_LEVELS[st.facilityLevel] || {}).buildThreshold || 0;
      if (st.facilityLevel === 0) st.activeFacilityId = null;
      notes.push(`城が荒らされた。施設レベル ${before.facility} → ${st.facilityLevel}`);
    }
    if (st.food > 0) {
      st.food = Math.floor(st.food * (rules.foodRatio !== undefined ? rules.foodRatio : 0.5));
      notes.push(`蓄えを持っていかれた。食料 ${before.food} → ${st.food}`);
    }
    // 蔵の品。誰かが持っている遺物は本人と一緒に戦場にあるので取られない。
    let relic = null;
    const stored = (st.relics || []).filter(r => r.holderUid === null);
    for (let i = 0; i < (rules.relics || 0) && stored.length; i++) {
      relic = stored.shift();
      st.relics = st.relics.filter(r => r.id !== relic.id);
      st.plundered = st.plundered || [];
      st.plundered.push({ name: relic.name, turn: st.turn });
      notes.push(`蔵から【${relic.name}】が持ち去られた`);
    }
    st.ransackCount = (st.ransackCount || 0) + 1;
    return { facilityBefore: before.facility, facilityAfter: st.facilityLevel,
      foodBefore: before.food, foodAfter: st.food, relic: relic ? relic.name : null };
  },

  // 建て直せるか。名簿に誰か残っていれば続く（留守番だけでも続く）。
  // 名簿が空でも、応募者を1人雇う金があれば続く。**どちらも無いときだけ再起を提示する。**
  canRebuild() {
    const st = this.state;
    if (st.roster.length > 0) return true;
    return st.gold >= this.hireCost();
  },

  // 負傷は次の1戦だけ。戦闘が一つ決着するたびに1つ減らす（勝利・敗北・撤退を問わない）。
  recoverInjuries() {
    for (const m of this.state.roster) {
      if (m.injured) m.injured = Math.max(0, m.injured - 1);
    }
  },

  // 負傷者は出撃できない。留守番としては働く（包帯を巻きながら帳簿は付けられる）。
  isInjured(uid) {
    const m = this.state.roster.find(x => x.uid === uid);
    return !!(m && m.injured > 0);
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
    // 留守番が食料も建材も担う（旧生活・建設の両方）
    const lifeWorkers = this.departmentRoster("home");
    const builders = lifeWorkers;
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
      loyaltyDelta = -Math.min(18, foodShortage * DEPARTMENT_RULES.foodShortageLoyaltyPenalty);
    } else if (lifeWorkers.length > 0) {
      loyaltyDelta = normalized ? this.dailyShare(1, dailyDay) : 1;
    }
    if (loyaltyDelta) {
      // 食わない者は食事に不満を持たない。アンデッドと飢餓適応者は飢えても揺れない。
      for (const m of st.roster) {
        if (loyaltyDelta < 0 && Aptitude.of(m).appetite === 0) continue;
        m.loyalty = U.clamp(m.loyalty + loyaltyDelta, 0, 100);
      }
    }
    // 飢餓は損失で終わらせない。飢え続けた軍団は、食わない体になって出口へ抜ける。
    const adapted = this.advanceHunger(foodShortage > 0, notes);

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
    if (st.facilityLevel > beforeLevel) st.pendingFacilityChoiceLevel = st.facilityLevel;

    const spoiled = this.spoilFood(notes);
    st.lastDepartmentReport = {
      foodReward,
      foodProduced,
      foodConsumed,
      foodShortage,
      foodSpoiled: spoiled,
      hungerStreak: st.hungerStreak || 0,
      adapted,
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

    notes.push(`留守番の調達：食料 +${foodReward + foodProduced} / 消費 ${foodConsumed}（備蓄 ${st.food}／上限 ${this.foodCapacity()}）`);
    if (output.wage > 0) notes.push(`経理部の働きで給与総額を ${output.wage}% 圧縮した`);
    if (foodShortage > 0) {
      notes.push(`食料不足 ${foodShortage}！ 軍団全員の忠誠${loyaltyDelta}`);
    } else if (lifeWorkers.length > 0) {
      notes.push(`留守番の温かい食事で軍団全員の忠誠+1`);
    }
    if (salvage > 0) {
      notes.push(`供養代行：戦没者を弔い、墓石ぶんの建材 +${salvage} を得た……`);
    }
    notes.push(`留守番の建設：建材 +${materialReward} / 投入 ${materialUsed}`
      + `（施工能力 ${buildCapacity}・備蓄 ${st.materials}）`);
    if (st.facilityLevel > beforeLevel) {
      const facility = this.facilityInfo();
      notes.push(`施設完成【${facility.name}】稼働中の大型施設が1戦闘に ${facility.works} 回まで働く`);
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
    // 昇進の boost は現在値へ直接かける（小成長とは別枠）。
    // `m.base` と `m.grown` には触らない。触ると伸びが昇進に比例して膨らむ。
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
      notes.push(`魔王命令により給与・留守手当${total}Gを意図的に未払い。勤務者の忠誠が最大 ${worst} 下がった`);
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
      notes.push(`給与・留守手当 ${payable}G を支払った（所持金 ${st.gold}G）勤務者の忠誠+${loyaltyGain}`);
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
      notes.push(`金庫が足りない！ 給与・留守手当${total}G が未払いに……勤務者の忠誠が最大 ${worst} 下がった`);
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
      notes.push(`給与・留守手当を ${quote.cost}G で前払い・厚遇した（所持金 ${st.gold}G）勤務者の忠誠+8`);
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
    for (const row of fallen) {
      const monster = st.roster.find(m => m.uid === row.uid);
      if (monster) this.recordDeparture(monster, "fallen", { army: this.stageData().army });
    }
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
      this.recordDeparture(m, "deserted");
    }
    if (leaving.length > 0) {
      const ids = new Set(leaving.map(m => m.uid));
      st.roster = st.roster.filter(m => !ids.has(m.uid));
      st.activeUids = st.activeUids.filter(uid => !ids.has(uid));
    }
  },

  // ── ビルド名 ───────────────────────────────
  // 魔界史に残るのが「第N代・M戦で敗北・施設Lv.2」という台帳の数字だけでは、
  // 負けたランが記録として何も語らない。設計憲法 第7節（敗北を笑える／人に話したくなる
  // ものにする）と第11節（歴史を残す）より、ランを一言で言い表す名前を自動生成する。
  //
  // 材料はすべて record の中にある（KPIには依存しない。simでもテストでも同じ名前が出る）。
  // 新しい数値もコンテンツも増やさず、既にある観測の接続数だけを増やす（第4節）。
  //
  // 名前 = 〈修飾〉＋〈中核〉＋〈体裁〉
  // 修飾は「そのランで実際に起きた、いちばん珍しいこと」を1つだけ採る。
  // 2つ並べると「墓地を三度も回した屍を積み上げた死の軍勢」のように読めなくなるため、
  // 口に出して言える長さを優先する（人に話したくなるのが目的なので）。

  // 上にあるものほど「そのランを言い表している」と判断する。
  BUILD_TRAITS: [
    { id: "facility_max", test: r => r.facilityLevel >= 3 && r.activeFacilityId,
      phrase: r => ({
        graveyard: "墓地を三度も回した",
        extortion_ledger: "帳簿を三度めくった",
        grand_kitchen: "厨房を焚き続けた"
      }[r.activeFacilityId] || "城を建てきった") },
    { id: "overkill", test: r => (r.maxOverkill || 0) >= 200, phrase: () => "過剰殺戮の" },
    { id: "chain", test: r => (r.maxChain || 0) >= (Chain.versionOf(r) >= 2 ? 4 : 6),
      phrase: r => `${r.maxChain}連鎖を通した` },
    { id: "no_death", test: r => (r.fallenTotal || 0) === 0 && (r.battlesWon || 0) >= 5,
      phrase: () => "誰ひとり死なせなかった" },
    { id: "many_death", test: r => (r.fallenTotal || 0) >= 10, phrase: () => "屍を積み上げた" },
    { id: "withhold", test: r => (r.payrollChoices || {}).withhold >= 5,
      phrase: () => "給料を払わなかった" },
    { id: "advance", test: r => (r.payrollChoices || {}).advance >= 5,
      phrase: () => "厚遇されすぎた" },
    { id: "raid", test: r => (r.missionCounts || {}).raid >= 5, phrase: () => "略奪しかしなかった" },
    { id: "suppress", test: r => (r.missionCounts || {}).suppress >= 4,
      phrase: () => "身内ばかり殴っていた" },
    { id: "wanted", test: r => (r.alert || 0) >= 12, phrase: () => "指名手配された" },
    { id: "incidents", test: r => (r.battleIncidentTotal || 0) >= 20, phrase: () => "不祥事まみれの" },
    { id: "generals", test: r => (r.generalsMade || []).length >= 2, phrase: () => "将軍が二人いた" },
    { id: "tiny", test: r => (r.maxArmySize || 0) > 0 && r.maxArmySize <= 4,
      phrase: r => `たった${r.maxArmySize}体の` },
    { id: "huge", test: r => (r.maxArmySize || 0) >= 15, phrase: () => "大所帯の" },
    // ここから下は「ほぼ全ランで起きる普通の行動」。修飾は珍しさを表すためにあるので、
    // 他に何も言うことがないランだけがこの名前を名乗る。
    // 50ラン計測で上位に置いたところ、名前の半分以上がこの2つに occupied された。
    { id: "retry", test: r => (r.retriesUsed || 0) >= 1, phrase: () => "一度死に損なった" },
    { id: "seized", test: r => !!r.seizeUsed, phrase: () => "拠点を接収した" }
  ],

  // 中核は、発見したシナジーがあればそれを名乗る。無ければ主力種族。
  BUILD_CORES: [
    ["legion_of_dead", "死の軍勢"], ["king_slime", "キングスライム"],
    ["arcane_circle", "魔法結社"], ["goblin_horde", "ゴブリン軍団"],
    ["elite_few", "精鋭"], ["cheap_labor", "安月給"],
    ["martyr_allowance", "殉職手当"], ["general_command", "将軍の号令"]
  ],

  buildName(record) {
    const r = record || {};
    const traits = this.BUILD_TRAITS.filter(t => { try { return t.test(r); } catch (e) { return false; } });
    const prefix = traits.length ? traits[0].phrase(r) : "";
    const found = new Set(r.discoveredSynergyIds || []);
    const coreEntry = this.BUILD_CORES.find(([id]) => found.has(id));
    const core = coreEntry ? coreEntry[1] : `${r.mainRace || "寄せ集め"}`;
    // 中核がシナジー名なら体裁を足さない（「死の軍勢軍団」にしないため）
    const size = r.maxArmySize || 0;
    const suffix = coreEntry ? "" : size >= 12 ? "の大軍団" : (size >= 1 && size <= 4) ? "の一党" : "軍団";
    // 何も起きなかったランは、そう名乗らせる（第12節・くすっと笑える）
    if (!prefix) return `特筆すべきことのない${core}${suffix}`;
    return `${prefix}${core}${suffix}`;
  },

  // ── 前回出撃との差分（R2） ────────────────────────────
  //
  // 設計書 6.1 の優先順1番目「今回新しく採用/出撃/配属を変えた人の確実な働き」を
  // 出すための材料。**効果を捏造する材料にはしない**（設計書 6.2）。
  // ここが答えるのは「何を変えたか」だけで、「変えたから勝ったか」ではない。
  //
  // KPI にも前戦との比較はあるが（`KPI.fingerprint`）、あちらは
  // 「何か変わったか」の真偽を返す文字列指紋で、**誰が変わったかを持たない**。
  // 目的が違うので流用しない。ただし**見る次元は揃える**
  //（出撃隊・配属・傭兵・施設・給与方針・合体・作戦）。片方だけ次元が増えると、
  // 「試行として数えたのに差分は空」のような食い違いが静かに生まれる。
  buildSnapshot(stageData) {
    const st = this.state;
    if (!st) return null;
    const byUid = new Map((st.roster || []).map(m => [m.uid, m]));
    return {
      // 並び順は配置そのものなので、集合ではなく順序を保つ
      deployed: (st.activeUids || []).map(uid => {
        const m = byUid.get(uid);
        return { uid, name: m ? m.name : null, tplId: m ? m.tplId : null,
          rankId: m ? m.rankId : null, traits: m ? (m.traits || []).slice().sort() : [] };
      }),
      roster: (st.roster || []).map(m => m.uid).sort((a, b) => a - b),
      departments: Object.fromEntries((st.roster || []).map(m => [m.uid, this.departmentOf(m).id])),
      mercenaries: (st.mercenaries || []).map(m => m.name),
      facility: `${st.facilityLevel || 0}:${st.activeFacilityId || "none"}`,
      payroll: st.payrollPolicy || "regular",
      merge: st.kingSlimeMerge !== false,
      mission: (stageData && stageData.missionKind) || null
    };
  },

  // 2つのスナップショットの差。前が無い（ランの初戦・旧セーブ）ときは
  // **差分なし**として返す。無いものを「全部変えた」と読み替えない。
  buildChanges(prev, next) {
    if (!next) return null;
    const none = {
      first: !prev, hired: [], deployed: [], benched: [], reassigned: [],
      reordered: false, mercenaries: [], facility: null, payroll: null,
      merge: false, mission: null, changedUids: []
    };
    if (!prev) return none;
    const prevDeployed = new Map(prev.deployed.map(d => [d.uid, d]));
    const prevRoster = new Set(prev.roster || []);
    const hired = next.deployed.filter(d => !prevRoster.has(d.uid));
    const deployed = next.deployed.filter(d => prevRoster.has(d.uid) && !prevDeployed.has(d.uid));
    const benched = prev.deployed.filter(d => !next.deployed.some(x => x.uid === d.uid));
    const reassigned = [];
    for (const [uid, dept] of Object.entries(next.departments || {})) {
      const before = (prev.departments || {})[uid];
      if (before !== undefined && before !== dept) {
        const found = next.deployed.find(d => String(d.uid) === String(uid));
        reassigned.push({ uid: Number(uid), name: found ? found.name : null, from: before, to: dept });
      }
    }
    // 顔ぶれが同じでも並び順が違えば「配置を変えた」。先頭ほど狙われるので意味が変わる。
    const sameMembers = next.deployed.length === prev.deployed.length
      && next.deployed.every(d => prevDeployed.has(d.uid));
    const reordered = sameMembers
      && next.deployed.some((d, i) => prev.deployed[i] && prev.deployed[i].uid !== d.uid);
    const changed = new Set([...hired, ...deployed, ...reassigned].map(d => d.uid));
    return {
      first: false, hired, deployed, benched, reassigned, reordered,
      mercenaries: next.mercenaries.filter(name => !prev.mercenaries.includes(name)),
      facility: prev.facility !== next.facility ? { from: prev.facility, to: next.facility } : null,
      payroll: prev.payroll !== next.payroll ? { from: prev.payroll, to: next.payroll } : null,
      merge: prev.merge !== next.merge,
      mission: prev.mission !== next.mission ? { from: prev.mission, to: next.mission } : null,
      // 「今回動かした人」。戦果の1文が、この人たちの働きを優先して選ぶ。
      changedUids: [...changed]
    };
  },

  // ── 魔界史へ残す「記憶」1件（R3） ─────────────────────
  //
  // 第11節「魔界史は単なる統計画面ではない。自分だけの魔王軍の話を保存する場所」。
  // 統計はもう十分あるので、ここで残すのは**誰が誰を動かしたか**という出来事1件だけ。
  //
  // 残すのは名前と数値だけにする。設計書 6.2 の注意どおり、**戦闘中IDと永続uidは別**で、
  // p0/x0 のような戦闘限りのIDや根拠イベントIDは、戦闘が終われば何も指さない。
  // それを魔界史へ持ち込むと「存在しないuid」を抱えた記録になるので、ここで落とす。
  // 残った形だけで**自立して再表示できる**ことが、この関数の責任。
  rememberSpotlight(spotlight, stageData, victory) {
    const st = this.state;
    if (!st || !spotlight || !spotlight.origin || !spotlight.actor) return null;
    const strip = person => person && person.name ? { name: person.name } : null;
    const memory = {
      kind: spotlight.kind,
      origin: strip(spotlight.origin),
      originAbility: spotlight.originAbility || null,
      actor: strip(spotlight.actor),
      ability: spotlight.ability && spotlight.ability.name ? { name: spotlight.ability.name } : null,
      target: strip(spotlight.target),
      sameActor: !!spotlight.sameActor,
      numbers: { ...(spotlight.numbers || {}) },
      // いつの出来事だったか。魔界史で「第N代の何戦目」と添えられるようにする。
      turn: st.turn || 0,
      army: (stageData && stageData.army) || null,
      region: (stageData && stageData.region) || null,
      victory: !!victory
    };
    if (!memory.origin || !memory.actor) return null;
    // ラン中で1件だけ残す。選ぶ基準は B1 と同じ「結果がどこまで届いたか」で、
    // 同じなら大きいほう、それも同じなら**後の戦い**を採る（進むほど話が大きくなる）。
    const current = st.memory;
    const better = !current
      || Spotlight.reach(memory) > Spotlight.reach(current)
      || (Spotlight.reach(memory) === Spotlight.reach(current)
        && (memory.numbers.dmg || 0) >= (current.numbers.dmg || 0));
    if (better) st.memory = memory;
    return st.memory;
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
      // この record の maxChain がどの数え方かを残す。バージョン不明の旧魔界史は
      // 読む側が V1 として扱う（Chain.versionOf）。値の推定変換はしない。
      chainDefVersion: Chain.versionOf(st),
      mainRace,
      region: cleared ? "王都（制圧）" : finalMission.region,
      cause: st.castleFell ? "城陥落"
        : cleared ? "人間界を征服し引退" : `${finalMission.army}に敗北`,
      // どう終わったか：攻めた（王都で勇者に勝つ）／待った（魔王城で勇者を退ける）。
      clearedBy: cleared ? (st.clearedBy || "conquest") : null,
      defenses: { ...(st.defenses || { won: 0, lost: 0 }) },
      retriesUsed: st.retriesUsed || 0,
      fallenTotal: st.fallenTotal || 0,
      fallenRoll: (st.fallenRoll || []).map(f => f.name),
      // 去った者たち（継承）。主要記録は増やさない（設計憲法 第11節）。
      // 名前と、どう去ったか、どれだけ戦ったか、何を残したか。統計ではなく名簿として残す。
      departed: (st.departed || []).map(d => ({
        name: d.name, race: d.race, cause: d.cause, army: d.army || null,
        battles: (d.record || {}).battles || 0, wins: (d.record || {}).wins || 0,
        relicName: d.relicId ? ((st.relics || []).find(r => r.id === d.relicId) || {}).name || null : null
      })),
      generalsMade: (st.generalsMade || []).map(g => ({ name: g.name, race: g.race })),
      battleIncidentTotal: st.battleIncidentTotal || 0,
      facilityLevel: st.facilityLevel || 0,
      activeFacilityId: st.activeFacilityId || null,
      finalResources: { food: st.food || 0, materials: st.materials || 0 },
      departmentCounts: Object.fromEntries(DEPARTMENT_ORDER.map(id => [id, this.departmentRoster(id).length])),
      finalRoster: st.roster.map(m => ({
        name: m.name, tplId: m.tplId, race: m.race, job: m.job, rankId: m.rankId,
        merit: m.merit || 0, department: this.departmentOf(m).id
      })),
      recruitedTplIds: (st.recruitedTplIds || []).slice(),
      discoveredSynergyIds: (st.discoveredSynergyIds || []).slice(),
      hallOfFame: this.hallOfFameMember(),
      // そのランで一番遠くまで届いた出来事1件（R3）。統計ではなく話として残す。
      // 旧魔界史にこの鍵は無い。無ければ表示しないのが正しく、推定生成してはいけない。
      memory: st.memory || null,
      maxArmySize: Math.max(st.maxArmySize || 0, st.roster.length),
      seizeUsed: !!st.seizeUsed,
      date: new Date().toISOString().slice(0, 10)
    };
    // 名前は record が出揃ってから付ける（材料は record の中だけ）
    record.buildName = this.buildName(record);
    st.record = record;
    Storage.appendHistory(record);
    Storage.clearRun();
    // KPIはラン状態の外にあるので、再起で巻き戻しても減らない（第14節・意図的）
    this.kpi("runEnded", st, record);
  },

  // ── ツケ（後で祟る選択の預かり） ──────────────────
  //
  // 戦間イベントの「得だが後で祟る」選択肢は、その場で得をして**数戦あとに**跳ね返る。
  // apply() の中で即座に効かせると「後で祟る」が成立せず、ただの割の悪い取引になる。
  // かといって関数を state に置くとセーブできない（core は JSON で保存する）。
  // そこで **種別と数値だけを持つ伝票** を積み、戦闘のたびに満期のものを支払う。
  //
  // 契約: st.debts = [{ id, battlesLeft, kind, uid?, dept?, amount?, text }]
  //   - `kind` は settleDebt() が知っているものだけ。**イベント側に関数を書かない**
  //   - `text` は満期に戦果へ出す一行。伝票を見た時点で何が来るか読めるようにする
  //   - 新しい祟りを足すときは、ここへ 1 ケース足す（データ側では増やせない）
  //
  // 敗北しても支払う。負ければ踏み倒せるなら、ツケは判断ではなく抜け道になる。
  DEBT_KINDS: ["gold", "food", "materials", "alert", "facilityLevel",
    "loyalty_all", "loyalty_dept", "loyalty_one", "maxhp_all", "maxhp_one",
    "unpaid_one", "dispute", "desert"],

  // イベントの apply() から呼ぶ。battlesLeft 戦後に効く伝票を積む。
  oweDebt(spec) {
    const st = this.state;
    if (!Array.isArray(st.debts)) st.debts = [];
    if (!spec || !this.DEBT_KINDS.includes(spec.kind)) return null;
    const debt = {
      id: `debt${st.debts.length + 1}-${spec.kind}`,
      battlesLeft: Math.max(1, Math.round(Number(spec.battlesLeft) || 1)),
      kind: spec.kind,
      uid: spec.uid === undefined ? null : spec.uid,
      dept: spec.dept || null,
      amount: Number(spec.amount) || 0,
      text: String(spec.text || "")
    };
    st.debts.push(debt);
    return debt;
  },

  // まだ効いていない伝票（表示用）。何が何戦後に来るかを player に隠さない。
  pendingDebts() {
    return (this.state.debts || []).slice().sort((a, b) => a.battlesLeft - b.battlesLeft);
  },

  // 戦闘が1つ終わるたびに呼ぶ。満期のものだけ支払い、notes へ結果を書く。
  settleDebts(notes) {
    const st = this.state;
    if (!Array.isArray(st.debts) || !st.debts.length) return;
    const remaining = [];
    for (const debt of st.debts) {
      debt.battlesLeft -= 1;
      if (debt.battlesLeft > 0) { remaining.push(debt); continue; }
      const line = this.settleDebt(debt);
      if (line && notes) notes.push(`🧾 ツケの取り立て：${line}`);
    }
    st.debts = remaining;
  },

  // 伝票1枚の支払い。効果を適用して、戦果に出す一行を返す。
  settleDebt(debt) {
    const st = this.state;
    const one = debt.uid === null ? null : st.roster.find(m => m.uid === debt.uid);
    const head = debt.text ? `${debt.text} — ` : "";
    const loyalty = (m, delta) => { m.loyalty = U.clamp((m.loyalty || 0) + delta, 0, 100); };
    const shave = (m, percent) => {
      const before = m.hp;
      m.hp = Math.max(1, Math.round(m.hp * (1 - percent / 100)));
      return before - m.hp;
    };
    switch (debt.kind) {
      case "gold":
        st.gold = Math.max(0, st.gold + debt.amount);
        return `${head}所持金 ${debt.amount > 0 ? "+" : ""}${debt.amount}G（現在 ${st.gold}G）`;
      case "food":
        st.food = Math.max(0, st.food + debt.amount);
        return `${head}食料 ${debt.amount > 0 ? "+" : ""}${debt.amount}（備蓄 ${st.food}）`;
      case "materials":
        st.materials = Math.max(0, st.materials + debt.amount);
        return `${head}建材 ${debt.amount > 0 ? "+" : ""}${debt.amount}（備蓄 ${st.materials}）`;
      case "alert":
        st.alert = Math.max(0, st.alert + debt.amount);
        return `${head}王国警戒度 +${debt.amount}（現在 ${st.alert}）`;
      case "facilityLevel": {
        // 稼働中の施設を 0 まで落とすと、選んだ施設が宙に浮く。最低 Lv.1 は残す。
        const floor = st.activeFacilityId ? 1 : 0;
        const before = st.facilityLevel || 0;
        st.facilityLevel = Math.max(floor, before + debt.amount);
        if (st.facilityLevel === before) return `${head}施設は無傷で済んだ（Lv.${before}）`;
        return `${head}施設Lv.${before} → Lv.${st.facilityLevel}`;
      }
      case "loyalty_all":
        for (const m of st.roster) loyalty(m, debt.amount);
        return `${head}全員の忠誠 ${debt.amount > 0 ? "+" : ""}${debt.amount}`;
      case "loyalty_dept": {
        const members = this.departmentRoster(debt.dept);
        for (const m of members) loyalty(m, debt.amount);
        const name = (DEPARTMENTS[DEPARTMENT_ID(debt.dept)] || {}).name || debt.dept;
        return `${head}${name}${members.length}名の忠誠 ${debt.amount > 0 ? "+" : ""}${debt.amount}`;
      }
      case "loyalty_one":
        if (!one) return `${head}当人はもう軍にいない`;
        loyalty(one, debt.amount);
        return `${head}${one.name}の忠誠 ${debt.amount > 0 ? "+" : ""}${debt.amount}`;
      case "maxhp_all": {
        let total = 0;
        for (const m of st.roster) total += shave(m, debt.amount);
        return `${head}全員の最大HP -${debt.amount}%（合計 ${total}）`;
      }
      case "maxhp_one":
        if (!one) return `${head}当人はもう軍にいない`;
        return `${head}${one.name}の最大HP -${shave(one, debt.amount)}`;
      case "unpaid_one":
        if (!one) return `${head}当人はもう軍にいない`;
        one.unpaidStreak = Math.max(0, (one.unpaidStreak || 0) + debt.amount);
        return `${head}${one.name}の未払い ${one.unpaidStreak}回目`;
      case "dispute":
        if (st.laborDispute) return `${head}すでに争議の最中だった`;
        st.laborDispute = { stage: "march", actorUid: one ? one.uid : null, startedTurn: st.turn };
        return `${head}労働争議へ発展した`;
      case "desert": {
        if (!one) return `${head}当人はもう軍にいない`;
        st.roster = st.roster.filter(m => m.uid !== one.uid);
        st.activeUids = st.activeUids.filter(uid => uid !== one.uid);
        st.materials = Math.max(0, st.materials + debt.amount);
        return `${head}${one.name}が出奔した（建材 ${debt.amount}／備蓄 ${st.materials}）`;
      }
      default:
        return "";
    }
  },

  // ── ハプニング ────────────────────────────
  EVENT_CHANCE: 0.45,

  // 戦闘後に何か起きるか抽選する。起きれば phase を "event" にする。
  maybeEvent() {
    const st = this.state;
    st.pendingEvent = null;
    st.eventOutcome = null;
    st.eventCast = null;
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
      st.eventCast = null;
      st.pendingEvent = null;
      this.save();
      return true;
    }
    const notes = [];
    st.eventCast = st.pendingEvent.cast;
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
    if (st.pendingFacilityChoiceLevel) {
      st.phase = "facility";
      this.save();
      return "facility";
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
    st.extraHiresThisPhase = 0;
    st.pendingVacancies = 0;
    st.rerollsThisPhase = 0;
    // 指名は面接1回ぶん。次の面接へは持ち越さない（払い続けないと狙い撃ちできない）
    st.briefsThisPhase = 0;
    st.briefId = null;
    st.pendingEvent = null;
    st.eventOutcome = null;
    st.eventCast = null;
    st.selectedMission = null;
    st.missionOffers = [];
    this.saveCheckpoint();   // ここが「一戦手前」の戻り先になる
    this.save();
  }
};
