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
    if (typeof MormoScene !== "undefined") MormoScene.close();
    Game.state = null;
    if (typeof KPI !== "undefined") KPI.screen(null);
    this.music("title");
    UI.title(!!Storage.loadRun(), Storage.loadHistory());
  },

  // BGMは「軍団そのものが演奏している」ので、場面名だけ渡せば
  // 編成・昇進・未払い・忠誠・警戒度は Music 側が状態から読み取る。
  MUSIC_SCENES: {
    recruit: "recruit", event: "recruit",
    mission: "mission", formation: "mission", preparation: "mission",
    result: "mission", facility: "mission", defeat: "defeat",
    gameover: "defeat", clear: "victory"
  },

  music(scene) {
    if (typeof Music === "undefined") return;
    Music.update(Game.state, { scene });
  },

  report(expression, text, options = {}) {
    if (typeof MormoScene === "undefined") return;
    MormoScene.show({ expression, text, ...options });
  },

  formationReport() {
    const st = Game.state;
    const mission = st && st.selectedMission;
    const foodRisk = st && st.food <= Game.foodNeed();
    if (st && st.generation === 1 && st.turn <= 2) {
      return this.report("report", st.turn === 1
        ? "並び順が配置デス。先頭ほど狙われやすくなります。\n誰に攻撃を受けてもらうか、能力を見ながら決めてくださいネ。"
        : "前の戦果を手がかりに、組み合わせを試しましょう。\n能力の条件を作れそうな仲間はいますか？",
        { kicker: "出撃前の人事", title: "宰相モルモ" });
    }
    this.report(foodRisk ? "worried" : "report",
      `${mission ? `作戦は「${mission.missionTitle}」に決まりました。` : "作戦を承りました。"}\n`
      + (foodRisk
        ? "食料が心細いデス。出撃隊だけでなく、生活部門の配属も見直してくださいネ。"
        : "誰を戦わせ、誰に城と暮らしを任せるか――魔王様、最後の人事をお願いします！"),
      { kicker: "作戦決定", title: "宰相モルモ・出撃前報告" });
  },

  battleReport() {
    const st = Game.state;
    const b = st && st.lastBattle;
    if (!b) return;
    if (st.phase === "clear") {
      return this.report("joy", `${b.army}を撃破――人間界制圧デス！\n魔王様、この軍団の歴史を刻みましょう！`,
        { kicker: "最終戦果報告", title: "宰相モルモ" });
    }
    if (st.phase === "gameover") {
      return this.report("worried", `${b.army}との戦いで軍団は壊滅しました……。\nこの歩みを魔界史へ残します。`,
        { kicker: "最終戦況報告", title: "宰相モルモ" });
    }
    if (st.phase === "defeat") {
      return this.report("panic",
        `${b.army}に敗北しました……！\nですが、まだ一度だけ時を巻き戻せます。編成を変えて再起しましょう、魔王様！`,
        { kicker: "緊急戦況報告", title: "宰相モルモ" });
    }
    const work = st.lastDepartmentReport || {};
    const expression = work.foodShortage ? "panic"
      : work.facilityAfter > work.facilityBefore ? "joy" : "report";
    const workText = work.foodShortage
      ? `ただし食料が${work.foodShortage}不足！ 忠誠低下に注意デス！`
      : work.facilityAfter > work.facilityBefore
        ? `さらに施設が完成！ ${Game.facilityInfo().name}が次の出撃隊を支えます！`
        : `現在、食料${st.food}・建材${st.materials}・施設Lv.${st.facilityLevel}デス。`;
    this.report(expression,
      `${b.army}を撃退しました！ 戦果を確認してください。\n${workText}`,
      { kicker: "戦闘・勤務報告", title: "宰相モルモ" });
  },

  render() {
    const st = Game.state;
    if (typeof KPI !== "undefined") KPI.screen(st);   // 最後にいた画面と攻略段階（＝止まった場所）
    if (!st) return this.showTitle();
    this.music(this.MUSIC_SCENES[st.phase] || "recruit");
    switch (st.phase) {
      case "recruit": return UI.recruit();
      case "mission": return UI.mission();
      case "formation": return UI.formation();
      case "preparation": return UI.formation();
      case "result": return UI.result();
      case "facility": return UI.facility();
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
        Game.newRun(data.king);
        this.render();
        {
          const returning = Game.state.applicants.find(m => m.legacy);
          const king = Game.demonKing();
          return this.report(returning ? "joy" : "welcome",
            returning
              ? `${king.name}様の魔王軍設立デス！\nそれと魔界史に名を残した ${returning.name} が再応募してきましたヨ！ 能力と階級は新任からデスが、これは運命かもしれませんネ。`
              : Game.state.generation === 1
                ? `${king.name}様の魔王軍設立デス！\n履歴書の能力は「いつ起きるか → 何が起きるか」で読めます。まずは気になる能力を持つ人材を探してくださいネ。`
                : `${king.name}様の魔王軍設立デス！\n${king.desc}\n強さだけでなく、どこで働けるかも見て採用してくださいネ。`,
            { kicker: returning ? "歴史が動いた" : "第1回 魔王軍人事", title: "宰相モルモ" });
        }

      case "continue":
        if (Game.load()) {
          this.render();
          this.report("report", "おかえりなさいませ、魔王様！ 現在の状況から作戦を再開します。",
            { kicker: "作戦再開", title: "宰相モルモ" });
        }
        else this.showTitle();
        return;

      case "mormocontinue":
        if (typeof MormoScene !== "undefined") MormoScene.advance();
        return;

      case "history":
        return UI.history(Storage.loadHistory());

      case "title":
        return this.showTitle();

      case "hire":
        Game.hire(Number(data.index));
        this.render();
        if (Game.state.phase === "preparation" && Game.state.day === 1) {
          return this.report("report", "魔王様、勇者到着まであと2日デス。\n配置と給与方針はそのまま翌日へ持ち越せます。今日は仕込みに徹するか、辺境へ遠征するかお選びください。",
            { kicker: "1日目・準備日", title: "宰相モルモ・期限報告" });
        }
        return;

      case "reroll":
        Game.reroll();
        return this.render();

      case "skip":
        Game.skipHire();
        return this.render();

      case "toformation":
        Game.finishRecruitment();
        return this.render();

      case "seize":
        if (!Game.seizeStronghold()) return;
        Game.afterResult();
        this.render();
        return this.report("joy", "拠点、接収完了デス！\n建設担当がいなくても城は建ちます。ただし王国には見つかりましタ……",
          { kicker: "拠点接収", title: "宰相モルモ・接収報告" });

      case "chooselesson":
        if (!Game.chooseLesson(data.id)) return;
        this.render();
        return;

      case "choosefacility":
        Game.chooseFacility(data.id);
        this.render();
        return this.report("joy", `大型施設「${Game.activeFacility().name}」を稼働します！ この軍団の壊れ方を決める設備デス！`,
          { kicker: "施設方針決定", title: "宰相モルモ・竣工報告" });

      case "endday": {
        const report = Game.advanceDay(Number(data.day));
        if (!report) return;
        this.render();
        const day = Game.state.day;
        const text = day === 2
          ? "魔王様、明日、勇者が到着します。\n本日の配置は引き継いであります。必要な所だけ直してくださいネ。"
          : "うわああああ！ 魔王様、本日、勇者襲来デス！\nこの2日で整えた軍団で、魔王城を守りましょう！";
        return this.report(day === 3 ? "panic" : "worried", text,
          { kicker: `${day}日目${day === 3 ? "・防衛戦" : "・準備日"}`, title: "宰相モルモ・期限報告" });
      }

      case "openingbattle":
        if (!Game.prepareOpeningBattle(data.kind)) return;
        this.render();
        return this.formationReport();

      case "missionpick":
        Game.selectMission(Number(data.index));
        this.render();
        return this.formationReport();

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

      case "front":
        Game.moveDeployedToFront(Number(data.uid));
        return this.render();

      case "toggledeploy":
        Game.toggleDeploy(Number(data.uid));
        return this.render();

      case "assigndepartment":
        Game.assignDepartment(Number(data.uid), data.department);
        return this.render();

      case "kingmerge":
        Game.setKingSlimeMerge(data.on === "1");
        return this.render();

      case "hiremerc":
        Game.hireMercenary(Number(data.index));
        return this.render();

      case "brief":
        Game.postBrief(data.brief);
        return this.render();

      case "feast":
        Game.holdFeast();
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
        this.render();
        return this.battleReport();

      case "afterresult":
        Game.afterResult();
        this.render();
        if (Game.state.phase === "preparation") {
          return this.report("report", "遠征隊が帰還しました。\nまだ今日の業務は終わっていません。配置を確認したら、日次決算へ進めましょう。",
            { kicker: `${Game.state.day}日目・遠征帰還`, title: "宰相モルモ" });
        }
        if (Game.state.phase === "event") {
          const ev = Game.currentEvent();
          return this.report("angry", `魔王様、大変デス！\n${ev ? ev.title : "城内事件"}が起きました！`,
            { kicker: "魔王城・緊急報告", title: "宰相モルモ" });
        }
        if (Game.state.phase === "clear" || Game.state.phase === "gameover") {
          const won = Game.state.phase === "clear";
          return this.report(won ? "joy" : "worried",
            won ? "やりましたネ、魔王様！ 人間界制圧デス！ この軍団の歴史を刻みましょう！"
              : "この魔王軍の歩みは、次の世代のために魔界史へ残しますネ。",
            { kicker: "最終報告", title: "宰相モルモ" });
        }
        return this.report("report", "戦果の記録が終わりました。次の応募者をお連れしますネ。",
          { kicker: "次期採用報告", title: "宰相モルモ" });

      case "eventpick":
        Game.chooseEvent(Number(data.index));
        this.render();
        return this.report("report", Game.state.eventOutcome || "事件はひとまず収まりました……たぶんデス。",
          { kicker: "事件・事後報告", title: "宰相モルモ" });

      case "eventdone":
        Game.nextRecruit();
        this.render();
        return this.report("welcome", "城内も落ち着きました。次の応募者を面接しましょう！",
          { kicker: "人事再開", title: "宰相モルモ" });

      case "nextrecruit":
        Game.nextRecruit();
        this.render();
        return this.report("welcome", "次の応募者をお連れしました。今の軍団に足りない役割を探しましょう！",
          { kicker: "採用報告", title: "宰相モルモ" });

      case "retry":
        Game.retry();
        this.render();
        return this.report("worried", "時を巻き戻しました……今度こそ勝てる人材と配属を考えましょう！",
          { kicker: "再起報告", title: "宰相モルモ" });

      case "concede":
        Game.concede();
        this.render();
        return this.report("worried", "お疲れさまでした、魔王様。この失敗も、次の魔王軍の歴史に残しますネ。",
          { kicker: "最終報告", title: "宰相モルモ" });
    }
  }
};

window.addEventListener("DOMContentLoaded", () => App.start());
