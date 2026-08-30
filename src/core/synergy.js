// シナジー判定。units はロスターのモンスター（戦闘ユニットでも可）。
const Synergy = {
  // 発動中のシナジー定義一覧を返す
  active(units) {
    return SYNERGIES.filter(s => s.check(units));
  },
  // 戦闘ユニットに mods を適用する（merge 型は run.js が処理済みの前提）
  applyAll(units) {
    const act = this.active(units);
    for (const s of act) {
      if (s.type !== "merge") s.apply(units);
    }
    return act;
  }
};
