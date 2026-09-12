// 自動戦闘エンジン。
//
// simulate() は戦闘を即時に計算し、「イベントタイムライン」を返す。
// 描画側（レンダラ）はこのタイムラインを再生するだけで、戦闘の中身を一切知らない。
// これによりレンダラを差し替えられる（DOM/CSS → Canvas → ネイティブ）。
//
// ── イベント契約 ──────────────────────────────────────────
// 全イベント共通: { eventId, type, emphasis, text?, cls? }
//   emphasis … 演出の強さ 0=通常 1=小 2=大 3=決定的。尺は描画側が決める。
//   text/cls … ログ表示用。無いイベントはログに出ない。
// 因果イベント共通: { parentEventId?, chainId, chainDepth }
//   親を持たない攻撃などが chainDepth=1 の起点。死亡・追撃・蘇生は原因イベントを親に持つ。
//   既存の type は変えず、将来のシナジー発火とCHAIN表示に使うメタデータだけを加える。
// V2ランだけ v2Depth も並記する。同じ実効果を一度だけ数え、倍率はこの逐次値を読む。
//
//   battle_start { player:[Snap], enemy:[Snap] }   Snapは下の snap() 参照
//   dialogue     { unitId,name,side,quote }         データ指定された開戦台詞
//   synergy      { name, desc }                     シナジー発動（カットイン）
//   round_start  { round }
//   attack       { fromId, toId, dmg, hp, maxHp, dead, traits:[名前] }
//   splash       { fromId, toId, dmg, hp, maxHp, dead, label }  火球などの追撃
//   survive      { unitId, hp, maxHp }              白骨などで致死を耐えた
//   death        { unitId, permanent? }             permanent=味方が蘇生せず永久退場した
//   overkill     { fromId,toId,excess,percent,rank }  致死時の余剰ダメージ
//   revive       { unitId, hp, maxHp }              蘇生（状態差分から自動検出）
//   summon       { unit:Snap, sourceUnitId }         戦闘専用ユニットの追加
//   heal         { unitId, amount, hp, maxHp }      回復（同上）
//   resource_gain    { sourceId,resource,amount,label }  戦闘後に確定する資源予約
//   resource_forfeit { sourceId,resource,amount,label }  条件喪失による予約没収
//   note         { }                                特性の発動などテキストのみ
//   incident     { id,name,unitId,targetId? }        戦闘中ハプニング
//   order_offer  { round, candidates:[{unitId,name,skillId,skillName,label,note,cost,spirit}], unready:[...], answered? }
//                                                  号令の節目。options.offerOrder のときだけ、1戦闘1回
//   order_exec   { unitId, name, skillId, skillName, label, quote }  号令の実行（次ラウンド冒頭、本人が真っ先に動く）
//   result       { victory, reversal }              reversal=総HP3割以下から勝った
// ───────────────────────────────────────────────────────
// 敵の大技：2ラウンド目以降、この確率で1ラウンド構え（攻撃しない）、次のラウンドに×1.8。まもるで受ける相手。
const ENEMY_BIG_MOVE = { chance: 0.15, mult: 1.8 };

