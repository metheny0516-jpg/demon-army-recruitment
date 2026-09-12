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
    UI.title(Storage.hasAnySave(), Storage.loadHistory());
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

  renderMenuContext() {
    const scene = UI.root && UI.root.dataset.scene;
    if (scene === "castle" || (scene === "member" && UI.memberFrom === "castle")) {
      return UI.castle(UI.castleTab);
    }
    return this.render();
  },

  report(expression, text, options = {}) {
    if (typeof MormoScene === "undefined") return;
    MormoScene.show({ expression, text, ...options });
  },

  formationReport() {
    const st = Game.state;
    const mission = st && st.selectedMission;
    const foodRisk = st && st.food <= Game.foodNeed();
    // 包帯の身の者がいれば必ず言う。編成画面で枠が空いている理由が分からないと、
    // 「なぜか出せない」だけが残る（オーナー試遊で発覚）。序盤の案内より先に組み立てる
    // ――撤退は1戦目にも起きるので、案内の回だけ黙るわけにはいかない。
    const injured = ((st && st.roster) || []).filter(m => m.injured > 0);
    const injuredLine = injured.length
      ? `${injured.map(m => m.name).join("、")}殿は包帯の身デス。今日は城で。\n` : "";
    if (st && st.generation === 1 && st.turn <= 2) {
      return this.report(injured.length ? "worried" : "report", injuredLine + (st.turn === 1
        ? "並び順が配置デス。先頭ほど狙われやすくなります。\n誰に攻撃を受けてもらうか、能力を見ながら決めてくださいネ。"
        : "前の戦果を手がかりに、組み合わせを試しましょう。\n能力の条件を作れそうな仲間はいますか？"),
        { kicker: "出撃前の人事", title: "宰相モルモ" });
    }
    const culture = Game.armyCulture();
    const cultureLine = culture ? `\nうちの軍風は『${culture}』デス。無理はなさらず。` : "";
    this.report(injured.length || foodRisk ? "worried" : "report",
      `${mission ? `作戦は「${mission.missionTitle}」に決まりました。` : "作戦を承りました。"}\n`
      + injuredLine
      + (foodRisk
        ? "食料が心細いデス。出撃隊だけでなく、留守番の顔ぶれも見直してくださいネ。"
        : "誰を戦わせ、誰に城と暮らしを任せるか――魔王様、最後の人事をお願いします！")
      + cultureLine,
      { kicker: "作戦決定", title: "宰相モルモ・出撃前報告" });
  },

  // 縁の応募者が混ざっているとき、モルモがそれとなく漏らす一言（仕様4.2）。
  bondNote() {
    const applicants = (Game.state && Game.state.applicants) || [];
    // 叩き上げ：終盤に来た低ティア。数字は出さず、顔つきの話にする。
    const veteran = applicants.find(m => m.veteran);
    const veteranLine = veteran ? `\n${veteran.name}殿、小柄ですが歴戦の顔デス。` : "";
    const applicant = applicants.find(m => m.bond);
    if (!applicant) return veteranLine;
    const relic = applicant.relicId ? Game.relicOf(applicant.relicId) : null;
    return veteranLine
      + `\n……この者、${applicant.bond.name}殿の話ばかりしますネ。`
      + (relic ? `\n${applicant.bond.name}殿の${relic.name}を持っていマス。どこで拾ったのやら。` : "");
  },

  battleReport() {
    const st = Game.state;
    const b = st && st.lastBattle;
    if (!b) return;
    // 幕替わり。勇者戦は終わりではなく幕切れなので、通常の勝利報告の**前に**一枚挟む。
    // 起きなかった決着・旧セーブには `actAdvance` が無いので、そのときは何も出ない。
    if (b.actAdvance) {
      const by = b.actAdvance.by;
      return this.report("report",
        (by === "conquest"
          ? `王都は落ちましたデス！ ……ですが王は隣国へ逃げ、援軍を呼んだそうデス。`
          : `勇者は退きましたデス！ ……ですが、隣国の援軍を連れて戻るでしょう。`)
        + `\n魔王様、第${b.actAdvance.to}幕デス。まだ終わりません。`,
        { kicker: "幕替わり", title: "宰相モルモ" });
    }
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
        `${b.army}に敗れ、軍も金庫も空になりました……！\nですが、まだ一度だけ時を巻き戻せます。魔王様、いかがいたしましょう！`,
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
    // 撤退は勝利ではない。phase === "result" を勝利と決めつけると
    // 「退いたのに撃退しました！」というウソの報告になる（オーナー試遊で発覚）。
    // 防衛戦の勝敗は、既定の「撃退しました！」より必ず先に見る（同じ穴）。
    let mExpression, mText, mKicker;
    if (b.defense) {
      if (b.defended) {
        mExpression = "joy";
        mText = `守りましたデス！ 王国は当分おとなしいはず\n${workText}`;
        mKicker = "防衛戦・勤務報告";
      } else {
        mExpression = "worried";
        mText = `……蔵が、荒らされました\n${workText}`;
        mKicker = "防衛戦・勤務報告";
      }
    } else if (b.wiped) {
      mExpression = "worried";
      mText = `${b.army}に……全員、戻りませんでした。\n${st.roster.length ? "城の者で、立て直しましょう。" : "募集を、かけ直しましょう。"}`;
      mKicker = "壊滅・勤務報告";
    } else if (b.lostOnPoints) {
      const carried = (b.contribution || []).filter(c => c.injured && !c.mercenary).map(c => c.name);
      mExpression = "worried";
      mText = `押し返されました。${carried.length ? `${carried.join("、")}殿は担いで戻りました。` : ""}\n${workText}`;
      mKicker = "敗走・勤務報告";
    } else if (b.retreated) {
      const carried = (b.contribution || []).filter(c => c.injured && !c.mercenary).map(c => c.name);
      mExpression = "worried";
      mText = `${b.army}から退きました。${carried.length ? `${carried.join("、")}は生きています。` : ""}`
        + `報酬はありません。\n${workText}`;
      mKicker = "撤退・勤務報告";
    } else {
      mExpression = expression;
      mText = `${b.army}を撃退しました！ 戦果を確認してください。\n${workText}`;
      mKicker = "戦闘・勤務報告";
    }
    // 予告は既存の分岐すべての後に付け足す。ここで一度だけ report する。
    if (st.counterattack && st.counterattack.pending) {
      mText += st.counterattack.kind === "hero"
        ? "\n魔王様。……勇者です。こちらへ来マス"
        : "\n魔王様、王国が討伐隊を出しました。次は、こちらへ来マス";
    }
    this.report(mExpression, mText, { kicker: mKicker, title: "宰相モルモ" });
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
        // 新規は必ずスロットを指定する。中身があるスロットは確認してから上書きする
        // （「続きから」を押し損ねて消える事故を無くすのが目的）。
        if (data.slot && !Storage.slotMeta(data.slot).empty
          && !confirm(`スロット ${data.slot} の魔王軍を消して、新しく始めますか？`)) return;
        Game.newRun(data.king, data.slot);
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
        if (Game.load(data.slot)) {
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

      case "exportsave":
        return UI.saveTransfer(data.slot, "export", Storage.exportRun(data.slot));

      case "importsave":
        return UI.saveTransfer(data.slot, "import", "");

      case "copysave": {
        const area = document.querySelector(".save-text");
        if (!area) return;
        area.select();
        if (navigator.clipboard) navigator.clipboard.writeText(area.value).catch(() => {});
        return;
      }

      case "dosave": {
        const area = document.getElementById("save-import");
        if (Game.importRun(data.slot, area ? area.value : "")) return this.showTitle();
        return this.report("worry", "読めませんデス。書き出した文字列をそのまま貼ってくださいネ。",
          { kicker: "読み込み", title: "宰相モルモ" });
      }

      case "deletesave":
        if (!confirm(`スロット ${data.slot} の魔王軍を消しますか？ 戻せません。`)) return;
        Storage.clearRun(data.slot);
        return this.showTitle();

      case "records":
        return UI.castle("records");

      case "backrecords":
        return this.render();

      case "castle":
        return UI.castle(data.tab || UI.castleTab || "army");

      case "castletab":
        return UI.castle(data.tab);

      // 城下町（2026-09-12）
      case "townbuild": {
        const out = Town.build(Game, data.id);
        UI.castle("town");
        if (out) { const f = Town.facility(out.id); return this.report("joy", `${f.name}が Lv${out.lv} になりました。${f.line}、デス。`, { kicker: "城下町", title: "宰相モルモ" }); }
        return;
      }
      case "townexchange":
        Town.exchange(Game);
        return UI.castle("town");
      case "townborrow": {
        const out = Town.borrow(Game, Number(data.amount));
        UI.castle("town");
        if (out) return this.report("worry", `銀行員「${out.line}」　借金は ${out.debt}G デス。`, { kicker: "魔界銀行", title: "宰相モルモ" });
        return;
      }
      case "townrepay": {
        const out = Town.repay(Game, Number(data.amount));
        UI.castle("town");
        if (out) return this.report("joy", `${out.paid}G 返しました。銀行員「${out.line}」　残り ${out.debt}G。`, { kicker: "魔界銀行", title: "宰相モルモ" });
        return;
      }

      case "backcastle":
        return this.render();

      case "member":
        return UI.memberDetail(data.uid ? Number(data.uid) : null, data.index);

      case "closemember":
        return UI.memberFrom === "castle" ? UI.castle(UI.castleTab) : this.render();

      case "title":
        return this.showTitle();

      case "hire": {
        const hired = Game.state.applicants[Number(data.index)];
        Game.hire(Number(data.index));
        this.render();
        // 遅咲き（裏方の職）を初めて採ったとき、モルモが一度だけほのめかす（技は6戦・12戦で開く。履歴書は「？？？」）。
        // 画面を覆う報告にはしない（採用の流れを止めない）。採用画面の一行として出す（UI 側が lateBloomerHint を読む）。
        if (hired && hired.lateBloomer && !Game.state.lateBloomerHinted && Game.state.roster.some(m => m.uid === hired.uid)) {
          Game.state.lateBloomerHinted = true;
          Game.state.lateBloomerHint = `${hired.name}殿……履歴書に書いていないことがありそうデス。戦場に出すと化けるかもしれませんヨ。`;
          Game.save();
          this.render();
        }
        if (Game.state.phase === "preparation" && Game.state.day === 1) {
          return this.report("report", "魔王様、勇者到着まであと2日デス。\n配置と給与方針はそのまま翌日へ持ち越せます。今日は仕込みに徹するか、辺境へ遠征するかお選びください。",
            { kicker: "1日目・準備日", title: "宰相モルモ・期限報告" });
        }
        return;
      }

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
        return this.renderMenuContext();

      case "down":
        Game.moveDeployed(Number(data.uid), 1);
        return this.renderMenuContext();

      case "front":
        Game.moveDeployedToFront(Number(data.uid));
        return this.renderMenuContext();

      case "toggledeploy":
        Game.toggleDeploy(Number(data.uid));
        return this.renderMenuContext();

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

      case "retain": {
        const m = Game.state.roster.find(x => x.uid === Number(data.uid));
        const out = m ? Game.retain(m.uid) : null;
        this.renderMenuContext();
        if (out && m) return this.report("joy", `${m.name}殿に慰留金 ${out.cost}G を握らせました。忠誠 ${out.loyalty}。荷物は解いたようデス。`,
          { kicker: "慰留", title: "宰相モルモ" });
        return;
      }

      case "fire":
        if (data.confirm === "1" && !window.confirm("この者を解雇しますか？ 城の記録には残ります。")) return;
        Game.fire(Number(data.uid));
        return this.renderMenuContext();

      case "deploy": {
        // offerRetreat を渡すのは UI だけ。提案が出た戦闘では決着が保留され、
        // BattleScene が「続ける／退く」を聞いてから Game.settleBattle() が決着させる。
        // コマンドバトル（2026-09-11）。ラウンドごとに指示を受ける。おまかせ／飛ばすは自動で最後まで回す。
        const out = Game.deploy({ manual: true });
        if (!out) return;
        this.pendingBattle = out;
        return UI.battleManual(out);
      }

      case "skiplog":
        BattleScene.skip();
        return;

      case "autobattle":
        BattleScene.toggleAutoBattle();
        return;

      case "speed":
        BattleScene.cycleSpeed();
        return;

      case "pausebattle":
        BattleScene.togglePause();
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
        return this.report("report", "戦果の記録が終わりました。次の応募者をお連れしますネ。" + this.bondNote(),
          { kicker: "次期採用報告", title: "宰相モルモ" });

      case "eventpick":
        Game.chooseEvent(Number(data.index));
        this.render();
        return this.report("report", Game.state.eventOutcome || "事件はひとまず収まりました……たぶんデス。",
          { kicker: "事件・事後報告", title: "宰相モルモ" });

      case "eventdone":
        Game.nextRecruit();
        this.render();
        return this.report("welcome", "城内も落ち着きました。次の応募者を面接しましょう！" + this.bondNote(),
          { kicker: "人事再開", title: "宰相モルモ" });

      case "nextrecruit":
        Game.nextRecruit();
        this.render();
        return this.report("welcome", "次の応募者をお連れしました。今の軍団に足りない役割を探しましょう！" + this.bondNote(),
          { kicker: "採用報告", title: "宰相モルモ" });

      case "giverelic":
        Game.giveRelic(data.relic, Number(data.uid));
        return this.renderMenuContext();

      case "storerelic":
        Game.storeRelic(data.relic);
        return this.renderMenuContext();

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
