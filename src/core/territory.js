// 地図の上の戦争：隣接・候補・効き目の純粋関数（docs/DESIGN_WORLD_CAMPAIGN_2026-09-15.md 段階A）。
// ブラウザAPIも Game も触らない。run.js（Opus）はここを呼ぶだけにして、グラフの理屈をこちらに寄せる。
//
// 状態の形（run.js が st に持つ）：
//   st.territory = { lands: ["h01", ...], tribes: ["t02", ...] }   領土（落とした土地・従えた部族圏）
//   st.tribeChiefs = { zagan: "alive" | "slain" | "hired" }        首領の生死（段階B）
const Territory = {
  lands()  { return typeof TERRITORY_LANDS  !== "undefined" ? TERRITORY_LANDS  : []; },
  tribes() { return typeof TERRITORY_TRIBES !== "undefined" ? TERRITORY_TRIBES : []; },
  kinds()  { return typeof TERRITORY_KINDS  !== "undefined" ? TERRITORY_KINDS  : {}; },
  rules()  {
    return typeof TERRITORY_RULES !== "undefined" ? TERRITORY_RULES
      : { candidates: 3, tribute: { goldPerStage: 8, foodPerStage: 4 }, patrol: { stageMin: 1, stageMax: 2, rewardMult: 0.4 }, raid: { rewardMult: 0.75, alert: 2, garrisonBonus: 1 }, conquestPerLand: 8 / 12 };
  },
  all()    { return this.lands().concat(this.tribes()); },
  byId(id) { return this.all().find(p => p.id === id) || null; },
  isLand(id)  { return this.lands().some(p => p.id === id); },
  isTribe(id) { return this.tribes().some(p => p.id === id); },

  // 旧セーブ・新規ラン：領土は空（魔王城だけ）。
  init(st) {
    if (!st.territory || !Array.isArray(st.territory.lands) || !Array.isArray(st.territory.tribes)) st.territory = { lands: [], tribes: [] };
    return st.territory;
  },
  owned(st) {
    const t = this.init(st);
    return new Set(["castle", ...t.lands, ...t.tribes]);
  },
  has(st, id) { return this.owned(st).has(id); },

  // 隣接は片方向に書いてあっても両方向に読む（データの書き忘れで道が切れないように）。
  neighbors(id) {
    const set = new Set();
    const me = this.byId(id);
    if (me) for (const a of me.adj || []) set.add(a);
    for (const p of this.all()) if ((p.adj || []).includes(id)) set.add(p.id);
    return [...set];
  },

  // いま落とせる／従えられる場所：領土に隣接する未領土で、幕が開いているもの。
  frontier(st, act) {
    const own = this.owned(st);
    const a = act || st.act || 1;
    const out = [];
    for (const p of this.all()) {
      if (own.has(p.id) || (p.act || 1) > a) continue;
      if (this.neighbors(p.id).some(x => own.has(x))) out.push(p);
    }
    return out;
  },

  // 決着ごとの候補3つ。人間界と魔界を交互に厚くする（turn の偶奇）。両方あるときは両方混ぜる。
  // rng は 0〜1 を返す関数（run.js の U.rand を渡す。テストは固定値）。
  candidates(st, rng, act) {
    const n = this.rules().candidates;
    const f = this.frontier(st, act);
    const lands = f.filter(p => this.isLand(p.id)), tribes = f.filter(p => this.isTribe(p.id));
    const pick = (arr, k) => {
      const a = arr.slice(); const out = [];
      while (a.length && out.length < k) out.push(a.splice(Math.floor((rng ? rng() : 0) * a.length), 1)[0]);
      return out;
    };
    const landFirst = ((st.turn || 0) % 2) === 0;
    let wantLands = tribes.length ? (landFirst ? 2 : 1) : n;
    let wantTribes = n - wantLands;
    if (lands.length < wantLands) { wantTribes += wantLands - lands.length; wantLands = lands.length; }
    if (tribes.length < wantTribes) { wantLands = Math.min(lands.length, wantLands + (wantTribes - tribes.length)); wantTribes = tribes.length; }
    return pick(lands, wantLands).concat(pick(tribes, wantTribes));
  },

  // 落とす／従える。
  take(st, id) {
    const t = this.init(st);
    if (this.isLand(id) && !t.lands.includes(id)) t.lands.push(id);
    else if (this.isTribe(id) && !t.tribes.includes(id)) t.tribes.push(id);
    return t;
  },
  // 王国に奪い返される（防衛に負けたとき。段階C）。
  lose(st, id) {
    const t = this.init(st);
    t.lands = t.lands.filter(x => x !== id);
    t.tribes = t.tribes.filter(x => x !== id);
    return t;
  },

  // 領土の効き目の合計（数字1本ずつを足す）。run.js は決着ごとにこれを読む。
  effects(st) {
    const kinds = this.kinds();
    const sum = { food: 0, gold: 0, applicants: 0, defenseLine: 0, noPriest: 0, wageMult: 1, landing: 0, recruit: [] };
    for (const id of this.init(st).lands) {
      const p = this.byId(id); const k = p && kinds[p.kind]; if (!k) continue;
      const e = k.effect || {};
      sum.food += e.food || 0; sum.gold += e.gold || 0; sum.applicants += e.applicants || 0;
      sum.defenseLine += e.defenseLine || 0; sum.noPriest += e.noPriest || 0; sum.landing += e.landing || 0;
      if (e.wageMult) sum.wageMult *= e.wageMult;
    }
    for (const id of this.init(st).tribes) { const p = this.byId(id); if (p && p.race) sum.recruit.push(p.race); }
    return sum;
  },

  // 贈る（戦わずに従える）の値段。首領がいる部族と人間界の土地は贈れない（null）。
  tributeCost(id) {
    const p = this.byId(id);
    if (!p || !this.isTribe(id) || p.chief) return null;
    const r = this.rules().tribute;
    return { gold: p.garrison * r.goldPerStage, food: p.garrison * r.foodPerStage };
  },

  // 既存の「征服度（0〜8）」との互換：今の幕の人間界の土地の数から写す。都を落とせば 8。
  conquestOf(st) {
    const act = st.act || 1;
    const lands = this.init(st).lands.map(id => this.byId(id)).filter(p => p && (p.act || 1) === act);
    if (lands.some(p => p.kind === "capital")) return 8;
    return Math.min(7, Math.floor(lands.length * this.rules().conquestPerLand));
  },

  // 巡回の札（何度でも戦える雑魚戦）の守備段階：領土が広がるほど少し厚くなる（上限あり）。
  patrolStage(st) {
    const r = this.rules().patrol;
    const n = this.init(st).lands.length;
    return Math.min(r.stageMax, r.stageMin + Math.floor(n / 4));
  }
};
