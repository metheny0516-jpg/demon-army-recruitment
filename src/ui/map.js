// 全体マップ（docs/WORLD_MAP_DESIGN_2026-09-13.md 2・3・4・7節）。
//
// 金庫だけは data-action を持たない：魔界銀行は同じ札の下にある節なので、
// **新しい action を足さずに**その節（#town-bank）へ飛ばすだけにしてある（main.js を触らない）。
//
// **状態は読むだけ。書き込みは一切しない。** タップは既存の data-action を発火するだけで、
// 進行の規則（どこへ行けるか・何を建てられるか）は run.js と town.js が持ったまま。
// 座標は src/data/map.js（背景 390×2200 の原寸）。ここでは % に直して背景へ重ねるので、
// 画面幅が変わっても印は同じ場所に乗る。横スクロールは作らない（CSS の .world-map）。
const MapUI = {
  DIR: "assets/map/",

  size() { return (typeof MAP_SIZE !== "undefined" && MAP_SIZE) || { w: 390, h: 2200 }; },
  points() { return (typeof MAP_POINTS !== "undefined" && MAP_POINTS) || []; },
  lots() { return (typeof MAP_LOTS !== "undefined" && MAP_LOTS) || []; },
  landmarks() { return (typeof MAP_LANDMARKS !== "undefined" && MAP_LANDMARKS) || {}; },

  // 原寸の座標 → 背景に対する %。背景の縦横比が変わらない限りどの幅でも合う。
  pct(x, y) {
    const s = this.size();
    return `left:${(x / s.w * 100).toFixed(3)}%;top:${(y / s.h * 100).toFixed(3)}%`;
  },

  // その地点がいまどういう状態か（設計3節の5つ）。**判定はここだけ**。
  //   owned    ：本戦で取った段階（conquest より下）
  //   outpost  ：次の地点で、前哨戦を制している
  //   next     ：次に戦う地点
  //   far      ：まだ遠い（押せない）
  //   fogged   ：第二幕以降で、まだその幕に入っていない（霧）
  stateOf(st, point) {
    const conquest = Number(st.conquest) || 0;
    const act = Number(st.act) || 1;
    if (point.act > act) return "fogged";
    if (point.stage <= conquest) return "owned";
    if (point.stage === conquest + 1) {
      const o = st.outpost;
      return (o && o.cleared && o.stage === conquest) ? "outpost" : "next";
    }
    return "far";
  },

  // 地点1つ。次の地点だけが押せる（押すと既存の作戦会議へ）。
  pointHtml(st, point, tax) {
    const state = this.stateOf(st, point);
    const pin = state === "owned" ? "pin-owned" : state === "outpost" ? "pin-outpost" : "pin-gray";
    const clickable = state === "next" || state === "outpost";
    const ransacked = state === "owned" && st.lastRansacked && point.stage === (Number(st.conquest) || 0);
    const label = state === "fogged" ? "？？？" : point.name;
    const note = state === "owned" ? `<i class="mp-tax">税 ${tax}G</i>`
      : state === "outpost" ? `<i class="mp-flag">前哨済</i>`
      : state === "next" ? `<i class="mp-next">次の戦い</i>` : "";
    return `<button type="button" class="map-point mp-${state}" style="${this.pct(point.x, point.y)}"
      data-point="${U.esc(point.id)}" data-stage="${point.stage}"
      ${clickable ? `data-action="mission"` : "disabled"}
      aria-label="${U.esc(label)}">
      <img class="mp-pin" src="${this.DIR}${pin}.webp" alt="">
      ${ransacked ? `<i class="mp-smoke" aria-hidden="true">💨</i>` : ""}
      <span class="mp-name">${U.esc(label)}${note}</span>
    </button>`;
  },

  // 城下町の区画。施設が建っていればレベル、まだなら空き地。
  // 絵はまだ無いので、いまは枠と文字だけ（背景の空き地がそのまま見える）。
  lotHtml(st, lot) {
    const slots = (typeof MAP_FACILITY_SLOTS !== "undefined" && MAP_FACILITY_SLOTS) || {};
    const id = Object.keys(slots).find(key => slots[key] === lot.slot);
    const facility = id && typeof Town !== "undefined" ? Town.facility(id) : null;
    if (!facility) {
      return `<span class="map-lot mp-empty" style="${this.pct(lot.x, lot.y)}" aria-hidden="true"></span>`;
    }
    const lv = Town.lv(st, id);
    return `<button type="button" class="map-lot${lv ? " built" : ""} lot-lv${lv}" style="${this.pct(lot.x, lot.y)}"
      data-action="townbuild" data-id="${U.esc(id)}" data-lot="${lot.slot}"
      aria-label="${U.esc(facility.name)} Lv${lv}">
      <i class="lot-icon">${facility.icon}</i>
      <span class="lot-name">${U.esc(facility.name)}<i class="lot-lv">Lv${lv}</i></span>
    </button>`;
  },

  // 次に戦う地点（開いたときにここが中央へ来る）。
  focusPoint(st) {
    const list = this.points();
    return list.find(p => this.stateOf(st, p) === "next" || this.stateOf(st, p) === "outpost")
      || list.find(p => this.stateOf(st, p) === "owned")
      || list[0] || null;
  },

  render(st) {
    if (!st) return "";
    const s = this.size();
    const sum = typeof Town !== "undefined" ? Town.summary(st) : { tax: 0, debt: 0, perTerritory: 0, territories: 0 };
    const lm = this.landmarks();
    const focus = this.focusPoint(st);
    // 防衛戦が出ている間だけ、王国側から城への道に点線（設計3節）。
    const defending = (st.missionOffers || []).some(m => m.missionKind === "defend");
    return `<div class="world-map" data-focus="${focus ? focus.id : ""}" data-focus-y="${focus ? focus.y : 0}">
      <div class="map-strip">
        <span>領地 <b>${sum.territories}</b>　税 <b>${sum.tax}G</b>／決着</span>
        <span>借金 <b>${sum.debt}G</b>${sum.debt ? `（利子 ${sum.interest}G）` : ""}</span>
      </div>
      <div class="map-stage" style="aspect-ratio:${s.w} / ${s.h}">
        <img class="map-bg" src="${this.DIR}bg.webp"
          srcset="${this.DIR}bg.webp ${s.w}w, ${this.DIR}bg@2x.webp ${s.w * 2}w"
          sizes="100vw" alt="王国の地図">
        ${defending ? `<span class="map-defend-road" aria-hidden="true"></span>` : ""}
        ${this.points().map(p => this.pointHtml(st, p, sum.perTerritory)).join("")}
        ${this.lots().map(l => this.lotHtml(st, l)).join("")}
        ${lm.bank ? `<a class="map-bank" style="${this.pct(lm.bank.x, lm.bank.y)}" href="#town-bank"
          aria-label="魔界銀行へ">🏦<span class="lot-name">魔界銀行</span></a>` : ""}
        ${lm.castle ? `<span class="map-castle" style="${this.pct(lm.castle.x, lm.castle.y)}" aria-hidden="true">🏰</span>` : ""}
      </div>
    </div>`;
  },

  // 描いたあとに一度だけ呼ぶ。次に戦う地点を画面の中央へ。
  // **スクロール位置を変えるだけ**で、状態には触らない。
  focus(root) {
    const map = (root || document).querySelector(".world-map");
    if (!map) return;
    const stage = map.querySelector(".map-stage");
    const target = map.querySelector(".map-point.mp-next, .map-point.mp-outpost");
    if (!stage || !target) return;
    const box = target.getBoundingClientRect(), frame = map.getBoundingClientRect();
    map.scrollTop += (box.top + box.height / 2) - (frame.top + frame.height / 2);
  }
};
