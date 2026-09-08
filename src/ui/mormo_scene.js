// 画面遷移の節目を、宰相モルモが直接報告する短い全画面シーンにする。
// ゲーム状態や遷移先は持たず、表示・タイプ音・スキップだけを担当する。
const MormoScene = {
  EXPRESSIONS: ["panic", "worried", "welcome", "report", "angry", "joy"],
  active: false,
  typing: false,
  timer: null,
  text: "",
  index: 0,
  keyHandler: null,

  show(options = {}) {
    this.close();
    if (typeof document === "undefined" || !document.body) return;
    const expression = this.EXPRESSIONS.includes(options.expression) ? options.expression : "report";
    this.text = String(options.text || "ご報告デス、魔王様。");
    this.index = 0;
    this.active = true;
    this.typing = true;

    const scene = document.createElement("section");
    scene.id = "mormo-scene";
    scene.className = `mormo-scene mormo-scene-${expression}`;
    scene.setAttribute("role", "dialog");
    scene.setAttribute("aria-modal", "true");
    scene.setAttribute("aria-label", options.title || "宰相モルモの報告");
    scene.innerHTML = `<div class="mormo-scene-backdrop"></div>
      <div class="mormo-scene-inner">
        <div class="mormo-scene-portrait-wrap">
          <div class="mormo-scene-aura"></div>
          <img class="mormo-scene-portrait" src="assets/mormo/${expression}.webp" alt="宰相モルモ">
        </div>
        <div class="mormo-scene-dialogue">
          <div class="mormo-scene-kicker">${U.esc(options.kicker || "魔王軍・臨時報告")}</div>
          <div class="mormo-scene-name">${U.esc(options.title || "宰相モルモ")}</div>
          <div class="mormo-scene-text" aria-live="polite"></div>
          <button type="button" class="mormo-scene-next" data-action="mormocontinue">全文表示</button>
        </div>
      </div>`;
    document.body.appendChild(scene);
    document.body.classList.add("mormo-speaking");
    const continueButton = scene.querySelector(".mormo-scene-next");
    if (continueButton) continueButton.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof Sound !== "undefined") {
        Sound.unlock();
        Sound.cue("click");
      }
      this.advance();
    });

    this.keyHandler = ev => {
      if (!this.active || !["Enter", " ", "Escape"].includes(ev.key)) return;
      ev.preventDefault();
      this.advance();
    };
    document.addEventListener("keydown", this.keyHandler);

    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) this.reveal();
    else this.typeNext();
  },

  typeNext() {
    if (!this.active || !this.typing) return;
    const output = document.querySelector("#mormo-scene .mormo-scene-text");
    if (!output) return this.close();
    this.index += 1;
    output.textContent = this.text.slice(0, this.index);
    const ch = this.text[this.index - 1] || "";
    if (this.index % 2 === 0 && !/[\s、。！？…・]/.test(ch)
      && typeof Sound !== "undefined") Sound.cue("mormo", { index: this.index });
    if (this.index >= this.text.length) return this.completeTyping();
    const pause = /[。！？\n]/.test(ch) ? 145 : /[、…]/.test(ch) ? 75 : 27;
    this.timer = setTimeout(() => this.typeNext(), pause);
  },

  completeTyping() {
    this.typing = false;
    const button = document.querySelector("#mormo-scene .mormo-scene-next");
    if (button) {
      button.textContent = "次へ  ▼";
      button.classList.add("ready");
      button.focus({ preventScroll: true });
    }
  },

  reveal() {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    const output = document.querySelector("#mormo-scene .mormo-scene-text");
    if (output) output.textContent = this.text;
    this.index = this.text.length;
    this.completeTyping();
  },

  advance() {
    if (!this.active) return;
    if (this.typing) {
      // 全文が出る前に送った＝報告を読み切らなかった（第14節の「報告スキップ」）
      if (typeof KPI !== "undefined") KPI.reportSkipped();
      this.reveal();
    } else this.close();
  },

  // 戦闘を止めない「野次」。全画面の show() と違い、操作を奪わず自動で消える。
  // 戦闘中に全画面報告を挟むと、せっかく読ませている連鎖の流れが切れる。
  // 呼び出し側（BattleScene）が1戦闘1回に制限する責任を持つ。
  // spotlight の事実を、モルモの声にする（D1）。
  //
  // 戦果の1文（UI.spotlightSentence）とは**別の声**であって、同じ文の焼き直しではない。
  // 戦果は記録として事実を書き、モルモは現場から野次を飛ばす。ただし
  // **どちらも同じ spotlight の事実からしか作らない**ので、片方だけ嘘になることはない。
  // 差し込む語彙は MORMO_SPOTLIGHT_LINES（data）が持ち、埋めるのはここ1か所。
  spotlightLine(spotlight, avoid) {
    if (!spotlight || !spotlight.origin || !spotlight.actor) return null;
    if (typeof MORMO_SPOTLIGHT_LINES === "undefined") return null;
    // 同じ人が起点と反応を兼ねている回は「AがBを動かした」と言えない。
    // 名前を2つ並べると嘘になるので、この声は出さない（戦果の1文は別の言い方で出る）。
    if (spotlight.sameActor) return null;
    const set = MORMO_SPOTLIGHT_LINES[spotlight.kind] || MORMO_SPOTLIGHT_LINES.fallback;
    if (!set || !set.lines.length) return null;
    const pool = set.lines.filter(line => line !== avoid);
    const template = (pool.length ? pool : set.lines)[Math.floor(Math.random() * (pool.length || set.lines.length))];
    const text = template
      .replace(/\{origin\}/g, spotlight.origin.name || "どなたか")
      .replace(/\{actor\}/g, spotlight.actor.name || "どなたか")
      .replace(/\{target\}/g, (spotlight.target && spotlight.target.name) || "相手");
    return { expression: set.expression, text, template };
  },

  aside(options = {}) {
    if (typeof document === "undefined") return null;
    const host = options.host || document.getElementById("scene");
    if (!host) return null;
    this.clearAside(host);
    const expression = this.EXPRESSIONS.includes(options.expression) ? options.expression : "report";
    const box = document.createElement("div");
    box.className = `mormo-aside mormo-aside-${expression}`;
    box.innerHTML = `<img class="mormo-aside-portrait" src="assets/mormo/${expression}.webp" alt="宰相モルモ">
      <p class="mormo-aside-bubble"><b>モルモ</b>${U.esc(String(options.text || ""))}</p>`;
    const portrait = box.querySelector(".mormo-aside-portrait");
    if (portrait) portrait.onerror = () => portrait.remove();
    host.appendChild(box);
    void box.offsetWidth;
    box.classList.add("show");
    return box;
  },

  clearAside(host) {
    const scope = host || (typeof document !== "undefined" && document);
    if (!scope) return;
    scope.querySelectorAll(".mormo-aside").forEach(el => el.remove());
  },

  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const scene = typeof document !== "undefined" && document.getElementById("mormo-scene");
    if (scene) scene.remove();
    if (typeof document !== "undefined") {
      document.body && document.body.classList.remove("mormo-speaking");
      if (this.keyHandler) document.removeEventListener("keydown", this.keyHandler);
    }
    this.keyHandler = null;
    this.active = false;
    this.typing = false;
  }
};
