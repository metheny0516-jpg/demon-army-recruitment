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
      handler(el.dataset.action, el.dataset);
    });
  },

  // ── 部品 ────────────────────────────
  hud() {
    const st = Game.state;
    const sd = ENEMY_STAGES[Math.min(st.stage, ENEMY_STAGES.length) - 1];
    const salary = st.roster.reduce((s, m) => s + m.salary, 0);
    return `<div class="hud">
      <span>第 <b>${st.generation}</b> 代魔王軍</span>
      <span>戦い <b>${Math.min(st.stage, ENEMY_STAGES.length)} / ${ENEMY_STAGES.length}</b></span>
      <span class="gold">所持金 <b>${st.gold}G</b></span>
      <span>給与総額 <b>${salary}G</b>/戦</span>
      <span>部隊 <b>${st.roster.length}/5</b></span>
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
    return `<div class="card">
      <div class="card-head">
        ${this.avatarHtml(m, opts.resume ? "photo" : "")}
        <div>
          <div class="card-name">${U.esc(m.name)}</div>
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
        ${unpaid}
      </div>
      <div class="traits">${this.traitHtml(m.traits)}</div>
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
      if (c.died) badges.push(`<span class="contrib-badge dead">💀戦死</span>`);
      const ratio = c.dealt / maxDealt;
      return `<div class="contrib-row ${c.died ? "died" : ""}">
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
    const mine = Game.state.roster;
    return `<div class="panel">
      <h3>次の敵：${U.esc(sd.army)} <span class="muted">（${U.esc(sd.region)}／報酬 ${sd.reward}G）</span></h3>
      <div class="vs">
        <div class="side"><h4>魔王軍（上が前衛）</h4><ul>${
          mine.length ? mine.map(m => `<li>${this.icon(m.race)} ${U.esc(m.name)} <span class="muted">HP${m.hp} 攻${m.atk}</span></li>`).join("")
                      : `<li class="muted">誰もいない</li>`
        }</ul></div>
        <div class="mid">VS</div>
        <div class="side"><h4>勇者軍</h4><ul>${
          sd.units.map(e => `<li>🗡 ${U.esc(e.name)} <span class="muted">HP${e.hp} 攻${e.atk}</span></li>`).join("")
        }</ul></div>
      </div>
    </div>`;
  },

  // ── 画面 ────────────────────────────
  title(hasSave, history) {
    this.set(`<div class="title-screen">
      <h1>魔王採用試験</h1>
      <p class="muted">お前は魔王だ。自分では戦わない。<br>面接して、採用して、部下に戦わせろ。</p>
      <div class="title-menu">
        <button class="primary wide" data-action="new">新規ゲーム（第${history.length + 1}代魔王）</button>
        ${hasSave ? `<button class="wide" data-action="continue">続きから</button>` : ""}
        <button class="wide ghost" data-action="history">魔界史（${history.length}代の記録）</button>
      </div>
      <div class="spacer"></div>
      <p class="muted">部隊は最大5体。勝てば報酬、しかし毎戦の給与支払いが待っている。<br>敗北すれば軍団は消滅し、歴史だけが残る。</p>
    </div>`);
  },

  recruit() {
    const st = Game.state;
    const full = !Game.canHire();
    const cards = st.applicants.map((m, i) => this.monsterCard(m, {
      resume: true,
      footer: `<button class="primary wide" data-action="hire" data-index="${i}" ${full ? "disabled" : ""}>
        ${full ? "部隊が満員（誰かを解雇せよ）" : `採用する（給与 ${m.salary}G）`}</button>`
    })).join("");
    // 満員でも応募者を逃さず入れ替えられるよう、この画面から解雇できるようにする
    const rosterPanel = st.roster.length ? `<div class="panel">
      <h3>現在の部隊 <span class="muted">（${st.roster.length}/5）</span></h3>
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
        <div class="muted">${st.hiresLeft > 1
          ? `軍団の設立だ。${st.hiresLeft}名まで採用できる。`
          : "3名が魔王軍への入隊を希望している。採用できるのは1名だけだ。"}</div>
      </div>
      <div class="cards">${cards}</div>
      <div class="spacer"></div>
      <div class="row">
        <button data-action="reroll" ${Game.canReroll() ? "" : "disabled"}>
          📢 求人を出し直す（広告費 ${Game.rerollCost()}G）</button>
        <button data-action="skip" ${st.roster.length === 0 ? "disabled" : ""}>誰も採用しない（面接を打ち切る）</button>
        <button data-action="toformation" ${st.roster.length === 0 ? "disabled" : ""}>部隊編成へ進む</button>
        ${st.roster.length === 0 ? `<span class="muted">部隊が空では出撃できない。まず1体は採用せよ。</span>` : ""}
      </div>
      <div class="spacer"></div>
      ${rosterPanel}
      ${this.synergyPanel(st.roster)}`);
  },

  formation() {
    const st = Game.state;
    const cards = st.roster.map((m, i) => this.monsterCard(m, {
      badge: i === 0 ? "最前列（狙われやすい）" : `${i + 1}番目`,
      // 解雇は取り消せない操作なので、並び替えボタンとは反対の端に離して置く
      footer: `<div class="card-actions">
        <div class="row tight">
          <button class="small" data-action="up" data-index="${i}" ${i === 0 ? "disabled" : ""}>▲ 前へ</button>
          <button class="small" data-action="down" data-index="${i}" ${i === st.roster.length - 1 ? "disabled" : ""}>▼ 後ろへ</button>
        </div>
        <button class="small danger" data-action="fire" data-uid="${m.uid}">解雇</button>
      </div>`
    })).join("");
    const empty = st.roster.length === 0;
    this.set(`${this.hud()}
      <div class="panel">
        <h2>⚔ 部隊編成</h2>
        <div class="muted">並び順が配置。上にいるほど敵に狙われやすい。壁役を前に、魔法使いを後ろに。</div>
      </div>
      ${empty ? `<div class="panel"><b style="color:var(--red)">部隊が空だ。</b> このまま出撃すれば即敗北する。</div>` : ""}
      <div class="cards">${cards}</div>
      <div class="spacer"></div>
      ${this.synergyPanel(st.roster)}
      ${this.enemyPreview()}
      <button class="primary wide" data-action="deploy" ${empty ? "disabled" : ""}>出撃する</button>
      ${empty ? `<div class="spacer"></div><button class="wide ghost" data-action="title">タイトルへ戻る</button>` : ""}`);
  },

  battle(result, stageData) {
    // 描画はレンダラに委譲する。UIは戦闘の中身を知らない。
    this.set(BattleScene.shell(stageData));
    BattleScene.play(result.timeline);
  },

  result() {
    const st = Game.state;
    const b = st.lastBattle;
    this.set(`${this.hud()}
      <div class="banner win">
        <h2>勝利！</h2>
        <div>${U.esc(b.army)} を撃退した</div>
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>
      ${b.synergies.length ? `<div class="panel"><h3>この戦いで働いたシナジー</h3><div class="syn-list">${
        b.synergies.map(n => `<div class="syn"><b>${U.esc(n)}</b></div>`).join("")}</div></div>` : ""}
      ${this.contributionPanel(b.contribution)}
      <div class="panel">
        <h3>現在の部隊</h3>
        <div class="cards">${st.roster.map(m => this.monsterCard(m)).join("") || `<div class="muted">誰も残っていない……</div>`}</div>
      </div>
      <button class="primary wide" data-action="nextrecruit">次の応募者を面接する</button>`);
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
      ${this.contributionPanel(b.contribution)}
      <div class="panel">
        <h3>まだ終わりではない</h3>
        <div class="muted">
          第${st.stage}戦の採用面接まで時を巻き戻せる。応募者を選び直し、並べ直せ。<br>
          ただし軍の立て直しには金がかかる：所持金 <b class="gold">${goldNow}G → ${goldAfter}G</b><br>
          この機会は<b>このランで1度きり</b>だ。
        </div>
      </div>
      <div class="row">
        <button class="primary" data-action="retry">⟲ 再起する（残り ${st.retriesLeft} 回）</button>
        <button class="danger" data-action="concede">ここで終わる（歴史に刻む）</button>
      </div>`);
  },

  gameover(record, history) {
    this.set(`<div class="banner ${record.cleared ? "win" : "lose"}">
        <h2>${record.cleared ? "人間界を制圧した！" : "魔王軍、壊滅"}</h2>
        <div>${U.esc(record.cause)}</div>
      </div>
      <div class="panel">
        <h3>第${record.gen}代魔王軍の記録</h3>
        <dl class="history-item" style="border:none;padding:0;background:none">
          <dt>在位</dt><dd>${record.reignYears}年</dd>
          <dt>勝利数</dt><dd>${record.battlesWon}戦</dd>
          <dt>最大戦力</dt><dd>${record.maxPower}</dd>
          <dt>主力種族</dt><dd>${U.esc(record.mainRace)}</dd>
          <dt>到達地域</dt><dd>${U.esc(record.region)}</dd>
          <dt>死因</dt><dd>${U.esc(record.cause)}</dd>
          ${record.retriesUsed ? `<dt>再起</dt><dd>${record.retriesUsed}回</dd>` : ""}
        </dl>
        <div class="muted">最後まで付き従った者たち：${
          record.finalRoster.length ? record.finalRoster.map(m => U.esc(m.name)).join("、") : "誰も残らなかった"}</div>
      </div>
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
          <dt>主力種族</dt><dd>${U.esc(r.mainRace)}</dd>
          <dt>到達地域</dt><dd>${U.esc(r.region)}</dd>
          <dt>死因</dt><dd>${U.esc(r.cause)}</dd>
          ${r.retriesUsed ? `<dt>再起</dt><dd>${r.retriesUsed}回</dd>` : ""}
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
