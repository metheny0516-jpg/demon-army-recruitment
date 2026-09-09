// 事件《スライム大増殖》── 事件の発生と、その専用戦闘のタイムライン生成
//
// この試作で確かめたいこと：
//   **バトルを毎日踏むループにせず、「事件が最も熱くなるところで切る専用ステージ」にする。**
//   平時 → 内部判定 → モルモが持ってくる → 判断 → 必要ならバトル → 後遺症 → 記録。
//
// tick 実験からの引き継ぎと格下げ：
//   リアルタイムに城を動かすのはやめた。tick で分かったのは
//   「盤面を勝手に動かしても、介入が足し算なら20本中18〜20本が同じ結末になる」こと。
//   なので tick の考え方は「事件生成・状態更新」だけに残し、表のループから外す。
//
// なぜ普通の Battle.simulate を使わないか：
//   この事件の面白さは「倒すと増える」「発生源を止めないと終わらない」にある。
//   既存エンジンに分裂と敵側増援は無い。ただし **タイムラインの契約は完全に守る**ので、
//   描画は既存の BattleScene がそのまま再生できる（battle.js は1行も変更していない）。
//
// 勝利条件は全滅ではない：
//   後列の親個体（はらみスライム）を潰すと湧きが止まる。
//   前を殴っているだけでは分裂で埋まり、いつまでも終わらない。
//   「いつ終わるんだこれ！」→「リゼで焼けば奥に届く」を数値で成立させる。

