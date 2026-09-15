// 城下町の札（2026-09-12）。先頭に全体マップ（2026-09-13）、その下に今までどおりの
// 施設一覧・銀行・家計簿。**一覧は消さない**（文字で確かめたい人と、地図を開かない人のため）。
const TownUI = {
  panel() {
    const st = Game.state;
    const t = Town.init(st);
    const sum = Town.summary(st);
    const cardOf = f => {
      const lv = Town.lv(st, f.id);
      const cost = Town.buildCost(Game, f.id);
      const can = Town.canBuild(Game, f.id);
      const next = cost ? `Lv${lv + 1}へ：${cost.gold}G・建材${cost.materials}${cost.discount ? "（職業一致で2割引）" : ""}` : "最大";
      return `<div class="town-card${lv ? " built" : ""}">
        <div class="town-head"><span class="town-icon">${f.icon}</span>
          <button type="button" class="town-name" data-action="towndetail" data-id="${f.id}">${U.esc(f.name)}</button>
          <span class="town-lv">Lv${lv}</span></div>
        <div class="town-line">${U.esc(f.line)}</div>
        <div class="muted town-effect">${lv ? U.esc(f.effect(lv)) : "まだ空き地"}${f.jobs.length ? `　<small>合う職：${U.esc(f.jobs.join("・"))}</small>` : ""}</div>
        <div class="town-actions"><span class="muted">${U.esc(next)}</span>
          ${cost ? `<button class="small primary" data-action="townbuild" data-id="${f.id}" ${can.ok ? "" : "disabled"} title="${U.esc(can.why || "")}">${lv ? "増築" : "建てる"}</button>` : ""}
          ${!can.ok && cost ? `<small class="muted">${U.esc(can.why)}</small>` : ""}</div>
      </div>`;
    };
    // 8施設を2つの見出しに分ける（2026-09-13）。「町」は城下町の経済、「軍」は戦場で効く2つ。
    const section = (group, title, note) => {
      const list = Town.facilitiesOf(group);
      if (!list.length) return "";
      return `<h3 class="town-group">${U.esc(title)}（${list.length}）<small class="muted">${U.esc(note)}</small></h3>
        <div class="town-grid">${list.map(cardOf).join("")}</div>`;
    };
    const facilities = section("town", "町", "税と暮らしに効く")
      + section("army", "軍", "戦場で効く。建て方は町と同じ");
    const exLeft = Town.exchangeLeft(st), backLeft = Town.exchangeLeft(st, "toMaterials");
    const factory = Town.lv(st, "factory") ? `<div class="town-row"><span>工場の両替（あと${exLeft}回）</span>
      <button class="small" data-action="townexchange" ${Town.canExchange(st) ? "" : "disabled"}>建材2 → 金3</button>
      <button class="small" data-action="townexchangeback" ${Town.canExchangeBack(st) ? "" : "disabled"}>金4 → 建材2</button></div>`
      : `<div class="town-row"><span>行商から建材を買う（決着ごと1回。工場を建てると回数が増え、建材→金もできる）</span>
      <button class="small" data-action="townexchangeback" ${Town.canExchangeBack(st) ? "" : "disabled"}>金4 → 建材2${backLeft ? "" : "（今回は済み）"}</button></div>`;
    // 地図の金庫からここへ飛ぶ（新しい action を足さずに済ませる）
    const bank = `<section class="town-bank" id="town-bank"><h3>🏦 魔界銀行</h3>
      <div class="muted">借金 <b>${t.debt}G</b>${t.debt ? `（利子 ${sum.interest}G／決着）` : ""}　上限 ${Town.rules().bank.cap}G。利子は決着ごとに残高の1割。払えないと施設が1段落ちる。</div>
      <div class="town-row">${Town.rules().bank.choices.map(a => `<button class="small" data-action="townborrow" data-amount="${a}" ${Town.canBorrow(st, a) ? "" : "disabled"}>${a}G 借りる</button>`).join("")}
        ${t.debt ? `<button class="small" data-action="townrepay" data-amount="${Math.ceil(t.debt / 2)}" ${st.gold > 0 ? "" : "disabled"}>半分返す（${Math.min(st.gold, Math.ceil(t.debt / 2))}G）</button>
        <button class="small" data-action="townrepay" data-amount="${t.debt}" ${st.gold >= t.debt ? "" : "disabled"}>全部返す（${t.debt}G）</button>` : ""}</div>
    </section>`;
    const rows = t.ledger.slice().reverse().map(r => `<tr><td>作戦${r.turn}</td><td>+${r.tax}${r.ransacked ? "（荒らされた）" : ""}</td><td>${r.exchange ? `+${r.exchange}` : "-"}</td><td>${r.build ? `-${r.build}` : "-"}</td><td>${r.interest ? `-${r.interest}` : "-"}${r.seized ? "　差し押さえ" : ""}</td></tr>`).join("");
    const ledger = `<section class="town-ledger"><h3>📒 家計簿（決着ごと）</h3>
      ${rows ? `<div class="table-wrap"><table class="town-table"><thead><tr><th></th><th>税</th><th>両替</th><th>建設</th><th>利子</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="muted">まだ決着が無い。</div>`}
      <div class="muted">給与と食料は結果画面の報告に。ここは城下町の分だけ。</div></section>`;
    // 地図を先頭に。地図が無くても（データやCSSが欠けても）札はそのまま読める。
    const map = typeof MapUI !== "undefined" ? MapUI.render(st) : "";
    return `<section class="town-panel">
      ${map}
      ${typeof UI !== "undefined" && UI.incidentCards ? `<aside class="town-notices"><h3>張り紙</h3>${UI.incidentCards("A")}${UI.incidentScenes()}</aside>` : ""}
      <div class="town-summary">領地 <b>${sum.territories}</b> × <b>${sum.perTerritory}G</b> ＝ 税収 <b>${sum.tax}G</b>／決着　　所持金 <b>${st.gold}G</b>　建材 <b>${st.materials}</b></div>
      <div class="muted">領地は本戦で取った段階。施設は金と建材で建てる（1決着に1件）。足りなければ銀行へ。</div>
      ${facilities}
      ${factory}${bank}${ledger}
    </section>`;

  },

  // ── 施設の詳細（docs/SPEC_FACILITY_DETAIL_2026-09-13.md §1〜§5・§7）──
  // 地図の区画と一覧の施設名から開く。建てる・増築はこの中だけ。
  // 「育っている」を見せる画面なので、出すのは 絵・いまの効果・次のLv・生んだもの・モルモの一言 だけ。
  // 比較もグラフも作らない（§6）。
  STAT_LABEL: {
    market: { label: "税収の上乗せ", unit: "G" },
    tavern: { label: "回復した忠誠", unit: "" },
    smithy: { label: "備えた決着", unit: "回" },
    lab: { label: "早く覚えた技", unit: "本" },
    hostel: { label: "早く治した人数", unit: "人" },
    factory: { label: "両替した回数", unit: "回" },
    grand_kitchen: { label: "強めた食事", unit: "回" },
    graveyard: { label: "呼び戻した骸骨", unit: "体" }
  },

  detailArt(f, lv) {
    const art = (typeof MAP_FACILITY_ART !== "undefined" && MAP_FACILITY_ART) || [];
    const dir = typeof MapUI !== "undefined" ? MapUI.DIR : "assets/map/";
    const src = lv <= 0 || !art.includes(f.id)
      ? `${dir}facility/lot-0.webp`
      : `${dir}facility/${f.id}-${Math.min(3, lv)}.webp`;
    return `<img class="fd-art" src="${src}" alt="" data-lv="${lv}">`;
  },

  detail(id) {
    const st = Game.state;
    const f = Town.facility(id);
    if (!f) return UI.castle("town");
    Town.init(st);
    const lv = Town.lv(st, id);
    const cost = Town.buildCost(Game, id);
    const can = Town.canBuild(Game, id);
    const row = Town.statOf(st, id);
    const dir = typeof MapUI !== "undefined" ? MapUI.DIR : "assets/map/";
    // 背景は施設ごとに1枚。無い間は既存の紙のまま（読み込めなければ CSS の地が出る）。
    const bg = `style="background-image:url('${dir}facility/bg-${f.id}.webp')"`;
    const dots = [0, 1, 2].map(i => `<i class="fd-dot${i < lv ? " on" : ""}"></i>`).join("");
    const next = cost
      ? `${U.esc(f.effect(lv + 1))}<small class="muted">　${cost.gold}G・建材${cost.materials}${cost.discount ? "（合う職で2割引）" : ""}</small>`
      : "最大まで育った";
    const stat = this.STAT_LABEL[id] || { label: "生んだもの", unit: "" };
    const born = row.value > 0 || row.built
      ? `<dl class="fd-born">
          <div><dt>${U.esc(stat.label)}</dt><dd>${row.value}${U.esc(stat.unit)}</dd></div>
          ${row.built ? `<div><dt>建てた日</dt><dd>第${row.built}決着</dd></div>` : ""}
          ${row.upgraded.length ? `<div><dt>増築</dt><dd>${row.upgraded.map((t, i) => `第${t}決着（Lv${i + 2}）`).join("　")}</dd></div>` : ""}
        </dl>`
      : `<div class="muted fd-empty">まだ記録なし。建てたところから数え始める。</div>`;
    const lines = typeof MORMO_FACILITY !== "undefined" ? (MORMO_FACILITY[id] || []) : [];
    const mormo = lines[Math.min(lv, lines.length - 1)] || "";
    return `${UI.hud()}<div class="castle-screen facility-detail">
      <header class="castle-header fd-header">
        <button class="small ghost castle-home" data-action="home">⌂ メインへ</button>
        <button class="small ghost" data-action="castletab" data-tab="town">← 城下町に戻る</button>
      </header>
      <main class="castle-content fd-body" ${bg}>
        <div class="fd-stage">${this.detailArt(f, lv)}</div>
        <h1 class="fd-title"><span class="fd-icon">${f.icon}</span>${U.esc(f.name)}
          <span class="fd-lv">Lv${lv}</span><span class="fd-dots">${dots}</span></h1>
        <div class="fd-line">${U.esc(f.line)}</div>
        <dl class="fd-effects">
          <div><dt>いまの効果</dt><dd>${lv ? U.esc(f.effect(lv)) : "まだ空き地"}</dd></div>
          <div><dt>次の Lv</dt><dd>${next}</dd></div>
          ${f.jobs.length ? `<div><dt>合う職</dt><dd>${U.esc(f.jobs.join("・"))}<small class="muted">（2割引）</small></dd></div>` : ""}
        </dl>
        <div class="fd-build">
          ${cost ? `<button class="primary wide" data-action="townbuild" data-id="${f.id}" data-from="detail" ${can.ok ? "" : "disabled"}>${lv ? "増築する" : "建てる"}</button>` : ""}
          ${!can.ok && cost ? `<small class="muted fd-why">${U.esc(can.why)}</small>` : ""}
        </div>
        <section class="fd-history"><h2>この${U.esc(f.name)}が生んだもの</h2>${born}</section>
        ${mormo ? `<div class="fd-mormo">🐭 モルモ「${U.esc(mormo)}」</div>` : ""}
      </main>
    </div>`;
  }
};
