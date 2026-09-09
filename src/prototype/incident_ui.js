// 事件試作の画面。
//   平時（数字が増えていく）→ モルモが飛び込む → 判断 → 必要ならバトル → 後遺症 → 次の日
// バトルは毎日踏むループではなく、事件が最も熱くなるところで切る専用ステージ。
// 描画は既存の BattleScene をそのまま使う（battle.js も battle_scene.js も変更していない）。
(function () {
  "use strict";
  const I = window.IncidentSlime;
  let run = null;
  let pending = null;      // { result, optionId }

  const esc = s => U.esc(s == null ? "" : s);
  const face = (s, cls) => UI.hasPortrait(s.tplId)
    ? `<img class="${cls}" src="assets/monsters/${s.tplId}.png" alt="">`
    : `<span class="${cls} iv-emoji">${s.icon}</span>`;

  function staffHtml() {
    return `<div class="iv-staff">${run.staff.map(s => `
      <div class="iv-member${s.alive ? "" : " is-down"}${s.hurt ? " is-hurt" : ""}">
        ${face(s, "iv-face")}
        <b>${esc(s.name)}</b>
        <span>${esc(s.where)}・${esc(s.note)}</span>
        ${s.alive ? (s.hurt ? `<em>負傷</em>` : "") : `<em>不在</em>`}
      </div>`).join("")}</div>`;
  }

  function stateHtml() {
    const bits = [];
    bits.push(run.pastureLost ? "スライム牧場：封鎖済み" : `スライム牧場：<b>${run.pasture}</b>匹`);
    bits.push(run.furnaceUnstable ? `<b class="iv-warn">魔力炉：不安定（前回の事故）</b>` : "魔力炉：正常");
    return `<p class="iv-state">${bits.join("　／　")}</p>`;
  }

  // ── 平時 ───────────────────────────────────
  function renderDay() {
    const recent = run.log.slice(-4);
    UI.set(`<div class="iv-wrap">
      <header class="iv-top">
        <h1>${run.day === 0 ? "魔王城・平時" : `${run.day}日目`}</h1>
        <p class="iv-lead">今日も特に何もない。……はずだった。</p>
      </header>
      ${stateHtml()}
      <section class="iv-panel"><h2>城の様子</h2>${staffHtml()}</section>
      ${recent.length ? `<section class="iv-panel"><h2>日誌</h2>
        <ul class="iv-daylog">${recent.map(l => `<li>${run.day > 0 ? `${l.day}日目：` : ""}${esc(l.text)}</li>`).join("")}</ul>
      </section>` : ""}
      ${run.history.length ? historyHtml() : ""}
      <div class="iv-actions"><button class="iv-go" data-action="nextday">一日進める</button></div>
    </div>`, "report");
  }

  function historyHtml() {
    return `<section class="iv-panel iv-history"><h2>これまでに起きたこと</h2>
      <ol>${run.history.map(h => `<li>
        <b>${h.day}日目《${esc(h.incident)}》</b> → ${esc(h.choice)}
        ${h.victory === null ? "（戦わず）" : h.victory ? "（鎮圧）" : "（押し切られた）"}
        <span>${esc(h.after.join(" / "))}</span></li>`).join("")}</ol></section>`;
  }

  // ── 事件 ───────────────────────────────────
  function renderIncident() {
    const inc = run.incident;
    const opts = I.availableOptions(run);
    UI.set(`<div class="iv-wrap">
      <div class="iv-alert">
        <span class="iv-alert-kicker">事件</span>
        <h1>《${esc(inc.name)}》</h1>
      </div>
      ${stateHtml()}
      <section class="iv-panel"><h2>いまの状況</h2>${staffHtml()}
        <p class="iv-note">誰がいて、どんな状態かで、打てる手が変わります。</p>
      </section>
      <section class="iv-panel"><h2>どうしますか</h2>
        <div class="iv-options">${opts.map(o => `
          <button class="iv-option${o.kind === "noBattle" ? " is-quiet" : ""}" data-action="choose" data-opt="${o.id}">
            <b>${esc(o.name)}</b>
            <span class="iv-advise">モルモ「${esc(o.advise(run))}」</span>
            ${o.kind === "noBattle" ? `<em>戦闘なし</em>` : ""}
          </button>`).join("")}</div>
      </section>
    </div>`, "report");
  }

  // ── 後遺症 ─────────────────────────────────
  function renderAftermath(victory) {
    UI.set(`<div class="iv-wrap">
      <header class="iv-top">
        <h1>${victory === null ? "戦わずに終えた" : victory ? "鎮圧した" : "押し切られた"}</h1>
      </header>
      <section class="iv-panel iv-after"><h2>あとに残ったもの</h2>
        <ul>${run.aftermath.map(a => `<li>${esc(a)}</li>`).join("")}</ul>
        <p class="iv-note">勝敗とは別に、世界の次の状態が変わります。</p>
      </section>
      ${stateHtml()}
      <section class="iv-panel"><h2>城の様子</h2>${staffHtml()}</section>
      ${historyHtml()}
      <div class="iv-actions">
        <button class="iv-go" data-action="nextday">次の日へ</button>
        <button class="iv-sub" data-action="restart">最初からやり直す</button>
      </div>
    </div>`, "report");
  }

  // ── 進行 ───────────────────────────────────
  function nextDay() {
    const inc = I.advanceDay(run);
    if (inc) {
      MormoScene.show({ expression: "panic", text: inc.mormo, kicker: "魔王軍・緊急報告" });
      waitForMormo(renderIncident);
      return;
    }
    renderDay();
  }

  function waitForMormo(fn) {
    const timer = setInterval(() => { if (!MormoScene.active) { clearInterval(timer); fn(); } }, 60);
  }

  function choose(optionId) {
    const opt = I.OPTIONS.find(o => o.id === optionId);
    if (opt.kind === "noBattle") {
      I.settle(run, optionId, null);
      return renderAftermath(null);
    }
    const result = I.buildBattle(run, optionId);
    pending = { result, optionId };
    UI.set(BattleScene.shell({ stage: 1, army: "スライムの群れ", region: "スライム牧場" }), "battle");
    BattleScene.play(result.timeline, () => {
      const btn = document.getElementById("next-btn");
      if (btn) btn.textContent = "結果を見る";
    });
  }

  function afterBattle() {
    if (!pending) return;
    const { result, optionId } = pending;
    pending = null;
    I.settle(run, optionId, result);
    renderAftermath(result.victory);
  }

  function start(options) {
    run = I.newRun(options || {});
    pending = null;
    renderDay();
  }

  function bind() {
    UI.bind((action, data) => {
      if (action === "nextday") return nextDay();
      if (action === "choose") return choose(data.opt);
      if (action === "restart") return start({});
      if (action === "speed") return BattleScene.cycleSpeed();
      if (action === "pausebattle") return BattleScene.togglePause();
      if (action === "skiplog") return BattleScene.skip();
      if (action === "afterbattle") return afterBattle();
    });
  }

  window.IncidentUI = { start, bind, get run() { return run; } };
})();
