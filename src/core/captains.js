// 敵将（docs/SPEC_CAPTAINS_BD_2026-09-15.md）：名簿の状態・隊列への乗せ方・最終戦の顔ぶれ・不意打ちの純粋関数。
// ブラウザAPIも Game も触らない。run.js（Opus）はここを呼ぶだけにする。
//
// 状態（run.js が st に持つ）：
//   st.captains = { [id]: { status: "unseen" | "alive" | "slain" | "spared" | "hired", seen: n } }
//   status の意味：unseen＝まだ会っていない／alive＝会ったが討っていない（逃げた・負けた）／slain＝討った／spared＝見逃した／hired＝雇った
const Captains = {
  data()  { return typeof ENEMY_CAPTAINS !== "undefined" ? ENEMY_CAPTAINS : {}; },
  rules() { return typeof CAPTAIN_RULES !== "undefined" ? CAPTAIN_RULES : { everyNSettles: 3, ambushMax: 0.15, hallShare: 0.4, bountyMult: 1.5, fame: 1, heroSlots: 3, reappear: false }; },
  get(id) { const c = this.data()[id]; return c ? Object.assign({ id }, c) : null; },
  ids()   { return Object.keys(this.data()); },

  init(st) {
    if (!st.captains || typeof st.captains !== "object") st.captains = {};
    return st.captains;
  },
  state(st, id) { return this.init(st)[id] || { status: "unseen", seen: 0 }; },
  mark(st, id, status) {
    const s = this.init(st);
    const cur = s[id] || { status: "unseen", seen: 0 };
    s[id] = { status, seen: cur.seen + (status === "alive" ? 1 : 0) };
    return s[id];
  },
  // 戦闘の結果（Battle の result）から状態を更新する。勝った戦いで討たれた敵将は slain、見逃し／雇用は result.spared。
  settle(st, result, captainIds) {
    const sparedIds = new Set((result.spared || []).map(x => x.id));
    for (const x of result.spared || []) this.mark(st, x.id, x.kind === "hire" ? "hired" : "spared");
    for (const id of captainIds || []) {
      if (sparedIds.has(id)) continue;
      // 隊列に乗せた敵将が倒れて終わったか（timeline の dead）。倒れずに終われば alive（逃げた）
      const died = (result.timeline || []).some(e => (e.type === "attack" || e.type === "splash") && e.dead && e.toCaptain === id);
      this.mark(st, id, died && result.victory ? "slain" : "alive");
    }
  },

  // 隊列に敵将を乗せる。先頭（隊長）に置き、役と癖と印（captain）を付ける。scale は run.js の敵の倍率。
  // grows がある者は seen 回数で +15%/回（ポルカ）。
  attach(units, id, st, scale) {
    const c = this.get(id); if (!c) return units.slice();
    const seen = this.state(st, id).seen;
    const growth = c.grows ? 1 + 0.15 * Math.min(c.grows, seen) : 1;
    const k = (scale || 1) * growth;
    const stat = (v, min) => Math.max(min, Math.round(v * k));
    const unit = {
      name: c.name, role: c.role, icon: c.icon, hp: stat(c.hp, 1), atk: stat(c.atk, 1), def: stat(c.def, 0), spd: c.spd,
      traits: (c.traits || []).slice(), introQuote: (c.lines && c.lines.enter && c.lines.enter[0]) || "",
      captain: { id, offer: c.offer || null }
    };
    return [unit].concat(units);
  },

  // この決着で「⚠ ○○がいる」札を出すか、出すなら誰か。糸ごとに一人ずつ順に。討った者・雇った者・見逃した者（reappear=false）は出ない。
  // thread は "village" | "kingdom" | "tribe"（部族は首領がその部族圏の守備に乗るので、ここでは village/kingdom だけ返す）
  pickForCard(st, thread, settles) {
    const r = this.rules();
    if ((settles || 0) % r.everyNSettles !== r.everyNSettles - 1) return null;
    const pool = this.ids().filter(id => {
      const c = this.get(id); const s = this.state(st, id);
      if (c.thread !== thread || c.gate || c.tribe) return false;
      if (s.status === "slain" || s.status === "hired") return false;
      if (s.status === "spared" && !r.reappear) return false;
      if (c.grows && s.seen >= c.grows) return false;   // ポルカは3回まで
      return true;
    });
    return pool.length ? pool[(settles || 0) % pool.length] : null;
  },

  // 不意打ち：警戒 0〜10 で 0〜ambushMax。rng は 0〜1。当たれば { kind: "captain", id } か { kind: "hall" }（先代の英雄は run.js が殿堂から写す）
  ambush(st, alert, rng, hallAvailable) {
    const r = this.rules();
    const p = Math.max(0, Math.min(10, alert || 0)) / 10 * r.ambushMax;
    if ((rng ? rng() : 1) >= p) return null;
    if (hallAvailable && (rng ? rng() : 1) < r.hallShare) return { kind: "hall" };
    const pool = this.ids().filter(id => { const c = this.get(id); const s = this.state(st, id); return !c.gate && !c.tribe && s.status !== "slain" && s.status !== "hired" && s.status !== "spared"; });
    return pool.length ? { kind: "captain", id: pool[Math.floor((rng ? rng() : 0) * pool.length)] } : null;
  },

  // 最終戦の顔ぶれ：勇者アレン（base の commander）＋ heroSlots 枠。討たれず雇われもしなかった joinsHero の者（会っていない者も含む）から埋め、
  // 足りなければ base の残り（既定の3人）。雇った者は run.js が名簿に持っているので、ここでは外すだけ。
  heroParty(st, baseUnits, scale) {
    const r = this.rules();
    const hero = baseUnits.find(u => u.role === "commander") || baseUnits[0];
    const others = baseUnits.filter(u => u !== hero);
    const survivors = this.ids().filter(id => {
      const c = this.get(id); const s = this.state(st, id);
      return c.joinsHero && s.status !== "slain" && s.status !== "hired";
    });
    // 会った者（alive／spared）を先に、会っていない者（unseen）を後に
    survivors.sort((a, b) => (this.state(st, a).status === "unseen" ? 1 : 0) - (this.state(st, b).status === "unseen" ? 1 : 0));
    const picked = survivors.slice(0, r.heroSlots).map(id => {
      const c = this.get(id); const k = scale || 1;
      return { name: c.short || c.name, role: c.role, icon: c.icon, hp: Math.round(c.hp * k), atk: Math.round(c.atk * k), def: Math.round(c.def * k), spd: c.spd, traits: (c.traits || []).slice(), captain: { id, offer: null } };
    });
    const fill = others.slice(0, Math.max(0, r.heroSlots - picked.length));
    return [hero].concat(picked, fill);
  },

  // 魔界史（殿堂の一行）の材料：討った・雇った・見逃した敵将の名前。
  summary(st) {
    const out = { slain: [], hired: [], spared: [] };
    for (const id of this.ids()) { const s = this.state(st, id); if (out[s.status]) out[s.status].push(this.get(id).short || id); }
    return out;
  }
};
