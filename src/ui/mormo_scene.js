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
