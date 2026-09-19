// 城下町の経済（2026-09-12）。税・施設・銀行・家計簿。状態は st.town に閉じ、run.js からは決着ごとに Town.settle() を呼ぶだけ。
// 難しくしない：効果は一文、数字は3段階、1決着に建てるのは1件。
const Town = {
  rules() { return typeof TOWN_RULES !== "undefined" ? TOWN_RULES : { taxPerTerritory: { 1: 2 }, buildsPerSettle: 1, jobDiscount: 0.2, advances: [] }; },
  facilities() { return typeof TOWN_FACILITIES !== "undefined" ? TOWN_FACILITIES : []; },
  facility(id) { return this.facilities().find(f => f.id === id) || null; },

  // 状態の器。旧セーブには無いので migrateState / newRun から呼ぶ。
  init(st) {
    if (!st) return null;
    if (!st.town || typeof st.town !== "object") st.town = {};
    const t = st.town;
    if (!t.lv || typeof t.lv !== "object") t.lv = {};
    for (const f of this.facilities()) if (typeof t.lv[f.id] !== "number") t.lv[f.id] = 0;
    // 前借り（docs/SPEC_BANK_ADVANCE_2026-09-19.md §3）。契約は同時に1つ。信用は2値。
    if (t.advance === undefined) t.advance = null;
    if (typeof t.credit !== "boolean") t.credit = true;
    if (!t.advanceRecord || typeof t.advanceRecord !== "object") t.advanceRecord = { borrowed: 0, repaid: 0, seized: 0 };
    // 旧セーブの利子つき借金は帳消しにする（利子そのものを捨てたので、残高の置き場が無い）。
    // 知らせる1行は run.js の migrateState が日誌へ積む（ここは状態だけ直す）。
    if (typeof t.debt === "number" && t.debt > 0) { t.debtForgiven = t.debt; t.debt = 0; }
    if (typeof t.debt !== "number") t.debt = 0;
    if (typeof t.builtTurn !== "number") t.builtTurn = 0;
    if (typeof t.exchanged !== "number") t.exchanged = 0;
    if (typeof t.exchangedTurn !== "number") t.exchangedTurn = 0;
    if (!Array.isArray(t.ledger)) t.ledger = [];
    // 施設ごとの「生んだもの」（docs/SPEC_FACILITY_DETAIL_2026-09-13.md §2）。
    // 数字は施設ごとに1本だけ。旧セーブは空（詳細では「まだ記録なし」）。
    if (!t.stats || typeof t.stats !== "object") t.stats = {};
    if (typeof t.seized !== "number") t.seized = 0;
    return t;
  },
  lv(st, id) { return Number(((st.town || {}).lv || {})[id]) || 0; },

  // ── 生んだもの（詳細画面が読む数字1本） ──
  // 加算の入口はここだけ。run.js からも Town.stat(st, id, n) で足す。
  statOf(st, id) {
    const t = this.init(st);
    if (!t.stats[id]) t.stats[id] = { built: 0, upgraded: [], value: 0 };
    const row = t.stats[id];
    if (typeof row.value !== "number") row.value = 0;
    if (!Array.isArray(row.upgraded)) row.upgraded = [];
    return row;
  },
  stat(st, id, n) {
    if (!st || !id || !n) return 0;
    const row = this.statOf(st, id);
    row.value += Number(n) || 0;
    return row.value;
  },
  // 外（run.js・events.js・battle への options）から読む入口。lv と同じだが、
  // 「城下町の施設のレベル」という意味で呼び分けられるようにしてある。
  level(st, id) { return this.lv(st, id); },
  // 町の6つ／軍の2つ。城下町の札の見出しと、決着の報告が読む。
  groupOf(f) { return (f && f.group) || "town"; },
  facilitiesOf(group) { return this.facilities().filter(f => this.groupOf(f) === group); },

  // 施設を1つ、1段だけ落とす。**荒らし（防衛戦の負け）・銀行の差し押さえ・
  // 事件の取り立ての3つが共用する唯一の入口**（通知の文は呼び元が書く）。
  // 落とすのは一番 Lv が高いもの。同点なら値段が高いもの（失うと痛い方を残さない）。
  demolishOne(st) {
    const t = this.init(st);
    const costOf = f => ((f.cost || [])[0] || {}).gold || 0;
    const top = this.facilities()
      .map(f => ({ f, lv: this.lv(st, f.id) }))
      .filter(x => x.lv > 0)
      .sort((a, b) => (b.lv - a.lv) || (costOf(b.f) - costOf(a.f)))[0];
    if (!top) return null;
    t.lv[top.f.id] -= 1;
    // 施設が落ちたことを決着の画面（UI.result）が読む。音を鳴らすためだけの控えで、
    // 進行には使わない。**run.js は触らずここで完結させる**（差し押さえ・荒らし・
    // 取り立ての3経路が必ずここを通るので、1か所で足りる）。
    t.lastDemolished = { id: top.f.id, lv: top.lv - 1, turn: Number(st.turn) || 0 };
    return { id: top.f.id, name: top.f.name, icon: top.f.icon, from: top.lv, to: top.lv - 1 };
  },

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
    const row = this.statOf(st, id);
    if (t.lv[id] === 1) row.built = Number(st.turn) || 0;
    else row.upgraded.push(Number(st.turn) || 0);
    if (t.builtTurn !== st.turn) { t.builtTurn = st.turn; t.builtCount = 0; }
    t.builtCount = (t.builtCount || 0) + 1;
    this.ledger(st).build += cost.gold;
    game.save();
    return { id, lv: t.lv[id], cost };
  },

  // ── 工場の両替（建材2 → 金3。決着ごとに Lv 回まで） ──
  // 工場が無くても「金4 → 建材2」だけは決着ごとに 1 回できる（行商）。建材 0 で工場が建てられない詰みを防ぐ（2026-09-13 試遊）。
  exchangeLeft(st, dir) {
    const t = this.init(st);
    const lv = this.lv(st, "factory");
    const cap = dir === "toMaterials" ? Math.max(lv, 1) : lv;
    if (t.exchangedTurn !== st.turn) return cap;
    return Math.max(0, cap - (t.exchanged || 0));
  },
  EXCHANGE: { toGold: { materials: 2, gold: 3 }, toMaterials: { gold: 4, materials: 2 } },   // 建材2→金3／金4→建材2（建材は渋いので逆向きも、2026-09-13）
  canExchange(st) { return this.exchangeLeft(st) > 0 && (st.materials || 0) >= this.EXCHANGE.toGold.materials; },
  canExchangeBack(st) { return this.exchangeLeft(st, "toMaterials") > 0 && (st.gold || 0) >= this.EXCHANGE.toMaterials.gold; },
  exchange(game) {
    const st = game.state, t = this.init(st);
    if (!this.canExchange(st)) return false;
    if (t.exchangedTurn !== st.turn) { t.exchangedTurn = st.turn; t.exchanged = 0; }
    st.materials -= this.EXCHANGE.toGold.materials; st.gold += this.EXCHANGE.toGold.gold; t.exchanged += 1;
    this.ledger(st).exchange += this.EXCHANGE.toGold.gold;
    if (this.lv(st, "factory") > 0) this.stat(st, "factory", 1);
    game.save();
    return true;
  },
  exchangeBack(game) {
    const st = game.state, t = this.init(st);
    if (!this.canExchangeBack(st)) return false;
    if (t.exchangedTurn !== st.turn) { t.exchangedTurn = st.turn; t.exchanged = 0; }
    st.gold -= this.EXCHANGE.toMaterials.gold; st.materials += this.EXCHANGE.toMaterials.materials; t.exchanged += 1;
    this.ledger(st).exchange -= this.EXCHANGE.toMaterials.gold;
    if (this.lv(st, "factory") > 0) this.stat(st, "factory", 1);
    game.save();
    return true;
  },

  // ── 魔界銀行の前借り（docs/SPEC_BANK_ADVANCE_2026-09-19.md）──
  // 借りるときに担保の人物を1人指名する。その者の戦功で借りられる口が決まる。
  // 利子は無い。返す額・期限は契約時に確定する（決着ごとの残高計算はしない）。
  advances() { return this.rules().advances || []; },
  advanceOf(id) { return this.advances().find(a => a.id === id) || null; },
  advance(st) { return this.init(st).advance || null; },
  line(key) { return U.pick((typeof TOWN_BANK_LINES !== "undefined" && TOWN_BANK_LINES[key]) || ["……"]); },

  // その人物を担保に出して借りられる口（戦功で決まる）。
  advancesFor(st, monster) {
    const merit = (monster && monster.merit) || 0;
    return this.advances().filter(a => merit >= a.merit);
  },
  canBorrow(st, id, uid) {
    const t = this.init(st);
    if (!t.credit || t.advance) return false;              // 踏み倒した後・契約中は借りられない
    const spec = this.advanceOf(id); if (!spec) return false;
    const monster = (st.roster || []).find(m => m.uid === uid);
    if (!monster) return false;
    return ((monster.merit || 0) >= spec.merit);
  },
  borrow(game, id, uid) {
    const st = game.state, t = this.init(st);
    if (!this.canBorrow(st, id, uid)) return false;
    const spec = this.advanceOf(id);
    t.advance = { id: spec.id, gold: spec.gold, repay: spec.repay, settlesLeft: spec.settles, uid, overdue: false };
    t.advanceRecord.borrowed += 1;
    st.gold += spec.gold;
    game.save();
    return { advance: { ...t.advance }, line: this.line("borrow") };
  },
  // 期限前でもいつでも返せる（額は確定しているので割引は無い）。
  repay(game) {
    const st = game.state, t = this.init(st);
    const a = t.advance;
    if (!a || (st.gold || 0) < a.repay) return false;
    st.gold -= a.repay;
    t.advance = null;
    t.advanceRecord.repaid += 1;
    game.save();
    return { paid: a.repay, line: this.line("repay") };
  },
  // 担保の者が名簿から消えたら、代わりを立てる（run.js が決着の頭で呼ぶ）。
  collateralGone(st) {
    const a = this.advance(st);
    return !!a && !(st.roster || []).some(m => m.uid === a.uid);
  },
  reassign(game, uid) {
    const t = this.init(game.state);
    if (!t.advance || !(game.state.roster || []).some(m => m.uid === uid)) return false;
    t.advance.uid = uid;
    game.save();
    return true;
  },

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
    if (tax > 0) {
      st.gold += tax; row.tax += tax; notes.push(`領地${this.territories(st)}からの税収 +${tax}G`);
      // 市場が生んだもの＝市場が無ければ入らなかった上乗せ分だけ
      if (this.lv(st, "market") > 0) this.stat(st, "market", this.territories(st) * this.lv(st, "market"));
    }
    else if (opts.training && this.territories(st) > 0) notes.push("稽古の日は徴税に出ない（税収は無い）");
    else if (opts.ransacked && this.territories(st) > 0) notes.push("荒らされたので、この決着の税収は無い");
    const tavern = this.lv(st, "tavern");
    if (tavern > 0) {
      let healed = 0;
      for (const m of game.departmentRoster("home")) {
        const before = m.loyalty || 0;
        m.loyalty = U.clamp(before + tavern, 0, 100);
        healed += m.loyalty - before;
      }
      if (healed > 0) this.stat(st, "tavern", healed);
      notes.push(`酒場で留守番の忠誠 +${tavern}`);
    }
    // 鍛冶場の貯めた気合は測りにくいので、鍛冶場があった決着の数を数える（§2の表）
    if (this.lv(st, "smithy") > 0) this.stat(st, "smithy", 1);
    // 前借りの期限。決着ごとに1つ減らし、0 になったら返済（払えなければ run.js が2択を出す）。
    // 利子の毎決着処理と施設の差し押さえは廃止した（docs/SPEC_BANK_ADVANCE_2026-09-19.md §2-6）。
    let advance = null;
    const a = t.advance;
    if (a && !a.overdue) {
      a.settlesLeft -= 1;
      if (a.settlesLeft <= 0) {
        if ((st.gold || 0) >= a.repay) {
          st.gold -= a.repay;
          row.interest += a.repay;            // 家計簿の「銀行へ」の列を流用する（列は増やさない）
          t.advance = null;
          t.advanceRecord.repaid += 1;
          notes.push(`魔界銀行へ ${a.repay}G を返済。完済（所持金 ${st.gold}G）`);
          advance = { settled: "repaid", repay: a.repay };
        } else {
          advance = { settled: "overdue", repay: a.repay, uid: a.uid };   // 決め方は run.js が聞く
        }
      } else {
        notes.push(`${this.line("remind")}。あと${a.settlesLeft}決着で ${a.repay}G`);
        advance = { settled: null, left: a.settlesLeft, repay: a.repay };
      }
    }
    return { tax, interest: 0, advance };
  },

  // 表示用のまとめ
  summary(st) {
    const t = this.init(st);
    return { tax: this.taxPerSettle(st), territories: this.territories(st), perTerritory: this.taxPerTerritory(st),
      advance: t.advance ? { ...t.advance } : null, credit: t.credit !== false };
  }
};

if (typeof module !== "undefined") module.exports = { Town };
