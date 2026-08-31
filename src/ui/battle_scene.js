// 戦闘シーンのレンダラ（DOM/CSS版）。
//
// Battle.simulate() が返すイベントタイムラインを再生するだけで、
// 戦闘ルールは一切知らない。将来 Canvas 版やネイティブ版に差し替える場合も
// この play() と同じ入出力を持たせればよい。
//
// アニメーションは transform と opacity のみを使う（レイアウトを走らせない＝スマホで滑らか）。
const BattleScene = {
  // emphasis(0-3) → 尺(ms)。「どれくらい重要か」は戦闘側、「何秒見せるか」は描画側の責任。
  DURATION: { 0: 300, 1: 400, 2: 560, 3: 760 },
  SPECIAL_DURATION: {
    battle_start: 260, round_start: 420, synergy: 1450,
    note: 170, death: 460, revive: 780, survive: 420, heal: 300, result: 900
  },

  // 長期戦がだらけないための自動圧縮。シナジー同士が噛み合って乱戦が
  // 長引いても、x1でこの秒数に収まるよう全体の尺を縮める（各イベントの
  // 個別の尺はいじらない）。短い戦闘は一切圧縮されない。
  AUTO_CAP_MS: 20000,
  MIN_AUTO_SCALE: 0.45,

  speed: 1,
  autoScale: 1,
  timers: [],
  units: {},      // id → { el, fill, data }
  state: null,

  // 敵はデータのアイコン、味方は種族アイコン
  iconOf(u) { return u.icon || (u.side === "enemy" ? "🗡" : UI.icon(u.race)); },

  // 立ち絵があればそれを使い、無ければ絵文字に落ちる（敵は今のところ絵文字のみ）
  portraitHtml(u) {
    const emoji = this.iconOf(u);
    const id = u.tplId;
    if (!UI.hasPortrait(id)) return emoji;
    return `<span class="bu-portrait" data-fallback="${emoji}"><img src="${UI.PORTRAIT_DIR}${id}.png" alt=""
      onerror="UI.portraitFailed('${id}', this)"></span>`;
  },

  loadSpeed() {
    try { this.speed = Number(localStorage.getItem("maou_speed")) || 1; } catch (e) { this.speed = 1; }
    if (![1, 2, 4].includes(this.speed)) this.speed = 1;
  },
  saveSpeed() { try { localStorage.setItem("maou_speed", String(this.speed)); } catch (e) {} },

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  },

  // 骨組みのHTML。ui.js から差し込む。
  shell(stageData) {
    return `
      <div class="hud">
        <span>第 <b>${Game.state.generation}</b> 代魔王軍</span>
        <span>第 <b>${stageData.stage}</b> 作戦</span>
        <span class="muted">${U.esc(stageData.region)}</span>
      </div>
      <div class="scene" id="scene">
        <div class="scene-band" id="band-enemy"></div>
        <div class="scene-mid">
          <span class="scene-army">${U.esc(stageData.army)}</span>
          <span class="scene-vs">VS</span>
          <span class="scene-army">魔王軍</span>
        </div>
        <div class="scene-band" id="band-player"></div>
        <div class="cutin" id="cutin">
          <img class="cutin-portrait" id="cutin-portrait" alt="">
          <div class="cutin-copy"><b id="cutin-name"></b><span id="cutin-desc"></span></div>
        </div>
      </div>
      <div class="scene-ctrl">
        <button class="small" data-action="speed" id="speed-btn">速度 x1</button>
        <button class="small" data-action="skiplog">▶▶ 最後まで飛ばす</button>
        <button class="primary" data-action="afterbattle" id="next-btn" style="display:none">結果を見る</button>
      </div>
      <div class="log" id="log"></div>`;
  },

  unitHtml(u) {
    return `<div class="bu" id="bu-${u.id}">
      <div class="bu-flash"></div>
      <div class="bu-icon">${this.portraitHtml(u)}</div>
      <div class="bu-name">${U.esc(u.name)}</div>
      <div class="bu-hp"><div class="bu-hpfill" id="hp-${u.id}"></div></div>
      <div class="bu-pop" id="pop-${u.id}"></div>
    </div>`;
  },

  // ── 再生 ──────────────────────────────────
  play(timeline, onDone) {
    this.stop();
    this.loadSpeed();
    this.units = {};
    this.onDone = onDone;
    this.finished = false;

    const start = timeline.find(e => e.type === "battle_start");
    document.getElementById("band-enemy").innerHTML = start.enemy.map(u => this.unitHtml(u)).join("");
    document.getElementById("band-player").innerHTML = start.player.map(u => this.unitHtml(u)).join("");
    for (const u of [...start.enemy, ...start.player]) {
      this.units[u.id] = {
        el: document.getElementById("bu-" + u.id),
        fill: document.getElementById("hp-" + u.id),
        pop: document.getElementById("pop-" + u.id),
        side: u.side
      };
    }
    this.updateSpeedBtn();

    const rawTotal = timeline.reduce((sum, ev) => sum + this.durationOf(ev), 0);
    this.autoScale = rawTotal > this.AUTO_CAP_MS
      ? Math.max(this.MIN_AUTO_SCALE, this.AUTO_CAP_MS / rawTotal)
      : 1;

    this.timeline = timeline;
    this.index = 0;
    this.step();
  },

  step() {
    if (this.index >= this.timeline.length) return this.finish();
    const ev = this.timeline[this.index++];
    const dur = this.render(ev);
    const wait = Math.max(60, (dur * this.autoScale) / this.speed);
    this.timers.push(setTimeout(() => this.step(), wait));
  },

  durationOf(ev) {
    return this.SPECIAL_DURATION[ev.type] !== undefined
      ? this.SPECIAL_DURATION[ev.type]
      : this.DURATION[ev.emphasis] || 300;
  },

  // 1イベントを描画し、次までの尺(ms)を返す
  render(ev) {
    if (ev.text) this.appendLog(ev.text, ev.cls);

    switch (ev.type) {
      case "attack":
      case "splash": {
        const from = this.units[ev.fromId], to = this.units[ev.toId];
        if (from && ev.type === "attack") {
          from.el.classList.remove("lunge-up", "lunge-down");
          void from.el.offsetWidth; // アニメーション再生のためのリセット
          from.el.classList.add(from.side === "player" ? "lunge-up" : "lunge-down");
        }
        if (to) {
          this.hit(to, ev.dmg, ev.emphasis, ev.label);
          this.setHp(to, ev.hp, ev.maxHp);
        }
        if (ev.emphasis >= 3) this.shake();
        break;
      }
      case "death": {
        const u = this.units[ev.unitId];
        if (u) u.el.classList.add("dead");
        break;
      }
      case "revive": {
        const u = this.units[ev.unitId];
        if (u) {
          u.el.classList.remove("dead");
          u.el.classList.remove("pop");
          void u.el.offsetWidth;
          u.el.classList.add("pop");
          this.setHp(u, ev.hp, ev.maxHp);
          this.float(u, "復活！", "heal");
        }
        break;
      }
      case "heal": {
        const u = this.units[ev.unitId];
        if (u) { this.setHp(u, ev.hp, ev.maxHp); this.float(u, "+" + ev.amount, "heal"); }
        break;
      }
      case "survive": {
        const u = this.units[ev.unitId];
        if (u) { this.setHp(u, ev.hp, ev.maxHp); this.float(u, "耐えた！", "guard"); }
        break;
      }
      case "synergy":
        this.cutin(ev.name, ev.desc, ev.id);
        break;
      case "result":
        this.banner(ev.victory);
        break;
    }
    return this.durationOf(ev);
  },

  setHp(u, hp, maxHp) {
    u.fill.style.transform = `scaleX(${Math.max(0, hp / maxHp)})`;
    u.fill.classList.toggle("low", hp / maxHp <= 0.3);
  },

  hit(u, dmg, emphasis, label) {
    u.el.classList.remove("hit", "hit-big");
    void u.el.offsetWidth;
    u.el.classList.add(emphasis >= 2 ? "hit-big" : "hit");
    this.float(u, (label ? label + " " : "") + dmg, emphasis >= 2 ? "big" : "");
  },

  // ダメージ数字を浮かせる。カード内に絶対配置するので座標計測は不要。
  float(u, text, cls) {
    const n = document.createElement("span");
    n.className = "fnum " + (cls || "");
    n.textContent = text;
    u.pop.appendChild(n);
    setTimeout(() => n.remove(), 900);
  },

  shake() {
    const s = document.getElementById("scene");
    if (!s) return;
    s.classList.remove("shake");
    void s.offsetWidth;
    s.classList.add("shake");
  },

  cutin(name, desc, synergyId) {
    const c = document.getElementById("cutin");
    if (!c) return;
    const portrait = document.getElementById("cutin-portrait");
    const hasPortrait = synergyId === "king_slime";
    portrait.src = hasPortrait ? UI.PORTRAIT_DIR + "king_slime.png" : "";
    portrait.alt = hasPortrait ? "キングスライム" : "";
    c.classList.toggle("has-portrait", hasPortrait);
    document.getElementById("cutin-name").textContent = name;
    document.getElementById("cutin-desc").textContent = desc;
    c.classList.remove("show");
    void c.offsetWidth;
    c.classList.add("show");
    this.timers.push(setTimeout(() => c.classList.remove("show"), (1300 * this.autoScale) / this.speed));
  },

  banner(victory) {
    const s = document.getElementById("scene");
    if (!s) return;
    // 決着表示は画面中央に出るため、同じ位置にある「VS」帯を隠す。
    // 隠さないと「勝 VS 利」のように文字が重なって読めなくなる。
    s.classList.add("decided");
    const b = document.createElement("div");
    b.className = "scene-result " + (victory ? "win" : "lose");
    b.textContent = victory ? "勝　利" : "敗　北";
    s.appendChild(b);
  },

  appendLog(text, cls) {
    const el = document.getElementById("log");
    if (!el) return;
    el.insertAdjacentHTML("beforeend", `<div class="${cls || "info"}">${U.esc(text)}</div>`);
    el.scrollTop = el.scrollHeight;
  },

  // 残りを一気に適用して終わらせる
  skip() {
    this.stop();
    while (this.index < this.timeline.length) {
      const ev = this.timeline[this.index++];
      if (ev.text) this.appendLog(ev.text, ev.cls);
      const u = this.units[ev.toId] || this.units[ev.unitId];
      if (u && (ev.hp !== undefined)) this.setHp(u, ev.hp, ev.maxHp);
      if (ev.type === "death" && u) u.el.classList.add("dead");
      if (ev.type === "revive" && u) u.el.classList.remove("dead");
      if (ev.type === "result") this.banner(ev.victory);
    }
    this.finish();
  },

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    this.saveSpeed();
    this.updateSpeedBtn();
  },

  updateSpeedBtn() {
    const b = document.getElementById("speed-btn");
    if (b) b.textContent = `速度 x${this.speed}`;
  },

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.stop();
    const btn = document.getElementById("next-btn");
    if (btn) btn.style.display = "";
    if (this.onDone) this.onDone();
  }
};