const Battle = {
  MAX_ROUNDS: 30,

  // 余剰がこの割合（敵の最大HP比）に満たない撃破は OVERKILL と呼ばない。
  // 実測では撃破のほぼ全部——1戦3.94回——が OVERKILL 判定になっており、
  // 余剰割合の中央値は18%だった。毎回起きるものは見せ場ではなく日常なので、
  // 「やりすぎた撃破」だけに名前を与える（40%で1戦0.85回）。
  // ここは演出の都合ではなくゲーム語彙の線引きなので core 側に置く。
  OVERKILL_MIN_PERCENT: 40,

  overkillRank(percent) {
    if (percent >= 1000) return { id: "demon_king", name: "魔王級殲滅", emphasis: 3 };
    if (percent >= 500) return { id: "annihilation", name: "消滅", emphasis: 3 };
    if (percent >= 300) return { id: "pulverize", name: "粉砕", emphasis: 2 };
    if (percent >= 100) return { id: "trample", name: "蹂躙", emphasis: 2 };
    return { id: "overkill", name: "OVERKILL", emphasis: 1 };
  },

  // ロスターのモンスター → 戦闘ユニット
  makeUnit(m, side) {
    return {
      id: null,
      uid: m.uid !== undefined ? m.uid : null,
      side,
      name: m.name,
      race: m.race || "人間",
      tplId: m.tplId || null,
      icon: m.icon || null,
      job: m.job || "",
      rankId: m.rankId || "soldier",
      maxHp: m.hp,
      hp: m.hp,
      atk: m.atk,
      def: m.def,
      spd: m.spd,
      salary: m.salary || 0,
      loyalty: m.loyalty ?? 50,
      unpaid: !!m.unpaid,
      // F: 戦闘中ハプニングの読み取り用状態。ロスターへは保存しない。
      starved: !!m.starved || (m.traits || []).includes("starved"),
      feast: false,
      chainDepth: 1,
      traits: m.traits ? m.traits.slice() : [],
      tags: m.tags ? m.tags.slice() : [],
      introQuote: m.introQuote || "",
      // 気合（号令の限定）。名簿の値を写す。無ければ null＝制限なし（傭兵・テストの直作り）。
      spirit: (m.spirit === undefined || m.spirit === null) ? null : Number(m.spirit),
      // 上位技のお披露目。覚えた直後の戦いでだけ autoLimit 回まで勝手に出る。名簿の値が無い（テストの直作り・sim の敵）なら
      // "any"＝どの技もお披露目扱い（既存テストと種族技の測定が今までどおり動く）。null なら号令でだけ出る。
      debut: m.debutSkill === undefined ? "any" : (m.debutSkill || null),
      mods: {
        dmgMult: m.battleDmgMult || 1,
        takenMult: m.battleTakenMult || 1,
        fireballAll: false, necroFull: false
      },
      // 技（気合を払って選ぶ行動。SKILLS の id 列）と、敵の役割（fighter/brute/shield/priest/caster/archer/rogue/commander）。
      skills: Array.isArray(m.skills) ? m.skills.slice() : [],
      role: m.role || "fighter",
      flags: {},
      alive: true
    };
  },

  // options.seed を渡すと乱数が決定的になる（同じ入力＋同じ種＝同じタイムライン）。
  // 号令は「途中まで同じ展開のまま、指示のあとだけ分岐」させるために、同じ種で計算し直す。
  // 種を渡さなければ今までどおり Math.random（sim・テストの既定は変わらない）。
  simulate(playerUnits, enemyUnits, options) {
    options = options || {};
    const run = () => {
      // おまかせ（自動）で最後まで回す。manual でなければ生成器は一度も止まらない。
      const gen = this._battle(playerUnits, enemyUnits, Object.assign({}, options, { manual: false }));
      let r = gen.next();
      while (!r.done) r = gen.next({});
      return r.value;
    };
    if (options.seed === undefined || options.seed === null) return run();
    const prev = U.rand;
    U.rand = U.seeded(options.seed);
    try { return run(); }
    finally { U.rand = prev; }
  },

  // コマンドバトル（2026-09-11）。ラウンドごとに止まり、味方それぞれの指示を受けて解決する。
  //   const b = Battle.start(p, e, { seed, ... });
  //   let step = b.next();               // { type: "commands", round, allies, enemies, canRetreat, ... }
  //   step = b.next({ p0: { cmd: "attack", target: "e1" }, p1: { cmd: "guard" }, p2: { cmd: "skill" } });
  //   ...                                // step.type === "end" なら step.result（simulate と同じ形）
  //   b.next({ retreat: true })          // 退く（canRetreat のとき）。result.retreated === true
  // b.timeline は生成器が積むタイムラインそのもの（描画側は差分を読む）。
  // 乱数の種は next() のたびに差し替えて戻す（止まっている間に他の乱数を汚さない）。
  start(playerUnits, enemyUnits, options) {
    options = Object.assign({}, options || {}, { manual: true });
    const rng = options.seed === undefined || options.seed === null ? null : U.seeded(options.seed);
    const gen = this._battle(playerUnits, enemyUnits, options);
    const handle = { timeline: null, done: false, result: null, prompt: null };
    handle.next = (commands) => {
      if (handle.done) return { type: "end", result: handle.result };
      const prev = U.rand;
      if (rng) U.rand = rng;
      let r;
      try { r = gen.next(commands || {}); }
      finally { U.rand = prev; }
      if (r.done) { handle.done = true; handle.result = r.value; handle.prompt = null; return { type: "end", result: r.value }; }
      handle.prompt = r.value;
      return r.value;
    };
    // タイムラインの参照を生成器から受け取る（最初の yield より前に battle_start を積む）
    const first = gen.next();
    handle.timeline = first.value && first.value.__timeline ? first.value.__timeline : null;
    return handle;
  },

  // 号令の候補：戦場にいる軍団員（傭兵・召喚物を除く）で、号令できる特性（order）を持つ者。
  // 一人に複数あれば最初の一つ。最大3人（選択肢を読める数に絞る）。
  // 気合（unit.spirit）が技の cost に足りない者は候補に出ない（unready に回す）。null は制限なし。
  orderCandidates(playerUnits) {
    return this.orderRoster(playerUnits).ready;
  },
  orderRoster(playerUnits) {
    const ready = [], unready = [];
    for (const u of playerUnits) {
      if (!u.alive || u.flags.absent || u.flags.summoned || u.flags.mercenary || u.flags.winded) continue;   // 息切れ中は命じられない
      const skillId = u.traits.find(tid => TRAITS[tid] && TRAITS[tid].order);
      if (!skillId) continue;
      const tr = TRAITS[skillId];
      const cost = Math.max(0, Number(tr.order.cost) || 0);
      const spirit = (u.spirit === undefined || u.spirit === null) ? null : u.spirit;
      if (spirit !== null && spirit < cost) {
        unready.push({ unitId: u.id, name: u.name, skillId, skillName: tr.name, spirit, cost });
        continue;
      }
      if (ready.length >= 3) continue;
      ready.push({ unitId: u.id, name: u.name, skillId, skillName: tr.name, label: tr.order.label, note: tr.order.note || "", cost, spirit });
    }
    return { ready, unready };
  },

  *_battle(playerUnits, enemyUnits, options) {
    // 保存済みランの版を正本にする。V1途中ランはアップデート後も旧倍率を維持する。
    const useV2ChainMultiplier = Number(options.chainDefVersion) >= 2;
    playerUnits.forEach((u, i) => { u.id = "p" + i; });
    enemyUnits.forEach((u, i) => { u.id = "e" + i; });
    // 遅刻。特性の lateArrival が返したラウンド数だけ、戦場にいない。
    // 開戦の並びにも入らず、口上も言わず、狙われもしない。到着は summon イベントで描く。
    for (const u of playerUnits) {
      for (const tid of u.traits) {
        const tr = TRAITS[tid];
        if (!tr || !tr.lateArrival) continue;
        const rounds = Math.max(0, Math.floor(tr.lateArrival({ unit: u, rng: U.rand }) || 0));
        if (rounds > 0) { u.flags.late = rounds; u.flags.absent = true; u.flags.lateTrait = tid; }
      }
    }
    // 発酵した糧食（改造癖の者が生活部門で樽に寝かせた）。食べた者の一人が酔って遅刻する。
    // 本人（改造癖）は戦場にいない。任せた仕事の結果が、ここで初めて戦闘の順番に出る。
    {
      const r = options.rations;
      if (r && r.fermentedBy != null && r.consumed > 0) {
        const eaters = playerUnits.filter(u => !u.flags.absent && !u.tags.includes("undead"));
        const bigEaters = eaters.filter(u => u.traits.includes("big_eater"));
        const victim = (bigEaters.length ? U.pick(bigEaters) : (eaters.length ? U.pick(eaters) : null));
        if (victim) {
          victim.flags.late = 1;
          victim.flags.absent = true;
          victim.flags.lateTrait = "tinkerer";
          victim.flags.lateBy = r.fermentedByName || "誰か";
          victim.flags.lateCause = "fermented_rations";
        }
      }
    }

    const timeline = [];
    // コマンドバトルは最初に一度だけ止まり、タイムラインの参照を渡す（start() が受け取る）。
    if (options.manual) yield { __timeline: timeline };
    let nextEventId = 1;
    const emit = (type, data) => {
      data = data || {};
      data.type = type;
      if (!data.eventId) data.eventId = `ev${nextEventId++}`;
      if (data.emphasis === undefined) data.emphasis = 0;
      timeline.push(data);
      return data;
    };
    const emitCausal = (type, data, parent) => {
      data = data || {};
      if (parent) {
        data.parentEventId = parent.eventId;
        data.chainId = parent.chainId || parent.eventId;
        data.chainDepth = (parent.chainDepth || 1) + 1;
      } else {
        data.chainDepth = 1;
      }
      if (useV2ChainMultiplier) {
        const classified = Chain.classify(type, data);
        const counted = classified.role === "effect"
          || (classified.role === "declaration" && classified.selfEffect);
        const parentDepth = parent ? (parent.v2Depth ?? 1) : 0;
        data.v2Depth = parentDepth + (counted ? 1 : 0);
      }
      const event = emit(type, data);
      if (!event.chainId) event.chainId = event.eventId;
      return event;
    };
    // 特性から呼ばれるテキスト専用ログ（traits.js の ctx.log がこれ）
    const note = (text, cls) => emit("note", { text, cls: cls || "info", emphasis: cls === "revive" ? 2 : 0 });
    const soulState = { player: { amount: 0 }, enemy: { amount: 0 } };
    // 施設Lv.＝Jokerが働ける回数。0/未指定なら従来どおり1回だけ働く。
    const facilityWorks = Math.max(1, Number(options.facilityWorks) || 1);
    const graveyardQueue = [];
    let graveyardUsed = 0;
    let nextSummonId = 1;

    const reactToDeath = (target, deathEvent) => {
      if (target.flags.summoned) return;
      if (options.graveyard && target.side === "player" && graveyardQueue.length < facilityWorks) {
        graveyardQueue.push({ target, deathEvent });
      }
      if (target.flags.soulCounted) return;
      const allies = target.side === "player" ? playerUnits : enemyUnits;
      const keeper = allies.find(u => u.alive && u.traits.includes("gravekeeper"));
      if (!keeper) return;
      target.flags.soulCounted = true;
      soulState[target.side].amount += 1;
      emitCausal("resource_gain", {
        sourceId: keeper.id, targetId: target.id, resource: "soul", amount: 1, reserved: false, label: "墓守",
        emphasis: 1, text: `　${keeper.name}の【墓守】 ${target.name}の魂を回収（魂${soulState[target.side].amount}）`, cls: "trait"
      }, deathEvent);
    };

    const reactToUndeadArrival = (arrived, arrivalEvent) => {
      const allies = arrived.side === "player" ? playerUnits : enemyUnits;
      const state = soulState[arrived.side];
      const collector = allies.find(u => u.alive && u.traits.includes("soul_harvest")
        && (u.flags.soulHarvestStacks || 0) < 5);
      if (!collector || state.amount <= 0) return;
      state.amount -= 1;
      collector.flags.soulHarvestStacks = (collector.flags.soulHarvestStacks || 0) + 1;
      const undead = allies.filter(u => u.alive && u.tags.includes("undead"));
      for (const unit of undead) unit.mods.dmgMult *= 1.2;
      const trigger = emitCausal("trait_trigger", {
        sourceId: collector.id, traitId: "soul_harvest", name: "魂の徴収",
        stacks: collector.flags.soulHarvestStacks, affectedIds: undead.map(u => u.id), emphasis: 2,
        text: `　${collector.name}の【魂の徴収】 アンデッド${undead.length}体を強化（${collector.flags.soulHarvestStacks}/5）`, cls: "trait"
      }, arrivalEvent);
      emitCausal("resource_consume", {
        sourceId: collector.id, resource: "soul", amount: 1, remaining: state.amount,
        emphasis: 1, text: `　魂1を消費（残り${state.amount}）`, cls: "trait"
      }, trigger);
    };

    const snap = u => ({
      id: u.id, name: u.name, race: u.race, tplId: u.tplId, icon: u.icon, side: u.side,
      hp: u.hp, maxHp: u.maxHp, atk: u.atk, def: u.def, spd: u.spd,
      traits: u.traits.slice(), tags: u.tags.slice(), introQuote: u.introQuote,
      summoned: !!u.flags.summoned,
      late: !!u.flags.late
    });
    // 戦場にいる者。開戦時に不在（遅刻）の者は生きていても狙えず、動けず、数に入らない。
    const onField = u => u.alive && !u.flags.absent;

    // 種族技の発動は既存の trait_trigger で記録する。技を持たない編成では呼ばず、乱数も消費しない。
    // 上位技の自動発動は autoLimit 回まで（既定は無制限）。号令で出した分は数えない。
    // 数えるのは実際に発動した回（skillTrigger）。判定は act() のフック呼び出し前（modDealt / postAttack）。
    const autoExhausted = (unit, traitId) => {
      const tr = TRAITS[traitId];
      if (!tr || !tr.autoLimit || unit.flags.ordered) return false;
      const allowed = (unit.debut === "any" || unit.debut === traitId) ? tr.autoLimit : 0;
      return ((unit.flags.skillUses || {})[traitId] || 0) >= allowed;
    };
    const skillTrigger = (unit, traitId, parent) => {
      const trait = TRAITS[traitId] || {};
      if (trait.autoLimit && !unit.flags.ordered) {
        unit.flags.skillUses = unit.flags.skillUses || {};
        unit.flags.skillUses[traitId] = (unit.flags.skillUses[traitId] || 0) + 1;
      }
      const lines = trait.lines && trait.lines.use;
      const quote = lines && lines.length ? U.pick(lines) : "";
      return emitCausal("trait_trigger", {
        sourceId: unit.id, traitId, name: trait.name || traitId, quote, emphasis: 2,
        text: `　${unit.name}の【${trait.name || traitId}】${quote ? `「${quote}」` : ""}`, cls: "trait"
      }, parent || null);
    };

    const summonUnit = (source, spec, parent) => {
      const sideUnits = source.side === "player" ? playerUnits : enemyUnits;
      const unit = Battle.makeUnit({
        uid: null, tplId: spec.tplId || source.tplId, name: spec.name || `${source.name}の分身`,
        race: spec.race || source.race, icon: source.icon, job: spec.job || source.job,
        hp: Math.max(1, spec.maxHp || source.maxHp), atk: Math.max(1, spec.atk || source.atk),
        def: Math.max(0, spec.def ?? source.def), spd: spec.spd || source.spd,
        salary: 0, loyalty: source.loyalty, traits: spec.traits || [], tags: spec.tags || source.tags
      }, source.side);
      unit.id = `${source.side === "player" ? "ps" : "es"}${nextSummonId++}`;
      unit.maxHp = Math.max(1, spec.maxHp || source.maxHp);
      unit.hp = Math.max(1, Math.min(unit.maxHp, spec.hp ?? unit.maxHp));
      unit.flags.summoned = true;
      sideUnits.push(unit);
      const event = emitCausal("summon", {
        sourceUnitId: source.id, unit: snap(unit), emphasis: 2,
        text: `　${unit.name}が現れた！`, cls: "revive"
      }, parent || null);
      reactToUndeadArrival(unit, event);
      return event;
    };

    // シナジー適用（merge型は出撃時に処理済み）
    // 発火条件は出撃5枠の外まで数える（options.synergyPool＝軍団全体）。
    // 効果は出撃したユニットにしか乗らないので、控えが戦うわけではない。
    const activeSyn = Synergy.applyAll(playerUnits, { pool: options.synergyPool || playerUnits });
    // 揃えた枚数を「画面の出来事」に変える。倍率だけだと数字が増えるだけで爆発に見えない。
    // 《魔王軍完成》が立っているあいだ、味方のOVERKILL撃破は次の敵へ伝播し、
    // その深さは同時発動数そのものになる。積むほど連鎖が伸びる。
    const overloadStacks = activeSyn.some(s => s.id === "overload")
      ? Math.min(4, activeSyn.filter(s => !s.meta).length) : 0;

    // 戦意：OVERKILLの見返り。これまでOVERKILLは伝播の入口になるだけで、
    // それ自体には何の得も無かった（だから「明示」しようにも中身が無かった）。
    // 余剰を出すほど味方全員の与ダメージが上がり、その倍率を画面に出し続ける。
    // 連鎖が進むほど数字そのものが大きくなるので、「爆発力が上がった」が見える。
    let momentum = 0;
    const MOMENTUM_CAP = 1.2;   // 与ダメージ+120%まで。青天井にすると1戦目から壊れる
    const gainMomentum = (percent, parent, depth) => {
      if (momentum >= MOMENTUM_CAP) return;
      // 余剰が大きいほど、そして連鎖が深いほど戦意が乗る
      const gain = Math.min(.25, .04 + percent / 100 * .05 + Math.max(0, (depth || 1) - 1) * .035);
      const before = momentum;
      momentum = Math.min(MOMENTUM_CAP, momentum + gain);
      if (momentum <= before) return;
      emitCausal("momentum", {
        gain: Math.round((momentum - before) * 100),
        total: Math.round(momentum * 100),
        mult: Number((1 + momentum).toFixed(2)),
        emphasis: momentum >= .8 ? 3 : 2,
        text: `　魔王軍の戦意が上がった！ 与ダメージ ×${(1 + momentum).toFixed(2)}`,
        cls: "momentum"
      }, parent);
    };
    const goblinRaid = activeSyn.some(s => s.id === "goblin_horde");
    const goblinPair = activeSyn.some(s => s.id === "goblin_pair");
    const martyrAllowance = activeSyn.some(s => s.id === "martyr_allowance");
    let reservedGold = 0;
    let ledgerFires = 0;
    let ledgerBoost = null;
    let lootPairBoost = null;
    // ── 技（SKILLS）と敵の役割。仕様 docs/SPEC_SKILLS_2026-09-12.md ──
    const SK = typeof SKILLS !== "undefined" ? SKILLS : {};
    const SPIRIT_MAX = (typeof MONSTER_RULES !== "undefined" && MONSTER_RULES.spirit && MONSTER_RULES.spirit.max) || 3;
    const spiritGained = {};            // uid → 戦闘中に増えた気合（run.js が名簿へ反映）
    let scatterUntil = 0;               // かく乱：このラウンドまで敵の狙いが散る
    const gainSpirit = (u, amount, reason) => {
      if (u.side !== "player" || u.flags.summoned || u.flags.mercenary || u.spirit === null || u.spirit === undefined) return;
      const before = u.spirit;
      u.spirit = Math.min(SPIRIT_MAX, before + amount);
      const got = u.spirit - before;
      if (got <= 0) return;
      spiritGained[u.uid] = (spiritGained[u.uid] || 0) + got;
      emit("note", { unitId: u.id, spiritGain: got, reason, emphasis: 1, text: `　${u.name}の気合が高まる（${reason}）`, cls: "trait" });
    };
    // 狙いの選び方。先頭（配置順）が60%。敵は かく乱 で散り、囮を狙い、弓は最も弱った者を狙う。
    const pickTarget = (unit, living, round) => {
      if (unit.side === "enemy") {
        const decoy = living.find(u => (u.flags.decoyUntil || 0) >= round);
        if (decoy && U.chance(0.5)) return decoy;
        if (scatterUntil >= round) return U.pick(living);
        if (unit.role === "archer" && U.chance(0.6)) return living.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      }
      return U.chance(0.6) ? living[0] : U.pick(living);
    };
    const moveBack = (list, target) => {
      const i = list.indexOf(target);
      const next = i >= 0 ? list.findIndex((u, n) => n > i && onField(u)) : -1;
      if (i >= 0 && next >= 0) [list[i], list[next]] = [list[next], list[i]];
      return next >= 0;
    };
    const lowestAlly = (allies, except) => allies.filter(u => onField(u) && u !== except).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || null;
    // 技が今選べない理由。null なら選べる。
    const skillWhy = (u, sk, spirit) => {
      if (u.flags.mercenary) return "傭兵";
      if (u.flags.winded) return "息切れ";
      if (spirit !== null && spirit < (sk.cost || 0)) return "気合不足";
      if (sk.condition === "hp50" && u.hp < u.maxHp * 0.5) return "条件外";
      if (sk.kind === "revive" && !playerUnits.some(a => !a.alive && !a.flags.summoned)) return "条件外";
      if (sk.kind === "cover" && !playerUnits.some(a => onField(a) && a !== u)) return "条件外";
      return null;
    };
    const gainBattleResource = (unit, resource, value, label, parent) => {
      const resourceName = resource === "gold" ? "G" : resource;
      const verb = label === "殉職手当" ? "支給予約" : "略奪予約";
      const event = emitCausal("resource_gain", {
        sourceId: unit.id, resource, amount: value, reserved: true, label,
        emphasis: 1, text: `　${unit.name}の【${label}】 ${value}${resourceName}を${verb}`, cls: "loot"
      }, parent);
      if (resource === "gold") {
        const before = reservedGold;
        reservedGold += value;
        if (goblinPair) {
          lootPairBoost = emitCausal("synergy_trigger", {
            synergyId: "goblin_pair", name: "追い剥ぎコンビ", amount: 25, emphasis: 2,
            text: "　【追い剥ぎコンビ】盗んだ勢いで、次の味方攻撃+25%！", cls: "synergy"
          }, event);
        }
        const nextLedgerMark = (ledgerFires + 1) * 3;
        if (options.extortionLedger && ledgerFires < facilityWorks
          && before < nextLedgerMark && reservedGold >= nextLedgerMark) {
          ledgerFires += 1;
          ledgerBoost = emitCausal("facility_trigger", {
            facilityId: "extortion_ledger", name: "恐喝帳簿", desc: "次の味方攻撃+40%",
            amount: reservedGold, emphasis: 2,
            text: `　施設【恐喝帳簿】 予約金貨${reservedGold}G到達（${ledgerFires}回目）、次の味方攻撃+40%`, cls: "synergy"
          }, event);
        }
      }
      return event;
    };

    emit("battle_start", { absent: playerUnits.filter(u => u.flags.absent).map(snap), player: playerUnits.filter(onField).map(snap),
      enemy: enemyUnits.map(snap)
    });
    let feastTrigger = null;
    const rations = options.rations;
    // V2a の伝票（run.js の Game.mealPlan）。ここでは**倍率を計算し直さない**。
    // 起点・対象・効果量を既存イベントへ書き添えるためだけに読む。
    const meal = (rations && rations.meal) || null;
    let mealTarget = null;       // 食事強化を受けた戦闘ユニット
    let mealSource = null;       // 料理人の戦闘ユニット
    let mealFirstHitSeen = false;   // 対象者の「最初の有効打」を1回だけ印にする
    for (const u of playerUnits) {
      u.starved = u.starved || !!(rations && rations.shortage > 0 && !u.tags.includes("undead"));
      u.feast = !!(rations && rations.feastUid != null && rations.consumed >= 4);
    }
    if (rations) {
      const rationEvent = emitCausal("resource_consume", {
        resource: "food", amount: rations.consumed, need: rations.need, shortage: rations.shortage,
        emphasis: rations.emptied ? 2 : 1,
        text: `戦闘糧食 ${rations.consumed}/${rations.need} を消費`, cls: "food"
      }, null);
      if (rations.kitchen && rations.consumed > 0) {
        emitCausal("facility_trigger", { facilityId: "grand_kitchen", name: "巨大厨房", emphasis: 2,
          text: "　施設【巨大厨房】 食事強化を2倍にする！", cls: "synergy" }, rationEvent);
      }
      const byUid = uid => playerUnits.find(u => u.uid === uid);
      for (const uid of rations.bigEaterUids || []) {
        const u = byUid(uid);
        if (!u || rations.consumed <= 0) continue;
        emitCausal("trait_trigger", { sourceId: u.id, traitId: "big_eater", name: "大食漢", emphasis: 1,
          text: `　${u.name}の【大食漢】 腹いっぱいで与ダメージ上昇`, cls: "trait" }, rationEvent);
      }
      const cook = byUid(rations.cookUid);
      mealSource = cook || null;
      mealTarget = meal && meal.targetUid != null ? byUid(meal.targetUid) : null;
      if (cook && rations.consumed > 0) {
        // 既存イベントに起点・対象・効果量を書き添える（新しいイベントは足さない）。
        // 伝票が無い古い呼び出しでは、従来どおり対象も量も持たない1行のまま。
        const targetName = mealTarget ? mealTarget.name : null;
        const percent = meal ? meal.boostPercent : 0;
        emitCausal("trait_trigger", {
          sourceId: cook.id, traitId: "demon_cook", name: "魔界料理人", emphasis: 1,
          targetId: mealTarget ? mealTarget.id : null,
          targetName,
          amount: meal ? meal.boost : 0,
          amountPercent: percent,
          consumed: rations.consumed,
          kitchenMult: meal ? meal.kitchenMult : 1,
          // 食欲が同値で並んだ者。「なぜこの人が受けたか」を表示側が説明できる
          tiedIds: meal ? (meal.tiedUids || []).map(uid => (byUid(uid) || {}).id).filter(Boolean) : [],
          targetEatsNothing: meal ? !!meal.targetEatsNothing : false,
          text: targetName
            ? `　${cook.name}の【魔界料理人】 ${targetName}へ食事を火力へ変換（与ダメージ+${percent}%）`
            : `　${cook.name}の【魔界料理人】 食事を火力へ変換`,
          cls: "trait"
        }, rationEvent);
      }
      const hunger = byUid(rations.hungerUid);
      if (hunger && rations.emptied) {
        emitCausal("trait_trigger", { sourceId: hunger.id, traitId: "hunger_demon", name: "飢餓の悪魔", emphasis: 3,
          text: `　${hunger.name}の【飢餓の悪魔】 備蓄が尽き、全軍が飢えて暴走！`, cls: "trait" }, rationEvent);
      }
      const feast = byUid(rations.feastUid);
      if (feast && rations.consumed >= 4 && !feast.flags.absent) {  // 酔って離席中なら宴は無い
        feastTrigger = emitCausal("trait_trigger", { sourceId: feast.id, traitId: "glutton_feast", name: "暴食の宴", emphasis: 2,
          text: `　【暴食の宴】 ${feast.name}が食後の追加行動を狙う`, cls: "trait" }, rationEvent);
      }
    }
    for (const u of [...enemyUnits, ...playerUnits]) {
      if (!u.introQuote || u.flags.absent) continue;
      emit("dialogue", {
        unitId: u.id, name: u.name, side: u.side, quote: u.introQuote,
        emphasis: 2, text: `${u.name}「${u.introQuote}」`, cls: "dialogue"
      });
    }
    // 遅刻者の不在を、開戦時に明示する。本人は居ないのでモルモが言う。
    for (const u of playerUnits) {
      if (!u.flags.absent) continue;
      const lines = (TRAITS[u.flags.lateTrait] || {}).lines;
      const pool = (lines && lines.absent) || ["{name}殿がいません！"];
      const quote = U.pick(pool).replace(/\{name\}/g, u.name).replace(/\{by\}/g, u.flags.lateBy || "誰か");
      emit("dialogue", {
        unitId: u.id, name: "モルモ", side: "player", quote, late: true,
        emphasis: 2, text: `モルモ「${quote}」`, cls: "dialogue"
      });
      // 本人は戦場にいないが、声だけは届く。
      if (lines && lines.absentSelf && lines.absentSelf.length) {
        const self = U.pick(lines.absentSelf);
        emit("dialogue", {
          unitId: u.id, name: u.name, side: "player", quote: self, late: true, offstage: true,
          emphasis: 2, text: `${u.name}「${self}」（戦場の外から）`, cls: "dialogue"
        });
      }
    }
    for (const s of activeSyn) {
      // merge型（キングスライム合体）は「合体した戦闘」でだけ run.js がイベントを差し込む。
      // 条件を満たしているだけで「合体する！」と出すと、合体していないのに宣言することになる
      // （合体を魔王の選択にした時点でそうなった）。
      if (s.type === "merge") continue;
      emit("synergy", {
        id: s.id, name: s.name, desc: s.desc, emphasis: 3,
        text: `シナジー発動【${s.name}】 ${s.desc}`, cls: "synergy"
      });
    }

    // ダメージ適用。kind で attack / splash を出し分ける。
    const applyDamage = (attacker, target, amount, kind, opts) => {
      opts = opts || {};
      // CHAINの深さを全ダメージ系統の共通報酬にする。
      // 3段目は小さな成功、4段目から明確な爆発。強欲だけでなく宴やOVERKILL伝播にも効く。
      const chainDepth = opts.parentEvent ? (opts.parentEvent.chainDepth || 1) + 1 : 1;
      const v2Depth = opts.parentEvent ? (opts.parentEvent.v2Depth ?? 1) + 1 : 1;
      const multiplierDepth = useV2ChainMultiplier ? v2Depth : chainDepth;
      if (attacker.side === "player" && multiplierDepth >= 3) {
        const chainMult = multiplierDepth === 3
          ? 1.25 : Math.min(2.5, 1.75 + (multiplierDepth - 4) * .25);
        amount *= chainMult;
        opts.traits = [...(opts.traits || []), `CHAIN ${multiplierDepth} ×${chainMult.toFixed(2)}`];
      }
      let dmg = Math.max(1, Math.round(amount * target.mods.takenMult));
      // まもる（コマンド）。このラウンドの被ダメージ半減。敵対攻撃だけ。
      if (target.flags.guarding && !opts.incident && attacker.side !== target.side) {
        dmg = Math.max(1, Math.ceil(dmg * 0.5));
        opts.traits = [...(opts.traits || []), "まもる"];
        // 大技をまもるで受け切った：読み勝ちの報酬に気合+1
        if (attacker.flags.bigMove) gainSpirit(target, 1, "大技を受け切った");
      }
      // かばう（技 cover／敵の盾役）。まもる中の者はかばえない（一つの手番で一つ）。
      if (!opts.incident && attacker.side !== target.side) {
        const side = target.side === "player" ? playerUnits : enemyUnits;
        const coverer = side.find(u => onField(u) && u !== target && u.flags.covering === target.id && !u.flags.guarding);
        if (coverer) {
          const ratio = coverer.flags.coverRatio || 0.6;
          note(`　${coverer.name}が${target.name}をかばった`, "trait");
          target = coverer;
          dmg = Math.max(1, Math.round(amount * ratio * target.mods.takenMult));
          opts.traits = [...(opts.traits || []), "かばう"];
        }
      }
      // 味方が受ける直前の肩代わり。敵対攻撃だけに限り、最初に数値を返した者へ当たり先を替える。
      if (!opts.incident && attacker.side !== target.side) {
        const ally = target;
        const guards = (ally.side === "player" ? playerUnits : enemyUnits).filter(u => onField(u) && u !== ally);
        for (const unit of guards) {
          for (const tid of unit.traits) {
            const tr = TRAITS[tid];
            if (!tr || !tr.onAllyHit) continue;
            const redirected = tr.onAllyHit({ unit, ally, attacker, dmg, round, log: note });
            if (typeof redirected !== "number" || redirected < 0) continue;
            const trigger = skillTrigger(unit, tid, opts.parentEvent || null);
            target = unit;
            dmg = Math.max(1, Math.round(redirected * target.mods.takenMult));
            opts.parentEvent = trigger;
            break;
          }
          if (target !== ally) break;
        }
      }
      for (const tid of target.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.modTaken) dmg = tr.modTaken({ unit: target, attacker, dmg });
      }
      const hpBefore = target.hp;
      target.hp -= dmg;

      let dead = false, survived = false, survival = null, summons = [];
      if (target.hp <= 0) {
        for (const tid of target.traits) {
          const tr = TRAITS[tid];
          if (!tr || !tr.onLethal) continue;
          const result = tr.onLethal({ unit: target, log: note, summon: spec => summons.push(spec),
            trigger: traitId => skillTrigger(target, traitId, opts.parentEvent || null) });
          if (result === true || result?.survive) { survived = true; survival = result; break; }
        }
        if (survived) {
          target.hp = Math.max(1, survival?.hp ?? 1);
        } else {
          target.alive = false;
          target.hp = 0;
          dead = true;
        }
      }

      // 演出の強さ: 撃破 > 大ダメージ > 特性発動 > 通常
      let emphasis = 0;
      if (dead) emphasis = 3;
      else if (dmg >= target.maxHp * 0.25) emphasis = 2;
      else if (opts.traits && opts.traits.length) emphasis = 1;

      const label = opts.label ? `【${opts.label}】` : "";
      const damageEvent = emitCausal(kind, {
        fromId: attacker.id, toId: target.id, dmg,
        hp: target.hp, maxHp: target.maxHp, dead,
        traits: opts.traits || [], label: opts.label || null, emphasis,
        text: `　${attacker.name}${label} → ${target.name} に ${dmg} ダメージ (残HP ${target.hp})`,
        cls: "dmg"
      }, opts.parentEvent || null);
      if (useV2ChainMultiplier && damageEvent.v2Depth !== multiplierDepth) {
        throw new Error(`V2倍率の逐次段数がイベント段数と不一致: ${multiplierDepth} != ${damageEvent.v2Depth}`);
      }
      // 食事強化を受けた者の「最初の有効打」。新しいイベントは足さず、
      // すでに出したダメージイベントへ印を書き添えるだけ（順序・回数・深度は動かない）。
      //
      // 印を付けるのは **食事強化が実際に乗った、敵への一撃**だけ。
      // 仲間割れ（incident）の同士討ちは unit.atk * 0.7 の生ダメージで、
      // mods.dmgMult を通らない＝食事強化が反映されていない。味方を殴った回を
      // 「料理の着地」と呼ぶと、戦果が嘘になる。対象外の回では印の権利も消費しない
      // （フラグは下の if の中でしか立てない）ので、後の本当の初撃にちゃんと付く。
      const mealEligible = target.side === "enemy" && !opts.incident;
      if (mealEligible && mealTarget && attacker === mealTarget && dmg > 0
        && !mealFirstHitSeen && meal && meal.boost > 0) {
        mealFirstHitSeen = true;
        damageEvent.mealBoost = {
          first: true,
          sourceId: mealSource ? mealSource.id : null,
          sourceName: mealSource ? mealSource.name : null,
          targetId: mealTarget.id,
          targetName: mealTarget.name,
          amount: meal.boost,
          amountPercent: meal.boostPercent
        };
      }
      let overkillEvent = null;
      const excessDamage = dead ? Math.max(0, dmg - hpBefore) : 0;
      const excessPercent = excessDamage > 0 ? Math.round(excessDamage / target.maxHp * 100) : 0;
      if (excessPercent >= Battle.OVERKILL_MIN_PERCENT) {
        const excess = excessDamage;
        const percent = excessPercent;
        const rank = Battle.overkillRank(percent);
        overkillEvent = emitCausal("overkill", {
          fromId: attacker.id, toId: target.id, excess, percent,
          rankId: rank.id, rank: rank.name, emphasis: rank.emphasis,
          text: `　${rank.name}！ 余剰${excess}ダメージ（${percent}% OVERKILL）`, cls: "overkill"
        }, damageEvent);
        // 余剰は捨て値にしない。魔王軍の戦意へ変える。
        if (attacker.side === "player") {
          gainMomentum(percent, overkillEvent, (opts.propagationDepth || 0) + 1);
        }
      }
      if (survived) {
        emitCausal("survive", { unitId: target.id, hp: target.hp, maxHp: target.maxHp, emphasis: 2 }, damageEvent);
      }
      for (const spec of summons) summonUnit(target, spec, damageEvent);
      let deathEvent = null;
      if (dead) {
        deathEvent = emitCausal("death", {
          unitId: target.id, emphasis: 2,
          text: `　${target.name} は倒れた！`, cls: "death"
        }, damageEvent);
        reactToDeath(target, deathEvent);
        // 味方（軍団員）が倒れた：立っている者の気合が高まる（波乱が反撃の燃料になる）
        if (target.side === "player" && !target.flags.summoned) {
          for (const u of playerUnits) if (onField(u) && u !== target) gainSpirit(u, 1, `${target.name}が倒れた`);
        }
        const propagationDepth = opts.propagationDepth || 0;
        // 伝播の入口は2つ。特性《連鎖虐殺》と、シナジーを積んだ《魔王軍完成》。
        // 後者は魔王軍の編成が起こすものなので味方側だけ。深さは積んだ枚数で伸びる。
        const byTrait = attacker.traits.includes("chain_massacre");
        const byOverload = !byTrait && attacker.side === "player" && overloadStacks > 0;
        const limit = byTrait ? 3 : overloadStacks + 1;
        // 余剰を出した撃破は、そのまま次へ流れる。以前は「余剰125-25×段数%以上」を
        // 求めていたが、実プレイでは滅多に満たされず連鎖が始まらなかった。
        // 《魔王軍完成》が立っている＝すでに札を積んだ状態なので、そこは緩くてよい。
        const needPercent = byTrait ? 100 : Math.max(15, 60 - 15 * overloadStacks);
        if (overkillEvent && overkillEvent.percent >= needPercent && propagationDepth < limit
          && (byTrait || byOverload)) {
          const opponents = attacker.side === "player" ? enemyUnits : playerUnits;
          const next = opponents.find(onField);
          if (next) {
            const label = byTrait ? "連鎖虐殺" : "魔王軍完成";
            const step = propagationDepth + 1;
            // 連鎖は進むほど強くなる。以前は「余剰×0.22」で、余剰は撃破のたびに
            // 小さくなるため段が進むほど威力が落ちていた。演出は盛り上がるのに
            // 数字はしぼむので、爆発しているように見えなかった。
            const ratio = byTrait ? 0.3 + 0.1 * (step - 1) : 0.35 + 0.25 * (step - 1);
            const trigger = emitCausal("trait_trigger", {
              sourceId: attacker.id, traitId: byTrait ? "chain_massacre" : "overload", name: label,
              propagationDepth: step, ratio: Math.round(ratio * 100), emphasis: 3,
              text: byTrait
                ? `　${attacker.name}の【連鎖虐殺】 余剰ダメージが${next.name}へ伝播！`
                : `　【魔王軍完成】 連鎖${step}段目！ 余剰の${Math.round(ratio * 100)}%が${next.name}へ流れ込む`,
              cls: "trait"
            }, overkillEvent);
            applyDamage(attacker, next, overkillEvent.excess * ratio, "splash", {
              label, parentEvent: trigger, propagationDepth: step
            });
          }
        }
      }
      return { dmg, event: damageEvent, deathEvent, overkillEvent };
    };

    const tryIncident = (unit, allies, actionOpts) => {
      if (unit.side !== "player" || unit.flags.incidentUsed) return false;
      // 既存3件は通常行動だけ。追撃中は明示した連鎖ハプニングだけを判定。
      const candidates = BATTLE_HAPPENINGS.filter(h => (!actionOpts.isExtra || h.duringChain) && h.check(unit));
      const generalPresent = allies.some(a => onField(a) && a.rankId === "general");
      for (const happening of candidates) {
        const chance = happening.chance * (generalPresent ? 0.35 : 1);
        if (!U.chance(chance)) continue;
        let target = null;
        if (happening.kind === "friendly_fire") {
          const victims = allies.filter(a => onField(a) && a !== unit);
          if (!victims.length) continue;
          target = U.pick(victims);
        }
        unit.flags.incidentUsed = true;
        emitCausal("incident", {
          id: happening.id, name: happening.name, unitId: unit.id,
          targetId: target && target.id, emphasis: 3,
          text: happening.text(unit, target), cls: "incident"
        }, actionOpts.parentEvent || null);
        if (target) applyDamage(unit, target, unit.atk * 0.7, "splash", { label: "仲間割れ", incident: true, parentEvent: timeline[timeline.length - 1] });
        return true;
      }
      return false;
    };

    const act = (unit, allies, enemies, round, actionOpts) => {
      actionOpts = actionOpts || {};
      const living = enemies.filter(onField);
      if (living.length === 0) return;
      unit.chainDepth = actionOpts.parentEvent ? (actionOpts.parentEvent.chainDepth || 1) + 1 : 1;
      if (tryIncident(unit, allies, actionOpts)) return;
      // 先頭（配置順）が60%で狙われる。前衛に壁を置く意味を持たせる。
      const target = actionOpts.target && living.includes(actionOpts.target)
        ? actionOpts.target
        : pickTarget(unit, living, round);

      // 号令を受けた一撃。技の条件を飛ばし（特性側が ctx.ordered を読む）、与ダメ+50%。
      // 追加行動（血の雄叫び・宴）には乗せない。代償は act() の最後で払う（次の手番は息切れ）。
      const ordered = !!unit.flags.ordered && !actionOpts.isExtra;
      const ctx = {
        attacker: unit, target, allies, enemies, round,
        mult: unit.mods.dmgMult, notes: [], rng: U.rand, ordered
      };
      for (const tid of unit.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.modDealt && !autoExhausted(unit, tid)) tr.modDealt(ctx);
      }
      // 号令（自動戦闘の節目）は+50%と息切れ。コマンドの「技」は気合を払うだけ（倍率も息切れも無し）。
      if (ordered && !unit.flags.orderedManual) { ctx.mult *= 1.5; ctx.notes.push("号令"); }
      // 敵の大技（構えの次のラウンド）。
      if (unit.flags.bigMove) { ctx.mult *= unit.role === "brute" ? 2.0 : ENEMY_BIG_MOVE.mult; ctx.notes.push("大技"); }
      // 鬨の声・敵隊長の号令（このラウンド／指定ラウンドまで）
      if (unit.flags.buff && unit.flags.buff.until >= round) { ctx.mult *= unit.flags.buff.mult; ctx.notes.push(unit.flags.buff.name || "鼓舞"); }
      const ledgerParent = unit.side === "player" ? ledgerBoost : null;
      if (ledgerParent) {
        ctx.mult *= 1.4;
        ctx.notes.push("恐喝帳簿");
        ledgerBoost = null;
      }
      if (unit.side === "player" && lootPairBoost) {
        ctx.mult *= 1.25;
        ctx.notes.push("追い剥ぎコンビ");
        lootPairBoost = null;
      }
      // 戦意は魔王軍のもの。積み上がった倍率がそのまま数字に出る。
      if (unit.side === "player" && momentum > 0) ctx.mult *= 1 + momentum;
      const variance = 0.9 + U.rand() * 0.2;
      const raw = unit.atk * ctx.mult * variance * (actionOpts.mult || 1);
      const amount = Math.max(1, Math.round(raw) - Math.floor(target.def / 2));
      if (ctx.notes.length) {
        note(`　${unit.name}の特性（${ctx.notes.join("・")}！）`, "trait");
      }
      const applied = applyDamage(unit, target, amount, "attack", {
        traits: ctx.notes,
        label: actionOpts.label || null,
        parentEvent: actionOpts.parentEvent || ledgerParent || null
      });
      const dmg = applied.dmg;

      // 攻撃後フック（火球・悪戯など）
      const triggeredEvents = [];
      if (applied.deathEvent && goblinRaid && unit.race === "ゴブリン" && target.side === "enemy") {
        triggeredEvents.push(gainBattleResource(unit, "gold", 1, "略奪者の連携", applied.deathEvent));
      }
      if (applied.deathEvent && martyrAllowance && unit.flags.wasRevived
        && !unit.flags.martyrAllowanceUsed && target.side === "enemy") {
        unit.flags.martyrAllowanceUsed = true;
        unit.flags.martyrGold = 2;
        triggeredEvents.push(gainBattleResource(unit, "gold", 2, "殉職手当", applied.deathEvent));
      }
      // 大食漢：倒した相手の飯を、その場で食い始める。次の手番が飛ぶ。
      const eater = TRAITS.big_eater && TRAITS.big_eater.eat;
      if (eater && unit.side === "player" && applied.deathEvent && unit.traits.includes("big_eater")
          && (unit.flags.ateCount || 0) < eater.maxPerBattle && U.chance(eater.chance)) {
        unit.flags.ateCount = (unit.flags.ateCount || 0) + 1;
        unit.flags.stuffed = true;
        const line = U.pick(TRAITS.big_eater.lines.eat);
        const trig = emitCausal("trait_trigger", {
          sourceId: unit.id, traitId: "big_eater", name: "大食漢", quote: line, emphasis: 2,
          note: "倒した相手の携行食を食べ始めた。次の手番は動かない。少し回復する",
          text: `　${unit.name}の【大食漢】「${line}」 ${target.name}の携行食を食べ始めた（次の手番は動かない）`, cls: "trait"
        }, applied.deathEvent);
        const heal = Math.min(unit.maxHp - unit.hp, Math.ceil(unit.maxHp * eater.healRate));
        if (heal > 0) {
          unit.hp += heal;
          emitCausal("heal", { unitId: unit.id, amount: heal, hp: unit.hp, maxHp: unit.maxHp, emphasis: 1 }, trig);
        }
      }
      const post = {
        attacker: unit, target, dmg, enemies, allies, round, onField, log: note, pick: U.pick, ordered,
        trigger: traitId => skillTrigger(unit, traitId, applied.event),
        dealRaw: (a, t, d, label, parentEvent) => applyDamage(a, t, d, "splash", { label, parentEvent: parentEvent || applied.event }).dmg,
        extraAction: (parentEvent, label) => act(unit, allies, enemies, round, { parentEvent, label, isExtra: true }),
        gainResource: (resource, value, label) => {
          const event = gainBattleResource(unit, resource, value, label, applied.event);
          triggeredEvents.push(event);
          return event;
        }
      };
      for (const tid of unit.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.postAttack && target && !autoExhausted(unit, tid)) tr.postAttack(post);
      }
      if (triggeredEvents.length) {
        // 金貨は軍団の成果。盗む役と反応する役を別の人材で組める。
        // 各人の greedyChains が再帰に入る前に使用済みになるため、
        // 追加攻撃で別の金貨が出ても、同じ鎖で同じ人は二度動かない。
        for (const reactor of allies) {
          if (!onField(reactor) || !enemies.some(onField)) continue;
          const reaction = {
            attacker: reactor, events: triggeredEvents,
            extraAction: (mult, parentEvent, label) => {
              const trigger = emitCausal("trait_trigger", {
                sourceId: reactor.id, traitId: "greedy", name: label, emphasis: 2,
                text: `　${reactor.name}の【${label}】 ${unit.name}の金貨獲得に反応、追加行動！`, cls: "trait"
              }, parentEvent);
              act(reactor, allies, enemies, round, { mult, parentEvent: trigger, label, isExtra: true });
            }
          };
          for (const tid of reactor.traits) {
            const tr = TRAITS[tid];
            if (tr && tr.onTriggeredEvents) tr.onTriggeredEvents(reaction);
          }
        }
      }
      // 号令の代償。全力を出した次の手番は息が上がって動けない（大食漢の stuffed と同じ形）。
      if (ordered) { const manual = !!unit.flags.orderedManual; unit.flags.ordered = false; unit.flags.orderedManual = false; if (!manual) unit.flags.winded = true; }
      if (unit.flags.bigMove) unit.flags.bigMove = false;
      // 斥候（敵 rogue）：殴った相手の気合を奪う
      if (unit.side === "enemy" && unit.role === "rogue" && target.side === "player" && typeof target.spirit === "number" && target.spirit > 0 && U.chance(0.3)) {
        target.spirit -= 1;
        spiritSpent[target.uid] = (spiritSpent[target.uid] || 0) + 1;
        note(`　${unit.name}が${target.name}の気合を奪った`, "trait");
      }
      return dmg;
    };

    // ── 技の解決（指示窓で選んだ技）。cover/buff/scatter は指示の直後に効き、ほかは本人の手番で ──
    const resolveSkill = (unit, sk, cmd, allies, enemies, round) => {
      if (!sk) return;
      const living = enemies.filter(onField);
      if (sk.hit !== undefined && !U.chance(sk.hit)) {
        const miss = U.pick((sk.lines && sk.lines.miss) || ["外れた"]);
        emit("note", { unitId: unit.id, skillMiss: true, skillId: cmd.id, emphasis: 1, text: `　${unit.name}の【${sk.name}】は外れた「${miss}」`, cls: "trait" });
        return;
      }
      const pickEnemy = () => (cmd.targetId && living.find(e => e.id === cmd.targetId)) || (living.length ? pickTarget(unit, living, round) : null);
      const heal = (t, ratio) => {
        const amount = Math.min(t.maxHp - t.hp, Math.ceil(t.maxHp * ratio));
        if (amount <= 0) return;
        t.hp += amount;
        emitCausal("heal", { unitId: t.id, amount, hp: t.hp, maxHp: t.maxHp, sourceId: unit.id, label: sk.name, emphasis: 1 }, null);
      };
      switch (sk.kind) {
        case "strike": case "debuff": case "steal": {
          const target = pickEnemy();
          let dmg = 0;
          if (target && sk.power) dmg = act(unit, allies, enemies, round, { target, mult: sk.power, label: sk.name }) || 0;
          if (sk.splash && target) {
            const other = living.find(e => e !== target && onField(e));
            if (other) applyDamage(unit, other, Math.max(1, Math.round(unit.atk * sk.power * sk.splash) - Math.floor(other.def / 2)), "splash", { label: sk.name });
          }
          if (sk.atkDown && target && target.alive) { target.atk = Math.max(1, target.atk - sk.atkDown); note(`　${target.name}の攻撃力が${sk.atkDown}下がった（残${target.atk}）`, "trait"); }
          if (sk.push && target && target.alive) moveBack(enemies, target);
          if (sk.gold) gainBattleResource(unit, "gold", sk.gold, sk.name, null);
          if (sk.recoil && dmg > 0 && unit.alive) applyDamage(unit, unit, Math.max(1, Math.round(dmg * sk.recoil)), "splash", { label: "反動", incident: true });
          break;
        }
        case "aoe": {
          for (const e of living) {
            if (!onField(e)) continue;
            const raw = unit.atk * sk.power * (0.9 + U.rand() * 0.2) * (unit.mods.dmgMult || 1);
            applyDamage(unit, e, Math.max(1, Math.round(raw) - Math.floor(e.def / 2)), "attack", { label: sk.name, traits: [sk.name] });
            if (sk.burn && e.alive) e.flags.burn = { at: round + 1, source: unit, parentEvent: null };
          }
          if (sk.winded) unit.flags.winded = true;
          break;
        }
        case "heal": {
          if (sk.target === "all_allies") for (const a of allies.filter(onField)) heal(a, sk.power);
          else { const t = (cmd.targetId && allies.find(a => a.id === cmd.targetId && onField(a))) || lowestAlly(allies, null); if (t) heal(t, sk.power); }
          break;
        }
        case "rest": heal(unit, sk.power); break;
        case "stun": {
          const target = pickEnemy(); if (!target) break;
          if (U.chance(sk.chance || 0.5)) { target.flags.stunned = true; note(`　${target.name}は${sk.name}で動けない`, "trait"); }
          else {
            note(`　${target.name}は${sk.name}を振り払った`, "trait");
            if (sk.retaliate && onField(target)) act(target, enemies, allies, round, { target: unit, label: "反撃", isExtra: true });
          }
          break;
        }
        case "charm": {
          const target = pickEnemy(); if (!target) break;
          if (U.chance(sk.chance || 0.5)) { target.flags.charmed = true; note(`　${target.name}は${unit.name}に魅入られた`, "trait"); }
          else emit("note", { unitId: unit.id, skillMiss: true, emphasis: 1, text: `　${unit.name}の【${sk.name}】は効かなかった「${U.pick((sk.lines && sk.lines.miss) || ["……"])}」`, cls: "trait" });
          break;
        }
        case "revive": {
          const fallen = allies.filter(a => !a.alive && !a.flags.summoned);
          const t = (cmd.targetId && fallen.find(a => a.id === cmd.targetId)) || fallen[0];
          if (!t) { note(`　${unit.name}の【${sk.name}】……起こす者がいない`, "trait"); break; }
          const death = [...timeline].reverse().find(e => e.type === "death" && e.unitId === t.id) || null;
          t.alive = true; t.hp = Math.max(1, Math.round(t.maxHp * sk.power));
          t.flags.wasRevived = true;
          emitCausal("revive", { unitId: t.id, sourceId: unit.id, skillId: cmd.id, hp: t.hp, maxHp: t.maxHp, emphasis: 3 }, death);
          if (sk.selfHp) { unit.hp = Math.max(1, unit.hp - Math.round(unit.maxHp * sk.selfHp)); note(`　${unit.name}は代償に身を削った（残HP ${unit.hp}）`, "trait"); }
          break;
        }
        case "random": {
          const pick = U.pick(sk.table || []); if (!pick) break;
          note(`　${unit.name}の【${sk.name}】……${pick.name || "何か"}が出た！`, "trait");
          resolveSkill(unit, Object.assign({ name: sk.name, lines: {} }, pick), cmd, allies, enemies, round);
          break;
        }
        default: break;
      }
    };
    // 指示の直後に効く技（かばう・鬨の声・かく乱）。本人の手番では身構えるだけ。
    const applyImmediateSkill = (unit, sk, cmd, round) => {
      if (sk.kind === "cover") {
        const t = (cmd.targetId && playerUnits.find(a => a.id === cmd.targetId && onField(a) && a !== unit)) || lowestAlly(playerUnits, unit);
        if (t) { unit.flags.covering = t.id; unit.flags.coverRatio = sk.power || 0.6; note(`　${unit.name}が${t.name}の前に立つ`, "trait"); }
        return true;
      }
      if (sk.kind === "buff") {
        for (const a of playerUnits.filter(onField)) a.flags.buff = { mult: sk.power || 1.3, until: round, name: sk.name };
        return true;
      }
      if (sk.kind === "scatter") { scatterUntil = round + 1; unit.flags.decoyUntil = round + 1; return true; }
      return false;
    };
    // 敵の役割：次のラウンドの行動を決める（構えは prompt の intent に出る）。乱数は指示のあとで消費する。
    const planEnemy = (e, nextRound) => {
      const mates = enemyUnits.filter(onField);
      if (e.role === "priest") {
        const hurt = mates.filter(m => m.hp < m.maxHp * 0.6).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt) return { kind: "heal", targetId: hurt.id, intent: "heal" };
      }
      if (e.role === "caster" && nextRound % 2 === 0) return { kind: "aoe", intent: "aoe" };
      if (e.role === "shield") {
        const weak = mates.filter(m => m !== e && m.hp <= m.maxHp * 0.5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (weak) return { kind: "cover", targetId: weak.id, intent: "guard" };
        if (U.chance(0.4)) return { kind: "guard", intent: "guard" };
      }
      if (e.role === "commander" && nextRound === 1) return { kind: "buff", intent: null };
      return null;
    };
    const planEnemies = (nextRound) => {
      for (const e of enemyUnits.filter(onField)) {
        e.flags.plan = planEnemy(e, nextRound);
        if (e.flags.plan && e.flags.plan.intent) {
          const word = { heal: "仲間を癒やそうとしている", aoe: "全体への術を練っている", guard: "盾を構えた" }[e.flags.plan.intent];
          emit("intent", { unitId: e.id, name: e.name, intent: e.flags.plan.intent, emphasis: 1, text: `　${e.name}が${word}`, cls: "trait" });
        }
      }
    };
    // 敵の計画の実行。true を返したら通常攻撃はしない。
    const runEnemyPlan = (unit, plan, allies, enemies, round) => {
      if (plan.kind === "heal") {
        const t = allies.find(a => a.id === plan.targetId && onField(a)) || lowestAlly(allies, null);
        if (!t) return false;
        const amount = Math.min(t.maxHp - t.hp, Math.ceil(t.maxHp * 0.25));
        if (amount > 0) { t.hp += amount; emitCausal("heal", { unitId: t.id, amount, hp: t.hp, maxHp: t.maxHp, sourceId: unit.id, label: "癒やし", emphasis: 1 }, null); }
        note(`　${unit.name}が${t.name}を癒やした`, "trait");
        return true;
      }
      if (plan.kind === "aoe") {
        for (const p of enemies.filter(onField)) {
          const raw = unit.atk * 0.6 * (0.9 + U.rand() * 0.2);
          applyDamage(unit, p, Math.max(1, Math.round(raw) - Math.floor(p.def / 2)), "attack", { label: "全体攻撃", traits: ["術"] });
        }
        return true;
      }
      // guard / cover は指示の直後に立てている。手番は身構えるだけ。
      if (plan.kind === "guard" || plan.kind === "cover") { emit("note", { unitId: unit.id, guarding: true, emphasis: 1, text: `　${unit.name}は守りに入っている`, cls: "trait" }); return true; }
      if (plan.kind === "buff") {
        for (const a of allies.filter(onField)) a.flags.buff = { mult: 1.2, until: round + 1, name: "隊長の号令" };
        note(`　${unit.name}「全軍、押せ！」 敵の攻撃が高まった（2ラウンド）`, "trait");
        return true;
      }
      return false;
    };

    const wiped = us => us.every(u => !u.alive);
    const all = () => [...playerUnits, ...enemyUnits];
    const tryGraveyardSummon = () => {
      if (!options.graveyard || graveyardUsed >= facilityWorks) return null;
      const pending = graveyardQueue[graveyardUsed];
      if (!pending) return null;
      graveyardUsed += 1;
      const source = pending.target;
      const summoned = Battle.makeUnit({
        uid: null, tplId: "skeleton", name: `${source.name}の骸骨従者`, race: "骸骨兵",
        icon: null, job: "墓地の従者",
        hp: Math.max(1, Math.round(source.maxHp * 0.3)),
        atk: Math.max(1, Math.round(source.atk * 0.5)), def: 0, spd: 5,
        salary: 0, loyalty: 100, traits: [], tags: ["undead"]
      }, "player");
      summoned.id = `ps${nextSummonId++}`;
      summoned.flags.summoned = true;
      playerUnits.push(summoned);
      const facilityEvent = emitCausal("facility_trigger", {
        facilityId: "graveyard", name: "墓地", desc: "戦死者を骸骨従者として召喚", emphasis: 2,
        text: `　施設【墓地】 ${source.name}の遺骸が動き出す！`, cls: "synergy"
      }, pending.deathEvent);
      const summonEvent = emitCausal("summon", {
        sourceUnitId: source.id, unit: snap(summoned), emphasis: 3,
        text: `　${summoned.name}を召喚！`, cls: "revive"
      }, facilityEvent);
      reactToUndeadArrival(summoned, summonEvent);
      return summonEvent;
    };

    // 通常ラウンド終了では全特性を処理する。全滅直後は rescueOnWipe を
    // 明示した特性と墓地だけを一度解決し、敗北判定を先延ばしにしない。
    const resolveRecoveryHooks = (rescueOnly, rescueSide) => {
      const candidates = rescueOnly
        ? (rescueSide === "enemy" ? enemyUnits : playerUnits)
        : all();
      const before = all().map(u => ({ u, alive: u.alive, hp: u.hp }));
      for (const unit of candidates) {
        if (unit.flags.absent) continue;
        const allies = unit.side === "player" ? playerUnits : enemyUnits;
        const enemies = unit.side === "player" ? enemyUnits : playerUnits;
        for (const tid of unit.traits) {
          const tr = TRAITS[tid];
          if (!tr || !tr.onRoundEnd || (rescueOnly && !tr.rescueOnWipe)) continue;
          tr.onRoundEnd({ unit, allies, enemies, round, onField, log: note, rng: U.rand,
            trigger: traitId => skillTrigger(unit, traitId, null),
            dealRaw: (attacker, target, dmg, label, parentEvent) => applyDamage(attacker, target, dmg, "splash", { label, parentEvent }).dmg,
            moveEnemyBack: target => {
              const i = enemies.indexOf(target);
              const next = i >= 0 ? enemies.findIndex((u, n) => n > i && onField(u)) : -1;
              if (i >= 0 && next >= 0) [enemies[i], enemies[next]] = [enemies[next], enemies[i]];
              return next >= 0;
            }
          });
        }
      }
      for (const s of before) {
        if (!s.alive && s.u.alive) {
          const death = [...timeline].reverse().find(e => e.type === "death" && e.unitId === s.u.id);
          const reviveEvent = emitCausal("revive", {
            unitId: s.u.id, sourceId: s.u.flags.reviveSourceId || null,
            traitId: s.u.flags.reviveTraitId || (s.u.flags.selfRevived ? "tenacity" : null),
            hp: s.u.hp, maxHp: s.u.maxHp, emphasis: 3
          }, death || null);
          s.u.flags.wasRevived = true;
          delete s.u.flags.reviveSourceId;
          delete s.u.flags.reviveTraitId;
          reactToUndeadArrival(s.u, reviveEvent);
        } else if (!rescueOnly && s.u.alive && s.u.hp > s.hp) {
          emitCausal("heal", { unitId: s.u.id, amount: s.u.hp - s.hp, hp: s.u.hp, maxHp: s.u.maxHp, emphasis: 1 }, null);
        }
      }
      if ((!rescueOnly || rescueSide === "player") && tryGraveyardSummon()) return true;
      const rescued = rescueSide === "enemy" ? enemyUnits : playerUnits;
      return !wiped(rescued);
    };
    let round = 0;
    // 撤退の提案。味方が初めて倒れたラウンドの終わりに一度だけ「重要度の印」として置く。
    // 戦闘計算・乱数には一切関与しない（permanent / reversal と同じ性格）。
    // simulate() はここで止まらず最後まで計算する＝「続けた場合の結末」を返す。
    // 止めるかどうかは run.js（settleBattle）と描画側の判断。
    let retreatOffer = null;
    // 号令の節目。options.offerOrder のときだけ、1戦闘1回。提案の位置と候補を印として置く。
    // 答え（options.orders[round] = unitId）があれば次ラウンド冒頭で実行する。
    // 提案イベントは答えの有無に関わらず同じ位置に出す（同じ種で計算し直したとき、前半が一致するため）。
    // 節目は戦況が動くたびに来る（1ラウンドに1回、回数の上限なし。気合と息切れが連打を抑える）。
    const orderOffers = [];
    const orders = options.orders || {};
    let retreatedManual = false;        // コマンドで退いた（result.retreated）
    const spiritSpent = {};             // uid → 技で払った気合（run.js が名簿へ反映）
    const offerAtRound = r => orderOffers.find(o => o.round === r) || null;

    outer:
    for (round = 1; round <= this.MAX_ROUNDS; round++) {
      emit("round_start", { round, emphasis: 1, text: `── ラウンド ${round} ──`, cls: "round" });
      const deadAtRoundStart = all().filter(u => !u.alive).length;

      // 遅刻者の到着。その場にいなかった者が、途中から戦場に立つ。
      // 味方が全員倒れたあとに一人で着くこともある。それはそれで、そういう戦いだったということ。
      for (const u of playerUnits) {
        if (!u.flags.absent || round <= u.flags.late) continue;
        u.flags.absent = false;
        u.flags.arrivedRound = round;
        const lines = (TRAITS[u.flags.lateTrait] || {}).lines;
        const quote = U.pick((lines && lines.arrive) || ["……遅れた"]);
        emit("summon", {
          sourceUnitId: null, unit: snap(u), late: true, quote, emphasis: 2,
          text: `　${u.name}が遅れて到着「${quote}」`, cls: "revive"
        });
      }

      // 大火球の燃焼は「次ラウンド開始時」にだけ解決する。flag に残した発動イベントを
      // 親にするので、燃焼も元の一発の因果列として描画・戦果に残る。
      for (const target of all().filter(u => onField(u) && u.flags.burn && u.flags.burn.at <= round)) {
        const burn = target.flags.burn;
        delete target.flags.burn;
        applyDamage(burn.source, target, Math.ceil(target.maxHp * 0.08), "splash", {
          label: "燃焼", parentEvent: burn.parentEvent || null
        });
      }

      // 号令の実行。前ラウンド末の提案に答えがあれば、本人を真っ先に動かす。
      // 倒れていれば号令は空振り（何も起きない）。乱数はここでは消費しない（台詞は pick で1回だけ消費）。
      let orderedUnit = null;
      const prevOffer = offerAtRound(round - 1);
      if (prevOffer && orders[prevOffer.round]) {
        const cand = prevOffer.candidates.find(c => c.unitId === orders[prevOffer.round]);
        const unit = cand ? playerUnits.find(u => u.id === cand.unitId) : null;
        if (cand && unit && onField(unit)) {
          unit.flags.ordered = true;
          orderedUnit = unit;
          const tr = TRAITS[cand.skillId] || {};
          const quote = U.pick((tr.lines && tr.lines.order) || ["……はっ！"]);
          emit("order_exec", {
            unitId: unit.id, name: unit.name, skillId: cand.skillId, skillName: cand.skillName, label: cand.label, quote, emphasis: 3,
            text: `　魔王「${unit.name}、${cand.label}！」 ${unit.name}「${quote}」`, cls: "order"
          });
        }
      }
      // ── コマンド（手動）。ラウンドの頭で止まり、味方それぞれの指示を受ける ──
      // 乱数はここでは消費しない。指示：attack（target 任意）／guard／skill／auto。retreat: true で退く。
      for (const u of all()) { u.flags.guarding = false; u.flags.covering = null; u.flags.skillCmd = null; }
      if (round === 1) planEnemies(1);
      // 敵の守り（盾役の計画）はラウンドの頭から効く
      for (const e of enemyUnits.filter(onField)) {
        const plan = e.flags.plan;
        if (plan && plan.kind === "guard") e.flags.guarding = true;
        if (plan && plan.kind === "cover") { e.flags.covering = plan.targetId; e.flags.coverRatio = 0.6; }
      }
      let commands = {};
      if (options.manual) {
        const corps = playerUnits.filter(u => !u.flags.summoned);
        const downed = corps.filter(u => !u.alive);
        const standing = corps.filter(onField);
        const canRetreat = !options.noRetreatOffer && downed.length > 0 && standing.length > 0 && !wiped(enemyUnits);
        const prompt = {
          type: "commands", round,
          allies: playerUnits.filter(onField).map(u => {
            const spirit = (u.spirit === undefined || u.spirit === null) ? null : u.spirit;
            // 技の一覧：種族技（SKILLS）→ 上位技（TRAITS.order）。skill は先頭（互換）。
            const skills = [];
            for (const sid of (u.skills || [])) {
              const sk = SK[sid]; if (!sk) continue;
              const why = skillWhy(u, sk, spirit);
              skills.push({ id: sid, name: sk.name, label: sk.name, note: sk.note || "", cost: sk.cost || 0, kind: sk.kind, target: sk.target, ready: !why, why });
            }
            const skillId = u.traits.find(tid => TRAITS[tid] && TRAITS[tid].order);
            const tr = skillId ? TRAITS[skillId] : null;
            if (tr) {
              const cost = Math.max(0, Number(tr.order.cost) || 0);
              const why = u.flags.mercenary ? "傭兵" : u.flags.winded ? "息切れ" : (spirit !== null && spirit < cost) ? "気合不足" : null;
              skills.push({ id: skillId, name: tr.name, label: tr.order.label, note: tr.order.note || "", cost, kind: "trait", target: "enemy", ready: !why, why });
            }
            return {
              id: u.id, uid: u.uid, name: u.name, hp: u.hp, maxHp: u.maxHp, spirit,
              winded: !!u.flags.winded, stuffed: !!u.flags.stuffed, mercenary: !!u.flags.mercenary, summoned: !!u.flags.summoned,
              skills, skill: skills[0] || null
            };
          }),
          fallen: playerUnits.filter(u => !u.alive && !u.flags.summoned).map(u => ({ id: u.id, name: u.name })),
          enemies: enemyUnits.filter(onField).map(u => ({
            id: u.id, name: u.name, hp: u.hp, maxHp: u.maxHp, role: u.role,
            intent: u.flags.charging ? "big" : (u.flags.plan && u.flags.plan.intent) || "attack"
          })),
          canRetreat, downed: downed.map(u => u.name), timelineLength: timeline.length
        };
        commands = (yield prompt) || {};
        if (commands.retreat && canRetreat) {
          // 退く。倒れていた者は担いで帰る（撤退の提案と同じ導出）。
          const enemiesLeft = enemyUnits.filter(onField);
          const event = emit("retreat_offer", {
            round, emphasis: 3, downed: downed.map(snap), standing: standing.map(snap), enemies: enemiesLeft.map(snap),
            manual: true, text: `　魔王軍、退く。${downed.map(u => u.name).join("、")}を担いで城へ戻った`, cls: "mormo"
          });
          const contribution = this.summarizeContribution(timeline, playerUnits).map(row => {
            if (row.mercenary || row.survived) return row;
            return { ...row, survived: true, injured: true };
          });
          retreatOffer = { index: timeline.indexOf(event), round, contribution };
          retreatedManual = true;
          break outer;
        }
        // 技：気合を払って技を確実に出す（条件を飛ばす）。足りなければ「たたかう」に落とす。
        for (const u of playerUnits) {
          const c = commands[u.id];
          if (!c || !onField(u)) continue;
          if (c.cmd === "guard") {
            u.flags.guarding = true;
          } else if (c.cmd === "skill") {
            const spirit = (u.spirit === undefined || u.spirit === null) ? null : u.spirit;
            const speciesIds = (u.skills || []).filter(id => SK[id]);
            const traitId = u.traits.find(tid => TRAITS[tid] && TRAITS[tid].order);
            const sid = c.skill || speciesIds[0] || traitId;
            const sk = SK[sid];
            if (sk) {
              // 種族技。理由があれば「たたかう」に落ちる。
              if (!skillWhy(u, sk, spirit)) {
                const cost = sk.cost || 0;
                if (spirit !== null) { u.spirit = spirit - cost; spiritSpent[u.uid] = (spiritSpent[u.uid] || 0) + cost; }
                const quote = U.pick((sk.lines && sk.lines.use) || ["……はっ！"]);
                const cmd = { id: sid, targetId: c.target || null };
                emit("order_exec", {
                  unitId: u.id, name: u.name, skillId: sid, skillName: sk.name, label: sk.name, quote, cost, manual: true, species: true, emphasis: 3,
                  text: `　魔王「${u.name}、${sk.name}！」 ${u.name}「${quote}」`, cls: "order"
                });
                if (applyImmediateSkill(u, sk, cmd, round)) cmd.done = true;
                u.flags.skillCmd = cmd;
              }
              continue;
            }
            const skillId = sid === traitId ? traitId : null;
            const tr = skillId ? TRAITS[skillId] : null;
            const cost = tr ? Math.max(0, Number(tr.order.cost) || 0) : 0;
            if (tr && !u.flags.winded && !u.flags.mercenary && (spirit === null || spirit >= cost)) {
              if (spirit !== null) { u.spirit = spirit - cost; spiritSpent[u.uid] = (spiritSpent[u.uid] || 0) + cost; }
              u.flags.ordered = true;
              u.flags.orderedManual = true;
              const quote = U.pick((tr.lines && tr.lines.order) || ["……はっ！"]);
              emit("order_exec", {
                unitId: u.id, name: u.name, skillId, skillName: tr.name, label: tr.order.label, quote, cost, manual: true, emphasis: 3,
                text: `　魔王「${u.name}、${tr.order.label}！」 ${u.name}「${quote}」`, cls: "order"
              });
            }
          }
        }
      }

      const order = all()
        .filter(onField)
        .sort((a, b) => b.spd - a.spd || (U.chance(0.5) ? -1 : 1));
      if (round === 1) {
        const gale = order.find(unit => unit.traits.includes("gale"));
        if (gale) { order.splice(order.indexOf(gale), 1); order.unshift(gale); }
      }
      // 技の順番の制限：last は列の最後へ、first は最初へ（号令の先頭固定より後）
      const skOrder = u => (u.flags.skillCmd && SK[u.flags.skillCmd.id] || {}).order;
      for (const u of order.filter(u => skOrder(u) === "last")) { order.splice(order.indexOf(u), 1); order.push(u); }
      for (const u of order.filter(u => skOrder(u) === "first").reverse()) { order.splice(order.indexOf(u), 1); order.unshift(u); }
      if (orderedUnit) { order.splice(order.indexOf(orderedUnit), 1); order.unshift(orderedUnit); }
      let rescuedThisRound = false;
      for (const unit of order) {
        if (!unit.alive) continue;
        // 号令の代償。息が上がった手番は動かない。一回だけ。
        if (unit.flags.winded) {
          unit.flags.winded = false;
          emit("note", { unitId: unit.id, winded: true, emphasis: 1,
            text: `　${unit.name}は息が上がっている（この手番は動かない）`, cls: "trait" });
          continue;
        }
        // 食べている最中は動かない。一回だけ。
        if (unit.flags.stuffed) {
          unit.flags.stuffed = false;
          const line = U.pick(TRAITS.big_eater.lines.busy);
          emit("trait_trigger", {
            sourceId: unit.id, traitId: "big_eater", name: "大食漢", quote: line, emphasis: 1, busy: true,
            text: `　${unit.name}「${line}」 食事中でこの手番は動かない`, cls: "trait"
          });
          continue;
        }
        const allies = unit.side === "player" ? playerUnits : enemyUnits;
        const enemies = unit.side === "player" ? enemyUnits : playerUnits;
        // まもる：この手番は攻撃しない（被ダメ半減は applyDamage）。
        if (unit.side === "player" && unit.flags.guarding) {
          emit("note", { unitId: unit.id, guarding: true, emphasis: 1, text: `　${unit.name}は身を守っている`, cls: "trait" });
          continue;
        }
        // 動けない（粘りつく）／魅入られた（同僚を殴る）
        if (unit.flags.stunned) {
          unit.flags.stunned = false;
          emit("note", { unitId: unit.id, stunned: true, emphasis: 1, text: `　${unit.name}は動けない`, cls: "trait" });
          continue;
        }
        if (unit.flags.charmed) {
          unit.flags.charmed = false;
          const mates = allies.filter(u => onField(u) && u !== unit);
          if (mates.length) {
            const mate = U.pick(mates);
            note(`　${unit.name}は魅入られたまま${mate.name}に斬りかかった`, "trait");
            applyDamage(unit, mate, Math.max(1, Math.round(unit.atk * 0.7)), "splash", { label: "魅惑", incident: true });
            continue;
          }
        }
        // 敵の大技：構えた次のラウンドに放つ（act の bigMove）。構えるのは2ラウンド目以降、たまに（brute は多め）。
        // 構えは1ラウンド攻撃を捨てるので、まもるで受ければ得、放置すれば痛い。自動戦闘でも同じ規則。
        // 役割の計画（癒やし・全体・守り・号令）は前ラウンド末に決めてある。
        if (unit.side === "enemy") {
          if (unit.flags.charging) {
            unit.flags.charging = false;
            unit.flags.bigMove = true;
          } else if (unit.flags.plan) {
            const plan = unit.flags.plan;
            unit.flags.plan = null;
            if (runEnemyPlan(unit, plan, allies, enemies, round)) {
              if (wiped(playerUnits)) { if (!resolveRecoveryHooks(true, "player")) break outer; rescuedThisRound = true; break; }
              continue;
            }
          } else if (round >= 2 && !unit.flags.summoned && ENEMY_BIG_MOVE.chance > 0
            && U.chance(unit.role === "brute" ? Math.max(ENEMY_BIG_MOVE.chance, 0.3) : ENEMY_BIG_MOVE.chance)) {
            unit.flags.charging = true;
            emit("intent", { unitId: unit.id, name: unit.name, intent: "big", emphasis: 2,
              text: `　${unit.name}が大技の構えを見せた`, cls: "trait" });
            continue;
          }
        }
        const manualCmd = options.manual ? commands[unit.id] : null;
        if (unit.flags.skillCmd) {
          const cmd = unit.flags.skillCmd;
          unit.flags.skillCmd = null;
          if (cmd.done) { emit("note", { unitId: unit.id, guarding: true, emphasis: 1, text: `　${unit.name}は身構えている`, cls: "trait" }); }
          else resolveSkill(unit, SK[cmd.id], cmd, allies, enemies, round);
        } else {
          act(unit, allies, enemies, round, manualCmd && manualCmd.target
            ? { target: enemies.find(e => e.id === manualCmd.target) || null } : undefined);
        }
        if (wiped(enemyUnits)) {
          if (!resolveRecoveryHooks(true, "enemy")) break outer;
          rescuedThisRound = true;
          break;
        }
        if (wiped(playerUnits)) {
          if (!resolveRecoveryHooks(true, "player")) break outer;
          rescuedThisRound = true;
          break;
        }
      }
      if (rescuedThisRound) continue;

      // ラウンド終了時フック（再生・執念・死霊術）。死亡中ユニットにも回す。
      // 特性側は ctx.log を呼ぶだけでよく、蘇生・回復は状態差分から自動的に
      // 構造化イベントへ変換する。新しい特性を足しても描画側の変更は要らない。
      resolveRecoveryHooks(false, null);

      if (round === 1 && feastTrigger) {
        // 離席中（遅刻・発酵で酔った）の者は宴にも出ない。alive だけ見ると透明のまま殴りに行く（オーナー試遊で発覚）
        const feastUnit = playerUnits.find(u => u.id === feastTrigger.sourceId && onField(u));
        if (feastUnit && !wiped(enemyUnits)) {
          act(feastUnit, playerUnits, enemyUnits, round, {
            mult: 1, parentEvent: feastTrigger, label: "暴食の宴", isExtra: true
          });
        }
      }

      // 鼓舞の期限切れ。次のラウンドの敵の計画（構えは次の指示窓に出る）。
      for (const u of all()) if (u.flags.buff && u.flags.buff.until <= round) delete u.flags.buff;
      if (!wiped(enemyUnits) && !wiped(playerUnits) && round < this.MAX_ROUNDS) planEnemies(round + 1);

      // 撤退の提案（1戦闘1回）。ラウンドの終わり、勝敗判定の前。
      // 条件：軍団員が倒れたまま立ち上がらなかった／敵が全滅していない／
      // 立っている軍団員が1人以上（不在＝遅刻は「立っている」に数えない）。
      if (!retreatOffer && !options.noRetreatOffer && !options.manual) {   // コマンドバトルでは退くのは指示パネル（提案は出さない）
        const corps = playerUnits.filter(u => !u.flags.summoned);
        const downed = corps.filter(u => !u.alive);
        const standing = corps.filter(onField);
        if (downed.length && standing.length && !wiped(enemyUnits)) {
          const enemiesLeft = enemyUnits.filter(onField);
          const who = downed.length > 1 ? `${downed[0].name}殿たち` : `${downed[0].name}殿`;
          const line = `魔王様。${who}が倒れました。今なら担いで退けます。……敵は残り${enemiesLeft.length}`;
          const event = emit("retreat_offer", {
            round, emphasis: 3,
            downed: downed.map(snap),
            standing: standing.map(snap),
            enemies: enemiesLeft.map(snap),
            text: `　モルモ「${line}」`, cls: "mormo"
          });
          // 提案時点の戦果。終了時と同じ導出関数を使い、二か所で別々に組まない。
          // 倒れていた軍団員は「担いで帰る」＝生存（負傷）。傭兵・召喚物は今までどおり。
          const contribution = this.summarizeContribution(timeline, playerUnits).map(row => {
            if (row.mercenary || row.survived) return row;
            return { ...row, survived: true, injured: true };
          });
          retreatOffer = { index: timeline.indexOf(event), round, contribution };
        }
      }

      // 号令の節目（1戦闘1回）。ラウンドの終わり、撤退の提案のあと、勝敗判定の前。
      // 条件：戦況が動いた（このラウンドに誰かが倒れた／味方の誰かが半分を切っている）、
      // 敵が残っている、候補がいる、同じラウンドに撤退の提案を出していない（二つ続けて聞かない）。
      if (options.offerOrder && !wiped(enemyUnits) && !wiped(playerUnits)
        && !(retreatOffer && retreatOffer.round === round)) {
        const turned = all().filter(u => !u.alive).length > deadAtRoundStart
          || playerUnits.some(u => onField(u) && !u.flags.summoned && u.hp <= u.maxHp * 0.5);
        const roster = turned ? this.orderRoster(playerUnits) : { ready: [], unready: [] };
        const candidates = roster.ready;
        if (candidates.length) {
          const answered = orders[round] || null;
          // 言い方は「号令で何が変わるか」（1段目の技は勝手に出続けるので「出せます」だと命じないと出ないように読める）。
          const names = candidates.map(c => `${c.name}に「${c.label}」`).join("、");
          const event = emit("order_offer", {
            round, candidates, unready: roster.unready, answered, emphasis: 3,
            enemies: enemyUnits.filter(onField).map(snap),
            text: `　モルモ「魔王様、号令を。${names}と命じられます」`, cls: "mormo"
          });
          orderOffers.push({ index: timeline.indexOf(event), round, candidates, answered });
        }
      }

      if (wiped(playerUnits) || wiped(enemyUnits)) break;
    }

    let victory;
    if (retreatedManual) {
      victory = false;                // 退いた。勝ちでも負けでもないが、result の形は揃える
    } else if (wiped(enemyUnits) && !wiped(playerUnits)) {
      victory = true;
    } else if (wiped(playerUnits)) {
      victory = false;
    } else {
      // 30ラウンド経過 → 残HP率で判定
      const ratio = us => us.reduce((s, u) => s + u.hp, 0) / us.reduce((s, u) => s + u.maxHp, 0);
      victory = ratio(playerUnits) >= ratio(enemyUnits);
    }
    for (const unit of playerUnits) {
      if (unit.flags.summoned || !unit.flags.martyrGold || unit.alive) continue;
      const death = [...timeline].reverse().find(e => e.type === "death" && e.unitId === unit.id);
      emitCausal("resource_forfeit", {
        sourceId: unit.id, resource: "gold", amount: unit.flags.martyrGold,
        reserved: true, label: "殉職手当", emphasis: 2,
        text: `　${unit.name}の最終戦死により【殉職手当】${unit.flags.martyrGold}Gを没収`, cls: "loot"
      }, death || null);
    }
    // ここから下は「重要度の印」だけを付ける。計算・勝敗・乱数には一切関与しない。
    // 描画側（BattleScene）が「縮めてはいけない事件か」を判別するために読む。
    for (const unit of playerUnits) {
      if (unit.flags.summoned || unit.alive) continue;   // 召喚物は軍団員ではない
      const death = [...timeline].reverse().find(e => e.type === "death" && e.unitId === unit.id);
      if (death) death.permanent = true;                 // 蘇生で戻らなかった＝軍団からの永久退場
    }
    const resultText = retreatedManual ? "魔王軍は退いた。"
      : wiped(enemyUnits) && victory ? "敵軍を全滅させた！ 魔王軍の勝利！"
      : wiped(playerUnits) ? "魔王軍は全滅した……"
      : victory ? "長期戦の末、判定勝ち！ 勇者軍は撤退した。"
      : "長期戦の末、判定負け……魔王軍は敗走した。";
    emit("result", {
      victory, reversal: this.detectReversal(timeline, victory), emphasis: 3,
      // permanent / reversal / firstDiscovery と同じ「重要度の印」。勝敗確定後に導出して付け、
      // 描画側だけが読む（戦闘計算には一切使わない）。判定決着と全滅を見分けるために要る。
      wipe: retreatedManual ? null : wiped(playerUnits) ? "player" : wiped(enemyUnits) ? "enemy" : null,
      retreated: retreatedManual,
      text: resultText, cls: victory ? "result-win" : "result-lose"
    });

    return {
      victory,
      timeline,
      // 続けずに退く道があったか。無ければ null。勝敗・報酬・contribution には影響しない。
      retreatOffer,
      // コマンドで退いた（retreatOffer.contribution が担いで帰った戦果）。
      retreated: retreatedManual,
      spiritSpent,
      spiritGained,
      // 号令の節目（options.offerOrder のときだけ）。answered は答えの unitId か null。
      // orderOffer は最初の節目（互換）。節目は戦況が動くたびに来るので orderOffers を見る。
      orderOffer: orderOffers[0] || null,
      orderOffers,
      // 旧来のテキストログ（タイムラインから導出）
      log: timeline.filter(e => e.text).map(e => ({ t: e.text, c: e.cls })),
      rounds: Math.min(round, this.MAX_ROUNDS),
      // merge型は「合体した戦闘」でだけ run.js が名前を差し込む（条件を満たしただけでは載せない）
      activeSynergies: activeSyn.filter(s => s.type !== "merge").map(s => s.name),
      incidents: timeline.filter(e => e.type === "incident").map(e => ({ id: e.id, name: e.name, text: e.text })),
      // 誰がどれだけ働いたか（結果画面のMVP表示用）。新しい状態を戦闘中に
      // 持ち回る必要はなく、既に確定したタイムラインから導出するだけでよい。
      contribution: this.summarizeContribution(timeline, playerUnits),
      nearMiss: this.summarizeNearMiss(timeline),
      chainSummary: this.summarizeChains(timeline),
      overkillSummary: this.summarizeOverkill(timeline),
      summonCount: timeline.filter(e => e.type === "summon").length,
      facilitySummary: this.summarizeFacility(timeline),
      mealSummary: this.summarizeMeal(timeline),
      deathChains: this.summarizeDeathChains(timeline),
      resourceChanges: this.summarizeResourceChanges(timeline)
    };
  },

  // 食事強化が「誰から誰へ、どれだけ」効き、その人の最初の有効打がどれだったか。
  // 戦闘中に別状態を持ち回らず、確定したタイムラインから導出するだけ。
  // 伝票（rations.meal）が無い戦闘・古い戦果では null を返す。表示側はその表示だけを省く。
  summarizeMeal(timeline) {
    const events = timeline || [];
    const cook = events.find(e => e.type === "trait_trigger" && e.traitId === "demon_cook");
    if (!cook || !cook.targetId) return null;
    const hit = events.find(e => e.mealBoost && e.mealBoost.first);
    return {
      sourceId: cook.sourceId, targetId: cook.targetId, targetName: cook.targetName || null,
      amount: cook.amount || 0, amountPercent: cook.amountPercent || 0,
      consumed: cook.consumed || 0, kitchenMult: cook.kitchenMult || 1,
      tiedIds: cook.tiedIds || [], targetEatsNothing: !!cook.targetEatsNothing,
      triggerEventId: cook.eventId,
      // 強化された者の最初の有効打。無ければ null（一度も攻撃せずに終わった）
      firstHit: hit ? {
        eventId: hit.eventId, type: hit.type, toId: hit.toId, dmg: hit.dmg, dead: !!hit.dead
      } : null
    };
  },

  // 「追い詰められてからの勝ち」だったかを、戦闘後にタイムラインから導出する。
  // summarizeNearMiss() と同じ再生方式で、戦闘中に別状態を持ち回らない。
  // victory を省略した場合は timeline の result から読む（手組みタイムライン用）。
  detectReversal(timeline, victory) {
    const events = timeline || [];
    if (victory === undefined) {
      const result = [...events].reverse().find(e => e.type === "result");
      victory = !!(result && result.victory);
    }
    if (!victory) return false;

    const start = events.find(e => e.type === "battle_start");
    const allies = (start && start.player) || [];   // 召喚物は開始時にいないので自然に除外される
    const maxHp = allies.reduce((sum, u) => sum + u.maxHp, 0);
    if (!allies.length || maxHp <= 0) return false;

    const hp = new Map(allies.map(u => [u.id, u.hp]));
    const setHp = (id, value) => {
      if (hp.has(id) && Number.isFinite(value)) hp.set(id, Math.max(0, value));
    };
    const ratio = () => [...hp.values()].reduce((sum, value) => sum + value, 0) / maxHp;
    let lowest = ratio();
    for (const event of events) {
      if (event.type === "attack" || event.type === "splash") setHp(event.toId, event.hp);
      else if (event.type === "heal" || event.type === "revive" || event.type === "survive") setHp(event.unitId, event.hp);
      lowest = Math.min(lowest, ratio());
    }
    // 総HPの3割以下まで追い込まれてからの勝ちを「逆転」と呼ぶ。
    // 全滅救済（総HP0）からの勝利もこの条件に自然に含まれる。
    const REVERSAL_HP_RATIO = 0.30;
    return lowest <= REVERSAL_HP_RATIO;
  },

  // 因果メタデータだけからCHAINを集計する。戦闘計算へ別状態を持ち込まない。
  // 将来の能力発火も parentEventId / chainId / chainDepth を付ければ自動的に集計へ入る。
  summarizeChains(timeline) {
    const events = (timeline || []).filter(e => e.chainId && Number.isFinite(e.chainDepth));
    const byChain = new Map();
    for (const event of events) {
      const current = byChain.get(event.chainId) || { chainId: event.chainId, maxDepth: 0, eventCount: 0 };
      current.maxDepth = Math.max(current.maxDepth, event.chainDepth);
      current.eventCount += 1;
      byChain.set(event.chainId, current);
    }
    const chains = [...byChain.values()];
    return {
      maxChain: chains.reduce((max, chain) => Math.max(max, chain.maxDepth), 0),
      chainCount: chains.length,
      eventCount: events.length,
      chains,
      deepest: this.deepestChainPath(timeline)
    };
  },

  // 最大CHAINの「代表経路」。最深イベントから parentEventId を逆にたどった**一本だけ**を返す。
  // 分岐した全イベントは並べない（読む時間が増えるだけで「何から何へ連鎖したか」は伝わらない）。
  // 因果メタデータの無い旧データでは null を返し、表示側は何も出さない。
  deepestChainPath(timeline) {
    const events = (timeline || []).filter(e => Number.isFinite(e.chainDepth));
    let deepest = null;
    for (const event of events) {
      if (!deepest || event.chainDepth > deepest.chainDepth) deepest = event;   // 同深度なら先に起きた方
    }
    if (!deepest || deepest.chainDepth < 2) return null;                        // 起点だけなら経路ではない

    const byId = new Map(events.filter(e => e.eventId).map(e => [e.eventId, e]));
    const sides = new Map();
    const names = new Map();
    const start = (timeline || []).find(e => e.type === "battle_start");
    for (const unit of [...((start && start.player) || []), ...((start && start.enemy) || [])]) {
      sides.set(unit.id, unit.side);
      names.set(unit.id, unit.name);
    }

    const steps = [];
    const seen = new Set();
    let current = deepest;
    while (current && !seen.has(current.eventId)) {   // 親リンクが壊れていても回り続けない
      seen.add(current.eventId);
      steps.unshift({
        eventId: current.eventId || null,
        type: current.type,
        depth: current.chainDepth || 1,
        label: this.chainStepLabel(current, sides),
        actorName: names.get(current.sourceId || current.fromId || current.unitId) || null
      });
      current = current.parentEventId ? byId.get(current.parentEventId) : null;
    }
    return { chainId: deepest.chainId || null, depth: deepest.chainDepth, steps };
  },

  // 経路の1段を短い日本語にする。表示専用で、集計や計算には使わない。
  chainStepLabel(event, sides) {
    const amount = Number(event.amount) || 0;
    const unit = event.resource === "gold" ? "G" : event.resource === "soul" ? "魂" : (event.resource || "");
    switch (event.type) {
      case "attack": return event.parentEventId ? "追加攻撃" : "攻撃";
      case "splash": return event.label ? `${event.label}の追撃` : "追撃";
      case "death": return (sides && sides.get(event.unitId)) === "player" ? "戦死" : "撃破";
      case "overkill": return `${event.rank || "OVERKILL"} ${event.percent}%`;
      case "revive": return "蘇生";
      case "summon": return "召喚";
      case "survive": return "耐えた";
      case "heal": return `回復+${amount}`;
      case "resource_gain": return `${event.label || "獲得"} +${amount}${unit}`;
      case "resource_forfeit": return `${event.label || "没収"} -${amount}${unit}`;
      case "resource_consume": return `${unit}-${amount}`;
      default: return event.name || event.label || event.type;
    }
  },

  summarizeResourceChanges(timeline) {
    const changes = {};
    for (const event of timeline || []) {
      if (!event.resource || (event.type !== "resource_gain" && event.type !== "resource_forfeit")) continue;
      const sign = event.type === "resource_forfeit" ? -1 : 1;
      changes[event.resource] = (changes[event.resource] || 0) + sign * (Number(event.amount) || 0);
    }
    return changes;
  },

  summarizeOverkill(timeline) {
    const events = (timeline || []).filter(e => e.type === "overkill");
    const top = events.reduce((best, event) => !best || event.percent > best.percent ? event : best, null);
    return {
      count: events.length,
      totalExcess: events.reduce((sum, event) => sum + (Number(event.excess) || 0), 0),
      maxExcess: top ? top.excess : 0,
      maxPercent: top ? top.percent : 0,
      rankId: top ? top.rankId : null,
      rank: top ? top.rank : null,
      sourceId: top ? top.fromId : null,
      targetId: top ? top.toId : null
    };
  },

  // 施設が今回の戦闘で何をしたか。facility_trigger と、その子の summon だけから導出する。
  // 「全滅回避」は、召喚の時点で開始時の味方が全員倒れていたかをタイムライン再生で判定する。
  // 戦闘中に別の状態を持ち回らず、戦功・昇進・報酬には一切接続しない（表示専用）。
  summarizeFacility(timeline) {
    const events = timeline || [];
    const start = events.find(e => e.type === "battle_start");
    const alive = new Map(((start && start.player) || []).map(u => [u.id, true]));
    const byId = new Map(events.filter(e => e.eventId).map(e => [e.eventId, e]));
    const facilities = new Map();
    let rescuedFromWipe = false;
    for (const event of events) {
      if (event.type === "death" && alive.has(event.unitId)) alive.set(event.unitId, false);
      else if (event.type === "revive" && alive.has(event.unitId)) alive.set(event.unitId, true);
      if (event.type === "facility_trigger") {
        const current = facilities.get(event.facilityId)
          || { facilityId: event.facilityId, name: event.name, count: 0, summons: 0, amount: 0, rescued: false };
        current.count += 1;
        current.amount = Math.max(current.amount, Number(event.amount) || 0);
        facilities.set(event.facilityId, current);
      } else if (event.type === "summon") {
        const parent = event.parentEventId ? byId.get(event.parentEventId) : null;
        const current = parent && parent.type === "facility_trigger" ? facilities.get(parent.facilityId) : null;
        if (!current) continue;
        current.summons += 1;
        if (alive.size && [...alive.values()].every(a => !a)) {
          current.rescued = true;
          rescuedFromWipe = true;
        }
      }
    }
    return { facilities: [...facilities.values()], rescuedFromWipe };
  },

  // 死者ごとの短い連鎖。「同じゾンビが二度立ち上がった」ように見える戦闘で、
  // 耐えたのか・死んだのか・誰が戻したのか・全快だったのか・別個体の召喚だったのかを分ける。
  // 味方（開始スナップショットに居る者）だけを対象にし、召喚物は起点にしない。
  summarizeDeathChains(timeline) {
    const events = timeline || [];
    const start = events.find(e => e.type === "battle_start");
    const units = new Map(((start && start.player) || []).map(u =>
      [u.id, { unitId: u.id, name: u.name, steps: [], deaths: 0, permanentDeath: false }]));
    for (const event of events) {
      const unit = units.get(event.type === "summon" ? event.sourceUnitId : event.unitId);
      if (!unit) continue;
      if (event.type === "survive") unit.steps.push("致死を耐えた");
      else if (event.type === "death") { unit.steps.push("戦死"); unit.deaths += 1; unit.permanentDeath = true; }
      else if (event.type === "revive") {
        unit.permanentDeath = false;
        const by = event.traitId === "necromancy" ? "死霊術で蘇生"
          : event.traitId === "tenacity" ? "執念で復活" : "蘇生";
        const full = Number.isFinite(event.hp) && Number.isFinite(event.maxHp) && event.hp >= event.maxHp;
        unit.steps.push(full ? `${by}（全快）` : by);
      } else if (event.type === "summon") unit.steps.push("骸骨従者を召喚");
    }
    return [...units.values()].filter(u => u.steps.length)
      .map(u => ({ unitId: u.unitId, name: u.name, steps: u.steps, deaths: u.deaths, permanentDeath: u.permanentDeath }));
  },

  // 敗北後に「どこまで迫れたか」を見せるための要約。
  // 戦闘中の状態は持ち回らず、timeline の開始スナップショットと HP 差分だけを再生する。
  summarizeNearMiss(timeline) {
    const start = timeline.find(e => e.type === "battle_start");
    const enemies = (start && start.enemy) || [];
    if (!enemies.length) return null;

    const enemyIds = new Set(enemies.map(e => e.id));
    const hp = new Map(enemies.map(e => [e.id, e.hp]));
    const maxHp = enemies.reduce((sum, e) => sum + e.maxHp, 0);
    if (maxHp <= 0) return null;

    let closestRemaining = enemies.reduce((sum, e) => sum + e.hp, 0);
    const setHp = (id, value) => {
      if (enemyIds.has(id) && Number.isFinite(value)) hp.set(id, Math.max(0, value));
    };
    for (const event of timeline) {
      if (event.type === "attack" || event.type === "splash") setHp(event.toId, event.hp);
      else if (event.type === "heal" || event.type === "revive" || event.type === "survive") setHp(event.unitId, event.hp);
      const remaining = [...hp.values()].reduce((sum, value) => sum + value, 0);
      closestRemaining = Math.min(closestRemaining, remaining);
    }

    const finalRemaining = [...hp.values()].reduce((sum, value) => sum + value, 0);
    const lastEvent = [...timeline].reverse().find(e => e.type !== "result" && e.text);
    const closestDamage = maxHp - closestRemaining;
    return {
      enemyMaxHp: maxHp,
      closestRemaining,
      finalRemaining,
      closestDamage,
      closestPercent: Math.round(closestDamage / maxHp * 100),
      lastEventText: lastEvent ? String(lastEvent.text).trim() : ""
    };
  },

  summarizeContribution(timeline, playerUnits) {
    const hits = timeline.filter(e => (e.type === "attack" || e.type === "splash") && e.label !== "仲間割れ");
    return playerUnits.filter(u => !u.flags.summoned).map(u => {
      // 反動のような自傷は「受けたダメージ」には残すが、与ダメージ／撃破には足さない。
      // 自分を殴った量でMVPになるのは戦果として嘘になる。
      const dealt = hits.filter(e => e.fromId === u.id && e.toId !== u.id).reduce((s, e) => s + e.dmg, 0);
      const taken = hits.filter(e => e.toId === u.id).reduce((s, e) => s + e.dmg, 0);
      const kills = hits.filter(e => e.fromId === u.id && e.toId !== u.id && e.dead).length;
      const overkills = timeline.filter(e => e.type === "overkill" && e.fromId === u.id);
      const died = timeline.some(e => e.type === "death" && e.unitId === u.id);
      // 火力以外の働き。人物へ確実に帰属できるイベントだけを数え、
      // 施設・召喚など「誰の手柄か言えないもの」は個人へ付けない。
      const resources = {};
      for (const event of timeline) {
        if (event.sourceId !== u.id || !event.resource) continue;
        const sign = event.type === "resource_gain" ? 1 : event.type === "resource_forfeit" ? -1 : 0;
        if (!sign) continue;
        resources[event.resource] = (resources[event.resource] || 0) + sign * (Number(event.amount) || 0);
      }
      const revives = timeline.filter(e => e.type === "revive");
      return {
        id: u.id, uid: u.uid, name: u.name, race: u.race, tplId: u.tplId, icon: u.icon,
        mercenary: !!u.flags.mercenary,   // 金で雇った一時要員。戦功・欠員・戦没者に数えない
        late: u.flags.late || 0,          // 遅刻したラウンド数。0なら開戦から居た
        lateCause: u.flags.lateCause || (u.flags.late ? u.flags.lateTrait : null),  // 何で遅れたか（酒好き／発酵糧食）
        unpaid: !!u.unpaid, dealt, taken, kills,
        overkillCount: overkills.length,
        maxOverkill: overkills.reduce((max, event) => Math.max(max, event.percent || 0), 0),
        traitTriggers: timeline.filter(e => e.type === "trait_trigger" && e.sourceId === u.id).length,
        resources,                                                     // 資源ごとの純増減（獲得−没収）
        revivesGiven: revives.filter(e => e.sourceId === u.id && e.unitId !== u.id).length,
        selfRevives: revives.filter(e => e.unitId === u.id && !e.sourceId).length,   // 《執念》など
        healed: timeline.filter(e => e.type === "heal" && e.unitId === u.id)
          .reduce((sum, event) => sum + (Number(event.amount) || 0), 0),
        died,                 // 一度でも倒れたか（蘇生した者も true）
        survived: u.alive     // 戦闘終了時に生きていたか。退場判定はこちらを使う
      };
    }).sort((a, b) => b.dealt - a.dealt);
  }
};
