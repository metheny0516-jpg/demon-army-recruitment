// 1ラン（第N代魔王軍）の状態管理。UIはここのメソッドを呼んで再描画するだけ。
const Game = {
  state: null,

  power(m) { return m.hp + m.atk * 3 + m.def * 2 + m.spd; },
  armyPower(roster) { return roster.reduce((s, m) => s + this.power(m), 0); },

  RETRIES_PER_RUN: 1,
  // 幕ごとの征服上限。**定数ではなく getter**（第一幕8／第二幕14）。
  // ui.js は Game.MAX_CONQUEST を読むだけなので、読み手は変えなくて済む。
  get MAX_CONQUEST() {
    const cap = typeof ACT_STAGE_CAP !== "undefined" ? ACT_STAGE_CAP : null;
    return (cap && cap[(this.state && this.state.act) || 1]) || ENEMY_STAGES.length;
  },
  MAX_ACT: 2,
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

  // スロットを渡せばそこへ保存する（タイトルの「ここに新規」）。省略時は選んでいるスロット。
  newRun(demonKingId, slot) {
    if (slot !== undefined) Storage.selectSlot(slot);
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
      // 地図の上の戦争（docs/SPEC_TERRITORY_A_2026-09-15.md 段階A）。
      // 落とした土地・従えた部族が領土になる。征服度は決着ごとにここから写す。
      territory: { lands: [], tribes: [] },
      // 名前のある敵将（docs/SPEC_CAPTAINS_BD_2026-09-15.md）。討った・見逃した・雇ったを覚える。
      captains: {},
      settles: 0,          // 決着の数（「⚠ ○○がいる」札の周期）
      raided: {},          // 略奪した土地 → 回数（次に落とすとき守備が硬い）
      patrolCount: 0,      // 巡回で戦った回数（sim の列）
      gold: demonKing.start.gold,
      food: demonKing.start.food,
      materials: demonKing.start.materials,
      // 施設は城下町ただ1系統（2026-09-13、docs/SPEC_TOWN_MERGE_2026-09-13.md）。
      // 旧「戦闘の施設」の3欄（facilityLevel / activeFacilityId / buildProgress）は消した。
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
      // 直近の決着で伸びた数値（決着画面が一行ずつ読み上げる）
      lastGrowth: [],
      generalsMade: [],
      battleIncidentTotal: 0,
      // 撤退（2026-09-10）
      retreatCount: 0,
      orderCount: 0,
      stageFights: {},          // 敵の慣れ：段階ごとに戦った回数（通常作戦のみ）
      outpost: null,            // 前哨戦の札（2026-09-12）。{ stage, cleared, formationId }
      skillLore: {},            // 種族の伝承：species → 覚えた上位技 id
      pendingBattle: null,
      // 全滅の回数（2026-09-10・再建）
      wipeCount: 0,
      // 幕の進行（2026-09-11）
      act: 1,
      actStartedTurn: 1,
      actHistory: [],
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
      traces: [],
      checkpoint: null
    };
    if (typeof Town !== "undefined") Town.init(this.state);   // 城下町（2026-09-12）
    // 仕様2.5「開幕の勇者襲来を最初の反撃にする」は**開幕3日間プロトタイプ限定**にした。
    // 開幕モードは 2026-09-03 に撤廃されていて `openingPrototype` は常に false なので、
    // ここは今のところ動かない。通常ループの1戦目をいきなり防衛戦にすると、
    // 何もしていないのに討伐隊（段階+1）が来ることになり、「こちらの動きで警戒が溜まる」
    // という時計の意味そのものが壊れる（既存テスト3本もそれで落ちた）。
    // 開幕モードを復活させるなら、この分岐がそのまま最初の反撃になる。
    if (this.state.openingPrototype) {
      const rules = this.counterRules();
      const stage = this.actStages()[0];
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
  trace(kind, subject = null, object = null, data = {}) {
    const st = this.state;
    if (!st || typeof Traces === "undefined") return null;
    if (typeof Incidents !== "undefined") Incidents.init(st);
    return Traces.record(st.traces, { kind, subject, object, data, day: st.day, turn: st.turn });
  },

  // 日誌。作戦（turn）ごとにまとめ、同じ種類の出来事は一行に畳み、事実は素の文で、
  // モルモの一言は作戦ごとに一つだけ（いちばん重い出来事に付ける）。
  // 1行ごとに「デス」を付けると箇条書きが読めない（オーナー試遊 2026-09-11）。
  JOURNAL_PRIORITY: ["fallen", "retreated", "ransacked", "defended", "deserted", "retired", "fired",
    "carried", "promoted", "ordered", "downed", "late", "ate", "fermented", "revived", "hired"],
  JOURNAL_COLLAPSE: { hired: "が採用された", downed: "が倒れて戻った", late: "が遅れて着いた",
    ate: "が敵の携行食を食べた", carried: "が担がれて帰った" },
  journal(limit = 40) {
    const st = this.state;
    if (!st || typeof Traces === "undefined") return [];
    const cap = Math.max(0, Math.floor(Number(limit) || 0));
    const nameOf = uid => {
      const member = (st.roster || []).find(m => m.uid === uid);
      if (member) return member.name;
      const departed = (st.departed || []).slice().reverse().find(m => m.uid === uid);
      return departed ? departed.name : "誰か";
    };
    const plain = trace => Traces.describe(trace, nameOf).replace(/（[^）]*\d[^）]*）/g, "");
    const groups = [];
    for (const trace of Traces.query(st.traces).slice(0, cap)) {
      const key = trace.turn ?? trace.day;
      let group = groups.find(row => row.key === key);
      if (!group) {
        group = { key, day: trace.day, turn: trace.turn, traces: [] };
        groups.push(group);
      }
      group.traces.push(trace);
    }
    const rank = kind => { const i = this.JOURNAL_PRIORITY.indexOf(kind); return i < 0 ? 99 : i; };
    return groups.map(group => {
      const lines = [];
      const byKind = new Map();
      for (const trace of group.traces) {
        if (!byKind.has(trace.kind)) byKind.set(trace.kind, []);
        byKind.get(trace.kind).push(trace);
      }
      for (const [kind, list] of byKind) {
        const verb = this.JOURNAL_COLLAPSE[kind];
        if (verb && list.length > 1) {
          const names = [...new Set(list.slice().sort((a, b) => a.seq - b.seq).map(t => nameOf(t.subject)))].join("、");   // 起きた順に並べる
          lines.push({ seq: list[0].seq, kind, text: `${names}${verb}` });
        } else {
          for (const trace of list) lines.push({ seq: trace.seq, kind, text: plain(trace) });
        }
      }
      lines.sort((a, b) => rank(a.kind) - rank(b.kind) || b.seq - a.seq);
      // モルモの一言はいちばん重い出来事に一つだけ
      const top = lines[0];
      let remark = "";
      if (top) {
        const choices = typeof MORMO_LINES !== "undefined" && MORMO_LINES.journal ? MORMO_LINES.journal[top.kind] : null;
        const template = choices && choices.length ? choices[(top.seq || 0) % choices.length] : "{text}デス";
        remark = template.replace("{text}", top.text);
      }
      return { day: group.day, turn: group.turn, lines, remark };
    });
  },

  recordBattleTraces(result, contribution) {
    const st = this.state;
    for (const row of contribution || []) {
      if (row.mercenary) continue;
      if (row.survived === false || row.injured) this.trace("downed", row.uid, null, { round: null });
      if (row.late > 0) this.trace("late", row.uid, null, { rounds: row.late, cause: row.lateCause || null });
    }
    const byId = new Map((contribution || []).map(row => [row.id, row]));
    for (const event of (result && result.timeline) || []) {
      if (event.type !== "trait_trigger" || event.traitId !== "big_eater") continue;
      const row = byId.get(event.sourceId);
      if (!row || row.mercenary) continue;
      const monster = st.roster.find(m => m.uid === row.uid);
      if (monster) this.memberRecord(monster).ate += 1;
      this.trace("ate", row.uid, null, {});
    }
  },
  load(slot) {
    if (slot !== undefined) Storage.selectSlot(slot);
    const s = Storage.loadRun();
    if (!s || typeof s !== "object") return false;
    this.state = s;
    this.migrateState();
    return true;
  },

  // 書き出した JSON をスロットへ読み込む。移行を通してから保存し直すので、
  // 古い端末で書き出した文字列も今の作りで読める。壊れていれば false。
  importRun(slot, text) {
    const parsed = Storage.importRun(slot, text);
    if (!parsed) return false;
    const keep = this.state;
    this.state = parsed;
    this.migrateState();
    Storage.saveRun(this.state, slot);
    this.state = keep;
    return true;
  },

  // 新しい状態項目を追加しても、既存プレイヤーの LocalStorage セーブを壊さない。
  migrateState() {
    const st = this.state;
    if (!st || typeof st !== "object") return;
    // 領土（段階A）。旧セーブは空（魔王城だけ）から始める。征服度は今の値を残す
    // （次の決着で Territory.conquestOf に置き換わるまで、段階表の見え方は変わらない）。
    if (typeof Territory !== "undefined") Territory.init(st);
    if (typeof Captains !== "undefined") Captains.init(st);
    if (typeof st.settles !== "number") st.settles = Number(st.turn) || 0;
    if (!st.raided || typeof st.raided !== "object") st.raided = {};
    delete st.feastPending;   // 宴は撤去（docs/TICKET_REMOVE_DEAD_2026-09-16.md §1-1）
    delete st.briefId; delete st.briefsThisPhase;   // 指名求人は撤去（同 §1-2）
    delete st.mercenaries; delete st.mercenaryOffers;   // 傭兵市場は撤去（同 §1-3）
    if (typeof st.patrolCount !== "number") st.patrolCount = 0;
    const legacyCampaign = st.conquest === undefined;
    if (legacyCampaign) {
      const legacyStage = U.clamp(Number(st.stage) || 1, 1, this.actStages().length);
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
      maxChain: 0, maxOverkill: 0, kingSlimeMerge: true, raceCounts: {}, recruitedTplIds: [], discoveredSynergyIds: [], uidSeq: 1,
      lastBattle: null, retriesLeft: this.RETRIES_PER_RUN, retriesUsed: 0,
      // 魔界史へ残す「記憶」1件（R3）。ラン状態の中にあるので、再起で巻き戻せば
      // 記憶も一緒に戻る（やり直した歴史の出来事は残さない）。旧セーブには無い。
      memory: null,
      // 前回出撃の確定値（R2）。旧セーブには無いので、読み直した最初の1戦は
      // 「比較する前がない」＝差分なしとして扱う（無いものを差分として捏造しない）。
      lastBuildSnapshot: null,
      rerollsThisPhase: 0, pendingEvent: null, eventOutcome: null, eventCast: null, laborDispute: null, checkpoint: null,
      pendingVacancies: 0, fallenTotal: 0, fallenRoll: [], lastFallen: [],
      lastPromotions: [],
      // 直近の決着で伸びた数値（決着画面が一行ずつ読み上げる）
      lastGrowth: [],
      generalsMade: [],
      battleIncidentTotal: 0,
      turn: 1, conquest: 0, alert: 0, battlesWon: 0,
      day: 1, openingPrototype: false, dailySettledDay: 0, expeditionUsedToday: false, openingDefenseWon: false,
      missionOffers: [], selectedMission: null,
      missionCounts: { raid: 0, suppress: 0, invade: 0 },
      food: DEPARTMENT_RULES.startingFood, materials: 0,
      seizeUsed: false, lastDepartmentReport: null,
      payrollPolicy: "regular",
      payrollChoices: { regular: 0, withhold: 0, advance: 0 },
      lastPayrollReport: null,
      legacyReturn: null, legacyOffered: false, lessonId: null,
      hungerStreak: 0,
      // 撤退（2026-09-10）。旧セーブには無い。pendingBattle は「答える前の戦闘」で、
      // ロード時には続行として決着させる（同じ戦闘を二度見せない）。
      retreatCount: 0, pendingBattle: null, wipeCount: 0, orderCount: 0, stageFights: {}, outpost: null,
      // 幕の進行（2026-09-11）。旧セーブは第一幕として読む。
      act: 1, actStartedTurn: 1, actHistory: [],
      // 王国の反撃（2026-09-10）
      counterattack: null, heroCame: false, defenses: { won: 0, lost: 0 },
      ransackCount: 0, plundered: [], renownBonus: 0, clearedBy: null, castleFell: false, castleFalls: 0,
      // 継承（2026-09-10）。旧セーブには無い。departed は永久離脱の履歴、
      // relics は蔵の品、pendingBond は「次の面接に混ざる縁の者」の予約。
      departed: [], relics: [], relicSeq: 0, pendingBond: null, traces: [],
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
    this.migrateOldFacility(st);
    st.hiresLeft = Math.max(0, Number(st.hiresLeft) || 0);
    st.extraHiresThisPhase = Math.max(0, Number(st.extraHiresThisPhase) || 0);
    if (!Array.isArray(st.generalsMade)) st.generalsMade = [];
    // 殿堂に残る廃止階級は兵卒に丸める（表示だけの値。照合には使っていない）。
    for (const entry of st.departed || []) {
      if (entry && entry.formerRankId && !PROMOTION_RANKS.some(r => r.id === entry.formerRankId)) entry.formerRankId = "soldier";
    }
    if (!Array.isArray(st.recruitedTplIds)) st.recruitedTplIds = [];
    if (!Array.isArray(st.discoveredSynergyIds)) st.discoveredSynergyIds = [];
    for (const m of st.roster) {
      if (m.tplId && !st.recruitedTplIds.includes(m.tplId)) st.recruitedTplIds.push(m.tplId);
    }
    for (const m of st.roster) {
      if (!m.injured) m.injured = 0;   // 旧セーブに負傷は無い
      if (!Array.isArray(m.relicIds)) m.relicIds = [];
      this.memberRecord(m);            // record が無い者に record.battles++ すると落ちる（grow もここで入る）
      this.baseOf(m);                  // base が無い旧セーブは現在値を基礎値にする
      if (!m.skillTier) m.skillTier = (m.traits || []).some(id => ((TRAITS[id] || {}).skill || {}).tier === 2) ? 2 : 1;
      if (typeof m.spirit !== "number") m.spirit = this.spiritRules().start;   // 気合（2026-09-10）。旧セーブには無い
      if (m.debutSkill === undefined) m.debutSkill = null;                     // 旧セーブ：上位技は号令でだけ出る
      // 階級2段（2026-09-13）。小隊長・魔将は廃止して兵卒へ戻す。
      // **能力は巻き戻さない**（既に掛かった +5%／+8% は据え置き。戻す方が壊れる）。
      if (m.rankId && !PROMOTION_RANKS.some(r => r.id === m.rankId)) m.rankId = "soldier";
      // 既に将軍だった者には、転身の中身（気合上限・将軍技・二つ名）を付け直す。
      // HP・攻撃は再度掛けない（transformToGeneral は数値以外だけを持つ）。
      if (m.rankId === "general" && !m.epithet) this.transformToGeneral(m);
      if (m.spiritMaxBonus === undefined) m.spiritMaxBonus = m.rankId === "general" ? 1 : 0;
      // 技（2026-09-12）。癖として持っていた種族固有の効果は技へ移した。
      // 旧セーブからはその癖を取り除き、3戦以上出ている者には種族技を持たせる
      // （何も持たない者が出来ないよう、癖を消すのと技を渡すのは必ず同じ移行で行う）。
      if (!Array.isArray(m.skills)) m.skills = [];
      if (typeof m.lateBloomer !== "boolean") m.lateBloomer = this.isLateBloomer(m);
      if (m.homeBonus === undefined) m.homeBonus = null;
      const moved = (m.traits || []).filter(id => this.MOVED_TO_SKILL.includes(id));
      if (moved.length) m.traits = (m.traits || []).filter(id => !this.MOVED_TO_SKILL.includes(id));
      if ((this.memberRecord(m).battles || 0) >= this.unlockBattlesFor(m, "species")) {
        const sk = this.speciesSkillFor(m);
        if (sk) m.skills.push(sk.id);
      }
    }
    if (!st.stageFights || typeof st.stageFights !== "object") st.stageFights = {};
    // 前哨戦（2026-09-12）。旧セーブは前哨から始める。
    if (st.outpost === undefined) st.outpost = null;
    // 種族の伝承（2026-09-11）。旧セーブは今いる上位技持ちから埋める
    if (!st.skillLore || typeof st.skillLore !== "object") {
      st.skillLore = {};
      for (const m of st.roster) for (const id of (m.traits || [])) {
        const sk = (TRAITS[id] || {}).skill;
        if (sk && sk.tier === 2 && sk.species) st.skillLore[sk.species] = id;
      }
    }
    if (!Array.isArray(st.departed)) st.departed = [];
    if (typeof Town !== "undefined") Town.init(st);   // 城下町（2026-09-12）。旧セーブには無い
    delete st.autoBuild;   // 旧「施工」ごと撤去した（2026-09-13）。flag も残さない
    if (!Array.isArray(st.relics)) st.relics = [];
    if (!Array.isArray(st.traces)) st.traces = [];
    // 答える前の戦闘が保存されていたら、続行として決着させる。
    // 再生し直すと同じ戦闘を二度見ることになり、撤退の機会もリロードで取り直せてしまう。
    if (st.phase === "battle" && st.pendingBattle) {
      const pending = st.pendingBattle;
      st.pendingBattle = null;
      // コマンドバトルの途中でリロードした：指示は失われるので、おまかせで計算して続行として決着する。
      if (!pending.result && pending.replay && typeof Battle !== "undefined") {
        const rp = pending.replay;
        pending.result = Battle.simulate(JSON.parse(JSON.stringify(rp.playerUnits)), JSON.parse(JSON.stringify(rp.enemyUnits)),
          Object.assign({}, rp.options, { manual: false }));
      }
      if (pending.result) {
        this.recordBattleResult(pending);
        this.settleContinue(pending);
      } else {
        st.phase = "formation";
      }
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
      // （旧移行「ゴブリンに追い剥ぎを足す」は 2026-09-12 に削除。追い剥ぎは技へ移り、上の移行で名簿から外している）
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
    const stages = this.actStages();
    return stages[Math.min(this.state.conquest, stages.length - 1)];
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
      const c = this.contributionOf(m, deptId);
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
      produce += this.contributionOf(m, this.departmentOf(m).id).food;
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
    const kitchen = this.facilityReady("grand_kitchen");
    const totalNeed = this.foodNeed() + (kitchen ? 1 : 0);
    const foodBefore = Math.max(0, this.state.food || 0) + (this.isTraining(this.state.selectedMission) && this.state.incidents?.freeTraining ? totalNeed : 0);
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

  // 旧「戦闘の施設」→ 城下町（2026-09-13、仕様3節）。**一度だけ**動く移行。
  //   巨大厨房・墓地 → 同じ Lv で城下町に建てた扱い（金も建材も取らない）
  //   恐喝帳簿      → 施設ではなくなったので Lv×3 の建材で返す
  //   buildProgress → 途中の積み上げは建材で返す（半分・上限6）
  // 済んだら3欄を消す。**旧セーブで activeFacilityId が城下町の id だったことは無い**ので衝突しない。
  migrateOldFacility(st) {
    if (!st) return null;
    const had = st.facilityLevel !== undefined || st.activeFacilityId !== undefined
      || st.buildProgress !== undefined || st.pendingFacilityChoiceLevel !== undefined;
    if (!had) return null;
    const lv = U.clamp(Number(st.facilityLevel) || 0, 0, 3);
    const id = st.activeFacilityId || null;
    const notes = [];
    if (typeof Town !== "undefined") {
      const t = Town.init(st);
      if (lv >= 1 && (id === "grand_kitchen" || id === "graveyard")) {
        t.lv[id] = Math.max(t.lv[id] || 0, lv);
        const f = Town.facility(id);
        notes.push(`${f ? f.name : id}は城下町へ移した（Lv${lv}のまま）`);
      } else if (lv >= 1 && id === "extortion_ledger") {
        const back = lv * 3;
        st.materials = (st.materials || 0) + back;
        notes.push(`帳簿は閉じた。紙代は建材で戻った（建材 +${back}）`);
      }
    }
    const left = Math.min(6, Math.floor((Number(st.buildProgress) || 0) / 2));
    if (left > 0) { st.materials = (st.materials || 0) + left; notes.push(`建てかけの資材が戻った（建材 +${left}）`); }
    delete st.facilityLevel;
    delete st.activeFacilityId;
    delete st.buildProgress;
    delete st.pendingFacilityChoiceLevel;
    // 日誌には次の決着で一行ずつ出す（移行はロードの最中に起きるので、その場に出す画面が無い）。
    if (notes.length) st.lastFacilityMigration = notes;
    return notes;
  },

  // 城下町のまとめ（記録・軍風・教訓・sim が読む）。
  townLevelTotal() {
    if (typeof Town === "undefined") return 0;
    return Town.facilities().reduce((sum, f) => sum + Town.level(this.state, f.id), 0);
  },
  townTopLevel() {
    if (typeof Town === "undefined") return { id: null, lv: 0 };
    const top = Town.facilities().map(f => ({ id: f.id, lv: Town.level(this.state, f.id) }))
      .sort((a, b) => b.lv - a.lv)[0];
    return top && top.lv > 0 ? top : { id: null, lv: 0 };
  },
  // 「同じ決断か」を見分ける指紋（decision の記録用）。施設の顔ぶれが変われば別の決断。
  townSignature() {
    if (typeof Town === "undefined") return "none";
    const built = Town.facilities().map(f => [f.id, Town.level(this.state, f.id)])
      .filter(([, lv]) => lv > 0).map(([id, lv]) => `${id}${lv}`);
    return built.length ? built.join(",") : "none";
  },

  // 戦果に残す施設の要約（2026-09-13）。旧「共通補正 Lv＋稼働施設1つ」から
  // 「城下町の軍施設それぞれの Lv」へ。decision の記録と結果画面が読む。
  facilityReport() {
    const list = this.ARMY_FACILITIES.map(id => {
      const f = typeof Town !== "undefined" ? Town.facility(id) : null;
      return { id, name: f ? f.name : id, icon: f ? f.icon : "", lv: this.facilityLv(id), ready: this.facilityReady(id) };
    }).filter(x => x.lv > 0);
    return { level: list.reduce((a, x) => a + x.lv, 0), facilities: list };
  },

  // 戦場で効く施設は城下町の2つ（巨大厨房・墓地）。Lv がそのまま「1戦闘に働ける回数」。
  ARMY_FACILITIES: ["grand_kitchen", "graveyard"],
  facilityLv(id) {
    return typeof Town !== "undefined" ? Town.level(this.state, id) : 0;
  },
  // battle.js へ渡す works。施設ごとの Lv を持たせる（battle.js は数値でもオブジェクトでも読む）。
  facilityWorks() {
    const out = {};
    for (const id of this.ARMY_FACILITIES) out[id] = this.facilityLv(id);
    return out;
  },

  // その施設が「この出撃で実際に働けるか」。
  // deploy() が Battle へ渡す条件と同じ判定をここへ置き、編成画面の見取り図が
  // 同じ答えを読む。二重に書くと、片方だけ直したときに画面だけ嘘をつく。
  facilityReady(facilityId) {
    if (!facilityId || this.facilityLv(facilityId) < 1) return false;
    // 墓地は留守番に死霊術師がいるときだけ発火する（城下町に建てただけでは働かない）。
    if (facilityId === "graveyard") return this.departmentRoster("home").some(m => m.tplId === "necromancer");
    if (facilityId === "grand_kitchen") return true;
    return false;
  },

  // 拠点接収：建設部門に誰も置かないと施設は「存在しない」ままだった。
  // 勝利した拠点をそのまま接収することで、施工役なしでも1ランに一度だけ最初の施設へ届く。
  // ただし奪った拠点は目立つ（警戒度+3＝以後の敵が約6%強くなる）。
  // Lv.2以降は従来どおり建設部門の仕事であり、この入口は「最初のJokerを試す」ためだけにある。
  // 拠点接収。もとは「勝った拠点をそのまま最初の施設にする」入口だったが、
  // 施設が城下町の1系統になったので **建材の一度きりの追い風** に置き換えた（2026-09-13）。
  // 奪った拠点は目立つ（警戒度+1）という代償はそのまま。
  SEIZE_ALERT_COST: 1,
  SEIZE_MATERIALS: 3,

  seizeQuote() {
    return {
      gain: this.SEIZE_MATERIALS,
      have: this.state.materials || 0,
      alertCost: this.SEIZE_ALERT_COST,
      affordable: true            // 払うものが無くなったので常に受けられる（残すのは表示の互換）
    };
  },

  // 表示・sim・実プレイで同じ条件を使う。結果画面でのみ、1ランに一度だけ提示する。
  canSeizeStronghold() {
    const st = this.state;
    if (!st || st.phase !== "result") return false;
    if (st.seizeUsed) return false;
    if (!st.lastBattle || !st.lastBattle.victory) return false;
    return true;
  },

  seizeStronghold() {
    if (!this.canSeizeStronghold()) return false;
    const st = this.state;
    st.materials += this.SEIZE_MATERIALS;
    st.seizeUsed = true;
    st.alert = Math.max(0, st.alert + this.SEIZE_ALERT_COST);
    if (st.lastBattle && Array.isArray(st.lastBattle.notes)) {
      st.lastBattle.notes.push(`拠点接収：敵拠点から資材を運び出した（建材 +${this.SEIZE_MATERIALS}`
        + `／王国警戒度+${this.SEIZE_ALERT_COST} 現在 ${st.alert}）`);
    }
    this.save();
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
    const cook = active.find(m => (m.traits || []).includes("demon_cook")) || null;
    const hunger = active.find(m => (m.traits || []).includes("hunger_demon")) || null;
    const consumed = rations ? Math.max(0, Number(rations.consumed) || 0) : 0;
    const ranked = active.slice().sort((a, b) => Aptitude.of(b).appetite - Aptitude.of(a).appetite);
    const target = ranked[0] || null;
    const topAppetite = target ? Aptitude.of(target).appetite : 0;
    // 巨大厨房は Lv.+1 倍。Lv.1で従来どおりの2倍、Lv.3で4倍まで濃くなる。
    // 巨大厨房は Lv＋1 倍（facilityWorks() は施設ごとの表を返すので、ここは Lv を直接引く）
    const kitchenMult = rations && rations.kitchen ? 1 + this.facilityLv("grand_kitchen") : 1;
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
      hungerName: hunger && rations && rations.emptied ? hunger.name : null
    };
  },

  preparedRoster(rations, plan) {
    const active = this.activeRoster();
    const meal = plan || this.mealPlan(rations);
    const hungering = active.some(m => (m.traits || []).includes("hunger_demon"));
    return active.map(m => {
      let dmgMult = 1, takenMult = 1;
      if (rations && rations.consumed > 0 && (m.traits || []).includes("big_eater")) dmgMult *= meal.bigEaterMult;
      if (meal.targetUid !== null && m.uid === meal.targetUid) dmgMult *= 1 + meal.boost;
      if (rations && rations.emptied && hungering) { dmgMult *= 2; takenMult *= 1.3; }
      // 施設の一律HP・防御補正は撤去した（設計憲法 第9節）。施設Lv.は
      // 大型Jokerが働ける回数（facilityWorks）としてのみ効く。
      const traits=(m.traits||[]).slice();
      for(const r of this.state.relics||[]) if(r.holderUid===m.uid && r.polishedUntil>(this.state.incidents?.stats?.settles||0) && traits.includes(r.traitId)) traits.push(r.traitId);
      return { ...m, traits, battleDmgMult: dmgMult, battleTakenMult: takenMult };
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

  // 転身した将軍の二つ名。種族ごとに1本（src/data/epithets.js。CodeX が入れるまでは仮の「将軍」）。
  epithetFor(monster) {
    const fallback = (typeof GENERAL_TRANSFORM !== "undefined" && GENERAL_TRANSFORM.fallbackEpithet) || "将軍";
    if (!monster) return fallback;
    if (typeof EPITHETS === "undefined") return fallback;
    return EPITHETS[monster.tplId] || EPITHETS[monster.race] || fallback;
  },
  // 画面に出す名前。**m.name は変えない**（殿堂・遺物・記録・テストが名前で照合している）。
  // 噂の札の効果。判定と文章はデータ、状態の変更はここに集める。
  incidentBonus(m, key, amount, turns=1) {
    if (!m) return;
    m[key]=(m[key]||0)+amount;
    (this.state.incidentEffects ||= []).push({uid:m.uid,key,amount,until:Incidents.init(this.state).stats.settles+turns});
  },
  finishIncidentEffects() {
    const st=this.state;
    st.incidentEffects=(st.incidentEffects||[]).filter(e=>{
      if(e.until>Incidents.init(st).stats.settles)return true;
      const m=st.roster.find(x=>x.uid===e.uid);
      if(m) { m[e.key]=(m[e.key]||0)-e.amount; if(e.key==="spiritMaxBonus")m.spirit=Math.min(m.spirit||0,this.spiritRules().max+m.spiritMaxBonus); }
      return false;
    });
    for(const r of st.relics||[]) if(r.polishedUntil<=Incidents.init(st).stats.settles)delete r.polishedUntil;
    for(const m of st.roster) if(m.epithetOverrideUntil<=Incidents.init(st).stats.settles) {delete m.epithetOverride;delete m.epithetOverrideUntil;}
  },
  incidentApplicant(tplId, name) {
    const m=this.rollApplicant(tplId); if(name)m.name=name;
    (this.state.incidentApplicants ||= []).push(m); return m;
  },
  incidentEffect(id, step, c) {
    const st=this.state,m=c.subject,v=c.viewer,s=Incidents.init(st);
    const loyalty=(list,n)=>list.filter(Boolean).forEach(x=>x.loyalty=U.clamp((x.loyalty||0)+n,0,100));
    if(step==="gain") {
      switch(id) {
        case "slime_pond": this.incidentBonus(v,"spiritMaxBonus",1); break;
        case "mage_lab_light":
          if(this.speciesSkillFor(v)) {v.incidentLearnBonus=1; this.checkSpeciesSkill(v,[]);} else s.freeTraining=true; break;
        case "kobold_dig": st.materials+=4; this.trace("carried_materials",m.uid,null,{amount:4,facility:null}); break;
        case "necro_visitor": this.incidentApplicant("skeleton"); break;
        case "harpy_letter": s.intel=true; break;
        case "general_duel": for(const x of c.members)this.incidentBonus(x,"spiritMaxBonus",1); break;
        case "mimic_appraisal": {
          // 元の特性を次の戦闘入力で二度適用する。名簿の特性や遺物自体は消さない。
          const r=(st.relics||[])[0];
          if(r) {if(r.holderUid==null)this.giveRelic(r.id,m.uid);r.polishedUntil=s.stats.settles+1;} break;
        }
        case "mimic_hostel_locker": st.materials+=2;break;
        case "goblin_market": st.gold+=8;break;
        case "training_visitor": this.incidentApplicant("goblin");break;
        case "skeleton_choir": loyalty(this.departmentRoster("home"),3);break;
        case "succubus_party": loyalty(st.roster,5);break;
        // 堕騎士：使者に会わせると、主を口に出して決める
        case "knight_envoy": loyalty([m],5);break;
      }
      return;
    }
    // 出来事の姿・行き先はセーブに残し、城下町と続きの報告で表示する。
    s.scenes ||= {}; s.scenes[id]={branch:step,turn:st.turn,subjectUid:m?.uid??null};
    switch(id) {
      case "slime_pond":
        if(step==="2体以上") s.bedReserved=st.roster.length<this.maxArmy()?1:0;
        break;
      case "mage_lab_light":
        if(step==="術師以外") {
          v.skills ||= [];
          const skill=["mage_fireball","necro_hand","slime_dissolve"].find(k=>typeof SKILLS!=="undefined"&&SKILLS[k]&&!v.skills.includes(k));
          if(skill)v.skills.push(skill);
          else {s.scenes[id].branch="術師系";s.lessonUid=v.uid;c.branchOverride="術師系";}
        } else { s.lessonUid=v.uid; }
        break;
      case "kobold_dig": s.bankPassage=step;break;
      case "necro_visitor":
        if(step==="遺物あり")s.masterVisit={name:(m?.name||"骸骨")+"の元の主",due:(st.turn||0)+2};
        break;
      case "harpy_letter":
        if(step==="前哨済み") {const a=this.incidentApplicant("goblin","王国の連絡兵");const soldier=this.actStages()[0].units[0];a.race=soldier.race||"人間";a.icon=soldier.icon||"🛡️";a.tplId=soldier.tplId||"soldier";a.tags=(soldier.tags||[]).slice();a.traits=(soldier.traits||[]).slice();}
        else s.letterEnemy=true;
        break;
      case "general_duel":
        for(const x of c.members)this.trace("trained",x.uid,null,{tier:"将軍の模擬戦"});
        if(step==="60以上") {c.winner.epithetOverride=c.loser.epithet||"将軍";c.winner.epithetOverrideUntil=s.stats.settles+2;}
        break;
      case "mimic_appraisal":
        this.trace("carried_materials",m.uid,null,{amount:1,facility:"hostel",sourceCard:id});break;
      case "mimic_hostel_locker": s.locker=step;break;
      case "goblin_market": if(step==="なし")this.incidentApplicant("goblin","身分証を裏返した客"); break;
      case "training_visitor":
        if(step==="最多")s.biography={uid:m.uid,name:m.name,lines:(st.traces||[]).filter(t=>t.subject===m.uid||t.object===m.uid).slice(-5).map(t=>Traces.describe(t,uid=>st.roster.find(x=>x.uid===uid)?.name))};
        else s.lessonUid=m.uid;
        break;
      case "skeleton_choir": if(step==="食料3以下")st.food+=3;break;
      case "succubus_party": s.party=step;break;
      // 堕騎士：斬れば王国が気づく（警戒度+5・戦功+3）。断れば名簿を写され、後日 元同僚が討伐隊に混ざる。
      case "knight_envoy":
        if(step==="90以上") { st.alert=Math.max(0,(st.alert||0)+5); if(m)m.merit=(m.merit||0)+3; }
        else { loyalty([m],10); s.envoyRoster={name:(m?.name||"堕騎士")+"の元同僚",due:(st.turn||0)+2}; }
        break;
    }
  },
  incidentTail(t, accept) {
    const st=this.state,s=Incidents.init(st);
    let text="その後、話はひと区切りついた。";
    switch(t.parent) {
      case "slime_pond":
        s.bedReserved=0;
        if(t.branch==="2体以上"&&accept) {this.incidentApplicant("slime");text="池の分身が、正式に面接へ来た。";}
        else text=t.branch==="2体以上"?"スライムたちは池へ戻った。宿舎の寝台が空いた。":"水面の友達との散歩が終わり、スライムが帰ってきた。";
        break;
      case "kobold_dig": delete s.bankPassage;text="地下の荷物を運び終え、銀行への穴を閉じた。";break;
      case "necro_visitor":
        if(t.branch==="遺物あり"&&accept) {
          if(st.counterattack?.pending) {s.masterVisit.due=(st.turn||0)+1;text="前の主は城の外で待っている。先に今の防衛戦を片付けよう。";break;}
          st.counterattack={pending:true,kind:"punitive",armyName:s.masterVisit?.name||"骸骨の元の主"};
          st.missionOffers=[];text="骸骨の元の主を迎え撃つ。城の守りを固めよう。";
        } else text="骸骨の前の主と話をつけ、借りた品を返した。";
        delete s.masterVisit;break;
      case "harpy_letter": s.intel=false;s.letterEnemy=false;text="手紙の主との用事が済んだ。封筒だけが手元に残った。";break;
      case "general_duel":
        for(const uid of [t.winnerUid,t.loserUid]) {const m=st.roster.find(x=>x.uid===uid);if(m){delete m.epithetOverride;delete m.epithetOverrideUntil;}}
        text="名札を返し、将軍たちはいつもの持ち場へ戻った。";break;
      case "mimic_hostel_locker": delete s.locker;text="荷物に部屋札を掛けると、宿舎は静かになった。";break;
      case "goblin_market":text="露店を閉じた。契約の話は断り、応募者とは通常の面接で話すことにした。";break;
      case "training_visitor":delete s.biography;delete s.lessonUid;text="師匠の記事と受け身の稽古が、町の話題になった。";break;
      case "skeleton_choir":text="合唱団が帰ってきた。送別会の主役は無事に引っ越した。";break;
      case "succubus_party":delete s.party;text="夜会がお開きになり、客も隊列を解いた。";break;
      case "knight_envoy":
        if(t.branch==="90未満"&&s.envoyRoster) {
          // 「元同僚が王国の隊列に出る」を、既存の防衛戦の予約で実らせる（necro_visitor と同じ口）。
          if(st.counterattack?.pending) {s.envoyRoster.due=(st.turn||0)+1;text="元同僚はまだ来ない。先に今の防衛戦を片付けよう。";break;}
          st.counterattack={pending:true,kind:"punitive",armyName:s.envoyRoster.name};
          text=`写された名簿から、${s.envoyRoster.name}が討伐隊に混ざった。`;
        } else text="王国はしばらく黙っている。使者の件は、書類の上でだけ残った。";
        delete s.envoyRoster;break;
    }
    if(s.scenes)delete s.scenes[t.parent];
    return text;
  },
  displayName(monster) {
    if (!monster) return "";
    const epithet = monster.epithetOverride || monster.epithet;
    return epithet ? `${epithet}・${monster.name}` : monster.name;
  },
  isGeneral(monster) {
    return !!monster && monster.rankId === "general";
  },

  nextRank(monster) {
    const index = PROMOTION_RANKS.findIndex(rank => rank.id === this.rankOf(monster).id);
    return PROMOTION_RANKS[index + 1] || null;
  },

  // 応募者の質は征服だけでなく経過作戦でも上がる。ただし寄り道だけで
  // 無限に膨張しないよう、従来の8段階を上限にする。
  // 幕を進める。**ランは終わらない。** 名簿・施設・蔵・伝承・魔王軍レベルは持ち越し、
  // 警戒だけ 0 に戻る（隣国の援軍は、まだ魔王軍を知らない）。
  beginAct(next, by, notes) {
    const st = this.state;
    const prev = st.act || 1;
    st.act = next;
    st.actStartedTurn = st.turn;
    st.actHistory = st.actHistory || [];
    st.actHistory.push({ act: prev, by, turn: st.turn });
    // 新しい敵は魔王軍をまだ知らない。時計は 0 から。
    st.alert = 0;
    st.counterattack = null;
    st.heroCame = false;              // 次の幕の勇者は、幕の最終段階で来る
    // 征服はそのまま持ち越す（第二幕の進軍は段階9から）
    st.stage = Math.min(this.MAX_CONQUEST, st.conquest + 1);
    if (notes) {
      notes.push(by === "conquest"
        ? `王都は落ちた。だが王は隣国へ逃げ、援軍を呼んだ。——第${next}幕`
        : `勇者は退いた。だが隣国の援軍を連れて戻るだろう。——第${next}幕`);
    }
    this.trace("act", null, null, { act: next, by });
    return { from: prev, to: next, by };
  },

  // 今の幕の段階表。**run.js の ENEMY_STAGES 参照は全部これを通す。**
  // 第一幕は8段、第二幕は14段（第二幕の6段は別配列に置いてあり、ここで初めて繋がる）。
  actStages() {
    const act = (this.state && this.state.act) || 1;
    return act >= 2 && typeof ENEMY_STAGES_ACT2 !== "undefined"
      ? ENEMY_STAGES.concat(ENEMY_STAGES_ACT2) : ENEMY_STAGES;
  },

  // 今の幕で応募に来うるテンプレート。第二幕から新種族3体が混ざる。
  templates() {
    const act = (this.state && this.state.act) || 1;
    return act >= 2 && typeof MONSTER_TEMPLATES_ACT2 !== "undefined"
      ? MONSTER_TEMPLATES.concat(MONSTER_TEMPLATES_ACT2) : MONSTER_TEMPLATES;
  },

  campaignLevel() {
    const st = this.state;
    // ターン側の係数は data に置く（MONSTER_RULES.levelPerTurn）。0.75 のままだと
    // ターン10で最終段階に達し、敵を連動させたときに征服2で聖騎士団が来る。
    const perTurn = (typeof MONSTER_RULES !== "undefined" && MONSTER_RULES.levelPerTurn) || 0.5;
    // 上限は幕の征服上限（第二幕では14まで伸びる）
    return U.clamp(Math.max(st.conquest + 1, Math.ceil(st.turn * perTurn)), 1, this.MAX_CONQUEST);
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
    // 訓練は「防衛が来ている決着でも選べる」（勇者の前に鍛え直す場でもある）ので、
    // 予約中の札は「防衛＋訓練」の2枚、通常は「3系統＋訓練」の4枚になる。
    // 3択は地図の候補（段階A）。予約中は防衛＋訓練＋巡回。
    const stale = !Array.isArray(offers) || !offers.length
      || (pending ? !offers.some(m => m.missionKind === "defend")
        : offers.some(m => m.missionKind === "defend"))
      || !offers.some(m => m.missionKind === "train");
    if (!force && !stale) {
      st.phase = "mission";
      return offers;
    }
    const previous = new Map((offers || []).map(m => [m.missionKind, m.formationId]));
    st.selectedMission = null;
    st.missionOffers = (pending
      ? [this.buildMission(MISSION_TYPES.defend, previous.get("defend"))]
      : this.territoryOffers(previous))
      .concat(this.patrolOffer() ? [this.patrolOffer()] : [])
      .concat([this.buildMission(MISSION_TYPES.train, previous.get("train"))]);
    st.phase = "mission";
    this.save();
    return st.missionOffers;
  },

  // 3択＝地図で隣接する候補3つ（docs/SPEC_TERRITORY_A_2026-09-15.md §2-2）。
  // 人間界の土地は「落とす」（進軍の型）、部族圏は「従える」（鎮圧の型）。
  // 土地には「略奪」、贈れる部族には「贈る」の札を**同じ場所の裏の選択肢**として並べて返す
  // （表示側が territoryId でまとめて1枚に畳む。新しい action を増やさずに切り替えられる）。
  territoryOffers(previous) {
    if (typeof Territory === "undefined") {
      return MISSION_TYPES.map(type => this.buildMission(type, (previous || new Map()).get(type.id)));
    }
    const st = this.state;
    Territory.init(st);
    const places = Territory.candidates(st, U.rand);
    // 候補が尽きた（幕の全部を落とした）なら今までの3系統へ戻す（幕の着地は既存の経路）。
    if (!places.length) return MISSION_TYPES.map(type => this.buildMission(type, (previous || new Map()).get(type.id)));
    const out = [];
    for (const place of places) {
      const tribe = Territory.isTribe(place.id);
      out.push(this.buildMission(tribe ? MISSION_TYPES[1] : MISSION_TYPES[2], null, place));
      if (!tribe) out.push(this.buildMission(MISSION_TYPES[0], null, place));   // 略奪（裏の選択肢）
      const cost = Territory.tributeCost(place.id);
      if (cost) out.push(this.tributeOffer(place, cost));
    }
    return out;
  },

  // 贈る（戦わずに従える）。戦闘の札ではないので units は持たない。
  // 選んだ時点で selectMission が支払いまで済ませる（新しい action を増やさない）。
  tributeOffer(place, cost) {
    return {
      stage: this.state.turn,
      missionKind: "tribute",
      missionTitle: `${place.name}へ贈る`,
      strategyLabel: "戦わずに従える",
      strategyHint: `金 ${cost.gold}G と食料 ${cost.food} を贈る。戦わずにその種族が仲間になる。`,
      description: "贈り物を持たせた使者を出す。魔王軍にも外交はある（たまに）。",
      territoryId: place.id, territoryMode: "tribute", territoryKind: null,
      territoryLine: "従えれば、その種族が応募に来る",
      tributeCost: cost,
      difficulty: "—", army: `${place.name}の長`, region: place.name,
      reward: 0, foodReward: 0, materialReward: 0,
      alertDelta: 0, conquestDelta: 0, loyaltyDelta: 0,
      armyPressure: 0, familiarity: 0, twoStage: false, missionPhase: "main",
      training: false, units: []
    };
  },

  // 巡回の札。領土が1つも無ければ出さない（見回る先が無い）。
  patrolOffer() {
    if (typeof Territory === "undefined") return null;
    const st = this.state;
    const t = Territory.init(st);
    if (!t.lands.length && !t.tribes.length) return null;
    const stage = Territory.patrolStage(st);
    // 名前は人間界の領土なら「辺境のパトロール隊」、部族圏なら「反乱の残党」。両方あれば交互。
    const both = t.lands.length && t.tribes.length;
    const rebels = both ? ((st.turn || 0) % 2 === 1) : !t.lands.length;
    return this.buildMission(this.PATROL_TYPE, null,
      { id: null, name: "領内", garrison: stage, army: rebels ? "反乱の残党" : "辺境のパトロール隊" });
  },

  // ── 訓練（docs/DESIGN_TRAINING_2026-09-13.md）────────────────
  // 死なない・金も建材も入らない・王国に知られない。食料は減り、給与は半分出る。
  // 相手は本戦の隊列を写して倍率を掛けるだけ（battle.js は触らない）。
  // 稽古で倒れた者は負傷（次の1戦だけ休む）。戦死の処理（継承・遺物・戦没者名簿）は通さない。
  applyTrainingInjuries(contribution, notes) {
    const st = this.state;
    const down = [];
    for (const row of contribution || []) {
      if (!row.trainingDown && !row.injured) continue;
      const monster = st.roster.find(m => m.uid === row.uid);
      if (!monster) continue;
      monster.injured = 1;
      st.activeUids = st.activeUids.filter(uid => uid !== row.uid);
      down.push(monster.name);
    }
    if (down.length) notes.push(`${down.join("、")}が稽古で倒れた（負傷。次の1戦は休む）`);
    return down;
  },

  isTraining(stageData) {
    return !!(stageData && (stageData.training || stageData.missionKind === "train"));
  },
  // 訓練では HP0 は戦死ではなく負傷（次の1戦だけ休む）。**結果を読む側で変換する**
  // （battle.js は触らない。タイムラインは今までどおり death を持つ）。
  softenTrainingCasualties(contribution) {
    for (const row of contribution || []) {
      if (row.survived === false) { row.survived = true; row.injured = true; row.trainingDown = true; }
    }
    return contribution;
  },
  // 訓練の戦功は「生きて終えたら +1（猛者は +2）」だけ。撃破も最多も数えない。
  awardTrainingMerit(contribution, stageData, notes) {
    const st = this.state;
    st.lastPromotions = [];
    const gain = Math.max(1, Number(stageData && stageData.trainingMerit) || 1);
    for (const c of contribution || []) {
      if (c.mercenary) continue;
      const monster = st.roster.find(m => m.uid === c.uid);
      if (!monster) continue;
      this.trace("trained", monster.uid, null, { tier: stageData.army || "稽古", facility: null });
      monster.merit = (monster.merit || 0) + gain;
      monster.loyalty = U.clamp((monster.loyalty || 0) + 1, 0, 100);
      const targetRank = this.rankForMerit(monster.merit);
      while (monster.rankId !== targetRank.id) {
        const next = this.nextRank(monster);
        if (!next || next.threshold > monster.merit) break;
        this.promote(monster, next, notes);
      }
    }
    if (st.incidents?.lessonUid != null) {
      const pupil=(contribution||[]).map(c=>st.roster.find(m=>m.uid===c.uid)).find(m=>m && m.uid!==st.incidents.lessonUid);
      if(pupil) {pupil.incidentLearnBonus=1;this.checkSpeciesSkill(pupil,notes);notes.push(`${pupil.name}も教材で技のこつをつかんだ。`);delete st.incidents.lessonUid;}
    }
    notes.push(`稽古を終えた。出撃した者の戦功 +${gain}・忠誠 +1`);
  },

  trainingOpponents() {
    const list = ((typeof MISSION_TYPES !== "undefined" && MISSION_TYPES.train) || {}).opponents || [];
    return list.map(o => ({ ...o, unlocked: (this.state.conquest || 0) >= o.conquest }));
  },
  // 既定は「解放済みのうち一番強いもの」（迷わせないため）。
  trainingOpponent(id) {
    const list = this.trainingOpponents();
    const open = list.filter(o => o.unlocked);
    return open.find(o => o.id === id) || open[open.length - 1] || list[0];
  },
  // 訓練の相手を作る。本戦の隊列（同じ征服度・同じ隊列）を写して倍率を掛け、
  // 猛者だけ隊長を1体足す。**役はそのまま**（何と戦っているか分からなくならないように）。
  trainingUnits(baseUnits, opponent) {
    const mult = opponent.mult || 1;
    const scale = (v, min) => Math.max(min, Math.round((Number(v) || 0) * mult));
    const units = (baseUnits || []).map(u => ({
      ...u, hp: scale(u.hp, 1), atk: scale(u.atk, 1), def: u.def, spd: u.spd
    }));
    if (opponent.commander && units.length) {
      const model = units[0];
      units.push({ ...model, name: "稽古の隊長", role: "commander",
        hp: scale(model.hp, 1), atk: scale(model.atk, 1) });
    }
    return units;
  },

  // 前哨戦の規則（docs/SPEC_TWO_STAGE_BATTLES_2026-09-12.md）。
  // 進軍は「前哨戦 → 本戦」の2戦。征服度が進むのは本戦に勝ったときだけ。
  TWO_STAGE_REWARD_MULT: 1.3,      // 1段階を2戦に割ったぶんの補正（段階表は触らない）
  OUTPOST_REWARD_RATIO: 0.5,
  OUTPOST_FOOD_REWARD: 2,
  // その段階に前哨が要るか。段階1（チュートリアル）と最終段階（勇者・王都）は一発勝負。
  outpostNeeded(baseIndex) {
    if (baseIndex <= 0) return false;                       // 段階1は敵2体。半分にすると1体になり狙い選びが消える
    if (baseIndex >= this.MAX_CONQUEST - 1) return false;    // 勇者戦・幕の最終段階は前哨なし
    return true;
  },
  // 今の征服度で前哨を制しているか（HUD と作戦カードが読む）。
  // 前哨を制しているか。土地の札（段階A）では「どの土地の前哨か」まで見る
  // （ある土地を偵察して、別の土地の本戦へ持ち込めてしまわないように）。
  outpostCleared(placeId) {
    const st = this.state;
    const o = st && st.outpost;
    if (!o || !o.cleared) return false;
    if (placeId) return o.place === placeId;
    // 引数なしは「どこかの前哨を制しているか」（HUD の ▸前哨済 がこれを読む）。
    return o.place ? true : o.stage === st.conquest;
  },
  // 前哨戦の敵：本戦の隊列の前半（役つきを1体は残す）。
  outpostUnits(units) {
    const keep = Math.max(1, Math.ceil(units.length / 2));
    const ROLES = ["shield", "archer", "priest", "caster", "commander", "rogue", "brute"];
    const picked = units.slice(0, keep);
    // 前半が全員 fighter なら、役つきを1体だけ後半から引いてくる
    // （前哨は「どんな隊列か」を読むための戦いなので、役が1つも見えないと意味がない）。
    if (!picked.some(u => ROLES.includes(u.role))) {
      const withRole = units.slice(keep).find(u => ROLES.includes(u.role));
      if (withRole) picked[picked.length - 1] = withRole;
    }
    return picked;
  },

  // 鎮圧（suppress）の敵の姿。人間の隊列を借りているので tplId / race / icon だけ魔物に差し替える（数値・役は触らない）。
  rebelLook(type, index) {
    if (!type || type.id !== "suppress" || typeof REBEL_LOOKS === "undefined") return {};
    const pool = index === 0 ? REBEL_LOOKS.leaders : REBEL_LOOKS.grunts;
    const look = U.pick(pool) || {};
    return { tplId: look.tplId, race: look.race, icon: look.icon, rebel: true };
  },

  // 巡回の札（docs/SPEC_TERRITORY_A_2026-09-15.md §2-2）。何度でも戦える雑魚戦。
  // 征服は進まず、警戒も上がらない。戦死はある。データ（missions.js）は触らず、
  // 型だけここに置く（段階A のあいだは run.js に閉じる）。
  PATROL_TYPE: {
    id: "patrol", icon: "🛡", title: "領内を巡回する",
    strategyLabel: "領内の見回り",
    strategyHint: "落とした土地を見回る。攻略は進まず、王国にも気づかれない。稼ぎは薄い。",
    descriptions: [
      "領内に湧いた小競り合いを片付けに行く。手柄は小さいが、誰も文句を言わない。",
      "見回りの名目で暴れる。魔王軍の日常業務である。",
      "残党狩り。地味だが、放っておくと面倒になる。"
    ],
    armies: ["辺境のパトロール隊"], regions: ["領内"],
    enemyTierOffset: 0, enemyMult: 1.0, rewardMult: 0.4, payrollCoverage: 0.5,
    rewardJitter: [0, 1], foodReward: 1, materialReward: 0,
    alertDelta: 0, conquestDelta: 0, loyaltyDelta: 0, difficulty: "低"
  },

  // 土地・部族圏の札に使う守備段階。略奪した土地は次に来るとき硬い。
  placeStage(place) {
    const rules = typeof Territory !== "undefined" ? Territory.rules() : { raid: { garrisonBonus: 1 } };
    const raided = ((this.state.raided || {})[place.id] || 0) * (rules.raid.garrisonBonus || 0);
    return Math.max(1, (place.garrison || 1) + raided);
  },

  buildMission(type, previousFormationId, place) {
    const st = this.state;
    // 敵も魔王軍レベルに連動する（仕様2.3）。征服段階だけで引いていた頃は、
    // 略奪を繰り返せば応募者だけ強くして敵を据え置きにできた。
    // 征服段階は「どこまで攻め落としたか（クリア判定）」の意味だけ残す。
    // 通常作戦の敵の段階は**征服度だけ**で決める（2026-09-10）。時間では上がらない。
    // 時間の圧力は警戒度＝王国の反撃（防衛戦は下で魔王軍レベル基準に置き換える）。
    const stages = this.actStages();
    let baseIndex = place
      ? U.clamp(this.placeStage(place) - 1, 0, stages.length - 1)
      : U.clamp(st.conquest + type.enemyTierOffset, 0, stages.length - 1);
    // 防衛戦（王国の反撃）。討伐隊は段階7（聖騎士団）まで。勇者は段階8で固定。
    const counter = type.id === "defend" ? (st.counterattack || {}) : null;
    if (counter) {
      // 討伐隊は時間で厚くなる（魔王軍レベル基準）。段階7（聖騎士団）まで。勇者は段階8で固定。
      baseIndex = counter.kind === "hero"
        ? this.MAX_CONQUEST - 1
        : Math.min(U.clamp(this.armyLevel() - 1 + type.enemyTierOffset, 0, stages.length - 1), stages.length - 2);
    }
    const base = stages[baseIndex];
    const formations = [
      { id: "standard", name: "基本隊列", hint: "王国軍の標準的な隊列。", units: base.units },
      ...(base.variants || [])
    ];
    // 前哨で見た隊列が本戦の隊列（読みに意味を持たせる）。控えは st.outpost.formationId。
    const heldId = type.id === "invade" && this.outpostCleared(place ? place.id : null) ? (st.outpost || {}).formationId : null;
    const formation = formations.find(f => f.id === (heldId || previousFormationId)) || U.pick(formations);
    // 大軍は選抜の自由度が高いぶん敵にも察知される。隠し補正にせず
    // mission.armyPressure として作戦カードへ渡し、解雇・維持の判断材料にする。
    const armyPressure = Math.min(6, Math.max(0, st.roster.length - this.MAX_DEPLOY) * 2);
    // 慣れ：同じ段階で戦うほど王国はその辺りの守りを固める（上限あり）。防衛戦には掛けない。
    const familiarity = counter ? 0 : this.familiarityOf(baseIndex);
    const scale = type.enemyMult * (1 + st.alert * 0.02) * (1 + armyPressure / 100) * (1 + familiarity / 100);
    const stat = (value, min) => Math.max(min, Math.round(value * scale));
    const units = formation.units.map((unit, index) => ({
      ...unit,
      name: type.enemyNames ? type.enemyNames[index % type.enemyNames.length] : unit.name,
      hp: stat(unit.hp, 1),
      atk: stat(unit.atk, 1),
      def: stat(unit.def, 0),
      spd: stat(unit.spd, 1),
      // 反乱軍は魔物の姿（数値と役はそのまま。先頭が首謀者、残りは初期種族の雑魚）
      ...this.rebelLook(type, index)
    }));
    // 訓練：本戦の隊列を写して倍率を掛ける（相手は選んだ段階）。金も警戒も動かない。
    const training = type.id === "train";
    const opponent = training ? this.trainingOpponent(this.state.trainingOpponentId) : null;
    // 進軍だけが2戦制。前哨戦は敵が半分・報酬も半分・征服度は進まない。
    // 土地を落とす札（進軍の型）は今までどおり2戦制。守りの薄い土地（段階1）と
    // 幕の最終段階には前哨が付かない。略奪・従える・巡回は1戦のまま。
    const isOutpost = type.id === "invade" && !counter
      && this.outpostNeeded(baseIndex) && !this.outpostCleared(place ? place.id : null);
    const twoStage = type.id === "invade" && !counter && this.outpostNeeded(baseIndex);
    const jitter = U.randInt(type.rewardJitter[0], type.rewardJitter[1]);
    // 略奪は「給与を払ったうえで少し蓄えられる」資金調達策にする。
    // 固定額だけでは大所帯ほど赤字になり、寄り道する意味が逆転してしまう。
    const payrollSupport = Math.round(this.salaryTotal() * (type.payrollCoverage || 0));
    // 1段階を2戦に割ったので、1戦あたりの実入りは落ちる。段階表を触らずここで補正する。
    const stageReward = base.reward * type.rewardMult * (twoStage ? this.TWO_STAGE_REWARD_MULT : 1);
    // 訓練は金が1円も入らない（Math.max(1, …) の下限も通さない）。
    const reward = training ? 0
      : Math.max(1, Math.round(stageReward * (isOutpost ? this.OUTPOST_REWARD_RATIO : 1))
        + payrollSupport + jitter);
    const variant = type.armies ? U.randInt(0, type.armies.length - 1) : 0;
    const isInvade = type.id === "invade";
    // 討伐隊の名は段階表から作る（固有の敵を足すときは段階表に行を足すだけで済む）。
    if (type.id === "invade" && st.incidents?.letterEnemy && units.length) units[0] = {...units[0], name:"王国の連絡兵"};
    const defenseArmy = counter
      ? (counter.armyName || (counter.kind === "hero" ? base.army : `${base.army}討伐隊`))
      : null;
    const mission = {
      stage: st.turn,
      missionKind: type.id,
      missionTitle: training ? `訓練：${opponent ? opponent.line : "稽古"}` : (isOutpost ? `前哨戦：${base.region}の斥候` : type.title),
      strategyLabel: type.strategyLabel,
      strategyHint: type.strategyHint,
      description: U.pick((isOutpost && type.outpostDescriptions) || type.descriptions),
      // 訓練（2026-09-13）。決着の分岐と表示がこの印を読む。
      training,
      opponentId: opponent ? opponent.id : null,
      opponentName: opponent ? opponent.name : null,
      opponentNote: opponent ? opponent.note : null,
      trainingMerit: opponent ? (opponent.merit || 1) : 0,
      // 前哨戦か本戦か（表示と決着が読む）。進軍以外は常に "main"。
      missionPhase: isOutpost ? "outpost" : "main",
      twoStage,
      difficulty: type.difficulty,
      army: training ? (opponent ? opponent.armyName : "訓練相手")
        : defenseArmy || (isInvade ? (isOutpost ? `${base.army}の斥候隊` : base.army) : type.armies[variant]),
      region: training ? "訓練場" : (counter ? "魔王城" : (isInvade ? base.region : type.regions[variant])),
      reward,
      // 進軍の警戒度は counterattack.js の invadeAlert が正本（反撃A で missions.js を 0 に戻した）。
      // 反撃B はここを読み忘れていて、進軍に勝っても警戒が上がらなかった（時計が動かない）。
      alertDelta: isOutpost
        ? Math.ceil(this.counterRules().invadeAlert / 2)
        : (isInvade ? this.counterRules().invadeAlert : type.alertDelta),
      // 征服度が進むのは本戦の勝ちだけ。
      conquestDelta: isOutpost ? 0 : type.conquestDelta,
      loyaltyDelta: type.loyaltyDelta,
      foodReward: isOutpost ? this.OUTPOST_FOOD_REWARD : (type.foodReward || 0),
      materialReward: type.materialReward || 0,
      armyPressure,
      familiarity,
      baseStage: base.stage,
      formationId: formation.id,
      formationName: formation.name,
      formationHint: formation.hint,
      units: training ? this.trainingUnits(units, opponent) : (isOutpost ? this.outpostUnits(units) : units)
    };
    if (place) this.dressPlaceMission(mission, type, place);
    return this.attachCaptains(mission, place, type, scale);
  },

  // 名前のある敵将を隊列の先頭に乗せる（docs/SPEC_CAPTAINS_BD_2026-09-15.md §2-2）。
  // 乗せ方は4つ：部族の首領・関門の将軍・「⚠ ○○がいる」札・不意打ち。
  // 討った者と雇った者は二度と出ない（見逃した者も既定では出ない）。
  attachCaptains(mission, place, type, scale) {
    if (typeof Captains === "undefined" || mission.training || !mission.units) return mission;
    const st = this.state;
    Captains.init(st);
    const ids = [];
    const alive = id => { const s = Captains.state(st, id).status; return s !== "slain" && s !== "hired"; };
    const add = id => {
      if (!id || ids.includes(id) || !Captains.get(id) || !alive(id)) return false;
      mission.units = Captains.attach(mission.units, id, st, 1);
      ids.push(id);
      return true;
    };
    const land = place && typeof Territory !== "undefined" ? Territory.byId(place.id) : null;
    // 1. 部族の首領：その部族圏を従えに行けば必ず守っている
    if (land && land.chief) add(land.chief.id);
    // 2. 関門の将軍（王都の砦のガレス）
    if (land) for (const id of Captains.ids()) if (Captains.get(id).gate === land.id) add(id);
    // 3. 「⚠ ○○がいる」札：3決着に1回、糸ごとに一人
    if (land && !ids.length && !mission.counterattack) {
      const thread = ["village", "hamlet"].includes(land.kind) ? "village"
        : ["checkpoint", "fort", "port", "temple", "town", "capital"].includes(land.kind) ? "kingdom" : null;
      const pick = thread ? Captains.pickForCard(st, thread, st.settles || 0) : null;
      if (pick && add(pick)) {
        const c = Captains.get(pick);
        mission.captainCard = { id: pick, short: c.short || c.name };
        mission.missionTitle = `⚠ ${c.short || c.name}がいる　${mission.missionTitle}`;
        mission.reward = Math.max(1, Math.round(mission.reward * Captains.rules().bountyMult));
      }
    }
    // 4. 不意打ち：前哨を踏んでいない作戦だけ（訓練・防衛は起きない）
    if (!ids.length && !mission.counterattack && type.id !== "train" && type.id !== "defend"
      && mission.missionPhase !== "outpost" && !mission.twoStage) {
      const hall = this.hallAmbushPool();
      const hit = Captains.ambush(st, st.alert, U.rand, hall.length > 0);
      if (hit && hit.kind === "captain") { if (add(hit.id)) mission.ambush = { kind: "captain", id: hit.id }; }
      else if (hit && hit.kind === "hall" && hall.length) {
        const who = U.pick(hall);
        mission.units = [this.hallAmbushUnit(who, scale)].concat(mission.units);
        mission.ambush = { kind: "hall", name: who.name };
      }
    }
    // 最終戦（都）の顔ぶれ（docs/SPEC_CAPTAINS_BD_2026-09-15.md §2-3）。
    // 勇者アレンの隣に「討たなかった者」が立つ。雇った者はこちらにいるので外れる。
    if (land && land.kind === "capital") {
      mission.units = Captains.heroParty(st, mission.units, 1);
      for (const u of mission.units) if (u.captain && u.captain.id) ids.push(u.captain.id);
      // 師（ガレス）を討たれた勇者は覚醒が早い（50% → 70%）。癖の表は触らない。
      if (Captains.state(st, "gareth").status === "slain") {
        const hero = mission.units.find(u => u.role === "commander");
        if (hero) hero.awakenAt = 0.7;
        mission.heroAwakened = true;
      }
      // 雇った敵将がこちらの隊列にいると、勇者は開戦で気づく
      const hired = (st.roster || []).some(m => m.captainId && st.activeUids.includes(m.uid));
      if (hired) {
        mission.heroNoticesHired = true;
        const hero = mission.units.find(u => u.role === "commander");
        if (hero) hero.introQuote = "……お前も、そちらか。";   // 開戦の一言（battle.js の dialogue が読む）
      }
      mission.heroParty = mission.units.filter(u => u.captain).map(u => u.name);
      st.lastHeroParty = mission.heroParty;   // sim の列（最終戦が既定の3人だけか、混成か）
    }
    mission.captainIds = ids;
    return mission;
  },

  // 先代の英雄（過去ランの殿堂入り）。名前と種族だけを借りて、敵として一度だけ立つ。
  hallAmbushPool() {
    const history = typeof Storage !== "undefined" && Storage.loadHistory ? Storage.loadHistory() : [];
    return (history || []).map(r => r && r.hallOfFame).filter(h => h && h.name && h.tplId);
  },
  hallAmbushUnit(who, scale) {
    const stages = this.actStages();
    const base = stages[U.clamp(this.armyLevel() - 1, 0, stages.length - 1)];
    const model = (base.units || [])[0] || { hp: 40, atk: 10, def: 4, spd: 6 };
    const k = scale || 1;
    return {
      name: `先代の${who.name}`, tplId: who.tplId, race: who.race, role: "brute", icon: "🏅",
      hp: Math.round(model.hp * 1.3 * k), atk: Math.round(model.atk * 1.2 * k),
      def: Math.round(model.def * 1.1 * k), spd: model.spd,
      traits: [], captain: { id: "hall:" + who.name, offer: null }
    };
  },

  // 場所の札の見た目と印（docs/SPEC_TERRITORY_A_2026-09-15.md §2-2）。
  // 型（invade / raid / suppress / patrol）はそのまま使い、どこで誰と戦うかだけ差し替える。
  // 征服度は決着ごとに Territory.conquestOf で写すので、札では進めない（conquestDelta 0）。
  dressPlaceMission(mission, type, place) {
    const kinds = typeof Territory !== "undefined" ? Territory.kinds() : {};
    const kind = kinds[place.kind] || null;
    const raid = type.id === "raid";
    const patrol = type.id === "patrol";
    const tribe = !patrol && typeof Territory !== "undefined" && Territory.isTribe(place.id);
    mission.territoryId = patrol ? null : place.id;
    mission.territoryMode = patrol ? "patrol" : raid ? "raid" : "take";
    mission.territoryKind = place.kind || null;
    mission.territoryLine = kind ? kind.line : (tribe ? "従えれば、その種族が応募に来る" : "");
    mission.conquestDelta = 0;
    if (patrol) {
      mission.missionTitle = "領内を巡回する";
      mission.region = "領内";
      mission.army = place.army || "辺境のパトロール隊";
      return mission;
    }
    mission.missionTitle = raid ? `${place.name}を略奪する` : tribe ? `${place.name}を従える` : `${place.name}を落とす`;
    mission.region = place.name;
    mission.army = tribe
      ? `${place.name}の群れ`
      : `${place.name}の守備隊`;
    mission.strategyLabel = raid ? "資金・食料を補給" : tribe ? "仲間を増やす" : "領土を広げる";
    mission.strategyHint = raid
      ? "落とさずに奪って帰る。次に来たときの守りは硬くなる。"
      : mission.territoryLine;
    return mission;
  },

  selectMission(index) {
    const st = this.state;
    if (st.phase !== "mission") return false;
    const mission = st.missionOffers[index];
    if (!mission) return false;
    // 贈る（docs/SPEC_TERRITORY_A_2026-09-15.md §2-2）。戦わない札なので、
    // 選んだ時点で支払いまで済ませて作戦会議へ戻る（出撃の画面へは進まない）。
    if (mission.missionKind === "tribute") return this.payTribute(mission);
    st.selectedMission = JSON.parse(JSON.stringify(mission));
    st.payrollPolicy = "regular";
    st.lastPayrollReport = null;
    st.phase = "formation";
    this.save();
    return true;
  },

  // 贈って従える。払えなければ何も起きない（札は残る）。決着は1つ進む。
  payTribute(mission) {
    const st = this.state;
    const cost = mission.tributeCost || { gold: 0, food: 0 };
    if ((st.gold || 0) < cost.gold || (st.food || 0) < cost.food) return false;
    st.gold -= cost.gold;
    st.food -= cost.food;
    Territory.take(st, mission.territoryId);
    st.conquest = U.clamp(Territory.conquestOf(st), 0, this.MAX_CONQUEST);
    st.turn = (st.turn || 0) + 1;
    st.lastTribute = { id: mission.territoryId, name: mission.region, gold: cost.gold, food: cost.food };
    this.prepareMissions(true);
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
    st.lateBloomerHint = null;     // 採用画面の一行（モルモの遅咲きのほのめかし）は面接を閉じたら消える
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
      test: r => (r.townLevels || 0) === 0,
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
    const lands = typeof Territory !== "undefined" ? Territory.effects(this.state).applicants : 0;   // 集落・町
    return U.clamp(3 + this.departmentOutput().recruit + bonus + renown + lands, 3, 8);
  },

  genApplicants() {
    const st = this.state;
    st.applicants = [];
    const n = this.applicantCount();
    // 従えた部族の種族は、応募の列に1人ずつ混ざる（docs/SPEC_TERRITORY_A_2026-09-15.md §2-3）。
    const races = typeof Territory !== "undefined" ? Territory.effects(st).recruit.slice(0, n) : [];
    for (let i = 0; i < n; i++) st.applicants.push(this.rollApplicant(races[i] || undefined));
    if (st.incidentApplicants?.length) { st.applicants.push(...st.incidentApplicants); st.incidentApplicants = []; }
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
          // 階級は2段になった（2026-09-13）。廃止した階級で残っている記録は兵卒に丸める。
          formerRankId: PROMOTION_RANKS.some(r => r.id === legacy.rankId) ? legacy.rankId : "soldier"
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
    const pool = this.templates();
    const weights = pool.map(t => {
      let w;
      // 中盤から来る種族（マンドラゴラ・堕騎士）。tier の重みの前に、征服度で門を閉める。
      // データ側（monsters.js の minConquest）が持つので、種族を足しても run.js は触らない。
      if (t.minConquest && (Number(st.conquest) || 0) < t.minConquest) return 0;
      // 低ティアはレベル5以上で来ること自体が珍しくなる（2 → 1）。
      // 珍しくするのは「来たときに歴戦の顔をしている」ための下ごしらえ。
      if (t.tier === 1) w = level <= 3 ? 6 : (level <= 4 ? 2 : 1);
      else if (t.tier === 2) w = level <= 2 ? 2 : 5;
      else w = level <= 2 ? 0.5 : (level <= 4 ? 2 : 5);
      // 第二幕の新顔は、来たことが分かる程度に寄せる（tier 3 と同じ枝のままで少し重く）
      if (t.tier >= 4 && (st.act || 1) >= 2) w *= 1.5;
      // 珍しい種族（堕騎士は他の tier3 の半分）。tier の枝の**あと**に掛けるので、
      // 段階が上がっても「会えたら嬉しい」の位置のまま薄まらない。
      if (t.rarity) w *= t.rarity;
      if (favored.has(t.id)) w *= 3;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = U.rand() * total;
    let tpl = pool.find(t => t.id === forcedTplId) || pool[0];
    if (!forcedTplId) {
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) { tpl = pool[i]; break; }
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
    // 遅咲き（裏方の職）は採用の時点で決まる。職業欄を書き換えない限り変わらない。
    const lateBloomer = this.LATE_BLOOMER_JOBS.some(word => job.indexOf(word) !== -1);
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
      salary: Math.max(1, Math.round((U.randInt(tpl.salary[0], tpl.salary[1]) + Math.floor(level / 4) - (typeof Town !== "undefined" ? Town.salaryDiscount(st) : 0))
        * (typeof Territory !== "undefined" ? Territory.effects(st).wageMult : 1))),   // 酒場と、落とした町の給与相場
      loyalty: U.randInt(tpl.loyalty[0], tpl.loyalty[1]),
      traits,
      // 技（SKILLS）は誰でも3戦で覚える。採用時は空。
      skills: [],
      // 遅咲き（裏方の職）。戦場では倍かかるが、代わりに城の仕事を1つぶん多くこなす。
      lateBloomer,
      homeBonus: lateBloomer ? U.pick(this.LATE_BLOOMER_FIELDS) : null,
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
      rankId: "soldier",
      spiritMaxBonus: 0,
      epithet: null
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

  // 「こういう奴を寄越せ」と条件を指定して出す有料の求人。
  // 中盤から解禁するのは、序盤に狙い撃ちできると「まず何が出るか見る」段階が消えるため。
  // 条件はシナジーの発火条件と同じ語彙なので、これが爆発を自分で狙う手段になる。
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
  maxArmy() { return this.MAX_ARMY + (typeof Town !== "undefined" ? Town.armyBonus(this.state) : 0) - (this.state?.incidents?.bedReserved || 0); },   // 宿舎
  canHire() { return this.state.roster.length < this.maxArmy(); },

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
    if (typeof m.spirit !== "number") m.spirit = this.spiritRules().start;
    this.applyLore(m);
    if (!Array.isArray(m.relicIds)) m.relicIds = [];
    // 縁の者が「持って来た」遺物は、採用した時点で本人の物になる（4.2）。
    // それ以外の受け渡しは編成画面の蔵で魔王が決裁する（自動では渡さない）。
    if (m.relicId) { const relicId = m.relicId; delete m.relicId; this.giveRelic(relicId, m.uid); }
    st.maxArmySize = Math.max(st.maxArmySize || 0, st.roster.length);
    if (st.activeUids.length < this.MAX_DEPLOY) st.activeUids.push(m.uid);
    st.raceCounts[m.race] = (st.raceCounts[m.race] || 0) + 1;
    if (m.tplId && !st.recruitedTplIds.includes(m.tplId)) st.recruitedTplIds.push(m.tplId);
    this.trace("hired", m.uid, null, { day: st.day, lore: !!m.loreSkill });
    // 採用後も面接は閉じない。次の候補を見て、追加紹介料を払うか自分で終了する。
    if (this.canHire()) {
      st.rerollsThisPhase = 0;   // 新しい面接なので広告費もリセット
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
    this.trace(cause, monster.uid, null, cause === "fallen" ? { army: entry.army } : {});
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
    const tpl = this.templates().find(t => t.id === monster.tplId) || {};
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
  // 裏方の職。戦場では遅れて咲くが、城では1つぶん多く働く（仕様4節）。
  // 職業欄の部分一致で見る（既存の職業名を変えずに拾えるようにしてある）。
  LATE_BLOOMER_JOBS: ["会計", "倉庫", "広報", "伝令", "受付", "経理", "備品", "配達"],
  // 技へ移した種族固有の癖（仕様 2026-09-12 の1節）。TRAITS からは**消さない**
  // （敵・遺物・旧セーブの魔界史が参照する）。名簿から外すのは migrateState だけ。
  MOVED_TO_SKILL: ["brute", "pickpocket", "fireball", "guardian_prayer", "mischief",
    "allure", "charge", "regen", "slime_body", "bone", "necromancy"],
  // 遅咲きの倍率。仕様は「3→6、8→12」なので、種族技は2倍、上位技は1.5倍。
  // （どちらも2倍にすると上位技が16戦になり、ランの戦闘数（今14〜20）を超えて一生来ない）
  LATE_BLOOMER_MULT: { species: 2, order: 1.5 },

  skillRules() {
    const rules = (typeof SKILL_RULES !== "undefined" && SKILL_RULES) || {};
    return {
      speciesUnlockBattles: rules.speciesUnlockBattles !== undefined ? rules.speciesUnlockBattles : 3,
      unlockBattles: rules.unlockBattles !== undefined ? rules.unlockBattles : 8,
      growthPerBattle: rules.growthPerBattle !== undefined ? rules.growthPerBattle : 0.025,
      growthCapBattles: rules.growthCapBattles !== undefined ? rules.growthCapBattles : 12
    };
  },

  // 遅咲きか（履歴書の職業欄で決まる。採用時に決めて monster.lateBloomer に控える）。
  isLateBloomer(monster) {
    if (!monster) return false;
    if (typeof monster.lateBloomer === "boolean") return monster.lateBloomer;   // 採用時に決めた値が正
    const job = monster.job || "";
    return this.LATE_BLOOMER_JOBS.some(word => job.indexOf(word) !== -1);
  },
  // その者が技を覚えるまでの戦闘数。遅咲きは倍かかる（3→6、8→12）。
  unlockBattlesFor(monster, key) {
    const rules = this.skillRules();
    const species = key === "species";
    const raw = species ? rules.speciesUnlockBattles : rules.unlockBattles;
    const base = this.isLateBloomer(monster) ? Math.round(raw * this.LATE_BLOOMER_MULT[species ? "species" : "order"]) : raw;
    const lab = typeof Town !== "undefined" ? Town.unlockBonus(this.state, key) : 0;   // 研究所
    return Math.max(1, base - lab - (species ? (monster.incidentLearnBonus || 0) : 0));
  },
  // 遅咲きが代わりに持つ内政の伸び。採用時に決めて monster.homeBonus に控える。
  // Aptitude（departments.js）は種族と職業だけを見るので、加算はこちら側で行う。
  LATE_BLOOMER_FIELDS: ["food", "material", "recruit"],
  homeBonusOf(monster) {
    const key = monster && monster.homeBonus;
    return this.LATE_BLOOMER_FIELDS.includes(key) ? key : null;
  },
  // 留守番の貢献。Aptitude に遅咲きの +1 を足す唯一の入口。
  contributionOf(monster, deptId) {
    const c = Aptitude.contribution(monster, deptId);
    const key = this.homeBonusOf(monster);
    if (key && c[key] !== undefined && DEPARTMENT_ID(deptId) !== "combat") c[key] += 1;
    return c;
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

  // 小成長。基礎値の 2.5%／戦、12戦で頭打ち（合計 +30%）。
  //
  // **何戦出たかではなく、その数値を使った戦いの数で伸びる**（2026-09-14）。
  // 殴れば攻撃と速さ、守れば防御、殴られれば HP。使わなかった数値は伸びない。
  // 「伸びた戦い」の数は `record.grow` が持ち、加算は tallyBattleRecords で行う。
  //
  // 仕様は「毎回 base から現在値を組み直す」だが、**差分だけを足す**形にした。
  // 城内事件は HP を恒久的に減らす（`events.js` の負傷）ので、組み直すとその傷が
  // 黙って治ってしまう。差分方式でも二重加算は起きない（積んだ量を `m.grown` が覚えている）。
  // 戻り値は伸びた分の `{ uid, key, delta }` の配列（決着の読み上げが読む）。
  applyGrowth(monster) {
    if (!monster || monster.mercenary) return [];
    const rules = this.skillRules();
    const base = this.baseOf(monster);
    const grow = this.memberRecord(monster).grow;
    const gained = [];
    for (const key of this.GROW_KEYS) {
      const steps = Math.min(grow[key] || 0, rules.growthCapBattles);
      const target = Math.round((base[key] || 0) * rules.growthPerBattle * steps);
      const delta = target - (monster.grown[key] || 0);
      if (!delta) continue;
      monster[key] = Math.max(key === "def" ? 0 : 1, (monster[key] || 0) + delta);
      monster.grown[key] = target;
      if (delta > 0) gained.push({ uid: monster.uid, name: monster.name, key, delta });
    }
    return gained;
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
    // 1段目がテンプレートから消えた種族（怪力などは技へ移った。仕様 2026-09-12）でも、
    // **種族が合えば覚える**。replaces を持っていることは条件ではない。
    for (const key of Object.keys(TRAITS)) {
      const skill = TRAITS[key].skill;
      if (skill && skill.tier === 2 && skill.species === monster.tplId) return { id: key, ...TRAITS[key] };
    }
    return null;
  },

  // 種族技（SKILLS）。3戦で誰でも覚える。上位技（TRAITS）と違って伝承は要らない。
  speciesSkillFor(monster) {
    if (!monster || monster.mercenary || !monster.tplId) return null;
    if (typeof SPECIES_SKILL === "undefined" || typeof SKILLS === "undefined") return null;
    const id = SPECIES_SKILL[monster.tplId];
    if (!id || !SKILLS[id]) return null;
    if ((monster.skills || []).includes(id)) return null;     // もう覚えている
    return { id, ...SKILLS[id] };
  },
  checkSpeciesSkill(monster, notes) {
    if (!monster || monster.mercenary) return null;
    const battles = this.memberRecord(monster).battles || 0;
    if (battles < this.unlockBattlesFor(monster, "species")) return null;
    // 研究所が生んだもの＝研究所が無ければまだ覚えていなかった本数（詳細画面が読む）
    if (typeof Town !== "undefined" && battles < this.unlockBattlesFor(monster, "species") + Town.unlockBonus(this.state, "species")
      && this.speciesSkillFor(monster)) Town.stat(this.state, "lab", 1);
    const skill = this.speciesSkillFor(monster);
    if (!skill) return null;
    monster.skills = (monster.skills || []).concat(skill.id);
    if (notes) notes.push(`${monster.name}が技【${skill.name}】を覚えた。次から指示で出せる`);
    return { uid: monster.uid, name: monster.name, skillId: skill.id, skillName: skill.name, species: true };
  },

  // 上位技の解放。1段目（種族固有特性）が上位技に**置き換わる**。
  // 遺物由来の特性・癖・共通特性はそのまま（replaces が指す id だけが消える）。
  // 傭兵は育たない（金で雇った一時要員に軍団の経験は乗らない）。
  // 種族の伝承。軍団が既に知っている技を、採用した新入りに乗せる（1段目を置き換え、お披露目付き）。
  loreSkillFor(monster) {
    const st = this.state;
    if (!monster || !st.skillLore || !monster.tplId) return null;
    const id = st.skillLore[monster.tplId];
    if (!id || !TRAITS[id]) return null;
    if ((monster.traits || []).some(t => ((TRAITS[t] || {}).skill || {}).tier === 2)) return null;
    if (!(monster.traits || []).includes(TRAITS[id].skill.replaces)) return null;   // 1段目を持っていない者には乗らない
    return { id, ...TRAITS[id] };
  },
  applyLore(monster, notes) {
    const skill = this.loreSkillFor(monster);
    if (!skill) return null;
    monster.traits = (monster.traits || []).filter(t => t !== skill.skill.replaces);
    monster.traits.push(skill.id);
    monster.skillTier = 2;
    monster.debutSkill = skill.id;
    monster.loreSkill = true;
    if (notes) notes.push(`${monster.name}は軍団の伝承で【${skill.name}】を心得ている`);
    return skill;
  },

  checkSkillUnlock(monster, notes) {
    if (!monster || monster.mercenary) return null;
    const st = this.state;
    const rules = this.skillRules();
    if ((this.memberRecord(monster).battles || 0) < this.unlockBattlesFor(monster, "order")) return null;
    const skill = this.nextSkillFor(monster);
    if (!skill) return null;
    const replaced = skill.skill.replaces;
    monster.traits = (monster.traits || []).filter(id => id !== replaced);
    monster.traits.push(skill.id);
    monster.skillTier = 2;
    // 種族の伝承（2026-09-11）。一度誰かが覚えた技は軍団の知恵になり、同じ種族の新入りは覚えた状態で来る
    // （戦死で6戦のカウンタが消えても、種族の技は消えない）。
    st.skillLore = st.skillLore || {};
    if (skill.skill && skill.skill.species) st.skillLore[skill.skill.species] = skill.id;
    // 覚えた直後の戦い＝お披露目。手で戦うなら指示窓でその技が光り、一度だけ気合なしで撃てる
    // （おまかせ・sim では今までどおり勝手に1回出る。2026-09-12）。
    monster.debutSkill = skill.id;
    const quote = U.pick((skill.lines && skill.lines.unlock) || ["……体が、覚えた"]);
    if (notes) notes.push(`${monster.name}が【${skill.name}】を覚えた（次の戦いでは気合なしで一度撃てる。窓で光る）`);
    return { uid: monster.uid, name: monster.name, skillId: skill.id, skillName: skill.name, quote };
  },

  // 一戦の決着ごとに、出撃した者を育てる。
  // **settleContinue と settleRetreat の両方から呼ぶ。** deploy() の途中に書くと
  // 引数なし呼び出し（sim・テスト）と UI 経由（offerRetreat）で結果がずれる。
  // 数えるのは contribution の uid（出撃した者だけ。留守番は育たない）。
  // 軍の2施設が生んだもの（巨大厨房＝強めた食事の回数、墓地＝呼び戻した骸骨の数）。
  // battle.js が出す facility_trigger の要約だけを読む（battle.js は触らない）。
  tallyFacilityStats(summary) {
    if (typeof Town === "undefined" || !summary) return;
    for (const f of summary.facilities || []) {
      if (f.facilityId === "graveyard") Town.stat(this.state, "graveyard", f.summons || 0);
      else if (f.facilityId === "grand_kitchen") Town.stat(this.state, "grand_kitchen", f.count || 0);
    }
  },

  trainSurvivors(contribution, notes) {
    const st = this.state;
    const unlocked = [];
    // 伸びた数値は決着の画面が一行ずつ読み上げる（docs/SPEC_SKILL_CALL_AND_GROWTH_DISPLAY 2節）。
    st.lastGrowth = [];
    for (const row of contribution || []) {
      if (row.mercenary) continue;
      if (row.survived === false) continue;      // この戦いで戦死した者は育たない
      const monster = st.roster.find(m => m.uid === row.uid);
      if (!monster) continue;
      const species = this.checkSpeciesSkill(monster, notes);
      if (species) unlocked.push(species);
      const gained = this.checkSkillUnlock(monster, notes);
      if (gained) unlocked.push(gained);
      st.lastGrowth.push(...this.applyGrowth(monster));
    }
    return unlocked;
  },

  // 経験で身につく共通特性（頑丈・しぶとい・担がれ慣れ・城の主）。
  // 定義は traits.js の `earned: { counter, at, unless }`。**id をベタ書きしない**
  // （特性が増えたら勝手に追従する）。応募者には付かない（traitPool には入れない）。
  //
  // 判定は決着ごとに**名簿全員**へ。留守番も対象にしないと城の主が永久に育たない。
  // 1決着につき1人1つまで（同じ戦いで二つ身につくのは、出来事として多すぎる）。
  grantExperienceTraits(notes) {
    const st = this.state;
    const earnable = Object.keys(TRAITS).filter(id => TRAITS[id].earned);
    const earned = [];
    for (const monster of st.roster) {
      if (monster.mercenary) continue;
      const record = this.memberRecord(monster);
      const traits = monster.traits || (monster.traits = []);
      for (const id of earnable) {
        if (traits.includes(id)) continue;
        const rule = TRAITS[id].earned;
        if ((record[rule.counter] || 0) < rule.at) continue;
        if (rule.unless && (record[rule.unless] || 0) !== 0) continue;
        traits.push(id);
        const quote = U.pick((TRAITS[id].lines && TRAITS[id].lines.earned) || ["……体が、覚えた"]);
        if (notes) notes.push(`${monster.name}は【${TRAITS[id].name}】になった`);
        earned.push({ uid: monster.uid, name: monster.name, traitId: id, traitName: TRAITS[id].name, quote });
        break;   // 1決着につき1人1つまで
      }
    }
    return earned;
  },

  // 個人カウンタ。痕跡の器（src/core/traces.js、別仕様）が入るまでのつなぎ。
  // 旧セーブには無いので、読むときに必ずここを通して補う。
  // 成長の器（docs/SPEC_GROWTH_BY_ACTION_2026-09-14.md）。数値ごとに「伸びた戦い」の数を持つ。
  // 旧セーブには無いので、**そのときは戦闘数を4つに写す**（それまでの伸びを失わせない）。
  GROW_KEYS: ["hp", "atk", "def", "spd"],
  memberRecord(monster) {
    if (!monster) return { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 };
    if (!monster.record) monster.record = { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0, homeStays: 0 };
    for (const key of ["battles", "wins", "downed", "carried", "late", "ate", "homeStays"]) {
      if (typeof monster.record[key] !== "number") monster.record[key] = 0;
    }
    if (!monster.record.grow || typeof monster.record.grow !== "object") {
      const battles = monster.record.battles || 0;
      monster.record.grow = { hp: battles, atk: battles, def: battles, spd: 0 };
    }
    for (const key of this.GROW_KEYS) {
      if (typeof monster.record.grow[key] !== "number") monster.record.grow[key] = 0;
    }
    return monster.record;
  },

  // 一戦の決着ごとに、出撃した者のカウンタを進める。
  // **settleContinue と settleRetreat の両方から呼ぶ。** deploy() の途中に書くと
  // 引数なし呼び出し（sim・テスト）と UI 経由（offerRetreat）で結果がずれる。
  // retreated のときは contribution が提案時点のもの（担がれた者に injured）。
  // 気合（号令の限定）の規則。data に置く（MONSTER_RULES.spirit）。
  spiritRules() {
    const r = (typeof MONSTER_RULES !== "undefined" && MONSTER_RULES.spirit) || {};
    const bonus = typeof Town !== "undefined" && this.state ? Town.spiritMaxBonus(this.state) : 0;   // 鍛冶場
    return { start: r.start ?? 1, max: (r.max ?? 3) + bonus, perBattle: r.perBattle ?? 1, perHomeTurn: r.perHomeTurn ?? 2 };
  },
  gainSpirit(monster, amount) {
    if (!monster) return;
    const rules = this.spiritRules();
    const before = typeof monster.spirit === "number" ? monster.spirit : rules.start;
    monster.spirit = U.clamp(before + amount, 0, rules.max);
  },

  tallyBattleRecords(contribution, won) {
    const st = this.state;
    for (const row of contribution || []) {
      if (row.mercenary) continue;
      const monster = st.roster.find(m => m.uid === row.uid);
      if (!monster) continue;              // 既に戦死で名簿から消えた者は数えない
      const record = this.memberRecord(monster);
      // 出撃して決着を迎えた者は気合が +1（戦死者はここに来る前に名簿から消えている）。
      this.gainSpirit(monster, this.spiritRules().perBattle);
      // お披露目の戦いは終わった。以後、上位技は号令でだけ出る（この後の trainSurvivors が新しい技を置くこともある）。
      if (monster.debutSkill) monster.debutSkill = null;
      record.battles += 1;
      if (won) record.wins += 1;
      if (row.survived === false || row.injured) record.downed += 1;
      if (row.injured) record.carried += 1;
      if (row.late > 0) record.late += 1;
      // その戦いで使った数値だけが伸びる（1戦で各 +1 まで）。
      // 技は当面「たたかう」と同じ扱い（仕様2節の表）。食べるでは伸びない。
      //
      // **手番の記録が空の戦果もある**ときの保険：撤退の提案で作る戦果が
      // `summarizeContribution` を actions 抜きで呼んでいた（battle.js 側で修正済み。
      // 2026-09-15）。古い保存や別経路で全部 0 のまま届いた場合に備えて残してある。
      // そのときは残っている数字から読める分だけ数える＝**与ダメージがあれば殴っている**。
      // 守りは数字に残らないので数えない（無い行動をでっち上げない）。
      const acts = row.actions || {};
      const recorded = (acts.attack || 0) + (acts.guard || 0) + (acts.skill || 0) + (acts.eat || 0) + (acts.cover || 0);
      const attacked = recorded > 0 ? (acts.attack || 0) + (acts.skill || 0) >= 1 : (row.dealt || 0) > 0;
      if (attacked) { record.grow.atk += 1; record.grow.spd += 1; }
      if ((acts.guard || 0) + (acts.cover || 0) >= 1) record.grow.def += 1;
      if ((row.taken || 0) > 0) record.grow.hp += 1;
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

  // 慰留（2026-09-12）。去りかけ（leaving）か忠誠が低い者に、給与2回分の慰留金で忠誠を戻す。
  RETAIN_LOYALTY: 30,
  RETAIN_THRESHOLD: 20,
  retainCost(monster) { return Math.max(3, (monster.salary || 0) * 2); },
  canRetain(monster) {
    return !!monster && !monster.mercenary && (monster.leaving || monster.loyalty <= this.RETAIN_THRESHOLD) && this.state.gold >= this.retainCost(monster);
  },
  retain(uid) {
    const st = this.state;
    const m = st.roster.find(x => x.uid === uid);
    if (!this.canRetain(m)) return false;
    const cost = this.retainCost(m);
    st.gold -= cost;
    m.loyalty = U.clamp(m.loyalty + this.RETAIN_LOYALTY, 0, 100);
    m.leaving = false;
    m.unpaid = false;
    m.unpaidStreak = 0;
    // 痕跡の種類は17で打ち止め（Traces.MAX_KINDS）なので、慰留は痕跡にしない。日誌の notes だけ
    this.save();
    return { cost, loyalty: m.loyalty };
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
    // 食事の伝票は倍率を掛ける前に一度だけ作り、戦闘入力・戦果・予告で同じものを読む（V2a）
    const mealPlan = battleRations ? this.mealPlan(battleRations) : null;
    const playerUnits = this.preparedRoster(battleRations, mealPlan).map(m => Battle.makeUnit(m, "player"));
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
      // 宴は撤去した（docs/TICKET_REMOVE_DEAD_2026-09-16.md §1-1）。
      // battle.js がまだこの鍵を読むので、null 固定で残してある（読む側の削除は別のコミット）。
      feastUid: null,
      // V2a: 食事強化の起点・対象・効果量。battle.js はまだ読んでいないが、
      // 追加フィールドは無視されるだけで発火順・回数・chainDepth を変えない。
      // 因果イベントとして出すのは V2b（battle.js 側）の仕事。
      meal: mealPlan,
      // 食べる（2026-09-14）：戦闘中に携行食を1つ食べて HP を戻す。
      // spare は**前払いを済ませたあとの備蓄**（これ以上は食べられない）。
      // kitchenLv は巨大厨房（Lv2 で回数 +1、Lv3 で回復量が増える）。
      // 食べた数は result.rationsEaten で返り、決着で st.food から引く。
      spare: Math.max(0, Number(st.food) || 0),
      kitchenLv: typeof Town !== "undefined" ? Town.lv(st, "grand_kitchen") : 0,
      boostSourceUid: mealPlan ? mealPlan.cookUid : null,
      boostTargetUid: mealPlan ? mealPlan.targetUid : null,
      boostAmount: mealPlan ? mealPlan.boost : 0
    } : null;
    // 恐喝帳簿は廃止（2026-09-13）。エンジン側の発火コードは残っているが、run.js が渡さないので眠る。
    const extortionLedger = false;
    const graveyard = this.facilityReady("graveyard");
    // 前回出撃との差分（R2）。戦闘へ入る前の確定値で撮る。
    // 戦闘の結果は一切見ないので、「変えたから勝った」の材料にはならない。
    const buildSnapshot = this.buildSnapshot(stageData);
    const buildChanges = this.buildChanges(st.lastBuildSnapshot, buildSnapshot);
    st.lastBuildSnapshot = buildSnapshot;
    const simOptions = {
      rations: rationContext, extortionLedger, graveyard, facilityWorks: this.facilityWorks(),
      synergyPool: this.synergyPool(), chainDefVersion: Chain.versionOf(st),
      // 未決U1の既定：開幕3日間の防衛戦では退けない（城を明け渡す意味になるので、
      // 防衛戦の撤退はLPの仕様と一緒に決める）。遠征では提案する。
      noRetreatOffer: openingBattle,
      // 号令（UI だけ）。節目で止めて名指しで命じる。答えを受けたら同じ種で計算し直すので、
      // 戦闘の入力（ユニットと選択肢）を計算前の姿で取っておく。sim・テストは今までどおり。
      offerOrder: !!options.offerRetreat && !openingBattle,
      seed: options.offerRetreat ? Math.floor(U.rand() * 2147483647) : undefined,
      // 痕跡・遺物・去った者。技の派生行動（skill_effects.js）が読む。戦闘計算の既定では使わない
      traces: st.traces || [], relics: st.relics || [], departed: st.departed || [],
      spiritMax: this.spiritRules().max
    };
    // コマンドバトル（UI の既定、2026-09-11）。指示を受けながらラウンドごとに解決するので、ここでは計算しない。
    // 決着は finishManualBattle()。リロードで戻ったときは replay からおまかせで計算して続行として決着する。
    if (options.manual) {
      simOptions.offerOrder = false;
      simOptions.seed = Math.floor(U.rand() * 2147483647);
    }
    const replay = (simOptions.offerOrder || options.manual) ? {
      playerUnits: JSON.parse(JSON.stringify(playerUnits)),
      enemyUnits: JSON.parse(JSON.stringify(enemyUnits)),
      options: JSON.parse(JSON.stringify(simOptions))
    } : null;
    if (options.manual) {
      const handle = Battle.start(playerUnits, enemyUnits, simOptions);
      const pending = {
        result: null, stageData, notes, battleRations, mealPlan, openingBattle, buildChanges, chainView: null,
        kingMerged, replay, manual: true,
        highlightIds: playerUnits
          .filter(u => (buildChanges && buildChanges.changedUids || []).includes(u.uid))
          .map(u => u.id).filter(Boolean)
      };
      st.pendingBattle = pending;
      st.phase = "battle";
      this.liveBattle = { handle, pending };
      this.save();
      return { handle, notes, stageData, manual: true };
    }
    const result = Battle.simulate(playerUnits, enemyUnits, simOptions);

    const pending = {
      result, stageData, notes, battleRations, mealPlan, openingBattle, buildChanges, chainView: null,
      kingMerged, replay,
      // spotlight は「今回変えた人」の戦闘中IDを要る。playerUnits ごと持ち回ると
      // セーブが太るので、必要な対応だけをここで解いておく。
      highlightIds: playerUnits
        .filter(u => (buildChanges && buildChanges.changedUids || []).includes(u.uid))
        .map(u => u.id).filter(Boolean)
    };
    // 号令の節目がある戦闘は、答えを聞くまで戦闘の中身が確定しない。記録（発見・最大CHAIN・KPI）は
    // 確定してから取る（answerOrder）。それ以外はここで確定させる。
    if (!(options.offerRetreat && result.orderOffer)) this.recordBattleResult(pending);
    // 退く道か号令の節目がある戦闘だけ、UI の求めに応じて決着を保留する。
    // 保留中はラン状態を一切変えない（所持金・名簿・警戒度は答えを聞いてから動く）。
    if (options.offerRetreat && (result.retreatOffer || result.orderOffer)) {
      st.pendingBattle = pending;
      st.phase = "battle";
      this.save();
      return { result, notes, stageData };
    }
    this.settleContinue(pending);
    return { result, notes, stageData };
  },

  // コマンドバトルの決着。UI が取っ手（handle）を最後まで回してから呼ぶ。
  // 退いたなら settleRetreat、それ以外は settleContinue（決着経路は二つのまま）。戻り値はフェーズ名。
  finishManualBattle(result) {
    const st = this.state;
    const live = this.liveBattle;
    const pending = st.pendingBattle;
    if (!pending || !pending.manual) return false;
    const final = result || (live && live.handle && live.handle.result) || null;
    if (!final) return false;
    pending.result = final;
    this.applySpiritChanges(final, pending);
    this.liveBattle = null;
    this.recordBattleResult(pending);
    st.pendingBattle = null;
    if (final.retreated) this.settleRetreat(pending);
    else this.settleContinue(pending);
    return st.phase;
  },

  // 戦闘で動いた気合を名簿へ戻す。戦闘中のユニットは名簿の写しなので、ここで一度だけ反映する。
  // 払った分（技）と高まった分（まもって大技を受けた・味方が倒れた）の両方。
  applySpiritChanges(result, pending) {
    const st = this.state;
    if (!result || (pending && pending.spiritApplied)) return;
    if (pending) pending.spiritApplied = true;
    const find = uid => st.roster.find(x => String(x.uid) === String(uid));
    // 火の粉（見える小さな事故）を痕跡に。札（途中イベント）の材料になる（docs/DESIGN_INCIDENTS_2026-09-14.md 7-1）
    for (const sp of result.sparked || []) {
      const m = find(sp.uid), by = find(sp.byUid);
      if (m) this.trace("sparked", m.uid, by ? by.uid : null, { skill: (typeof SKILLS !== "undefined" && SKILLS[sp.skillId] && SKILLS[sp.skillId].name) || sp.skillId });
    }
    for (const [uid, spent] of Object.entries(result.spiritSpent || {})) {
      const m = find(uid);
      if (m && typeof m.spirit === "number") m.spirit = Math.max(0, m.spirit - spent);
    }
    for (const [uid, got] of Object.entries(result.spiritGained || {})) {
      const m = find(uid);
      if (m) this.gainSpirit(m, Number(got) || 0);        // 上限は spiritRules().max
    }
  },

  // 戦闘の中身が確定したら一度だけ呼ぶ。シナジーの発見・最大戦力・最大CHAIN／OVERKILL・KPI。
  // 号令で計算し直す戦闘では、答えを聞く前の結果で記録を取らない（起きなかった連鎖を刻まない）。
  recordBattleResult(pending) {
    const st = this.state;
    const { result } = pending;
    if (pending.recorded) return;
    pending.recorded = true;
    // 合体は simulate() の前に処理するため、そのままでは通常のシナジー判定に
    // 残らない。タイムラインへ戻すことで、ログ・カットイン・結果表示を揃える。
    const kingSyn = SYNERGIES.find(s => s.id === "king_slime");
    if (pending.kingMerged && kingSyn) this.addMergeSynergy(result, kingSyn);
    this.recordDiscoveredSynergies(result);

    // 最大戦力を記録（魔界史用）
    st.maxPower = Math.max(st.maxPower, this.armyPower(this.activeRoster()));

    // ラン全体の主要記録は最大CHAINと最大OVERKILLの2つだけ（設計憲法 第11節）。
    // 勝敗を問わず更新する。再起で巻き戻したときはチェックポイントごと戻るのが正しい
    // （やり直した歴史の記録は残さない）ので、ここに別のテレメトリは持たない。
    const chainView = Chain.viewOf(result.timeline);
    pending.chainView = chainView;
    const recordedChain = Chain.versionOf(st) >= 2
      ? chainView.maxDepth
      : ((result.chainSummary && result.chainSummary.maxChain) || 0);
    st.maxChain = Math.max(st.maxChain || 0, recordedChain);
    st.maxOverkill = Math.max(st.maxOverkill || 0, (result.overkillSummary && result.overkillSummary.maxPercent) || 0);
    // 「どの条件がどこへ繋がったか」の観測。KPI側で読むだけで、ラン状態には触らない
    // （したがって再起で巻き戻しても消えない＝試した事実として残る）。
    if (typeof KPI !== "undefined") KPI.battleFinished(result);
  },

  // 号令に答える。UI だけが呼ぶ。unitId が null／"none" なら任せる（計算済みの結末のまま）。
  // 名指しなら同じ種・同じ入力で計算し直す。提案の手前までは同じ展開、そこから先だけ分岐する。
  // 戻り値：新しいタイムライン（計算し直した場合）か null（変わらない場合）。
  // 決着は、撤退の提案がまだ後に控えていなければここで行う（settleBattle と同じ二経路）。
  // 節目は戦況が動くたびに来る。答えは pending.orders に積み、名指しのたびに同じ種で計算し直す。
  // 次の提案は計算し直したタイムラインの中から拾う（UI は order_offer に当たるたびにここを呼ぶ）。
  nextOrderOffer(pending) {
    const offers = (pending.result && pending.result.orderOffers) || (pending.result && pending.result.orderOffer ? [pending.result.orderOffer] : []);
    const answered = pending.answeredRounds || {};
    return offers.find(o => !answered[o.round]) || null;
  },
  answerOrder(unitId) {
    const st = this.state;
    const pending = st.pendingBattle;
    if (!pending || !pending.result) return null;
    const offer = this.nextOrderOffer(pending);
    if (!offer) return null;
    pending.answeredRounds = pending.answeredRounds || {};
    pending.answeredRounds[offer.round] = true;
    pending.orders = pending.orders || {};
    let changed = null;
    const chosen = unitId && unitId !== "none" && offer.candidates.some(c => c.unitId === unitId) ? unitId : null;
    if (chosen && pending.replay) {
      const rp = pending.replay;
      const playerUnits = JSON.parse(JSON.stringify(rp.playerUnits));
      const enemyUnits = JSON.parse(JSON.stringify(rp.enemyUnits));
      const orders = Object.assign({}, pending.orders, { [offer.round]: chosen });
      const options = Object.assign({}, rp.options, { orders });
      const result = Battle.simulate(playerUnits, enemyUnits, options);
      // 前半が一致しないなら（乱数の消費が食い違った）、命じなかった結末を使う。黙って別の戦闘にしない。
      const same = result.timeline.length > offer.index
        && pending.result.timeline.slice(0, offer.index).every((e, i) => e.type === result.timeline[i].type);
      if (same) {
        pending.result = result;
        pending.orders = orders;
        pending.ordered = { unitId: chosen, round: offer.round };
        changed = result.timeline;
        // 気合を引く。名指しした瞬間に払う（決着で出撃の +1 が戻るので実質 cost−1）。
        const cand = offer.candidates.find(c => c.unitId === chosen);
        const unit = rp.playerUnits.find(u => u.id === chosen);
        const monster = unit && unit.uid != null ? st.roster.find(m => m.uid === unit.uid) : null;
        if (monster && cand && typeof monster.spirit === "number") monster.spirit = Math.max(0, monster.spirit - (cand.cost || 0));
        if (monster && cand) this.trace("ordered", monster.uid, null, { skill: cand.skillName, round: offer.round });
        st.orderCount = (st.orderCount || 0) + 1;
      }
    }
    // まだ後に提案（撤退か次の号令）が控えていれば決着は待つ。
    const retreatLater = pending.result.retreatOffer && pending.result.retreatOffer.index > offer.index && !pending.retreatAnswered;
    const orderLater = !!this.nextOrderOffer(pending);
    if (!retreatLater && !orderLater) {
      this.recordBattleResult(pending);
      st.pendingBattle = null;
      this.settleContinue(pending);
    } else {
      this.save();
    }
    return changed;
  },

  // 撤退の提案に答える。UI だけが呼ぶ。戻り値は決着後のフェーズ名。
  settleBattle(choice) {
    const st = this.state;
    const pending = st.pendingBattle;
    if (!pending) return false;
    if (choice !== "retreat") {
      // 号令の節目が撤退の提案より後に控えていれば、続行の答えだけ覚えて決着は号令の答えを待つ。
      const offer = this.nextOrderOffer(pending);
      const retreat = pending.result && pending.result.retreatOffer;
      if (offer && retreat && offer.index > retreat.index) {
        pending.retreatAnswered = true;
        this.save();
        return st.phase;
      }
    }
    st.pendingBattle = null;
    if (choice === "retreat") this.settleRetreat(pending);
    else this.settleContinue(pending);
    return st.phase;
  },

  // 続けた場合の決着。**これが唯一の続行経路**（引数なし deploy() もここを通る）。
  // 二つ持つと「テストは通るのに UI からだけ結果が違う」が起きる。
  // 戦闘中に食べた携行食を備蓄から引く（2026-09-14）。**決着の経路2つの両方から1回ずつ**。
  // 蔵から出した分なので、留守番の食事（processDepartments）より前に引く。
  consumeBattleRations(result, notes) {
    const st = this.state;
    const eaten = Math.max(0, Number(result && result.rationsEaten) || 0);
    if (!eaten) return 0;
    st.food = Math.max(0, (Number(st.food) || 0) - eaten);
    if (notes) notes.push(`戦闘中に携行食を${eaten}つ食べた（備蓄 ${st.food}）`);
    return eaten;
  },

  settleContinue(pending) {
    const st = this.state;
    this.applySpiritChanges(pending && pending.result, pending);
    this.recordBattleResult(pending);   // 号令で保留した戦闘はここで初めて確定する（済んでいれば何もしない）
    const { result, stageData, notes, battleRations, mealPlan, openingBattle, buildChanges, chainView } = pending;
    this.consumeBattleRations(result, notes);
    this.settleCaptains(stageData, result, notes);   // 敵将：討った・見逃した・雇った
    // 城下町：防衛戦に負けた決着は税収が無い（processDepartments が読む）。勝ちも遠征も false
    st.lastRansacked = this.isDefenseBattle(stageData) && !result.victory;
    const goldBefore = st.gold;
    const lootGold = Math.max(0, Number(result.resourceChanges && result.resourceChanges.gold) || 0);
    // 判定負け（30ラウンド経過。全滅ではない）は撤退と同じ結末にする。
    // 倒れていた者は担いで帰り、報酬は無い。**決着の経路は二つのまま**
    // （ここで委譲する。カウンタと育成を二度走らせないよう tally より前で分ける）。
    // 訓練（2026-09-13）：誰も死なない。HP0 は負傷に変えてから先へ進める。
    // 全滅も「全員が負傷して終わった稽古」なので、判定負けの委譲より前に変換する。
    const training = this.isTraining(stageData);
    const freeTraining = training && st.incidents?.freeTraining;
    if (training) this.softenTrainingCasualties(result.contribution);
    if (!training && !result.victory && !this.wipeOf(result)) return this.settleRetreat(pending, { lostOnPoints: true });
    if (mealPlan?.boost > 0 && mealPlan.cookUid != null) this.trace("cooked", mealPlan.cookUid, null, { facility: this.facilityLv("grand_kitchen") > 0 ? "grand_kitchen" : null });
    // 個人カウンタは名簿が動く前に進める（戦死で消えた者を数え損なわないため）。
    this.tallyBattleRecords(result.contribution, result.victory);
    // 痕跡（担がれ・戦友の死）は訓練では立てない（4節の落とし穴）。
    if (!training) this.recordBattleTraces(result, result.contribution);
    if(stageData.missionKind==="invade" && this.state.incidents?.intel) {this.state.incidents.intel=false;if(this.state.incidents.letterEnemy)notes.push("王国の連絡兵が、敵の列からハーピーに手を振った。");}
    this.recordStageFight(stageData);
    // 育成はカウンタの直後。出撃した者だけが技を覚え、少し伸びる。
    const unlocked = this.trainSurvivors(result.contribution, notes);
    let wipedFallen = null, wipedRelics = null;
    // 幕替わり（表示用）。起きなかった決着・旧セーブには無い。
    let actAdvance = null;
    // 防衛戦（王国の反撃）。勇者戦かどうかは段階で決まる。
    const isDefense = this.isDefenseBattle(stageData);
    const heroDefense = isDefense && (st.counterattack || {}).kind === "hero";
    let defenseOutcome = null, castleFell = false;
    if (training) {
      // 稽古。金・建材・遺物・痕跡・税・警戒度はどれも動かない（勝ち負けも問わない）。
      // 動くのは戦闘数（上で済み）・小成長と技（trainSurvivors で済み）・戦功・忠誠・気合・食料・給与。
      this.awardTrainingMerit(result.contribution, stageData, notes);
      st.turn += 1;
      st.missionOffers = [];
      st.phase = "result";
      // 留守番の仕事と食事・給与（半額）は通常どおり通す。税収だけ 0（processDepartments が読む）。
      this.processDepartments(stageData, notes, undefined, battleRations);
      this.paySalaries(notes, undefined, stageData);
      this.processDepartures(notes);
      this.settleDebts(notes);
      if(freeTraining) {delete st.incidents.freeTraining;notes.push("研究所が今回の稽古代と食料を受け持った。");}
    } else if (result.victory) {
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
        this.trace("defended", null, null, { army: stageData.army });
        if (heroDefense) st.heroCame = true;
        st.counterattack = null;
      } else {
        this.applyMissionOutcome(stageData, notes);
      }
      this.advanceOutpost(stageData, true, notes);
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
      } else if (heroDefense || st.conquest >= this.MAX_CONQUEST) {
        // 幕の着地。魔王城で勇者を退けた（待った）か、王都まで落とした（攻めた）か。
        // **最後の幕でなければ、ランは終わらずに次の幕が始まる。**
        st.clearedBy = heroDefense ? "defense" : "conquest";
        if ((st.act || 1) < this.MAX_ACT) {
          actAdvance = this.beginAct((st.act || 1) + 1, st.clearedBy, notes);
          st.phase = "result";
          this.genApplicants();        // 新しい顔を見せる（未決U1の既定）
        } else {
          st.phase = "clear";          // 記録の確定は deploy() の末尾でまとめて行う
        }
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
      this.advanceOutpost(stageData, false, notes);
      // 留守番の仕事と手当は続く。城は落ちていない。
      // 出撃隊は死んでいるので給与は発生しない（paySalaries は名簿を見るが、もう外れている）。
      if (!openingBattle) {
        this.processDepartments(stageData, notes, undefined, battleRations);
        this.paySalaries(notes);
        this.processDepartures(notes);
      }
      if (this.isDefenseBattle(stageData)) {
        defenseOutcome = { ransacked: this.ransack(notes) };
        this.trace("ransacked", null, null, { army: stageData.army });
        const rules = this.counterRules();
        st.alert = Math.max(0, st.alert - Math.floor(rules.threshold / 2));
        st.defenses = st.defenses || { won: 0, lost: 0 };
        st.defenses.lost += 1;
        st.counterattack = null;
        if (heroDefense) { castleFell = true; this.castleFalls(notes); }
      }
      st.turn += 1;
      st.missionOffers = [];
      st.wipeCount = (st.wipeCount || 0) + 1;
      // 再起（時の巻き戻し）は「軍団が空で、雇う金も無い」ときの最後の手段だけに縮めた。
      // それ以外の全滅は通常の流れへ戻り、面接で建て直す。勇者に負けても同じ（2026-09-11）。
      if (this.canRebuild()) {
        st.phase = "result";
        this.genApplicants();
      } else {
        st.phase = "defeat";
      }
    }

    // ツケの取り立ては勝敗を問わない。負ければ踏み倒せるなら、
    // ツケは「判断」ではなく「わざと負ければ消える抜け道」になる。
    this.settleDebts(notes);

    // 経験で身につく共通特性は、この決着でカウンタが全部動いたあとに判定する。
    // 仕様は「trainSurvivors の直後」だが、そこだと processDepartments がまだ
    // homeStays を足しておらず、城の主だけ1決着ぶん遅れる。
    const earnedTraits = this.grantExperienceTraits(notes);

    st.lastBattle = {
      victory: result.victory,
      // 経験で身についた共通特性（表示用）。身につかなかった決着・旧セーブには無い。
      earned: earnedTraits,
      // 戦闘中に高まった気合（表示用。まもって大技を受けた／仲間が倒れた）。
      spiritGained: (result && result.spiritGained) || null,
      // 幕替わり（表示用）。結果画面とモルモの報告が読む。
      actAdvance,
      // 防衛戦（王国の反撃）の結末（表示用）。
      defense: isDefense,
      castleFell,
      defended: !!(defenseOutcome && defenseOutcome.defended),
      ransacked: (defenseOutcome && defenseOutcome.ransacked) || null,
      // 出撃隊の全滅（表示用）。戻らなかった者と、蔵に残った品。
      wiped: !!wipedFallen,
      fallen: wipedFallen || [],
      relicsLeft: wipedRelics || [],
      // この戦いで技を覚えた者（表示用）。覚えた者がいない戦い・旧セーブには無い。
      unlocked,
      // 稽古（2026-09-13）。結果画面はこの印で文言を変える。
      training,
      trainingDown: training
        ? (result.contribution || []).filter(c => c.trainingDown).map(c => c.name) : [],
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
      summonCount: result.summonCount || 0,
      // 施設は「誰の手柄か」を個人へ付けない代わりに、戦果へ短い要約として残す。
      // 共通補正（Lv）と稼働施設（Joker）を分けて書き、どちらを体感したか読めるようにする。
      facility: this.facilityReport(),
      facilitySummary: (this.tallyFacilityStats(result.facilitySummary), result.facilitySummary || { facilities: [], rescuedFromWipe: false }),
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

    // この決着ぶんの回復を先に済ませてから、稽古で倒れた者へ負傷を付ける
    // （順番を逆にすると、付けた負傷がその場で治る。settleRetreat と同じ作法）。
    this.recoverInjuries();
    if (training) this.applyTrainingInjuries(result.contribution, notes);
    // 王国の反撃の判定は決着の最後。予告は必ず1手番前になる（奇襲はしない）。
    if (st.phase !== "clear" && st.phase !== "gameover") this.checkCounterattack();

    // 記録の確定とセーブの後始末は必ず最後に行う。先に endRun してから
    // save すると、消したはずのセーブが書き戻ってしまう。
    if (st.phase === "clear") {
      this.endRun(true);
    } else if (st.phase === "defeat" && !this.canRetry()) {
      st.phase = "gameover";
      this.endRun(false);
    } else if (st.phase === "gameover") {
      // 城陥落（勇者の防衛戦で全滅）。記録を確定しないまま gameover 画面へ行くと st.record が無くて落ちる
      // （autoplay がまれに踏んだ）。settleRetreat 側は自分で endRun している。
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
    this.applySpiritChanges(pending && pending.result, pending);
    this.recordBattleResult(pending);
    const { result, stageData, notes, battleRations, mealPlan, chainView } = pending;
    this.consumeBattleRations(result, notes);
    this.settleCaptains(stageData, result, notes);   // 退いた戦いでも、見逃した・雇った者は記録に残る
    st.lastRansacked = this.isDefenseBattle(stageData);   // 城下町：防衛戦から退いた決着も税収は無い
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
    if (mealPlan?.boost > 0 && mealPlan.cookUid != null) this.trace("cooked", mealPlan.cookUid, null, { facility: this.facilityLv("grand_kitchen") > 0 ? "grand_kitchen" : null });

    // 個人カウンタは名簿が動く前に進める（引退・戦死で消えた者を数え損なわないため）。
    this.tallyBattleRecords(contribution, false);
    this.recordBattleTraces(result, contribution);
    if (!lostOnPoints) this.trace("retreated", null, null, { army: stageData.army, carried: carried.map(c => c.name).join("、") });
    for (const row of carried) this.trace("carried", row.uid, null, { army: stageData.army });
    if(stageData.missionKind==="invade" && this.state.incidents?.intel) {this.state.incidents.intel=false;if(this.state.incidents.letterEnemy)notes.push("王国の連絡兵が、敵の列からハーピーに手を振った。");}
    this.recordStageFight(stageData);
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
      // 担がれ慣れ：運ばれ方にこつがある者は、担がれても負傷しない。
      // 名前は「担いで戻った」に残る（運ばれた事実は消さない）。
      if ((monster.traits || []).includes("carried_before")
        && TRAITS.carried_before && TRAITS.carried_before.injuryFree) {
        notes.push(`${monster.name}は担がれ慣れている。傷にはならなかった`);
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
      this.trace("ransacked", null, null, { army: stageData.army });
      const rules = this.counterRules();
      st.alert = Math.max(0, st.alert - Math.floor(rules.threshold / 2));
      notes.push(`王国は荒らして満足し、引き上げた（警戒 ${st.alert}）`);
      st.defenses = st.defenses || { won: 0, lost: 0 };
      st.defenses.lost += 1;
      st.counterattack = null;
      if (heroDefense) { castleFell = true; this.castleFalls(notes); }
    } else {
      // 征服は進まない。だが敵に見つかった事実は残る。
      const alertDelta = Number(stageData.alertDelta) || 1;
      st.alert = Math.max(0, st.alert + alertDelta);
      notes.push(`王国警戒度+${alertDelta}（現在 ${st.alert}）`);
      this.advanceOutpost(stageData, false, notes);
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
    // 勇者に負けても終わりではない（2026-09-11）。荒らされ、建て直し、また来る勇者に備える。
    st.phase = this.canRebuild() ? "result" : "defeat";

    const earnedTraits = this.grantExperienceTraits(notes);

    st.lastBattle = {
      victory: false,
      earned: earnedTraits,
      retreated: !lostOnPoints,
      lostOnPoints,
      defense: isDefense,
      castleFell,
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
      summonCount: result.summonCount || 0,
      facility: this.facilityReport(),
      facilitySummary: (this.tallyFacilityStats(result.facilitySummary), result.facilitySummary || { facilities: [], rescuedFromWipe: false }),
      deathChains: result.deathChains || [],
      buildChanges: pending.buildChanges,
      spotlight: typeof Spotlight !== "undefined" ? Spotlight.of(result.timeline, {
        highlightIds: pending.highlightIds || []
      }) : null
    };
    this.rememberSpotlight(st.lastBattle.spotlight, stageData, false);
    st.battleIncidentTotal = (st.battleIncidentTotal || 0) + (result.incidents || []).length;

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

  // ── 敵の慣れ ───────────────────────────────
  enemyGrowthRules() {
    const r = (typeof ENEMY_GROWTH !== "undefined" && ENEMY_GROWTH) || {};
    return { perFight: r.familiarityPerFight ?? 0.04, cap: r.familiarityCap ?? 5 };
  },
  // 段階（0始まりの index）で戦った回数から、敵能力の上乗せ（%）。
  familiarityOf(stageIndex) {
    const st = this.state;
    const rules = this.enemyGrowthRules();
    const fights = Math.min(rules.cap, Number((st.stageFights || {})[stageIndex]) || 0);
    return Math.round(fights * rules.perFight * 100);
  },
  // 決着ごとに呼ぶ。通常作戦だけ数える（防衛戦は王国側の都合で来るので数えない）。
  recordStageFight(stageData) {
    const st = this.state;
    if (!stageData || this.isDefenseBattle(stageData) || stageData.baseStage === undefined) return;
    if (!st.stageFights || typeof st.stageFights !== "object") st.stageFights = {};
    const index = Number(stageData.baseStage) - 1;
    if (!(index >= 0)) return;
    st.stageFights[index] = (st.stageFights[index] || 0) + 1;
  },

  // ── 王国の反撃 ─────────────────────────────
  counterRules() {
    const rules = (typeof COUNTERATTACK !== "undefined" && COUNTERATTACK) || {};
    return {
      threshold: rules.threshold !== undefined ? rules.threshold : 6,
      nearChance: rules.nearChance !== undefined ? rules.nearChance : 0.5,
      ransack: rules.ransack || { facilityLevels: 1, foodRatio: 0.5, relics: 1 },
      seize: rules.seize || { materials: 2, food: 2 },
      invadeAlert: rules.invadeAlert !== undefined ? rules.invadeAlert : 2
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
    const stages = this.actStages();
    // 勇者は幕の最終段階で来る（第一幕は段階8、第二幕は段階14）。ラン中1回だけ。
    const hero = this.armyLevel() >= this.MAX_CONQUEST && !st.heroCame;
    if (!hero && st.heroCame) return null;   // 勇者を退けた後はもう来ない
    const stage = hero
      ? stages[this.MAX_CONQUEST - 1]
      // 第二幕の討伐隊は段階9以上から来る（もう見習い冒険者は寄越さない）
      : stages[U.clamp(this.armyLevel(), st.act >= 2 ? 8 : 0, this.MAX_CONQUEST - 2)];
    st.counterattack = {
      pending: true,
      kind: hero ? "hero" : "punitive",
      armyName: hero ? stage.army : `${stage.army}討伐隊`
    };
    return st.counterattack;
  },

  // 城を守れなかった。**人は取らない**（それは戦場で決まっている）。
  // 持っていかれるのは、積み上げたもの——施設・蓄え・蔵の品。
  // 勇者に城を落とされた。**終わりではない**（オーナー 2026-09-11：ラスボスに負けて最初からは理不尽）。
  // 荒らされ（ransack は呼び出し側で済んでいる）、勇者は去り、魔王軍レベルは保たれる。
  // 警戒が溜まればまた来る（heroCame を戻す）。名簿が空で金も無ければ通常どおり再起か魔界史へ。
  castleFalls(notes) {
    const st = this.state;
    st.castleFalls = (st.castleFalls || 0) + 1;
    st.heroCame = false;
    st.alert = 0;
    notes.push(`勇者は城を焼いて去った（${st.castleFalls}度目）。魔王は生きている。軍を整え、次に備えよ`);
  },

  ransack(notes) {
    const st = this.state;
    const rules = this.counterRules().ransack;
    const before = { food: st.food || 0 };
    // 荒らし：城下町の施設が1つ、1段落ちる（銀行の差し押さえと同じ入口）。
    let razed = null;
    for (let i = 0; i < (rules.facilityLevels || 1); i++) {
      const lost = typeof Town !== "undefined" ? Town.demolishOne(st) : null;
      if (!lost) break;
      razed = razed || lost;
      notes.push(`城下町が荒らされた。${lost.name} Lv${lost.from} → Lv${lost.to}`);
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
    return { razed, facilityBefore: razed ? razed.from : 0, facilityAfter: razed ? razed.to : 0,
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
    const early = typeof Town !== "undefined" ? Town.healBonus(this.state) : 0;   // 宿舎Lv2で1決着早い
    for (const m of this.state.roster) {
      if (!m.injured) continue;
      if (early > 0 && m.injured <= 1 + early) Town.stat(this.state, "hostel", 1);   // 宿舎が無ければまだ治っていない
      m.injured = Math.max(0, m.injured - 1 - early);
    }
  },

  // 負傷者は出撃できない。留守番としては働く（包帯を巻きながら帳簿は付けられる）。
  isInjured(uid) {
    const m = this.state.roster.find(x => x.uid === uid);
    return !!(m && m.injured > 0);
  },

  // 前哨と本戦の行き来。勝った／負けた（退いた）の両方から呼ぶ**唯一の入口**。
  //   前哨に勝った → 本戦へ。本戦に勝った → 征服度が進んで前哨へ戻る（次の段階の前哨）。
  //   本戦に負けた → 前哨からやり直し（オーナー決定）。前哨に負けた → そのまま前哨。
  advanceOutpost(mission, won, notes) {
    const st = this.state;
    if (!mission || mission.missionKind !== "invade") return null;
    if (mission.missionPhase === "outpost") {
      if (!won) return null;                       // 前哨に負けた：もう一度前哨から
      st.outpost = { stage: st.conquest, place: mission.territoryId || null, cleared: true, formationId: mission.formationId };
      if (notes) notes.push(`${mission.region}の前哨を制した。次は本戦`);
      return "outpost-cleared";
    }
    // 本戦。勝っても負けても前哨の札は返す（勝ちは次の段階の前哨、負けは同じ段階の前哨）。
    st.outpost = null;
    if (!won && notes && mission.twoStage) notes.push("本戦で退けられた。前哨から立て直す");
    return won ? "main-cleared" : "main-lost";
  },

  // 敵将の決着（docs/SPEC_CAPTAINS_BD_2026-09-15.md §2-2）。
  // 討てば首級（報酬と名声）、雇えば名簿に増える、見逃せば去る。
  // 状態の更新そのものは Captains.settle に任せる（captains.js は触らない）。
  settleCaptains(mission, result, notes) {
    if (typeof Captains === "undefined" || !mission) return null;
    const st = this.state;
    const ids = mission.captainIds || [];
    if (!ids.length && !(result.spared || []).length) return null;
    const before = {};
    for (const id of ids) before[id] = Captains.state(st, id).status;
    Captains.settle(st, result, ids);
    const rules = Captains.rules();
    const out = { slain: [], spared: [], hired: [] };
    for (const id of ids) {
      const now = Captains.state(st, id).status;
      if (now === before[id]) continue;
      const c = Captains.get(id); if (!c) continue;
      const short = c.short || c.name;
      if (now === "slain") {
        const bounty = Math.max(1, Math.round(mission.reward * (rules.bountyMult - 1)));
        st.gold += bounty;
        st.fame = (st.fame || 0) + (rules.fame || 0);
        out.slain.push(short);
        notes.push(`${short}を討った。首級 +${bounty}G`);
        this.trace("captain_slain", null, null, { id, name: short });
      } else if (now === "spared") { out.spared.push(short); notes.push(`${short}を見逃した。戦場を去っていった`); }
    }
    // 雇った者は名簿へ（rollApplicant と同じ形の1体。名前は敵将の short）
    for (const x of result.spared || []) {
      if (x.kind !== "hire") continue;
      const c = Captains.get(x.id); if (!c || !c.hire) continue;
      const m = this.rollApplicant(c.hire.race);
      m.name = c.short || c.name;
      m.loyalty = c.hire.loyalty;
      m.job = c.hire.job || m.job;
      if (c.hire.trait && !(m.traits || []).includes(c.hire.trait)) m.traits = (m.traits || []).concat(c.hire.trait);
      m.captainId = x.id;
      st.roster.push(m);
      this.memberRecord(m);
      this.baseOf(m);
      out.hired.push(m.name);
      notes.push(`${m.name}が魔王軍に加わった（忠誠 ${m.loyalty}）`);
      this.trace("captain_hired", m.uid, null, { id: x.id, name: m.name });
    }
    st.lastCaptains = out;
    return out;
  },

  applyMissionOutcome(mission, notes) {
    const st = this.state;
    st.settles = (st.settles || 0) + 1;   // 「⚠ ○○がいる」札の周期
    st.alert = Math.max(0, st.alert + (mission.alertDelta || 0));
    st.conquest = U.clamp(st.conquest + (mission.conquestDelta || 0), 0, this.MAX_CONQUEST);
    // 地図の上の戦争（段階A）。勝った札の場所を領土にし、征服度はそこから写す
    // （段階表・討伐隊・勇者の判定は今までどおり st.conquest を読む）。
    if (typeof Territory !== "undefined" && mission.territoryId) {
      if (mission.territoryMode === "raid") {
        st.raided[mission.territoryId] = (st.raided[mission.territoryId] || 0) + 1;
        notes.push(`${mission.region}から奪って引き上げた。次に来るときは守りが硬い`);
      } else if (mission.territoryMode === "take") {
        Territory.take(st, mission.territoryId);
        notes.push(`${mission.region}は魔王軍の領土になった（領土 ${Territory.init(st).lands.length + Territory.init(st).tribes.length}）`);
      }
    }
    if (typeof Territory !== "undefined") {
      const mapped = Territory.conquestOf(st);
      if (mapped !== st.conquest) {
        st.conquest = U.clamp(mapped, 0, this.MAX_CONQUEST);
        notes.push(`王国攻略 ${st.conquest}/${this.MAX_CONQUEST}。王都へ一歩近づいた`);
      }
    }
    if (mission.territoryMode === "patrol") st.patrolCount = (st.patrolCount || 0) + 1;
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
    // 留守番は休んで気合を整える（出撃者の +1 は tallyBattleRecords）。開幕の日割りでは足さない。
    // 城の主が育つのもここ。留守番として過ごした決着の数を数える（出撃では育たない）。
    if (dailyDay === undefined) for (const m of lifeWorkers) {
      this.gainSpirit(m, this.spiritRules().perHomeTurn);
      this.memberRecord(m).homeStays += 1;
    }
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
    if (!normalized && materialReward > 0) for (const m of builders) this.trace("carried_materials", m.uid, null, { amount: materialReward / Math.max(1, builders.length), facility: null });
    // 旧「施工」（建材を進捗に変えて施設 Lv を上げる）は撤去した（2026-09-13）。
    // 留守番は建材を**運ぶ**だけで、使い道は城下町ただ一つ。st.autoBuild の flag ごと消してある。
    // 供養代行：建設部門の死霊術師は、直前の戦没者を建材へ変える（墓石も城壁も石である）。
    // 戦死という損失が別部門の資源になる、いちばん短い接続。
    const mourners = builders.filter(m => m.tplId === "necromancer").length;
    const salvageTotal = mourners > 0 ? mourners * (st.pendingVacancies || 0) * 2 : 0;
    const salvage = normalized ? this.dailyShare(salvageTotal, dailyDay) : salvageTotal;
    st.materials += salvage;
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
      salvage,
      wageDiscount: output.wage,
      recruitBonus: output.recruit,
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
    notes.push(`留守番の建設：建材 +${materialReward}（備蓄 ${st.materials}）`);
    // 城下町：税・利子・酒場（決着ごと。開幕の日割りでは呼ばない）。荒らされたかは settleContinue が st.lastRansacked に控える
    // 訓練の決着は税収が無い（王国に知られていないので領地は動かない）。利子は普通どおり取られる。
    if (dailyDay === undefined && typeof Town !== "undefined") {
      Town.settle(this, notes, { ransacked: !!st.lastRansacked || this.isTraining(mission), training: this.isTraining(mission) });
    }
    // 領土の効き目（docs/SPEC_TERRITORY_A_2026-09-15.md §2-3）。
    // 食料と金だけをここで入れる（応募者・給与相場・種族は面接の側で読む）。
    // defenseLine・noPriest・landing は段階C まで保存するだけで読まない。
    if (dailyDay === undefined && typeof Territory !== "undefined") {
      const gains = Territory.effects(st);
      if (gains.food) { st.food += gains.food; notes.push(`領内の村から食料 +${gains.food}`); }
      if (gains.gold) { st.gold += gains.gold; notes.push(`港の荷から金 +${gains.gold}G`); }
    }
    // 噂の札は城下町の有無に関わらず決着ごとに1回（城下町を読まない測定＝SIM_NO_TOWN でも
    // 札の判定は動かす。状態式が読めない札は Incidents.candidate が黙って見送る）。
    if (dailyDay === undefined && typeof Incidents !== "undefined") Incidents.settle(this);
    // 旧施設の移行の報せ（ロード中には出す画面が無いので、次の決着の報告で一度だけ）。
    if (st.lastFacilityMigration && st.lastFacilityMigration.length) {
      for (const line of st.lastFacilityMigration) notes.push(line);
      delete st.lastFacilityMigration;
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
    // 将軍は昇進ではなく転身。数値以外（気合の上限・将軍技・二つ名）もここで付ける。
    if (rank.id === "general") this.transformToGeneral(monster);
    const entry = { uid: monster.uid, name: monster.name, rankId: rank.id, rankName: rank.name, message: rank.message,
      epithet: monster.epithet || null, displayName: this.displayName(monster), general: rank.id === "general" };
    this.state.lastPromotions.push(entry);
    if (rank.id === "general" && !this.state.generalsMade.some(g => g.uid === monster.uid)) {
      this.state.generalsMade.push({ uid: monster.uid, name: monster.name, race: monster.race, epithet: monster.epithet || null });
    }
    notes.push(rank.id === "general"
      ? `転身！ ${monster.name} は魔王の魔力を受け【${this.displayName(monster)}】となった。${rank.message}`
      : `昇進！ ${monster.name} は【${rank.name}】となった。${rank.message}`);
    this.trace("promoted", monster.uid, null, { rank: rank.name });
  },

  // 転身の「数値以外」。付け直し（旧セーブ）からも呼ぶので、**二重に掛からないものだけ**を置く。
  // HP・攻撃の ×1.4 は promote() の boost が持つ（ここでやると付け直しで二度掛かる）。
  transformToGeneral(monster) {
    const rules = (typeof GENERAL_TRANSFORM !== "undefined" && GENERAL_TRANSFORM) || {};
    monster.spiritMaxBonus = rules.spiritMaxBonus || 1;
    const skillId = rules.skillId || "general_might";
    if (typeof SKILLS !== "undefined" && SKILLS[skillId]) {
      monster.skills = monster.skills || [];
      if (!monster.skills.includes(skillId)) monster.skills.push(skillId);
    }
    if (!monster.epithet) monster.epithet = this.epithetFor(monster);
    // 気合は転身の瞬間に満タン（次の戦いで将軍技をすぐ見せられる）。
    monster.spirit = this.spiritRules().max + (monster.spiritMaxBonus || 0);
    return monster;
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
      const tpl = this.templates().find(t => t.id === c.tplId);
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

  // 訓練の決着は給与が半分（端数は切り上げ。未払いの判定も半額で行う）。
  salaryRatio(stageData) {
    // 既定は半分（設計2.3、オーナーの指示）。2.4 の「破産率が5pt上がれば 1/3」は
    // 実測で条件を満たしているが、数字の変更はオーナーの判断待ち（報告済み）。
    return this.isTraining(stageData || this.state.selectedMission) ? 0.5 : 1;
  },
  paySalaries(notes, dailyDay, stageData) {
    const st = this.state;
    if(this.isTraining(stageData || st.selectedMission) && st.incidents?.freeTraining) {
      st.lastPayrollReport={policyId:this.payrollPolicy().id,base:0,paid:0,loyaltyDelta:0};
      notes.push("研究所が今回の稽古の給与を受け持った。");return;
    }
    const ratio = this.salaryRatio(stageData);
    const assignments = this.salaryAssignments().map(entry => ({
      ...entry,
      amount: Math.ceil((dailyDay === undefined ? entry.amount : this.dailyShare(entry.amount, dailyDay)) * ratio)
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
      h && h.tplId && this.templates().some(t => t.id === h.tplId)
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
    if(this.isTraining(st.selectedMission) && st.incidents?.freeTraining)return true;
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

  // 逃亡（2026-09-12 オーナー試遊「急に逃亡されるとへこむ」）。忠誠0で即去るのをやめ、**一度は荷物をまとめる**。
  // 荷物をまとめた者（leaving）は、次の決着までに忠誠が戻らなければ去る。引き留めは「慰留」（retain：金で忠誠を戻す）か給与を払うこと。
  processDepartures(notes) {
    const st = this.state;
    const leaving = [];
    for (const m of st.roster) {
      if (m.loyalty > 0) { if (m.leaving) { m.leaving = false; notes.push(`${m.name} は荷物を解いた（忠誠 ${m.loyalty}）`); } continue; }
      if (!m.leaving) {
        m.leaving = true;
        notes.push(`${m.name} が荷物をまとめ始めた……次の決着までに引き留めなければ軍を去る（給与を払う／慰留）`);
        continue;
      }
      leaving.push(m);
    }
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
    { id: "facility_max", test: r => (r.townTop || 0) >= 3,
      phrase: r => ({
        graveyard: "墓地を三度も回した",
        grand_kitchen: "厨房を焚き続けた",
        market: "市場を三度広げた",
        tavern: "酒場を三度建て増した"
      }[r.townTopId] || "城下町を建てきった") },
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
      facility: this.townSignature(),
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
      reordered: false, facility: null, payroll: null,
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
        : cleared ? ((st.act || 1) >= 2
          ? `第${st.act}幕・${st.clearedBy === "defense" ? "勇者撃退" : "王都攻略"}`
          : "人間界を征服し引退")
        : `${finalMission.army}に敗北`,
      // どう終わったか：攻めた（王都で勇者に勝つ）／待った（魔王城で勇者を退ける）。
      clearedBy: cleared ? (st.clearedBy || "conquest") : null,
      // どの幕まで行ったか。ui.js の魔界史は触らないので、cause の文字列に幕を含める。
      act: st.act || 1,
      actHistory: (st.actHistory || []).map(a => ({ ...a })),
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
      // 城下町（2026-09-13）。旧 facilityLevel / activeFacilityId の置き換え。
      // 魔界史・軍風・教訓が読む。townTop は一番高い施設の Lv、townTopId はその id。
      townLevels: this.townLevelTotal(),
      townTop: this.townTopLevel().lv,
      townTopId: this.townTopLevel().id,
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
        // ツケの種類名は互換のまま（events.js のデータが持っている）。中身は
        // 「城下町の施設が1つ、1段落ちる」——荒らし・差し押さえと同じ入口を通す。
        const lost = typeof Town !== "undefined" ? Town.demolishOne(st) : null;
        if (!lost) return `${head}落とせる施設が無かった（城下町は空き地のまま）`;
        return `${head}${lost.name} Lv${lost.from} → Lv${lost.to}`;
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
    st.pendingEvent = null;
    st.eventOutcome = null;
    st.eventCast = null;
    st.selectedMission = null;
    st.missionOffers = [];
    this.saveCheckpoint();   // ここが「一戦手前」の戻り先になる
    this.save();
  }
};
