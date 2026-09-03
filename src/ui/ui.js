// 画面描画。状態は Game.state を読むだけで、UIは状態を持たない（描画関数は毎回作り直す）。
const UI = {
  root: null,

  RACE_ICON: {
    "ゴブリン": "👺", "オーク": "🐗", "スライム": "🟢", "コボルト": "🐕",
    "骸骨兵": "💀", "ゾンビ": "🧟", "魔法使い": "🔥", "死霊術師": "🪄",
    "インプ": "😈", "オーガ": "👹", "キングスライム": "👑"
  },
  icon(race) { return this.RACE_ICON[race] || "❓"; },

  // ── 立ち絵 ────────────────────────────
  // portraits.js の一覧に載っている種族は assets/monsters/{tplId}.png を、
  // それ以外は絵文字を使う。一覧方式にしているのは、未収録の種族に対して
  // 毎回404リクエストが飛ぶのを避けるため。
  PORTRAIT_DIR: "assets/monsters/",
  missingPortraits: new Set(),

  // 一覧に載っていて、かつ読み込みに失敗していない種族だけ画像を使う
  hasPortrait(id) {
    return !!id
      && typeof PORTRAITS !== "undefined" && PORTRAITS.indexOf(id) !== -1
      && !this.missingPortraits.has(id);
  },

  // 一覧に載っていてもファイルが無い場合の保険。以後その種族は絵文字にする。
  portraitFailed(id, img) {
    this.missingPortraits.add(id);
    const holder = img.parentNode;
    img.remove();
    if (holder) holder.classList.add("noimg");
  },

  // shape: "photo" = 履歴書の証明写真風(3:4) / それ以外 = 丸アイコン
  avatarHtml(m, shape) {
    const cls = "avatar" + (shape === "photo" ? " photo" : "");
    const emoji = this.icon(m.race);
    const id = m.tplId;
    if (!this.hasPortrait(id)) {
      return `<span class="${cls} noimg" data-fallback="${emoji}"></span>`;
    }
    return `<span class="${cls}" data-fallback="${emoji}"><img src="${this.PORTRAIT_DIR}${id}.png" alt=""
      onerror="UI.portraitFailed('${id}', this)"></span>`;
  },

  init(root) { this.root = root; },

  set(html) {
    if (typeof BattleScene !== "undefined") BattleScene.stop();
    this.root.innerHTML = html;
    window.scrollTo(0, 0);
  },

  // クリックハンドラを data-action で一元処理する
  bind(handler) {
    this.root.addEventListener("click", ev => {
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      if (typeof Sound !== "undefined") Sound.unlock();
      handler(el.dataset.action, el.dataset);
    });
  },

  // ── 部品 ────────────────────────────
  hud() {
    const st = Game.state;
    const sd = Game.stageData();
    const salary = Game.salaryTotal();
    const opening = st.openingPrototype;
    return `<div class="hud">
      <span>第 <b>${st.generation}</b> 代魔王軍</span>
      ${opening ? `<span>冒頭日程 <b>${st.day}日目 / 3日</b></span>` : ""}
      <span>作戦 <b>${st.turn}</b></span>
      <span>王国攻略 <b>${st.conquest} / ${Game.MAX_CONQUEST}</b></span>
      <span>警戒度 <b>${st.alert}</b></span>
      <span class="gold">所持金 <b>${st.gold}G</b></span>
      <span class="food">食料 <b>${st.food}</b></span>
      <span class="materials">建材 <b>${st.materials}</b></span>
      <span>施設 <b>Lv.${st.facilityLevel}</b></span>
      <span>給与・手当 <b>${salary}G</b>/${opening ? "3日" : "戦"}</span>
      <span>軍団 <b>${st.roster.length}/${Game.MAX_ARMY}</b></span>
      <span>出撃 <b>${Game.activeRoster().length}/${Game.MAX_DEPLOY}</b></span>
      <span class="muted">${U.esc(sd.region)}</span>
    </div>`;
  },

  traitHtml(ids) {
    return ids.map(id => {
      const t = TRAITS[id];
      if (!t) return "";
      return `<div class="trait"><b>${U.esc(t.name)}</b>：${U.esc(t.desc)}</div>`;
    }).join("");
  },

  // 履歴書欄。採用画面だけで出す（編成画面はスクロールが長くなるため省く）
  resumeHtml(m) {
    const rows = [
      ["前職", m.prevJob],
      ["志望動機", m.motive],
      ["短所", m.flaw]
    ].filter(r => r[1]);
    if (rows.length === 0) return "";
    return `<dl class="resume">${
      rows.map(([k, v]) => `<dt>${k}</dt><dd>${U.esc(v)}</dd>`).join("")
    }</dl>`;
  },

  applicantConnections(m) {
    const rows = Synergy.connections(m, Game.state.roster).slice(0, 3);
    if (!rows.length) return `<div class="applicant-links muted">現在の軍団との直接接続はまだない</div>`;
    return `<div class="applicant-links"><b>🔗 今の軍団との接続</b>${rows.map(row =>
      `<div><span>${U.esc(row.from)}</span><i>→ ${U.esc(row.signal)} →</i><span>${U.esc(row.to)}</span>${
        row.unitName ? `<small>（${U.esc(row.unitName)}）</small>` : ""}</div>`).join("")}</div>`;
  },

  monsterCard(m, opts) {
    opts = opts || {};
    const unpaid = m.unpaid ? `<span class="unpaid">給与未払い</span>` : "";
    const rank = Game.rankOf(m);
    const nextRank = Game.nextRank(m);
    const merit = m.merit || 0;
    const meritText = nextRank ? `戦功 ${merit}/${nextRank.threshold}` : `戦功 ${merit}・最高位`;
    const legacy = m.legacy
      ? `<div class="general-ability">📜 第${m.legacy.generation}代・殿堂入り人材の再応募（戦功と階級は新任扱い）</div>`
      : "";
    return `<div class="card">
      <div class="card-head">
        ${this.avatarHtml(m, opts.resume ? "photo" : "")}
        <div>
          <div class="card-name">${U.esc(m.name)} <span class="rank-badge rank-${U.esc(rank.id)}">${U.esc(rank.name)}</span></div>
          <div class="card-job">${U.esc(m.race)} / ${U.esc(m.job)}</div>
        </div>
        ${opts.badge ? `<span class="pos-badge">${U.esc(opts.badge)}</span>` : ""}
      </div>
      ${legacy}
      ${opts.resume ? this.resumeHtml(m) : ""}
      <div class="stats">
        <div class="stat"><span class="k">HP</span><span class="v">${m.hp}</span></div>
        <div class="stat"><span class="k">攻撃</span><span class="v">${m.atk}</span></div>
        <div class="stat"><span class="k">防御</span><span class="v">${m.def}</span></div>
        <div class="stat"><span class="k">速度</span><span class="v">${m.spd}</span></div>
      </div>
      <div class="meta">
        <span class="salary">希望給与 ${m.salary}G</span>
        <span class="loyal">忠誠 ${m.loyalty}</span>
        <span class="merit">${meritText}</span>
        ${opts.resume ? "" : this.departmentTag(m)}
        ${unpaid}
      </div>
      ${this.aptitudeHtml(m)}
      <div class="traits">${this.traitHtml(m.traits)}</div>
      ${opts.resume ? this.applicantConnections(m) : ""}
      ${rank.id === "general" ? `<div class="general-ability">⚔ 将軍の号令：出撃中、味方全員の与ダメージ+15%</div>` : ""}
      ${m.quote ? `<div class="quote">「${U.esc(m.quote)}」</div>` : ""}
      ${opts.footer || ""}
    </div>`;
  },

  // 戦闘後の「誰がどれだけ働いたか」パネル。棒の長さだけで一発で分かるようにする。
  contributionPanel(contribution) {
    if (!contribution || contribution.length === 0) return "";
    const maxDealt = Math.max(1, ...contribution.map(c => c.dealt));
    // 配列の並び順に依存しないよう、最大値を明示的に求める
    const topDealer = contribution.reduce((b, c) => (c.dealt > 0 && (!b || c.dealt > b.dealt)) ? c : b, null);
    const topTanker = contribution.reduce((b, c) => (c.taken > 0 && (!b || c.taken > b.taken)) ? c : b, null);
    const rows = contribution.map(c => {
      const badges = [];
      if (topDealer && c.id === topDealer.id) badges.push(`<span class="contrib-badge mvp">👑殊勲</span>`);
      if (topTanker && c.id === topTanker.id && (!topDealer || c.id !== topDealer.id)) {
        badges.push(`<span class="contrib-badge tank">🛡盾役</span>`);
      }
      if (c.mercenary) badges.push(`<span class="contrib-badge merc">🗡傭兵</span>`);
      const fell = c.survived === false;
      if (fell) badges.push(`<span class="contrib-badge dead">💀戦死</span>`);
      else if (c.died) badges.push(`<span class="contrib-badge revived">✨生還</span>`);
      if (c.maxOverkill > 0) badges.push(`<span class="contrib-badge mvp">💥${c.maxOverkill}%</span>`);
      // 火力以外の働き。0のものは出さず、多くても3つまで（読ませたいのは棒の長さと事件）
      badges.push(...this.contributionExtras(c).slice(0, 3));
      const ratio = c.dealt / maxDealt;
      return `<div class="contrib-row ${fell ? "died" : ""}">
        <span class="contrib-icon">${this.icon(c.race)}</span>
        <span class="contrib-name">${U.esc(c.name)}</span>
        <div class="contrib-badges">${badges.join("")}</div>
        <div class="contrib-bar"><div class="contrib-fill" style="transform:scaleX(${ratio})"></div></div>
        <span class="contrib-num">${c.dealt}<small>与ダメ</small>${c.kills ? ` / ${c.kills}撃破` : ""}</span>
        ${c.voice ? `<div class="contrib-voice">「${U.esc(c.voice)}」</div>` : ""}
      </div>`;
    }).join("");
    return `<div class="panel"><h3>戦果</h3><div class="contrib-list">${rows}</div></div>`;
  },

  // 与ダメージでは見えない働きのバッジ。優先度は「資源 → 蘇生 → 発火 → 魂 → 回復」。
  contributionExtras(c) {
    const badges = [];
    const resources = c.resources || {};
    const gold = Number(resources.gold) || 0;
    if (gold) badges.push(`<span class="contrib-badge loot">💰${gold > 0 ? "+" : ""}${gold}G</span>`);
    const revives = (c.revivesGiven || 0) + (c.selfRevives || 0);
    if (revives) badges.push(`<span class="contrib-badge revived">✨${revives}蘇生</span>`);
    if (c.traitTriggers) badges.push(`<span class="contrib-badge trait">⚙${c.traitTriggers}発火</span>`);
    const soul = Number(resources.soul) || 0;
    if (soul) badges.push(`<span class="contrib-badge soul">魂${soul > 0 ? "+" : ""}${soul}</span>`);
    if (c.healed) badges.push(`<span class="contrib-badge heal">💚+${c.healed}</span>`);
    return badges;
  },

  // 「誰をどこへ置くか」を判断するには、置く前に適性が見えていないといけない。
  // 応募者カードにも出すので、採用の時点で「こいつは建設要員だ」と考えられる。
  aptitudeHtml(m) {
    const apt = Aptitude.of(m);
    const chips = [];
    if (apt.food > 0) chips.push(`<span class="apt apt-food">🍲 食料+${apt.food}</span>`);
    if (apt.material > 0) chips.push(`<span class="apt apt-material">🔨 施工+${apt.material}</span>`);
    if (apt.wage > 0) chips.push(`<span class="apt apt-wage">💰 給与-${apt.wage}%</span>`);
    if (apt.recruit > 0) chips.push(`<span class="apt apt-recruit">📋 応募+${apt.recruit}</span>`);
    chips.push(apt.appetite > 0
      ? `<span class="apt apt-appetite">🍖 食う量 ${apt.appetite}</span>`
      : `<span class="apt apt-appetite none">🍖 食事不要</span>`);
    const note = apt.labels.length ? `<span class="apt-note">${U.esc(apt.labels.join("・"))}</span>` : "";
    return `<div class="aptitudes">${chips.join("")}${note}</div>`;
  },

  departmentTag(m) {
    const department = Game.departmentOf(m);
    return `<span class="department-tag department-${department.id}">${department.icon} ${U.esc(department.shortName)}</span>`;
  },

  departmentButtons(m, current) {
    return DEPARTMENT_ORDER.filter(id => id !== current).map(id => {
      const department = DEPARTMENTS[id];
      return `<button class="small department-button" data-action="assigndepartment"
        data-uid="${m.uid}" data-department="${id}">${department.icon} ${U.esc(department.shortName)}へ</button>`;
    }).join("");
  },

  departmentSummary() {
    const st = Game.state;
    const combat = Game.departmentRoster("combat").length;
    const builders = Game.departmentRoster("construction").length;
    const life = Game.departmentRoster("life").length;
    const facility = Game.facilityInfo();
    const next = FACILITY_LEVELS[st.facilityLevel + 1];
    const buildText = next
      ? `次の施設まで ${Math.max(0, next.buildThreshold - st.buildProgress)} 建材投入`
      : "施設は最大レベル";
    const output = Game.departmentOutput();
    const foodNeed = Game.foodNeed();
    const balance = output.food - foodNeed;
    return `<div class="department-overview">
      <div><b>⚔ ${combat}</b><span>戦闘所属</span></div>
      <div><b>🔨 ${builders}</b><span>建設所属</span></div>
      <div><b>🍲 ${life}</b><span>生活所属</span></div>
      <div><b>${U.esc(facility.name)}</b><span>HP+${Math.round((facility.hpMult - 1) * 100)}% / 防御+${facility.defBonus}</span></div>
      <div class="${balance < 0 ? "warn" : ""}"><b>食料 ${output.food} / 消費 ${foodNeed}</b><span>${balance < 0 ? `不足 ${-balance}！` : `余剰 ${balance}`}</span></div>
      <div><b>${U.esc(buildText)}</b><span>施工能力 ${output.material} / 回</span></div>
      ${output.wage > 0 ? `<div><b>給与 -${output.wage}%</b><span>経理部の圧縮</span></div>` : ""}
      ${output.recruit > 0 ? `<div><b>応募 +${output.recruit}名</b><span>人事部の集客</span></div>` : ""}
    </div>`;
  },

  // 魔界史の主要記録は最大CHAINと最大OVERKILLの2つだけ（設計憲法 第11節）。
  // 勝敗・到達点の隣に置き、総余剰・獲得G・召喚数などは主要記録へ増やさない。
  // フィールドの無い旧レコードは0として表示する。
  recordHighlights(record) {
    const chain = Math.max(0, Number(record && record.maxChain) || 0);
    const overkill = Math.max(0, Number(record && record.maxOverkill) || 0);
    return `<div class="record-highlights">
      <div><b>⛓ ${chain}</b><span>最大CHAIN</span></div>
      <div><b>💥 ${overkill}%</b><span>最大OVERKILL</span></div>
    </div>`;
  },

  // 「今回どれだけ壊れたか」を一目で見せるパネル。勝利・敗北・ゲームオーバーで同じものを使う。
  // 主要記録は**最大CHAINと最大OVERKILLの2つだけ**。召喚・資源・蘇生は横並びに増やさず、
  // 下の詳細1行か個人貢献のバッジへ回す（記録が増えるほど、どれも読まれなくなる）。
  breakthroughPanel(battle) {
    if (!battle) return "";
    const chain = battle.chainSummary || null;
    const overkill = battle.overkillSummary || null;
    const maxChain = (chain && chain.maxChain) || 0;
    const maxPercent = (overkill && overkill.maxPercent) || 0;
    if (!maxChain && !maxPercent) return "";

    // 数字だけでは「CHAIN」が何を指すのか伝わらない。経路の上に一行置いて、
    // 「この芋づるの段数が最大CHAINだ」と読めるようにする（説明画面は作らない）。
    const steps = (chain && chain.deepest && chain.deepest.steps) || [];
    const path = steps.length >= 2
      ? `<div class="chain-caption">いちばん長くつながった連鎖（${steps.length}段）</div>
         <div class="chain-path">${steps.map(step =>
          `<span class="chain-step">${U.esc(step.label)}</span>`).join(`<span class="chain-arrow">→</span>`)}</div>`
      : `<div class="muted">連鎖は起きなかった（ひと突きで終わっている）</div>`;

    const details = [];
    if (overkill && overkill.count) details.push(`${U.esc(overkill.rank || "OVERKILL")} ほか ${overkill.count}回・総余剰 ${overkill.totalExcess}`);
    const revives = (battle.contribution || []).reduce((sum, c) => sum + (c.revivesGiven || 0) + (c.selfRevives || 0), 0);
    if (revives) details.push(`蘇生 ${revives}回`);
    if (battle.summonCount) details.push(`召喚 ${battle.summonCount}体`);

    return `<div class="panel breakthrough-panel"><h3>💥 今回の大暴れ</h3>
      <div class="breakthrough-records">
        <div><b>${maxChain}</b><span>最大CHAIN</span></div>
        <div><b>${maxPercent}%</b><span>最大OVERKILL</span></div>
      </div>
      ${path}
      ${details.length ? `<div class="muted">${details.join("　/　")}</div>` : ""}
    </div>`;
  },

  payrollPanel() {
    const st = Game.state;
    const selected = Game.payrollPolicy();
    const options = PAYROLL_POLICY_ORDER.map(id => {
      const quote = Game.payrollQuote(id);
      const policy = quote.policy;
      const costText = id === "withhold" ? "支払 0G"
        : id === "advance" ? `今すぐ ${quote.cost}G` : `勝利後 ${quote.cost}G`;
      return `<button class="payroll-option ${selected.id === id ? "selected" : ""}"
        data-action="payrollpolicy" data-policy="${id}" ${!quote.affordable ? "disabled" : ""}>
        <span class="payroll-title">${policy.icon} ${U.esc(policy.name)}</span>
        <span class="payroll-cost">${U.esc(costText)}</span>
        <span class="payroll-desc">${U.esc(policy.description)}</span>
      </button>`;
    }).join("");
    const advance = Game.payrollQuote("advance");
    return `<div class="panel payroll-panel">
      <h3>💰 今回の給与方針</h3>
      <div class="muted">出撃前に決める。未払いはこの戦闘から特性・ストライキ・行進曲へ反映される。</div>
      <div class="payroll-options">${options}</div>
      ${!advance.affordable ? `<div class="payroll-warning">厚遇には ${advance.cost}G 必要（現在 ${st.gold}G）</div>` : ""}
    </div>`;
  },

  payrollHistory(record) {
    const choices = record && record.payrollChoices || {};
    return PAYROLL_POLICY_ORDER
      .filter(id => (choices[id] || 0) > 0)
      .map(id => `${PAYROLL_POLICIES[id].short}${choices[id]}回`)
      .join("・") || "記録なし";
  },

  // 敗北を「ただの死因」で終わらせず、次に変えられる判断を考えたくなる材料にする。
  nearMissPanel(nearMiss) {
    if (!nearMiss || !nearMiss.enemyMaxHp) return "";
    const maxHp = Math.max(1, Number(nearMiss.enemyMaxHp) || 1);
    const closest = Math.max(0, Math.min(maxHp, Number(nearMiss.closestRemaining) || 0));
    const final = Math.max(0, Math.min(maxHp, Number(nearMiss.finalRemaining) || 0));
    const dealt = Math.max(0, maxHp - closest);
    const percent = Math.round(dealt / maxHp * 100);
    const isNearMiss = percent >= 75;
    const recovered = final > closest;
    const last = nearMiss.lastEventText ? `<div class="near-miss-last"><b>最後:</b> ${U.esc(nearMiss.lastEventText)}</div>` : "";
    return `<div class="panel near-miss-panel">
      <h3>${isNearMiss ? "🕯 最も追い詰めた瞬間" : "🕯 敗因メモ"}</h3>
      <div class="near-miss-score">敵軍の耐久を <b>${percent}%</b> 削った</div>
      <div class="near-miss-hp">敵軍HP <b>${closest}</b> / ${maxHp}${isNearMiss ? ` ― あと <b>${closest}</b> ダメージ` : ""}</div>
      ${recovered ? `<div class="muted">その後、敵軍は ${final} HP まで立て直した。</div>` : ""}
      ${last}
    </div>`;
  },

  // 効果量を「+15%刻み」のような説明文だけで済ませると、いま3体で+15%なのか
  // 5体で+45%なのかが分からず、「脆いから2体を別種族へ」という判断が
  // 火力を半減させていることに気づけない（実測で混成が純種族より弱かった）。
  // 効果は Synergy.preview() が実際に適用して測った値を出す。
  synergyEffect(entry) {
    const parts = [];
    if (entry.now.dmgMult > 1) parts.push(`与ダメージ <b>×${entry.now.dmgMult.toFixed(2)}</b>`);
    if (entry.now.takenMult < 1) parts.push(`被ダメージ <b>×${entry.now.takenMult.toFixed(2)}</b>`);
    return parts.length ? `${parts.join("・")}（対象 ${entry.now.affected}体）` : "";
  },

  synergyNext(entry) {
    if (!entry.next) return "";
    const gain = entry.next.dmgMult > entry.now.dmgMult
      ? `与ダメージ ×${entry.next.dmgMult.toFixed(2)}`
      : `被ダメージ ×${entry.next.takenMult.toFixed(2)}`;
    const how = entry.swapOutRace
      ? `${U.esc(entry.swapOutRace)}を${U.esc(entry.nextRace || "同じ種族")}に替えると`
      : `${U.esc(entry.nextRace || "同じ種族")}をあと1体で`;
    return `<div class="syn-next">▲ ${how} <b>${gain}</b></div>`;
  },

  // 合体は「強くなる代わりに数を失う」取引。自動でやると罠になるので選ばせる。
  kingSlimePanel() {
    const preview = Game.kingSlimePreview();
    if (!preview) return "";
    const on = Game.state.kingSlimeMerge !== false;
    return `<div class="panel king-panel ${on ? "on" : ""}">
      <h3>👑 キングスライム合体 <span class="muted">— スライム3体が1体になる（不可逆）</span></h3>
      <div class="king-compare">
        <div><b>${preview.before.count}体のまま</b>
          <span class="muted">HP計 ${preview.before.hp}・攻計 ${preview.before.atk}・給与 ${preview.before.salary}G</span>
          <div class="muted">頭数で伸びるもの（低賃金大量採用・群れの本能・出撃枠の圧）を保てる</div></div>
        <div><b>合体して1体</b>
          <span class="muted">HP ${preview.after.hp}・攻 ${preview.after.atk}・防 ${preview.after.def}・速 ${preview.after.spd}・給与 ${preview.after.salary}G</span>
          <div class="muted">硬く重くなるが、頭数は3体ぶん減る</div></div>
      </div>
      <button class="small ${on ? "primary" : ""}" data-action="kingmerge" data-on="${on ? "0" : "1"}">
        ${on ? "✓ 出撃時に合体する（やめる）" : "合体しない（3体のまま戦う）"}</button>
      <div class="muted">対象：${preview.members.map(m => U.esc(m.name)).join("・")}</div>
    </div>`;
  },

  // 稼いだ金貨の出口。出撃5枠を壊さず「その戦闘だけの6体目」を買う。
  // 同族を雇えば種族シナジーの頭数も増えるので、硬い者と噛み合う者のどちらを取るかが判断になる。
  mercenaryPanel() {
    const st = Game.state;
    const hired = st.mercenaries || [];
    const offers = Game.mercenaryOffers();
    const base = Game.mercenaryBaseCost();
    const full = hired.length >= Game.MERCENARY_COSTS.length;
    const hiredHtml = hired.length
      ? `<div class="merc-hired">雇用中：${hired.map(m =>
          `<span class="merc-chip">${this.icon(m.race)} ${U.esc(m.name)}（${U.esc(m.race)}）${m.hiredFor}G</span>`).join("")}</div>`
      : "";
    const cards = full ? "" : offers.map((m, i) => {
      const cost = Game.mercenaryCost(i);
      const kin = Game.mercenaryKinCount(m.race);
      const afford = st.gold >= cost;
      return `<div class="merc-card">
        <div class="merc-name">${this.icon(m.race)} <b>${U.esc(m.name)}</b>
          <span class="muted">${U.esc(m.race)}／${U.esc(m.job)}</span></div>
        <div class="merc-stats">HP ${m.hp}・攻 ${m.atk}・防 ${m.def}・速 ${m.spd}</div>
        <div class="merc-traits">${this.traitHtml(m.traits)}</div>
        ${cost < base ? `<div class="merc-kin">🤝 顔なじみ価格 ${base}G → <b>${cost}G</b>
          <span class="muted">（出撃隊に${U.esc(m.race)}が${kin}体）</span></div>` : ""}
        <button class="small primary" data-action="hiremerc" data-index="${i}" ${afford ? "" : "disabled"}>
          ${afford ? `${cost}G で雇う` : `${cost}G 必要（所持 ${st.gold}G）`}</button>
      </div>`;
    }).join("");
    return `<div class="panel merc-panel">
      <h3>🗡 傭兵市場 <span class="muted">— この戦闘だけの助っ人</span></h3>
      <div class="muted">出撃5枠の外から加わる。給与も戦功も持たず、戦闘が終われば去る。
        ${full ? "これ以上は雇えない。" : `次の1名は ${base}G（出撃隊に同じ種族がいるほど安くなる）。`}</div>
      ${hiredHtml}
      ${cards ? `<div class="merc-list">${cards}</div>` : ""}
    </div>`;
  },

  // シナジーだけ見せても「混ぜると倍率を二重に失う」の片方しか見えない。
  // 《群れの本能》のように編成で決まる特性も、実際に測った倍率で出す。
  traitSynergyHtml(roster) {
    const effects = Synergy.traitEffects(roster);
    if (!effects.length) return "";
    const groups = new Map();
    for (const effect of effects) {
      for (const trait of effect.traits) {
        const key = `${trait.name}|${trait.mult.toFixed(2)}`;
        if (!groups.has(key)) groups.set(key, { name: trait.name, mult: trait.mult, note: trait.note, members: [] });
        groups.get(key).members.push(effect.name);
      }
    }
    const rows = [...groups.values()]
      .sort((a, b) => b.mult - a.mult)
      .map(g => `<div class="trait-effect"><b>${U.esc(g.name)}</b>
        <span class="trait-mult">×${g.mult.toFixed(2)}</span>
        <span class="muted">${U.esc(g.members.join("・"))}</span></div>`).join("");
    return `<div class="syn-reach"><h4>いまの並びで効いている特性</h4>${rows}</div>`;
  },

  synergyPanel(roster) {
    const entries = Synergy.preview(roster, { slots: Game.MAX_DEPLOY });
    const act = entries.filter(e => e.active);
    const activeHtml = act.length
      ? `<div class="syn-list">${act.map(e => {
          const effect = this.synergyEffect(e);
          return `<div class="syn on"><b>${U.esc(e.name)}</b>
            ${effect ? `<div class="syn-effect">いま：${effect}</div>` : ""}
            ${this.synergyNext(e)}
            <div class="d">${U.esc(e.desc)}</div></div>`;
        }).join("")}</div>`
      : `<div class="muted">現在発動中のシナジーはない。</div>`;
    // 「あと何体で届くか」も実測（手持ちの誰かを増やして条件を満たせるか試す）
    const reachable = entries.filter(e => !e.active && e.need !== null)
      .sort((a, b) => a.need - b.need);
    const far = entries.filter(e => !e.active && e.need === null);
    const nearHtml = reachable.map(e => `<div class="syn"><b>${U.esc(e.name)}</b>
      <span class="syn-need">あと${e.need}体</span>
      <div class="d">条件：${U.esc(e.condition || "特殊条件")}／${U.esc(e.desc)}</div></div>`).join("");
    const candidates = far.map(e => `<div class="syn"><b>${U.esc(e.name)}</b>
      <div class="d">条件：${U.esc(e.condition || "特殊条件")}／${U.esc(e.desc)}</div></div>`).join("");
    return `<div class="panel"><h3>発動中のシナジー</h3>${activeHtml}
      ${this.traitSynergyHtml(roster)}
      ${nearHtml ? `<div class="syn-reach"><h4>あと少しで届く</h4><div class="syn-list">${nearHtml}</div></div>` : ""}
      <details><summary>組み合わせ候補を見る</summary><div class="syn-list">${candidates}</div></details></div>`;
  },

  enemyPreview() {
    const sd = Game.stageData();
    const mine = Game.activeRoster();
    return `<div class="panel">
      <h3>${U.esc(sd.missionTitle || "次の戦い")}：${U.esc(sd.army)}
        <span class="muted">（${U.esc(sd.region)}／報酬 ${sd.reward}G）</span></h3>
      <div class="mission-formation"><b>敵編成：${U.esc(sd.formationName || "基本隊列")}</b>
        <span class="muted">— ${U.esc(sd.formationHint || "敵情を確認して出撃隊を選べ。")}</span></div>
      <div class="vs">
        <div class="side"><h4>魔王軍（上が前衛）</h4><ul>${
          mine.length ? mine.map(m => `<li>${this.icon(m.race)} ${U.esc(m.name)} <span class="muted">HP${m.hp} 攻${m.atk}</span></li>`).join("")
                      : `<li class="muted">誰もいない</li>`
        }</ul></div>
        <div class="mid">VS</div>
        <div class="side"><h4>敵軍</h4><ul>${
          sd.units.map(e => `<li>${U.esc(e.icon || "🗡")} ${U.esc(e.name)} <span class="muted">HP${e.hp} 攻${e.atk}</span></li>`).join("")
        }</ul></div>
      </div>
    </div>`;
  },

  // ── 画面 ────────────────────────────
  title(hasSave, history) {
    const kingChoices = DEMON_KINGS.map(k => `<button class="wide ${k.id === "standard" ? "primary" : ""}"
      data-action="new" data-king="${U.esc(k.id)}">${k.icon} ${U.esc(k.name)}で新規ゲーム
      <small>${U.esc(k.desc)}</small></button>`).join("");
    this.set(`<div class="title-screen">
      <h1>魔王ワーク</h1>
      <p class="muted">採用して、配属して、働かせろ。<br>戦場も魔王城も、人材配置がすべてだ。</p>
      <div class="title-menu">
        <div class="muted">第${history.length + 1}代魔王を選ぶ</div>
        ${kingChoices}
        ${hasSave ? `<button class="wide" data-action="continue">続きから</button>` : ""}
        <button class="wide ghost" data-action="history">魔界史（${history.length}代の記録）</button>
      </div>
      <div class="spacer"></div>
      <p class="muted">軍団員を戦闘・建設・生活へ配属。勝てば資源、働けば給与と手当。<br>敗北すれば軍団は消滅し、歴史だけが残る。</p>
    </div>`);
  },

  recruit() {
    const st = Game.state;
    const full = !Game.canHire();
    const cards = st.applicants.map((m, i) => this.monsterCard(m, {
      resume: true,
      footer: (() => {
        const cost = Game.hireCost();
        const allowed = Game.canHireApplicant(i);
        const label = full ? "軍団が満員（誰かを解雇せよ）"
          : cost > 0 ? `追加採用（紹介料 ${cost}G・給与 ${m.salary}G）`
          : `無料枠で採用（給与 ${m.salary}G）`;
        return `<button class="primary wide" data-action="hire" data-index="${i}" ${allowed ? "" : "disabled"}>${label}</button>`;
      })()
    })).join("");
    // 満員でも応募者を逃さず入れ替えられるよう、この画面から解雇できるようにする
    const rosterPanel = st.roster.length ? `<div class="panel">
      <h3>現在の軍団 <span class="muted">（${st.roster.length}/${Game.MAX_ARMY}）</span></h3>
      <div class="muted">枠を空けたければ、ここで解雇できる。</div>
      <div class="spacer" style="height:8px"></div>
      <div class="row tight">${st.roster.map(m => `
        <span class="mini">
          ${this.icon(m.race)} ${U.esc(m.name)}
          <span class="muted">${U.esc(m.race)} HP${m.hp} 攻${m.atk} ${m.salary}G</span>
          <button class="small danger" data-action="fire" data-uid="${m.uid}">解雇</button>
        </span>`).join("")}</div>
    </div>` : "";
    this.set(`${this.hud()}
      <div class="panel">
        <h2>📜 応募者面接 <span class="muted">（残り採用枠 ${st.hiresLeft}）</span></h2>
        <div class="muted">${
          st.turn === 1 && st.hiresLeft > 1 ? `軍団の設立だ。${st.hiresLeft}名まで採用できる。`
          : st.hiresLeft > 1 ? `先の戦いで欠員が出た。${st.hiresLeft}名まで補充できる。`
          : st.hiresLeft === 0 ? `無料採用枠は終了。${Game.additionalHireCost()}Gで追加紹介を受けるか、面接を終了できる。`
          : "3名が魔王軍への入隊を希望している。採用できるのは1名だけだ。"}</div>
      </div>
      <div class="cards">${cards}</div>
      <div class="spacer"></div>
      <div class="row">
        <button data-action="reroll" ${Game.canReroll() ? "" : "disabled"}>
          📢 求人を出し直す（広告費 ${Game.rerollCost()}G）</button>
        <button data-action="skip" ${st.roster.length === 0 ? "disabled" : ""}>面接を終了して作戦会議へ</button>
        ${st.roster.length === 0 ? `<span class="muted">部隊が空では出撃できない。まず1体は採用せよ。</span>` : ""}
      </div>
      <div class="spacer"></div>
      ${rosterPanel}
      ${st.roster.length ? `<div class="panel"><h3>部門状況</h3>${this.departmentSummary()}</div>` : ""}
      ${this.synergyPanel(Game.activeRoster())}`);
  },

  mission() {
    const st = Game.state;
    const offers = st.missionOffers.length ? st.missionOffers : Game.prepareMissions(true);
    const salary = Game.salaryTotal();
    const construction = Game.departmentOutput().material;
    const nextFacility = FACILITY_LEVELS[st.facilityLevel + 1];
    const cards = offers.map((m, i) => {
      const net = m.reward - salary;
      const availableMaterials = (st.materials || 0) + (m.materialReward || 0);
      const buildEstimate = nextFacility ? Math.min(availableMaterials, construction) : 0;
      const buildRemaining = nextFacility
        ? Math.max(0, nextFacility.buildThreshold - st.buildProgress)
        : 0;
      const buildText = !nextFacility
        ? "施設は最大レベル"
        : construction <= 0
          ? `施工役なし（${m.materialReward || 0}建材は備蓄）`
          : `勝利後 最大${buildEstimate}投入／次施設まで${buildRemaining}`;
      const consequence = m.missionKind === "invade"
        ? `王国攻略 +${m.conquestDelta}（決戦まであと${Math.max(0, Game.MAX_CONQUEST - st.conquest)}勝）`
        : m.missionKind === "suppress"
          ? `生存者の忠誠 +${m.loyaltyDelta}`
          : "王国攻略は進まない";
      return `<div class="mission-card mission-${U.esc(m.missionKind)}">
        <div class="mission-kind">${m.missionKind === "raid" ? "🔥" : m.missionKind === "suppress" ? "⚖" : "🏰"}
          危険度 ${U.esc(m.difficulty)}</div>
        <h3>${U.esc(m.missionTitle)}</h3>
        <div class="mission-purpose"><b>${U.esc(m.strategyLabel || "作戦")}</b><br>
          <span>${U.esc(m.strategyHint || "")}</span></div>
        <div class="mission-army">${U.esc(m.army)} <span class="muted">— ${U.esc(m.region)}</span></div>
        <div class="mission-formation"><b>敵編成：${U.esc(m.formationName || "基本隊列")}</b><br>
          <span class="muted">${U.esc(m.formationHint || "敵情を確認して出撃隊を選べ。")}</span></div>
        <p>${U.esc(m.description)}</p>
        <dl class="mission-economy">
          <dt>勝利報酬</dt><dd class="gold">${m.reward}G</dd>
          <dt>食料</dt><dd class="food">+${m.foodReward || 0}</dd>
          <dt>建材</dt><dd class="materials">+${m.materialReward || 0}</dd>
          <dt>施設施工見込</dt><dd>${U.esc(buildText)}</dd>
          <dt>給与・手当</dt><dd>${salary}G</dd>
          <dt>差引見込</dt><dd class="${net >= 0 ? "positive" : "negative"}">${net >= 0 ? "+" : ""}${net}G</dd>
          <dt>作戦結果</dt><dd>${U.esc(consequence)}</dd>
          <dt>警戒度</dt><dd>+${m.alertDelta}</dd>
          <dt>軍勢警戒</dt><dd>${m.armyPressure ? `敵能力 +${m.armyPressure}%` : "なし"}</dd>
        </dl>
        <button class="primary wide" data-action="missionpick" data-index="${i}">この作戦を選ぶ</button>
      </div>`;
    }).join("");
    this.set(`${this.hud()}
      <div class="panel">
        <h2>🗺 作戦会議</h2>
        <div class="muted">略奪と鎮圧は軍団を整える寄り道、王国侵攻は最終決戦を近づける。
          建設担当がいれば、どの作戦でも勝利後に備蓄建材を施設へ投入する。</div>
      </div>
      <div class="panel"><h3>現在の部門と施設</h3>${this.departmentSummary()}</div>
      <div class="mission-grid">${cards}</div>
      <div class="spacer"></div>
      <button class="wide ghost" data-action="backrecruit">← 面接・軍団確認へ戻る</button>`);
  },

  formation() {
    const st = Game.state;
    const opening = st.openingPrototype;
    const preparation = opening && st.phase === "preparation";
    const active = Game.activeRoster();
    const activeIds = new Set(st.activeUids);
    const combatMembers = Game.departmentRoster("combat");
    const reserves = combatMembers.filter(m => !activeIds.has(m.uid));
    const builders = Game.departmentRoster("construction");
    const lifeWorkers = Game.departmentRoster("life");
    const activeCards = active.map((m, i) => this.monsterCard(m, {
      badge: i === 0 ? "最前列（狙われやすい）" : `${i + 1}番目`,
      footer: `<div class="card-actions">
        <div class="row tight">
          <button class="small" data-action="up" data-uid="${m.uid}" ${i === 0 ? "disabled" : ""}>▲ 前へ</button>
          <button class="small" data-action="front" data-uid="${m.uid}" ${i === 0 ? "disabled" : ""}>⏫ 最前列へ</button>
          <button class="small" data-action="down" data-uid="${m.uid}" ${i === active.length - 1 ? "disabled" : ""}>▼ 後ろへ</button>
          <button class="small" data-action="toggledeploy" data-uid="${m.uid}">控えへ</button>
        </div>
        <div class="row tight">${this.departmentButtons(m, "combat")}</div>
      </div>`
    })).join("");
    const reserveCards = reserves.map(m => this.monsterCard(m, {
      badge: "控え（給与0G）",
      footer: `<div class="card-actions">
        <div class="row tight">
          <button class="small primary" data-action="toggledeploy" data-uid="${m.uid}"
            ${active.length >= Game.MAX_DEPLOY ? "disabled" : ""}>出撃隊へ</button>
          ${this.departmentButtons(m, "combat")}
        </div>
        <button class="small danger" data-action="fire" data-uid="${m.uid}">解雇</button>
      </div>`
    })).join("");
    const builderCards = builders.map(m => this.monsterCard(m, {
      badge: `建設手当 ${Math.max(1, Math.ceil(m.salary * DEPARTMENTS.construction.wageRate))}G`,
      footer: `<div class="card-actions"><div class="row tight">${this.departmentButtons(m, "construction")}</div>
        <button class="small danger" data-action="fire" data-uid="${m.uid}">解雇</button></div>`
    })).join("");
    const lifeCards = lifeWorkers.map(m => this.monsterCard(m, {
      badge: `生活手当 ${Math.max(1, Math.ceil(m.salary * DEPARTMENTS.life.wageRate))}G`,
      footer: `<div class="card-actions"><div class="row tight">${this.departmentButtons(m, "life")}</div>
        <button class="small danger" data-action="fire" data-uid="${m.uid}">解雇</button></div>`
    })).join("");
    const empty = active.length === 0;
    const payroll = Game.payrollPolicy();
    const payrollQuote = Game.payrollQuote();
    const rations = Game.battleRationQuote();
    const rationHints = [
      active.some(m => (m.traits || []).includes("big_eater")) && rations.consumed > 0 ? "大食漢" : "",
      active.some(m => (m.traits || []).includes("demon_cook")) && rations.consumed > 0 ? "魔界料理人" : "",
      active.some(m => (m.traits || []).includes("hunger_demon")) && rations.emptied ? "飢餓の悪魔" : "",
      rations.consumed >= 4 ? "暴食の宴" : ""
    ].filter(Boolean);
    const deathHints = [
      active.some(m => (m.traits || []).includes("gravekeeper")) ? "死亡→魂獲得" : "",
      active.some(m => (m.traits || []).includes("necromancy")) ? "死亡者1名を蘇生" : "",
      active.some(m => (m.traits || []).includes("soul_harvest")) ? "蘇生→魂消費→アンデッド強化" : ""
    ].filter(Boolean);
    const ledgerReady = st.facilityLevel >= 1 && active.some(m => (m.job || "").includes("会計"));
    const graveyardReady = st.facilityLevel >= 1 && builders.some(m => m.tplId === "necromancer");
    const deadline = st.day === 1 ? "勇者到着まであと2日"
      : st.day === 2 ? "明日、勇者が到着" : "本日、勇者襲来";
    const openingActions = st.day < Game.OPENING_DAYS
      ? `<button class="wide" data-action="openingbattle" data-kind="raid" ${empty || st.expeditionUsedToday ? "disabled" : ""}>🔥 ${st.expeditionUsedToday ? "本日の遠征は完了" : "任意遠征：辺境を略奪"}</button>
         <div class="spacer"></div>
         <button class="primary wide" data-action="endday" data-day="${st.day}">本日の業務を終了</button>`
      : `<button class="primary wide" data-action="openingbattle" data-kind="invade" ${empty ? "disabled" : ""}>⚔ 防衛戦を開始する</button>`;
    this.set(`${this.hud()}
      <div class="panel">
        <h2>${opening ? `📅 ${st.day}日目：${deadline}` : "🏢 部門編成"} <span class="muted">— ${U.esc(st.selectedMission && st.selectedMission.missionTitle || (opening ? "準備日" : "作戦未選択"))}</span></h2>
        <div class="muted">${opening ? "配置と給与方針は翌日も維持される。変えたい所だけ直し、業務終了で日次決算を行う。" : "戦闘は最大5体。建設・生活は戦場に出ない代わりに、勝利後の資源循環を担当する。部門手当は希望給与の半額。"}</div>
        ${this.departmentSummary()}
      </div>
      ${opening ? "" : `<div class="panel"><b>🍖 戦闘糧食 ${rations.consumed}/${rations.need}</b>
        <span class="muted"> — 出撃時に備蓄 ${rations.foodBefore} → ${rations.foodAfter}</span>
        ${rations.shortage ? `<div class="warn">不足 ${rations.shortage}</div>` : ""}
        ${rationHints.length ? `<div class="synergy-hint">発火見込み：${rationHints.map(U.esc).join(" → ")}</div>` : ""}</div>`}
      ${!opening && deathHints.length ? `<div class="panel"><b>💀 死亡反応</b>
        <div class="synergy-hint">${deathHints.map(U.esc).join(" → ")}</div></div>` : ""}
      ${!opening && ledgerReady ? `<div class="panel"><b>📒 恐喝帳簿</b>
        <div class="synergy-hint">予約金貨3G到達 → 次の味方攻撃+40%</div></div>` : ""}
      ${!opening && graveyardReady ? `<div class="panel"><b>🪦 墓地</b>
        <div class="synergy-hint">最初の味方死亡 → ラウンド終了時に骸骨従者を1体召喚</div></div>` : ""}
      ${this.payrollPanel()}
      ${opening ? "" : this.mercenaryPanel()}
      ${this.kingSlimePanel()}
      ${empty ? `<div class="panel"><b style="color:var(--red)">出撃隊が空だ。</b> 戦闘部門から最低1体を選べ。</div>` : ""}
      <div class="army-section department-section department-combat-section"><h3>⚔ 戦闘部門・出撃隊 ${active.length}/${Game.MAX_DEPLOY}</h3><div class="cards">${activeCards}</div></div>
      <div class="army-section reserve-section"><h3>⚔ 戦闘部門・控え ${reserves.length}</h3>
        <div class="cards">${reserveCards || `<div class="muted">戦闘部門の控えはいない</div>`}</div></div>
      <div class="army-section department-section department-construction-section"><h3>🔨 建設・施設部門 ${builders.length}</h3>
        <div class="muted department-help">勝利後、施工能力のぶんだけ備蓄建材を投入する。能力は種族と前職で決まる（オーガの重量物運搬は桁が違う）。施設効果は次の出撃隊全員に付く。</div>
        <div class="cards">${builderCards || `<div class="department-empty">建材はあっても、働く者がいなければ城は育たない。</div>`}</div></div>
      <div class="army-section department-section department-life-section"><h3>🍲 食料・生活部門 ${lifeWorkers.length}</h3>
        <div class="muted department-help">勝利後、食料適性のぶんだけ調達する。食う量は種族ごとに違い、アンデッドは何も食べない。足りれば軍団全員の忠誠も少し上がる。</div>
        <div class="cards">${lifeCards || `<div class="department-empty">現在は自炊。食料が尽きれば全員の忠誠が下がる。</div>`}</div></div>
      <div class="spacer"></div>
      ${this.synergyPanel(active)}
      ${this.enemyPreview()}
      ${opening ? "" : `<button class="wide ghost" data-action="backmission">← 作戦会議へ戻る</button>`}
      <div class="spacer"></div>
      ${preparation ? openingActions : `<button class="primary wide" data-action="deploy" ${empty || (!opening && !payrollQuote.affordable) ? "disabled" : ""}>${opening ? (st.day === Game.OPENING_DAYS ? "防衛戦へ出撃する" : "遠征へ出撃する") : `${U.esc(payroll.name)}で出撃する`}</button>`}
      ${st.roster.length === 0 ? `<div class="spacer"></div><button class="wide ghost" data-action="title">タイトルへ戻る</button>` : ""}`);
  },

  battle(result, stageData) {
    // 描画はレンダラに委譲する。UIは戦闘の中身を知らない。
    this.set(BattleScene.shell(stageData));
    BattleScene.play(result.timeline);
  },

  result() {
    const st = Game.state;
    const b = st.lastBattle;
    const payrollReport = st.lastPayrollReport || {};
    const payrollPolicy = PAYROLL_POLICIES[payrollReport.policyId] || PAYROLL_POLICIES.regular;
    this.set(`${this.hud()}
      <div class="banner win">
        <h2>勝利！</h2>
        <div>${U.esc(b.army)} を撃退した</div>
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>
      <div class="panel payroll-result">
        <h3>${payrollPolicy.icon} 給与報告：${U.esc(payrollPolicy.name)}</h3>
        <div>支払額 <b>${payrollReport.paid || 0}G</b>／通常額 ${payrollReport.base || 0}G</div>
        <div class="${(payrollReport.loyaltyDelta || 0) < 0 ? "negative" : "positive"}">勤務者の忠誠 ${payrollReport.loyaltyDelta > 0 ? "+" : ""}${payrollReport.loyaltyDelta || 0}</div>
      </div>
      ${b.synergies.length ? `<div class="panel"><h3>この戦いで働いたシナジー</h3><div class="syn-list">${
        b.synergies.map(n => `<div class="syn"><b>${U.esc(n)}</b></div>`).join("")}</div></div>` : ""}
      ${this.breakthroughPanel(b)}
      ${this.contributionPanel(b.contribution)}
      ${(b.incidents && b.incidents.length) ? `<div class="panel incident-panel"><h3>💥 この戦いの不祥事</h3>
        ${b.incidents.map(i => `<div><b>${U.esc(i.name)}</b>：${U.esc(i.text)}</div>`).join("")}</div>` : ""}
      ${(st.lastPromotions && st.lastPromotions.length) ? `<div class="panel promotion-panel">
        <h3>👑 魔王軍人事</h3>
        ${st.lastPromotions.map(p => `<div class="promotion-row promotion-${U.esc(p.rankId)}"><b>${U.esc(p.name)}</b> を
          <span class="rank-badge rank-${U.esc(p.rankId)}">${U.esc(p.rankName)}</span> に任ずる！
          <div class="muted">${U.esc(p.message)}</div></div>`).join("")}
      </div>` : ""}
      ${(st.lastFallen && st.lastFallen.length) ? `<div class="panel fallen-panel">
        <h3>🕯 戦没者</h3>
        <div class="muted">${st.lastFallen.map(f => `${this.icon(f.race)} ${U.esc(f.name)}`).join("　")}</div>
        <div class="muted">この者たちは軍を去った。次の面接で ${st.lastFallen.length} 名まで補充できる。</div>
      </div>` : ""}
      <div class="panel">
        <h3>現在の軍団</h3>
        <div class="cards">${st.roster.map(m => this.monsterCard(m)).join("") || `<div class="muted">誰も残っていない……</div>`}</div>
      </div>
      <button class="primary wide" data-action="afterresult">次へ</button>`);
    if (st.lastPromotions && st.lastPromotions.length && typeof Sound !== "undefined") Sound.cue("promotion");
  },

  // 敗北したが、まだ再起できる状態の画面
  defeat() {
    const st = Game.state;
    const b = st.lastBattle;
    const cp = st.checkpoint;
    const goldNow = cp ? cp.gold : st.gold;
    const goldAfter = Math.floor(goldNow / 2);
    return this.set(`<div class="banner lose">
        <h2>魔王軍、壊滅</h2>
        <div>${U.esc(b.army)} に敗北した</div>
      </div>
      ${this.nearMissPanel(b.nearMiss)}
      ${this.breakthroughPanel(b)}
      ${this.contributionPanel(b.contribution)}
      <div class="panel">
        <h3>まだ終わりではない</h3>
        <div class="muted">
          第${st.turn}作戦の採用面接まで時を巻き戻せる。応募者と作戦を選び直し、並べ直せ。<br>
          ただし軍の立て直しには金がかかる：所持金 <b class="gold">${goldNow}G → ${goldAfter}G</b><br>
          この機会は<b>このランで1度きり</b>だ。
        </div>
      </div>
      <div class="row">
        <button class="primary" data-action="retry">⟲ 再起する（残り ${st.retriesLeft} 回）</button>
        <button class="danger" data-action="concede">ここで終わる（歴史に刻む）</button>
      </div>`);
  },

  // ハプニング画面。選択肢を出し、選んだ後は結果を見せてから採用へ進む。
  event() {
    const st = Game.state;
    const ev = Game.currentEvent();

    // 選択済み → 結果を見せる
    if (!ev || st.eventOutcome) {
      return this.set(`${this.hud()}
        <div class="panel event-panel">
          <h2>⚡ その後</h2>
          <div class="event-text">${U.esc(st.eventOutcome || "")}</div>
        </div>
        <button class="primary wide" data-action="eventdone">次の応募者を面接する</button>`);
    }

    const opts = Game.eventOptions().map(({ o, i }) =>
      `<button class="wide event-choice" data-action="eventpick" data-index="${i}">${
        U.esc(typeof o.label === "function" ? o.label(st) : o.label)}</button>`
    ).join("");

    this.set(`${this.hud()}
      <div class="panel event-panel">
        <h2>⚡ ${U.esc(ev.title)}</h2>
        <div class="event-text">${U.esc(st.pendingEvent.text)}</div>
      </div>
      <div class="event-options">${opts}</div>`);
  },

  gameover(record, history) {
    this.set(`<div class="banner ${record.cleared ? "win" : "lose"}">
        <h2>${record.cleared ? "人間界を制圧した！" : "魔王軍、壊滅"}</h2>
        <div>${U.esc(record.cause)}</div>
      </div>
      <div class="panel">
        <h3>第${record.gen}代魔王軍の記録</h3>
        ${this.recordHighlights(record)}
        <dl class="history-item" style="border:none;padding:0;background:none">
          <dt>在位</dt><dd>${record.reignYears}年</dd>
          <dt>魔王</dt><dd>${U.esc(record.demonKingName || "若き魔王")}</dd>
          <dt>勝利数</dt><dd>${record.battlesWon}戦</dd>
          <dt>王国攻略</dt><dd>${record.conquest || 0}/${Game.MAX_CONQUEST}</dd>
          <dt>最終警戒度</dt><dd>${record.alert || 0}</dd>
          <dt>最大戦力</dt><dd>${record.maxPower}</dd>
          <dt>最大兵員数</dt><dd>${record.maxArmySize || (record.finalRoster || []).length}体</dd>
          <dt>輩出した将軍</dt><dd>${(record.generalsMade || []).map(g => U.esc(g.name)).join("、") || "なし"}</dd>
          <dt>殿堂入り</dt><dd>${record.hallOfFame ? `${U.esc(record.hallOfFame.name)}（戦功 ${record.hallOfFame.merit || 0}）` : "なし"}</dd>
          <dt>戦場の不祥事</dt><dd>${record.battleIncidentTotal || 0}件</dd>
          <dt>給与方針</dt><dd>${U.esc(this.payrollHistory(record))}</dd>
          <dt>最終施設</dt><dd>Lv.${record.facilityLevel || 0}</dd>
          <dt>主力種族</dt><dd>${U.esc(record.mainRace)}</dd>
          <dt>到達地域</dt><dd>${U.esc(record.region)}</dd>
          <dt>死因</dt><dd>${U.esc(record.cause)}</dd>
          ${record.retriesUsed ? `<dt>再起</dt><dd>${record.retriesUsed}回</dd>` : ""}
          ${record.fallenTotal ? `<dt>戦没者</dt><dd>${record.fallenTotal}名</dd>` : ""}
        </dl>
        <div class="muted">最後まで付き従った者たち：${
          record.finalRoster.length ? record.finalRoster.map(m => U.esc(m.name)).join("、") : "誰も残らなかった"}</div>
      </div>
      ${this.nearMissPanel(Game.state.lastBattle && Game.state.lastBattle.nearMiss)}
      ${this.breakthroughPanel(Game.state.lastBattle)}
      ${this.contributionPanel(Game.state.lastBattle && Game.state.lastBattle.contribution)}
      <div class="row">
        <button class="primary" data-action="new">第${history.length + 1}代として再挑戦</button>
        <button data-action="history">魔界史を見る</button>
        <button class="ghost" data-action="title">タイトルへ</button>
      </div>`);
  },

  history(list) {
    const discovered = new Set();
    const discoveredSynergies = new Set();
    for (const r of list) {
      for (const id of (r.recruitedTplIds || [])) discovered.add(id);
      for (const m of (r.finalRoster || [])) if (m.tplId) discovered.add(m.tplId);
      if (r.hallOfFame && r.hallOfFame.tplId) discovered.add(r.hallOfFame.tplId);
      for (const id of (r.discoveredSynergyIds || [])) discoveredSynergies.add(id);
    }
    const catalog = MONSTER_TEMPLATES.map(t => discovered.has(t.id)
      ? `<div class="history-item cleared"><div class="gen">${this.icon(t.race)} ${U.esc(t.race)}</div>
          <div class="muted">採用記録あり／職種例：${U.esc(t.jobs.slice(0, 2).join("・"))}</div></div>`
      : `<div class="history-item"><div class="gen">？ 未登録の魔族</div><div class="muted">採用すると記録される</div></div>`
    ).join("");
    const synergyCatalog = SYNERGIES.map(s => discoveredSynergies.has(s.id)
      ? `<div class="history-item cleared"><div class="gen">✨ ${U.esc(s.name)}</div>
          <div class="muted">${U.esc(s.desc)}</div></div>`
      : `<div class="history-item"><div class="gen">？ 未発見のシナジー</div>
          <div class="muted">編成の組み合わせで発見できる</div></div>`
    ).join("");
    const achievementResults = ACHIEVEMENTS.map(a => ({ a, achieved: !!a.check(list) }));
    const achievementCount = achievementResults.filter(x => x.achieved).length;
    const achievements = achievementResults.map(({ a, achieved }) => `
      <div class="history-item ${achieved ? "cleared" : ""}">
        <div class="gen">${achieved ? "🏆" : "⬜"} ${U.esc(a.name)}</div>
        <div class="muted">${U.esc(a.desc)}</div>
      </div>`).join("");
    const items = list.slice().reverse().map(r => `
      <div class="history-item ${r.cleared ? "cleared" : ""}">
        <div class="gen">第${r.gen}代魔王軍 ${r.cleared ? "👑 人間界制圧" : ""}</div>
        ${this.recordHighlights(r)}
        <dl>
          <dt>在位</dt><dd>${r.reignYears}年</dd>
          <dt>魔王</dt><dd>${U.esc(r.demonKingName || "若き魔王")}</dd>
          <dt>最大戦力</dt><dd>${r.maxPower}</dd>
          <dt>最大兵員数</dt><dd>${r.maxArmySize || (r.finalRoster || []).length}体</dd>
          <dt>歴代将軍</dt><dd>${(r.generalsMade || []).map(g => U.esc(g.name)).join("、") || "なし"}</dd>
          <dt>殿堂入り</dt><dd>${r.hallOfFame ? `${U.esc(r.hallOfFame.name)}（戦功 ${r.hallOfFame.merit || 0}）` : "なし"}</dd>
          <dt>戦場の不祥事</dt><dd>${r.battleIncidentTotal || 0}件</dd>
          <dt>給与方針</dt><dd>${U.esc(this.payrollHistory(r))}</dd>
          <dt>最終施設</dt><dd>Lv.${r.facilityLevel || 0}</dd>
          <dt>勝利数</dt><dd>${r.battlesWon || 0}戦</dd>
          <dt>王国攻略</dt><dd>${r.conquest || 0}/${Game.MAX_CONQUEST}</dd>
          <dt>主力種族</dt><dd>${U.esc(r.mainRace)}</dd>
          <dt>到達地域</dt><dd>${U.esc(r.region)}</dd>
          <dt>死因</dt><dd>${U.esc(r.cause)}</dd>
          ${r.retriesUsed ? `<dt>再起</dt><dd>${r.retriesUsed}回</dd>` : ""}
          ${r.fallenTotal ? `<dt>戦没者</dt><dd>${r.fallenTotal}名</dd>` : ""}
        </dl>
      </div>`).join("");
    this.set(`<div class="panel">
        <h2>📖 魔界史</h2>
        <div class="muted">これまでに滅んだ（あるいは君臨した）魔王軍の記録。</div>
      </div>
      <div class="panel">
        <h2>📚 魔物採用図鑑 ${discovered.size}/${MONSTER_TEMPLATES.length}</h2>
        <div class="muted">過去の魔王軍で一度でも採用した種族だけが登録される。</div>
        <div class="history-list">${catalog}</div>
      </div>
      <div class="panel">
        <h2>✨ シナジー図鑑 ${discoveredSynergies.size}/${SYNERGIES.length}</h2>
        <div class="muted">実戦で一度でも発動させた組み合わせだけが登録される。</div>
        <div class="history-list">${synergyCatalog}</div>
      </div>
      <div class="panel">
        <h2>🏆 魔王実績 ${achievementCount}/${ACHIEVEMENTS.length}</h2>
        <div class="muted">能力ボーナスはない。次の魔王軍で狙う、別の滅び方と勝ち方の目標。</div>
        <div class="history-list">${achievements}</div>
      </div>
      ${items || `<div class="panel muted">まだ何の記録もない。歴史はこれから始まる。</div>`}
      <div class="spacer"></div>
      <button class="wide" data-action="title">タイトルへ戻る</button>`);
  }
};
