// 魔王城の10日間 ── 画面。状態は CastleDays が持ち、ここは描くだけ。
(function () {
  "use strict";
  const D = window.CastleDays;
  let w = null;
  let lastResult = null;
  let battle = null;

  const esc = s => U.esc(s == null ? "" : s);
  const face = (p, cls) => UI.hasPortrait(p.tplId)
    ? `<img class="${cls}" src="assets/monsters/${p.tplId}.png" alt="">`
    : `<span class="${cls} cd-emoji">${p.icon}</span>`;

  function header(title) {
    return `<header class="cd-top">
      <div class="cd-day">${w.day}日目 <small>／${w.maxDays}</small></div>
      <h1>${esc(title)}</h1>
      <div class="cd-state">スライム牧場 <b class="${w.incident ? "hot" : ""}">${w.facilities.pasture.slimes}</b>匹
        ${w.facilities.pasture.drain === "sealed" ? "<span>排水：封鎖</span>" : ""}
        ${w.facilities.pasture.feed === "boosted" ? "<span>餌：改良中</span>" : ""}</div>
    </header>`;
  }

  function staffStrip() {
    if (!w.staff.length) return "";
    return `<div class="cd-staff">${w.staff.map(p => `
      <div class="cd-chip${p.alive ? "" : " is-down"}${p.hurt ? " is-hurt" : ""}">
        ${face(p, "cd-chip-face")}<b>${esc(p.name)}</b><span>${esc(D.PLACES[p.place].name)}</span>
        ${p.hidden && p.hidden.known ? `<em>${esc(D.TRAITS[p.hidden.trait].name)}</em>` : ""}
      </div>`).join("")}</div>`;
  }

  // ── 朝 ────────────────────────────────────
  function renderMorning(digest) {
    const acts = D.actions(w);
    UI.set(`<div class="cd-wrap">
      ${header("朝")}
      ${staffStrip()}
      <section class="cd-panel cd-mormo">
        <img src="assets/mormo/report.webp" alt="モルモ">
        <div>
          <b>モルモ「おはようございます、魔王様」</b>
          ${digest.length ? `<ul>${digest.map(d => `<li class="${d.notable ? "is-notable" : ""}">${esc(d.text)}</li>`).join("")}</ul>`
            : `<p class="cd-quiet">「今日は、特に何も」</p>`}
        </div>
      </section>
      <section class="cd-panel">
        <h2>今日は何をする</h2>
        <div class="cd-actions">${acts.map((a, i) => `
          <button class="cd-action${a.hot ? " is-hot" : ""}" data-action="do" data-idx="${i}">
            <b>${esc(a.name)}</b><span>${esc(a.desc || "")}</span></button>`).join("")}</div>
        <p class="cd-note">一つ選ぶと、その日が進みます。</p>
      </section>
    </div>`, "report");
    w.__acts = acts;
  }

  // ── 採用 ──────────────────────────────────
  function renderRecruit() {
    const slots = 4 - w.staff.length;
    const limit = Math.min(slots, w.day === 1 ? 3 : slots);
    UI.set(`<div class="cd-wrap">
      ${header("応募者")}
      <p class="cd-lead">${limit}名まで。採ったら、どこに置くかも決めてください。</p>
      <div class="cd-cards">${w.applicants.map(a => `
        <article class="cd-card" data-id="${a.id}">
          <div class="cd-card-head">${face(a, "cd-face")}<div><b>${esc(a.name)}</b><span>${esc(a.race)}・${esc(a.job)}</span></div></div>
          <dl><dt>前職</dt><dd>${esc(a.resume.prev)}</dd><dt>希望</dt><dd>「${esc(a.resume.wish)}」</dd><dt>備考</dt><dd>${esc(a.resume.note)}</dd></dl>
          <p class="cd-traits">${a.traits.map(t => `<i>${esc(D.TRAITS[t].name)}</i>`).join("")}<i class="unknown">？</i></p>
          <div class="cd-place">
            <label><input type="checkbox" class="cd-pick" data-id="${a.id}"> 雇う</label>
            <select class="cd-where" data-id="${a.id}">
              ${Object.values(D.PLACES).filter(p => p.id !== "idle").map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
            </select>
          </div>
        </article>`).join("")}</div>
      <div class="cd-foot"><button class="cd-go" data-action="recruit-confirm" data-limit="${limit}">この顔ぶれで</button>
        <button class="cd-sub" data-action="back">やめる</button></div>
    </div>`, "recruit");
  }

  function renderAssign() {
    UI.set(`<div class="cd-wrap">
      ${header("配置")}
      <div class="cd-assign">${w.staff.filter(p => p.alive).map(p => `
        <div class="cd-assign-row">${face(p, "cd-chip-face")}<b>${esc(p.name)}</b>
          <select class="cd-where" data-id="${p.id}">
            ${Object.values(D.PLACES).map(pl => `<option value="${pl.id}" ${p.place === pl.id ? "selected" : ""}>${esc(pl.name)}</option>`).join("")}
          </select></div>`).join("")}</div>
      <div class="cd-foot"><button class="cd-go" data-action="assign-confirm">これで</button>
        <button class="cd-sub" data-action="back">やめる</button></div>
    </div>`, "formation");
  }

  // ── 行動の結果（割り込みはここに落ちる）──────────
  function renderResult(result) {
    const inter = w.pending.filter(p => p.kind === "line");
    UI.set(`<div class="cd-wrap">
      ${header(result.action.name)}
      <section class="cd-panel">
        ${result.lines.length ? `<ul class="cd-lines">${result.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${inter.length ? `<div class="cd-burst">${inter.map(p => `
          <div class="cd-burst-line">${face(p.who, "cd-burst-face")}<span>${esc(p.text)}</span></div>`).join("")}
          <small>命令していない</small></div>` : ""}
      </section>
      <div class="cd-foot"><button class="cd-go" data-action="night">夜へ</button></div>
    </div>`, "report");
  }

  // ── 夜 → 朝 ─────────────────────────────
  function goNight() {
    w.pending = [];
    D.night(w);
    const mormos = w.pending.filter(p => p.kind === "mormo");
    w.pending = [];
    const next = () => w.done ? renderSummary() : renderMorning(D.morning(w));
    if (!mormos.length) return next();
    let i = 0;
    const show = () => {
      if (i >= mormos.length) return next();
      const m = mormos[i++];
      MormoScene.show({ expression: m.expression, text: m.text, kicker: "魔王軍・緊急報告" });
      const t = setInterval(() => { if (!MormoScene.active) { clearInterval(t); show(); } }, 60);
    };
    show();
  }

  // ── 戦闘 ──────────────────────────────────
  function startBattle() {
    const party = D.battleParty(w);
    const inter = w.pending.filter(p => p.kind === "line");
    w.pending = [];
    battle = D.buildSlimeBattle(w, party);
    const go = () => {
      UI.set(BattleScene.shell({ stage: 1, army: "スライムの群れ", region: "スライム牧場" }), "battle");
      BattleScene.play(battle.timeline, () => { const b = document.getElementById("next-btn"); if (b) b.textContent = "戻る"; });
    };
    if (!inter.length) return go();
    // 出撃前の乱入（「俺も行く」「今、行く。今……」）を先に見せる
    UI.set(`<div class="cd-wrap">${header("鎮圧に出る")}
      <section class="cd-panel"><div class="cd-burst">${inter.map(p => `
        <div class="cd-burst-line">${face(p.who, "cd-burst-face")}<span>${esc(p.text)}</span></div>`).join("")}
        <small>命令していない</small></div>
        <p class="cd-lead">出るのは：${party.map(p => esc(p.name)).join("・") || "誰もいない"}</p></section>
      <div class="cd-foot"><button class="cd-go" data-action="battle-go">出る</button></div></div>`, "report");
    w.__battleGo = go;
  }

  function afterBattle() {
    D.afterBattle(w, battle);
    const r = { action: { name: "鎮圧" }, lines: [battle.victory ? `${battle.killed}匹を処分した。牧場はまだ動いている` : "押し切られた"] };
    battle = null;
    renderResult(r);
  }

  // ── 10日目の振り返り ─────────────────────────
  function renderSummary() {
    const s = D.summary(w);
    UI.set(`<div class="cd-wrap">
      ${header("10日間が終わった")}
      <section class="cd-panel"><h2>命令していないのに、やったこと</h2>
        ${s.people.map(p => `<h3>${esc(p.name)}${p.alive ? "" : "（戦没）"}</h3>
          ${p.unordered.length ? `<ul class="cd-lines">${p.unordered.map(u => `<li>${esc(u)}</li>`).join("")}</ul>` : `<p class="cd-quiet">何も</p>`}`).join("")}
      </section>
      <section class="cd-panel"><h2>事件</h2>
        <ul class="cd-lines">${s.incident.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
        <p>最終：スライム${s.slimes}匹 ${s.resolved ? "／収束" : "／未解決"}</p></section>
      <section class="cd-panel cd-ask"><h2>三つだけ</h2>
        <ol><li>「お前何やってんだよ（笑）」が一回でも出たか</li><li>「次こいつ何するんだろ」が出たか</li><li>「次の日ボタンを押してる」感覚が消えたか</li></ol></section>
      <div class="cd-foot"><button class="cd-go" data-action="restart">別の10日間</button></div>
    </div>`, "report");
  }

  function start(o) { w = D.newRun(o || {}); renderMorning(D.morning(w)); }

  function bind() {
    UI.bind((action, data) => {
      if (action === "do") {
        const a = w.__acts[Number(data.idx)];
        if (a.id === "recruit") return renderRecruit();
        if (a.id === "assign") return renderAssign();
        const r = D.act(w, a);
        lastResult = r;
        if (r.battle) return startBattle();
        return renderResult(r);
      }
      if (action === "recruit-confirm") {
        const limit = Number(data.limit);
        const picks = [...document.querySelectorAll(".cd-pick:checked")].slice(0, limit)
          .map(el => ({ id: el.dataset.id, place: document.querySelector(`.cd-where[data-id="${el.dataset.id}"]`).value }));
        if (!picks.length) return;
        const r = D.act(w, w.__acts.find(a => a.id === "recruit"), picks);
        return renderResult(r);
      }
      if (action === "assign-confirm") {
        const list = [...document.querySelectorAll(".cd-where")].map(el => ({ id: el.dataset.id, place: el.value }));
        const r = D.act(w, w.__acts.find(a => a.id === "assign"), list);
        return renderResult(r);
      }
      if (action === "back") return renderMorning([]);
      if (action === "night") return goNight();
      if (action === "battle-go") { const g = w.__battleGo; w.__battleGo = null; if (g) g(); return; }
      if (action === "afterbattle") return afterBattle();
      if (action === "restart") return start({});
      if (action === "speed") return BattleScene.cycleSpeed();
      if (action === "pausebattle") return BattleScene.togglePause();
      if (action === "skiplog") return BattleScene.skip();
    });
  }

  window.CastleDaysUI = { start, bind, get run() { return w; } };
})();
