// 自動戦闘エンジン。
//
// simulate() は戦闘を即時に計算し、「イベントタイムライン」を返す。
// 描画側（レンダラ）はこのタイムラインを再生するだけで、戦闘の中身を一切知らない。
// これによりレンダラを差し替えられる（DOM/CSS → Canvas → ネイティブ）。
//
// ── イベント契約 ──────────────────────────────────────────
// 全イベント共通: { type, emphasis, text?, cls? }
//   emphasis … 演出の強さ 0=通常 1=小 2=大 3=決定的。尺は描画側が決める。
//   text/cls … ログ表示用。無いイベントはログに出ない。
//
//   battle_start { player:[Snap], enemy:[Snap] }   Snapは下の snap() 参照
//   synergy      { name, desc }                     シナジー発動（カットイン）
//   round_start  { round }
//   attack       { fromId, toId, dmg, hp, maxHp, dead, traits:[名前] }
//   splash       { fromId, toId, dmg, hp, maxHp, dead, label }  火球などの追撃
//   survive      { unitId, hp, maxHp }              白骨などで致死を耐えた
//   death        { unitId }
//   revive       { unitId, hp, maxHp }              蘇生（状態差分から自動検出）
//   heal         { unitId, amount, hp, maxHp }      回復（同上）
//   note         { }                                特性の発動などテキストのみ
//   result       { victory }
// ───────────────────────────────────────────────────────
const Battle = {
  MAX_ROUNDS: 30,

  // ロスターのモンスター → 戦闘ユニット
  makeUnit(m, side) {
    return {
      id: null,
      side,
      name: m.name,
      race: m.race || "人間",
      icon: m.icon || null,
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
    playerUnits.forEach((u, i) => { u.id = "p" + i; });
    enemyUnits.forEach((u, i) => { u.id = "e" + i; });

    const timeline = [];
    const emit = (type, data) => {
      data = data || {};
      data.type = type;
      if (data.emphasis === undefined) data.emphasis = 0;
      timeline.push(data);
      return data;
    };
    // 特性から呼ばれるテキスト専用ログ（traits.js の ctx.log がこれ）
    const note = (text, cls) => emit("note", { text, cls: cls || "info", emphasis: cls === "revive" ? 2 : 0 });

    const snap = u => ({
      id: u.id, name: u.name, race: u.race, icon: u.icon, side: u.side,
      hp: u.hp, maxHp: u.maxHp, traits: u.traits.slice()
    });

    // シナジー適用（merge型は出撃時に処理済み）
    const activeSyn = Synergy.applyAll(playerUnits);

    emit("battle_start", {
      player: playerUnits.map(snap),
      enemy: enemyUnits.map(snap)
    });
    for (const s of activeSyn) {
      emit("synergy", {
        name: s.name, desc: s.desc, emphasis: 3,
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
      emit(kind, {
        fromId: attacker.id, toId: target.id, dmg,
        hp: target.hp, maxHp: target.maxHp, dead,
        traits: opts.traits || [], label: opts.label || null, emphasis,
        text: `　${attacker.name}${label} → ${target.name} に ${dmg} ダメージ (残HP ${target.hp})`,
        cls: "dmg"
      });
      if (survived) {
        emit("survive", { unitId: target.id, hp: target.hp, maxHp: target.maxHp, emphasis: 2 });
      }
      if (dead) {
        emit("death", {
          unitId: target.id, emphasis: 2,
          text: `　${target.name} は倒れた！`, cls: "death"
        });
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
      if (ctx.notes.length) {
        note(`　${unit.name}の特性（${ctx.notes.join("・")}！）`, "trait");
      }
      const dmg = applyDamage(unit, target, amount, "attack", { traits: ctx.notes });

      // 攻撃後フック（火球・悪戯など）
      const post = {
        attacker: unit, target, dmg, enemies, log: note, pick: U.pick,
        dealRaw: (a, t, d, label) => applyDamage(a, t, d, "splash", { label })
      };
      for (const tid of unit.traits) {
        const tr = TRAITS[tid];
        if (tr && tr.postAttack && target) tr.postAttack(post);
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
          emit("revive", { unitId: s.u.id, hp: s.u.hp, maxHp: s.u.maxHp, emphasis: 3 });
        } else if (s.u.alive && s.u.hp > s.hp) {
          emit("heal", { unitId: s.u.id, amount: s.u.hp - s.hp, hp: s.u.hp, maxHp: s.u.maxHp, emphasis: 1 });
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
      // 誰がどれだけ働いたか（結果画面のMVP表示用）。新しい状態を戦闘中に
      // 持ち回る必要はなく、既に確定したタイムラインから導出するだけでよい。
      contribution: this.summarizeContribution(timeline, playerUnits)
    };
  },

  summarizeContribution(timeline, playerUnits) {
    const hits = timeline.filter(e => e.type === "attack" || e.type === "splash");
    return playerUnits.map(u => {
      const dealt = hits.filter(e => e.fromId === u.id).reduce((s, e) => s + e.dmg, 0);
      const taken = hits.filter(e => e.toId === u.id).reduce((s, e) => s + e.dmg, 0);
      const kills = hits.filter(e => e.fromId === u.id && e.dead).length;
      const died = timeline.some(e => e.type === "death" && e.unitId === u.id);
      return { id: u.id, name: u.name, race: u.race, icon: u.icon, dealt, taken, kills, died };
    }).sort((a, b) => b.dealt - a.dealt);
  }
};
