// 自動戦闘エンジン。simulate() が全ラウンドを即時計算し、ログの配列を返す。
// UI側はログを順番に表示するだけ。
const Battle = {
  MAX_ROUNDS: 30,

  // ロスターのモンスター → 戦闘ユニット
  makeUnit(m, side) {
    return {
      side,
      name: m.name,
      race: m.race || "人間",
      job: m.job || "",
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
      mods: { dmgMult: 1, takenMult: 1, fireballAll: false, necroFull: false },
      flags: {},
      alive: true
    };
  },

  simulate(playerUnits, enemyUnits) {
    const log = [];
    const push = (t, c) => log.push({ t, c: c || "info" });

    // シナジー適用（merge型は出撃時に処理済み）
    const activeSyn = Synergy.applyAll(playerUnits);
    for (const s of activeSyn) {
      push(`シナジー発動【${s.name}】 ${s.desc}`, "synergy");
    }

    const dealDamage = (attacker, target, amount, label) => {
      let dmg = Math.max(1, Math.round(amount * target.mods.takenMult));
      for (const tid of target.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.modTaken) dmg = tr.modTaken({ unit: target, attacker, dmg });
      }
      target.hp -= dmg;
      const tag = label ? `【${label}】` : "";
      push(`　${attacker.name}${tag} → ${target.name} に ${dmg} ダメージ (残HP ${Math.max(0, target.hp)})`, "dmg");
      if (target.hp <= 0) {
        let survived = false;
        for (const tid of target.traits) {
          const tr = TRAITS[tid];
          if (tr && tr.onLethal && tr.onLethal({ unit: target, log: push })) { survived = true; break; }
        }
        if (survived) {
          target.hp = 1;
        } else {
          target.alive = false;
          target.hp = 0;
          push(`　${target.name} は倒れた！`, "death");
        }
      }
      return dmg;
    };

    const act = (unit, allies, enemies, round) => {
      const living = enemies.filter(u => u.alive);
      if (living.length === 0) return;
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
      const variance = 0.9 + U.rand() * 0.2;
      const raw = unit.atk * ctx.mult * variance;
      const amount = Math.max(1, Math.round(raw) - Math.floor(target.def / 2));
      const noteStr = ctx.notes.length ? `（${ctx.notes.join("・")}！）` : "";
      if (noteStr) push(`　${unit.name}の特性${noteStr}`, "trait");
      const dmg = dealDamage(unit, target, amount, null);

      // 攻撃後フック（火球・悪戯など）
      const post = {
        attacker: unit, target, dmg, enemies, log: push, pick: U.pick,
        dealRaw: (a, t, d, label) => dealDamage(a, t, d, label)
      };
      for (const tid of unit.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.postAttack && target) tr.postAttack(post);
      }
    };

    const wiped = us => us.every(u => !u.alive);
    let round = 0;

    outer:
    for (round = 1; round <= this.MAX_ROUNDS; round++) {
      push(`── ラウンド ${round} ──`, "round");
      const order = [...playerUnits, ...enemyUnits]
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
      for (const unit of [...playerUnits, ...enemyUnits]) {
        const allies = unit.side === "player" ? playerUnits : enemyUnits;
        const enemies = unit.side === "player" ? enemyUnits : playerUnits;
        for (const tid of unit.traits) {
          const tr = TRAITS[tid];
          if (tr && tr.onRoundEnd) tr.onRoundEnd({ unit, allies, enemies, log: push, rng: U.rand });
        }
      }
      if (wiped(playerUnits) || wiped(enemyUnits)) break;
    }

    let victory;
    if (wiped(enemyUnits) && !wiped(playerUnits)) {
      victory = true;
      push("敵軍を全滅させた！ 魔王軍の勝利！", "result-win");
    } else if (wiped(playerUnits)) {
      victory = false;
      push("魔王軍は全滅した……", "result-lose");
    } else {
      // 30ラウンド経過 → 残HP率で判定
      const ratio = us => us.reduce((s, u) => s + u.hp, 0) / us.reduce((s, u) => s + u.maxHp, 0);
      victory = ratio(playerUnits) >= ratio(enemyUnits);
      push(victory ? "長期戦の末、判定勝ち！ 勇者軍は撤退した。" : "長期戦の末、判定負け……魔王軍は敗走した。",
        victory ? "result-win" : "result-lose");
    }

    return { victory, log, rounds: Math.min(round, this.MAX_ROUNDS), activeSynergies: activeSyn.map(s => s.name) };
  }
};
