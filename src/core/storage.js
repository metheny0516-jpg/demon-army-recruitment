// LocalStorage 保存。maou_save = ラン途中の状態 / maou_history = 魔界史（永続）
const Storage = {
  SAVE_KEY: "maou_save",
  HISTORY_KEY: "maou_history",

  saveRun(state) {
    try { localStorage.setItem(this.SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 容量超過等は無視 */ }
  },
  loadRun() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  clearRun() {
    try { localStorage.removeItem(this.SAVE_KEY); } catch (e) {}
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
