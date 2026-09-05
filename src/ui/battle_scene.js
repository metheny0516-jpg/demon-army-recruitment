// 戦闘シーンのレンダラ（DOM/CSS版）。
//
// Battle.simulate() が返すイベントタイムラインを再生するだけで、
// 戦闘ルールは一切知らない。将来 Canvas 版やネイティブ版に差し替える場合も
// この play() と同じ入出力を持たせればよい。
//
// アニメーションは transform と opacity のみを使う（レイアウトを走らせない＝スマホで滑らか）。
const BattleScene = {
  EFFECT_DIR: "assets/battle/effects/",
  UNIT_DIR: "assets/battle/units/",
  VFX_DURATION: { slash: 500, impact: 460, guard: 680, revive: 860, overkill: 860 },
  missingSprites: new Set(),
  preloadedSprites: new Set(),
  vfxPreloaded: false,
  BATTLE_SPRITES: {
    goblin: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    slime: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    skeleton: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    orc: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    swordsman: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    archer: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    cleric: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    sage: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    mage: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    imp: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    necromancer: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    kobold: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    zombie: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    ogre: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    king_slime: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    shield: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    slinger: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    axeman: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    cavalry: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    commander: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"]),
    hero: new Set(["idle", "attack-windup", "strike", "recover", "hurt", "fallen"])
  },
  motions: new Set(),
  pendingHits: new Set(),
  // emphasis(0-3) → 尺(ms)。「どれくらい重要か」は戦闘側、「何秒見せるか」は描画側の責任。
  DURATION: { 0: 1000, 1: 1200, 2: 1500, 3: 1800 },
  // 事件は「読み切れる尺」を基礎値にする。実プレイで大食漢・追い剥ぎ・OVERKILLが
  // 一瞬で流れて見逃されたため、能力発火と資源獲得を1秒以上へ引き上げた（2026-09-02）。
  // 急ぎたい人には速度x2/x4と「最後まで飛ばす」があるので、x1は観戦側に振る。
  SPECIAL_DURATION: {
    battle_start: 900, round_start: 1600, synergy: 3000, facility_trigger: 3000,
    note: 1200, dialogue: 3200, incident: 3200, death: 2200, revive: 3000, survive: 2600,
    heal: 2200, summon: 3000, trait_trigger: 3000, resource_gain: 3000,
    resource_forfeit: 3000, resource_consume: 2800, overkill: 3000, momentum: 3000, result: 4400
  },
  VICTORY_PAUSE_MS: 900,
  VICTORY_HOLD_MS: 3500,

  // 2026-09-05試遊：読むのが遅めの人を基準にし、自動圧縮は行わない。
  // 急ぐときはプレイヤーがx2/x4を選ぶ。長い戦闘でも等速の意味を変えない。
  BUDGET_MS: 45000, // 過去比較用の目安。尺を縮める判定には使わない
  MIN_COMPRESS: 1,

  // type だけで保護が決まるもの。事件そのもの・資源の増減・決着。
  PROTECTED_TYPES: new Set([
    "battle_start", "dialogue", "synergy", "facility_trigger", "trait_trigger",
    "resource_gain", "resource_forfeit", "resource_consume", "momentum",
    "overkill", "revive", "summon", "survive", "incident", "result"
  ]),

  EFFECT_CLASSES: [
    "fx-goblin_horde", "fx-king_slime", "fx-legion_of_dead", "fx-arcane_circle",
    "fx-cheap_labor", "fx-elite_few", "fx-general_command", "fx-incident",
    "fx-revive", "fx-guard", "fx-overkill", "fx-overload", "fx-loot"
  ],

  speed: 1,
  eventScale: 1,
  pacing: null,
  timers: [],
  units: {},      // id → { el, fill, data }
  state: null,
  isFinalBattle: false,

  // 敵はデータのアイコン、味方は種族アイコン
  iconOf(u) { return u.icon || (u.side === "enemy" ? "🗡" : UI.icon(u.race)); },
  artId(u) {
    return u.tplId || (u.side === "enemy" ? {
      "🗡": "swordsman", "🗡️": "swordsman", "⚔️": "swordsman",
      "🏹": "archer", "✨": "cleric", "📖": "sage",
      "🛡️": "shield", "🪨": "slinger", "🪓": "axeman",
      "🐎": "cavalry", "🎖️": "commander", "👑": "hero"
    }[u.icon] : undefined);
  },

  // 表示上の分類だけ。射程・ダメージ種別・命中率などの戦闘ルールではない。
  attackKind(u) {
    if (!u) return "melee";
    if (u.icon === "🏹") return "arrow";
    if (u.icon === "🪨") return "stone";
    if (["mage", "necromancer", "imp"].includes(u.tplId) || ["✨", "📖"].includes(u.icon)) return "magic";
    return "melee";
  },

  // 戦闘絵→履歴書→絵文字。敵は役割アイコンで共通の戦闘絵を使用する。
  portraitHtml(u) {
    const emoji = this.iconOf(u);
    const id = this.artId(u);
    if (!this.missingSprites.has(id) && this.BATTLE_SPRITES[id] && this.BATTLE_SPRITES[id].has("idle")) {
      return `<span class="bu-portrait battle-sprite" data-fallback="${emoji}"><img class="bu-sprite-img"
        src="${this.UNIT_DIR}${id}/idle.webp" alt="" data-pose="idle" data-tpl-id="${U.esc(id)}"
        onerror="BattleScene.spriteFailed(this)"></span>`;
    }
    if (!UI.hasPortrait(id)) return emoji;
    return `<span class="bu-portrait" data-fallback="${emoji}"><img src="${UI.PORTRAIT_DIR}${id}.png" alt=""
      onerror="UI.portraitFailed('${id}', this)"></span>`;
  },

  spriteFailed(img) {
    const id = img.dataset.tplId;
    this.missingSprites.add(id);
    img.dataset.spriteFailed = "true";
    img.classList.remove("bu-sprite-img");
    img.parentElement.classList.remove("battle-sprite");
    img.onerror = () => UI.portraitFailed(id, img);
    if (UI.hasPortrait(id)) img.src = UI.PORTRAIT_DIR + id + ".png";
    else UI.portraitFailed(id, img);
  },

  visualDuration(ms) { return ms * this.eventScale / this.speed; },

  loadSpeed() {
    try { this.speed = Number(localStorage.getItem("maou_speed")) || 1; } catch (e) { this.speed = 1; }
    if (![1, 2, 4].includes(this.speed)) this.speed = 1;
  },
  saveSpeed() { try { localStorage.setItem("maou_speed", String(this.speed)); } catch (e) {} },

  stop() {
    this.resetChain(true);
    for (const settle of this.pendingHits) settle();
    this.pendingHits.clear();
    for (const motion of this.motions) motion.cancel();
    this.motions.clear();
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const scene = document.getElementById("scene");
    if (scene) {
      scene.querySelectorAll(".bu-vfx, .fnum, .battle-projectile, .chain-bolt").forEach(el => el.remove());
      scene.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
      scene.classList.remove("fx-active", "shake", "zoomed", "heat-1", "heat-2", "heat-3", ...this.EFFECT_CLASSES);
      const morale = document.getElementById("morale");
      if (morale) morale.classList.remove("bump");
    }
    for (const u of Object.values(this.units || {})) {
      u.el.classList.remove("acting", "targeted", "trouble", "lunge-up", "lunge-down", "hit", "hit-big", "revive-rise", "summon-rise", "pop");
      if (!u.sprite || !u.tplId || u.sprite.dataset.spriteFailed) continue;
      this.setPose(u, u.el.classList.contains("dead") ? "fallen" : "idle");
    }
  },

  // 骨組みのHTML。ui.js から差し込む。
  shell(stageData) {
    this.isFinalBattle = stageData.missionKind === "invade" && stageData.baseStage === Game.MAX_CONQUEST;
    if (typeof Music !== "undefined") Music.update(Game.state, { scene: this.isFinalBattle ? "final" : "battle" });
    const sceneClass = this.isFinalBattle ? "scene battlefield final-battle" : "scene battlefield";
    return `
      <div class="battle-stage-layout">
      <section class="battle-stage-main">
      <div class="hud battle-hud">
        <span>第 <b>${Game.state.generation}</b> 代魔王軍</span>
        <span>第 <b>${stageData.stage}</b> 作戦</span>
        <span class="muted">${U.esc(stageData.region)}</span>
      </div>
      <div class="chain-story" id="chain-story">
        <span class="chain-origin" id="chain-origin">能力がつながる瞬間を見届けよう</span>
        <b id="chain-reason"></b>
        <details class="chain-history" id="chain-history">
          <summary>ここまでの連鎖を読み返す <span id="chain-history-count"></span></summary>
          <p>最初の行動が1段目。その行動が次の出来事を起こすと2段目、さらに続くと3段目です。同じ段から別の反応に分かれることもあります。</p>
          <ol id="chain-history-list"></ol>
        </details>
      </div>
      <div class="${sceneClass}" id="scene">
        <div class="scene-fx" id="scene-fx"></div>
        <div class="battle-streak" id="battle-streak"><i></i><i></i><i></i></div>
        <div class="morale" id="morale">
          <span class="morale-label">魔王軍の戦意</span>
          <b id="morale-mult">×1.00</b>
          <div class="morale-bar"><i id="morale-fill"></i></div>
          <span class="morale-gain" id="morale-gain"></span>
        </div>
        <div class="chain-flare" id="chain-flare">
          <span class="chain-label">連鎖</span><b></b><i class="chain-mult"></i>
          <div class="chain-rungs" id="chain-rungs"></div>
        </div>
        <div class="burst" id="burst" aria-hidden="true">
          <div class="burst-rays"></div>
          <div class="burst-ring"></div>
          <div class="burst-copy">
            <span class="burst-kicker" id="burst-kicker"></span>
            <b id="burst-name"></b>
            <span class="burst-desc" id="burst-desc"></span>
            <div class="burst-stack" id="burst-stack"></div>
          </div>
        </div>
        <div class="screen-flash" id="screen-flash" aria-hidden="true"></div>
        <div class="scene-band" id="band-enemy"></div>
        <div class="scene-mid">
          <span class="scene-army">魔王軍</span>
          <span class="scene-vs">VS</span>
          <span class="scene-army">${U.esc(stageData.army)}</span>
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
        <button class="small" data-action="pausebattle" id="pause-btn">⏸ 読むために停止</button>
        <button class="small" data-action="skiplog">▶▶ 最後まで飛ばす</button>
        <button class="primary" data-action="afterbattle" id="next-btn" style="display:none">結果を見る</button>
      </div>
      </section>
      <aside class="battle-chronicle">
        <div class="battle-chronicle-title"><span>戦況記録</span><small>重要な出来事は戦場内でも表示される</small></div>
        <div class="log" id="log"></div>
      </aside>
      </div>`;
  },

  unitHtml(u) {
    return `<div class="bu" id="bu-${u.id}" data-side="${u.side}">
      <div class="bu-vfx-anchor" aria-hidden="true"></div>
      <div class="bu-flash"></div>
      <div class="bu-actor"><div class="bu-icon">${this.portraitHtml(u)}</div></div>
      <div class="bu-name">${U.esc(u.name)}</div>
      <div class="bu-hp"><div class="bu-hpfill" id="hp-${u.id}"></div></div>
      <span class="bu-state"></span>
      <div class="bu-pop" id="pop-${u.id}"></div>
    </div>`;
  },

  registerUnit(u) {
    if (!this.vfxPreloaded) {
      this.vfxPreloaded = true;
      for (const kind of Object.keys(this.VFX_DURATION)) {
        const image = new Image();
        image.src = `${this.EFFECT_DIR}${kind}.webp`;
      }
    }
    const artId = this.artId(u);
    if (this.BATTLE_SPRITES[artId] && !this.preloadedSprites.has(artId)) {
      this.preloadedSprites.add(artId);
      for (const pose of this.BATTLE_SPRITES[artId]) {
        const image = new Image();
        image.src = `${this.UNIT_DIR}${artId}/${pose}.webp`;
      }
    }
    this.units[u.id] = {
      el: document.getElementById("bu-" + u.id),
      fill: document.getElementById("hp-" + u.id),
      pop: document.getElementById("pop-" + u.id),
      side: u.side,
      icon: u.icon,
      name: u.name,
      summoned: !!u.summoned,
      tplId: artId,
      sprite: document.getElementById("bu-" + u.id).querySelector(".bu-sprite-img"),
      actor: document.getElementById("bu-" + u.id).querySelector(".bu-actor")
    };
    this.setHp(this.units[u.id], u.hp, u.maxHp);
    this.setLife(this.units[u.id], u.hp <= 0);
    const count = Math.max(...["player", "enemy"].map(side => Object.values(this.units).filter(unit => unit.side === side).length));
    const scene = document.getElementById("scene");
    if (scene) scene.style.minHeight = count > 5 ? `${count * 83 + 175}px` : "";
  },

  addSummon(data) {
    if (!data || this.units[data.id]) return null;
    const band = document.getElementById(data.side === "player" ? "band-player" : "band-enemy");
    if (!band) return null;
    const unit = { ...data, summoned: true };
    band.insertAdjacentHTML("beforeend", this.unitHtml(unit));
    this.registerUnit(unit);
    return this.units[data.id];
  },

  setLife(u, dead, permanent = false) {
    u.el.classList.toggle("dead", dead);
    u.el.dataset.life = dead ? (permanent ? "fallen" : "down") : "alive";
    const label = u.el.querySelector(".bu-state");
    if (label) label.textContent = dead ? (permanent ? "戦死" : "倒れた") : (u.summoned ? "召喚" : "");
    this.setPose(u, dead ? "fallen" : "idle");
  },

  arrival(u, kind) {
    this.clearFocus();
    u.el.classList.remove("revive-rise", "summon-rise");
    u.el.classList.add(kind === "summon" ? "summon-rise" : "revive-rise");
    const life = this.visualDuration(kind === "summon" ? 820 : 700);
    u.el.style.setProperty("--arrival-duration", `${life}ms`);
    this.animateActor(u, kind === "summon" ? [
      { opacity: 0, transform: "translateY(22px) scale(.6)" },
      { opacity: 1, transform: "translateY(-5px) scale(1.08)", offset: .7 },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ] : [
      { opacity: .35, transform: "translateY(10px) scaleY(.85)" },
      { opacity: 1, transform: "translateY(-8px) scaleY(1.04)", offset: .6 },
      { opacity: 1, transform: "translateY(0) scaleY(1)" }
    ], life);
    this.float(u, kind === "summon" ? "召喚！" : "復活！", "heal");
    this.showAction(`${u.name}が${kind === "summon" ? "参戦！" : "復活！"}`, 1000);
    this.unitVfx(u, "revive", kind === "summon" ? "summon-glow" : "", 2);
    this.timers.push(setTimeout(() => u.el.classList.remove("revive-rise", "summon-rise"), life));
  },

  // ── 再生 ──────────────────────────────────
  play(timeline, onDone) {
    this.stop();
    if (typeof Sound !== "undefined") Sound.stopAll();
    this.loadSpeed();
    this.units = {};
    this.onDone = onDone;
    this.finished = false;
    this.paused = false;
    this.resultPending = null;
    this.historySeen = new Set();
    const history = document.getElementById("chain-history-list");
    if (history) history.innerHTML = "";
    const count = document.getElementById("chain-history-count");
    if (count) count.textContent = "";
    const nextButton = document.getElementById("next-btn");
    if (nextButton) nextButton.style.display = "none";
    const pauseButton = document.getElementById("pause-btn");
    if (pauseButton) { pauseButton.disabled = false; pauseButton.textContent = "⏸ 読むために停止"; }
    const historyBox = document.getElementById("chain-history");
    if (historyBox) historyBox.ontoggle = () => {
      if (historyBox.open && !this.paused && !this.finished && !this.resultPending) this.togglePause();
    };

    const start = timeline.find(e => e.type === "battle_start");
    document.getElementById("band-enemy").innerHTML = start.enemy.map(u => this.unitHtml(u)).join("");
    document.getElementById("band-player").innerHTML = start.player.map(u => this.unitHtml(u)).join("");
    for (const u of [...start.enemy, ...start.player]) this.registerUnit(u);
    this.updateSpeedBtn();

    this.pacing = this.plan(timeline);
    this.eventById = new Map(timeline.filter(e => e.eventId).map(e => [e.eventId, e]));
    this.activeBeat = null;
    const origin = document.getElementById("chain-origin"), reason = document.getElementById("chain-reason");
    if (origin) origin.textContent = "能力がつながる瞬間を見届けよう";
    if (reason) reason.textContent = "";
    document.getElementById("scene").querySelectorAll(".scene-result").forEach(e => e.remove());
    document.getElementById("scene").classList.remove("decided");
    this.eventScale = 1;

    this.timeline = timeline;
    this.index = 0;
    this.step();
  },

  step() {
    if (this.paused) return;
    if (this.index >= this.timeline.length) return this.finish();
    const item = (this.pacing && this.pacing.items[this.index]) || { scale: 1 };
    const ev = this.timeline[this.index++];
    // 付随演出（字幕・光・カットイン）もこのイベントの倍率で伸縮させる
    this.activeBeat = item;
    this.eventScale = item.scale;
    const dur = this.render(ev);
    if (ev.type === "result") return; // 勝利の一拍と曲は倍速から独立
    const wait = Math.max(60, ((item.duration || dur) * this.eventScale) / this.speed);
    this.scheduleStep(wait);
  },

  scheduleStep(wait) {
    this.nextStepAt = Date.now() + wait;
    this.stepTimer = setTimeout(() => this.step(), wait);
    this.timers.push(this.stepTimer);
  },

  togglePause() {
    if (this.finished || this.resultPending) return;
    this.paused = !this.paused;
    if (this.paused) {
      clearTimeout(this.stepTimer);
      this.readingRemaining = Math.max(0, this.nextStepAt - Date.now());
    } else this.scheduleStep(this.readingRemaining || 0);
    const button = document.getElementById("pause-btn");
    if (button) button.textContent = this.paused ? "▶ 再開" : "⏸ 読むために停止";
  },

  durationOf(ev) {
    if (ev.type === "battle_start" && this.isFinalBattle) return 1450;
    const base = this.SPECIAL_DURATION[ev.type] !== undefined
      ? this.SPECIAL_DURATION[ev.type]
      : this.DURATION[ev.emphasis] || 300;
    return Math.round(base * this.magnitude(ev));
  },

  // 事件の大きさに応じた延長倍率。加算で積む。
  magnitude(ev) {
    let mult = 1;
    // 深度による一律延長はしない。連鎖全体の緩急は plan() が決める。
    // 蹂躙・粉砕+50%、消滅・魔王級+75%。小さな余剰は日常茶飯事なので短いままにし、
    // 大きい余剰だけがはっきり長くなるようにする（尺は事件の大きさに比例）
    if (ev.type === "overkill") mult += 0.25 * (ev.emphasis || 0);
    // カットインを読み切れる尺にする
    if (ev.type === "synergy" && ev.firstDiscovery) mult += 0.45;
    if (ev.type === "result" && ev.reversal) mult += 0.65;
    if (ev.type === "death" && ev.permanent) mult += 0.5;
    return mult;
  },

  // 「縮めてはいけない事件か」。hasChildren は plan() が集計して渡す。
  isProtected(ev, hasChildren) {
    if (this.PROTECTED_TYPES.has(ev.type)) return true;
    if (hasChildren) return true;                 // 何かが反応した起点（撃破攻撃は death が子）
    if (ev.type === "death") return !!ev.permanent;
    if (ev.type === "attack" || ev.type === "splash") return ev.chainDepth >= 3;
    return ev.chainDepth >= 2;
  },

  // タイムライン全体の尺の計画。純関数（DOMを触らない）なのでテストから直接呼べる。
  plan(timeline) {
    const events = timeline || [];
    const parents = new Set(events.filter(e => e.parentEventId).map(e => e.parentEventId));
    const items = events.map(ev => ({
      duration: this.durationOf(ev),
      protected: this.isProtected(ev, !!(ev.eventId && parents.has(ev.eventId))),
      scale: 1
    }));
    const chains = new Map();
    events.forEach((ev, index) => {
      if (!ev.chainId) return;
      if (!chains.has(ev.chainId)) chains.set(ev.chainId, []);
      chains.get(ev.chainId).push(index);
    });
    for (const indices of chains.values()) {
      if (!indices.some(i => (events[i].chainDepth || 0) >= 3)) continue;
      const hits = indices.filter(i => ["attack", "splash"].includes(events[i].type));
      if (!hits.length) continue;
      const overkills = indices.filter(i => events[i].type === "overkill");
      const peak = overkills.reduce((best, i) => best === null || events[i].percent > events[best].percent ? i : best, null);
      for (const i of indices) {
        const ev = events[i], item = items[i];
        item.beat = "relay";
        item.showBurst = ev.type !== "overkill" || i === peak;
        if (i === hits[0]) item.beat = "origin";
        else if (i === peak || (i === hits[hits.length - 1] && hits.length > 1)) item.beat = "payoff";
        // 遅めに読む人を基準にする。中間・同じ能力の再発火も同じだけ読ませる。
        const letters = Array.from(ev.text || ev.desc || ev.name || ev.label || "").length;
        item.duration = Math.max(item.duration, Math.min(6500, Math.max(3000, 1600 + letters * 65)));
        item.protected = true;
      }
    }
    const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);
    const protectedMs = sum(items.filter(i => i.protected), i => i.duration);
    const compressibleMs = sum(items.filter(i => !i.protected), i => i.duration);
    const rawMs = protectedMs + compressibleMs;
    const compressScale = 1;
    return {
      items, rawMs, protectedMs, compressibleMs, compressScale,
      plannedMs: sum(items, i => i.duration * i.scale)
    };
  },

  // 1イベントを描画し、次までの尺(ms)を返す
  render(ev) {
    if (ev.text) this.appendLog(ev.text, ev.cls);
    this.chainFlare(ev);
    this.tellChain(ev);
    if (typeof Sound !== "undefined" && !["attack", "splash", "result"].includes(ev.type)) {
      const from = this.units[ev.fromId];
      Sound.battle(ev, { speed: this.speed, final: this.isFinalBattle, fromSide: from && from.side });
    }

    switch (ev.type) {
      case "battle_start":
        this.synergyNames = [];
        this.setMorale(1, 0);
        if (this.isFinalBattle) this.battleIntro();
        break;
      case "round_start":
        // ラウンドが変わったら、伸びていた鎖はそこで締める
        this.settleChain();
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
        this.attackMotion(from, to, ev);
        break;
      }
      case "death": {
        const u = this.units[ev.unitId];
        if (u) {
          this.setLife(u, true, !!ev.permanent);
          this.float(u, ev.permanent ? "戦死…" : "倒れた！", "fallen");
        }
        break;
      }
      case "revive": {
        const u = this.units[ev.unitId];
        if (u) {
          this.setLife(u, false);
          this.setHp(u, ev.hp, ev.maxHp);
          this.arrival(u, "revive");
        }
        break;
      }
      case "summon": {
        const summoned = this.addSummon(ev.unit);
        if (summoned) this.arrival(summoned, "summon");
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
          this.unitVfx(u, "guard", "", 2);
          this.pulse("guard");
        }
        break;
      }
      case "synergy":
        this.pulse(ev.id);
        // 積み上げた結果である《魔王軍完成》だけは全画面で見せる。
        // ここが「揃った瞬間」そのものなので、他のシナジーと同じ扱いにしない。
        if (ev.id === "overload") {
          this.burst({
            kicker: "SYNERGY OVERLOAD",
            name: "魔王軍完成",
            desc: ev.desc || "",
            parts: this.synergyNames.slice(),
            stacks: Math.max(2, this.synergyNames.length),
            tone: "fx-overload"
          });
        } else {
          this.synergyNames.push(ev.name);
          this.flash(1);
          this.cutin(ev.name, ev.desc, ev.id, this.synergyNames.length);
        }
        break;
      case "facility_trigger":
        this.pulse("overkill");
        this.cutin(ev.name, ev.desc || "次の味方攻撃+40%", "facility");
        break;
      case "resource_gain": {
        const u = this.units[ev.sourceId];
        const unit = ev.resource === "gold" ? "G" : ev.resource === "soul" ? "魂" : ev.resource;
        if (u) {
          this.clearFocus();
          u.el.classList.add("acting");
          this.float(u, `+${ev.amount}${unit}`, "heal");
        }
        this.showAction(`${ev.label || "獲得"}　+${ev.amount}${unit}`, 900);
        break;
      }
      case "resource_forfeit": {
        const u = this.units[ev.sourceId];
        const unit = ev.resource === "gold" ? "G" : ev.resource;
        if (u) {
          this.clearFocus();
          u.el.classList.add("targeted");
          this.float(u, `-${ev.amount}${unit}`, "damage");
        }
        this.showAction(`${ev.label || "予約"}没収　-${ev.amount}${unit}`, 900);
        break;
      }
      case "resource_consume": {
        if (ev.resource === "soul") this.showAction(`魂を${ev.amount}消費`, 750);
        break;
      }
      // 戦意：OVERKILLの見返りを数字で見せ続ける。
      // 常設のメーターが上がっていくことが「爆発力が上がった」の実体。
      case "momentum": {
        this.setMorale(ev.mult, ev.gain);
        this.showAction(`戦意 +${ev.gain}%　与ダメージ ×${ev.mult.toFixed(2)}`, 900);
        this.flash(1);
        break;
      }
      case "trait_trigger": {
        const u = this.units[ev.sourceId];
        this.clearFocus();
        if (u) u.el.classList.add("acting");
        const propagating = ev.traitId === "overload" || ev.traitId === "chain_massacre";
        this.showAction(propagating
          ? `【${ev.name}】連鎖${ev.propagationDepth || 1}段目！　余剰の${ev.ratio || 35}%が流れ込む`
          : `【${ev.name}】発動！`, 1000);
        this.pulse(ev.traitId);
        if (propagating) {
          this.flash(1);
          if (u) this.unitVfx(u, "overkill", "", 3);
          // このイベントの直後に殴られる相手へ稲妻を渡す。
          const next = this.timeline.slice(this.index).find(e =>
            (e.type === "splash" || e.type === "attack") && this.units[e.toId]
            && (e.parentEventId ? e.parentEventId === ev.eventId : e.chainId === ev.chainId));
          const target = next && this.units[next.toId];
          if (u && target) this.bolt(u, target, ev.chainDepth || 2);
          else this.attackStreak(u ? u.side : "player", true, 3);
        }
        break;
      }
      case "overkill": {
        const target = this.units[ev.toId];
        this.clearFocus();
        if (target) {
          target.el.classList.add("targeted");
          this.float(target, `${ev.percent}%`, "damage");
          this.unitVfx(target, "overkill", "", ev.emphasis || 2);
        }
        this.showAction(`${ev.rank}　余剰${ev.excess}ダメージ`, 1100);
        this.pulse("overkill");
        // 実測でOVERKILLは1戦4回出るが、その97%は余剰100%未満の「日常」。
        // 旧しきい値（揺れ300%・カットイン500%）は実プレイでほぼ発火しておらず、
        // 見せ場が一度も立っていなかった。蹂躙以上（100%以上・約10戦に1回）を見せ場にする。
        if (ev.percent >= 100 && this.activeBeat?.showBurst !== false) {
          this.shake();
          this.burst({
            kicker: "OVERKILL",
            name: ev.rank,
            desc: this.units[ev.fromId]?.side === "player"
              ? `余剰 ${ev.excess} ダメージ（${ev.percent}%）→ 魔王軍の戦意へ`
              : `余剰 ${ev.excess} ダメージ（${ev.percent}%）`,
            stacks: ev.percent >= 300 ? 4 : ev.percent >= 200 ? 3 : 2,
            tone: "fx-overkill"
          });
        }
        break;
      }
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
        this.resolveBattle(ev);
        break;
    }
    return this.durationOf(ev);
  },

  setHp(u, hp, maxHp) {
    u.fill.style.transform = `scaleX(${Math.max(0, hp / maxHp)})`;
    u.fill.classList.toggle("low", hp / maxHp <= 0.3);
  },

  // 表示済みの因果だけを使う。未来の撃破や報酬を先に見せない。
  tellChain(ev, animate = true) {
    if (ev.chainId && !ev.parentEventId && ["attack", "splash"].includes(ev.type)) {
      const origin = document.getElementById("chain-origin"), reason = document.getElementById("chain-reason");
      const from = this.units[ev.fromId], to = this.units[ev.toId];
      if (origin) origin.textContent = from ? `${from.name}が動く` : "次の攻撃";
      if (reason) reason.textContent = from && to ? `${from.name} → ${to.name}` : "";
      return;
    }
    if (!ev.chainId || !ev.parentEventId || !this.eventById) return;
    const parent = this.eventById.get(ev.parentEventId);
    if (!parent) return;
    const origin = document.getElementById("chain-origin"), reason = document.getElementById("chain-reason");
    if (!origin || !reason) return;
    let root = parent;
    const visited = new Set();
    while (root.parentEventId && !visited.has(root.eventId)) {
      visited.add(root.eventId);
      const next = this.eventById.get(root.parentEventId);
      if (!next) break;
      root = next;
    }
    const actor = e => this.units[e.sourceId || e.fromId || e.unitId];
    const starter = actor(root);
    const label = e => {
      const who = actor(e)?.name || "";
      if (e.type === "resource_gain") return `${who} ${e.label || "獲得"} +${e.amount}${e.resource === "gold" ? "G" : e.resource === "soul" ? "魂" : e.resource}`;
      if (e.type === "attack" || e.type === "splash") return `${who}の${e.label || (e.parentEventId ? "追撃" : "攻撃")}`;
      if (e.type === "momentum") return `戦意 ×${Number(e.mult).toFixed(2)}`;
      if (e.type === "overkill") return `${e.rank || "OVERKILL"} ${e.percent}%`;
      if (e.type === "death") return `${who}が倒れた`;
      return `${who}${who ? "の" : ""}${e.name || e.label || ({revive: "蘇生", summon: "召喚", survive: "生存", heal: "回復"}[e.type] || "反応")}`;
    };
    origin.textContent = starter ? `起点：${starter.name}` : "能力がつながった";
    const who = actor(ev)?.name || "味方";
    let explanation;
    if (ev.type === "trait_trigger" && ev.traitId === "greedy") {
      explanation = `${label(parent)}を得たので、${who}の「強欲」が発動。追加でもう一度攻撃する。`;
    } else if (ev.type === "attack" || ev.type === "splash") {
      explanation = `${label(parent)}がきっかけで、${who}が${this.units[ev.toId]?.name || "敵"}へ追撃。${ev.dmg}ダメージ。`;
    } else if (ev.type === "resource_gain") {
      explanation = `${label(parent)}がきっかけで、${label(ev)}を獲得。`;
    } else if (ev.type === "momentum") {
      explanation = `${label(parent)}の余剰ダメージで味方全員の戦意が上昇。与えるダメージが${Number(ev.mult).toFixed(2)}倍に。`;
    } else if (ev.type === "overkill") {
      explanation = `${label(parent)}が敵の残りHPを超えた！ 余剰${ev.excess}ダメージ（${ev.percent}% OVERKILL）。`;
    } else explanation = `${label(parent)}がきっかけで、${label(ev)}。`;
    reason.textContent = `第${ev.chainDepth}段：${explanation}`;
    this.historySeen ||= new Set();
    const list = document.getElementById("chain-history-list");
    for (const entry of [root, parent, ev]) {
      if (!list || !entry.eventId || this.historySeen.has(entry.eventId)) continue;
      this.historySeen.add(entry.eventId);
      const row = document.createElement("li");
      row.innerHTML = `<b>第${entry.chainDepth || 1}段</b> ${U.esc(label(entry))}${entry === ev ? `<small>${U.esc(explanation)}</small>` : ""}`;
      list.appendChild(row);
    }
    const count = document.getElementById("chain-history-count");
    if (count) count.textContent = `（${this.historySeen.size}件）`;
    const from = actor(parent), to = actor(ev);
    if (animate && ev.type === "trait_trigger" && from && to && from !== to) this.bolt(from, to, ev.chainDepth || 2, "relay");
  },

  hit(u, dmg, emphasis, label, scale) {
    u.el.classList.remove("hit", "hit-big");
    void u.el.offsetWidth;
    u.el.classList.add(emphasis >= 2 ? "hit-big" : "hit");
    // 連鎖が深いほど、戦意が高いほど、数字そのものを大きく出す。
    // 「爆発力が上がった」を伝えるのに一番直接的な信号は、でかい数字。
    const tier = Math.min(3, Math.max(0, scale || 0));
    const cls = [emphasis >= 2 ? "big" : "", tier ? `surge s${tier}` : ""].filter(Boolean).join(" ");
    this.float(u, (label ? label + " " : "") + dmg, cls);
  },

  clearFocus() {
    document.querySelectorAll("#scene .scene-band").forEach(b => b.style.zIndex = "1");
    for (const u of Object.values(this.units)) {
      u.el.classList.remove("acting", "targeted", "trouble");
    }
  },

  focusAttack(from, to, ev) {
    this.clearFocus();
    if (from) from.el.classList.add("acting");
    if (from) from.el.closest(".scene-band").style.zIndex = "3";
    if (to) to.el.classList.add("targeted");
    if (!from || !to) return;
    const action = ev.type === "splash" ? (ev.label || "追撃")
      : ({ arrow: "射撃", stone: "投石", magic: "魔法攻撃" }[this.attackKind(from)] || "攻撃");
    this.showAction(`${from.name}の${action}　→　${to.name}`);
  },

  // 生成画像は戦闘ルールを知らない表示素材。読込失敗時は既存CSS演出だけが残る。
  unitVfx(u, kind, variant, emphasis) {
    if (!u || !u.el) return;
    const anchor = u.el.querySelector(".bu-vfx-anchor");
    if (!anchor) return;
    const img = document.createElement("img");
    img.className = `bu-vfx vfx-${kind}${variant ? ` ${variant}` : ""}${emphasis >= 2 ? " heavy" : ""}`;
    img.alt = "";
    img.src = `${this.EFFECT_DIR}${kind}.webp`;
    img.onerror = () => img.remove();
    const life = this.visualDuration(this.VFX_DURATION[kind] || 560);
    img.style.animationDuration = `${life}ms`;
    anchor.appendChild(img);
    this.timers.push(setTimeout(() => img.remove(), life));
  },

  setPose(u, pose) {
    if (!u || !u.sprite || u.sprite.dataset.spriteFailed || !this.BATTLE_SPRITES[u.tplId]?.has(pose)) return;
    u.sprite.dataset.pose = pose;
    u.sprite.src = `${this.UNIT_DIR}${u.tplId}/${pose}.webp`;
  },

  animateActor(u, frames, duration) {
    if (!u?.actor || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const motion = u.actor.animate(frames, { duration, easing: "linear" });
    this.motions.add(motion);
    motion.onfinish = () => { this.motions.delete(motion); motion.cancel(); };
  },

  meleeFrames(u, dx, dy, direction) {
    if (u.tplId === "cavalry") return [
      { transform: "translate(0,0)", offset: 0 },
      { transform: `translate(${-direction * 8}px,-3px)`, offset: .2 },
      { transform: `translate(${dx * .65}px,${dy - 10}px)`, offset: .3 },
      { transform: `translate(${dx}px,${dy}px)`, offset: .38 },
      { transform: `translate(${dx}px,${dy}px)`, offset: .48 },
      { transform: `translate(${dx * .45}px,${dy - 4}px)`, offset: .7 },
      { transform: "translate(0,0)", offset: 1 }
    ];
    if (u.tplId === "commander") return [
      { transform: "translate(0,0)", offset: 0 },
      { transform: `translate(${-direction * 6}px,1px)`, offset: .22 },
      { transform: `translate(${dx}px,${dy}px)`, offset: .38 },
      { transform: `translate(${dx}px,${dy}px)`, offset: .52 },
      { transform: "translate(0,0)", offset: 1 }
    ];
    if (u.tplId === "hero") return [
      { transform: "translate(0,0) rotate(0deg)", offset: 0 },
      { transform: `translate(${-direction * 12}px,5px) rotate(${-direction * 5}deg)`, offset: .27 },
      { transform: `translate(${dx}px,${dy}px) rotate(${direction * 4}deg)`, offset: .38 },
      { transform: `translate(${dx}px,${dy}px) rotate(${direction * 4}deg)`, offset: .54 },
      { transform: "translate(0,0) rotate(0deg)", offset: 1 }
    ];
    if (u.tplId === "shield") return [
      { transform: "translate(0,0)", offset: 0 },
      { transform: `translate(${-direction * 5}px,4px)`, offset: .25 },
      { transform: `translate(${dx}px,${dy + 2}px)`, offset: .38 },
      { transform: `translate(${dx}px,${dy + 2}px)`, offset: .58 },
      { transform: "translate(0,0)", offset: 1 }
    ];
    if (u.tplId === "king_slime") return [
      { transform: "translate(0,0) scale(1)", offset: 0 },
      { transform: `translate(${-direction * 7}px,8px) scale(1.2,.74)`, offset: .27 },
      { transform: `translate(${dx}px,${dy}px) scale(1.12,.9)`, offset: .38 },
      { transform: `translate(${dx}px,${dy}px) scale(.95,1.1)`, offset: .53 },
      { transform: `translate(${dx * .35}px,${dy * .35}px) scale(1.1,.91)`, offset: .76 },
      { transform: "translate(0,0) scale(.98,1.02)", offset: .91 },
      { transform: "translate(0,0) scale(1)", offset: 1 }
    ];
    if (u.tplId === "ogre") return [
      { transform: "translate(0,0) rotate(0deg)", offset: 0 },
      { transform: `translate(${-direction * 9}px,4px) rotate(${-direction * 5}deg)`, offset: .28 },
      { transform: `translate(${dx}px,${dy + 6}px) rotate(${direction * 4}deg)`, offset: .38 },
      { transform: `translate(${dx}px,${dy + 6}px) rotate(${direction * 4}deg)`, offset: .62 },
      { transform: "translate(0,0) rotate(0deg)", offset: 1 }
    ];
    if (u.tplId === "kobold") return [
      { transform: "translate(0,0) scale(1)", offset: 0 },
      { transform: `translate(${-direction * 12}px,6px) scale(1.05,.9)`, offset: .23 },
      { transform: `translate(${dx * .7}px,${dy - 14}px) scale(1)`, offset: .32 },
      { transform: `translate(${dx}px,${dy}px) scale(1)`, offset: .38 },
      { transform: `translate(${dx * .45}px,${dy - 7}px) scale(1)`, offset: .64 },
      { transform: "translate(0,0) scale(1)", offset: 1 }
    ];
    if (u.tplId === "zombie") return [
      { transform: "translate(0,0) rotate(0deg)", offset: 0 },
      { transform: `translate(${-direction * 5}px,2px) rotate(${-direction * 8}deg)`, offset: .26 },
      { transform: `translate(${dx}px,${dy + 3}px) rotate(${direction * 7}deg)`, offset: .38 },
      { transform: `translate(${dx}px,${dy + 3}px) rotate(${direction * 7}deg)`, offset: .6 },
      { transform: "translate(0,0) rotate(0deg)", offset: 1 }
    ];
    if (["orc", "axeman"].includes(u.tplId)) return [
      { transform: "translate(0,0) scale(1)", offset: 0 },
      { transform: `translate(${-direction * 7}px,4px) rotate(${-direction * 8}deg) scale(1.04,.94)`, offset: .27 },
      { transform: `translate(${dx}px,${dy + 5}px) rotate(${direction * 9}deg) scale(1.06,.94)`, offset: .38 },
      { transform: `translate(${dx}px,${dy + 5}px) rotate(${direction * 9}deg) scale(1.06,.94)`, offset: .56 },
      { transform: `translate(${dx * .3}px,${dy * .3 + 2}px) rotate(${direction * 3}deg)`, offset: .82 },
      { transform: "translate(0,0) scale(1)", offset: 1 }
    ];
    if (u.tplId === "slime") return [
      { transform: "translate(0,0) scale(1)", offset: 0 },
      { transform: `translate(${-direction * 8}px,7px) scale(1.2,.75)`, offset: .2 },
      { transform: `translate(${dx * .5}px,${dy * .5 - 28}px) scale(.9,1.13)`, offset: .29 },
      { transform: `translate(${dx}px,${dy}px) scale(1.12,.86)`, offset: .38 },
      { transform: `translate(${dx}px,${dy + 5}px) scale(1.18,.8)`, offset: .48 },
      { transform: "translate(0,-8px) scale(.96,1.06)", offset: .83 },
      { transform: "translate(0,0) scale(1)", offset: 1 }
    ];
    if (u.tplId === "skeleton") return [
      { transform: "translate(0,0) rotate(0deg)", offset: 0 },
      { transform: `translate(${-direction * 13}px,2px) rotate(${-direction * 7}deg)`, offset: .25 },
      { transform: `translate(${dx}px,${dy}px) rotate(${direction * 4}deg)`, offset: .38 },
      { transform: `translate(${dx}px,${dy}px) rotate(0deg)`, offset: .48 },
      { transform: "translate(0,0) rotate(-2deg)", offset: .85 },
      { transform: "translate(0,0) rotate(0deg)", offset: 1 }
    ];
    return [
      { transform: "translate(0,0) scale(1)", offset: 0 },
      { transform: `translate(${-direction * 10}px,4px) scale(.94,1.04)`, offset: .2 },
      { transform: `translate(${dx}px,${dy}px) scale(1.05,.97)`, offset: .38 },
      { transform: `translate(${dx}px,${dy}px) scale(1.05,.97)`, offset: .48 },
      { transform: "translate(0,0) scale(1)", offset: 1 }
    ];
  },

  // 伝播は「次の敵へ走る」ことが見えないと連鎖に見えない。
  // 汎用の斜め集中線ではなく、2体のあいだに実際に稲妻を渡す。
  bolt(from, to, depth, kind = "") {
    const scene = document.getElementById("scene");
    if (!scene || !from?.actor || !to?.actor) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stage = scene.getBoundingClientRect();
    const a = from.actor.getBoundingClientRect(), b = to.actor.getBoundingClientRect();
    const start = { x: a.x + a.width / 2 - stage.x, y: a.y + a.height * .5 - stage.y };
    const end = { x: b.x + b.width / 2 - stage.x, y: b.y + b.height * .5 - stage.y };
    const dx = end.x - start.x, dy = end.y - start.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const el = document.createElement("span");
    el.className = `chain-bolt ${kind} d${Math.min(4, Math.max(1, depth - 2))}`;
    el.setAttribute("aria-hidden", "true");
    el.style.left = `${start.x}px`;
    el.style.top = `${start.y}px`;
    el.style.width = `${len}px`;
    el.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
    const life = this.visualDuration(460);
    el.style.animationDuration = `${life}ms`;
    scene.appendChild(el);
    this.timers.push(setTimeout(() => el.remove(), life));
  },

  projectileMotion(from, to, kind, contact) {
    const scene = document.getElementById("scene");
    if (!scene || !from?.actor || !to?.actor) return () => {};
    const stage = scene.getBoundingClientRect();
    const a = from.actor.getBoundingClientRect(), b = to.actor.getBoundingClientRect();
    const start = { x: a.x + a.width / 2 - stage.x - scene.clientLeft, y: a.y + a.height * .6 - stage.y - scene.clientTop };
    const end = { x: b.x + b.width / 2 - stage.x - scene.clientLeft, y: b.y + b.height * .6 - stage.y - scene.clientTop };
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    const el = document.createElement("span");
    el.className = `battle-projectile projectile-${kind}`;
    el.setAttribute("aria-hidden", "true");
    const pose = p => `translate(${p.x}px, ${p.y}px) rotate(${angle}deg)`;
    scene.appendChild(el);
    const motion = el.animate([
      { transform: pose(start), opacity: 0, offset: 0 },
      { transform: pose(start), opacity: 0, offset: .34 },
      { transform: pose(start), opacity: 1, offset: .35 },
      { transform: pose({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - (kind === "stone" ? 28 : 0) }), opacity: 1, offset: .675 },
      { transform: pose(end), opacity: 1, offset: 1 }
    ], { duration: contact, fill: "both", easing: "linear" });
    this.motions.add(motion);
    return () => { motion.cancel(); this.motions.delete(motion); el.remove(); };
  },

  // ルールは即時計算済み。表示だけを「溜め→接触→戻り」へ分ける。
  // 中断時は pendingHits でHPだけ確定し、次イベントやスキップと食い違わせない。
  attackMotion(from, to, ev) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 読む時間を長くしても、攻撃動作自体はスローモーションにしない。
    const total = this.visualDuration(Math.min(950, this.durationOf(ev) * .88));
    const kind = ev.type === "splash" ? "melee" : this.attackKind(from);
    const ranged = kind !== "melee";
    const contact = reduced ? 0 : total * (ranged ? .62 : .38);
    const settle = () => { if (to) this.setHp(to, ev.hp, ev.maxHp); };
    this.pendingHits.add(settle);
    const later = (fn, ms) => this.timers.push(setTimeout(fn, ms));
    let removeProjectile = () => {};
    if (from && to && ranged && !reduced) {
      this.setPose(from, "attack-windup");
      later(() => this.setPose(from, "strike"), total * .22);
      later(() => this.setPose(from, "recover"), total * .68);
      later(() => this.setPose(from, from.el.classList.contains("dead") ? "fallen" : "idle"), total);
      removeProjectile = this.projectileMotion(from, to, kind, contact);
      const direction = from.side === "player" ? 1 : -1;
      const frames = from.tplId === "imp" ? [
        { transform: "translateY(0) scale(1)", offset: 0 },
        { transform: "translateY(4px) scale(1.08,.88)", offset: .18 },
        { transform: "translateY(-14px) scale(.97,1.03)", offset: .3 },
        { transform: "translateY(-8px) scale(1)", offset: .62 },
        { transform: "translateY(2px) scale(1.04,.96)", offset: .78 },
        { transform: "translateY(0) scale(1)", offset: 1 }
      ] : from.tplId === "necromancer" ? [
        { transform: "translateX(0)", offset: 0 },
        { transform: `translateX(${-direction * 2}px)`, offset: .2 },
        { transform: `translateX(${direction * 3}px)`, offset: .4 },
        { transform: "translateX(0)", offset: 1 }
      ] : [
        { transform: "translateX(0)" },
        { transform: `translateX(${-direction * 6}px) rotate(${-direction * 3}deg)`, offset: .22 },
        { transform: "translateX(0)", offset: .45 },
        { transform: "translateX(0)" }
      ];
      this.animateActor(from, frames, total);
    }
    if (from && to && ev.type === "attack" && !ranged && !reduced) {
      const a = from.actor.getBoundingClientRect(), b = to.actor.getBoundingClientRect();
      const direction = from.side === "player" ? 1 : -1;
      const dx = b.x + b.width / 2 - a.x - a.width / 2 - direction * b.width * .75;
      const dy = b.y - a.y;
      this.setPose(from, "attack-windup");
      this.animateActor(from, this.meleeFrames(from, dx, dy, direction), total);
      later(() => this.setPose(from, "strike"), contact * .85);
      later(() => this.setPose(from, "recover"), total * .6);
      later(() => this.setPose(from, from.el.classList.contains("dead") ? "fallen" : "idle"), total);
    }
    const impact = () => {
      removeProjectile();
      settle();
      this.pendingHits.delete(settle);
      if (typeof Sound !== "undefined") Sound.battle(ev, { speed: this.speed, final: this.isFinalBattle, fromSide: from?.side, tplId: from?.tplId, attackKind: kind });
      if (!to) return;
      if (ev.type !== "splash" && !ranged && !["slime", "king_slime", "kobold", "zombie", "ogre", "shield"].includes(from?.tplId)) this.unitVfx(to, "slash", from?.side === "enemy" ? "reverse" : "", ev.emphasis);
      this.unitVfx(to, "impact", ranged ? `impact-${kind}` : "", ev.emphasis);
      // 連鎖の段と戦意の高さで数字の大きさが変わる
      const surge = Math.max(
        Math.max(0, (ev.chainDepth || 1) - 2),
        this.moraleTier || 0
      );
      this.hit(to, ev.dmg, ev.emphasis, ev.label, surge);
      this.setPose(to, "hurt");
      const recoil = to.side === "player" ? -1 : 1;
      this.animateActor(to, ["slime", "king_slime"].includes(to.tplId) ? [
        { transform: "scale(1)" },
        { transform: `translateX(${recoil * 9}px) scale(1.25,.7)`, offset: .22 },
        { transform: "scale(.9,1.1)", offset: .7 },
        { transform: "scale(1)" }
      ] : [
        { transform: "translateX(0)" },
        { transform: `translateX(${recoil * 13}px) rotate(${recoil * 8}deg)`, offset: .22 },
        { transform: "translateX(0)" }
      ], Math.min(total * .48, total - contact));
      later(() => {
        this.setPose(to, to.el.classList.contains("dead") ? "fallen" : "idle");
        to.el.classList.remove("hit", "hit-big");
      }, Math.min(total * .5, total - contact));
      if (ev.emphasis >= 3 && !reduced) this.shake();
    };
    if (reduced) impact(); else later(impact, contact);
  },

  unitPose(u, pose, duration) {
    if (!u || !u.sprite || u.sprite.dataset.spriteFailed || !this.BATTLE_SPRITES[u.tplId] || !this.BATTLE_SPRITES[u.tplId].has(pose)) return;
    const marker = `${pose}-${Date.now()}-${Math.random()}`;
    u.sprite.dataset.poseMarker = marker;
    u.sprite.dataset.pose = pose;
    u.sprite.src = `${this.UNIT_DIR}${u.tplId}/${pose}.webp`;
    this.timers.push(setTimeout(() => {
      if (!u.sprite || u.sprite.dataset.spriteFailed || u.sprite.dataset.poseMarker !== marker) return;
      u.sprite.dataset.pose = "idle";
      u.sprite.src = `${this.UNIT_DIR}${u.tplId}/idle.webp`;
    }, this.visualDuration(duration || 360)));
  },

  // 座標を測らず、陣営方向だけで戦場全体に攻撃軌道を走らせる。
  // 個々の命中先は従来どおり acting / targeted が示す。
  attackStreak(side, splash, emphasis) {
    const streak = document.getElementById("battle-streak");
    if (!streak) return;
    streak.className = `battle-streak ${side === "player" ? "to-enemy" : "to-player"}${splash ? " splash" : ""}${emphasis >= 2 ? " heavy" : ""}`;
    void streak.offsetWidth;
    streak.classList.add("show");
    streak.style.animationDuration = `${this.visualDuration(520)}ms`;
    this.timers.push(setTimeout(() => streak.classList.remove("show"), (520 * this.eventScale) / this.speed));
  },

  // CHAINは「点いて消える」ではなく「積み上がって居座る」。
  // 一発ごとに光って消えると、伸びていることが体感できない。
  // 同じ chainId のあいだ数字は画面に残り、深くなるほど大きく熱くなる。
  CHAIN_TIERS: ["t2", "t3", "t4", "t5"],

  resetChain(immediate) {
    const flare = document.getElementById("chain-flare");
    this.chainLive = null;
    if (!flare) return;
    if (this.chainSettleTimer) { clearTimeout(this.chainSettleTimer); this.chainSettleTimer = null; }
    if (immediate) {
      flare.className = "chain-flare";
      const rungs = document.getElementById("chain-rungs");
      if (rungs) rungs.innerHTML = "";
    }
  },

  chainFlare(ev) {
    const depth = (ev && ev.chainDepth) || 0;
    const flare = document.getElementById("chain-flare");
    if (!flare) return;
    // 連鎖でない出来事が挟まったら、いま伸びている鎖はそこで終わり。
    if (depth < 2 || !ev.chainId) {
      if (this.chainLive && ev && ev.chainId && ev.chainId !== this.chainLive.id) this.settleChain();
      return;
    }
    const live = this.chainLive;
    if (!live || live.id !== ev.chainId) {
      this.settleChain(true);
      this.chainLive = { id: ev.chainId, depth: 0 };
    }
    if (depth <= this.chainLive.depth) return;   // 同じ深さの枝は数え直さない
    this.chainLive.depth = depth;

    const tier = this.CHAIN_TIERS[Math.min(this.CHAIN_TIERS.length - 1, depth - 2)];
    flare.className = `chain-flare live ${tier}`;
    flare.querySelector("b").textContent = depth;
    flare.querySelector(".chain-mult").textContent = depth >= 4 ? "!!" : depth >= 3 ? "!" : "";
    // 段が increments するたび、数字そのものを叩く
    flare.classList.remove("bump");
    void flare.offsetWidth;
    flare.classList.add("bump");
    flare.style.setProperty("--chain-bump", `${this.visualDuration(420)}ms`);

    // 伸びた段を横に積む。何段目まで来たかが一目で残る。
    const rungs = document.getElementById("chain-rungs");
    if (rungs) {
      const rung = document.createElement("i");
      rung.style.animationDuration = `${this.visualDuration(380)}ms`;
      rungs.appendChild(rung);
    }
    // 深いほど画面ごと熱くなる
    if (depth >= 4 && !matchMedia("(prefers-reduced-motion: reduce)").matches) this.shake();
    this.heat(Math.min(3, depth - 1));
  },

  // 鎖が途切れた瞬間に「×N」で締める。締めがないと、伸びた実感が残らない。
  settleChain(silent) {
    const live = this.chainLive;
    this.chainLive = null;
    const flare = document.getElementById("chain-flare");
    if (!flare) return;
    if (this.chainSettleTimer) { clearTimeout(this.chainSettleTimer); this.chainSettleTimer = null; }
    if (!live || silent || live.depth < 2) {
      flare.className = "chain-flare";
      const r = document.getElementById("chain-rungs");
      if (r) r.innerHTML = "";
      return;
    }
    flare.classList.add("settle");
    const life = this.visualDuration(live.depth >= 4 ? 1100 : 760);
    flare.style.setProperty("--chain-settle", `${life}ms`);
    this.chainSettleTimer = setTimeout(() => {
      flare.className = "chain-flare";
      const r = document.getElementById("chain-rungs");
      if (r) r.innerHTML = "";
      this.chainSettleTimer = null;
    }, life);
    this.timers.push(this.chainSettleTimer);
  },

  // 画面全体の熱。連鎖が深いほど背景が焼ける。
  heat(level) {
    const s = document.getElementById("scene");
    if (!s) return;
    s.classList.remove("heat-1", "heat-2", "heat-3");
    if (level > 0) s.classList.add(`heat-${level}`);
    if (this.heatTimer) clearTimeout(this.heatTimer);
    this.heatTimer = setTimeout(() => s.classList.remove("heat-1", "heat-2", "heat-3"),
      this.visualDuration(1200));
    this.timers.push(this.heatTimer);
  },

  showAction(text, duration) {
    const c = document.getElementById("action-caption");
    if (!c) return;
    if (this.captionTimer) clearTimeout(this.captionTimer);
    c.textContent = text;
    c.style.animationDuration = `${this.visualDuration(duration || 600)}ms`;
    c.classList.remove("show");
    void c.offsetWidth;
    c.classList.add("show");
    // 次の説明で置き換えるまで残す。読む途中でフェードアウトしない。
  },

  battleIntro() {
    const intro = document.getElementById("scene-intro");
    if (!intro) return;
    intro.classList.remove("show");
    intro.style.animationDuration = `${this.visualDuration(1400)}ms`;
    void intro.offsetWidth;
    intro.classList.add("show");
    this.timers.push(setTimeout(() => intro.classList.remove("show"), (1400 * this.eventScale) / this.speed));
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
    b.style.animationDuration = `${this.visualDuration(1080)}ms`;
    void b.offsetWidth;
    b.classList.add("show");
    this.timers.push(setTimeout(() => b.classList.remove("show"), (1080 * this.eventScale) / this.speed));
  },

  pulse(kind) {
    const s = document.getElementById("scene");
    if (!s) return;
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    s.classList.remove("fx-active");
    for (const cls of this.EFFECT_CLASSES) s.classList.remove(cls);
    const synergyKinds = [
      "goblin_horde", "king_slime", "legion_of_dead", "arcane_circle",
      "cheap_labor", "elite_few", "general_command", "overload"
    ];
    const cls = synergyKinds.includes(kind) ? `fx-${kind}`
      : kind === "revive" ? "fx-revive"
        : kind === "guard" ? "fx-guard"
          : kind === "overkill" ? "fx-overkill"
            // 伝播と魔王軍完成は魔王軍の手柄。事件（赤い縞）の色に落とさない。
            : (kind === "overload" || kind === "chain_massacre") ? "fx-overload"
              : ["greedy", "pickpocket"].includes(kind) ? "fx-loot" : "fx-incident";
    s.classList.add(cls);
    void s.offsetWidth;
    s.classList.add("fx-active");
    const fx = s.querySelector(".scene-fx");
    if (fx) fx.style.animationDuration = `${this.visualDuration(1450)}ms`;
    this.pulseTimer = setTimeout(() => {
      s.classList.remove("fx-active", cls);
    }, this.visualDuration(1450));
    this.timers.push(this.pulseTimer);
  },

  // ダメージ数字を浮かせる。カード内に絶対配置するので座標計測は不要。
  float(u, text, cls) {
    const n = document.createElement("span");
    n.className = "fnum " + (cls || "");
    n.textContent = text;
    const life = this.visualDuration(900);
    n.style.animationDuration = `${life}ms`;
    u.pop.appendChild(n);
    this.timers.push(setTimeout(() => n.remove(), life));
  },

  shake() {
    const s = document.getElementById("scene");
    if (!s) return;
    s.classList.remove("shake");
    void s.offsetWidth;
    s.classList.add("shake");
  },

  // 戦意メーター。戦闘のあいだ常に出ていて、上がるたびに叩かれる。
  // 「いま何倍で殴っているか」が常に読めないと、強くなった実感が出ない。
  setMorale(mult, gain) {
    const box = document.getElementById("morale");
    if (!box) return;
    const value = Math.max(1, Number(mult) || 1);
    document.getElementById("morale-mult").textContent = `×${value.toFixed(2)}`;
    const fill = document.getElementById("morale-fill");
    if (fill) fill.style.transform = `scaleX(${Math.min(1, (value - 1) / 1.2)})`;
    box.classList.remove("m1", "m2", "m3");
    this.moraleTier = value >= 1.6 ? 3 : value >= 1.25 ? 2 : value > 1 ? 1 : 0;
    box.classList.add(value >= 1.6 ? "m3" : value >= 1.25 ? "m2" : "m1");
    box.classList.toggle("lit", value > 1);
    if (gain) {
      const g = document.getElementById("morale-gain");
      g.textContent = `+${gain}%`;
      g.classList.remove("show");
      void g.offsetWidth;
      g.style.animationDuration = `${this.visualDuration(900)}ms`;
      g.classList.add("show");
      this.timers.push(setTimeout(() => g.classList.remove("show"), this.visualDuration(900)));
    }
    box.classList.remove("bump");
    void box.offsetWidth;
    box.style.setProperty("--morale-bump", `${this.visualDuration(420)}ms`);
    box.classList.add("bump");
  },

  // 一瞬の白飛び。次に来るものを「構えさせる」ための予備動作。
  flash(strength) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const f = document.getElementById("screen-flash");
    if (!f) return;
    f.className = "screen-flash";
    void f.offsetWidth;
    f.style.animationDuration = `${this.visualDuration(strength >= 2 ? 420 : 260)}ms`;
    f.classList.add("show", strength >= 2 ? "hard" : "soft");
    this.timers.push(setTimeout(() => { f.className = "screen-flash"; },
      this.visualDuration(strength >= 2 ? 420 : 260)));
  },

  // 見せ場だけに使う全画面演出。集中線・光輪・巨大な文字。
  // 通常のシナジーは cutin の帯で流し、これは《魔王軍完成》と深い連鎖にだけ出す。
  // 設計憲法 第3節「尺は事件の大きさに比例する」に従い、段数ぶん尺も伸ばす。
  burst(opts) {
    const b = document.getElementById("burst");
    if (!b) return 0;
    const stacks = Math.max(1, opts.stacks || 1);
    const life = this.visualDuration(900 + Math.min(3, stacks) * 220);
    this.flash(2);
    document.getElementById("burst-kicker").textContent = opts.kicker || "";
    document.getElementById("burst-name").textContent = opts.name || "";
    document.getElementById("burst-desc").textContent = opts.desc || "";
    const stack = document.getElementById("burst-stack");
    stack.innerHTML = "";
    // 積み上げた札を1枚ずつ立てる。何で到達したかが読めると「自分の手柄」になる。
    (opts.parts || []).forEach((part, i) => {
      const chip = document.createElement("span");
      chip.textContent = part;
      chip.style.animationDelay = `${this.visualDuration(90 + i * 110)}ms`;
      chip.style.animationDuration = `${this.visualDuration(420)}ms`;
      stack.appendChild(chip);
    });
    b.className = `burst ${opts.tone || "fx-incident"} s${Math.min(4, stacks)}`;
    void b.offsetWidth;
    b.style.setProperty("--burst-life", `${life}ms`);
    b.classList.add("show");
    // 戦場ごとわずかに寄る。画面が近づくと圧が出る。
    const scene = document.getElementById("scene");
    if (scene && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scene.style.setProperty("--burst-life", `${life}ms`);
      scene.classList.remove("zoomed");
      void scene.offsetWidth;
      scene.classList.add("zoomed");
      this.timers.push(setTimeout(() => scene.classList.remove("zoomed"), life));
    }
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) this.shake();
    this.timers.push(setTimeout(() => b.classList.remove("show"), life));
    return life;
  },

  cutin(name, desc, synergyId, stackIndex) {
    const c = document.getElementById("cutin");
    if (!c) return;
    const portrait = document.getElementById("cutin-portrait");
    const hasPortrait = synergyId === "king_slime";
    portrait.src = hasPortrait ? UI.PORTRAIT_DIR + "king_slime.png" : "";
    portrait.alt = hasPortrait ? "キングスライム" : "";
    c.classList.toggle("has-portrait", hasPortrait);
    c.style.animationDuration = `${this.visualDuration(1300)}ms`;
    for (const cls of this.EFFECT_CLASSES) c.classList.remove(cls);
    c.classList.remove("stack-2", "stack-3");
    const tone = this.EFFECT_CLASSES.find(cls => cls === `fx-${synergyId}`) || "fx-incident";
    c.classList.add(tone);
    // 2枚目・3枚目は帯を高く・文字を大きく。重なっていることを帯そのもので見せる。
    if (stackIndex >= 3) c.classList.add("stack-3");
    else if (stackIndex === 2) c.classList.add("stack-2");
    document.getElementById("cutin-name").textContent = name;
    document.getElementById("cutin-desc").textContent = desc;
    c.classList.remove("show");
    void c.offsetWidth;
    c.classList.add("show");
    this.timers.push(setTimeout(() => c.classList.remove("show"), (1300 * this.eventScale) / this.speed));
  },

  resolveBattle(ev) {
    this.stop();
    this.resultPending = ev;
    this.paused = false;
    const pause = document.getElementById("pause-btn");
    if (pause) pause.disabled = true;
    if (typeof Music !== "undefined") Music.suspend();
    if (typeof Sound !== "undefined") Sound.stopAll();
    const announce = () => {
      this.banner(ev.victory);
      if (typeof Sound !== "undefined") Sound.cue(ev.victory ? "win" : "lose", { speed: 1 });
    };
    const silence = ev.victory ? this.VICTORY_PAUSE_MS : 500;
    this.timers.push(setTimeout(announce, silence));
    this.timers.push(setTimeout(() => this.finish(), silence + (ev.victory ? this.VICTORY_HOLD_MS : 1800)));
  },

  banner(victory) {
    const s = document.getElementById("scene");
    if (!s) return;
    if (s.querySelector(".scene-result")) return;
    // 決着表示は画面中央に出るため、同じ位置にある「VS」帯を隠す。
    // 隠さないと「勝 VS 利」のように文字が重なって読めなくなる。
    s.classList.add("decided");
    const b = document.createElement("div");
    b.className = "scene-result " + (victory ? "win" : "lose") + (this.isFinalBattle ? " final" : "");
    b.innerHTML = `${victory ? '<span class="victory-kicker">魔王軍、凱旋</span>' : ''}<b>${victory ? "勝　利" : "敗　北"}</b>${
      this.isFinalBattle && victory ? "<small>王国最終防衛線 突破</small>" : victory ? '<small>よく戦った。戦果を確かめよう。</small>' : ""}`;
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
    if (this.finished) return;
    const announced = !!document.querySelector("#scene .scene-result");
    this.stop();
    if (typeof Music !== "undefined") Music.suspend();
    if (typeof KPI !== "undefined") KPI.logSkipped();
    if (typeof Sound !== "undefined") {
      Sound.stopAll();
      Sound.cue("skip");
    }
    while (this.index < this.timeline.length) {
      const ev = this.timeline[this.index++];
      if (ev.text) this.appendLog(ev.text, ev.cls);
      if (ev.type === "summon") this.addSummon(ev.unit);
      const u = this.units[ev.toId] || this.units[ev.unitId];
      if (u && (ev.hp !== undefined)) this.setHp(u, ev.hp, ev.maxHp);
      if (ev.type === "death" && u) this.setLife(u, true, !!ev.permanent);
      if (ev.type === "revive" && u) this.setLife(u, false);
      if (ev.type === "momentum") this.setMorale(ev.mult, 0);
      this.tellChain(ev, false);
    }
    const result = this.timeline.find(e => e.type === "result");
    if (result) {
      this.banner(result.victory);
      if (!announced && typeof Sound !== "undefined") Sound.cue(result.victory ? "win" : "lose", { speed: 1 });
    }
    this.finish();
  },

  cycleSpeed() {
    if (typeof KPI !== "undefined") KPI.speedChanged();
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
    this.paused = false;
    this.resultPending = null;
    this.stop();
    const pause = document.getElementById("pause-btn");
    if (pause) pause.disabled = true;
    const btn = document.getElementById("next-btn");
    if (btn) btn.style.display = "";
    if (this.onDone) this.onDone();
  }
};
