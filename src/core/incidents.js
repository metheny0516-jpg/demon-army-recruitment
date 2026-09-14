// 噂の札の器（docs/SPEC_INCIDENTS_IMPL_2026-09-14.md 2・3節）。
//
// 一文で：**決着ごとに、条件を満たす札を1枚だけ作戦会議の端に出す。めくった人だけに起き、
// 結果は隠れた状態で分岐し、「なぜ」欄が痕跡を名指しする。**
//
// ここが持つのは「出す・めくる・やめる・なぜを書く」だけ。
//   - 文と条件は `src/data/incidents.js`（CodeX）
//   - 効果は `Game.INCIDENT_EFFECTS`（run.js）
//   - 描画は `src/ui/ui.js` と `src/ui/town_ui.js`
// 既存の `events.js`（自然発生の事件）は触らない。二重化を避けるため、B の札も同じ器で動かす。
const Incidents = {
  MAX_OFFERED: 2,       // 同時に出る札（2節）
  EXPIRE_TURNS: 3,      // めくらなければ3決着で消える
  DRY_LIMIT: 3,         // 乾き（8-3）：0 の決着が3回続いたら次だけ痕跡1本で判定する
  RECENT: 60,           // 痕跡は直近60決着ぶんだけ見る（7節の落とし穴。Traces.MAX は 400）
  TIER_ORDER: { big: 0, mid: 1, small: 2 },

  cards() { return (typeof INCIDENTS !== "undefined" && Array.isArray(INCIDENTS)) ? INCIDENTS : []; },
  card(id) { return this.cards().find(c => c && c.id === id) || null; },

  // 状態の器。newRun と migrateState の両方から呼ぶ（片方だけだと旧セーブで落ちる）。
  init(st) {
    if (!st) return null;
    if (!st.incidents || typeof st.incidents !== "object") st.incidents = {};
    const inc = st.incidents;
    if (!inc.offered || typeof inc.offered !== "object") inc.offered = {};
    if (!inc.done || typeof inc.done !== "object") inc.done = {};
    if (typeof inc.dry !== "number") inc.dry = 0;
    if (typeof inc.active !== "number") inc.active = 0;
    return inc;
  },

  // ── 主役 ────────────────────────────────────────────────
  // 人（uid 固定）／種族／施設。種族と施設の札は、元の痕跡の持ち主が死んでも続く（7-6）。
  unitOf(st, uid) { return (st.roster || []).find(m => m.uid === uid) || null; },

  // その札の主役になれる者（unit の札は「いちばん関係の深い1人」を出すときに決める）。
  // データ側（src/data/incidents.js）の subject は
  //   { kind:"unit", uid?, race?, tplId?, rank?, count? } / { kind:"race", race } / { kind:"facility", id }
  subjectCandidates(st, card) {
    const s = card.subject || {};
    const roster = st.roster || [];
    if (s.kind === "unit") {
      if (s.uid !== undefined && s.uid !== null) return roster.filter(m => m.uid === s.uid);
      return roster.filter(m => (!s.race || m.race === s.race) && (!s.tplId || m.tplId === s.tplId)
        && (!s.rank || m.rankId === s.rank));
    }
    if (s.kind === "race") return roster.filter(m => m.race === s.race);
    return [];   // facility は人を主役に持たない
  },
  // 固定の主役を決める：関係する痕跡がいちばん多い者（同数なら名簿順）。
  // 乱数を使わないので、同じ状態なら誰が主役かは毎回同じになる。
  pickSubject(st, card) {
    const list = this.subjectCandidates(st, card);
    if (!list.length) return null;
    const count = uid => (st.traces || []).filter(t => t.subject === uid
      && (card.traces || []).includes(t.kind)).length;
    return list.reduce((best, m) => count(m.uid) > count(best.uid) ? m : best, list[0]);
  },

  // 主役がまだ生きているか（unit の戦死・解雇・逃亡、race の全滅、facility の Lv0 で失効）
  subjectAlive(st, card, subjectUid) {
    const s = card.subject || {};
    if (s.kind === "facility") {
      return (typeof Town !== "undefined" ? Town.lv(st, s.id) : 0) > 0;
    }
    // 二人組の札（general_duel）は二人とも要る
    if (s.kind === "unit" && (s.count || 1) > 1) return this.subjectCandidates(st, card).length >= s.count;
    if (s.kind === "unit" && subjectUid !== undefined && subjectUid !== null) {
      return !!this.unitOf(st, subjectUid);
    }
    return this.subjectCandidates(st, card).length > 0;
  },

  // ── 痕跡 ────────────────────────────────────────────────
  // その札に関係する痕跡（主役に紐づくものだけ）。新しい順。
  relatedTraces(st, card, subjectUid) {
    if (typeof Traces === "undefined") return [];
    const kinds = Array.isArray(card.traces) ? card.traces : [];
    if (!kinds.length) return [];
    const all = Traces.query(st.traces || [], { kinds });
    const newest = all.length ? all[0].seq : 0;
    const floor = newest - this.RECENT * 8;      // 1決着あたり 5〜8 本。だいたい直近60決着ぶん
    const s = card.subject || {};
    const ids = new Set(this.subjectCandidates(st, card).map(m => m.uid));
    return all.filter(trace => {
      if (trace.seq < floor) return false;
      if (s.kind === "facility") return (trace.data || {}).facility === s.id;
      if (s.kind === "unit" && subjectUid !== undefined && subjectUid !== null) return trace.subject === subjectUid;
      return ids.has(trace.subject);
    });
  },

  // 開く2本（異なる kind）。乾いていれば1本でよい。無ければ null。
  openKinds(st, card, need, subjectUid) {
    const seen = new Map();
    for (const trace of this.relatedTraces(st, card, subjectUid)) {
      if (!seen.has(trace.kind)) seen.set(trace.kind, trace.seq);   // 新しい順なので最初のものが最新
    }
    if (seen.size < need) return null;
    return [...seen.values()].sort((a, b) => b - a).slice(0, need);
  },

  // いま出せるか（痕跡＋状態＋まだ出していない＋主役が生きている）
  eligible(st, card, need) {
    const inc = this.init(st);
    if (!card || inc.done[card.id] || inc.offered[card.id]) return null;
    const subjectUid = card.subject && card.subject.kind === "unit"
      ? (card.subject.uid ?? (this.pickSubject(st, card) || {}).uid ?? null) : null;
    if (card.subject && card.subject.kind === "unit" && subjectUid === null) return null;
    if (!this.subjectAlive(st, card, subjectUid)) return null;
    // 「いまの状態」はデータ側の式。読めない場面（sim の SIM_NO_TOWN で Town が無い等）は
    // **その札を出さない**だけにする。器の都合で決着を止めない。
    if (typeof card.state === "function") {
      let okNow = false;
      try { okNow = !!card.state(st); } catch (e) { okNow = false; }
      if (!okNow) return null;
    }
    const by = this.openKinds(st, card, need, subjectUid);
    if (!by) return null;
    return { id: card.id, by, subjectUid };
  },

  // ── 決着ごと（3節）────────────────────────────────────────
  // Town.settle の直後に1回。expires 切れを消し、空きがあれば1枚だけ足す。
  settle(game) {
    const st = game && game.state;
    if (!st) return null;
    const inc = this.init(st);
    const turn = Number(st.turn) || 0;
    // 失効：期限切れと、主役が消えた札
    for (const [id, row] of Object.entries(inc.offered)) {
      const card = this.card(id);
      const gone = !card || !this.subjectAlive(st, card, row.subjectUid);
      // 主役が死ねば札も消える（設計7-6。それくらいの難度でよい）。
      // 消えた札を弔いへ回す仕組み（incident phase=lost）は後日。
      // 期限切れ・主役の消失は done に控える。**同じ決着の中で拾い直さないため**であり、
      // 「同じ id は1ランに1回」の規則ともここで揃う（自分でやめた A の札だけは無記録）。
      if (gone || turn >= (row.expires || 0)) {
        delete inc.offered[id];
        inc.done[id] = { turn, branch: gone ? "lost" : "expired", by: row.by || [] };
      }
    }
    inc.active = Object.keys(inc.offered).length;
    if (inc.active >= this.MAX_OFFERED) { inc.dry = 0; return null; }
    // 乾き：0 が3回続いたら、この決着だけ痕跡1本で判定する
    const need = inc.dry >= this.DRY_LIMIT ? 1 : 2;
    const found = this.cards().map(card => {
      const hit = this.eligible(st, card, need);
      return hit ? { card, hit } : null;
    }).filter(Boolean);
    if (!found.length) { inc.dry += 1; return null; }
    // tier 大→中→小、同順なら痕跡の新しい方
    found.sort((a, b) => (this.TIER_ORDER[a.card.tier] ?? 1) - (this.TIER_ORDER[b.card.tier] ?? 1)
      || Math.max(...b.hit.by) - Math.max(...a.hit.by));
    const chosen = found[0];
    inc.offered[chosen.card.id] = {
      turn, by: chosen.hit.by, subjectUid: chosen.hit.subjectUid, expires: turn + this.EXPIRE_TURNS
    };
    inc.dry = 0;
    inc.active = Object.keys(inc.offered).length;
    return chosen.card.id;
  },

  // いま札に出ている分（描画が読む。A は作戦会議と張り紙、B は結果画面）
  offered(st, door) {
    const inc = this.init(st);
    return Object.keys(inc.offered).map(id => this.card(id)).filter(Boolean)
      .filter(card => !door || card.door === door);
  },

  // ── めくる／やめる ───────────────────────────────────────
  needsViewer(card) { return !!card && card.pick === "viewer"; },

  open(game, id, viewerUid) {
    const st = game && game.state;
    const card = this.card(id);
    const inc = this.init(st);
    const row = inc.offered[id];
    if (!card || !row) return null;
    // データ側が読む文脈を先に固める（`c.subject` 固定の主役 / `c.viewer` 見学者 /
    // `c.winner`・`c.loser` 二人組の腕比べ）。**隠れた状態を読むのはこの後**。
    const subject = this.unitOf(st, row.subjectUid) || this.pickSubject(st, card) || null;
    const viewer = this.needsViewer(card)
      ? (this.unitOf(st, Number(viewerUid)) || subject || (st.roster || [])[0] || null)
      : (subject || (st.roster || [])[0] || null);
    // 二人組は現在の攻撃・防御で腕比べ（乱数にしない。同点は挑戦側＝名簿の後ろが譲る）。
    const pair = (card.subject || {}).count > 1 ? this.subjectCandidates(st, card).slice(0, 2) : [];
    const arm = m => (m.atk || 0) + (m.def || 0);
    const winner = pair.length === 2 ? (arm(pair[0]) >= arm(pair[1]) ? pair[0] : pair[1]) : null;
    const loser = pair.length === 2 ? (winner === pair[0] ? pair[1] : pair[0]) : null;
    const ctx = { card, subject, viewer, winner, loser,
      viewerUid: viewer ? viewer.uid : null, branch: "", notes: [] };
    let branchKey = "";
    try { branchKey = typeof card.hidden?.value === "function" ? String(card.hidden.value(st, ctx)) : ""; }
    catch (e) { branchKey = ""; }   // 主役が欠けた札は枝なしで閉じる（画面は止めない）
    ctx.branch = branchKey;
    const branch = (card.branches || {})[branchKey] || null;
    // 効果は run.js の表が正（データ側の gain/apply はそこに無いときだけ使う）
    this.runEffect(game, card, "gain", ctx);
    this.runEffect(game, card, branchKey, ctx);
    delete inc.offered[id];
    inc.done[id] = { turn: Number(st.turn) || 0, branch: branchKey, by: row.by, viewerUid: ctx.viewerUid };
    inc.active = Object.keys(inc.offered).length;
    if (typeof game.trace === "function") game.trace("incident", ctx.viewerUid ?? null, null, { id, branch: branchKey });
    st.lastIncident = {
      id, title: card.title, branch: branchKey, turn: Number(st.turn) || 0,
      text: branch ? branch.text : "", mormo: branch ? branch.mormo : "",
      why: this.why(st, id), notes: ctx.notes.slice(),
      viewerUid: ctx.viewerUid, viewerName: viewer ? viewer.name : null
    };
    if (typeof game.save === "function") game.save();
    return st.lastIncident;
  },

  // A は無記録で消す。B は「関わらない」＝起きたことは残るが得も続きも無い。
  decline(game, id) {
    const st = game && game.state;
    const card = this.card(id);
    const inc = this.init(st);
    if (!card || !inc.offered[id]) return false;
    delete inc.offered[id];
    inc.active = Object.keys(inc.offered).length;
    if (card.door === "B") inc.done[id] = { turn: Number(st.turn) || 0, branch: "ignored", by: [] };
    if (typeof game.save === "function") game.save();
    return true;
  },

  // 効果を1つ走らせる。run.js の `Game.INCIDENT_EFFECTS[id]` が正。
  // 無ければデータ側の関数（CodeX が書いたもの）を使う。どちらも無ければ何もしない。
  runEffect(game, card, key, ctx) {
    const table = (game && game.INCIDENT_EFFECTS && game.INCIDENT_EFFECTS[card.id]) || null;
    const fromEngine = table ? (key === "gain" ? table.gain : (table.branches || {})[key]) : null;
    if (typeof fromEngine === "function") return fromEngine.call(game, game.state, ctx);
    const fromData = key === "gain" ? card.gain : ((card.branches || {})[key] || {}).apply;
    if (typeof fromData === "function") return fromData(game.state, ctx);
    return null;
  },

  // ── 「なぜ」欄（1節）──────────────────────────────────────
  // 開いた2本の痕跡＋隠れた状態と実値。**後付けしない**：実際に成立した2本しか出さない。
  why(st, id) {
    const card = this.card(id);
    const inc = this.init(st);
    const row = inc.offered[id] || inc.done[id];
    if (!card || !row) return "";
    const nameOf = uid => { const m = this.unitOf(st, uid); return m ? m.name : undefined; };
    const lines = (row.by || []).map(seq => {
      const trace = (st.traces || []).find(t => t.seq === seq);
      return trace && typeof Traces !== "undefined" ? Traces.describe(trace, nameOf) : "";
    }).filter(Boolean);
    const label = card.hidden ? card.hidden.label : "";
    const value = row.branch !== undefined && row.branch !== null && row.branch !== ""
      ? row.branch
      : (card.hidden && typeof card.hidden.value === "function" ? String(card.hidden.value(st)) : "");
    const head = lines.length ? `${lines.join("、")}。それがこの話につながった。` : "";
    const tail = label && value ? `${label}は${value}だったため、いまの出来事になった。` : "";
    return `${head}${tail}`.trim();
  }
};

if (typeof module !== "undefined") module.exports = { Incidents };
