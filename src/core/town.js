// 城下町の経済（2026-09-12）。税・施設・銀行・家計簿。状態は st.town に閉じ、run.js からは決着ごとに Town.settle() を呼ぶだけ。
// 難しくしない：効果は一文、数字は3段階、1決着に建てるのは1件。
const Town = {
  rules() { return typeof TOWN_RULES !== "undefined" ? TOWN_RULES : { taxPerTerritory: { 1: 2 }, buildsPerSettle: 1, jobDiscount: 0.2, bank: { choices: [10, 20, 30], cap: 50, interest: 0.1 } }; },
  facilities() { return typeof TOWN_FACILITIES !== "undefined" ? TOWN_FACILITIES : []; },
  facility(id) { return this.facilities().find(f => f.id === id) || null; },

  // 状態の器。旧セーブには無いので migrateState / newRun から呼ぶ。
  init(st) {
    if (!st) return null;
    if (!st.town || typeof st.town !== "object") st.town = {};
    const t = st.town;
    if (!t.lv || typeof t.lv !== "object") t.lv = {};
    for (const f of this.facilities()) if (typeof t.lv[f.id] !== "number") t.lv[f.id] = 0;
    if (typeof t.debt !== "number") t.debt = 0;
    if (typeof t.builtTurn !== "number") t.builtTurn = 0;
    if (typeof t.exchanged !== "number") t.exchanged = 0;
    if (typeof t.exchangedTurn !== "number") t.exchangedTurn = 0;
    if (!Array.isArray(t.ledger)) t.ledger = [];
    if (typeof t.seized !== "number") t.seized = 0;
    return t;
  },
  lv(st, id) { return Number(((st.town || {}).lv || {})[id]) || 0; },

  // ── 税 ──
  territories(st) { return Math.max(0, Number(st.conquest) || 0); },
  taxPerTerritory(st) {
    const per = this.rules().taxPerTerritory;
    return (per[st.act || 1] ?? per[1] ?? 2) + this.lv(st, "market");
  },
  taxPerSettle(st) { return this.territories(st) * this.taxPerTerritory(st); },

  // ── 効果（run.js が読む。無ければ 0） ──
  spiritMaxBonus(st) { return this.lv(st, "smithy"); },
  unlockBonus(st, key) {
    const lv = this.lv(st, "lab");
    if (key === "species") return lv;
    return lv >= 3 ? 2 : 0;
  },
  armyBonus(st) { return this.lv(st, "hostel"); },
  healBonus(st) { return this.lv(st, "hostel") >= 2 ? 1 : 0; },
  salaryDiscount(st) { const lv = this.lv(st, "tavern"); return lv >= 2 ? lv - 1 : 0; },

  // ── 建設 ──
  jobMatch(game, f) {
    if (!f.jobs || !f.jobs.length) return false;
    return game.departmentRoster("home").some(m => f.jobs.some(w => String(m.job || "").includes(w)));
  },
  buildCost(game, id) {
    const st = game.state, f = this.facility(id);
    if (!f) return null;
    const lv = this.lv(st, id);
    if (lv >= f.cost.length) return null;
    const base = f.cost[lv];
    const discount = this.jobMatch(game, f) ? this.rules().jobDiscount : 0;
    return { gold: Math.max(1, Math.round(base.gold * (1 - discount))), materials: base.materials, discount: discount > 0 };
  },
  canBuild(game, id) {
    const st = game.state, t = this.init(st), cost = this.buildCost(game, id);
    if (!cost) return { ok: false, why: "これ以上は伸びない" };
    if (t.builtTurn === st.turn && t.builtCount >= this.rules().buildsPerSettle) return { ok: false, why: "建てられるのは1決着に1件" };
    if ((st.gold || 0) < cost.gold) return { ok: false, why: `金が足りない（${cost.gold}G）` };
    if ((st.materials || 0) < cost.materials) return { ok: false, why: `建材が足りない（${cost.materials}）` };
    return { ok: true, why: null };
  },
  build(game, id) {
    const st = game.state, t = this.init(st);
    const can = this.canBuild(game, id);
    if (!can.ok) return false;
    const cost = this.buildCost(game, id);
    st.gold -= cost.gold;
    st.materials -= cost.materials;
    t.lv[id] += 1;
    if (t.builtTurn !== st.turn) { t.builtTurn = st.turn; t.builtCount = 0; }
    t.builtCount = (t.builtCount || 0) + 1;
    this.ledger(st).build += cost.gold;
    game.save();
    return { id, lv: t.lv[id], cost };
  },

  // ── 工場の両替（建材2 → 金3。決着ごとに Lv 回まで） ──
  exchangeLeft(st) {
    const t = this.init(st);
    const lv = this.lv(st, "factory");
    if (t.exchangedTurn !== st.turn) return lv;
    return Math.max(0, lv - (t.exchanged || 0));
  },
  canExchange(st) { return this.exchangeLeft(st) > 0 && (st.materials || 0) >= 2; },
  exchange(game) {
    const st = game.state, t = this.init(st);
    if (!this.canExchange(st)) return false;
    if (t.exchangedTurn !== st.turn) { t.exchangedTurn = st.turn; t.exchanged = 0; }
    st.materials -= 2; st.gold += 3; t.exchanged += 1;
    this.ledger(st).exchange += 3;
    game.save();
    return true;
  },

  // ── 魔界銀行 ──
  canBorrow(st, amount) {
    const b = this.rules().bank;
    return b.choices.includes(amount) && (this.init(st).debt + amount) <= b.cap;
  },
  borrow(game, amount) {
    const st = game.state, t = this.init(st);
    if (!this.canBorrow(st, amount)) return false;
    t.debt += amount; st.gold += amount;
    game.save();
    return { debt: t.debt, line: U.pick((typeof TOWN_BANK_LINES !== "undefined" && TOWN_BANK_LINES.borrow) || ["……"]) };
  },
  repay(game, amount) {
    const st = game.state, t = this.init(st);
    const pay = Math.min(t.debt, Math.max(0, Math.floor(amount)), st.gold || 0);
    if (pay <= 0) return false;
    t.debt -= pay; st.gold -= pay;
    game.save();
    return { paid: pay, debt: t.debt, line: U.pick((typeof TOWN_BANK_LINES !== "undefined" && TOWN_BANK_LINES.repay) || ["……"]) };
  },
  interest(st) { const t = this.init(st); return t.debt > 0 ? Math.max(1, Math.ceil(t.debt * this.rules().bank.interest)) : 0; },

  // ── 家計簿（決着ごとに1枚。直近8枚） ──
  ledger(st) {
    const t = this.init(st);
    let row = t.ledger[t.ledger.length - 1];
    if (!row || row.turn !== st.turn) {
      row = { turn: st.turn, tax: 0, interest: 0, build: 0, exchange: 0, seized: null, ransacked: false };
      t.ledger.push(row);
      if (t.ledger.length > 8) t.ledger.shift();
    }
    return row;
  },

  // ── 決着ごとの処理（run.js の processDepartments の末尾から）。税を入れ、利子を払い、酒場で忠誠、払えなければ差し押さえ ──
  settle(game, notes, opts = {}) {
    const st = game.state, t = this.init(st);
    const row = this.ledger(st);
    row.ransacked = !!opts.ransacked;
    const tax = opts.ransacked ? 0 : this.taxPerSettle(st);
    if (tax > 0) { st.gold += tax; row.tax += tax; notes.push(`領地${this.territories(st)}からの税収 +${tax}G`); }
    else if (opts.ransacked && this.territories(st) > 0) notes.push("荒らされたので、この決着の税収は無い");
    const tavern = this.lv(st, "tavern");
    if (tavern > 0) {
      for (const m of game.departmentRoster("home")) m.loyalty = U.clamp((m.loyalty || 0) + tavern, 0, 100);
      notes.push(`酒場で留守番の忠誠 +${tavern}`);
    }
    const interest = this.interest(st);
    if (interest > 0) {
      if ((st.gold || 0) >= interest) { st.gold -= interest; row.interest += interest; notes.push(`魔界銀行へ利子 ${interest}G（残高 ${t.debt}G）`); }
      else {
        // 差し押さえ：いちばん高い施設が1段落ちる。人は取られない
        const top = this.facilities().map(f => ({ f, lv: this.lv(st, f.id) })).filter(x => x.lv > 0).sort((a, b) => b.lv - a.lv)[0];
        st.gold = 0;
        if (top) { t.lv[top.f.id] -= 1; t.seized += 1; row.seized = top.f.id; notes.push(`利子が払えず、${top.f.name}が差し押さえられた（Lv${top.lv}→${top.lv - 1}）`); }
        else notes.push(`利子が払えない……銀行員がため息をついた（残高 ${t.debt}G）`);
      }
    }
    return { tax, interest };
  },

  // 表示用のまとめ
  summary(st) {
    const t = this.init(st);
    return { tax: this.taxPerSettle(st), territories: this.territories(st), perTerritory: this.taxPerTerritory(st), debt: t.debt, interest: this.interest(st) };
  }
};

if (typeof module !== "undefined") module.exports = { Town };
