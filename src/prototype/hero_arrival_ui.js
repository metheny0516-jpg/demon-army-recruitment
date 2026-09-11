// 勇者襲来 縦切り試作 v2 ── 画面。
// 状態は HeroArrivalWorld が持ち、ここは描くだけ。
// 本編の Game.state / 本編セーブ / 魔界史には触れない。
(function () {
  "use strict";
  const W = window.HeroArrivalWorld;
  let world = null;
  let pendingReport = null;
  let history = [];          // 直近のラン記録（heroproto_ 名前空間にだけ保存）

  const HISTORY_KEY = "hero_arrival_runs";
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").slice(-5); }
    catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-5))); } catch (e) {}
  }

  function fight(playerRaw, enemyRaw) {
    const p = playerRaw.map(u => Battle.makeUnit(u, "player"));
    const e = enemyRaw.map(u => Battle.makeUnit(u, "enemy"));
    return Battle.simulate(p, e);
  }

  const esc = s => U.esc(s == null ? "" : s);
  // 立ち絵が無い種族は絵文字の台紙にする。壊れた画像には見せない。
  const faceHtml = (p, cls) => UI.hasPortrait(p.tplId)
    ? `<img class="${cls}" src="assets/monsters/${p.tplId}.png" alt="">`
    : `<span class="${cls} pa-face-emoji" role="img" aria-label="${U.esc(p.name)}">${p.icon}</span>`;

  // 能力帯。数値をそのまま読ませるより、役割が伝わるほうを主にする。
  function roleLabel(s) {
    const parts = [];
    if (s.hp >= 100) parts.push("かなり硬い");
    else if (s.hp >= 75) parts.push("硬め");
    else if (s.hp <= 50) parts.push("脆い");
    if (s.atk >= 23) parts.push("高火力");
    else if (s.atk <= 13) parts.push("火力は低い");
    if (s.spd >= 9) parts.push("速い");
    else if (s.spd <= 4) parts.push("遅い");
    return parts.length ? parts.join("・") : "平均的";
  }

  // ── 面接（この試作の中心）────────────────────
  function renderInterview() {
    const p = W.currentApplicant(world);
    if (!p) return renderAssign();

    const iv = world.interview;
    const left = iv.queue.length - iv.index;
    const stats = W.shownStats(p);
    const afford = W.canAfford(world, p);
    const roster = W.hiredPersons(world);
    const why = p.salary > W.remainingBudget(world) ? "予算が足りない"
      : roster.length >= world.maxRoster ? "枠が埋まっている" : "";

    UI.set(`<div class="pa-wrap pa-interview">
      <div class="pa-iv-bar">
        <span>面接 <b>${iv.index + 1}</b> / ${iv.queue.length}</span>
        <span>残り予算 <b class="${W.remainingBudget(world) <= 1 ? "pa-low" : ""}">${W.remainingBudget(world)}G</b> / ${world.budget}G</span>
        <span>枠 <b>${roster.length}</b> / ${world.maxRoster}</span>
      </div>

      <article class="pa-iv-card">
        <div class="pa-iv-photo">
          ${faceHtml(p, "pa-iv-face")}
          <span class="pa-iv-photo-note">${UI.hasPortrait(p.tplId) ? "応募写真" : "写真の提出なし"}</span>
        </div>

        <div class="pa-iv-body">
          <h1>${esc(p.name)}<small>${esc(p.race)}・${esc(p.job)}</small></h1>

          <section class="pa-iv-block pa-iv-known">
            <h2>確かなこと</h2>
            <dl>
              <dt>前職</dt><dd>${esc(p.resume.prev)}</dd>
              <dt>希望給与</dt><dd><b>${p.salary}G</b></dd>
              <dt>見たところ</dt><dd>${esc(roleLabel(stats))}<span class="pa-iv-nums">（HP ${stats.hp}／攻 ${stats.atk}／防 ${stats.def}／速 ${stats.spd}）</span></dd>
            </dl>
          </section>

          <section class="pa-iv-block pa-iv-said">
            <h2>本人の申告</h2>
            <p class="pa-iv-quote">「${esc(p.resume.wish)}」</p>
            <p class="pa-iv-note">${esc(p.resume.note)}</p>
          </section>

          <section class="pa-iv-block pa-iv-unknown">
            <h2>未確認</h2>
            <p>${esc(p.clue)}</p>
            <small>この一文が何を意味するかは、採って働かせるまで分かりません。</small>
          </section>
        </div>
      </article>

      <div class="pa-iv-actions">
        ${afford
          ? `<button class="pa-go" data-action="hire" data-person="${p.id}">採用する（${p.salary}G）</button>`
          : `<button class="pa-go" disabled>採用できない（${esc(why)}）</button>`}
        <button class="pa-pass" data-action="pass" data-person="${p.id}">見送る</button>
      </div>
      <p class="pa-iv-warn">見送った人はこのランには戻ってきません。残り <b>${left - 1}</b> 人。</p>

      ${roster.filter(x => x.salary > 0).length
        ? `<div class="pa-iv-roster">採用済み：${roster.filter(x => x.salary > 0).map(x => `${esc(x.name)}（${x.salary}G）`).join("　")}</div>`
        : `<div class="pa-iv-roster">在籍：ガロ・ガンツ（無給の古参）</div>`}

      ${historyHtml()}
    </div>`, "recruit");
  }

  function historyHtml() {
    if (!history.length) return "";
    return `<details class="pa-hist"><summary>これまでのラン（${history.length}）</summary>
      <ol>${history.map(r => `<li>
        <b>${r.victory ? "勝ち" : "負け"}</b>
        ${esc(r.hires.join("・") || "追加採用なし")}
        <span>相手は「${esc(r.condition)}」だった／酒の賭け：${esc(r.bet)}</span>
        ${r.found && r.found.length ? `<span>判明：${esc(r.found.join("、"))}</span>` : ""}
        ${r.passed && r.passed.length ? `<span class="pa-hist-pass">見送った：${esc(r.passed.join("、"))}</span>` : ""}
      </li>`).join("")}</ol></details>`;
  }

  // ── 配属 ────────────────────────────────────
  function renderAssign() {
    if (world.segment === -1) W.closeInterview(world);
    const roster = W.hiredPersons(world);
    const cards = roster.map(p => {
      const stats = W.shownStats(p);
      const rank = W.shownRank(p);
      const jobs = ["guard", "gate", "tavern", "patrol"].map(id =>
        `<button class="pa-chip${p.assignment === id ? " on" : ""}" data-action="assign" data-person="${p.id}" data-job="${id}">${esc(W.JOBS[id].short)}</button>`).join("");
      const policy = p.assignment === "tavern"
        ? `<div class="pa-policy">
             <button class="pa-chip${p.serveOutsiders ? " on" : ""}" data-action="serve" data-person="${p.id}" data-allow="1">試飲も任せる</button>
             <button class="pa-chip${p.serveOutsiders ? "" : " on"}" data-action="serve" data-person="${p.id}" data-allow="0">販売のみ</button>
           </div>` : "";
      return `<article class="pa-card is-hired">
        <div class="pa-head">${faceHtml(p, "pa-face")}
          <div class="pa-id"><b>${esc(p.name)}</b>
            <span class="pa-sub">${esc(p.race)}・${esc(p.job)}${rank.id !== "soldier" ? `／${esc(rank.name)}` : ""}</span>
            <span class="pa-sub">HP ${stats.hp}／攻 ${stats.atk}／防 ${stats.def}／速 ${stats.spd}</span>
          </div>
        </div>
        <p class="pa-clue">${esc(p.clue || "古参。書類は残っていない。")}</p>
        <div class="pa-jobs">${jobs}</div>${policy}
      </article>`;
    }).join("");

    UI.set(`<div class="pa-wrap">
      <header class="pa-top"><h1>配属</h1>
        <p class="pa-lead">誰をどこに置くかで、起きることが変わります。<br>
        <b>店に人を割けば迎撃が薄くなり、全員を守備に回せば城下では何も起きません。</b></p>
      </header>
      <section class="pa-panel">
        <div class="pa-grid">${cards}</div>
        <table class="pa-table"><tbody>
          ${["guard", "gate", "tavern", "patrol"].map(id => {
            const j = W.JOBS[id];
            return `<tr><th>${esc(j.name)}</th><td>${esc(W.PLACES[j.place].name)}</td><td>${esc(j.desc)}</td></tr>`;
          }).join("")}
        </tbody></table>
        <p class="pa-note">酒を造れるかは本人の能力です。店に置いただけでは造れません。
        近郊警戒は準備段階でだけ選べます。生きて帰れば戦功が付きますが、帰らないこともあります。</p>
      </section>
      <div class="pa-actions"><button class="pa-go" data-action="advance">任せて進める</button></div>
    </div>`, "formation");
  }

  // ── 報告 ────────────────────────────────────
  function renderReport(report) {
    const routine = report.lines.filter(l => l.routine);
    const notable = report.lines.filter(l => !l.routine);
    const patrol = report.patrol
      ? `<button class="pa-chip" data-action="watchpatrol">近郊警戒の戦闘を見る</button>` : "";

    UI.set(`<div class="pa-wrap">
      <header class="pa-top"><h1>${esc(report.headline)}</h1>
        <p class="pa-lead">区間 ${report.segment} / 3</p></header>
      <section class="pa-panel">
        ${report.mormo ? `<div class="pa-mormo">
          <img src="assets/mormo/${esc(report.mormo.expression)}.webp" alt="宰相モルモ">
          <p>${esc(report.mormo.text)}</p></div>` : ""}
        ${notable.length
          ? `<ul class="pa-report">${notable.map(l => `<li class="${l.hit ? "is-hit" : l.miss ? "is-miss" : ""}">${esc(l.text)}${
              l.guestLine ? `<span class="pa-quote">旅の方「${esc(l.guestLine)}」</span>` : ""}${
              l.revealed ? `<span class="pa-badge">${esc(l.revealed)}</span>` : ""}${
              l.promoted ? `<span class="pa-badge">${esc(l.promoted)}</span>` : ""}</li>`).join("")}</ul>`
          : `<p class="pa-note">特に報告はありません。</p>`}
        ${routine.length ? `<p class="pa-routine">${esc(routine.map(l => l.text).join(" "))}</p>` : ""}
        ${patrol}
      </section>
      ${report.revealed && report.revealed.length
        ? `<section class="pa-panel pa-reveal"><h2>採用の答え合わせ</h2>
           <ul>${report.revealed.map(r => `<li><b>${esc(r.name)}</b>：${esc(r.reveal)}</li>`).join("")}</ul></section>` : ""}
      <div class="pa-actions"><button class="pa-go" data-action="advance">任せて進める</button></div>
    </div>`, "report");
  }

  // ── 到着 ────────────────────────────────────
  function renderArrival() {
    const list = W.deployable(world);
    const chosen = list.filter(p => p.deployed).sort((a, b) => a.deployOrder - b.deployOrder);
    const cards = list.map(p => {
      const stats = W.shownStats(p);
      return `<article class="pa-card${p.deployed ? " is-selected" : ""}">
        <div class="pa-head">${faceHtml(p, "pa-face")}
          <div class="pa-id"><b>${esc(p.name)}</b>
            <span class="pa-sub">HP ${stats.hp}／攻 ${stats.atk}／防 ${stats.def}／速 ${stats.spd}</span>
            ${!p.revealed && p.hidden !== "none" ? `<span class="pa-sub pa-unknown">未確認：${esc(p.clue)}</span>` : ""}
          </div>
        </div>
        <button class="pa-chip${p.deployed ? " on" : ""}" data-action="deploy" data-person="${p.id}">${p.deployed ? "編成済み" : "迎撃隊に入れる"}</button>
      </article>`;
    }).join("");

    const drunk = W.heroUnits(world).find(u => u.drunk);
    UI.set(`<div class="pa-wrap">
      <header class="pa-top"><h1>勇者到着</h1></header>
      <section class="pa-panel">
        <h2>敵情</h2>
        <ul class="pa-enemies">${W.heroUnits(world).map(u =>
          `<li><span class="pa-e-icon">${u.icon}</span><b>${esc(u.name)}</b>
            <span>HP ${u.hp}／攻 ${u.atk}／防 ${u.def}／速 ${u.spd}</span>
            ${u.drunk ? `<em class="pa-drunk">${esc(u.drunk)}</em>` : ""}
            ${(u.traits || []).includes("hero_awaken") ? `<em>覚醒：HP50%以下でダメージ+50%</em>` : ""}</li>`).join("")}
        </ul>
        ${drunk ? `<p class="pa-note pa-note-hot">城下で起きたことが、そのまま敵情に出ています。</p>` : ""}
      </section>
      <section class="pa-panel">
        <h2>迎撃隊（選んだ順が並び順。先頭が狙われやすい）</h2>
        <p class="pa-squad">${chosen.length ? chosen.map((p, i) => `<span>${i + 1}. ${esc(p.name)}</span>`).join("") : "<span>まだ誰も選んでいません</span>"}</p>
        <div class="pa-grid">${cards}</div>
      </section>
      <div class="pa-actions"><button class="pa-go" data-action="startbattle">この編成で迎え撃つ</button></div>
    </div>`, "report");
  }

  // ── 決着 ────────────────────────────────────
  function renderOutcome() {
    const o = world.outcome;
    const rec = W.runRecord(world);
    const sentences = W.outcomeSentences(world);
    // ラン中に判明したものを全部出す（近郊警戒で分かったぶんも含める）
    const revealed = world.facts.filter(f => f.verb === "reveal").map(f => {
      const p = W.person(world, f.actor);
      const t = W.HIDDEN_TRAITS[f.trait];
      return { name: p ? p.name : f.actor, reveal: t.reveal, label: t.label };
    });

    UI.set(`<div class="pa-wrap">
      <header class="pa-top">
        <h1>${o.victory ? "迎撃成功" : o.kind === "occupied" ? "占領された" : "迎撃失敗"}</h1>
      </header>

      <section class="pa-panel pa-reveal">
        <h2>採用の答え合わせ</h2>
        <p class="pa-iv-reveal-line">相手は <b>「${esc(rec.condition)}」</b> だった。${
          rec.bet === "当たり" ? `${esc(rec.drink)}は通った。`
          : rec.bet === "外れ" ? "酒は断られた。" : "酒は出していない。"}</p>
        ${revealed.length
          ? `<ul>${revealed.map(r => `<li><b>${esc(r.name)}</b>：${esc(r.label)}。${esc(r.reveal)}</li>`).join("")}</ul>`
          : `<p class="pa-note">履歴書に書いていないことは、今回は出てきませんでした。</p>`}
        ${rec.passed.length ? `<p class="pa-hist-pass">見送った人：${esc(rec.passed.join("、"))}</p>` : ""}
      </section>

      <section class="pa-panel">
        <h2>${o.victory ? "戦果" : "結果"}</h2>
        ${sentences.length ? `<ul class="pa-report">${sentences.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
        ${o.contribution ? `<table class="pa-table"><thead><tr><th>人物</th><th>与</th><th>被</th><th>撃破</th><th></th></tr></thead><tbody>
          ${o.contribution.map(c => `<tr><th>${esc(c.name)}</th><td>${c.dealt}</td><td>${c.taken}</td><td>${c.kills}</td><td>${c.survived ? "生還" : "戦没"}</td></tr>`).join("")}
        </tbody></table>` : ""}
      </section>

      ${historyHtml()}

      <div class="pa-actions">
        <button class="pa-go" data-action="restart">次のランへ（応募者が変わります）</button>
      </div>
    </div>`, "report");
  }

  // ── 戦闘再生 ────────────────────────────────
  function playBattle(result, army, region, onDone) {
    UI.set(BattleScene.shell({ stage: 1, army, region }), "battle");
    BattleScene.play(result.timeline, () => {
      const btn = document.getElementById("next-btn");
      if (btn) btn.textContent = "先へ進む";
      window.__paAfterBattle = onDone;
    });
  }

  function waitForMormo(fn) {
    const timer = setInterval(() => {
      if (!MormoScene.active) { clearInterval(timer); fn(); }
    }, 60);
  }

  function advance() {
    const report = W.advance(world, fight);
    if (!report) return;
    pendingReport = report;
    if (report.segment === 3) {
      const m = report.mormo;
      MormoScene.show({ expression: m.expression, text: m.text,
        kicker: m.emphasis === 3 ? "魔王軍・緊急報告" : "魔王軍・臨時報告" });
      waitForMormo(() => {
        if (m.detail) {
          MormoScene.show({ expression: "report", text: m.detail, kicker: "分かっている事実" });
          waitForMormo(renderArrival);
        } else renderArrival();
      });
      return;
    }
    renderReport(report);
  }

  function start(options) {
    world = W.newWorld(options || {});
    pendingReport = null;
    history = loadHistory();
    renderInterview();
  }

  function rerender() {
    if (world.segment === -1) return renderInterview();
    if (world.segment === 0) return renderAssign();
    if (world.segment === 3) return renderArrival();
    if (world.segment >= 4) return renderOutcome();
    return renderReport(pendingReport);
  }

  function bind() {
    UI.bind((action, data) => {
      if (action === "hire") { W.hire(world, data.person, "guard"); return rerender(); }
      if (action === "pass") { W.pass(world, data.person); return rerender(); }
      if (action === "assign") { W.assign(world, data.person, data.job); return renderAssign(); }
      if (action === "serve") { W.setServePolicy(world, data.person, data.allow === "1"); return renderAssign(); }
      if (action === "advance") return advance();
      if (action === "watchpatrol")
        return playBattle(pendingReport.patrol, "王国巡回隊", "近郊", () => renderReport(pendingReport));
      if (action === "deploy") {
        const p = W.person(world, data.person);
        p.deployed = !p.deployed;
        if (p.deployed) p.deployOrder = Date.now() + Math.random();
        return renderArrival();
      }
      if (action === "startbattle") {
        const squad = W.deployable(world).filter(p => p.deployed)
          .sort((a, b) => a.deployOrder - b.deployOrder).map(p => p.id);
        const outcome = W.resolveInterception(world, squad, fight);
        history = loadHistory().concat([W.runRecord(world)]);
        saveHistory(history);
        history = loadHistory();
        if (outcome.kind === "occupied") return renderOutcome();
        return playBattle(world.battle, "勇者アレン一行", "魔王城", renderOutcome);
      }
      if (action === "restart") return start({});
      if (action === "speed") return BattleScene.cycleSpeed();
      if (action === "pausebattle") return BattleScene.togglePause();
      if (action === "skiplog") return BattleScene.skip();
      if (action === "afterbattle") {
        const fn = window.__paAfterBattle; window.__paAfterBattle = null;
        if (fn) fn();
      }
    });
  }

  window.HeroArrivalUI = { start, bind, get world() { return world; }, fight };
})();
