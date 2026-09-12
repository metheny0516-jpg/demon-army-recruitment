// 画面描画。状態は Game.state を読むだけで、UIは状態を持たない（描画関数は毎回作り直す）。
const UI = {
  root: null,
  recordsFrom: null,
  castleFrom: null,
  castleTab: "army",
  memberFrom: null,

  RACE_ICON: {
    "ゴブリン": "👺", "オーク": "🐗", "スライム": "🟢", "コボルト": "🐕",
    "骸骨兵": "💀", "ゾンビ": "🧟", "魔法使い": "🔥", "死霊術師": "🪄",
    "インプ": "😈", "オーガ": "👹", "キングスライム": "👑",
    "サキュバス": "💋", "ミノタウロス": "🐂", "リッチ": "☠️",
    "ハーピー": "🪶", "ミミック": "📦", "トロル": "🪨"
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

  set(html, sceneHint) {
    if (typeof BattleScene !== "undefined") BattleScene.stop();
    const scene = sceneHint || (html.includes("title-screen") ? "title"
      : html.includes('id="scene"') ? "battle"
      : html.includes("応募者面接") ? "recruit"
      : html.includes("出撃と留守番") || html.includes("部門編成") ? "formation"
      : html.includes("作戦会議") ? "mission"
      : html.includes("魔界史") ? "history"
      : "report");
    this.root.dataset.scene = scene;
    this.root.innerHTML = `<main class="game-scene game-scene-${scene}">${html}</main>`;
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
    const fb = Game.foodBalance();
    const recordsButton = ["recruit", "mission", "formation", "preparation", "result", "facility", "event"].includes(st.phase)
      ? `<button class="small hud-records" data-action="castle" data-tab="${U.esc(this.castleTab || "army")}">🏰 城</button>` : "";
    return `<div class="hud">
      <div class="hud-row hud-resources">
        <span class="gold">所持金 <b>${st.gold}G</b></span>
        <span class="food">食料 <b>${st.food}</b><small class="${fb.delta < 0 ? "food-warn" : "food-ok"}"> 調達${fb.produce} / 消費${fb.need} = ${fb.delta >= 0 ? "+" : ""}${fb.delta}</small></span>
        <span class="materials">建材 <b>${st.materials}</b></span>
      </div>
      <div class="hud-row hud-progress">
        <span class="army-level">魔王軍 <b>Lv.${Game.armyLevel()}</b></span>
        <span>王国攻略 <b>${st.conquest} / ${Game.MAX_CONQUEST}</b></span>
        <span>警戒度 <b>${st.alert}</b>${this.counterattackGauge()}</span>
        ${recordsButton}
      </div>
      <div class="hud-extra">
        <span>第 <b>${st.generation}</b> 代魔王軍</span>
        ${opening ? `<span>冒頭日程 <b>${st.day}日目 / 3日</b></span>` : ""}
        <span>作戦 <b>${st.turn}</b></span>
        <span>施設 <b>Lv.${st.facilityLevel}${Game.activeFacility() ? ` ${U.esc(Game.activeFacility().name)}` : ""}</b></span>
        <span>給与・手当 <b>${salary}G</b>/${opening ? "3日" : "戦"}</span>
        <span>軍団 <b>${st.roster.length}/${Game.MAX_ARMY}</b></span>
        <span>出撃 <b>${Game.activeRoster().length}/${Game.MAX_DEPLOY}</b></span>
        <span class="muted">${U.esc(sd.region)}</span>
        <span class="muted hud-slot">保存中：スロット ${Storage.activeSlot()}</span>
      </div>
    </div>`;
  },

  // 反撃までのゲージ。数字は出さない（警戒度の数値は既にHUDに出ている）。
  // 予約済みなら討伐隊（勇者）の到来を告げる小さな札に差し替える。
  counterattackGauge() {
    const st = Game.state;
    if (typeof COUNTERATTACK === "undefined") return "";
    if (st.counterattack && st.counterattack.pending) {
      const label = st.counterattack.kind === "hero" ? "勇者が向かっている" : "討伐隊が向かっている";
      return `<span class="counterattack-tag incoming">⚔ ${U.esc(label)}</span>`;
    }
    const threshold = COUNTERATTACK.threshold;
    const ratio = Math.max(0, Math.min(1, (st.alert || 0) / threshold));
    const near = (st.alert || 0) >= threshold - 1;
    return `<span class="counterattack-gauge${near ? " near" : ""}" title="王国の反撃までの目安">
      <span class="counterattack-gauge-fill" style="width:${Math.round(ratio * 100)}%"></span></span>`;
  },

  // 種族技（TRAITS[id].skill）が1段目・上位技のどちらかを判定する。
  // 上位技は skill.tier === 2 を自分で持つが、1段目は自分に skill を持たない（旧データのまま）。
  // だから「誰かの skill.replaces に指されているか」も見る。id をベタ書きしない。
  skillReplacedIds() {
    if (this._skillReplacedIds) return this._skillReplacedIds;
    const set = new Set();
    if (typeof TRAITS !== "undefined") {
      for (const id in TRAITS) {
        const s = TRAITS[id] && TRAITS[id].skill;
        if (s && s.replaces) set.add(s.replaces);
      }
    }
    this._skillReplacedIds = set;
    return set;
  },
  isSkillTrait(id) {
    const t = typeof TRAITS !== "undefined" ? TRAITS[id] : null;
    if (!t) return false;
    if (t.skill) return true;
    return this.skillReplacedIds().has(id);
  },

  // relicByTrait: { traitId: 遺物名 }。遺物由来の特性には「（遺物名）」を添える。
  traitHtml(ids, relicByTrait) {
    relicByTrait = relicByTrait || {};
    return ids.map(id => {
      const t = TRAITS[id];
      if (!t) return "";
      const relicName = relicByTrait[id];
      const skillMark = this.isSkillTrait(id) ? `<span class="skill-mark" title="種族技">🗡</span>` : "";
      return `<div class="trait">${skillMark}<b>${U.esc(t.name)}</b>${relicName ? `<span class="trait-relic">（${U.esc(relicName)}）</span>` : ""}：${U.esc(t.desc)}</div>`;
    }).join("");
  },

  // 面接の応募者札：まだ覚えていない上位技を「6戦で【…】」とだけ示す（数値は出さない）。
  // Game.nextSkillFor が使える環境ではそれを使い、無ければ traits から自力で引く
  // （fallback は Game.nextSkillFor と同じロジックを保つこと。二か所で仕様を分けない）。
  nextSkillNote(m) {
    if (!m || m.mercenary) return "";
    // 種族の伝承：軍団が既に知っている技は、採用すれば覚えた状態で来る
    const lore = typeof Game !== "undefined" && typeof Game.loreSkillFor === "function" ? Game.loreSkillFor(m) : null;
    if (lore) return `<div class="next-skill lore-skill">📜 軍団の伝承：採用すれば【${U.esc(lore.name)}】を覚えて来る</div>`;
    let skill = null;
    if (typeof Game !== "undefined" && typeof Game.nextSkillFor === "function") {
      skill = Game.nextSkillFor(m);
    } else if (typeof TRAITS !== "undefined") {
      const traits = m.traits || [];
      const alreadyTier2 = traits.some(id => TRAITS[id] && TRAITS[id].skill && TRAITS[id].skill.tier === 2);
      if (!alreadyTier2) {
        for (const id of traits) {
          const found = Object.keys(TRAITS).find(key => {
            const s = TRAITS[key].skill;
            return s && s.tier === 2 && s.replaces === id;
          });
          if (found) { skill = TRAITS[found]; break; }
        }
      }
    }
    // 種族技（誰でも3戦で覚える）と、上位技（8戦。裏方は倍かかる）を1行ずつ。
    // 戦闘数は Game に聞く（遅咲きの倍率もそこで決まる。二か所で数えない）。
    const rules = typeof Game !== "undefined" && Game.skillRules ? Game.skillRules()
      : { speciesUnlockBattles: 3, unlockBattles: 8 };
    const need = key => (typeof Game !== "undefined" && Game.unlockBattlesFor)
      ? Game.unlockBattlesFor(m, key)
      : (key === "species" ? rules.speciesUnlockBattles : rules.unlockBattles);
    const species = typeof Game !== "undefined" && Game.speciesSkillFor ? Game.speciesSkillFor(m) : null;
    const lines = [];
    if (species) lines.push(`<div class="skill-hint">✨ ${need("species")}戦で技【${U.esc(species.name)}】</div>`);
    if (skill) lines.push(`<div class="skill-hint">🗡 ${need("order")}戦で【${U.esc(skill.name)}】</div>`);
    // 遅咲き（裏方の職）。何が起きるかは言わない。「隠している」ことだけ伝える。
    if (typeof Game !== "undefined" && Game.isLateBloomer && Game.isLateBloomer(m)) {
      lines.push(`<div class="skill-hint late-bloomer">？？？（この者は何かを隠している）</div>`);
    }
    return lines.join("");
  },

  // 名簿の戦歴。0戦の者（応募直後）には出さない。伸び幅は出さない（伸びた後の値だけ）。
  recordNote(m) {
    const r = m && m.record;
    if (!r || !r.battles) return "";
    return `<div class="record-note">戦歴 ${r.battles}戦${r.wins || 0}勝</div>`;
  },

  // その者が持つ遺物一覧（蔵にある品ではなく、いま所持している品）。
  memberRelics(m) {
    const ids = (m.relicIds && m.relicIds.length) ? m.relicIds : (m.relicId ? [m.relicId] : []);
    return ids.map(id => Game.relicOf(id)).filter(Boolean);
  },

  relicByTraitOf(m) {
    const map = {};
    for (const r of this.memberRelics(m)) map[r.traitId] = r.name;
    return map;
  },

  // 遺物を持った縁の者だけ、職名の後ろへ「表示だけ」の二代目を添える（job 自体は変えない）。
  secondGenLabel(m) {
    if (!m.bond) return "";
    const has = this.memberRelics(m).some(r => r.from && r.from.name === m.bond.name);
    return has ? `（二代目${U.esc(m.bond.name)}）` : "";
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
    const facility = Game.activeFacility();
    const active = Game.activeRoster();
    const builders = Game.departmentRoster("home");
    const appetiteByUid = {};
    for (const unit of active.concat(m)) appetiteByUid[unit.uid] = Aptitude.of(unit).appetite;
    const activeAccountant = active.some(unit => (unit.job || "").includes("会計"));
    const candidateAccountant = (m.job || "").includes("会計");
    const graveyardWorker = builders.some(unit => unit.tplId === "necromancer");
    const candidateNecromancer = m.tplId === "necromancer";
    const rows = Synergy.connections(m, Game.state.roster, facility ? [facility] : [], {
      activeUids: Game.state.activeUids,
      maxDeploy: Game.MAX_DEPLOY,
      foodAvailableFor: units => {
        const kitchenExtra = facility && facility.id === "grand_kitchen" ? 1 : 0;
        const need = Game.foodNeedFor(units) + kitchenExtra;
        return Math.min(Math.max(0, Game.state.food || 0), need) > 0;
      },
      appetiteByUid,
      facilityNeeds: facility ? {
        extortion_ledger: activeAccountant ? [] : [candidateAccountant ? "応募者を会計職として出撃" : "会計職を出撃"],
        grand_kitchen: Math.max(0, Game.state.food || 0) > 0 ? [] : ["戦闘糧食が必要"],
        graveyard: graveyardWorker ? [] : [candidateNecromancer ? "応募者を建設部門へ配属" : "死霊術師を建設部門へ配属"]
      } : {}
    });
    if (!rows.length) return `<div class="applicant-links muted">現在の軍団との直接接続はまだない</div>`;
    const rowHtml = row => {
      const signal = row.origin.ability === "追い剥ぎ" && row.signal === "金貨獲得"
        ? "1Gを略奪予約" : row.signal;
      return `<div class="applicant-link-row">
      <span><small>起点</small>${U.esc(row.origin.name)}の《${U.esc(row.origin.ability)}》</span>
      <i>→ ${U.esc(signal)} →</i>
      <span><small>反応</small>${U.esc(row.responder.name)}の${row.responder.type === "synergy" ? "" : "《"}${U.esc(row.responder.ability)}${row.responder.type === "synergy" ? "" : "》"}</span>
      <strong>必要：${row.needs.map(U.esc).join("・")}</strong>
    </div>`;
    };
    return `<div class="applicant-links"><b>🔗 今の軍団との接続</b>
      ${rowHtml(rows[0])}
      ${rows.length > 1 ? `<details><summary>ほか${rows.length - 1}件の接続候補</summary>${rows.slice(1).map(rowHtml).join("")}</details>` : ""}
    </div>`;
  },

  monsterCard(m, opts) {
    opts = opts || {};
    const unpaid = m.unpaid ? `<span class="unpaid">給与未払い</span>` : "";
    // 撤退で担いで帰った者。次の1戦だけ出撃できない（留守番としては働ける）
    const injured = m.injured > 0 ? `<span class="injured">🩹 負傷（次の戦いまで）</span>` : "";
    const rank = Game.rankOf(m);
    const nextRank = Game.nextRank(m);
    const merit = m.merit || 0;
    const meritText = nextRank ? `戦功 ${merit}/${nextRank.threshold}` : `戦功 ${merit}・最高位`;
    const legacy = m.legacy
      ? `<div class="general-ability">📜 第${m.legacy.generation}代・殿堂入り人材の再応募（戦功と階級は新任扱い）</div>`
      : "";
    const relicByTrait = this.relicByTraitOf(m);
    const relics = this.memberRelics(m);
    const relicChips = relics.length
      ? `<div class="relic-chips">${relics.map(r => `<span class="relic-chip">🏺 ${U.esc(r.name)}</span>`).join("")}</div>` : "";
    // 面接の札だけの印（採用前の応募者）：縁の印と、持って来た遺物
    const bondNote = (opts.resume && m.bond) ? `<div class="bond-note">🕯 ${U.esc(m.bond.name)}の縁</div>` : "";
    const broughtRelic = (opts.resume && m.relicId) ? Game.relicOf(m.relicId) : null;
    const broughtNote = broughtRelic ? `<div class="bond-note">🏺 ${U.esc(broughtRelic.name)}を持って来た</div>` : "";
    // 叩き上げ：終盤に来た低ティア。数字ではなく「生き延びてきた顔」として見せる。
    const veteranNote = (opts.resume && m.veteran)
      ? `<div class="bond-note veteran-note">🎖 歴戦</div>` : "";
    const secondGen = this.secondGenLabel(m);
    // 気合（号令の限定）。応募者の札には出さない（採用時に 1 で入る）。
    const spiritRules = Game.spiritRules ? Game.spiritRules() : { max: 3 };
    const spiritValue = typeof m.spirit === "number" ? m.spirit : null;
    const spirit = (!opts.resume && spiritValue !== null && (m.traits || []).some(id => (TRAITS[id] || {}).order))
      ? `<span class="spirit" title="号令に使う。出撃で+1、留守番で+2">気合 ${"●".repeat(spiritValue)}${"○".repeat(Math.max(0, spiritRules.max - spiritValue))}</span>` : "";
    return `<div class="card">
      <div class="card-head">
        ${this.avatarHtml(m, opts.resume ? "photo" : "")}
        <div class="card-identity">
          <div class="card-name">${U.esc(m.name)} <span class="rank-badge rank-${U.esc(rank.id)}">${U.esc(rank.name)}</span></div>
          <div class="card-job">${U.esc(m.race)} / ${U.esc(m.job)}${secondGen ? ` <span class="second-gen">${secondGen}</span>` : ""}</div>
        </div>
        ${opts.badge ? `<span class="pos-badge">${U.esc(opts.badge)}</span>` : ""}
      </div>
      ${veteranNote}${bondNote}${broughtNote}
      ${legacy}
      ${opts.resume ? `<div class="traits">${this.traitHtml(m.traits, relicByTrait)}</div>
        ${this.nextSkillNote(m)}
        ${this.applicantConnections(m)}
        ${opts.footer || ""}
        ${this.resumeHtml(m)}` : ""}
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
        ${injured}
        ${spirit}
      </div>
      ${opts.resume ? "" : this.recordNote(m)}
      ${opts.resume ? "" : relicChips}
      ${this.aptitudeHtml(m)}
      ${opts.resume ? "" : `<div class="traits">${this.traitHtml(m.traits, relicByTrait)}</div>`}
      ${rank.id === "general" ? `<div class="general-ability">⚔ 将軍の号令：出撃中、味方全員の与ダメージ+15%</div>` : ""}
      ${m.quote ? `<div class="quote">「${U.esc(m.quote)}」</div>` : ""}
      ${opts.resume ? "" : (opts.footer || "")}
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
    if (apt.food > 0) chips.push(`<span class="apt apt-food">🍲 調達 食料+${apt.food}</span>`);
    if (apt.material > 0) chips.push(`<span class="apt apt-material">🔨 施工+${apt.material}</span>`);
    if (apt.wage > 0) chips.push(`<span class="apt apt-wage">💰 給与-${apt.wage}%</span>`);
    if (apt.recruit > 0) chips.push(`<span class="apt apt-recruit">📋 応募+${apt.recruit}</span>`);
    // 調達は食料そのもの、食う量は「口」。3口で食料1を食うので、単位を書かないと読めない。
    chips.push(apt.appetite > 0
      ? `<span class="apt apt-appetite">🍖 食う量 ${apt.appetite}口<small>（3口＝食料1）</small></span>`
      : `<span class="apt apt-appetite none">🍖 食事不要</span>`);
    const note = apt.labels.length ? `<span class="apt-note">${U.esc(apt.labels.join("・"))}</span>` : "";
    return `<div class="aptitudes">${chips.join("")}${note}</div>`;
  },

  departmentTag(m) {
    const department = Game.departmentOf(m);
    return `<span class="department-tag department-${department.id}">${department.icon} ${U.esc(department.shortName)}</span>`;
  },

  // 出撃隊⇄留守番の往復ボタン。出撃枠が埋まっていれば「出撃隊へ」は押せない。
  departmentButtons(m, current) {
    const full = Game.state.activeUids.length >= Game.MAX_DEPLOY;
    return DEPARTMENT_ORDER.filter(id => id !== current).map(id => {
      const department = DEPARTMENTS[id];
      const disabled = id === "combat" && (full || m.injured > 0) ? " disabled" : "";
      return `<button class="small department-button" data-action="assigndepartment"${disabled}
        data-uid="${m.uid}" data-department="${id}">${department.icon} ${U.esc(department.name)}へ</button>`;
    }).join("");
  },

  // 留守番の札に「城で何をしているか」を一行で出す。置いた結果が目に見えないと迷う（オーナー方針）。
  homeWork(m) {
    const c = Aptitude.contribution(m, "home");
    const parts = [];
    if (c.food) parts.push(`🍲 食料+${c.food}`);
    if (c.material) parts.push(`🔨 建材+${c.material}`);
    if (c.wage) parts.push(`📒 給与-${c.wage}%`);
    if (c.recruit) parts.push(`📋 応募+${c.recruit}`);
    const traits = m.traits || [];
    if (traits.includes("tinkerer")) parts.push("🛢 樽で何か寝かせている");
    if (m.tplId === "necromancer" && Game.state.activeFacilityId === "graveyard") parts.push("🪦 墓地を守る");
    return parts.length ? parts.map(U.esc).join("　") : "手持ち無沙汰";
  },

  RELIC_CAUSE_JA: { fallen: "戦死", fired: "解雇", deserted: "逃亡", retired: "引退" },

  // 「これまでに何人去ったか」を面接画面の上に一行で見せる（4.4）。文化は表示のみ。
  armyHistoryLine() {
    const departed = Game.state.departed || [];
    if (!departed.length) return "";
    const last = departed[departed.length - 1];
    const causeJa = this.RELIC_CAUSE_JA[last.cause] || last.cause;
    const army = last.army ? `、${U.esc(last.army)}` : "";
    const culture = Game.armyCulture();
    // 押すと「去った者たち」が開く。魔界史（ラン終了）まで待たないと読めなかった。
    return this.departedPanel(`<span class="army-history-line">これまでに ${departed.length}人が去った。
      最後は ${U.esc(last.name)}（${U.esc(causeJa)}${army}）。${
        culture ? `軍風は『${U.esc(culture)}』` : ""}</span>`);
  },

  // ラン中の「去った者たち」。魔界史（ラン終了）まで待たずに、いま読める。
  // <details> にしてあるのは、画面を増やさずにその場で開けるため
  // （新しい phase を足すと UI.set() の scene 推定と戻り先の管理が要る）。
  departedPanel(summaryHtml) {
    const departed = Game.state.departed || [];
    if (!departed.length) return "";
    const relics = Game.state.relics || [];
    const rows = departed.map(d => {
      const causeJa = this.RELIC_CAUSE_JA[d.cause] || d.cause;
      const relic = d.relicId ? relics.find(r => r.id === d.relicId) : null;
      const rec = d.record || {};
      return `<div class="departed-row">
        ${this.icon(d.race)} ${U.esc(d.name)}（${U.esc(d.race)}）
        ${U.esc(causeJa)}${d.army ? `・${U.esc(d.army)}` : ""}
        ・${rec.battles || 0}戦${rec.wins || 0}勝${rec.carried ? `・担がれ${rec.carried}回` : ""}
        ${relic ? `　🏺 ${U.esc(relic.name)}` : ""}
      </div>`;
    }).join("");
    return `<details class="departed-panel"><summary>${summaryHtml
      || `<span class="muted">これまでに ${departed.length}人が去った</span>`}</summary>
      <div class="departed-list">${rows}</div></details>`;
  },

  // 蔵：離脱者が残した遺物の受け渡し。魔王が決裁する（自動では渡さない）。
  // **誰かが去っていれば、遺物が1つも無くても出す。** 何も出ないと
  // 「蔵はどこだ」になる（オーナー試遊で発覚）。空の蔵も軍団史の一部。
  vaultPanel(options = {}) {
    const st = Game.state;
    const relics = st.relics || [];
    const departed = st.departed || [];
    const readOnly = !!options.readOnly;
    const includeDeparted = options.includeDeparted !== false;
    if (!relics.length) {
      if (!departed.length && !readOnly) return "";
      const last = departed[departed.length - 1];
      return `<div class="panel vault-panel"><h3>🏺 蔵</h3>
        <div class="muted">${last ? `蔵は空。${U.esc(last.name)}は何も残さなかった。` : "蔵はまだ空です。"}</div>
        ${last ? `<div class="muted">品を残すのは、名の通った者だけ（4戦以上／昇進済み／担がれて帰った経験）。</div>` : ""}
        ${includeDeparted ? this.departedPanel() : ""}
      </div>`;
    }
    const rows = relics.map(r => {
      const trait = TRAITS[r.traitId];
      const holder = r.holderUid !== null ? st.roster.find(m => m.uid === r.holderUid) : null;
      const causeJa = this.RELIC_CAUSE_JA[r.from.cause] || r.from.cause;
      const candidates = st.roster.filter(m => m.uid !== r.holderUid);
      const options = candidates.map(m => `<option value="${m.uid}">${U.esc(m.name)}</option>`).join("");
      const giveButton = candidates.length ? `
        <select class="relic-target" onchange="this.nextElementSibling.dataset.uid=this.value">${options}</select>
        <button class="small" data-action="giverelic" data-relic="${r.id}" data-uid="${candidates[0].uid}">渡す</button>` : "";
      return `<div class="relic-row">
        <div class="relic-name">🏺 <b>${U.esc(r.name)}</b></div>
        <div class="muted">${U.esc(r.from.name)}（${U.esc(r.from.race)}）の${U.esc(causeJa)}の品。
          宿る特性：${U.esc(trait ? trait.name : "？")}</div>
        <div class="muted">${holder ? `いま ${U.esc(holder.name)} が所持` : "蔵にある"}</div>
        ${readOnly ? "" : `<div class="row tight">
          ${giveButton}
          ${holder ? `<button class="small" data-action="storerelic" data-relic="${r.id}">蔵に戻す</button>` : ""}
        </div>`}
      </div>`;
    }).join("");
    return `<div class="panel vault-panel"><h3>🏺 蔵</h3>
      <div class="muted">離脱した者が残した品。宿った癖が誰かに移る。自動では渡らない。</div>
      ${rows}
      ${includeDeparted ? this.departedPanel() : ""}
    </div>`;
  },

  // モルモの日誌・蔵・去った者を、進行状態を変えず一枚にまとめて読む。
  records() {
    const st = Game.state;
    this.recordsFrom = st.phase;
    const journal = typeof Game.journal === "function" ? Game.journal() : [];
    // 作戦ごとに一節。事実は素の箇条書き、モルモの一言は節に一つ（1行ごとに「デス」を付けると読めない）。
    const journalHtml = journal.length ? journal.map(group => `<section class="journal-day">
      <h3>${group.turn != null ? `第${U.esc(group.turn)}作戦のころ` : `${U.esc(group.day)}日目`}</h3>
      <ul class="journal-lines">${group.lines.map(line => `<li data-kind="${U.esc(line.kind)}">${U.esc(line.text)}</li>`).join("")}</ul>
      ${group.remark ? `<div class="journal-remark">モルモ「${U.esc(group.remark)}」</div>` : ""}
    </section>`).join("") : `<div class="muted journal-empty">まだ何も書いていませんデス</div>`;
    const departed = this.departedPanel();
    this.set(`<div class="records-screen">
      <header class="panel records-heading">
        <h2>📖 城の記録</h2>
        <div class="muted">モルモが書き留めた、魔王軍の日々。</div>
      </header>
      <section class="panel journal-panel">
        <h2>日誌</h2>
        ${journalHtml}
      </section>
      ${this.vaultPanel({ readOnly: true, includeDeparted: false })}
      <section class="panel records-departed">
        <h2>去った者</h2>
        ${departed || `<div class="muted">まだ誰も去っていません。</div>`}
      </section>
      <button class="wide ghost" data-action="backrecords">← 戻る</button>
    </div>`, "records");
  },

  journalPanelHtml() {
    const journal = typeof Game.journal === "function" ? Game.journal() : [];
    const body = journal.length ? journal.map(group => `<section class="journal-day">
      <h3>${group.turn != null ? `第${U.esc(group.turn)}作戦のころ` : `${U.esc(group.day)}日目`}</h3>
      <ul class="journal-lines">${group.lines.map(line => `<li data-kind="${U.esc(line.kind)}">${U.esc(line.text)}</li>`).join("")}</ul>
      ${group.remark ? `<div class="journal-remark">モルモ「${U.esc(group.remark)}」</div>` : ""}
    </section>`).join("") : `<div class="muted journal-empty">まだ何も書いていませんデス</div>`;
    return `<section class="panel journal-panel"><h2>日誌</h2>${body}</section>`;
  },

  progressPanel() {
    const st = Game.state;
    const incoming = st.counterattack && st.counterattack.pending
      ? (st.counterattack.kind === "hero" ? "勇者が城へ向かっている" : "討伐隊が城へ向かっている")
      : "反撃の予告なし";
    const hero = st.heroCame ? "勇者は来訪済み" : "勇者はまだ来ていない";
    const lore = Object.values(st.skillLore || {}).map(id => TRAITS[id]).filter(Boolean);
    return `<section class="panel castle-progress"><h2>進行度</h2><dl>
      <dt>王国攻略</dt><dd>${st.conquest || 0}/${Game.MAX_CONQUEST}</dd>
      <dt>魔王軍</dt><dd>Lv.${Game.armyLevel()}</dd>
      <dt>警戒</dt><dd>${st.alert || 0} — ${U.esc(incoming)}</dd>
      <dt>勇者</dt><dd>${U.esc(hero)}</dd>
      <dt>城陥落</dt><dd>${st.castleFalls || 0}回</dd>
      <dt>伝承で覚えた技</dt><dd>${lore.length ? lore.map(t => `【${U.esc(t.name)}】`).join("、") : "まだない"}</dd>
    </dl></section>`;
  },

  armyPanel(options = {}) {
    const st = Game.state;
    const active = Game.activeRoster();
    const activeSet = new Set(st.activeUids);
    const home = st.roster.filter(m => !activeSet.has(m.uid));
    const rows = (members, offset = 0) => members.map((m, i) => this.memberRow(m, {
      controls: options.controls !== false,
      index: i + offset,
      total: members.length,
      activeCount: active.length
    })).join("");
    const injured = st.roster.filter(m => m.injured > 0).length;
    return `<div class="castle-army">
      <section class="castle-panel"><h2>⚔ 出撃隊 ${active.length}/${Game.MAX_DEPLOY}${injured ? `<span class="injured-note">🩹 負傷で${injured}名出られない</span>` : ""}</h2>
        <div class="member-rows">${rows(active) || `<div class="muted">出撃する者がいない。</div>`}</div></section>
      <section class="castle-panel"><h2>🏰 留守番 ${home.length}</h2>
        <div class="member-rows">${rows(home) || `<div class="muted">留守番はいない。</div>`}</div></section>
    </div>`;
  },

  recordsCastlePanel() {
    const departed = this.departedPanel();
    return `<div class="castle-records">${this.journalPanelHtml()}
      ${this.vaultPanel({ readOnly: true, includeDeparted: false })}
      <section class="panel records-departed"><h2>去った者</h2>
        ${departed || `<div class="muted">まだ誰も去っていません。</div>`}</section>
      ${this.progressPanel()}</div>`;
  },

  advisorCastlePanel() {
    const active = Game.activeRoster();
    const necromancer = active.find(m => (m.traits || []).includes("necromancy"));
    const deathHints = [
      active.some(m => (m.traits || []).includes("gravekeeper")) ? "死亡→魂獲得" : "",
      necromancer ? `《死霊術》：本人が生存してラウンド終了 → 倒れている味方1名を蘇生${active[0] && active[0].uid === necromancer.uid ? `。配置注意：${necromancer.name}は最前列` : ""}` : "",
      active.some(m => (m.traits || []).includes("soul_harvest")) ? "蘇生→魂消費→アンデッド強化" : ""
    ].filter(Boolean);
    const deathPanel = deathHints.length ? `<section class="panel"><h2>💀 死亡反応</h2><div class="synergy-hint">${deathHints.map(U.esc).join(" → ")}</div></section>` : "";
    const facility = Game.facilityInfo();
    const next = FACILITY_LEVELS[Game.state.facilityLevel + 1];
    const facilityStatus = `<section class="panel castle-facility"><h2>施設</h2>
      <div><b>Lv.${Game.state.facilityLevel} ${U.esc(facility.name)}</b></div>
      <div class="muted">${facility.works ? `1戦闘に${facility.works}回稼働` : "大型施設はまだない"}</div>
      <div class="muted">${next ? `次の施設まで建設進捗 ${Game.state.buildProgress || 0}/${next.buildThreshold}` : "施設は最大レベル"}</div></section>`;
    return `<div class="castle-advisor">
      ${this.chainMapPanel(active)}${this.synergyPanel(active)}${deathPanel}${facilityStatus}
      ${Game.state.selectedMission ? this.enemyPreview() : `<section class="panel"><h2>敵情</h2><div class="muted">作戦を選ぶと敵情を確認できます。</div></section>`}
    </div>`;
  },

  castle(tab = "army", options = {}) {
    const allowed = ["army", "records", "advisor"];
    tab = allowed.includes(tab) ? tab : "army";
    if (!options.formation && this.root && this.root.dataset.scene !== "castle") this.castleFrom = Game.state.phase;
    this.castleTab = tab;
    let content = tab === "records" ? this.recordsCastlePanel()
      : tab === "advisor" ? this.advisorCastlePanel() : this.armyPanel({ controls: true });
    if (options.formation) content += `<div class="formation-decisions">
      ${this.payrollPanel()}${this.debtPanel()}${this.feastPanel()}${this.mercenaryPanel()}
      ${this.kingSlimePanel()}${this.vaultPanel()}
    </div>`;
    const tabs = options.formation ? "" : `<nav class="castle-tabs" aria-label="城のメニュー">
      ${[["army", "軍団"], ["records", "記録"], ["advisor", "参謀"]].map(([id, label]) =>
        `<button class="castle-tab${tab === id ? " active" : ""}" data-action="castletab" data-tab="${id}">${label}</button>`).join("")}
    </nav>`;
    const empty = Game.activeRoster().length === 0;
    const payroll = Game.payrollQuote();
    const formationActions = options.formation ? `<div class="formation-actions">
      <button class="wide ghost" data-action="backmission">← 作戦会議へ戻る</button>
      <button class="primary wide" data-action="deploy" ${empty || !payroll.affordable ? "disabled" : ""}>${U.esc(Game.payrollPolicy().name)}で出撃する</button>
      ${Game.state.roster.length === 0 ? `<button class="wide ghost" data-action="title">タイトルへ戻る</button>` : ""}
    </div>` : `<button class="wide ghost castle-back" data-action="backcastle">← 戻る</button>`;
    this.set(`${this.hud()}<div class="castle-screen${options.formation ? " formation-shell" : ""}">
      <header class="castle-header"><div><h1>${options.formation ? "編成" : "🏰 城のメニュー"}</h1>
        <div class="muted">${options.formation ? "出撃する者と城に残る者を決める。詳しい作戦情報は城の参謀札へ。" : "いつでも見るものを、三つの札にまとめました。"}</div></div>${tabs}</header>
      <main class="castle-content ${options.formation ? "formation-army" : ""}">${content}</main>${formationActions}
    </div>`, options.formation ? "formation" : "castle");
  },

  // 軍団のどこでも使う一行表示。操作を隠す面接でも、行そのものから同じ人物詳細へ入る。
  memberRow(m, opts) {
    opts = opts || {};
    const active = Game.state.activeUids.includes(m.uid);
    const rank = Game.rankOf(m);
    const skillEntry = (m.traits || []).map(id => ({ id, trait: TRAITS[id] }))
      .find(entry => entry.trait && this.isSkillTrait(entry.id));
    const marks = [
      m.injured > 0 ? `<span class="injured">🩹 負傷</span>` : "",
      m.unpaid ? `<span class="unpaid">給与未払い</span>` : "",
      this.memberRelics(m).length ? `<span class="relic-chip">🏺 遺物</span>` : ""
    ].filter(Boolean).join("");
    const controls = opts.controls ? `<div class="member-row-actions">
      <button class="small" data-action="toggledeploy" data-uid="${m.uid}">${active ? "留守番へ" : "出撃隊へ"}</button>
      ${active ? `<button class="small" data-action="up" data-uid="${m.uid}" ${opts.index === 0 ? "disabled" : ""}>▲</button>
        <button class="small" data-action="down" data-uid="${m.uid}" ${opts.index === (opts.total ?? opts.activeCount) - 1 ? "disabled" : ""}>▼</button>
        <button class="small" data-action="front" data-uid="${m.uid}" ${opts.index === 0 ? "disabled" : ""}>⏫</button>` : ""}
      <button class="small danger" data-action="fire" data-confirm="1" data-uid="${m.uid}">解雇</button>
    </div>` : "";
    return `<div class="member-row${active ? " active" : " home"}" data-action="member" data-uid="${m.uid}" role="button" tabindex="0">
      ${this.avatarHtml(m)}
      <div class="member-row-main"><b>${U.esc(m.name)}</b><span>${U.esc(m.race)} / ${U.esc(m.job)}</span>
        <small>${U.esc(rank.name)}　HP${m.hp} 攻${m.atk} 防${m.def} 速${m.spd}</small></div>
      <div class="member-row-state">${marks}<small>気合 ${typeof m.spirit === "number" ? m.spirit : "-"}</small>
        ${skillEntry ? `<small>🗡 ${U.esc(skillEntry.trait.name)}</small>` : ""}</div>${controls}
    </div>`;
  },

  // 名簿と応募者で共用する人物詳細。呼び出し側は uid または applicantIndex の片方を渡す。
  memberDetail(uid, applicantIndex) {
    const st = Game.state;
    this.memberFrom = this.root && this.root.dataset.scene;
    const index = applicantIndex === undefined || applicantIndex === null || applicantIndex === "" ? null : Number(applicantIndex);
    const applicant = index !== null && Number.isInteger(index) ? st.applicants[index] : null;
    const m = applicant || st.roster.find(unit => unit.uid === uid);
    if (!m) return;
    const isApplicant = !!applicant;
    const rank = Game.rankOf(m);
    const nextRank = Game.nextRank(m);
    const record = Game.memberRecord(m);
    const base = m.base || { hp: m.hp, atk: m.atk, def: m.def, spd: m.spd };
    const stat = (label, key) => {
      const grown = key === "spd" ? 0 : Math.max(0, Number((m.grown || {})[key]) || 0);
      return `<div class="stat"><span class="k">${label}</span><span class="v">${m[key]}</span>${grown ? `<small>基礎${base[key]} +${grown}</small>` : ""}</div>`;
    };
    const relicByTrait = this.relicByTraitOf(m);
    const traits = (m.traits || []).map(id => ({ id, trait: TRAITS[id] })).filter(x => x.trait);
    const traitGroup = (label, icon, rows) => rows.length
      ? `<div class="member-trait-group"><b>${icon} ${label}</b>${this.traitHtml(rows.map(x => x.id), relicByTrait)}</div>` : "";
    const relicTraits = traits.filter(x => relicByTrait[x.id]);
    const quirks = traits.filter(x => x.trait.quirk && !relicByTrait[x.id]);
    const skills = traits.filter(x => this.isSkillTrait(x.id) && !relicByTrait[x.id]);
    const common = traits.filter(x => !relicByTrait[x.id] && !x.trait.quirk && !this.isSkillTrait(x.id));
    const tier2 = skills.find(x => x.trait.skill && x.trait.skill.tier === 2);
    const nextSkill = isApplicant ? (Game.loreSkillFor(m) || Game.nextSkillFor(m)) : Game.nextSkillFor(m);
    const skillStatus = tier2 ? (m.debutSkill === tier2.id
      ? "お披露目待ち（次の戦いで自動発動）"
      : "お披露目済み・以後は号令でだけ発動") : "";
    const held = this.memberRelics(m);
    const stored = (st.relics || []).filter(r => !r.holderUid);
    const relicActions = !isApplicant ? `<div class="member-relic-actions">
      ${held.map(r => `<button class="small" data-action="storerelic" data-relic="${r.id}">🏺 ${U.esc(r.name)}を蔵へ戻す</button>`).join("")}
      ${stored.map(r => `<button class="small" data-action="giverelic" data-relic="${r.id}" data-uid="${m.uid}">🏺 ${U.esc(r.name)}を渡す</button>`).join("")}</div>` : "";
    const active = !isApplicant && st.activeUids.includes(m.uid);
    const actions = isApplicant
      ? `<button class="primary wide" data-action="hire" data-index="${index}" ${Game.canHireApplicant(index) ? "" : "disabled"}>採用する</button>`
      : `<div class="row"><button data-action="toggledeploy" data-uid="${m.uid}">${active ? "留守番へ" : "出撃隊へ"}</button>
          <button class="danger" data-action="fire" data-confirm="1" data-uid="${m.uid}">解雇</button></div>`;
    this.set(`<div class="member-overlay"><article class="member-detail">
      <button class="small member-close" data-action="closemember">× 閉じる</button>
      <header>${this.avatarHtml(m, "photo")}<div><h2>${U.esc(m.name)}</h2><div>${U.esc(m.race)} / ${U.esc(m.job)}${this.secondGenLabel(m)}</div>
        <div><span class="rank-badge rank-${U.esc(rank.id)}">${U.esc(rank.name)}</span>　戦功 ${m.merit || 0}${nextRank ? ` / ${nextRank.threshold}` : "・最高位"}</div></div></header>
      <div class="stats member-detail-stats">${stat("HP", "hp")}${stat("攻撃", "atk")}${stat("防御", "def")}${stat("速度", "spd")}</div>
      <div class="meta"><span>気合 ${typeof m.spirit === "number" ? m.spirit : "-"}</span><span>忠誠 ${m.loyalty}</span><span>給与 ${m.salary}G</span></div>
      <section><h3>特性と技</h3>${traitGroup("癖", "◌", quirks)}${traitGroup("共通特性", "◆", common)}${traitGroup("遺物由来", "🏺", relicTraits)}${traitGroup("技", "🗡", skills)}
        ${skillStatus ? `<div class="skill-status">${U.esc(skillStatus)}</div>` : ""}${nextSkill ? `<div class="next-skill">次に覚える技／伝承：<b>【${U.esc(nextSkill.name)}】</b></div>` : ""}</section>
      <section><h3>記録</h3><div class="member-record">出撃 ${record.battles || 0}戦（${record.wins || 0}勝）　倒れた ${record.downed || 0}回　担がれた ${record.carried || 0}回　遅刻 ${record.late || 0}回　食べた ${record.ate || 0}回</div></section>
      ${held.length ? `<section><h3>遺物</h3>${held.map(r => `<span class="relic-chip">🏺 ${U.esc(r.name)}</span>`).join("")}</section>` : ""}
      ${relicActions}${this.resumeHtml(m)}${m.quote ? `<div class="quote">「${U.esc(m.quote)}」</div>` : ""}${actions}
    </article></div>`, "member");
  },

  departmentSummary() {
    const st = Game.state;
    const combat = Game.departmentRoster("combat").length;
    const home = Game.departmentRoster("home").length;
    const facility = Game.facilityInfo();
    const next = FACILITY_LEVELS[st.facilityLevel + 1];
    const buildText = next
      ? `次の施設まで ${Math.max(0, next.buildThreshold - st.buildProgress)} 建材投入`
      : "施設は最大レベル";
    const output = Game.departmentOutput();
    const foodNeed = Game.foodNeed();
    const balance = output.food - foodNeed;
    return `<div class="department-overview">
      <div><b>⚔ ${combat}</b><span>出撃隊</span></div>
      <div><b>🏰 ${home}</b><span>留守番</span></div>
      <div><b>${U.esc(facility.name)}</b><span>${facility.works ? `大型施設が1戦闘に ${facility.works} 回働く` : "大型施設なし"}</span></div>
      <div class="${balance < 0 && st.food < -balance ? "warn" : ""}"><b>食料 ${output.food} / 消費 ${foodNeed}</b><span>${balance < 0 ? `赤字 ${-balance}（備蓄 ${st.food} であと${Math.floor(st.food / -balance)}戦）` : `余剰 +${balance}（備蓄 ${st.food}/上限 ${Game.foodCapacity()}）`}</span></div>
      <div><b>${U.esc(buildText)}</b><span>施工能力 ${output.material} / 回</span></div>
      ${output.wage > 0 ? `<div><b>給与 -${output.wage}%</b><span>留守番の経理</span></div>` : ""}
      ${output.recruit > 0 ? `<div><b>応募 +${output.recruit}名</b><span>留守番の人事</span></div>` : ""}
    </div>`;
  },

  // 魔界史の主要記録は最大CHAINと最大OVERKILLの2つだけ（設計憲法 第11節）。
  // 勝敗・到達点の隣に置き、総余剰・獲得G・召喚数などは主要記録へ増やさない。
  // フィールドの無い旧レコードは0として表示する。
  chainRecordVersion(record) {
    return (typeof Chain !== "undefined") ? Chain.versionOf(record) : 1;
  },

  hasMixedChainVersions(records) {
    return new Set((records || []).map(record => this.chainRecordVersion(record))).size > 1;
  },

  recordHighlights(record, showChainVersion = false) {
    const chain = Math.max(0, Number(record && record.maxChain) || 0);
    const overkill = Math.max(0, Number(record && record.maxOverkill) || 0);
    const version = this.chainRecordVersion(record);
    const chainLabel = showChainVersion
      ? `最大CHAIN（${version >= 2 ? `新定義 V${version}` : "旧定義 V1"}）`
      : "最大CHAIN";
    return `<div class="record-highlights">
      <div><b>⛓ ${chain}</b><span>${chainLabel}</span></div>
      <div><b>💥 ${overkill}%</b><span>最大OVERKILL</span></div>
    </div>`;
  },

  // ランがV2を記録しているときだけ保存済みchainViewを読む。
  // 旧セーブ・欠損・契約版不一致はV1へ戻し、UIで推定再計算しない。
  battleChainView(battle) {
    const legacy = battle && battle.chainSummary || null;
    const runVersion = (typeof Chain !== "undefined" && typeof Game !== "undefined" && Game.state)
      ? Chain.versionOf(Game.state) : 1;
    const view = battle && battle.chainView;
    if (runVersion < 2 || !view || view.defVersion !== 2
      || !Number.isFinite(view.maxDepth) || !Number.isFinite(view.rawMaxDepth)) {
      return { version: 1, maxChain: (legacy && legacy.maxChain) || 0,
        steps: (legacy && legacy.deepest && legacy.deepest.steps) || [] };
    }
    return { version: 2, maxChain: view.maxDepth,
      steps: (view.deepest && Array.isArray(view.deepest.steps)) ? view.deepest.steps : [] };
  },

  // 保存済みの構造データだけからV2経路ラベルを作る。rawログのtextは解析しない。
  chainViewStepLabel(step) {
    return ChainViewUI.stepLabel(step);
  },

  // 「今回どれだけ壊れたか」を一目で見せるパネル。勝利・敗北・ゲームオーバーで同じものを使う。
  // 主要記録は**最大CHAINと最大OVERKILLの2つだけ**。召喚・資源・蘇生は横並びに増やさず、
  // 下の詳細1行か個人貢献のバッジへ回す（記録が増えるほど、どれも読まれなくなる）。
  // ── 戦果の1文（U2） ───────────────────────────────────
  //
  // 「よく分からないけどつながった」を戦果まで持ち越さないための1文。
  // 材料は Spotlight（core）が根拠つきで作った**事実だけ**で、日本語を組み立てるのは
  // ここだけにする。同じ事実をモルモや魔界史でも使うが、言い方の管理はこの1か所へ寄せる。
  //
  // パネルは増やさない（設計書 6.1「パネルをさらに積み重ねない」）。既存の
  // 「今回の大暴れ」の中へ入れ、最大CHAINと最大OVERKILLの2記録はそのまま残す。
  //
  // spotlight が無い戦果（証拠が揃わなかった戦闘・この機能より前のセーブ）では
  // **何も出さない**。推測で書くと「変えたから勝った」という反実仮想になる。
  spotlightSentence(battle) {
    const s = battle && battle.spotlight;
    const text = this.spotlightText(s);
    if (!text) return "";
    // 今回動かした人が実際に働いた回だけ、見出しを変える（R2）。
    // **「変えたから勝った」とは書かない。** 書けるのは「動かした人が、こう動いた」まで。
    // 印は spotlight 側が、その人が実際に関わった候補にだけ立てている。
    const label = s.changedActor ? "今回動かした人が、こう働いた" : "この戦いの一手";
    return `<p class="spotlight-line${s.changedActor ? " changed" : ""}"><i>${label}</i>${text}</p>`;
  },

  // 魔界史へ残った出来事1件（R3/U3）。**同じ事実から、同じ言い方で**書く。
  // 統計を1行増やすのではなく、「第N戦で誰が誰を動かしたか」という話を残す（第11節）。
  // 旧レコードに memory は無い。無ければ出さないのが正しく、推定生成してはいけない。
  memoryLine(record) {
    const m = record && record.memory;
    const text = this.spotlightText(m);
    if (!text) return "";
    const where = [m.turn ? `第${m.turn}戦` : "", m.army ? `対 ${m.army}` : ""].filter(Boolean).join("・");
    return `<p class="spotlight-line memory-line"><i>魔界史に残った出来事${
      where ? `　${U.esc(where)}` : ""}</i>${text}</p>`;
  },

  // 事実 → 日本語。戦果・魔界史のどちらもここを通す（言い方の管理を1か所に保つ）。
  spotlightText(s) {
    if (!s || !s.origin || !s.actor) return "";
    const n = s.numbers || {};
    const name = person => `<b>${U.esc(person.name || "誰か")}</b>`;
    // 撃破まで届いたときだけ「撃破した」と書く。届いていない回に書くと嘘になる。
    const landed = (verb) => n.killed && s.target && s.target.name
      ? `${name(s.target)}を撃破した`
      : `${U.esc(String(n.dmg || 0))}ダメージを${verb}`;
    let text;
    if (s.kind === "loot_relay") {
      text = s.sameActor
        ? `${name(s.actor)}が自分で奪った金貨に反応して、もう一度動いた。${landed("追加で通した")}`
        : `${name(s.origin)}の${U.esc(s.originAbility || "略奪")}を受け、${name(s.actor)}が追撃した。${landed("上乗せした")}`;
    } else if (s.kind === "meal_boost") {
      text = `${name(s.origin)}の料理が${name(s.actor)}を強化（+${U.esc(String(n.percent || 0))}%）。${landed("通した")}`;
    } else if (s.kind === "revive_return") {
      text = `${name(s.origin)}が${name(s.actor)}を蘇生。${name(s.actor)}は復帰後に${
        U.esc(String(n.actions || 0))}回動き、${landed("与えた")}`;
    } else return "";
    return text;
  },

  breakthroughPanel(battle) {
    if (!battle) return "";
    const chain = this.battleChainView(battle);
    const overkill = battle.overkillSummary || null;
    const maxChain = chain.maxChain || 0;
    const maxPercent = (overkill && overkill.maxPercent) || 0;
    if (!maxChain && !maxPercent) return "";

    // 数字だけでは「CHAIN」が何を指すのか伝わらない。経路の上に一行置いて、
    // 「この芋づるの段数が最大CHAINだ」と読めるようにする（説明画面は作らない）。
    const steps = chain.steps || [];
    const originName = steps[0] && steps[0].actorName;
    const labelOf = step => chain.version >= 2 ? this.chainViewStepLabel(step) : step.label;
    const path = steps.length >= 2
      ? `<div class="chain-caption">いちばん長くつながった連鎖（${steps.length}段）</div>
         ${Game.state && Game.state.generation === 1 && Game.state.turn <= 2 ? `<p class="first-guide">モルモ：これがCHAIN、能力の連鎖デス。矢印の順に、誰の働きが次の能力を動かしたかを追ってみてくださいネ。</p>` : ""}
         <div class="chain-path">${steps.map(step =>
          `<span class="chain-step">${U.esc(labelOf(step))}</span>`).join(`<span class="chain-arrow">→</span>`)}</div>`
      : `<div class="muted">連鎖は起きなかった（ひと突きで終わっている）</div>`;

    // 「その戦闘で何を揃えて、どこまで壊れたか」を1行に畳む（作業表 B）。
    // CHAIN・シナジー名・戦意倍率は今までバラバラの場所にあり、達成感が戦果に残らなかった。
    // 数える対象は既にある戦果データだけで、新しい計算も戦闘式の変更もしていない。
    const synergyNames = (battle.synergies || []).filter(Boolean);
    const synergyLabel = synergyNames.length
      ? (synergyNames.length > 3
        ? `${synergyNames.slice(0, 3).map(n => `《${n}》`).join("")}ほか${synergyNames.length - 3}種`
        : synergyNames.map(n => `《${n}》`).join(""))
      : "";
    const momentum = Math.max(1, Number(battle.momentumPeak) || 1);
    const headline = [
      maxChain ? `⛓ CHAIN ${maxChain}` : "",
      synergyLabel ? `⚡ ${synergyLabel}` : "",
      momentum > 1 ? `🔥 戦意 ×${momentum.toFixed(2)}` : ""
    ].filter(Boolean);

    const details = [];
    if (overkill && overkill.count) details.push(`${U.esc(overkill.rank || "OVERKILL")} ほか ${overkill.count}回・総余剰 ${overkill.totalExcess}`);
    const revives = (battle.contribution || []).reduce((sum, c) => sum + (c.revivesGiven || 0) + (c.selfRevives || 0), 0);
    if (revives) details.push(`蘇生 ${revives}回`);
    if (battle.summonCount) details.push(`召喚 ${battle.summonCount}体`);

    return `<div class="panel breakthrough-panel"><h3>💥 今回の大暴れ</h3>
      ${headline.length ? `<div class="breakthrough-headline">${headline.map(part =>
        `<span>${U.esc(part)}</span>`).join(`<span class="sep">・</span>`)}</div>` : ""}
      <div class="breakthrough-records">
        <div><b>${maxChain}</b><span>最大CHAIN</span></div>
        <div><b>${maxPercent}%</b><span>最大OVERKILL</span></div>
      </div>
      ${this.spotlightSentence(battle)}
      ${originName ? `<p class="chain-credit">この連鎖の起点は <b>${U.esc(originName)}</b>。${U.esc(labelOf(steps[steps.length - 1]))}までつながった。</p>` : ""}
      ${path}
      ${details.length ? `<div class="muted">${details.join("　/　")}</div>` : ""}
    </div>`;
  },

  // 施設と死者の働き。2倍速やスキップで見えなかった「誰が戻したか」を戦果で読めるようにする。
  // 集計は Battle.summarizeFacility / summarizeDeathChains（タイムライン導出）を表示するだけ。
  facilityPanel(battle) {
    if (!battle) return "";
    const facility = battle.facility || null;
    const summary = battle.facilitySummary || { facilities: [] };
    const chains = battle.deathChains || [];
    const lines = [];
    if (facility && facility.level >= 1) {
      lines.push(`🏗 施設Lv.${facility.level}（${U.esc(facility.name)}）：大型施設が1戦闘に ${facility.works || 1} 回まで働く`);
    }
    const fired = new Map((summary.facilities || []).map(f => [f.facilityId, f]));
    const describe = f => {
      if (f.facilityId === "graveyard") return `骸骨従者${f.summons || 0}体を召喚${f.rescued ? "（全滅回避）" : ""}`;
      if (f.facilityId === "extortion_ledger") return `予約金貨${f.amount}G到達 → 次の味方攻撃+40%`;
      if (f.facilityId === "grand_kitchen") return "食事強化を2倍化（糧食+1）";
      return `${f.count}回発火`;
    };
    for (const f of fired.values()) lines.push(`🔥 ${U.esc(f.name)}：${U.esc(describe(f))}`);
    if (facility && facility.activeId && !fired.has(facility.activeId)) {
      lines.push(`💤 ${U.esc(facility.activeName)}：今回は発火しなかった`);
    }
    if (!lines.length && !chains.length) return "";
    const chainRows = chains.map(c => `<div class="death-chain"><b>${U.esc(c.name)}</b>
      <div class="chain-path">${c.steps.map(step => `<span class="chain-step">${U.esc(step)}</span>`)
        .join(`<span class="chain-arrow">→</span>`)}${
        c.permanentDeath ? `<span class="chain-arrow">→</span><span class="chain-step permanent">永久戦死</span>` : ""}</div>
    </div>`).join("");
    return `<div class="panel facility-panel"><h3>🪦 施設と死者の働き</h3>
      ${lines.length ? `<ul class="notes">${lines.map(l => `<li>${l}</li>`).join("")}</ul>` : ""}
      ${chains.length ? `<div class="chain-caption">死者の連鎖（誰が倒れ、誰が戻したか）</div>${chainRows}` : ""}
    </div>`;
  },

  // ツケ（後で祟る選択の伝票）。**隠さない**のが要点。
  // 数戦あとに理由の分からない不幸が降ってくると、それは事件ではなく理不尽になる。
  // 「自分がいつ何と引き換えにしたか」が見えているから、支払いの日が事件になる。
  debtPanel() {
    const debts = Game.pendingDebts();
    if (!debts.length) return "";
    return `<div class="panel debt-panel"><h3>🧾 ツケ <span class="muted">${debts.length}件</span></h3>
      ${debts.map(d => `<div class="debt-row">
        <span class="debt-due">あと${d.battlesLeft}戦</span>
        <span>${U.esc(d.text || "取り立てが来る")}</span>
      </div>`).join("")}
      <div class="muted">戦闘が終わるたびに期限が縮む。負けても取り立ては来る。</div>
    </div>`;
  },

  // 余った食料の使い道。備蓄が積み上がるだけの資源だったので、判断に変える。
  feastPanel() {
    const q = Game.feastQuote();
    const streak = Game.state.hungerStreak || 0;
    // 飢餓は損失で終わらない。出口が見えていないと、また「不足＝詰み」に戻る。
    const hunger = streak > 0
      ? `<div class="hunger-streak">🥀 飢餓 ${streak}戦目 —
          あと${Game.HUNGER_ADAPT_TURNS - streak}戦を生き延びた者は<b>飢餓適応</b>（食料を消費しない／最大HP-15%）</div>`
      : "";
    if (!q.possible) {
      return `<div class="panel feast-panel"><h3>🍗 宴</h3>
        <div class="muted">この軍団は誰も食事を必要としない。宴は開けない。</div>${hunger}</div>`;
    }
    const links = [
      q.bigEaters > 0 ? `大食漢${q.bigEaters}体：食う量2倍・効果2倍` : "",
      q.cook ? "魔界料理人：必要な食料が半分" : ""
    ].filter(Boolean);
    const body = q.held
      ? `<div class="feast-ready">宴は済んだ。${U.esc(String(Game.state.feastPending.fed))}名が満腹で出撃する（食う者の与ダメージ+${Math.round(Game.state.feastPending.dmgBonus * 100)}%）</div>`
      : `<button class="wide" data-action="feast" ${q.affordable ? "" : "disabled"}>
           🍗 宴を開く（食料 ${q.cost} 消費）
         </button>
         <div class="muted">${q.affordable
            ? `食う者${q.eaters}名の忠誠+${q.loyaltyGain}、出撃した食う者の与ダメージ+${Math.round(q.dmgBonus * 100)}%（次の戦闘のみ）。`
            : `備蓄 ${q.stock}。宴には ${q.cost} と、2戦ぶんの糧食を残す余裕が要る。`}</div>`;
    return `<div class="panel feast-panel">
      <h3>🍗 宴 <span class="muted">備蓄 ${q.stock} / 上限 ${Game.foodCapacity()}</span></h3>
      ${body}
      ${links.length ? `<div class="synergy-hint">${links.map(U.esc).join(" / ")}</div>` : ""}
      ${hunger}
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
    // 発火条件を軍団全体で数えるシナジーは、出撃枠を入れ替えても総数が動かない。
    // その場合は「枠を空けずに軍団へ1体足せ」と案内するのが正しい。
    const how = entry.viaRecruit
      ? `軍団に${U.esc(entry.nextRace || "同じ種族")}をあと1体（出撃枠はそのままで）`
      : entry.swapOutRace
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

  // ── 連鎖の見取り図（いまはゴブリンの略奪連鎖＝「金貨獲得」だけ） ──
  //
  // 試遊の不満は火力ではなく「よく分からないけどつながった。これでいいのか？」だった。
  // 倍率はもう伝わっているので、ここで足すのは **起点・反応・伸ばし方** の3つだけにする。
  // 効果量は下のシナジー欄が持っているので二重に出さない。
  //
  // ・全連鎖へ広げない。まず1本で表示量と理解度を試遊で確かめる（設計憲法 第14節）。
  // ・完成レシピは公開しない。手持ちで埋められる欠けだけを出す（第7節）。
  CHAIN_MAP_SIGNAL: "金貨獲得",

  chainMapPanel(roster) {
    const facility = Game.activeFacility();
    const map = Synergy.signalChain(this.CHAIN_MAP_SIGNAL, roster, {
      pool: Game.synergyPool(),
      slots: Game.MAX_DEPLOY,
      facility,
      facilityReady: facility ? Game.facilityReady(facility.id) : false
    });
    // 起点も反応も無く、手持ちで埋める案も無いなら、この編成に略奪連鎖の話は要らない
    if (!map.sources.length && !map.reactors.length && !map.missing.length) return "";

    // 同じ能力を持つ者が3人いても3行にはしない。読ませたいのは人数ではなく因果なので、
    // 能力ごとに1行へまとめ、持ち主は名前を並べる。回数の話は once と下の再発火文が担う。
    const groupBy = nodes => {
      const groups = new Map();
      for (const node of nodes) {
        const key = `${node.kind}|${node.id}`;
        if (!groups.has(key)) groups.set(key, { ...node, holders: [] });
        if (node.who) groups.get(key).holders.push(node.who.name);
      }
      return [...groups.values()];
    };
    const badge = group => group.kind === "synergy" ? `<i class="cm-kind">シナジー</i>`
      : group.kind === "facility" ? `<i class="cm-kind">施設</i>` : "";
    const row = (group, tail) => `<li class="cm-row">
      <b>《${U.esc(group.name)}》</b>${
        group.holders.length ? `<span class="cm-who">${U.esc(group.holders.join("・"))}</span>` : ""}${badge(group)}
      <span class="cm-on">${U.esc(group.on || "条件は能力の説明を見よ")}</span>
      ${group.once ? `<i class="cm-once">各人1戦闘に1回</i>` : ""}
      ${tail || ""}</li>`;

    const sources = map.sources.length
      ? `<ol class="cm-list">${groupBy(map.sources).map(n => row(n)).join("")}</ol>`
      : `<p class="cm-empty">金貨を出す者がいない。ここが空だと、この連鎖は始まらない。</p>`;
    const reactors = map.reactors.length
      ? `<ol class="cm-list">${groupBy(map.reactors).map(n => row(n,
          n.emits.length ? `<span class="cm-emit">→ ${U.esc(n.emits.join("・"))}</span>` : "")).join("")}</ol>`
      : `<p class="cm-empty">金貨獲得に反応する者がいない。金貨は貯まるが、何も起きない。</p>`;

    // 「どうすれば意図的に伸ばせるのか」への答え。ここだけは断定できる形にする。
    const grow = map.loops
      ? `<p class="cm-loop"><b>↺ 回り続ける形になっている。</b>
          反応の追加攻撃がまた敵を倒すと、${U.esc(map.sources.filter(n => !n.once).map(n => "《" + n.name + "》").join("・"))}
          がもう一度金貨を出し、同じ列がまた頭から動く。</p>`
      : map.sources.length && map.reactors.length
        ? `<p class="cm-loop">一度は繋がるが、まだ回り続けはしない。
            <b>倒すたびに金貨を出す起点</b>を足すと、同じ列が何度も動くようになる。</p>`
        : `<p class="cm-loop">起点と反応が両方そろって初めて1段目が2段目になる。</p>`;

    const missing = map.missing.length
      ? `<div class="cm-missing"><h4>いまの手持ちで繋がるもの</h4><ul>${
          map.missing.slice(0, 4).map(m => `<li>
            <i class="cm-role">${m.role === "source" ? "起点" : "反応"}</i>
            《${U.esc(m.name)}》<span class="cm-how">${U.esc(m.how)}</span></li>`).join("")
        }</ul></div>`
      : "";

    return `<div class="panel chain-map">
      <h3>⛓ 略奪の連鎖 <span class="muted">— この編成でどう回るか</span></h3>
      <div class="cm-step"><i class="cm-num">1</i><b>起点</b><span class="muted">金貨を出す</span></div>
      ${sources}
      <div class="cm-signal">↓ <b>金貨獲得</b></div>
      <div class="cm-step"><i class="cm-num">2</i><b>反応</b><span class="muted">金貨獲得に反応する</span></div>
      ${reactors}
      ${grow}
      ${missing}
    </div>`;
  },

  synergyPanel(roster) {
    // 予告は本番と同じ母集団（軍団全体）で測る。ここがズレると編成画面だけ嘘をつく。
    const entries = Synergy.preview(roster, { slots: Game.MAX_DEPLOY, pool: Game.synergyPool() });
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
    this.set(`<div class="title-screen">
      <div class="title-crest" aria-hidden="true"><span>魔</span></div>
      <div class="title-kicker">DEMON KINGDOM PERSONNEL OFFICE</div>
      <h1>魔王ワーク</h1>
      <p class="title-copy">採用して、配属して、働かせろ。<br>戦場も魔王城も、人材配置がすべてだ。</p>
      <div class="title-menu">
        <div class="muted">第${history.length + 1}代魔王を選ぶ</div>
        ${Storage.slotMetas().map(m => this.slotCard(m)).join("")}
        <button class="wide ghost" data-action="history">魔界史（${history.length}代の記録）</button>
      </div>
      <div class="spacer"></div>
      <p class="muted">軍団員を戦闘・建設・生活へ配属。勝てば資源、働けば給与と手当。<br>敗北すれば軍団は消滅し、歴史だけが残る。</p>
    </div>`);
  },

  // タイトルの札。中身があれば「続きから」、空きなら魔王を選んで「ここに新規」。
  // 「続きから」を押し損ねて上書きする事故を無くすため、新規も必ずスロットを指定する。
  slotCard(m) {
    const kings = DEMON_KINGS.map(k => `<button class="wide ${k.id === "standard" ? "primary" : ""}"
      data-action="new" data-king="${U.esc(k.id)}" data-slot="${m.slot}">${k.icon} ${U.esc(k.name)}で新規
      <small>${U.esc(k.desc)}</small></button>`).join("");
    if (m.empty) {
      return `<div class="slot-card empty">
        <div class="slot-head"><b>スロット ${m.slot}</b> <span class="muted">空き</span></div>
        ${kings}
        <button class="small ghost" data-action="importsave" data-slot="${m.slot}">読み込み</button>
      </div>`;
    }
    const cap = (typeof ACT_STAGE_CAP !== "undefined" && ACT_STAGE_CAP[m.act]) || "?";
    return `<div class="slot-card">
      <div class="slot-head"><b>スロット ${m.slot}</b>
        <span class="muted">${m.kingIcon} ${U.esc(m.kingName)}・第${m.generation}代</span></div>
      <div class="slot-line muted">第${m.act}幕・作戦${m.turn}・王国攻略 ${m.conquest}/${cap}・軍団${m.rosterCount}人</div>
      <div class="slot-line muted">最終保存 ${U.esc(this.savedAtLabel(m.savedAt))}</div>
      <button class="wide primary" data-action="continue" data-slot="${m.slot}">続きから</button>
      <div class="row tight">
        <button class="small ghost" data-action="exportsave" data-slot="${m.slot}">書き出し</button>
        <button class="small ghost" data-action="importsave" data-slot="${m.slot}">読み込み</button>
        <button class="small danger" data-action="deletesave" data-slot="${m.slot}">削除</button>
      </div>
      <details class="slot-new"><summary class="muted">このスロットで新しく始める</summary>${kings}</details>
    </div>`;
  },

  savedAtLabel(ts) {
    if (!ts) return "不明";
    const d = new Date(ts);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  // 書き出し／読み込みは textarea だけ（file:// でも動く。ダウンロードは持たない）。
  saveTransfer(slot, mode, text) {
    const body = mode === "export"
      ? `<p class="muted">この文字列をメモ帳などに保存しておけば、別の端末でも読み込めます。</p>
         <textarea class="save-text" readonly rows="6">${U.esc(text || "")}</textarea>
         <button class="wide primary" data-action="copysave">コピー</button>`
      : `<p class="muted">書き出した文字列を貼り付けてください。</p>
         <textarea class="save-text" id="save-import" rows="6" placeholder="{...}"></textarea>
         <button class="wide primary" data-action="dosave" data-slot="${slot}">このスロットへ読み込む</button>`;
    this.set(`<div class="title-screen">
      <h1>${mode === "export" ? "書き出し" : "読み込み"}</h1>
      <div class="panel"><h3>スロット ${slot}</h3>${body}</div>
      <button class="wide ghost" data-action="title">タイトルへ戻る</button>
    </div>`, "title");
  },


  recruit() {
    const st = Game.state;
    const full = !Game.canHire();
    const cards = st.applicants.map((m, i) => `<div class="applicant-member" data-action="member" data-index="${i}" role="button" tabindex="0">${this.monsterCard(m, {
      resume: true,
      footer: (() => {
        // 「採ったら食えるのか」を採用の瞬間に見せる。答えではなく、収支の動きだけを出す。
        const fq = Game.foodBalanceIfHired(m);
        const after = fq.before.produce - fq.needAfter;
        // 赤字そのものは普通の状態なので煽らない。備蓄で吸収できなくなる時だけ警告する。
        const runsOut = after < 0 && fq.before.stock + after < 0;
        const foodNote = `<div class="hire-food ${runsOut ? "warn" : ""}">🍖 採ると 消費 ${fq.before.need} → ${fq.needAfter}`
          + `（収支 ${fq.before.delta >= 0 ? "+" : ""}${fq.before.delta} → ${after >= 0 ? "+" : ""}${after}`
          + `／備蓄 ${fq.before.stock}）`
          + `${runsOut ? "　次の戦いで食料が尽きる" : ""}</div>`;
        const cost = Game.hireCost();
        const allowed = Game.canHireApplicant(i);
        const label = full ? "軍団が満員（誰かを解雇せよ）"
          : cost > 0 ? `追加採用（紹介料 ${cost}G・給与 ${m.salary}G）`
          : `無料枠で採用（給与 ${m.salary}G）`;
        return `${foodNote}<button class="primary wide" data-action="hire" data-index="${i}" ${allowed ? "" : "disabled"}>${label}</button>`;
      })()
    })}</div>`).join("");
    // 面接中も比較できる軍団一覧。操作は人物詳細へ集約し、ここでは一行を読むだけ。
    const rosterPanel = st.roster.length ? `<div class="panel">
      <h3>現在の軍団 <span class="muted">（${st.roster.length}/${Game.MAX_ARMY}）</span></h3>
      <div class="muted">応募者と比べる。人物をタップすると詳しく見られる。</div>
      <div class="spacer" style="height:8px"></div>
      <div class="member-rows">${st.roster.map(m => this.memberRow(m, { controls: false })).join("")}</div>
    </div>` : "";
    // 指名求人：金を払って「こういう奴を寄越せ」と条件を出す。中盤から解禁。
    // 条件をシナジーの発火条件と同じ語彙にしてあるので、狙って揃える手段になる。
    const briefPanel = (() => {
      if (!Game.briefUnlocked()) return "";
      const cost = Game.briefCost();
      const active = Game.activeBrief();
      const buttons = RECRUIT_BRIEFS.map(b => `
        <button class="brief-option ${active && active.id === b.id ? "selected" : ""}"
          data-action="brief" data-brief="${b.id}" ${Game.canPostBrief(b.id) ? "" : "disabled"}>
          <span class="brief-title">${b.icon} ${U.esc(b.name)}</span>
          <span class="brief-note">${U.esc(b.note)}</span>
        </button>`).join("");
      return `<div class="panel brief-panel">
        <h3>📣 指名求人 <span class="muted">— 求人費 ${cost}G（出すたび倍）</span></h3>
        <div class="muted">条件を指定して求人を出し直す。合う者が来やすくなり、格上も出やすくなる。
          ${active ? `いまの指名：<b>${active.icon} ${U.esc(active.name)}</b>` : "確実ではない。来ないこともある。"}</div>
        <div class="brief-options">${buttons}</div>
        ${st.gold < cost ? `<div class="payroll-warning">指名には ${cost}G 必要（現在 ${st.gold}G）</div>` : ""}
      </div>`;
    })();
    this.set(`${this.hud()}
      <div class="panel">
        <h2>📜 応募者面接 <span class="muted">（残り採用枠 ${st.hiresLeft}）</span></h2>
        ${(st.roster.length === 0 && st.wipeCount)
          ? `<div class="muted wipe-rebuild-line">軍団は全滅した。ここから建て直す。${
              (st.relics || []).length ? `　🏺 蔵に ${st.relics.length}品` : ""}</div>` : ""}
        ${this.armyHistoryLine()}
        ${st.lateBloomerHint ? `<p class="first-guide late-bloomer-hint">モルモ：${U.esc(st.lateBloomerHint)}</p>` : ""}
        ${st.generation === 1 && st.turn <= 2 ?`<p class="first-guide">モルモ：${st.roster.length ? "「今の軍団との接続」は、仲間の能力とつながる手がかりデス。" : "まずは能力の発動条件を一つ見てみましょう。どんな仲間がいれば活かせそうですか？"}</p>` : ""}
        <div class="muted">${
          st.turn === 1 && st.hiresLeft > 1 ? `軍団の設立だ。${st.hiresLeft}名まで採用できる。`
          : st.hiresLeft > 1 ? `先の戦いで欠員が出た。${st.hiresLeft}名まで補充できる。`
          : st.hiresLeft === 0 ? `無料採用枠は終了。${Game.additionalHireCost()}Gで追加紹介を受けるか、面接を終了できる。`
          : "3名が魔王軍への入隊を希望している。採用できるのは1名だけだ。"}</div>
        ${(() => {
          const l = Game.activeLesson();
          return l ? `<div class="lesson-note">${l.icon} 前代の教訓【${U.esc(l.name)}】${U.esc(l.effect)}</div>` : "";
        })()}
      </div>
      <div class="recruit-compare">
        <div class="cards recruit-applicants">${cards}</div>
        <div class="recruit-roster">${rosterPanel}</div>
      </div>
      ${briefPanel}
      <div class="spacer"></div>
      <div class="row">
        <button data-action="reroll" ${Game.canReroll() ? "" : "disabled"}>
          📢 求人を出し直す（広告費 ${Game.rerollCost()}G）</button>
        <button data-action="skip" ${st.roster.length === 0 ? "disabled" : ""}>面接を終了して作戦会議へ</button>
        ${st.roster.length === 0 ? `<span class="muted">部隊が空では出撃できない。まず1体は採用せよ。</span>` : ""}
      </div>
      <div class="spacer"></div>
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
          ? (!st.seizeUsed && st.facilityLevel === 0
              ? `施工役なし。建材${Math.max(0, 3 - (st.buildProgress || 0))}で勝利後に拠点接収できる（備蓄${st.materials || 0}）`
              : `施工役なし（${m.materialReward || 0}建材は備蓄）`)
          : `勝利後 最大${buildEstimate}投入／次施設まで${buildRemaining}`;
      const consequence = m.missionKind === "invade"
        ? `王国攻略 +${m.conquestDelta}（決戦まであと${Math.max(0, Game.MAX_CONQUEST - st.conquest)}勝）`
        : m.missionKind === "suppress"
          ? `生存者の忠誠 +${m.loyaltyDelta}`
          : "王国攻略は進まない";
      return `<div class="mission-card mission-${U.esc(m.missionKind)}" data-route="${i + 1}">
        <div class="mission-route-number"><span>進軍路</span><b>${i + 1}</b></div>
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
          ${m.familiarity ? `<dt>守りの慣れ</dt><dd>敵能力 +${m.familiarity}%（この辺りで戦い続けた分）</dd>` : ""}
        </dl>
        <button class="primary wide" data-action="missionpick" data-index="${i}">この作戦を選ぶ</button>
      </div>`;
    }).join("");
    // 反撃予約中は defend 一択になる。作戦会議の見出しをそれに合わせ、
    // 一択のときに意味がないボタン（面接へ戻る等）は出さない。
    const forced = offers.length === 1 && offers[0].missionKind === "defend";
    const isHero = forced && offers[0].baseStage === 8;
    const heading = forced
      ? (isHero ? "勇者アレン一行が城へ向かっている" : `${offers[0].army}が城へ向かっている`)
      : "🗺 作戦会議";
    this.set(`${this.hud()}
      <div class="mission-warroom">
      <header class="mission-warroom-head">
      <div class="panel mission-briefing">
        <h2>${forced ? "🛡" : ""} ${U.esc(heading)}</h2>
        <div class="muted">${forced
          ? "迎え撃つほかない。面接と編成で備えよ。"
          : "略奪と鎮圧は軍団を整える寄り道、王国侵攻は最終決戦を近づける。建設担当がいれば、どの作戦でも勝利後に備蓄建材を施設へ投入する。"}</div>
      </div>
      <div class="panel mission-assets"><h3>現在の部門と施設</h3>${this.departmentSummary()}</div>
      </header>
      <div class="mission-map-label"><span>王国周辺作戦図</span><small>${forced ? "迎撃準備" : "三本の進軍路から、次の一手を選ぶ"}</small></div>
      <div class="mission-grid mission-routes">${cards}</div>
      <div class="spacer"></div>
      ${forced ? "" : `<button class="wide ghost mission-return" data-action="backrecruit">← 面接・軍団確認へ戻る</button>`}
      </div>`, "mission");
  },

  facility() {
    const st = Game.state;
    const current = Game.activeFacility();
    const active = Game.activeRoster();
    const builders = Game.departmentRoster("home");
    const statusOf = f => {
      if (f.id === "extortion_ledger") {
        const n = active.filter(m => (m.job || "").includes("会計")).length;
        return n ? `発火可能：会計職の出撃者 ${n}名` : "不足：会計職を出撃隊へ配置";
      }
      if (f.id === "grand_kitchen") {
        const eaters = active.filter(m => (m.traits || []).includes("big_eater")).length;
        const cooks = active.filter(m => (m.traits || []).includes("demon_cook")).length;
        return eaters || cooks
          ? `発火可能：大食漢 ${eaters}名／魔界料理人 ${cooks}名（出撃中）`
          : "不足：大食漢か魔界料理人を出撃隊へ配置";
      }
      const n = builders.filter(m => m.tplId === "necromancer").length;
      return n ? `発火可能：留守番の死霊術師 ${n}名` : "不足：死霊術師を留守番へ配置";
    };
    const cards = FACILITIES.map((f, i) => `<div class="mission-card facility-blueprint" data-plan="${i + 1}">
      <div class="blueprint-stamp">設計案 ${i + 1}</div>
      <div class="mission-kind">大型施設 ${current && current.id === f.id ? "・現在稼働中" : ""}</div>
      <h3>${f.icon} ${U.esc(f.name)}</h3>
      <p>${U.esc(f.desc)}</p>
      <div class="mission-purpose"><b>現在の接続</b><br><span>${U.esc(statusOf(f))}</span></div>
      <button class="primary wide" data-action="choosefacility" data-id="${U.esc(f.id)}">
        ${current && current.id === f.id ? "この施設を維持する" : current ? "この施設へ建て替える" : "この施設を建てる"}</button>
    </div>`).join("");
    this.set(`${this.hud()}<div class="construction-yard"><div class="construction-crane" aria-hidden="true">⚒</div>
      <div class="panel construction-order"><h2>🔨 大型施設の方針決定</h2>
      <div>施設Lv.${st.pendingFacilityChoiceLevel}が完成した。稼働できる大型施設は1つだけ。現在のビルドをどの方向へ壊すか選べ。</div>
    </div><div class="construction-label">魔王城増築計画 <small>採用した人材と接続する設計案を選べ</small></div>
    <div class="mission-grid construction-plans">${cards}</div></div>`, "facility");
  },

  formation() {
    const st = Game.state;
    const opening = st.openingPrototype;
    // 通常の編成は城の「軍団」と同じ一覧を使う。開幕3日間だけは日次決裁を含む旧編成を保つ。
    if (!opening) return this.castle("army", { formation: true });
    const preparation = opening && st.phase === "preparation";
    const active = Game.activeRoster();
    const activeIds = new Set(st.activeUids);
    const builders = Game.departmentRoster("home");
    const homeWorkers = builders;
    const activeCards = active.map((m, i) => this.monsterCard(m, {
      badge: i === 0 ? "最前列（狙われやすい）" : `${i + 1}番目`,
      footer: `<div class="card-actions">
        <div class="row tight">
          <button class="small" data-action="up" data-uid="${m.uid}" ${i === 0 ? "disabled" : ""}>▲ 前へ</button>
          <button class="small" data-action="front" data-uid="${m.uid}" ${i === 0 ? "disabled" : ""}>⏫ 最前列へ</button>
          <button class="small" data-action="down" data-uid="${m.uid}" ${i === active.length - 1 ? "disabled" : ""}>▼ 後ろへ</button>
        </div>
        <div class="row tight">${this.departmentButtons(m, "combat")}</div>
      </div>`
    })).join("");
    const homeCards = homeWorkers.map(m => this.monsterCard(m, {
      badge: `留守手当 ${Math.max(1, Math.ceil(m.salary * DEPARTMENTS.home.wageRate))}G`,
      footer: `<div class="card-actions">
        <div class="home-work">${this.homeWork(m)}</div>
        <div class="row tight">${this.departmentButtons(m, "home")}</div>
        <button class="small danger" data-action="fire" data-uid="${m.uid}">解雇</button></div>`
    })).join("");
    const empty = active.length === 0;
    // 枠が空いている理由を出撃隊の見出しの横に出す。バッジは留守番の札にしか無いので、
    // 「なぜか出せない」だけが残っていた（オーナー試遊で発覚）。
    const injuredCount = st.roster.filter(m => m.injured > 0).length;
    const payroll = Game.payrollPolicy();
    const payrollQuote = Game.payrollQuote();
    const rations = Game.battleRationQuote();
    const rationHints = [
      active.some(m => (m.traits || []).includes("big_eater")) && rations.consumed > 0 ? "大食漢" : "",
      active.some(m => (m.traits || []).includes("demon_cook")) && rations.consumed > 0 ? "魔界料理人" : "",
      active.some(m => (m.traits || []).includes("hunger_demon")) && rations.emptied ? "飢餓の悪魔" : "",
      rations.consumed >= 4 ? "暴食の宴" : ""
    ].filter(Boolean);
    const necromancer = active.find(m => (m.traits || []).includes("necromancy"));
    const deathHints = [
      active.some(m => (m.traits || []).includes("gravekeeper")) ? "死亡→魂獲得" : "",
      necromancer ? "《死霊術》：本人が生存してラウンド終了 → 倒れている味方1名を蘇生" : "",
      active.some(m => (m.traits || []).includes("soul_harvest")) ? "蘇生→魂消費→アンデッド強化" : ""
    ].filter(Boolean);
    const necromancerFrontWarning = necromancer && active[0] && active[0].uid === necromancer.uid
      ? `配置注意：${necromancer.name}は最前列。本人が倒れると《死霊術》は使えません。`
      : "";
    const ledgerReady = st.activeFacilityId === "extortion_ledger" && active.some(m => (m.job || "").includes("会計"));
    const graveyardReady = st.activeFacilityId === "graveyard" && builders.some(m => m.tplId === "necromancer");
    const kitchenReady = st.activeFacilityId === "grand_kitchen";
    const deadline = st.day === 1 ? "勇者到着まであと2日"
      : st.day === 2 ? "明日、勇者が到着" : "本日、勇者襲来";
    const openingActions = st.day < Game.OPENING_DAYS
      ? `<button class="wide" data-action="openingbattle" data-kind="raid" ${empty || st.expeditionUsedToday ? "disabled" : ""}>🔥 ${st.expeditionUsedToday ? "本日の遠征は完了" : "任意遠征：辺境を略奪"}</button>
         <div class="spacer"></div>
         <button class="primary wide" data-action="endday" data-day="${st.day}">本日の業務を終了</button>`
      : `<button class="primary wide" data-action="openingbattle" data-kind="invade" ${empty ? "disabled" : ""}>⚔ 防衛戦を開始する</button>`;
    this.set(`${this.hud()}
      <div class="formation-layout">
      <aside class="formation-briefing">
      <div class="panel formation-heading">
        <h2>${opening ? `📅 ${st.day}日目：${deadline}` : "🏰 出撃と留守番"} <span class="muted">— ${U.esc(st.selectedMission && st.selectedMission.missionTitle || (opening ? "準備日" : "作戦未選択"))}</span></h2>
        <div class="muted">${opening ? "配置と給与方針は翌日も維持される。変えたい所だけ直し、業務終了で日次決算を行う。" : "出撃は最大5体。城に残した者は職と特性で勝手に働く（食料の調達、建材の投入、経理、人事）。留守手当は希望給与の半額。"}</div>
        ${this.departmentSummary()}
      </div>
      ${opening ? "" : `<div class="panel"><b>🍖 戦闘糧食 ${rations.consumed}/${rations.need}</b>
        <span class="muted"> — 出撃時に備蓄 ${rations.foodBefore} → ${rations.foodAfter}</span>
        ${rations.shortage ? `<div class="warn">不足 ${rations.shortage}</div>` : ""}
        ${rationHints.length ? `<div class="synergy-hint">発火見込み：${rationHints.map(U.esc).join(" → ")}</div>` : ""}</div>`}
      ${!opening && deathHints.length ? `<div class="panel"><b>💀 死亡反応</b>
        <div class="synergy-hint">${deathHints.map(U.esc).join(" → ")}</div>
        ${necromancerFrontWarning ? `<div class="warn">${U.esc(necromancerFrontWarning)}</div>` : ""}</div>` : ""}
      ${!opening && ledgerReady ? `<div class="panel"><b>📒 恐喝帳簿</b>
        <div class="synergy-hint">予約金貨3G到達 → 次の味方攻撃+40%</div></div>` : ""}
      ${!opening && graveyardReady ? `<div class="panel"><b>🪦 墓地</b>
        <div class="synergy-hint">最初の味方死亡 → ラウンド終了時に骸骨従者を1体召喚</div></div>` : ""}
      ${!opening && kitchenReady ? `<div class="panel"><b>🍖 巨大厨房</b>
        <span class="muted">戦闘糧食を追加で1消費し、大食漢と魔界料理人の食事強化を2倍にする。</span>
      </div>` : ""}
      ${opening ? "" : this.debtPanel()}
      ${opening ? "" : this.feastPanel()}
      ${this.payrollPanel()}
      ${opening ? "" : this.mercenaryPanel()}
      ${this.kingSlimePanel()}
      ${this.vaultPanel()}
      ${empty ? `<div class="panel"><b style="color:var(--red)">出撃隊が空だ。</b> 留守番から最低1体を出せ。</div>` : ""}
      </aside>
      <section class="formation-board" aria-label="魔王軍の配置盤">
      <div class="formation-board-title"><span>魔王軍配置盤</span><small>札を動かし、今日の働き場所を決める</small></div>
      <div class="army-section department-section department-combat-section"><h3>⚔ 出撃隊 ${active.length}/${Game.MAX_DEPLOY}${
        injuredCount ? `<span class="injured-note">🩹 負傷で${injuredCount}名出られない</span>` : ""}</h3><div class="cards">${activeCards}</div></div>
      <div class="army-section department-section department-home-section"><h3>🏰 留守番 ${homeWorkers.length}</h3>
        <div class="muted department-help">城に残った者は職と特性で勝手に働く。食料を調達し（食う量は種族ごとに違い、アンデッドは食べない）、建材を施設へ投入し、会計なら給与を、人事なら応募者を動かす。足りれば軍団全員の忠誠も少し上がる。</div>
        <div class="cards">${homeCards || `<div class="department-empty">留守番はいない。現在は自炊、城も育たない。</div>`}</div></div>
      </section>
      <aside class="formation-intel">
      <div class="formation-intel-title"><span>参謀卓</span><small>発火予測・敵情</small></div>
      ${this.chainMapPanel(active)}
      ${this.synergyPanel(active)}
      ${this.enemyPreview()}
      <div class="formation-orders">
      ${opening ? "" : `<button class="wide ghost" data-action="backmission">← 作戦会議へ戻る</button>`}
      <div class="spacer"></div>
      ${preparation ? openingActions : `<button class="primary wide" data-action="deploy" ${empty || (!opening && !payrollQuote.affordable) ? "disabled" : ""}>${opening ? (st.day === Game.OPENING_DAYS ? "防衛戦へ出撃する" : "遠征へ出撃する") : `${U.esc(payroll.name)}で出撃する`}</button>`}
      ${st.roster.length === 0 ? `<div class="spacer"></div><button class="wide ghost" data-action="title">タイトルへ戻る</button>` : ""}
      </div></aside></div>`);
  },

  // コマンドバトル（既定）。取っ手を渡し、決着は run.js に戻す。
  battleManual(out) {
    this.set(BattleScene.shell(out.stageData));
    BattleScene.onRetreatChoice = null;
    BattleScene.onOrderChoice = null;
    BattleScene.playManual(out.handle, result => Game.finishManualBattle(result));
  },

  battle(result, stageData) {
    // 描画はレンダラに委譲する。UIは戦闘の中身を知らない。
    this.set(BattleScene.shell(stageData));
    // 撤退の答えを決着へ繋ぐ。BattleScene はゲーム状態を知らないままでよい。
    // 保留されていない戦闘（提案が出なかった／開幕の防衛戦）では settleBattle が false を返すだけ。
    BattleScene.onRetreatChoice = choice => Game.settleBattle(choice);
    // 号令の答え。名指しなら run.js が同じ種で計算し直した新しいタイムラインを返し、描画側が差し替える。
    BattleScene.onOrderChoice = unitId => Game.answerOrder(unitId);
    BattleScene.play(result.timeline);
  },

  // 結果画面の「技を覚えた」見せ場。notes にも同じ文が入るので、こちらは本人の一言を主役にする
  // （notes 側の1文と読み比べさせない。数値は出さない）。旧セーブ・技を覚えなかった戦いでは
  // lastBattle.unlocked が無いので何も出さない。
  skillUnlockPanel(b) {
    const list = b && Array.isArray(b.unlocked) ? b.unlocked : [];
    if (!list.length) return "";
    return `<div class="panel skill-unlock-panel">
      <h3>🗡 新しい技を覚えた</h3>
      ${list.map(u => `<div class="skill-unlock-row">
        <div><b>${U.esc(u.name)}</b>が【${U.esc(u.skillName)}】を覚えた</div>
        <div class="quote">「${U.esc(u.quote)}」</div>
      </div>`).join("")}
    </div>`;
  },

  // 経験で身についた共通特性（頑丈・しぶとい・担がれ慣れ・城の主）。
  // 技を覚えたパネルと同じ形。**数値は出さない**（何が身についたかと、本人の一言だけ）。
  // 身につかなかった決着・旧セーブには `earned` が無いので、その場合は何も出さない。
  earnedTraitPanel(b) {
    const list = b && Array.isArray(b.earned) ? b.earned : [];
    if (!list.length) return "";
    return `<div class="panel skill-unlock-panel earned-trait-panel">
      <h3>🏅 経験が身についた</h3>
      ${list.map(e => `<div class="skill-unlock-row">
        <div><b>${U.esc(e.name)}</b>は【${U.esc(e.traitName)}】になった</div>
        <div class="quote">「${U.esc(e.quote)}」</div>
      </div>`).join("")}
    </div>`;
  },

  result() {
    const st = Game.state;
    const b = st.lastBattle;
    const payrollReport = st.lastPayrollReport || {};
    const payrollPolicy = PAYROLL_POLICIES[payrollReport.policyId] || PAYROLL_POLICIES.regular;
    // 退いた戦闘は勝利でも敗北でもない第三の結末。見出しだけを差し替える。
    // **set() の第2引数で scene を明示すること。**見出し文字列から推定させると
    // `.game-scene-report` が外れて画面が崩れる（部門を畳んだときに一度踏んだ）。
    const retreated = !!b.retreated;
    const wiped = !!b.wiped;
    const lostOnPoints = !!b.lostOnPoints;
    const carried = (retreated || lostOnPoints)
      ? (b.contribution || []).filter(c => c.injured && !c.mercenary).map(c => c.name) : [];
    const fallen = wiped ? (b.fallen || []).map(f => f.name) : [];
    const relicsLeft = wiped ? (b.relicsLeft || []) : [];
    const banner = b.defense && b.defended
      ? `<div class="banner win">
        <h2>城を守った</h2>
        <div>${U.esc(b.army)}を退けた。押収した建材・食料は蔵に収まっている。</div>
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>`
      : b.defense && b.ransacked
      ? `<div class="banner rout">
        <h2>${b.castleFell ? "城が焼かれた" : "城が荒らされた"}</h2>
        <div>${b.castleFell
          ? `${U.esc(b.army)}に城を落とされた。だが魔王は生きている。${fallen.length ? `${U.esc(fallen.join("、"))}は戻らなかった。` : ""}軍を整え、次に備えよ。`
          : `${U.esc(b.army)}に城を荒らされた。`}${carried.length
          ? `${U.esc(carried.join("、"))}は担いで戻った。` : ""}</div>
        <ul class="notes">
          ${(b.ransacked.facilityBefore !== undefined && b.ransacked.facilityAfter !== undefined)
            ? `<li>施設Lv${b.ransacked.facilityBefore}→${b.ransacked.facilityAfter}</li>` : ""}
          ${(b.ransacked.foodBefore !== undefined && b.ransacked.foodAfter !== undefined)
            ? `<li>食料 ${b.ransacked.foodBefore}→${b.ransacked.foodAfter}</li>` : ""}
          ${b.ransacked.relic ? `<li>${U.esc(b.ransacked.relic)}を奪われた</li>` : ""}
          ${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}
        </ul>
      </div>`
      : wiped
      ? `<div class="banner wipe">
        <h2>全滅</h2>
        <div>${U.esc(b.army)}に敗れた。${fallen.length ? `${U.esc(fallen.join("、"))}は戻らなかった。` : ""}</div>
        <div>${[
          st.roster.length ? `城には ${st.roster.length}人が残っている` : "",
          relicsLeft.map(r => `${U.esc(r.name)}が蔵に残った`).join("、"),
          !st.roster.length ? `城に残る者はいない。金庫に ${st.gold}G` : ""
        ].filter(Boolean).join("　")}</div>
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>`
      : lostOnPoints
      ? `<div class="banner rout">
        <h2>敗走</h2>
        <div>${U.esc(b.army)}に押し返された。${carried.length
          ? `${U.esc(carried.join("、"))}は担いで戻った。` : ""}報酬は無い。</div>
        ${carried.length ? `<div class="retreat-injured">🩹 ${U.esc(carried.join("、"))}は負傷。
          次の戦いは出られない（留守番として働く）</div>` : ""}
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>`
      : retreated
      ? `<div class="banner retreat">
        <h2>撤退</h2>
        <div>${U.esc(b.army)} から退いた。${carried.length
          ? `${U.esc(carried.join("、"))}は生きている。` : ""}報酬は無い。</div>
        ${carried.length ? `<div class="retreat-injured">🩹 ${U.esc(carried.join("、"))}は負傷。
          次の戦いは出られない（留守番として働く）</div>` : ""}
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>`
      : `<div class="banner win">
        <h2>勝利！</h2>
        <div>${U.esc(b.army)} を撃退した</div>
        <ul class="notes">${b.notes.map(n => `<li>${U.esc(n)}</li>`).join("")}</ul>
      </div>`;
    this.set(`${this.hud()}
      ${banner}
      ${/* 敗因メモ（ニアミス）は「どこまで届いたか」を残す。全滅と敗走のときだけ出す。
           再起画面がほぼ出なくなった（再建の仕様）ので、ここに無いと二度と読まれない。 */
        (wiped || b.lostOnPoints) ? this.nearMissPanel(b.nearMiss) : ""}
      ${this.skillUnlockPanel(b)}
      ${this.earnedTraitPanel(b)}
      ${Game.canSeizeStronghold() ? (() => {
        const q = Game.seizeQuote();
        return `<div class="panel seize-panel">
        <h3>🏴 この拠点を接収するか</h3>
        <div class="muted">建設担当がいなくても、勝ち取った拠点をそのまま城へ組み込める。
          <b>このランで1度きり</b>だ。<br>
          代償：建材 <b>${q.need}</b>（備蓄 ${q.have}）を消費し、王国警戒度 <b>+${q.alertCost}</b>。
          奪った拠点は目立つ。以後の敵は少し強くなる。</div>
        <button class="primary wide" data-action="seize">🏴 接収して大型施設を選ぶ</button>
      </div>`; })() : ""}

      <div class="panel payroll-result">
        <h3>${payrollPolicy.icon} 給与報告：${U.esc(payrollPolicy.name)}</h3>
        <div>支払額 <b>${payrollReport.paid || 0}G</b>／通常額 ${payrollReport.base || 0}G</div>
        <div class="${(payrollReport.loyaltyDelta || 0) < 0 ? "negative" : "positive"}">勤務者の忠誠 ${payrollReport.loyaltyDelta > 0 ? "+" : ""}${payrollReport.loyaltyDelta || 0}</div>
      </div>
      ${b.synergies.length ? `<div class="panel"><h3>この戦いで働いたシナジー</h3><div class="syn-list">${
        b.synergies.map(n => `<div class="syn"><b>${U.esc(n)}</b></div>`).join("")}</div></div>` : ""}
      ${this.breakthroughPanel(b)}
      ${this.debtPanel()}
      ${this.facilityPanel(b)}
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
      <button class="primary wide" data-action="afterresult">次へ</button>`, "report");
    if (st.lastPromotions && st.lastPromotions.length && typeof Sound !== "undefined") Sound.cue("promotion");
  },

  // 敗北したが、まだ再起できる状態の画面
  defeat() {
    const st = Game.state;
    const b = st.lastBattle;
    const cp = st.checkpoint;
    const goldNow = cp ? cp.gold : st.gold;
    const goldAfter = Math.floor(goldNow / 2);
    return this.set(`<div class="defeat-chamber"><div class="banner lose">
        <h2>魔王軍、壊滅</h2>
        <div>${U.esc(b.army)} に敗北した</div>
      </div>
      ${this.nearMissPanel(b.nearMiss)}
      ${this.breakthroughPanel(b)}
      ${this.facilityPanel(b)}
      ${this.contributionPanel(b.contribution)}
      <div class="panel">
        <h3>全員を失い、金庫も空だ</h3>
        <div class="muted">
          時を巻き戻すか、この歩みを魔界史に刻むか。<br>
          巻き戻せば第${st.turn}作戦の採用面接まで戻る。応募者と作戦を選び直し、並べ直せ。<br>
          ただし軍の立て直しには金がかかる：所持金 <b class="gold">${goldNow}G → ${goldAfter}G</b><br>
          この機会は<b>このランで1度きり</b>だ。
        </div>
      </div>
      <div class="row">
        <button class="primary" data-action="retry">⟲ 再起する（残り ${st.retriesLeft} 回）</button>
        <button class="danger" data-action="concede">ここで終わる（歴史に刻む）</button>
      </div></div>`, "defeat");
  },

  // ハプニング画面。選択肢を出し、選んだ後は結果を見せてから採用へ進む。
  // ── イベントの本文を「地の文」と「台詞」に割る ────────────────
  // events.js の契約（text は1本の文字列）は変えない。本文中の 「…」 を台詞とみなし、
  // その直前に名前が出ている登場人物へ割り当てる。名前が無ければ直前の話者が続けて話す。
  // 誰にも割り当てられない台詞は地の文のまま残す。**嘘の話者を作らない**のが唯一の約束。
  // これで、台本側（E・H）は本文に「」を書くだけで立ち絵と吹き出しになる。
  eventCastList(cast) {
    return Object.keys(cast || {}).map(k => cast[k]).filter(m => m && m.name);
  },

  // before の中で「いちばん後ろに名前が出ている」者が話者。同じ行に2人いても取り違えない。
  eventSpeakerIn(before, speakers, previous) {
    let found = null, at = -1;
    for (const m of speakers) {
      const i = before.lastIndexOf(m.name);
      if (i > at) { at = i; found = m; }
    }
    const mormoAt = before.lastIndexOf("モルモ");
    if (mormoAt > at) return { name: "モルモ", mormo: true };
    if (found) return found;
    if (previous) return previous;
    // 登場人物が1人しかいない場面なら、名乗らなくても本人の台詞と分かる
    return speakers.length === 1 ? speakers[0] : null;
  },

  eventScript(text, cast) {
    const speakers = this.eventCastList(cast);
    const blocks = [];
    let previous = null;
    // 話者の付かない台詞は、前後の地の文と切り離さずに1つの段落へ戻す。
    // 「食堂に『払え』の張り紙があった。」を3つに割ると、かえって読みにくい。
    let pending = "";
    const flush = () => { if (pending.trim()) blocks.push({ say: null, body: pending.trim() }); pending = ""; };
    for (const line of String(text || "").split("\n")) {
      const quote = /「([^」]*)」/g;
      let cursor = 0, m;
      while ((m = quote.exec(line))) {
        const before = line.slice(cursor, m.index);
        const who = this.eventSpeakerIn(before, speakers, previous);
        cursor = m.index + m[0].length;
        if (!who) { pending += before + m[0]; continue; }
        pending += before;
        flush();
        previous = who.mormo ? previous : who;
        blocks.push({ say: who, body: m[1] });
      }
      pending += line.slice(cursor);
      flush();
    }
    return blocks;
  },

  eventExpressionFor(body) {
    const text = String(body || "");
    if (/泣|涙|悲|寂|すまな|ごめん|辞め|退職|死|葬|弔|つら|辛/.test(text)) return "tears";
    if (/得|儲|金|報酬|成功|勝|任せ|計画通り|いただ|へへ|ふふ|ニヤ|にや/.test(text)) return "smirk";
    if (/[！？!?]|まさか|なんだと|えっ|うわ|驚/.test(text)) return "surprise";
    return null;
  },

  eventFaceHtml(who, expression) {
    if (who.mormo) return `<span class="avatar mormo-face"><img src="assets/mormo/report.webp" alt=""></span>`;
    const id = who.tplId;
    if (expression && EVENT_EXPRESSIONS[id] && EVENT_EXPRESSIONS[id].includes(expression)) {
      const fallback = this.avatarHtml(who);
      return `<span class="avatar event-expression" data-fallback-html="${U.esc(fallback)}"><img
        src="assets/monsters/events/${U.esc(id)}/${U.esc(expression)}.webp" alt=""
        onerror="UI.eventExpressionError(this)"></span>`;
    }
    return this.avatarHtml(who);
  },

  eventExpressionError(img) {
    const holder = img && img.parentElement;
    if (!holder) return;
    holder.outerHTML = holder.dataset.fallbackHtml || "";
  },

  eventScriptHtml(text, cast) {
    return this.eventScript(text, cast).map(b => b.say
      ? `<div class="event-say${b.say.mormo ? " mormo" : ""}">${this.eventFaceHtml(b.say, this.eventExpressionFor(b.body))}
          <p class="event-bubble"><b>${U.esc(b.say.name)}</b>「${U.esc(b.body)}」</p></div>`
      : `<p class="event-line">${U.esc(b.body)}</p>`).join("");
  },

  // 登場人物の並び。誰の話か・いま忠誠がいくつかを見てから選ばせる。
  eventCastHtml(cast) {
    const list = this.eventCastList(cast);
    if (!list.length) return "";
    return `<div class="event-cast">${list.map(m => `<div class="event-cast-card">
      ${this.avatarHtml(m)}
      <div><b>${U.esc(m.name)}</b><small>${U.esc(m.race)}・忠誠${Math.round(m.loyalty)}</small></div>
    </div>`).join("")}</div>`;
  },

  event() {
    const st = Game.state;
    const ev = Game.currentEvent();

    // 選択済み → 結果を見せる
    if (!ev || st.eventOutcome) {
      const done = Game.resolveCast(st.eventCast || {});
      return this.set(`${this.hud()}
        <div class="event-desk resolved"><div class="event-seal">処理済</div>
        <div class="panel event-panel">
          <div class="event-kicker">魔王城・案件報告</div><h2>⚡ その後</h2>
          ${this.eventCastHtml(done)}
          <div class="event-text">${this.eventScriptHtml(st.eventOutcome || "", done)}</div>
        </div>
        <button class="primary wide" data-action="eventdone">次の応募者を面接する</button></div>`, "event");
    }

    const opts = Game.eventOptions().map(({ o, i }) =>
      `<button class="wide event-choice" data-action="eventpick" data-index="${i}">${
        U.esc(typeof o.label === "function" ? o.label(st) : o.label)}</button>`
    ).join("");

    this.set(`${this.hud()}
      <div class="event-desk"><div class="event-seal">至急</div>
      <div class="panel event-panel">
        <div class="event-kicker">モルモ提出・緊急案件</div><h2>⚡ ${U.esc(ev.title)}</h2>
        ${this.eventCastHtml(Game.resolveCast(st.pendingEvent.cast))}
        <div class="event-text">${this.eventScriptHtml(st.pendingEvent.text, Game.resolveCast(st.pendingEvent.cast))}</div>
      </div>
      <div class="event-options">${opts}</div></div>`, "event");
  },

  gameover(record, history) {
    this.set(`<div class="closure-file ${record.cleared ? "conquest" : "bankrupt"}">
      <div class="closure-form-title"><span>魔王軍事業終了届</span><b>第${record.gen}代</b></div>
      <div class="banner ${record.cleared ? "win" : "lose"}">
        <h2>${record.cleared ? "人間界を制圧した！" : "魔王軍、壊滅"}</h2>
        <div>${U.esc(record.cause)}</div>
      </div>
      ${record.buildName ? `<div class="panel build-name-panel">
        <div class="muted">この軍団は、魔界史にこう記された</div>
        <h2 class="build-name">「${U.esc(record.buildName)}」</h2>
        ${this.memoryLine(record)}
      </div>` : ""}
      ${!record.cleared ? (() => {
        const chosen = Game.state && Game.state.chosenLessonId;
        const offers = Game.lessonOffers(record);
        return `<div class="panel lesson-panel">
          <h3>🕮 この敗北から、何を学んだことにするか</h3>
          <div class="muted">選んだ教訓は<b>次代の魔王軍にだけ</b>引き継がれる。
            軍が強くなるわけではない。<b>面接に来る顔ぶれが変わる</b>。</div>
          <div class="mission-grid">${offers.map(l => `<div class="mission-card ${chosen === l.id ? "chosen" : ""}">
            <div class="mission-kind">${l.icon} 教訓</div>
            <h3>${U.esc(l.name)}</h3>
            <p>${U.esc(l.when)}</p>
            <div class="mission-purpose"><b>次代への影響</b><br><span>${U.esc(l.effect)}</span></div>
            <button class="primary wide" data-action="chooselesson" data-id="${U.esc(l.id)}"
              ${chosen === l.id ? "disabled" : ""}>${chosen === l.id ? "これを胸に刻んだ" : "これを胸に刻む"}</button>
          </div>`).join("")}</div>
        </div>`; })() : ""}
      <div class="panel">
        <h3>第${record.gen}代魔王軍の記録</h3>
        ${this.recordHighlights(record, this.hasMixedChainVersions(history))}
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
      </div></div>`, "gameover");
  },

  history(list) {
    const mixedChainVersions = this.hasMixedChainVersions(list);
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
        ${r.buildName ? `<div class="build-name">「${U.esc(r.buildName)}」</div>` : ""}
        ${this.memoryLine(r)}
        ${this.recordHighlights(r, mixedChainVersions)}
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
        ${(r.departed && r.departed.length) ? `<div class="departed-list">
          <h4>去った者たち</h4>
          ${r.departed.map(d => `<div class="departed-row">
            ${this.icon(d.race)} ${U.esc(d.name)}（${U.esc(d.race)}）
            ${U.esc(this.RELIC_CAUSE_JA[d.cause] || d.cause)}${d.army ? `・${U.esc(d.army)}` : ""}
            ・${d.battles}戦${d.wins}勝${d.relicName ? `　🏺 ${U.esc(d.relicName)}` : ""}
          </div>`).join("")}
        </div>` : ""}
      </div>`).join("");
    this.set(`<div class="panel">
        <h2>📖 魔界史</h2>
        <div class="muted">これまでに滅んだ（あるいは君臨した）魔王軍の記録。</div>
        ${mixedChainVersions ? `<div class="muted chain-version-note">CHAINは数え方が異なるため、旧定義と新定義の値を世代間で直接比較しません。</div>` : ""}
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
