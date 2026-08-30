// アプリ全体の進行役。画面遷移とユーザー操作の受け口だけを持つ。
const App = {
  pendingBattle: null,

  start() {
    UI.init(document.getElementById("app"));
    UI.bind((action, data) => this.onAction(action, data));
    this.showTitle();
  },

  showTitle() {
    Game.state = null;
    UI.title(!!Storage.loadRun(), Storage.loadHistory());
  },

  render() {
    const st = Game.state;
    if (!st) return this.showTitle();
    switch (st.phase) {
      case "recruit": return UI.recruit();
      case "formation": return UI.formation();
      case "result": return UI.result();
      case "gameover":
      case "clear": return UI.gameover(st.record, Storage.loadHistory());
      default: return this.showTitle();
    }
  },

  onAction(action, data) {
    switch (action) {
      case "new":
        Game.newRun();
        return this.render();

      case "continue":
        if (Game.load()) this.render();
        else this.showTitle();
        return;

      case "history":
        return UI.history(Storage.loadHistory());

      case "title":
        return this.showTitle();

      case "hire":
        Game.hire(Number(data.index));
        return this.render();

      case "skip":
        Game.skipHire();
        return this.render();

      case "toformation":
        Game.state.applicants = [];
        Game.state.phase = "formation";
        Game.save();
        return this.render();

      case "up":
        Game.moveUnit(Number(data.index), -1);
        return this.render();

      case "down":
        Game.moveUnit(Number(data.index), 1);
        return this.render();

      case "fire":
        Game.fire(Number(data.uid));
        return this.render();

      case "deploy": {
        const out = Game.deploy();
        if (!out) return;
        this.pendingBattle = out;
        return UI.battle(out.result, out.stageData);
      }

      case "skiplog":
        if (UI.showAllLog) UI.showAllLog();
        return;

      case "afterbattle":
        return this.render();

      case "nextrecruit":
        Game.nextRecruit();
        return this.render();
    }
  }
};

window.addEventListener("DOMContentLoaded", () => App.start());
