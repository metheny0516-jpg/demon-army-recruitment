// 勇者襲来 縦切り試作 ── 画面。
// 状態は HeroArrivalWorld が持ち、ここは描くだけ（本編 UI と同じ約束）。
// 本編の Game.state / Storage / 魔界史には一切触れない。
(function () {
  "use strict";
  const W = window.HeroArrivalWorld;
  let world = null;
  let pendingReport = null;

  // 既存の戦闘エンジンをそのまま使う。試作用の計算は足さない。
  function fight(playerRaw, enemyRaw) {
    const p = playerRaw.map(u => Battle.makeUnit(u, "player"));
    const e = enemyRaw.map(u => Battle.makeUnit(u, "enemy"));
    return Battle.simulate(p, e);
  }

  const esc = s => U.esc(s == null ? "" : s);

  function personCard(p, opts) {
    opts = opts || {};
    const stats = W.statsOf(p);
    const rank = W.rankOf(p);
    const place = W.placeOf(world, p);
    const job = p.assignment ? W.JOBS[p.assignment] : null;
    const face = UI.hasPortrait(p.tplId)
      ? `<img class="pa-face" src="assets/monsters/${p.tplId}.png" alt="">`
      : `<span class="pa-face pa-face-emoji">${p.icon}</span>`;
    return `<article class="pa-card${p.hired ? " is-hired" : ""}${opts.selected ? " is-selected" : ""}${p.alive ? "" : " is-dead"}">
      <div class="pa-head">
        ${face}
        <div class="pa-id">
          <b>${esc(p.name)}</b>
          <span class="pa-sub">${esc(p.race)}・${esc(p.job)}${rank.id !== "soldier" ? `／${esc(rank.name)}` : ""}</span>
          <span class="pa-sub">希望給与 ${p.salary}G</span>
        </div>
      </div>
      <dl class="pa-resume">
        <dt>前職</dt><dd>${esc(p.resume.prev)}</dd>
        <dt>希望</dt><dd>${esc(p.resume.wish)}</dd>
        <dt>備考</dt><dd>${esc(p.resume.note)}</dd>
      </dl>
      <p class="pa-stats">HP ${stats.hp}／攻 ${stats.atk}／防 ${stats.def}／速 ${stats.spd}</p>
      ${p.hired
        ? `<p class="pa-job">いまの仕事：<b>${esc(job ? job.name : "未指定")}</b>${place ? `（${esc(W.PLACES[place].name)}）` : ""}</p>`
        : `<p class="pa-job pa-job-open">未採用</p>`}
      ${opts.controls || ""}
    </article>`;
  }

  function jobButtons(p) {
    const ids = ["guard", "gate", "tavern", "stores"];
    if (world.segment === 0) ids.push("patrol");
    const buttons = ids.map(id => `<button class="pa-chip${p.assignment === id ? " on" : ""}"
      data-action="assign" data-person="${p.id}" data-job="${id}">${esc(W.JOBS[id].name)}</button>`).join("");
    // 裁量。店を任せたときだけ意味がある（提供禁止なら酒は在庫に残るだけ）。
    const policy = p.assignment === "tavern"
      ? `<div class="pa-policy">
           <button class="pa-chip${p.serveOutsiders ? " on" : ""}" data-action="serve" data-person="${p.id}" data-allow="1">試飲も任せる</button>
           <button class="pa-chip${p.serveOutsiders ? "" : " on"}" data-action="serve" data-person="${p.id}" data-allow="0">販売のみ（外の者に振る舞うな）</button>
         </div>` : "";
    return `<div class="pa-jobs">${buttons}</div>${policy}`;
  }

  // ── 準備画面 ─────────────────────────────
  function renderPrep() {
    const hired = W.hiredPersons(world);
    const cond = W.GUEST_CONDITIONS[world.guestCondition];
    const cards = world.persons.map(p => personCard(p, {
      controls: p.hired
        ? jobButtons(p)
        : `<div class="pa-jobs">${["guard", "gate", "tavern", "stores", "patrol"].map(id =>
            `<button class="pa-chip" data-action="hire" data-person="${p.id}" data-job="${id}">${esc(W.JOBS[id].name)}で雇う</button>`).join("")}</div>`
    })).join("");

    UI.set(`<div class="pa-wrap">
      <header class="pa-top">
        <h1>勇者襲来 — 縦切り試作</h1>
        <p class="pa-lead">魔王城へ勇者一行が近づいている。応募者を採り、仕事を任せて、様子を見る。<br>
        <b>本編のセーブ・戦績・魔界史には一切書き込まない独立した入口です。</b></p>
      </header>

      <section class="pa-panel">
        <h2>いまの状況</h2>
        <ul class="pa-facts">
          <li>在籍 <b>${hired.length}</b>／${world.maxRoster}名（ガロとガンツは既に勤務中）</li>
          <li>相手の条件：<b>${esc(cond.name)}</b> — ${esc(cond.hint)}</li>
          <li>この条件は「相手側」の設定です。こちらが誰を採ったかでは変わりません。</li>
        </ul>
        <div class="pa-cond">
          <span>比較用に切り替える：</span>
          ${Object.values(W.GUEST_CONDITIONS).map(c =>
            `<button class="pa-chip${world.guestCondition === c.id ? " on" : ""}" data-action="cond" data-cond="${c.id}">${esc(c.id)}：${esc(c.name)}</button>`).join("")}
          <button class="pa-chip" data-action="reseed">別の乱数で見る（seed ${world.seed}）</button>
        </div>
      </section>

      <section class="pa-panel">
        <h2>仕事の意味</h2>
        <table class="pa-table"><tbody>
          ${Object.values(W.JOBS).map(j =>
            `<tr><th>${esc(j.name)}</th><td>${esc(W.PLACES[j.place].name)}</td><td>${esc(j.desc)}</td></tr>`).join("")}
        </tbody></table>
        <p class="pa-note">仕事は場所と、触れられる物と、してよいことを決めます。能力は本人に付いています。
        酒を造れるのは酒造の心得がある者だけで、店を任せただけでは造れません。</p>
      </section>

      <section class="pa-panel">
        <h2>名簿と応募者</h2>
        <div class="pa-grid">${cards}</div>
      </section>

      <div class="pa-actions">
        <button class="pa-go" data-action="advance">任せて進める</button>
      </div>
    </div>`, "report");
  }

  // ── 報告画面 ─────────────────────────────
  function renderReport(report) {
    const routine = report.lines.filter(l => l.routine);
    const notable = report.lines.filter(l => !l.routine);
    const patrol = report.patrol
      ? `<div class="pa-patrol">
          <h3>近郊警戒</h3>
          <p>${report.patrol.victory ? "巡回兵を退けた。" : "退けられなかった。"}</p>
          <button class="pa-chip" data-action="watchpatrol">この戦闘を見る</button>
         </div>` : "";

    UI.set(`<div class="pa-wrap">
      <header class="pa-top"><h1>${esc(report.headline)}</h1>
        <p class="pa-lead">区間 ${report.segment} ／ 3</p></header>
      ${patrol}
      <section class="pa-panel">
        <h2>報告</h2>
        ${report.mormo ? `<div class="pa-mormo pa-mormo-${esc(report.mormo.expression)}">
          <img src="assets/mormo/${esc(report.mormo.expression)}.webp" alt="宰相モルモ">
          <p>${esc(report.mormo.text)}</p></div>` : ""}
        ${notable.length
          ? `<ul class="pa-report">${notable.map(l => `<li>${esc(l.text)}${
              l.guestLine ? `<span class="pa-quote">客「${esc(l.guestLine)}」</span>` : ""}${
              l.promoted ? `<span class="pa-badge">${esc(l.promoted)}</span>` : ""}</li>`).join("")}</ul>`
          : `<p class="pa-note">特に報告はありません。</p>`}
        ${routine.length
          ? `<p class="pa-routine">${esc(routine.map(l => l.text).join(" "))}</p>` : ""}
      </section>
      <section class="pa-panel">
        <h2>名簿</h2>
        <div class="pa-grid">${W.hiredPersons(world).map(p =>
          personCard(p, { controls: jobButtons(p) })).join("")}</div>
        <p class="pa-note">仕事を変えると、次の未解決の活動から有効になります。済んだ勤務はやり直しません。</p>
      </section>
      <div class="pa-actions"><button class="pa-go" data-action="advance">任せて進める</button></div>
    </div>`, "report");
  }

  // ── 勇者到着 ─────────────────────────────
  function renderArrival() {
    const list = W.deployable(world);
    const cards = list.map(p => personCard(p, {
      selected: p.deployed,
      controls: `<button class="pa-chip${p.deployed ? " on" : ""}" data-action="deploy" data-person="${p.id}">${p.deployed ? "迎撃隊に入れた" : "迎撃隊に入れる"}</button>`
    })).join("");
    const chosen = list.filter(p => p.deployed);
    const drunk = world.facts.some(f => f.verb === "consume" && f.target === "allen" && f.effect === "drunk");

    UI.set(`<div class="pa-wrap">
      <header class="pa-top"><h1>勇者到着</h1>
        <p class="pa-lead">城内・城下の生存者は、その場で迎撃隊に選べます（集合の操作はありません）。</p></header>

      <section class="pa-panel">
        <h2>敵情</h2>
        <ul class="pa-enemies">${W.heroUnits(world).map(u =>
          `<li><span class="pa-e-icon">${u.icon}</span><b>${esc(u.name)}</b>
            <span>HP ${u.hp}／攻 ${u.atk}／防 ${u.def}／速 ${u.spd}</span>
            ${u.drunk ? `<em class="pa-drunk">${esc(W.SAKE.effectText)}</em>` : ""}
            ${(u.traits || []).includes("hero_awaken") ? `<em>覚醒：HP50%以下で以後ダメージ+50%</em>` : ""}</li>`).join("")}
        </ul>
        ${drunk ? `<p class="pa-note pa-note-hot">城下で起きたことが、そのまま敵情に出ています。</p>` : ""}
      </section>

      <section class="pa-panel">
        <h2>迎撃隊（先頭が狙われやすい）</h2>
        <p class="pa-note">選んだ順が並び順になります。選んだ人は職場を離れます。</p>
        <p class="pa-squad">${chosen.length ? chosen.map((p, i) => `<span>${i + 1}. ${esc(p.name)}</span>`).join("") : "<span>まだ誰も選んでいません</span>"}</p>
        <div class="pa-grid">${cards}</div>
      </section>

      <div class="pa-actions">
        <button class="pa-go" data-action="startbattle">この編成で迎え撃つ</button>
      </div>
    </div>`, "report");
  }

  // ── 決着 ─────────────────────────────────
  function renderOutcome() {
    const o = world.outcome;
    const sentences = W.outcomeSentences(world);
    const ledger = world.facts.filter(f => ["produce", "offer", "consume", "sortie", "promote", "died", "interception"].includes(f.verb));

    UI.set(`<div class="pa-wrap">
      <header class="pa-top">
        <h1>${o.victory ? "迎撃成功" : o.kind === "occupied" ? "占領された" : "迎撃失敗"}</h1>
        <p class="pa-lead">試作はここまでです。</p>
      </header>
      <section class="pa-panel">
        <h2>${o.victory ? "戦果" : "結果"}</h2>
        ${sentences.length ? `<ul class="pa-report">${sentences.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`
          : `<p class="pa-note">書けることがありません。</p>`}
        ${o.contribution ? `<table class="pa-table"><thead><tr><th>人物</th><th>与</th><th>被</th><th>撃破</th><th></th></tr></thead><tbody>
          ${o.contribution.map(c => `<tr><th>${esc(c.name)}</th><td>${c.dealt}</td><td>${c.taken}</td><td>${c.kills}</td>
            <td>${c.survived ? "生還" : "戦没"}</td></tr>`).join("")}
        </tbody></table>` : ""}
      </section>
      <section class="pa-panel">
        <h2>何が、何につながったか</h2>
        <p class="pa-note">下は台帳そのものです。報告文はここからしか作っていません。</p>
        <ol class="pa-ledger">${ledger.map(f => `<li><code>${esc(f.verb)}</code> ${esc(describeFact(f))}</li>`).join("")}</ol>
      </section>
      <div class="pa-actions">
        <button class="pa-go" data-action="restart">もう一度、別の任せ方で試す</button>
      </div>
    </div>`, "report");
  }

  function nameOf(id) {
    const p = W.person(world, id);
    if (p) return p.name;
    const e = W.HERO_PARTY.find(x => x.id === id);
    return e ? e.name : id;
  }

  function describeFact(f) {
    switch (f.verb) {
      case "produce": return `${nameOf(f.actor)}が城下で新酒を仕込んだ`;
      case "offer": return `${nameOf(f.actor)}が「旅の方」へ酒を勧め、${f.accepted ? "受け取られた" : "断られた"}`;
      case "consume": return `${nameOf(f.target)}が酒を飲み、${W.SAKE.effectText}が残った（出したのは${nameOf(f.source)}）`;
      case "sortie": return `${nameOf(f.actor)}が近郊警戒へ出て${f.victory ? "退けた" : "退けられた"}（戦功${f.merit}）`;
      case "promote": return `${nameOf(f.actor)}が昇進した`;
      case "died": return `${nameOf(f.actor)}が${f.where === "patrol" ? "近郊警戒で" : "迎撃で"}倒れた`;
      case "interception": return f.empty ? "迎撃隊が空のまま確定し、占領された" : `迎撃は${f.victory ? "成功" : "失敗"}`;
      default: return JSON.stringify(f);
    }
  }

  // ── 戦闘再生 ─────────────────────────────
  function playBattle(result, army, region, onDone) {
    UI.set(BattleScene.shell({ stage: 1, army, region }), "battle");
    BattleScene.play(result.timeline, () => {
      const btn = document.getElementById("next-btn");
      if (btn) btn.textContent = "先へ進む";
      if (onDone) window.__paAfterBattle = onDone;
    });
  }

  // ── 進行 ─────────────────────────────────
  function advance() {
    const report = W.advance(world, fight);
    if (!report) return;
    pendingReport = report;
    if (report.segment === 3) {
      const m = report.mormo;
      MormoScene.show({
        expression: m.expression, text: m.text,
        kicker: m.emphasis === 3 ? "魔王軍・緊急報告" : "魔王軍・臨時報告"
      });
      // モルモの報告を送り終えてから到着画面へ。
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

  function waitForMormo(fn) {
    const timer = setInterval(() => {
      if (!MormoScene.active) { clearInterval(timer); fn(); }
    }, 60);
  }

  function start(options) {
    world = W.newWorld(options || {});
    pendingReport = null;
    renderPrep();
  }

  // ── 入力 ─────────────────────────────────
  function bind() {
    UI.bind((action, data) => {
      if (action === "hire") { W.hire(world, data.person, data.job); return rerender(); }
      if (action === "assign") { W.assign(world, data.person, data.job); return rerender(); }
      if (action === "serve") { W.setServePolicy(world, data.person, data.allow === "1"); return rerender(); }
      if (action === "cond") { return start({ seed: world.seed, guestCondition: data.cond }); }
      if (action === "reseed") { return start({ seed: (world.seed + 977) & 0xffff, guestCondition: world.guestCondition }); }
      if (action === "advance") return advance();
      if (action === "watchpatrol") {
        return playBattle(pendingReport.patrol, "王国巡回隊", "近郊", () => renderReport(pendingReport));
      }
      if (action === "deploy") {
        const p = W.person(world, data.person);
        p.deployed = !p.deployed;
        if (p.deployed) p.deployOrder = Date.now();
        return renderArrival();
      }
      if (action === "startbattle") {
        const squad = W.deployable(world).filter(p => p.deployed)
          .sort((a, b) => (a.deployOrder || 0) - (b.deployOrder || 0)).map(p => p.id);
        const outcome = W.resolveInterception(world, squad, fight);
        if (outcome.kind === "occupied") return renderOutcome();
        return playBattle(world.battle, "勇者アレン一行", "魔王城", renderOutcome);
      }
      if (action === "restart") return start({ guestCondition: world.guestCondition });
      if (action === "speed") return BattleScene.cycleSpeed();
      if (action === "pausebattle") return BattleScene.togglePause();
      if (action === "skiplog") return BattleScene.skip();
      if (action === "afterbattle") {
        const fn = window.__paAfterBattle; window.__paAfterBattle = null;
        if (fn) fn();
        return;
      }
    });
  }

  function rerender() {
    if (world.segment === 0) return renderPrep();
    if (world.segment === 3) return renderArrival();
    return renderReport(pendingReport);
  }

  window.HeroArrivalUI = { start, bind, get world() { return world; }, fight };
})();
