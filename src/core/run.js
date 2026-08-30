// 1ラン（第N代魔王軍）の状態管理。UIはここのメソッドを呼んで再描画するだけ。
const Game = {
  state: null,

  power(m) { return m.hp + m.atk * 3 + m.def * 2 + m.spd; },
  armyPower(roster) { return roster.reduce((s, m) => s + this.power(m), 0); },

  RETRIES_PER_RUN: 1,

  newRun() {
    const history = Storage.loadHistory();
    this.state = {
      generation: history.length + 1,
      stage: 1,
      gold: 10,
      roster: [],
      applicants: [],
      phase: "recruit",
      hiresLeft: 2,
      maxPower: 0,
      raceCounts: {},
      uidSeq: 1,
      lastBattle: null,
      retriesLeft: this.RETRIES_PER_RUN,
      retriesUsed: 0,
      rerollsThisPhase: 0,
      checkpoint: null
    };
    this.genApplicants();
    this.saveCheckpoint();
    this.save();
  },

  // ── チェックポイントと再起 ──────────────────
  // 自動戦闘は乱数を含むため、同じ戦闘をそのまま振り直せると採用・編成の
  // 判断がすべて無意味になる。そこで巻き戻す先を「戦闘の直前」ではなく
  // 「採用フェーズの開始時点」にして、やり直せるのはサイコロではなく
  // “編成の判断”になるようにしている。
  saveCheckpoint() {
    const st = this.state;
    const copy = {};
    for (const k of Object.keys(st)) {
      if (k === "checkpoint") continue;   // 入れ子になるのを防ぐ
      copy[k] = st[k];
    }
    st.checkpoint = JSON.parse(JSON.stringify(copy));
  },

  canRetry() {
    const st = this.state;
    return !!st && st.retriesLeft > 0 && !!st.checkpoint;
  },

  retry() {
    const st = this.state;
    if (!this.canRetry()) return false;
    const restored = st.checkpoint;
    const retriesLeft = st.retriesLeft - 1;
    const retriesUsed = (st.retriesUsed || 0) + 1;
    // state を別インスタンスに差し替えず、中身だけ入れ替える。
    // 参照を掴んでいる呼び出し側が古い状態を見続けるのを防ぐため。
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, restored);
    st.retriesLeft = retriesLeft;
    st.retriesUsed = retriesUsed;
    st.gold = Math.floor(st.gold / 2);  // 軍を立て直す出費
    st.checkpoint = null;
    this.saveCheckpoint();
    this.save();
    return true;
  },

  // 再起せず敗北を確定させる
  concede() {
    const st = this.state;
    if (!st || st.phase !== "defeat") return;
    st.phase = "gameover";
    this.endRun(false);
  },

  save() { Storage.saveRun(this.state); },
  load() {
    const s = Storage.loadRun();
    if (s) this.state = s;
    return !!s;
  },

  stageData() { return ENEMY_STAGES[this.state.stage - 1]; },

  // ── 応募者生成 ────────────────────────────
  genApplicants() {
    const st = this.state;
    st.applicants = [];
    for (let i = 0; i < 3; i++) st.applicants.push(this.rollApplicant());
  },

  rollApplicant() {
    const st = this.state;
    // ステージが進むほど高ティアが出やすい
    const weights = MONSTER_TEMPLATES.map(t => {
      if (t.tier === 1) return st.stage <= 3 ? 6 : 2;
      if (t.tier === 2) return st.stage <= 2 ? 2 : 5;
      return st.stage <= 2 ? 0.5 : (st.stage <= 4 ? 2 : 5);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = U.rand() * total;
    let tpl = MONSTER_TEMPLATES[0];
    for (let i = 0; i < MONSTER_TEMPLATES.length; i++) {
      r -= weights[i];
      if (r <= 0) { tpl = MONSTER_TEMPLATES[i]; break; }
    }
    // ステージ補正：後から来る応募者ほど強い
    const scale = 1 + 0.12 * (st.stage - 1);
    const vary = v => Math.max(1, Math.round(v * scale * (0.85 + U.rand() * 0.3)));
    const traits = [tpl.fixedTrait];
    if (tpl.traitPool.length > 0 && U.chance(0.5)) {
      const extra = U.pick(tpl.traitPool);
      if (!traits.includes(extra)) traits.push(extra);
    }
    return {
      uid: st.uidSeq++,
      tplId: tpl.id,
      name: this.uniqueName(tpl.names),
      race: tpl.race,
      job: U.pick(tpl.jobs),
      hp: vary(tpl.base.hp),
      atk: vary(tpl.base.atk),
      def: Math.max(0, Math.round(tpl.base.def * (0.8 + U.rand() * 0.4))),
      spd: Math.max(1, Math.round(tpl.base.spd * (0.85 + U.rand() * 0.3))),
      salary: U.randInt(tpl.salary[0], tpl.salary[1]) + Math.floor(st.stage / 4),
      loyalty: U.randInt(tpl.loyalty[0], tpl.loyalty[1]),
      traits,
      tags: tpl.tags.slice(),
      quote: U.pick(tpl.quotes),
      prevJob: U.pick(tpl.prevJobs),
      motive: U.pick(tpl.motives),
      flaw: U.pick(tpl.flaws),
      unpaid: false
    };
  },

  // 同じ軍団に同名が並ぶと戦闘ログが読めなくなるので、名前は重複させない
  uniqueName(pool) {
    const used = new Set([
      ...this.state.roster.map(m => m.name),
      ...this.state.applicants.map(m => m.name)
    ]);
    const free = pool.filter(n => !used.has(n));
    if (free.length) return U.pick(free);
    const base = U.pick(pool);
    for (const suffix of ["二世", "三世", "四世", "五世"]) {
      if (!used.has(base + suffix)) return base + suffix;
    }
    return base + "・改";
  },

  // ── 求人の出し直し ────────────────────────
  // 目当ての種族が来ない回に何もできないと、狙った編成を組む戦略だけが
  // 一方的に不利になる。かといって無料で引き直せると緊張感が消えるので、
  // 「広告費」として所持金を払わせ、給与の支払いと競合させる。
  // 同じ面接内では倍々に高くなるため、無限に引き直すことはできない。
  // 最初の FREE_REROLLS 回は無料。それ以降は広告費が倍々に増える。
  FREE_REROLLS: 1,
  REROLL_BASE_COST: 2,

  rerollCost() {
    const n = this.state.rerollsThisPhase || 0;
    if (n < this.FREE_REROLLS) return 0;
    return this.REROLL_BASE_COST * Math.pow(2, n - this.FREE_REROLLS);
  },

  canReroll() {
    const st = this.state;
    return st.phase === "recruit" && st.applicants.length > 0 && st.gold >= this.rerollCost();
  },

  reroll() {
    if (!this.canReroll()) return false;
    const st = this.state;
    st.gold -= this.rerollCost();
    st.rerollsThisPhase = (st.rerollsThisPhase || 0) + 1;
    this.genApplicants();
    this.save();
    return true;
  },

  // ── 採用・解雇・編成 ──────────────────────
  canHire() { return this.state.roster.length < 5; },

  hire(index) {
    const st = this.state;
    if (!this.canHire()) return false;
    const m = st.applicants[index];
    if (!m) return false;
    st.roster.push(m);
    st.raceCounts[m.race] = (st.raceCounts[m.race] || 0) + 1;
    st.hiresLeft = (st.hiresLeft || 1) - 1;
    // 設立期など採用枠が残っていれば、続けて次の応募者を面接する
    if (st.hiresLeft > 0 && this.canHire()) {
      st.rerollsThisPhase = 0;   // 新しい面接なので広告費もリセット
      this.genApplicants();
    } else {
      st.applicants = [];
      st.phase = "formation";
    }
    this.save();
    return true;
  },

  skipHire() {
    const st = this.state;
    st.hiresLeft = 0;
    st.applicants = [];
    st.phase = "formation";
    this.save();
  },

  fire(uid) {
    const st = this.state;
    st.roster = st.roster.filter(m => m.uid !== uid);
    this.save();
  },

  moveUnit(index, dir) {
    const r = this.state.roster;
    const j = index + dir;
    if (j < 0 || j >= r.length) return;
    [r[index], r[j]] = [r[j], r[index]];
    this.save();
  },

  // ── 出撃と戦闘処理 ────────────────────────
  deploy() {
    const st = this.state;
    if (st.roster.length === 0) return null;
    const notes = [];

    // キングスライム合体（出撃時・永続）
    const kingSyn = SYNERGIES.find(s => s.id === "king_slime");
    if (kingSyn && kingSyn.check(this.rosterAsUnits())) {
      this.mergeKingSlime(notes);
    }

    const playerUnits = this.rosterAsUnits().map(m => Battle.makeUnit(m, "player"));
    const stageData = this.stageData();
    const enemyUnits = stageData.units.map(e => Battle.makeUnit(e, "enemy"));

    const result = Battle.simulate(playerUnits, enemyUnits);

    // 最大戦力を記録（魔界史用）
    st.maxPower = Math.max(st.maxPower, this.armyPower(st.roster));

    const goldBefore = st.gold;
    if (result.victory) {
      st.gold += stageData.reward;
      notes.push(`勝利報酬 ${stageData.reward}G を獲得（所持金 ${st.gold}G）`);
      this.paySalaries(notes);
      this.processDepartures(notes);
      st.stage += 1;
      if (st.stage > ENEMY_STAGES.length) {
        st.phase = "clear";   // 記録の確定は deploy() の末尾でまとめて行う
      } else {
        st.phase = "result";
        this.genApplicants();
      }
    } else {
      // 敗北。再起の余地があるうちは魔界史に確定させない
      st.phase = "defeat";
    }

    st.lastBattle = {
      victory: result.victory,
      army: stageData.army,
      region: stageData.region,
      reward: result.victory ? stageData.reward : 0,
      goldBefore,
      synergies: result.activeSynergies,
      notes,
      logLength: result.log.length,
      contribution: this.attachVoices(result.contribution, result.victory)
    };

    // 記録の確定とセーブの後始末は必ず最後に行う。先に endRun してから
    // save すると、消したはずのセーブが書き戻ってしまう。
    if (st.phase === "clear") {
      this.endRun(true);
    } else if (st.phase === "defeat" && !this.canRetry()) {
      st.phase = "gameover";
      this.endRun(false);
    } else {
      this.save();
    }
    return { result, notes, stageData };
  },

  // 戦果に応じて各モンスターの一言を選ぶ。
  // 状況の優先度: 戦死 > 給与未払い > 殊勲 > 何もできず > 被弾最多 > 勝敗。
  // 画面の再描画で台詞が変わらないよう、ここで一度だけ選んで保存する。
  attachVoices(contribution, victory) {
    if (!contribution || contribution.length === 0) return contribution;
    // 配列の並び順に依存しないよう、最大値を明示的に求める
    const topDealer = contribution.reduce((b, c) => (c.dealt > 0 && (!b || c.dealt > b.dealt)) ? c : b, null);
    const topTanker = contribution.reduce((b, c) => (c.taken > 0 && (!b || c.taken > b.taken)) ? c : b, null);
    for (const c of contribution) {
      const tpl = MONSTER_TEMPLATES.find(t => t.id === c.tplId);
      const v = tpl && tpl.voices;
      if (!v) { c.voice = null; continue; }
      let key;
      if (c.died) key = "dead";
      else if (c.unpaid) key = "unpaid";
      else if (topDealer && c.id === topDealer.id) key = "mvp";
      else if (c.dealt === 0) key = "idle";
      else if (topTanker && c.id === topTanker.id) key = "hurt";
      else key = victory ? "win" : "lose";
      const pool = (v[key] && v[key].length) ? v[key] : v[victory ? "win" : "lose"];
      c.voice = (pool && pool.length) ? U.pick(pool) : null;
    }
    return contribution;
  },

  rosterAsUnits() {
    // シナジー判定用に mods/traits を持つ簡易ビューを作る
    return this.state.roster;
  },

  mergeKingSlime(notes) {
    const st = this.state;
    const slimes = st.roster.filter(m => m.race === "スライム").slice(0, 3);
    if (slimes.length < 3) return;
    const king = {
      uid: st.uidSeq++,
      tplId: "king_slime",
      name: `キング${slimes[0].name}`,
      race: "キングスライム",
      job: "王",
      hp: Math.round(slimes.reduce((s, m) => s + m.hp, 0) * 1.2),
      atk: slimes.reduce((s, m) => s + m.atk, 0),
      def: Math.max(...slimes.map(m => m.def)) + 2,
      spd: Math.round(slimes.reduce((s, m) => s + m.spd, 0) / 3),
      salary: Math.max(1, slimes.reduce((s, m) => s + m.salary, 0) - 2),
      loyalty: Math.round(slimes.reduce((s, m) => s + m.loyalty, 0) / 3),
      traits: ["slime_body", "regen"],
      tags: [],
      quote: "……！（すごく大きくなった）",
      prevJob: `スライム3体（${slimes.map(m => m.name).join("・")}）`,
      motive: "みんなで、ひとつに、なりました",
      flaw: "もう、もどれない",
      unpaid: false
    };
    const removed = new Set(slimes.map(m => m.uid));
    const idx = st.roster.findIndex(m => removed.has(m.uid));
    st.roster = st.roster.filter(m => !removed.has(m.uid));
    st.roster.splice(Math.min(idx, st.roster.length), 0, king);
    st.raceCounts["キングスライム"] = (st.raceCounts["キングスライム"] || 0) + 1;
    notes.push(`スライム3体が合体して ${king.name} が誕生した！！`);
  },

  paySalaries(notes) {
    const st = this.state;
    const total = st.roster.reduce((s, m) => s + m.salary, 0);
    if (total === 0) return;
    if (st.gold >= total) {
      st.gold -= total;
      for (const m of st.roster) {
        m.unpaid = false;
        m.loyalty = U.clamp(m.loyalty + 2, 0, 100);
      }
      notes.push(`給与 ${total}G を支払った（所持金 ${st.gold}G）全員の忠誠+2`);
    } else {
      for (const m of st.roster) {
        m.unpaid = true;
        m.loyalty = U.clamp(m.loyalty - 15, 0, 100);
      }
      notes.push(`金庫が足りない！ 給与${total}G が未払いに……全員の忠誠-15`);
    }
  },

  processDepartures(notes) {
    const st = this.state;
    const leaving = st.roster.filter(m => m.loyalty <= 0);
    for (const m of leaving) {
      notes.push(`${m.name} は愛想を尽かして軍を去った……`);
    }
    if (leaving.length > 0) {
      const ids = new Set(leaving.map(m => m.uid));
      st.roster = st.roster.filter(m => !ids.has(m.uid));
    }
  },

  // ── ラン終了と魔界史 ──────────────────────
  endRun(cleared) {
    const st = this.state;
    const won = cleared ? ENEMY_STAGES.length : st.stage - 1;
    const mainRace = Object.entries(st.raceCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "なし";
    const record = {
      gen: st.generation,
      cleared,
      battlesWon: won,
      reignYears: won * 4 + U.randInt(1, 3),
      maxPower: st.maxPower,
      mainRace,
      region: cleared ? "王都（制圧）" : this.stageData().region,
      cause: cleared ? "人間界を征服し引退" : `${this.stageData().army}に敗北`,
      retriesUsed: st.retriesUsed || 0,
      finalRoster: st.roster.map(m => ({ name: m.name, race: m.race, job: m.job })),
      date: new Date().toISOString().slice(0, 10)
    };
    st.record = record;
    Storage.appendHistory(record);
    Storage.clearRun();
  },

  // 勝利後「次へ」→ 採用フェーズへ
  nextRecruit() {
    this.state.phase = "recruit";
    this.state.hiresLeft = 1;
    this.state.rerollsThisPhase = 0;
    this.saveCheckpoint();   // ここが「一戦手前」の戻り先になる
    this.save();
  }
};
