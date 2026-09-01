// 戦闘シーンのレンダラ（DOM/CSS版）。
//
// Battle.simulate() が返すイベントタイムラインを再生するだけで、
// 戦闘ルールは一切知らない。将来 Canvas 版やネイティブ版に差し替える場合も
// この play() と同じ入出力を持たせればよい。
//
// アニメーションは transform と opacity のみを使う（レイアウトを走らせない＝スマホで滑らか）。
const BattleScene = {
  // emphasis(0-3) → 尺(ms)。「どれくらい重要か」は戦闘側、「何秒見せるか」は描画側の責任。
  DURATION: { 0: 460, 1: 620, 2: 820, 3: 1050 },
  SPECIAL_DURATION: {
    battle_start: 500, round_start: 1150, synergy: 1650,
    note: 260, dialogue: 1900, incident: 1700, death: 750, revive: 1100, survive: 650, heal: 500, result: 1200
  },

  // 長期戦がだらけないための自動圧縮。シナジー同士が噛み合って乱戦が
  // 長引いても、x1でこの秒数に収まるよう全体の尺を縮める（各イベントの
  // 個別の尺はいじらない）。短い戦闘は一切圧縮されない。
  AUTO_CAP_MS: 45000,
  MIN_AUTO_SCALE: 0.62,

  EFFECT_CLASSES: [
    "fx-goblin_horde", "fx-king_slime", "fx-legion_of_dead", "fx-arcane_circle",
    "fx-cheap_labor", "fx-elite_few", "fx-general_command", "fx-incident",
    "fx-revive", "fx-guard"
  ],

  speed: 1,
  autoScale: 1,
  timers: [],
  units: {},      // id → { el, fill, data }
  state: null,
  isFinalBattle: false,

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
    this.isFinalBattle = stageData.missionKind === "invade" && stageData.baseStage === Game.MAX_CONQUEST;
    if (typeof Music !== "undefined") Music.update(Game.state, { scene: this.isFinalBattle ? "final" : "battle" });
    const sceneClass = this.isFinalBattle ? "scene final-battle" : "scene";
    return `
      <div class="hud">
        <span>第 <b>${Game.state.generation}</b> 代魔王軍</span>
        <span>第 <b>${stageData.stage}</b> 作戦</span>
        <span class="muted">${U.esc(stageData.region)}</span>
      </div>
      <div class="${sceneClass}" id="scene">
        <div class="scene-fx" id="scene-fx"></div>
        <div class="scene-band" id="band-enemy"></div>
        <div class="scene-mid">
          <span class="scene-army">${U.esc(stageData.army)}</span>
          <span class="scene-vs">VS</span>
          <span class="scene-army">魔王軍</span>
        </div>
        <div class="scene-band" id="band-player"></div>
        <div class="action-caption" id="action-caption"></div>
        <div class="round-banner" id="round-banner">
          <span id="round-kicker"></span><b id="round-number"></b>
        </div>
        <div class="scene-intro" id="scene-intro">
          <span>王国最終防衛線</span><b>FINAL BATTLE</b><small>${U.esc(stageData.army)}</small>
        </div>
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
        side: u.side,
        name: u.name
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
    if (ev.type === "battle_start" && this.isFinalBattle) return 1450;
    return this.SPECIAL_DURATION[ev.type] !== undefined
      ? this.SPECIAL_DURATION[ev.type]
      : this.DURATION[ev.emphasis] || 300;
  },

  // 1イベントを描画し、次までの尺(ms)を返す
  render(ev) {
    if (ev.text) this.appendLog(ev.text, ev.cls);
    if (typeof Sound !== "undefined") {
      const from = this.units[ev.fromId];
      Sound.battle(ev, { speed: this.speed, final: this.isFinalBattle, fromSide: from && from.side });
    }

    switch (ev.type) {
      case "battle_start":
        if (this.isFinalBattle) this.battleIntro();
        break;
      case "round_start":
        this.roundBanner(ev.round);
        break;
      case "dialogue": {
        const speaker = this.units[ev.unitId];
        this.clearFocus();
        if (speaker) speaker.el.classList.add("acting");
        this.showAction(`${ev.name}「${ev.quote}」`, 1700);
        break;
      }
      case "attack":
      case "splash": {
        const from = this.units[ev.fromId], to = this.units[ev.toId];
        this.focusAttack(from, to, ev);
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
        if (u) {
          u.el.classList.add("dead");
          this.float(u, "倒れた！", "fallen");
        }
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
          this.pulse("revive");
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
        if (u) {
          this.setHp(u, ev.hp, ev.maxHp);
          this.float(u, "耐えた！", "guard");
          this.pulse("guard");
        }
        break;
      }
      case "synergy":
        this.pulse(ev.id);
        this.cutin(ev.name, ev.desc, ev.id);
        break;
      case "incident": {
        const culprit = this.units[ev.unitId];
        const target = this.units[ev.targetId];
        this.clearFocus();
        if (culprit) culprit.el.classList.add("acting", "trouble");
        if (target) target.el.classList.add("targeted");
        this.pulse("incident");
        this.cutin(ev.name, "魔王軍で事件発生！", ev.id);
        this.shake();
        break;
      }
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

  clearFocus() {
    for (const u of Object.values(this.units)) {
      u.el.classList.remove("acting", "targeted", "trouble");
    }
  },

  focusAttack(from, to, ev) {
    this.clearFocus();
    if (from) from.el.classList.add("acting");
    if (to) to.el.classList.add("targeted");
    if (!from || !to) return;
    const action = ev.type === "splash" ? (ev.label || "追撃") : "攻撃";
    this.showAction(`${from.name}の${action}　→　${to.name}`);
  },

  showAction(text, duration) {
    const c = document.getElementById("action-caption");
    if (!c) return;
    c.textContent = text;
    c.classList.remove("show");
    void c.offsetWidth;
    c.classList.add("show");
    this.timers.push(setTimeout(() => c.classList.remove("show"), ((duration || 600) * this.autoScale) / this.speed));
  },

  battleIntro() {
    const intro = document.getElementById("scene-intro");
    if (!intro) return;
    intro.classList.remove("show");
    void intro.offsetWidth;
    intro.classList.add("show");
    this.timers.push(setTimeout(() => intro.classList.remove("show"), (1400 * this.autoScale) / this.speed));
  },

  roundBanner(round) {
    this.clearFocus();
    const b = document.getElementById("round-banner");
    if (!b) return;
    document.getElementById("round-kicker").textContent = round === 1
      ? "戦闘開始"
      : `ROUND ${round - 1} 終了`;
    document.getElementById("round-number").textContent = `ROUND ${round}`;
    b.classList.remove("show");
    void b.offsetWidth;
    b.classList.add("show");
    this.timers.push(setTimeout(() => b.classList.remove("show"), (1080 * this.autoScale) / this.speed));
  },

  pulse(kind) {
    const s = document.getElementById("scene");
    if (!s) return;
    s.classList.remove("fx-active");
    for (const cls of this.EFFECT_CLASSES) s.classList.remove(cls);
    const synergyKinds = [
      "goblin_horde", "king_slime", "legion_of_dead", "arcane_circle",
      "cheap_labor", "elite_few", "general_command"
    ];
    const cls = synergyKinds.includes(kind) ? `fx-${kind}`
      : kind === "revive" ? "fx-revive"
        : kind === "guard" ? "fx-guard"
          : "fx-incident";
    s.classList.add(cls);
    void s.offsetWidth;
    s.classList.add("fx-active");
    this.timers.push(setTimeout(() => {
      s.classList.remove("fx-active", cls);
    }, (1450 * this.autoScale) / this.speed));
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
    for (const cls of this.EFFECT_CLASSES) c.classList.remove(cls);
    const tone = this.EFFECT_CLASSES.find(cls => cls === `fx-${synergyId}`) || "fx-incident";
    c.classList.add(tone);
    document.getElementById("cutin-name").textContent = name;
    document.getElementById("cutin-desc").textContent = desc;
    c.classList.remove("show");
    void c.offsetWidth;
    c.classList.add("show");
    this.timers.push(setTimeout(() => c.classList.remove("show"), (1300 * this.autoScale) / this.speed));
  },

  banner(victory) {
    if (typeof Music !== "undefined") Music.update(Game.state, { scene: victory ? "victory" : "defeat" });
    const s = document.getElementById("scene");
    if (!s) return;
    // 決着表示は画面中央に出るため、同じ位置にある「VS」帯を隠す。
    // 隠さないと「勝 VS 利」のように文字が重なって読めなくなる。
    s.classList.add("decided");
    const b = document.createElement("div");
    b.className = "scene-result " + (victory ? "win" : "lose") + (this.isFinalBattle ? " final" : "");
    b.innerHTML = `<b>${victory ? "勝　利" : "敗　北"}</b>${
      this.isFinalBattle && victory ? "<small>王国最終防衛線 突破</small>" : ""}`;
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
    if (typeof Sound !== "undefined") {
      Sound.stopAll();
      Sound.cue("skip");
    }
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
