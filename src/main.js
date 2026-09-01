// アプリ全体の進行役。画面遷移とユーザー操作の受け口だけを持つ。
const App = {
  pendingBattle: null,

  start() {
    UI.init(document.getElementById("app"));
    if (typeof Sound !== "undefined") Sound.init();
    if (typeof Music !== "undefined") Music.init();
    UI.bind((action, data) => this.onAction(action, data));
    this.showTitle();
  },

  showTitle() {
    Game.state = null;
    this.music("title");
    UI.title(!!Storage.loadRun(), Storage.loadHistory());
  },

  // BGMは「軍団そのものが演奏している」ので、場面名だけ渡せば
  // 編成・昇進・未払い・忠誠・警戒度は Music 側が状態から読み取る。
  MUSIC_SCENES: {
    recruit: "recruit", event: "recruit",
    mission: "mission", formation: "mission",
    result: "mission", defeat: "defeat",
    gameover: "defeat", clear: "victory"
  },

  music(scene) {
    if (typeof Music === "undefined") return;
    Music.update(Game.state, { scene });
  },

  render() {
    const st = Game.state;
    if (!st) return this.showTitle();
    this.music(this.MUSIC_SCENES[st.phase] || "recruit");
    switch (st.phase) {
      case "recruit": return UI.recruit();
      case "mission": return UI.mission();
      case "formation": return UI.formation();
      case "result": return UI.result();
      case "event": return UI.event();
      case "defeat": return UI.defeat();
      case "gameover":
      case "clear": return UI.gameover(st.record, Storage.loadHistory());
      default: return this.showTitle();
    }
  },

  onAction(action, data) {
    if (typeof Sound !== "undefined") Sound.ui(action);
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

      case "reroll":
        Game.reroll();
        return this.render();

      case "skip":
        Game.skipHire();
        return this.render();

      case "toformation":
        Game.state.applicants = [];
        Game.prepareMissions(true);
        return this.render();

      case "missionpick":
        Game.selectMission(Number(data.index));
        return this.render();

      case "backrecruit":
        Game.backToRecruit();
        return this.render();

      case "backmission":
        Game.backToMissions();
        return this.render();

      case "up":
        Game.moveDeployed(Number(data.uid), -1);
        return this.render();

      case "down":
        Game.moveDeployed(Number(data.uid), 1);
        return this.render();

      case "toggledeploy":
        Game.toggleDeploy(Number(data.uid));
        return this.render();

      case "assigndepartment":
        Game.assignDepartment(Number(data.uid), data.department);
        return this.render();

      case "payrollpolicy":
        Game.setPayrollPolicy(data.policy);
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
        BattleScene.skip();
        return;

      case "speed":
        BattleScene.cycleSpeed();
        return;

      case "afterbattle":
        return this.render();

      case "afterresult":
        Game.afterResult();
        return this.render();

      case "eventpick":
        Game.chooseEvent(Number(data.index));
        return this.render();

      case "eventdone":
        Game.nextRecruit();
        return this.render();

      case "nextrecruit":
        Game.nextRecruit();
        return this.render();

      case "retry":
        Game.retry();
        return this.render();

      case "concede":
        Game.concede();
        return this.render();
    }
  }
};

window.addEventListener("DOMContentLoaded", () => App.start());
