// 画面描画。状態は Game.state を読むだけで、UIは状態を持たない（描画関数は毎回作り直す）。
const UI = {
  root: null,

  RACE_ICON: {
    "ゴブリン": "👺", "オーク": "🐗", "スライム": "🟢", "コボルト": "🐕",
    "骸骨兵": "💀", "ゾンビ": "🧟", "魔法使い": "🔥", "死霊術師": "🪄",
    "インプ": "😈", "オーガ": "👹", "キングスライム": "👑"
  },
  icon(race) { return this.RACE_ICON[race] || "❓"; },

  MORMO_DIR: "assets/mormo/",

  mormo(expression, text, title) {
    const safeExpression = ["panic", "worried", "welcome", "report", "angry", "joy"].includes(expression)
      ? expression : "report";
    return `<aside class="mormo-guide mormo-${safeExpression}">
      <img src="${this.MORMO_DIR}${safeExpression}.webp" alt="宰相モルモ">
      <div class="mormo-bubble">
        <div class="mormo-name">${U.esc(title || "宰相モルモ")}</div>
        <div>${U.esc(text)}</div>
      </div>
    </aside>`;
  },

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
    return `<div class="hud">
      <span>第 <b>${st.generation}</b> 代魔王軍</span>
      <span>作戦 <b>${st.turn}</b></span>
      <span>王国攻略 <b>${st.conquest} / ${Game.MAX_CONQUEST}</b></span>
      <span>警戒度 <b>${st.alert}</b></span>
      <span class="gold">所持金 <b>${st.gold}G</b></span>
      <span class="food">食料 <b>${st.food}</b></span>
      <span class="materials">建材 <b>${st.materials}</b></span>
      <span>施設 <b>Lv.${st.facilityLevel}</b></span>
      <span>給与・手当 <b>${salary}G</b>/戦</span>
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

  monsterCard(m, opts) {
    opts = opts || {};
    const unpaid = m.unpaid ? `<span class="unpaid">給与未払い</span>` : "";
    const rank = Game.rankOf(m);
    const nextRank = Game.nextRank(m);
    const merit = m.merit || 0;
    const meritText = nextRank ? `戦功 ${merit}/${nextRank.threshold}` : `戦功 ${merit}・最高位`;
    return `<div class="card">
      <div class="card-head">
        ${this.avatarHtml(m, opts.resume ? "photo" : "")}
        <div>
          <div class="card-name">${U.esc(m.name)} <span class="rank-badge rank-${U.esc(rank.id)}">${U.esc(rank.name)}</span></div>
          <div class="card-job">${U.esc(m.race)} / ${U.esc(m.job)}</div>
        </div>
        ${opts.badge ? `<span class="pos-badge">${U.esc(opts.badge)}</span>` : ""}
      </div>
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
      <div class="traits">${this.traitHtml(m.traits)}</div>
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
      const fell = c.survived === false;
      if (fell) badges.push(`<span class="contrib-badge dead">💀戦死</span>`);
      else if (c.died) badges.push(`<span class="contrib-badge revived">✨生還</span>`);
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
    const foodNeed = st.roster.length ? Math.max(1, Math.ceil(st.roster.length / DEPARTMENT_RULES.foodPerRoster)) : 0;
    return `<div class="department-overview">
      <div><b>⚔ ${combat}</b><span>戦闘所属</span></div>
      <div><b>🔨 ${builders}</b><span>建設所属</span></div>
      <div><b>🍲 ${life}</b><span>生活所属</span></div>
      <div><b>${U.esc(facility.name)}</b><span>HP+${Math.round((facility.hpMult - 1) * 100)}% / 防御+${facility.defBonus}</span></div>
      <div><b>食料消費 ${foodNeed}</b><span>生活1名につき食料+${DEPARTMENTS.life.foodProduction}</span></div>
      <div><b>${U.esc(buildText)}</b><span>建設1名につき建材投入+${DEPARTMENTS.construction.materialUse}</span></div>
    </div>`;
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

  synergyPanel(roster) {
    const act = Synergy.active(roster);
    if (act.length === 0) {
      return `<div class="panel"><h3>発動中のシナジー</h3>
        <div class="muted">まだ何も発動していない。種族、頭数、給与額の組み合わせで何かが起きるかもしれない……</div></div>`;
    }
    return `<div class="panel"><h3>発動中のシナジー</h3><div class="syn-list">${
      act.map(s => `<div class="syn"><b>${U.esc(s.name)}</b><div class="d">${U.esc(s.desc)}</div></div>`).join("")
    }</div></div>`;
  },

  enemyPreview() {
    const sd = Game.stageData();
    const mine = Game.activeRoster();
    return `<div class="panel">
      <h3>${U.esc(sd.missionTitle || "次の戦い")}：${U.esc(sd.army)}
        <span class="muted">（${U.esc(sd.region)}／報酬 ${sd.reward}G）</span></h3>
      <div class="vs">
        <div class="side"><h4>魔王軍（上が前衛）</h4><ul>${
          mine.length ? mine.map(m => `<li>${this.icon(m.race)} ${U.esc(m.name)} <span class="muted">HP${m.hp} 攻${m.atk}</span></li>`).join("")
                      : `<li class="muted">誰もいない</li>`
        }</ul></div>
        <div class="mid">VS</div>
        <div class="side"><h4>敵軍</h4><ul>${
          sd.units.map(e => `<li>🗡 ${U.esc(e.name)} <span class="muted">HP${e.hp} 攻${e.atk}</span></li>`).join("")
        }</ul></div>
      </div>
    </div>`;
  },

  // ── 画面 ────────────────────────────
  title(hasSave, history) {
    this.set(`<div class="title-screen">
      <h1>魔王ワーク</h1>
      <p class="muted">採用して、配属して、働かせろ。<br>戦場も魔王城も、人材配置がすべてだ。</p>
      ${this.mormo(hasSave ? "report" : "welcome",
        hasSave ? "おかえりなさいませ、魔王様！ 続きの作戦報告を用意してありますヨ。"
          : "魔王様、お待ちしておりました！ まずは魔王軍の設立デス！")}
      <div class="title-menu">
        <button class="primary wide" data-action="new">新規ゲーム（第${history.length + 1}代魔王）</button>
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
    const recruitMessage = st.turn === 1
      ? "本日の応募者デス！ 強さだけでなく、建設や生活の仕事も任せられそうか見てくださいネ。"
      : st.pendingVacancies
        ? "欠員募集デス……戦える方だけでなく、城と食卓を守る方も必要ですヨ。"
        : "次の応募者をお連れしました。今の部門配属に足りない人材を考えましょう！";
    const cards = st.applicants.map((m, i) => this.monsterCard(m, {
      resume: true,
      footer: `<button class="primary wide" data-action="hire" data-index="${i}" ${full ? "disabled" : ""}>
        ${full ? "軍団が満員（誰かを解雇せよ）" : `採用する（給与 ${m.salary}G）`}</button>`
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
      ${this.mormo(st.roster.length ? "report" : "welcome", recruitMessage)}
      <div class="panel">
        <h2>📜 応募者面接 <span class="muted">（残り採用枠 ${st.hiresLeft}）</span></h2>
        <div class="muted">${
          st.turn === 1 && st.hiresLeft > 1 ? `軍団の設立だ。${st.hiresLeft}名まで採用できる。`
          : st.hiresLeft > 1 ? `先の戦いで欠員が出た。${st.hiresLeft}名まで補充できる。`
          : st.hiresLeft === 0 ? "今回の採用は終了。軍団を確認したら作戦会議へ戻れ。"
          : "3名が魔王軍への入隊を希望している。採用できるのは1名だけだ。"}</div>
      </div>
      <div class="cards">${cards}</div>
      <div class="spacer"></div>
      <div class="row">
        <button data-action="reroll" ${Game.canReroll() ? "" : "disabled"}>
          📢 求人を出し直す（広告費 ${Game.rerollCost()}G）</button>
        <button data-action="skip" ${st.roster.length === 0 ? "disabled" : ""}>誰も採用しない（面接を打ち切る）</button>
        <button data-action="toformation" ${st.roster.length === 0 ? "disabled" : ""}>作戦会議へ進む</button>
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
    const cards = offers.map((m, i) => {
      const net = m.reward - salary;
      const consequence = m.missionKind === "invade"
        ? `王国攻略 +${m.conquestDelta}`
        : m.missionKind === "suppress"
          ? `生存者の忠誠 +${m.loyaltyDelta}`
          : "軍資金を優先";
      return `<div class="mission-card mission-${U.esc(m.missionKind)}">
        <div class="mission-kind">${m.missionKind === "raid" ? "🔥" : m.missionKind === "suppress" ? "⚖" : "🏰"}
          危険度 ${U.esc(m.difficulty)}</div>
        <h3>${U.esc(m.missionTitle)}</h3>
        <div class="mission-army">${U.esc(m.army)} <span class="muted">— ${U.esc(m.region)}</span></div>
        <p>${U.esc(m.description)}</p>
        <dl class="mission-economy">
          <dt>勝利報酬</dt><dd class="gold">${m.reward}G</dd>
          <dt>食料</dt><dd class="food">+${m.foodReward || 0}</dd>
          <dt>建材</dt><dd class="materials">+${m.materialReward || 0}</dd>
          <dt>給与・手当</dt><dd>${salary}G</dd>
          <dt>差引見込</dt><dd class="${net >= 0 ? "positive" : "negative"}">${net >= 0 ? "+" : ""}${net}G</dd>
          <dt>作戦結果</dt><dd>${U.esc(consequence)}</dd>
          <dt>警戒度</dt><dd>+${m.alertDelta}</dd>
          <dt>軍勢警戒</dt><dd>${m.armyPressure ? `敵能力 +${m.armyPressure}%` : "なし"}</dd>
        </dl>
        <button class="primary wide" data-action="missionpick" data-index="${i}">この作戦を選ぶ</button>
      </div>`;
    }).join("");
    const lowFood = st.food <= Math.max(1, Math.ceil(st.roster.length / DEPARTMENT_RULES.foodPerRoster));
    this.set(`${this.hud()}
      ${this.mormo(lowFood ? "worried" : "report", lowFood
        ? "食料が心細いですネ……略奪か生活部門への配属を考えた方がよさそうデス。"
        : "作戦ごとにG・食料・建材の取り分が違います。今の部門編成と相談してくださいネ。")}
      <div class="panel">
        <h2>🗺 作戦会議</h2>
        <div class="muted">次に何をするか選べ。寄り道すれば軍を養えるが、警戒度が上がるほど以後の敵も強くなる。</div>
      </div>
      <div class="panel"><h3>現在の部門と施設</h3>${this.departmentSummary()}</div>
      <div class="mission-grid">${cards}</div>
      <div class="spacer"></div>
      <button class="wide ghost" data-action="backrecruit">← 面接・軍団確認へ戻る</button>`);
  },

  formation() {
    const st = Game.state;
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
    const foodNeed = st.roster.length ? Math.max(1, Math.ceil(st.roster.length / DEPARTMENT_RULES.foodPerRoster)) : 0;
    const hasOnlyCombat = st.roster.length >= 3 && builders.length === 0 && lifeWorkers.length === 0;
    const adviceExpression = empty ? "panic" : (hasOnlyCombat || st.food <= foodNeed ? "worried" : "report");
    const advice = empty
      ? "魔王様ぁ！ 戦闘部門の出撃隊が空デス！ 最低1名は出撃させてください！"
      : hasOnlyCombat
        ? "全員戦闘配属ですネ。目先は強いですが、食料も施設も育ちませんヨ……。"
        : st.food <= foodNeed
          ? "次の勤務後に食料不足の恐れがあります。生活部門へ回すか、食料の多い作戦を選びましょう。"
          : "誰を戦わせ、誰に城と暮らしを任せるか――ここが魔王様の人事デス！";
    this.set(`${this.hud()}
      ${this.mormo(adviceExpression, advice)}
      <div class="panel">
        <h2>🏢 部門編成 <span class="muted">— ${U.esc(st.selectedMission && st.selectedMission.missionTitle || "作戦未選択")}</span></h2>
        <div class="muted">戦闘は最大5体。建設・生活は戦場に出ない代わりに、勝利後の資源循環を担当する。部門手当は希望給与の半額。</div>
        ${this.departmentSummary()}
      </div>
      ${empty ? `<div class="panel"><b style="color:var(--red)">出撃隊が空だ。</b> 戦闘部門から最低1体を選べ。</div>` : ""}
      <div class="army-section department-section department-combat-section"><h3>⚔ 戦闘部門・出撃隊 ${active.length}/${Game.MAX_DEPLOY}</h3><div class="cards">${activeCards}</div></div>
      <div class="army-section reserve-section"><h3>⚔ 戦闘部門・控え ${reserves.length}</h3>
        <div class="cards">${reserveCards || `<div class="muted">戦闘部門の控えはいない</div>`}</div></div>
      <div class="army-section department-section department-construction-section"><h3>🔨 建設・施設部門 ${builders.length}</h3>
        <div class="muted department-help">勝利後、1名につき備蓄建材を${DEPARTMENTS.construction.materialUse}投入。施設効果は次の出撃隊全員に付く。</div>
        <div class="cards">${builderCards || `<div class="department-empty">建材はあっても、働く者がいなければ城は育たない。</div>`}</div></div>
      <div class="army-section department-section department-life-section"><h3>🍲 食料・生活部門 ${lifeWorkers.length}</h3>
        <div class="muted department-help">勝利後、1名につき食料を${DEPARTMENTS.life.foodProduction}調達。食事が足りれば軍団全員の忠誠も少し上がる。</div>
        <div class="cards">${lifeCards || `<div class="department-empty">現在は自炊。食料が尽きれば全員の忠誠が下がる。</div>`}</div></div>
      <div class="spacer"></div>
      ${this.synergyPanel(active)}
      ${this.enemyPreview()}
      <button class="wide ghost" data-action="backmission">← 作戦会議へ戻る</button>
      <div class="spacer"></div>
      <button class="primary wide" data-action="deploy" ${empty ? "disabled" : ""}>出撃する</button>
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
    const report = st.lastDepartmentReport || {};
    const mormoExpression = report.foodShortage ? "panic"
      : report.facilityAfter > report.facilityBefore ? "joy" : "report";
    const mormoText = report.foodShortage
      ? `魔王様ぁ！ 食料が${report.foodShortage}足りません！ このままでは皆の忠誠が危険デス！`
      : report.facilityAfter > report.facilityBefore
        ? `施設が完成しました！ ${Game.facilityInfo().name}デス！ 次の出撃隊が少し頑丈になりますヨ！`
        : `各部門の勤務報告デス。食料${st.food}、建材${st.materials}、施設Lv.${st.facilityLevel}になりました。`;
    this.set(`${this.hud()}
      ${this.mormo(mormoExpression, mormoText, "宰相モルモ・勤務報告")}
      <div class="banner win">
        <h2>勝利！</h2>
        <div>${U.esc(b.army)} を撃退した</div>
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>
      ${b.synergies.length ? `<div class="panel"><h3>この戦いで働いたシナジー</h3><div class="syn-list">${
        b.synergies.map(n => `<div class="syn"><b>${U.esc(n)}</b></div>`).join("")}</div></div>` : ""}
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
    return this.set(`${this.mormo("panic", "うわああああ！ 魔王様ぁ！ まだ再起できます、採用と配属を見直しましょう！")}
      <div class="banner lose">
        <h2>魔王軍、壊滅</h2>
        <div>${U.esc(b.army)} に敗北した</div>
      </div>
      ${this.nearMissPanel(b.nearMiss)}
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
        ${this.mormo("report", st.eventOutcome || "事件はひとまず収まりました……たぶんデス。")}
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
      ${this.mormo("angry", `魔王様、大変デス！ ${ev.title}が起きました！`)}
      <div class="panel event-panel">
        <h2>⚡ ${U.esc(ev.title)}</h2>
        <div class="event-text">${U.esc(st.pendingEvent.text)}</div>
      </div>
      <div class="event-options">${opts}</div>`);
  },

  gameover(record, history) {
    this.set(`${this.mormo(record.cleared ? "joy" : "worried", record.cleared
        ? "やりましたネ、魔王様！ この軍団の歴史はずっと覚えておきますヨ！"
        : "お疲れさまでした、魔王様……この失敗も、次の魔王軍の歴史に残しますネ。")}
      <div class="banner ${record.cleared ? "win" : "lose"}">
        <h2>${record.cleared ? "人間界を制圧した！" : "魔王軍、壊滅"}</h2>
        <div>${U.esc(record.cause)}</div>
      </div>
      <div class="panel">
        <h3>第${record.gen}代魔王軍の記録</h3>
        <dl class="history-item" style="border:none;padding:0;background:none">
          <dt>在位</dt><dd>${record.reignYears}年</dd>
          <dt>勝利数</dt><dd>${record.battlesWon}戦</dd>
          <dt>王国攻略</dt><dd>${record.conquest || 0}/${Game.MAX_CONQUEST}</dd>
          <dt>最終警戒度</dt><dd>${record.alert || 0}</dd>
          <dt>最大戦力</dt><dd>${record.maxPower}</dd>
          <dt>最大兵員数</dt><dd>${record.maxArmySize || (record.finalRoster || []).length}体</dd>
          <dt>輩出した将軍</dt><dd>${(record.generalsMade || []).map(g => U.esc(g.name)).join("、") || "なし"}</dd>
          <dt>戦場の不祥事</dt><dd>${record.battleIncidentTotal || 0}件</dd>
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
      ${this.contributionPanel(Game.state.lastBattle && Game.state.lastBattle.contribution)}
      <div class="row">
        <button class="primary" data-action="new">第${history.length + 1}代として再挑戦</button>
        <button data-action="history">魔界史を見る</button>
        <button class="ghost" data-action="title">タイトルへ</button>
      </div>`);
  },

  history(list) {
    const items = list.slice().reverse().map(r => `
      <div class="history-item ${r.cleared ? "cleared" : ""}">
        <div class="gen">第${r.gen}代魔王軍 ${r.cleared ? "👑 人間界制圧" : ""}</div>
        <dl>
          <dt>在位</dt><dd>${r.reignYears}年</dd>
          <dt>最大戦力</dt><dd>${r.maxPower}</dd>
          <dt>最大兵員数</dt><dd>${r.maxArmySize || (r.finalRoster || []).length}体</dd>
          <dt>歴代将軍</dt><dd>${(r.generalsMade || []).map(g => U.esc(g.name)).join("、") || "なし"}</dd>
          <dt>戦場の不祥事</dt><dd>${r.battleIncidentTotal || 0}件</dd>
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
      ${items || `<div class="panel muted">まだ何の記録もない。歴史はこれから始まる。</div>`}
      <div class="spacer"></div>
      <button class="wide" data-action="title">タイトルへ戻る</button>`);
  }
};