(function (root) {
  "use strict";

  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    s = Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    s = (s ^ (s >>> 13)) >>> 0;
    s = Math.imul(s, 0xc2b2ae35) >>> 0;
    s = (s ^ (s >>> 16)) >>> 0 || 1;
    const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let i = 0; i < 16; i++) next();
    return next;
  }

  // ── 平時の顔ぶれ ─────────────────────────────
  // 誰がいるかで「打てる手」が変わる。いない者の手はメニューに出ない。
  const STAFF = [
    { id: "garo", name: "オーク隊長ガロ", race: "オーク", tplId: "orc", icon: "🐗",
      hp: 46, atk: 11, def: 4, spd: 6, traits: ["drunk"], where: "食堂", note: "昼から飲んでいる" },
    { id: "rize", name: "魔術師リゼ", race: "魔法使い", tplId: "mage", icon: "🔥",
      hp: 24, atk: 13, def: 1, spd: 8, traits: ["magic"], where: "研究室", note: "詠唱中" },
    { id: "boguri", name: "ボグリ", race: "ゴブリン", tplId: "goblin", icon: "👺",
      hp: 30, atk: 7, def: 3, spd: 7, traits: ["coward"], where: "中庭", note: "掃除当番" },
    { id: "gantz", name: "門番ガンツ", race: "オーガ", tplId: "ogre", icon: "🗿",
      hp: 52, atk: 6, def: 7, spd: 3, traits: [], where: "城門", note: "持ち場を動かない" }
  ];

  // ── 事件の芽 ────────────────────────────────
  // 平時に裏で進む。プレイヤーには数字としてだけ見えている。
  // 「今日は何が起こり得るか」を決めるのは世界の状態であって、抽選表ではない。
  function newRun(options) {
    options = options || {};
    const seed = options.seed === undefined ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : options.seed;
    return {
      seed, rng: makeRng(seed),
      day: 0,
      pasture: 3,                 // スライム牧場の個体数
      furnaceUnstable: !!options.furnaceUnstable,   // 前回の事故を持ち越した状態
      pastureLost: !!options.pastureLost,
      staff: STAFF.map(s => ({ ...s, traits: s.traits.slice(), alive: true, hurt: false })),
      log: [],
      incident: null,
      aftermath: [],
      history: []
    };
  }

  // 1日進める。裏で状態が変わるだけで、プレイヤーは結果だけ見る。
  function advanceDay(run) {
    run.day += 1;
    if (run.pastureLost) {
      run.log.push({ day: run.day, text: "スライム牧場は封鎖したままだ。" });
      return null;
    }
    const before = run.pasture;
    // 倍々に増える。誰も見ていないので誰も止めない。
    run.pasture = Math.round(run.pasture * (3.4 + run.rng() * 1.2));
    run.log.push({ day: run.day, text: `スライム牧場の個体数：${before} → ${run.pasture}`, count: run.pasture });
    // ここが「内部判定」。閾値を超えたら事件になる。抽選表ではなく世界の状態から。
    if (run.pasture >= 150) {
      run.incident = {
        id: "slime_swarm", name: "スライム大増殖",
        pasture: run.pasture,
        mormo: `魔王様、大変デス！ スライム牧場の個体数が……${run.pasture}匹。止まりません！`,
        // 溢れた量が、そのまま戦闘の重さになる
        waves: Math.min(6, 2 + Math.floor(run.pasture / 200)),
        frontline: Math.min(6, 3 + Math.floor(run.pasture / 300))
      };
      return run.incident;
    }
    return null;
  }

  // ── 打てる手 ────────────────────────────────
  // 誰がいるかで変わる。戦わずに終わる手も混ぜる（全部をバトルにしない）。
  const OPTIONS = [
    {
      id: "plain", name: "普通に鎮圧させる", kind: "battle",
      available: () => true,
      advise: () => "手が空いている者で当たらせます。……数が多いので、長引くかもしれませんヨ"
    },
    {
      id: "burn", name: "リゼに焼き払わせる", kind: "battle",
      available: (run) => run.staff.some(s => s.alive && s.traits.includes("magic")),
      advise: (run) => run.furnaceUnstable
        ? "リゼ殿の広域魔法なら一掃できます。ただし、前回の事故で炉心が不安定デス……"
        : "リゼ殿の広域魔法なら、奥まで一度に届きます"
    },
    {
      id: "rouse", name: "ガロを叩き起こす", kind: "battle",
      available: (run) => run.staff.some(s => s.alive && s.traits.includes("drunk")),
      advise: () => "ガロ殿なら手数が増えます。ただ……かなり酔っていますヨ"
    },
    {
      id: "seal", name: "牧場ごと封鎖する", kind: "noBattle",
      available: (run) => !run.pastureLost,
      advise: () => "誰も傷つきません。ただ、牧場はもう使えなくなりますデス"
    }
  ];

  const availableOptions = (run) => OPTIONS.filter(o => o.available(run));

  // ── 専用戦闘のタイムライン ────────────────────
  // battle.js のイベント契約に完全に従う。描画側は中身を知らないまま再生できる。
  function buildBattle(run, optionId) {
    const rng = run.rng;
    const inc = run.incident;
    const opt = OPTIONS.find(o => o.id === optionId);
    const timeline = [];
    let nextId = 1;
    const emit = (type, data) => {
      data = data || {};
      data.type = type;
      data.eventId = "iv" + nextId++;
      if (data.emphasis === undefined) data.emphasis = 0;
      timeline.push(data);
      return data;
    };

    // 出撃者。手によって顔ぶれと状態が変わる。
    const party = [];
    const take = (id, mod) => {
      const s = run.staff.find(x => x.id === id && x.alive);
      if (!s) return;
      party.push(Object.assign({
        uid: s.id, name: s.name, race: s.race, tplId: s.tplId, icon: s.icon,
        maxHp: s.hp, hp: s.hp, atk: s.atk, def: s.def, spd: s.spd,
        traits: [], tags: [], introQuote: "", alive: true
      }, mod || {}));
    };
    take("gantz");
    take("boguri", { introQuote: "こんなの聞いてませんよぉ！" });
    if (optionId === "burn") take("rize", { introQuote: "……離れていてください。" });
    if (optionId === "rouse") take("garo", { drunk: true, atk: 18, introQuote: "どこだ、どこにいる" });
    if (optionId === "plain") take("rize");

    // 敵。前列のスライムと、後列の親個体。
    const enemy = [];
    let slimeNo = 0;
    const makeSlime = (gen) => ({
      uid: "sl" + (++slimeNo), name: gen ? "分裂スライム" : "スライム", race: "スライム",
      tplId: "slime", icon: "🟢",
      maxHp: gen ? 10 : 16, hp: gen ? 10 : 16, atk: gen ? 3 : 5, def: 1, spd: 4,
      traits: [], tags: [], alive: true, gen: gen || 0
    });
    for (let i = 0; i < inc.frontline; i++) enemy.push(makeSlime(0));
    const mother = {
      uid: "mother", name: "はらみスライム", race: "キングスライム", tplId: "king_slime", icon: "👑",
      maxHp: 60, hp: 60, atk: 6, def: 3, spd: 2, traits: [], tags: [],
      introQuote: "", alive: true, isMother: true
    };
    enemy.push(mother);

    party.forEach((u, i) => { u.id = "p" + i; u.side = "player"; });
    enemy.forEach((u, i) => { u.id = "e" + i; u.side = "enemy"; });

    const snap = u => ({
      id: u.id, name: u.name, race: u.race, tplId: u.tplId, icon: u.icon, side: u.side,
      hp: u.hp, maxHp: u.maxHp, atk: u.atk, def: u.def, spd: u.spd,
      traits: [], tags: [], introQuote: u.introQuote || "", summoned: !!u.summoned
    });

    emit("battle_start", { player: party.map(snap), enemy: enemy.map(snap) });
    emit("incident", {
      id: inc.id, name: inc.name, emphasis: 3,
      text: `《${inc.name}》 牧場から${inc.pasture}匹が溢れ出した`, cls: "incident"
    });
    for (const u of party.concat(enemy)) {
      if (!u.introQuote) continue;
      emit("dialogue", { unitId: u.id, name: u.name, side: u.side, quote: u.introQuote,
        emphasis: 2, text: `${u.name}「${u.introQuote}」`, cls: "dialogue" });
    }

    const alive = list => list.filter(u => u.alive);
    let victory = false, round = 0, wavesLeft = inc.waves;
    let furnaceAccident = false;
    const MAX_ROUNDS = 14;

    const hurt = (attacker, target, dmg, label) => {
      target.hp = Math.max(0, target.hp - dmg);
      const dead = target.hp <= 0;
      const ev = emit(label ? "splash" : "attack", {
        fromId: attacker.id, toId: target.id, dmg, hp: target.hp, maxHp: target.maxHp,
        dead, label: label || undefined, emphasis: dead ? 2 : 1,
        text: `${attacker.name}の${label || "攻撃"} → ${target.name}に${dmg}`, cls: "hit"
      });
      if (!dead) return ev;
      target.alive = false;
      emit("death", { unitId: target.id, emphasis: target.isMother ? 3 : 1,
        text: `${target.name}が倒れた`, cls: "death" });
      // 分裂。倒すと増える。これが「いつ終わるんだ」の正体。
      if (label === "広域炎") {
        emit("note", { emphasis: 1, text: `　${target.name}は焼き切られた（分裂しない）`, cls: "trait" });
        return ev;
      }
      if (target.race === "スライム" && target.gen < 2 && !target.isMother && mother.alive) {
        for (let k = 0; k < 2; k++) {
          const baby = makeSlime(target.gen + 1);
          baby.id = "es" + (++slimeNo);
          baby.side = "enemy";
          baby.summoned = true;
          enemy.push(baby);
          emit("summon", { unit: snap(baby), sourceUnitId: target.id, emphasis: 2,
            text: `　${target.name}が分裂した！`, cls: "revive" });
        }
      }
      return ev;
    };

    while (round < MAX_ROUNDS) {
      round += 1;
      emit("round_start", { round });

      // 牧場から次の波が押し寄せる。親が生きている間だけ。
      if (mother.alive && wavesLeft > 0 && round > 1) {
        wavesLeft -= 1;
        const n = 1 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const s = makeSlime(0);
          s.id = "ew" + (++slimeNo); s.side = "enemy"; s.summoned = true;
          enemy.push(s);
          emit("summon", { unit: snap(s), sourceUnitId: mother.id, emphasis: 2,
            text: `　牧場からさらに湧いてきた！`, cls: "revive" });
        }
      }

      const order = alive(party).concat(alive(enemy)).sort((a, b) => b.spd - a.spd);
      for (const actor of order) {
        if (!actor.alive) continue;
        const foes = actor.side === "player" ? alive(enemy) : alive(party);
        if (!foes.length) break;

        if (actor.side === "player") {
          // リゼの広域魔法。前を薙いで、奥の親に届く。ここが「焼けば終わる」の正体。
          if (actor.uid === "rize" && optionId === "burn" && round % 2 === 1) {
            emit("note", { emphasis: 2, text: `${actor.name}の【広域炎】`, cls: "trait" });
            for (const f of alive(enemy)) {
              const d = Math.max(1, Math.round((actor.atk * 0.85 - f.def) * (0.8 + rng() * 0.4)));
              hurt(actor, f, d, "広域炎");
            }
            // 過負荷は無料ではない。炉が不安定なら事故る。
            const risk = run.furnaceUnstable ? 0.30 : 0.12;
            if (!furnaceAccident && rng() < risk) {
              furnaceAccident = true;
              emit("incident", { id: "furnace", name: "炉の暴発", emphasis: 3,
                text: "※ 魔力炉が悲鳴を上げた", cls: "incident" });
              for (const m of alive(party)) {
                const d = 5 + Math.floor(rng() * 7);
                hurt({ id: actor.id, name: "炉の暴発" }, m, d, "暴発");
              }
            }
            continue;
          }
          const target = foes[0];
          // 酩酊：強く振れるが当たらない
          if (actor.drunk && rng() < 0.4) {
            emit("note", { emphasis: 1, text: `${actor.name}の攻撃は空を切った`, cls: "trait" });
            continue;
          }
          const d = Math.max(1, Math.round((actor.atk - target.def) * (0.8 + rng() * 0.5)));
          hurt(actor, target, d);
        } else {
          // 先頭が狙われやすい。後衛が最初に溶けると編成の意味が消える。
          const target = rng() < 0.65 ? foes[0] : foes[Math.floor(rng() * foes.length)];
          const d = Math.max(1, Math.round((actor.atk - target.def) * (0.8 + rng() * 0.5)));
          hurt(actor, target, d);
        }
      }

      // 親を潰せば湧きが止まる。残りは片付けるだけ。
      if (!mother.alive && !alive(enemy).length) { victory = true; break; }
      if (!alive(party).length) break;
      if (!mother.alive && wavesLeft <= 0 && alive(enemy).length <= 1) {
        // 残り1匹なら決着扱いにして間延びさせない
        for (const f of alive(enemy)) { f.alive = false; emit("death", { unitId: f.id, text: `${f.name}が倒れた`, cls: "death" }); }
        victory = true; break;
      }
    }
    if (!victory && alive(party).length && !mother.alive) victory = true;

    emit("result", {
      victory, emphasis: 3,
      text: victory ? "スライムを鎮圧した！" : "押し切られた。城内にスライムが散った……",
      cls: victory ? "result-win" : "result-lose"
    });

    return {
      victory, timeline, rounds: round,
      furnaceAccident,
      party: party.map(u => ({ uid: u.uid, name: u.name, hp: u.hp, maxHp: u.maxHp, survived: u.alive })),
      motherDown: !mother.alive,
      option: opt
    };
  }

  // ── 決着のあとに残るもの ──────────────────────
  // 勝敗とは別に、世界の次の状態が変わる。「勝つけど、どの傷を残すか」。
  function settle(run, optionId, result) {
    const out = [];
    const opt = OPTIONS.find(o => o.id === optionId);

    if (opt.kind === "noBattle") {
      run.pastureLost = true;
      run.pasture = 0;
      out.push("スライム牧場を失った", "誰も傷つかなかった");
      run.incident = null;
      run.aftermath = out;
      run.history.push({ day: run.day, incident: "スライム大増殖", choice: opt.name, victory: null, after: out.slice() });
      return out;
    }

    for (const p of result.party) {
      const s = run.staff.find(x => x.id === p.uid);
      if (!s) continue;
      if (!p.survived) { s.alive = false; out.push(`${s.name}が倒れた`); }
      else if (p.hp <= p.maxHp * 0.35) {
        s.hurt = true;
        s.hp = Math.max(8, Math.round(s.hp * 0.7));   // 傷は次の事件まで残る
        out.push(`${s.name}が負傷した（次も本調子ではない）`);
      }
    }
    if (optionId === "burn") {
      if (result.furnaceAccident) { run.furnaceUnstable = true; out.push("魔力炉が事故を起こした", "研究が止まった"); }
      else out.push("炉心に負荷が残った");
      if (result.victory && !result.furnaceAccident) out.push("リゼが手応えを得た");
      out.push("牧場の設備が焼けた");
    }
    if (optionId === "rouse") out.push("食堂が荒れた");
    if (result.victory) {
      run.pasture = 3;
      out.push("牧場は3匹まで減った");
    } else {
      run.pasture = Math.max(20, Math.round(run.incident.pasture * 0.4));
      out.push("城内にスライムが住み着いた");
    }
    run.incident = null;
    run.aftermath = out;
    run.history.push({ day: run.day, incident: "スライム大増殖", choice: opt.name, victory: result.victory, after: out.slice() });
    return out;
  }

  const api = { STAFF, OPTIONS, makeRng, newRun, advanceDay, availableOptions, buildBattle, settle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.IncidentSlime = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
