// KPI測定（GAME_DESIGN_PRINCIPLES.md 第14節「KPI測定契約」）。
//
// 最重要KPI「もう1回遊びたいか」を感想ではなく行動で測る。
// **記録は端末内で完結し、外部へ一切送らない。** 分析画面も作らない（先に画面を作ると
// 数字を眺めるだけで終わる）。ここにあるのは「何が起きたか」を残す小さな契約だけで、
// 読むときは DevTools で `KPI.export()` を叩き、`tools/kpi-report.js` へ渡す。
//
// ── 記録する行動 ──────────────────────────────────────
//   buildAttempts    前戦から人材・特性・施設・傭兵・合体の可否・狙う資源状態の
//                    いずれかが変わった戦闘数
//                    （同じ編成の連戦は試行として数えない＝1ランで仮説を何回試せたか）
//   formationChanges 出撃隊の選抜・並び替え・部門配属を変えた回数
//   mercenariesHired 雇った傭兵の数 / mercenaryGold 使った金貨 / kinHires うち同族
//   mergesRefused    キングスライム合体を断った回数（既定を覆す判断）
//   quickRetry       前のランの終了から60秒以内に新しいランを始めたか
//   sessionRuns      このセッション（ページを開いている間）で始めたラン数
//   speedChanges     戦闘速度の変更回数 / logSkips 戦闘スキップ回数
//   reportSkips      モルモ報告を全文表示前に送った回数
//   lastScreen       最後にいた画面と攻略段階（＝どこで離脱したか）
//
// ── 再起（チェックポイント巻き戻し）との関係 ────────────────────
// KPIはラン状態の中に持たない。したがって再起で巻き戻しても**減らない**。
// 魔界史の記録（maxChain / maxOverkill）とは逆の扱いで、これは意図的である。
// 巻き戻してやり直した編成も「仮説を試した回数」には入るため。
const KPI = {
  KEY: "maou_kpi",
  QUICK_RETRY_MS: 60000,   // 「終わった直後にもう1回」と見なす間隔（第14節の目安60秒）
  MAX_RUNS: 50,            // 端末内に残すラン数の上限。古いものから捨てる

  // セッション＝このページを開いている間。リロードで0に戻るのが正しい
  session: { runs: 0 },
  current: null,           // 進行中ランのカウンタ（メモリのみ。ランの終了時に保存する）
  lastFingerprint: null,

  now() { return Date.now(); },

  blank() {
    return {
      version: 1,
      runs: [],
      totals: { runsStarted: 0, quickRetries: 0, speedChanges: 0, logSkips: 0, reportSkips: 0 },
      lastRunEndedAt: 0,
      lastScreen: null
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || typeof data !== "object") return this.blank();
      const base = this.blank();
      return {
        version: 1,
        runs: Array.isArray(data.runs) ? data.runs : [],
        totals: { ...base.totals, ...(data.totals || {}) },
        lastRunEndedAt: Number(data.lastRunEndedAt) || 0,
        lastScreen: data.lastScreen || null
      };
    } catch (e) { return this.blank(); }
  },

  save(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (e) { /* 容量超過等は無視 */ }
  },

  update(fn) {
    const data = this.load();
    fn(data);
    if (data.runs.length > this.MAX_RUNS) data.runs = data.runs.slice(-this.MAX_RUNS);
    this.save(data);
    return data;
  },

  // ── イベント ────────────────────────────────
  runStarted(state) {
    const at = this.now();
    this.session.runs += 1;
    this.lastFingerprint = null;
    this.current = {
      gen: (state && state.generation) || 0,
      demonKingId: (state && state.demonKingId) || null,
      startedAt: at, endedAt: 0, cleared: false, conquest: 0, battles: 0,
      buildAttempts: 0, formationChanges: 0, speedChanges: 0, logSkips: 0, reportSkips: 0,
      mercenariesHired: 0, mercenaryGold: 0, kinHires: 0, mergesRefused: 0,
      retriesUsed: 0, sessionRun: this.session.runs, quickRetry: false
    };
    this.update(data => {
      // 「終わった直後にもう1回」＝リトライ率の分子。ラン終了からの経過で測る
      const since = data.lastRunEndedAt ? at - data.lastRunEndedAt : Infinity;
      this.current.quickRetry = since <= this.QUICK_RETRY_MS;
      data.totals.runsStarted += 1;
      if (this.current.quickRetry) data.totals.quickRetries += 1;
    });
    return this.current;
  },

  // 出撃隊・特性・施設・狙う資源状態のどれかが前戦から変わったか。
  // 同じ編成の連戦を「試行」に数えないための指紋で、計算には一切使わない。
  fingerprint(state, stageData) {
    if (!state) return "";
    const deployed = (state.activeUids || []).map(uid => {
      const m = (state.roster || []).find(x => x.uid === uid);
      if (!m) return `${uid}:?`;
      return `${uid}:${m.tplId || ""}:${m.rankId || ""}:${(m.traits || []).slice().sort().join("+")}`;
    }).join(",");
    const departments = (state.roster || [])
      .map(m => `${m.uid}:${m.department || ""}`).sort().join(",");
    // 金貨で雇った傭兵も「今回の仮説」の一部。誰を雇ったかで編成の狙いが変わる
    const mercenaries = (state.mercenaries || [])
      .map(m => `${m.tplId || ""}:${m.race || ""}`).sort().join(",");
    return JSON.stringify({
      deployed, departments, mercenaries,
      facility: state.facilityLevel || 0,
      payroll: state.payrollPolicy || "regular",
      // 合体するか否かも編成の判断（頭数を取るか、1体の硬さを取るか）
      merge: state.kingSlimeMerge !== false,
      // 狙う資源は作戦で決まる（略奪＝金貨、鎮圧＝忠誠、侵攻＝攻略）
      mission: (stageData && stageData.missionKind) || null
    });
  },

  battleStarted(state, stageData) {
    if (!this.current) this.runStarted(state);
    const print = this.fingerprint(state, stageData);
    const changed = print !== this.lastFingerprint;   // 初戦は必ず「試行」になる
    this.lastFingerprint = print;
    this.current.battles += 1;
    if (changed) this.current.buildAttempts += 1;
    return changed;
  },

  formationChanged() { if (this.current) this.current.formationChanges += 1; },

  // 金貨の出口が実際に使われているか。買ったのが同族か余所者かで、
  // 「ビルドを濃くする買い物」だったのかが分かる
  mercenaryHired(merc, cost, kin) {
    if (!this.current) return;
    this.current.mercenariesHired += 1;
    this.current.mercenaryGold += Number(cost) || 0;
    if (kin) this.current.kinHires += 1;
  },

  // 合体を断った回数。既定を断る判断が実際に起きているか
  mergeRefused() { if (this.current) this.current.mergesRefused += 1; },

  speedChanged() {
    if (this.current) this.current.speedChanges += 1;
    this.update(data => { data.totals.speedChanges += 1; });
  },

  logSkipped() {
    if (this.current) this.current.logSkips += 1;
    this.update(data => { data.totals.logSkips += 1; });
  },

  // モルモ報告を「全文が出る前に」送った回数だけを数える。読み終えてから送るのは離脱ではない
  reportSkipped() {
    if (this.current) this.current.reportSkips += 1;
    this.update(data => { data.totals.reportSkips += 1; });
  },

  // 最後にいた画面と攻略段階。閉じた場所＝止まった場所を知るための1件だけを持つ
  screen(state) {
    const at = this.now();
    const last = state ? {
      phase: state.phase || null, conquest: state.conquest || 0,
      turn: state.turn || 0, day: state.day || 0, gen: state.generation || 0, at
    } : { phase: "title", conquest: 0, turn: 0, day: 0, gen: 0, at };
    this.update(data => { data.lastScreen = last; });
    return last;
  },

  runEnded(state, record) {
    const at = this.now();
    if (!this.current) this.runStarted(state);
    const entry = {
      ...this.current,
      endedAt: at,
      cleared: !!(record && record.cleared),
      conquest: (record && record.conquest) || (state && state.conquest) || 0,
      retriesUsed: (state && state.retriesUsed) || 0,
      seconds: Math.round((at - this.current.startedAt) / 1000)
    };
    this.update(data => {
      data.runs.push(entry);
      data.lastRunEndedAt = at;
    });
    this.current = null;
    this.lastFingerprint = null;
    return entry;
  },

  // 端末内のKPIをそのまま取り出す。DevToolsで copy(KPI.export()) して
  // tools/kpi-report.js へ渡す（ゲーム内に分析画面は作らない）
  export() { return JSON.stringify(this.load(), null, 2); },
  reset() { try { localStorage.removeItem(this.KEY); } catch (e) {} this.current = null; this.session.runs = 0; }
};
