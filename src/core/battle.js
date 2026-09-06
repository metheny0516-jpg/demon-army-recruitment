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
//   result       { victory, reversal }              reversal=総HP3割以下から勝った
// ───────────────────────────────────────────────────────
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
      traits: m.traits ? m.traits.slice() : [],
      tags: m.tags ? m.tags.slice() : [],
      introQuote: m.introQuote || "",
      mods: {
        dmgMult: m.battleDmgMult || 1,
        takenMult: m.battleTakenMult || 1,
        fireballAll: false, necroFull: false
      },
      flags: {},
      alive: true
    };
  },

  // ── 魔王命令 ──────────────────────────────────
  // 魔王は戦わない。報告を受けて、一度だけ命令を出す。
  // どれも「自分が殴る」ではなく「軍団に何かをさせる／与える」形にしてある。
  // 効果量そのものより、既存の何と噛み合うかで選ぶことを狙っている。
  COMMANDS: [
    {
      id: "rally", name: "檄を飛ばす", icon: "📣",
      desc: "残りの戦闘のあいだ、味方全員の与ダメージ+55%",
      cost: "出撃者の忠誠 -14",
      hint: "素の火力が足りないときの直球。連鎖がなくても効く。怒鳴られた側は覚えている。",
      loyalty: -14
    },
    {
      id: "charge", name: "総員突撃", icon: "⚔",
      desc: "味方全員が、いちばん弱った敵へ数珠つなぎに殺到する",
      cost: "突撃した1体につき戦闘後の残業+3時間／突撃した者は被ダメージ+30%",
      hint: "撃破が一本の鎖になるので、押し出しがいるほど深く伸びる。人数ぶん、あとで請求が来る。",
      overtimePerUnit: 3
    },
    {
      id: "advance_pay", name: "その場で支払う", icon: "🪙",
      desc: "未払いを帳消しにし、味方全員の被ダメージ-30%",
      cost: "給与総額の半額を即金で",
      hint: "耐えて長引かせる手。ただしオークの《血の気》は消える。",
      goldRate: 0.5
    }
  ],

  commandById(id) {
    return this.COMMANDS.find(c => c.id === id) || null;
  },

  // 命令の効果は再開時の冒頭で一度だけ適用する。
  // ctx は simulate() の内側から渡され、ここでは公開された道具しか使わない。
  applyCommand(id, ctx) {
    const command = this.commandById(id);
    if (!command) return null;
    const { playerUnits, enemyUnits, emit } = ctx;
    const living = playerUnits.filter(u => u.alive);
    const trigger = emit("command", {
      commandId: command.id, name: command.name, desc: command.desc, emphasis: 3,
      text: `魔王命令【${command.name}】 ${command.desc}`, cls: "synergy"
    });
    if (command.id === "rally") {
      for (const u of living) u.mods.dmgMult *= 1.55;
    } else if (command.id === "advance_pay") {
      for (const u of living) {
        u.unpaid = false;
        u.mods.takenMult *= 0.7;
      }
    } else if (command.id === "charge") {
      // 全員が「いちばん倒せそうな敵」へ殺到する。総攻撃の意味はダメージ量ではなく、
      // 撃破が固まって起きることにある。撃破は鎖の入口なので、押し出しがいれば伸びる。
      // 数珠つなぎにするのが要点。全員を命令イベントの子にすると横並びの兄弟になり、
      // 1つの鎖にならない（押し出しは1鎖1人1回なので、それだと1回しか伸びない）。
      // 前の者の一撃を親にして繋ぐことで、突撃そのものが1本の鎖になる。
      // 全力で前へ出るぶん、隙を晒す。
      for (const u of living) u.mods.takenMult *= 1.3;
      let link = trigger;
      for (const u of living) {
        if (!u.alive) break;
        const weakest = enemyUnits.filter(e => e.alive).sort((a, b) => a.hp - b.hp)[0];
        if (!weakest) break;
        const before = ctx.timeline.length;
        ctx.act(u, { mult: 1, target: weakest, parentEvent: link, label: "総員突撃", isExtra: true });
        // この一撃が生んだ最後の出来事を次の起点にする（撃破があればそれが親になる）
        const produced = ctx.timeline.slice(before).filter(e => e.chainId);
        if (produced.length) link = produced[produced.length - 1];
      }
    }
    return trigger;
  },

  // 連鎖の上限。壊れてよいが、無限には伸ばさない（1戦が終わらなくなる）。
  MAX_CHAIN_DEPTH: 12,

  // 鎖の中で手番を渡せる相手。連鎖段数を読む特性を持つ者だけが引き込まれる。
  // ここに載っていない特性は、鎖に入っても意味を持たないので呼ばない。
  CHAIN_REACTORS: ["relay_kick", "escalate", "deep_dread"],

  simulate(playerUnits, enemyUnits, options) {
    options = options || {};
    playerUnits.forEach((u, i) => { u.id = "p" + i; });
    enemyUnits.forEach((u, i) => { u.id = "e" + i; });

    // 魔王命令のために、戦闘は途中で止めて再開できる。
    // carry は「閉じ込みに置いていた状態」だけを持ち運ぶ入れ物で、
    // ユニットそのものは呼び出し側が同じオブジェクトを渡し直す（その場で書き換わるため）。
    const carry = options.carry || null;
    const timeline = [];
    let nextEventId = carry ? carry.nextEventId : 1;
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
      const event = emit(type, data);
      if (!event.chainId) event.chainId = event.eventId;
      return event;
    };
    // 特性から呼ばれるテキスト専用ログ（traits.js の ctx.log がこれ）
    const note = (text, cls) => emit("note", { text, cls: cls || "info", emphasis: cls === "revive" ? 2 : 0 });
    const soulState = carry ? carry.soulState : { player: { amount: 0 }, enemy: { amount: 0 } };
    // 施設Lv.＝Jokerが働ける回数。0/未指定なら従来どおり1回だけ働く。
    const facilityWorks = Math.max(1, Number(options.facilityWorks) || 1);
    const graveyardQueue = carry ? carry.graveyardQueue : [];
    let graveyardUsed = carry ? carry.graveyardUsed : 0;
    let nextSummonId = carry ? carry.nextSummonId : 1;

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
      summoned: !!u.flags.summoned
    });

    // シナジー適用（merge型は出撃時に処理済み）
    // 発火条件は出撃5枠の外まで数える（options.synergyPool＝軍団全体）。
    // 効果は出撃したユニットにしか乗らないので、控えが戦うわけではない。
    // 再開時に applyAll を呼び直すと unit.mods へ二重に乗る。前半の結果をそのまま使う。
    const activeSyn = carry ? carry.activeSyn
      : Synergy.applyAll(playerUnits, { pool: options.synergyPool || playerUnits });
    // 揃えた枚数を「画面の出来事」に変える。倍率だけだと数字が増えるだけで爆発に見えない。
    // 《魔王軍完成》が立っているあいだ、味方のOVERKILL撃破は次の敵へ伝播し、
    // その深さは同時発動数そのものになる。積むほど連鎖が伸びる。
    const overloadStacks = activeSyn.some(s => s.id === "overload")
      ? Math.min(4, activeSyn.filter(s => !s.meta).length) : 0;

    // 戦意：OVERKILLの見返り。これまでOVERKILLは伝播の入口になるだけで、
    // それ自体には何の得も無かった（だから「明示」しようにも中身が無かった）。
    // 余剰を出すほど味方全員の与ダメージが上がり、その倍率を画面に出し続ける。
    // 連鎖が進むほど数字そのものが大きくなるので、「爆発力が上がった」が見える。
    let momentum = carry ? carry.momentum : 0;
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
    const martyrAllowance = activeSyn.some(s => s.id === "martyr_allowance");
    let reservedGold = carry ? carry.reservedGold : 0;
    let ledgerFires = carry ? carry.ledgerFires : 0;
    let ledgerBoost = null;   // 「次の1発」の予約なので、区切りをまたいでは持ち越さない
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

    emit("battle_start", {
      player: playerUnits.map(snap),
      enemy: enemyUnits.map(snap),
      resumed: !!carry
    });
    let feastTrigger = null;
    const rations = carry ? null : options.rations;   // 糧食・登場台詞・シナジー宣言は前半で済んでいる
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
      if (cook && rations.consumed > 0) {
        emitCausal("trait_trigger", { sourceId: cook.id, traitId: "demon_cook", name: "魔界料理人", emphasis: 1,
          text: `　${cook.name}の【魔界料理人】 食事を火力へ変換`, cls: "trait" }, rationEvent);
      }
      const hunger = byUid(rations.hungerUid);
      if (hunger && rations.emptied) {
        emitCausal("trait_trigger", { sourceId: hunger.id, traitId: "hunger_demon", name: "飢餓の悪魔", emphasis: 3,
          text: `　${hunger.name}の【飢餓の悪魔】 備蓄が尽き、全軍が飢えて暴走！`, cls: "trait" }, rationEvent);
      }
      const feast = byUid(rations.feastUid);
      if (feast && rations.consumed >= 4) {
        feastTrigger = emitCausal("trait_trigger", { sourceId: feast.id, traitId: "glutton_feast", name: "暴食の宴", emphasis: 2,
          text: `　【暴食の宴】 ${feast.name}が食後の追加行動を狙う`, cls: "trait" }, rationEvent);
      }
    }
    for (const u of (carry ? [] : [...enemyUnits, ...playerUnits])) {
      if (!u.introQuote) continue;
      emit("dialogue", {
        unitId: u.id, name: u.name, side: u.side, quote: u.introQuote,
        emphasis: 2, text: `${u.name}「${u.introQuote}」`, cls: "dialogue"
      });
    }
    for (const s of (carry ? [] : activeSyn)) {
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
      let dmg = Math.max(1, Math.round(amount * target.mods.takenMult));
      for (const tid of target.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.modTaken) dmg = tr.modTaken({ unit: target, attacker, dmg });
      }
      const hpBefore = target.hp;
      target.hp -= dmg;

      let dead = false, survived = false;
      if (target.hp <= 0) {
        for (const tid of target.traits) {
          const tr = TRAITS[tid];
          if (tr && tr.onLethal && tr.onLethal({ unit: target, log: note })) { survived = true; break; }
        }
        if (survived) {
          target.hp = 1;
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
      let deathEvent = null;
      if (dead) {
        deathEvent = emitCausal("death", {
          unitId: target.id, emphasis: 2,
          text: `　${target.name} は倒れた！`, cls: "death"
        }, damageEvent);
        reactToDeath(target, deathEvent);
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
          const next = opponents.find(unit => unit.alive);
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

    const tryIncident = (unit, allies) => {
      if (unit.side !== "player" || unit.flags.incidentUsed) return false;
      const candidates = BATTLE_HAPPENINGS.filter(h => h.check(unit));
      const generalPresent = allies.some(a => a.alive && a.rankId === "general");
      for (const happening of candidates) {
        const chance = happening.chance * (generalPresent ? 0.35 : 1);
        if (!U.chance(chance)) continue;
        let target = null;
        if (happening.kind === "friendly_fire") {
          const victims = allies.filter(a => a.alive && a !== unit);
          if (!victims.length) continue;
          target = U.pick(victims);
        }
        unit.flags.incidentUsed = true;
        emit("incident", {
          id: happening.id, name: happening.name, unitId: unit.id,
          targetId: target && target.id, emphasis: 3,
          text: happening.text(unit, target), cls: "incident"
        });
        if (target) applyDamage(unit, target, unit.atk * 0.7, "splash", { label: "仲間割れ", incident: true, parentEvent: timeline[timeline.length - 1] });
        return true;
      }
      return false;
    };

    // 連鎖の段数そのものを能力が読めるようにするための最小限の状態。
    // 深度は親イベントから導出するので新しい数値は持たない。持つのは
    // 「この鎖で誰がもう動いたか」だけ（同じ鎖で同じ人が無限に動かないため）。
    const chainActors = new Map();
    const actedInChain = (chainId, unit) => {
      if (!chainId) return false;
      const set = chainActors.get(chainId);
      return !!(set && set.has(unit.id));
    };
    const markChainActor = (chainId, unit) => {
      if (!chainId) return;
      if (!chainActors.has(chainId)) chainActors.set(chainId, new Set());
      chainActors.get(chainId).add(unit.id);
    };

    const act = (unit, allies, enemies, round, actionOpts) => {
      actionOpts = actionOpts || {};
      const living = enemies.filter(u => u.alive);
      if (living.length === 0) return;
      if (!actionOpts.isExtra && tryIncident(unit, allies)) return;
      // この行動が鎖の何段目か。親を持たない通常攻撃が1段目。
      const parentChain = actionOpts.parentEvent || null;
      const chainDepth = parentChain ? (parentChain.chainDepth || 1) + 1 : 1;
      const chainId = parentChain ? (parentChain.chainId || parentChain.eventId) : null;
      if (chainDepth > Battle.MAX_CHAIN_DEPTH) return;
      markChainActor(chainId, unit);
      // 先頭（配置順）が60%で狙われる。前衛に壁を置く意味を持たせる。
      // 狙いを指定された行動（魔王命令の総員突撃）だけは、その相手を殴る。
      const target = (actionOpts.target && actionOpts.target.alive)
        ? actionOpts.target
        : (U.chance(0.6) ? living[0] : U.pick(living));

      const ctx = {
        attacker: unit, target, allies, enemies, round,
        mult: unit.mods.dmgMult, notes: [], rng: U.rand,
        // 連鎖段数を参照する能力群のための入力。読むだけで、書き換えない。
        chainDepth, defIgnore: 0
      };
      for (const tid of unit.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.modDealt) tr.modDealt(ctx);
      }
      const ledgerParent = unit.side === "player" ? ledgerBoost : null;
      if (ledgerParent) {
        ctx.mult *= 1.4;
        ctx.notes.push("恐喝帳簿");
        ledgerBoost = null;
      }
      // 戦意は魔王軍のもの。積み上がった倍率がそのまま数字に出る。
      if (unit.side === "player" && momentum > 0) ctx.mult *= 1 + momentum;
      const variance = 0.9 + U.rand() * 0.2;
      const raw = unit.atk * ctx.mult * variance * (actionOpts.mult || 1);
      const defIgnore = Math.min(1, Math.max(0, ctx.defIgnore || 0));
      const amount = Math.max(1, Math.round(raw) - Math.floor(target.def / 2 * (1 - defIgnore)));
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
      const post = {
        attacker: unit, target, dmg, enemies, log: note, pick: U.pick,
        dealRaw: (a, t, d, label) => applyDamage(a, t, d, "splash", { label, parentEvent: applied.event }).dmg,
        gainResource: (resource, value, label) => {
          const event = gainBattleResource(unit, resource, value, label, applied.event);
          triggeredEvents.push(event);
          return event;
        }
      };
      for (const tid of unit.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.postAttack && target) tr.postAttack(post);
      }
      // 【歩合】連鎖が3段目まで伸びたら、反応した者に金貨が落ちる。
      // 深さそのものが資源になる入口。金貨は既存の《強欲》へつながる。
      const tollChainId = applied.event.chainId || null;
      if (chainDepth >= 3 && tollChainId) {
        for (const reactor of allies) {
          if (!reactor.alive || !reactor.traits.includes("chain_toll")) continue;
          if (!reactor.flags.tollChains) reactor.flags.tollChains = new Set();
          if (reactor.flags.tollChains.has(tollChainId)) continue;
          reactor.flags.tollChains.add(tollChainId);
          triggeredEvents.push(
            gainBattleResource(reactor, "gold", chainDepth - 2, "歩合", applied.event));
        }
      }
      if (triggeredEvents.length) {
        // 金貨は軍団の成果。盗む役と反応する役を別の人材で組める。
        // 各人の greedyChains が再帰に入る前に使用済みになるため、
        // 追加攻撃で別の金貨が出ても、同じ鎖で同じ人は二度動かない。
        for (const reactor of allies) {
          if (!reactor.alive || !enemies.some(e => e.alive)) continue;
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

      // 【押し出し】鎖の中で撃破が出たとき、その鎖でまだ動いていない仲間へ手番を渡す。
      // 「段数を伸ばす役」。同じ鎖で同じ人は一度しか動けないので、伸びる長さは
      // 押し出しを何人採ったか＝編成そのものになる。
      // 撃破そのものが鎖の入口。押し出しを何人採ったかが、そのまま鎖の長さになる。
      const relayChainId = applied.deathEvent && (applied.deathEvent.chainId || null);
      const relayDepth = applied.deathEvent ? (applied.deathEvent.chainDepth || 1) + 1 : 0;
      if (applied.deathEvent && relayChainId && target.side !== unit.side
        && relayDepth < Battle.MAX_CHAIN_DEPTH && enemies.some(e => e.alive)) {
        // 鎖へ引き込む相手は「連鎖に反応する特性を持つ者」全員から選ぶ。
        // 押し出し持ちだけに絞っていたため、深追い・深淵の恐怖の持ち主は
        // 押し出しを同時に持たない限り一生 chainDepth>=2 で行動できず、
        // 発火0のまま死んでいた（24ランの計測で所持7回・17回に対して発火0）。
        const runner = allies.find(a => a.alive && a !== unit
          && a.traits.some(t => Battle.CHAIN_REACTORS.includes(t))
          && !actedInChain(relayChainId, a));
        if (runner) {
          markChainActor(relayChainId, runner);
          const trigger = emitCausal("trait_trigger", {
            sourceId: runner.id, traitId: "relay_kick", name: "押し出し",
            chainDepth: relayDepth, emphasis: 2,
            text: `　${runner.name}の【押し出し】 ${unit.name}の撃破を受けて連鎖${relayDepth}段目へ！`,
            cls: "trait"
          }, applied.deathEvent);
          act(runner, allies, enemies, round, {
            mult: 0.6, parentEvent: trigger, label: "押し出し", isExtra: true
          });
        }
      }
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
        const allies = unit.side === "player" ? playerUnits : enemyUnits;
        const enemies = unit.side === "player" ? enemyUnits : playerUnits;
        for (const tid of unit.traits) {
          const tr = TRAITS[tid];
          if (!tr || !tr.onRoundEnd || (rescueOnly && !tr.rescueOnWipe)) continue;
          tr.onRoundEnd({ unit, allies, enemies, log: note, rng: U.rand });
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
    // 魔王命令。再開した戦闘の冒頭で一度だけ効く。魔王は戦わないので、
    // どれも「自分が殴る」ではなく「軍団に何かをさせる／与える」形にしてある。
    if (carry && options.command) this.applyCommand(options.command, {
      playerUnits, enemyUnits, emit, emitCausal, timeline,
      act: (u, o) => act(u, playerUnits, enemyUnits, carry.round, o)
    });

    let round = carry ? carry.round : 0;
    const firstRound = carry ? carry.round + 1 : 1;

    outer:
    for (round = firstRound; round <= this.MAX_ROUNDS; round++) {
      emit("round_start", { round, emphasis: 1, text: `── ラウンド ${round} ──`, cls: "round" });

      const order = all()
        .filter(u => u.alive)
        .sort((a, b) => b.spd - a.spd || (U.chance(0.5) ? -1 : 1));
      let rescuedThisRound = false;
      for (const unit of order) {
        if (!unit.alive) continue;
        const allies = unit.side === "player" ? playerUnits : enemyUnits;
        const enemies = unit.side === "player" ? enemyUnits : playerUnits;
        act(unit, allies, enemies, round);
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
        const feastUnit = playerUnits.find(u => u.id === feastTrigger.sourceId && u.alive);
        if (feastUnit && !wiped(enemyUnits)) {
          act(feastUnit, playerUnits, enemyUnits, round, {
            mult: 1, parentEvent: feastTrigger, label: "暴食の宴", isExtra: true
          });
        }
      }

      if (wiped(playerUnits) || wiped(enemyUnits)) break;

      // 魔王命令のための区切り。決着していないラウンド終わりでだけ止まる。
      // ここで返す carry を同じユニットと一緒に渡し直せば、続きから再開できる。
      if (options.pauseAfterRound && round === options.pauseAfterRound) {
        return {
          paused: true,
          timeline,
          log: timeline.filter(e => e.text).map(e => ({ t: e.text, c: e.cls })),
          rounds: round,
          activeSynergies: activeSyn.filter(s => s.type !== "merge").map(s => s.name),
          carry: {
            round, nextEventId, nextSummonId, momentum, soulState,
            reservedGold, ledgerFires, graveyardQueue, graveyardUsed, activeSyn
          }
        };
      }
    }

    let victory;
    if (wiped(enemyUnits) && !wiped(playerUnits)) {
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
    const resultText = wiped(enemyUnits) && victory ? "敵軍を全滅させた！ 魔王軍の勝利！"
      : wiped(playerUnits) ? "魔王軍は全滅した……"
      : victory ? "長期戦の末、判定勝ち！ 勇者軍は撤退した。"
      : "長期戦の末、判定負け……魔王軍は敗走した。";
    emit("result", {
      victory, reversal: this.detectReversal(timeline, victory), emphasis: 3,
      text: resultText, cls: victory ? "result-win" : "result-lose"
    });

    return {
      victory,
      timeline,
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
      overtime: this.summarizeOvertime(timeline),
      overkillSummary: this.summarizeOverkill(timeline),
      summonCount: timeline.filter(e => e.type === "summon").length,
      facilitySummary: this.summarizeFacility(timeline),
      deathChains: this.summarizeDeathChains(timeline),
      resourceChanges: this.summarizeResourceChanges(timeline)
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

  // 深い連鎖は「タダで爆発した」ことにしない。魔王軍は労働組織である。
  // 4段目以降の味方の行動を1時間の残業として数え、戦闘後に忠誠と食料へ請求する。
  // 戦闘中に別状態を持ち回らず、確定したタイムラインから導出するだけ。
  summarizeOvertime(timeline) {
    const events = (timeline || []).filter(e => Number.isFinite(e.chainDepth) && e.chainDepth >= 4);
    let hours = 0;
    let deepest = 0;
    for (const event of events) {
      const actorId = event.fromId || event.sourceId || null;
      if (!actorId || !String(actorId).startsWith("p")) continue;   // 敵の連鎖は魔王軍の労務ではない
      if (event.type !== "attack" && event.type !== "splash" && event.type !== "trait_trigger") continue;
      hours += 1;
      deepest = Math.max(deepest, event.chainDepth);
    }
    return { hours, deepest };
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
      const dealt = hits.filter(e => e.fromId === u.id).reduce((s, e) => s + e.dmg, 0);
      const taken = hits.filter(e => e.toId === u.id).reduce((s, e) => s + e.dmg, 0);
      const kills = hits.filter(e => e.fromId === u.id && e.dead).length;
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
