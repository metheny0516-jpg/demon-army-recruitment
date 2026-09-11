// LocalStorage 保存。maou_save_1〜3 = ランの3スロット / maou_history = 魔界史（永続・スロットの外）
//
// 「リロードで消える」（オーナー 2026-09-11）の切り分け結果：コード上に消える経路は無く、
// file:// でもリロードで保存は残り「続きから」も出た。残る原因は
// (1) 「続きから」を押さずに「新規」を押して上書き、(2) ブラウザ側の保存削除（プライベート窓等）。
// (1) は「新規は必ずスロットを指定する」で塞ぎ、(2) は書き出し／読み込みで持ち運べるようにした。
const Storage = {
  SLOTS: 3,
  SAVE_KEY: "maou_save",          // 旧セーブ（1スロット時代）。初回の読み込みで slot 1 へ移す
  SLOT_KEY_PREFIX: "maou_save_",
  ACTIVE_SLOT_KEY: "maou_active_slot",
  HISTORY_KEY: "maou_history",
  // 前代の敗北から次代へ持ち越す「教訓」。ラン状態の外にあるので、
  // ランを閉じても残り、次の newRun が一度だけ読んで消す。
  LESSON_KEY: "maou_lesson",

  slotKey(n) { return this.SLOT_KEY_PREFIX + this.normalizeSlot(n); },
  normalizeSlot(n) {
    const v = Math.floor(Number(n));
    return v >= 1 && v <= this.SLOTS ? v : null;
  },
  activeSlot() {
    try { return this.normalizeSlot(localStorage.getItem(this.ACTIVE_SLOT_KEY)) || 1; }
    catch (e) { return 1; }
  },
  // 範囲外は黙って無視する（選んでいるスロットは変えない）。
  selectSlot(n) {
    const slot = this.normalizeSlot(n);
    if (!slot) return this.activeSlot();
    try { localStorage.setItem(this.ACTIVE_SLOT_KEY, String(slot)); } catch (e) {}
    return slot;
  },

  // 旧セーブ（maou_save）があればスロット1へ移して消す。読み書きのたびに一度だけ効く。
  migrateLegacy() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (raw === null) return false;
      if (localStorage.getItem(this.slotKey(1)) === null) localStorage.setItem(this.slotKey(1), raw);
      localStorage.removeItem(this.SAVE_KEY);
      return true;
    } catch (e) { return false; }
  },

  saveRun(state, slot) {
    this.migrateLegacy();
    const target = this.normalizeSlot(slot) || this.activeSlot();
    try {
      if (state && typeof state === "object") state.savedAt = Date.now();
      localStorage.setItem(this.slotKey(target), JSON.stringify(state));
    } catch (e) { /* 容量超過等は無視 */ }
  },
  loadRun(slot) {
    this.migrateLegacy();
    const target = this.normalizeSlot(slot) || this.activeSlot();
    try {
      const raw = localStorage.getItem(this.slotKey(target));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  clearRun(slot) {
    this.migrateLegacy();
    const target = this.normalizeSlot(slot) || this.activeSlot();
    try { localStorage.removeItem(this.slotKey(target)); } catch (e) {}
  },

  // 札の中身は保存本体から導く。別の meta 鍵を持つと必ず食い違う。
  slotMeta(n) {
    const slot = this.normalizeSlot(n) || 1;
    const s = this.loadRun(slot);
    if (!s || typeof s !== "object") return { slot, empty: true };
    const king = (typeof DEMON_KINGS !== "undefined"
      && DEMON_KINGS.find(k => k.id === s.demonKingId)) || null;
    return {
      slot, empty: false,
      kingName: king ? king.name : "魔王",
      kingIcon: king ? king.icon : "👑",
      generation: s.generation || 1,
      act: s.act || 1,
      turn: s.turn || 0,
      conquest: s.conquest || 0,
      rosterCount: (s.roster || []).length,
      savedAt: s.savedAt || null
    };
  },
  slotMetas() {
    const out = [];
    for (let i = 1; i <= this.SLOTS; i++) out.push(this.slotMeta(i));
    return out;
  },
  hasAnySave() { return this.slotMetas().some(m => !m.empty); },

  // 書き出しは保存本体の JSON をそのまま返す（加工しない＝読み込みと往復で一致する）。
  exportRun(slot) {
    const target = this.normalizeSlot(slot) || this.activeSlot();
    this.migrateLegacy();
    try { return localStorage.getItem(this.slotKey(target)); } catch (e) { return null; }
  },
  // 読み込みは「JSON として読めて、object で、phase を持つ」ものだけ受ける。
  // 移行（migrateState）は呼び出し側（Game.importRun）が通す。壊れていれば false。
  importRun(slot, text) {
    const target = this.normalizeSlot(slot) || this.activeSlot();
    let parsed = null;
    try { parsed = JSON.parse(String(text)); } catch (e) { return false; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.phase) return false;
    try { localStorage.setItem(this.slotKey(target), JSON.stringify(parsed)); } catch (e) { return false; }
    return parsed;
  },

  saveLesson(id) {
    try { localStorage.setItem(this.LESSON_KEY, String(id)); } catch (e) {}
  },
  loadLesson() {
    try { return localStorage.getItem(this.LESSON_KEY); } catch (e) { return null; }
  },
  clearLesson() {
    try { localStorage.removeItem(this.LESSON_KEY); } catch (e) {}
  },

  loadHistory() {
    try {
      const raw = localStorage.getItem(this.HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },
  appendHistory(record) {
    const list = this.loadHistory();
    list.push(record);
    try { localStorage.setItem(this.HISTORY_KEY, JSON.stringify(list)); } catch (e) {}
    return list;
  }
};
