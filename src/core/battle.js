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
//   death        { unitId }
//   overkill     { fromId,toId,excess,percent,rank }  致死時の余剰ダメージ
//   revive       { unitId, hp, maxHp }              蘇生（状態差分から自動検出）
//   summon       { unit:Snap, sourceUnitId }         戦闘専用ユニットの追加
//   heal         { unitId, amount, hp, maxHp }      回復（同上）
//   note         { }                                特性の発動などテキストのみ
//   incident     { id,name,unitId,targetId? }        戦闘中ハプニング
//   result       { victory }
// ───────────────────────────────────────────────────────
const Battle = {
  MAX_ROUNDS: 30,

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

  simulate(playerUnits, enemyUnits, options) {
    options = options || {};
    playerUnits.forEach((u, i) => { u.id = "p" + i; });
    enemyUnits.forEach((u, i) => { u.id = "e" + i; });

    const timeline = [];
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
      const event = emit(type, data);
      if (!event.chainId) event.chainId = event.eventId;
      return event;
    };
    // 特性から呼ばれるテキスト専用ログ（traits.js の ctx.log がこれ）
    const note = (text, cls) => emit("note", { text, cls: cls || "info", emphasis: cls === "revive" ? 2 : 0 });
    const soulState = { player: { amount: 0 }, enemy: { amount: 0 } };
    let graveyardDeath = null;
    let graveyardUsed = false;
    let nextSummonId = 1;

    const reactToDeath = (target, deathEvent) => {
      if (target.flags.summoned) return;
      if (options.graveyard && target.side === "player" && !graveyardDeath) {
        graveyardDeath = { target, deathEvent };
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
    const activeSyn = Synergy.applyAll(playerUnits);
    const goblinRaid = activeSyn.some(s => s.id === "goblin_horde");
    let reservedGold = 0;
    let ledgerTriggered = false;
    let ledgerBoost = null;
    const gainBattleResource = (unit, resource, value, label, parent) => {
      const resourceName = resource === "gold" ? "G" : resource;
      const event = emitCausal("resource_gain", {
        sourceId: unit.id, resource, amount: value, reserved: true, label,
        emphasis: 1, text: `　${unit.name}の【${label}】 ${value}${resourceName}を略奪予約`, cls: "loot"
      }, parent);
      if (resource === "gold") {
        const before = reservedGold;
        reservedGold += value;
        if (options.extortionLedger && !ledgerTriggered && before < 3 && reservedGold >= 3) {
          ledgerTriggered = true;
          ledgerBoost = emitCausal("facility_trigger", {
            facilityId: "extortion_ledger", name: "恐喝帳簿", desc: "次の味方攻撃+40%",
            amount: reservedGold, emphasis: 2,
            text: `　施設【恐喝帳簿】 予約金貨${reservedGold}G到達、次の味方攻撃+40%`, cls: "synergy"
          }, event);
        }
      }
      return event;
    };

    emit("battle_start", {
      player: playerUnits.map(snap),
      enemy: enemyUnits.map(snap)
    });
    let feastTrigger = null;
    const rations = options.rations;
    if (rations) {
      const rationEvent = emitCausal("resource_consume", {
        resource: "food", amount: rations.consumed, need: rations.need, shortage: rations.shortage,
        emphasis: rations.emptied ? 2 : 1,
        text: `戦闘糧食 ${rations.consumed}/${rations.need} を消費`, cls: "food"
      }, null);
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
    for (const u of [...enemyUnits, ...playerUnits]) {
      if (!u.introQuote) continue;
      emit("dialogue", {
        unitId: u.id, name: u.name, side: u.side, quote: u.introQuote,
        emphasis: 2, text: `${u.name}「${u.introQuote}」`, cls: "dialogue"
      });
    }
    for (const s of activeSyn) {
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
      if (dead && dmg > hpBefore) {
        const excess = dmg - hpBefore;
        const percent = Math.round(excess / target.maxHp * 100);
        const rank = Battle.overkillRank(percent);
        overkillEvent = emitCausal("overkill", {
          fromId: attacker.id, toId: target.id, excess, percent,
          rankId: rank.id, rank: rank.name, emphasis: rank.emphasis,
          text: `　${rank.name}！ 余剰${excess}ダメージ（${percent}% OVERKILL）`, cls: "overkill"
        }, damageEvent);
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
        if (overkillEvent && overkillEvent.percent >= 100 && propagationDepth < 3
          && attacker.traits.includes("chain_massacre")) {
          const opponents = attacker.side === "player" ? enemyUnits : playerUnits;
          const next = opponents.find(unit => unit.alive);
          if (next) {
            const trigger = emitCausal("trait_trigger", {
              sourceId: attacker.id, traitId: "chain_massacre", name: "連鎖虐殺",
              propagationDepth: propagationDepth + 1, emphasis: 2,
              text: `　${attacker.name}の【連鎖虐殺】 余剰ダメージが${next.name}へ伝播！`, cls: "trait"
            }, overkillEvent);
            applyDamage(attacker, next, overkillEvent.excess * 0.3, "splash", {
              label: "連鎖虐殺", parentEvent: trigger, propagationDepth: propagationDepth + 1
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

    const act = (unit, allies, enemies, round, actionOpts) => {
      actionOpts = actionOpts || {};
      const living = enemies.filter(u => u.alive);
      if (living.length === 0) return;
      if (!actionOpts.isExtra && tryIncident(unit, allies)) return;
      // 先頭（配置順）が60%で狙われる。前衛に壁を置く意味を持たせる。
      const target = U.chance(0.6) ? living[0] : U.pick(living);

      const ctx = {
        attacker: unit, target, allies, enemies, round,
        mult: unit.mods.dmgMult, notes: [], rng: U.rand
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
      if (triggeredEvents.length) {
        const reaction = {
          attacker: unit, events: triggeredEvents,
          extraAction: (mult, parentEvent, label) => {
            const trigger = emitCausal("trait_trigger", {
              sourceId: unit.id, traitId: "greedy", name: label, emphasis: 2,
              text: `　${unit.name}の【${label}】 金貨に目がくらみ追加行動！`, cls: "trait"
            }, parentEvent);
            act(unit, allies, enemies, round, { mult, parentEvent: trigger, label, isExtra: true });
          }
        };
        for (const tid of unit.traits) {
          const tr = TRAITS[tid];
          if (tr && tr.onTriggeredEvents) tr.onTriggeredEvents(reaction);
        }
      }
    };

    const wiped = us => us.every(u => !u.alive);
    const all = () => [...playerUnits, ...enemyUnits];
    let round = 0;

    outer:
    for (round = 1; round <= this.MAX_ROUNDS; round++) {
      emit("round_start", { round, emphasis: 1, text: `── ラウンド ${round} ──`, cls: "round" });

      const order = all()
        .filter(u => u.alive)
        .sort((a, b) => b.spd - a.spd || (U.chance(0.5) ? -1 : 1));
      for (const unit of order) {
        if (!unit.alive) continue;
        const allies = unit.side === "player" ? playerUnits : enemyUnits;
        const enemies = unit.side === "player" ? enemyUnits : playerUnits;
        act(unit, allies, enemies, round);
        if (wiped(playerUnits) || wiped(enemyUnits)) break outer;
      }

      // ラウンド終了時フック（再生・執念・死霊術）。死亡中ユニットにも回す。
      // 特性側は ctx.log を呼ぶだけでよく、蘇生・回復は状態差分から自動的に
      // 構造化イベントへ変換する。新しい特性を足しても描画側の変更は要らない。
      const before = all().map(u => ({ u, alive: u.alive, hp: u.hp }));
      for (const unit of all()) {
        const allies = unit.side === "player" ? playerUnits : enemyUnits;
        const enemies = unit.side === "player" ? enemyUnits : playerUnits;
        for (const tid of unit.traits) {
          const tr = TRAITS[tid];
          if (tr && tr.onRoundEnd) tr.onRoundEnd({ unit, allies, enemies, log: note, rng: U.rand });
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
          delete s.u.flags.reviveSourceId;
          delete s.u.flags.reviveTraitId;
          reactToUndeadArrival(s.u, reviveEvent);
        } else if (s.u.alive && s.u.hp > s.hp) {
          emitCausal("heal", { unitId: s.u.id, amount: s.u.hp - s.hp, hp: s.u.hp, maxHp: s.u.maxHp, emphasis: 1 }, null);
        }
      }

      if (options.graveyard && graveyardDeath && !graveyardUsed) {
        graveyardUsed = true;
        const source = graveyardDeath.target;
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
        }, graveyardDeath.deathEvent);
        const summonEvent = emitCausal("summon", {
          sourceUnitId: source.id, unit: snap(summoned), emphasis: 3,
          text: `　${summoned.name}を召喚！`, cls: "revive"
        }, facilityEvent);
        reactToUndeadArrival(summoned, summonEvent);
      }

      if (round === 1 && feastTrigger) {
        const feastUnit = playerUnits.find(u => u.id === feastTrigger.sourceId && u.alive);
        if (feastUnit && !wiped(enemyUnits)) {
          act(feastUnit, playerUnits, enemyUnits, round, {
            mult: 1, parentEvent: feastTrigger, label: "暴食の宴", isExtra: true
          });
        }
      }

      if (wiped(playerUnits) || wiped(enemyUnits)) break;
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
    const resultText = wiped(enemyUnits) && victory ? "敵軍を全滅させた！ 魔王軍の勝利！"
      : wiped(playerUnits) ? "魔王軍は全滅した……"
      : victory ? "長期戦の末、判定勝ち！ 勇者軍は撤退した。"
      : "長期戦の末、判定負け……魔王軍は敗走した。";
    emit("result", {
      victory, emphasis: 3,
      text: resultText, cls: victory ? "result-win" : "result-lose"
    });

    return {
      victory,
      timeline,
      // 旧来のテキストログ（タイムラインから導出）
      log: timeline.filter(e => e.text).map(e => ({ t: e.text, c: e.cls })),
      rounds: Math.min(round, this.MAX_ROUNDS),
      activeSynergies: activeSyn.map(s => s.name),
      incidents: timeline.filter(e => e.type === "incident").map(e => ({ id: e.id, name: e.name, text: e.text })),
      // 誰がどれだけ働いたか（結果画面のMVP表示用）。新しい状態を戦闘中に
      // 持ち回る必要はなく、既に確定したタイムラインから導出するだけでよい。
      contribution: this.summarizeContribution(timeline, playerUnits),
      nearMiss: this.summarizeNearMiss(timeline),
      chainSummary: this.summarizeChains(timeline),
      overkillSummary: this.summarizeOverkill(timeline),
      summonCount: timeline.filter(e => e.type === "summon").length,
      resourceChanges: this.summarizeResourceChanges(timeline)
    };
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
      chains
    };
  },

  summarizeResourceChanges(timeline) {
    const changes = {};
    for (const event of timeline || []) {
      if (event.type !== "resource_gain" || !event.resource) continue;
      changes[event.resource] = (changes[event.resource] || 0) + (Number(event.amount) || 0);
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
      return {
        id: u.id, uid: u.uid, name: u.name, race: u.race, tplId: u.tplId, icon: u.icon,
        unpaid: !!u.unpaid, dealt, taken, kills,
        overkillCount: overkills.length,
        maxOverkill: overkills.reduce((max, event) => Math.max(max, event.percent || 0), 0),
        died,                 // 一度でも倒れたか（蘇生した者も true）
        survived: u.alive     // 戦闘終了時に生きていたか。退場判定はこちらを使う
      };
    }).sort((a, b) => b.dealt - a.dealt);
  }
};
