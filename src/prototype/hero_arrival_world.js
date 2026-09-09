// 勇者襲来 縦切り試作 ── 世界ロジック（DOM非依存 / Node からも読める）
//
// 対象は docs/HERO_ARRIVAL_VERTICAL_DESIGN_2026-09-09.md の A と B だけ。
//   A：普通の勇者迎撃。採用・仕事・編成・育成の成果が戦闘で見える。
//   B：モグに店を任せる。普通の接客で客へ酒を勧め、相手が飲み、
//      あとから勇者だったと分かり、その状態のまま迎撃へつながる。
//
// ここで**やっていないこと**（範囲を広げないための明示）:
//   転職交渉 / プルの摂食 / 洪水 / 反乱 / 研究暴走 / CHAIN追加 / 新しい戦闘機構 /
//   一マス移動 / T管理 / 本編セーブ（maou_save, maou_history）への接続。
//
// 設計上の約束（これを壊すと試作の意味が消える）:
//   1. 「モグを採ったから勇者イベントが予約される」方式にしない。
//      起きることは必ず〈仕事 → 能力・設備・材料 → 接触 → 提供 → 相手の応答〉から作る。
//      モグ以外を店に置けば酒は作られず、モグを店以外に置いても酒は作られない。
//   2. 客の応答は提供者の性格ではなく**客側の条件**（guestCondition）が決める。
//      断られて普通に仕事が終わる回も、成立した結果として扱う。
//   3. 身元は接触した時点では分からない。あとで判明する。
//      モルモの「先ほどまで、うちで飲んでいた方です」は、
//      台本ではなく facts に残った提供の事実からのみ作る。事実が無ければ言わない。

(function (root) {
  "use strict";

  // ── 決定的乱数 ───────────────────────────────
  // 試作の比較（同じ条件を別のseedで見る）と、テストの再現性のために持つ。
  // 戦闘計算そのものは既存 Battle.simulate（U.rand）に任せる。
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // ── 場所 ────────────────────────────────────
  // 一マス移動はしない。粗い区分だけを持ち、接触の可否にだけ使う。
  const PLACES = {
    castle: { id: "castle", name: "城内" },
    town: { id: "town", name: "城下" },
    gate: { id: "gate", name: "城門前" },
    away: { id: "away", name: "遠方" }
  };

  // ── 仕事 ────────────────────────────────────
  // 仕事が「どこにいるか」「何に触れられるか」「何をしてよいか」を決める。
  // 能力は仕事に付いていない。だからガロを店に置いても酒はできない。
  const JOBS = {
    guard: {
      id: "guard", name: "守備", place: "castle",
      desc: "城内で守備につく。来客の応対はしない。",
      grants: { defend: true }
    },
    gate: {
      id: "gate", name: "門番", place: "gate",
      desc: "城門で通行と身元を扱う。到着した相手と接触する。",
      grants: { defend: true, identify: true }
    },
    tavern: {
      id: "tavern", name: "城下の店", place: "town",
      desc: "城下の酒場で働く。設備があり、来た客と接触できる。",
      grants: { shop: true, facility_brewery: true, serve: true }
    },
    stores: {
      id: "stores", name: "資材整理", place: "castle",
      desc: "城内の資材を片付ける。城内の物にだけ触れる。",
      grants: { tidy: true }
    },
    patrol: {
      id: "patrol", name: "近郊警戒", place: "away",
      desc: "最初の勤務のあいだだけ近郊へ出る。自動で帰還する。",
      grants: { sortie: true }, oneShot: true
    }
  };

  // ── 人物 ────────────────────────────────────
  // 「表示」＝履歴書に出す文。「内側」＝行動根拠。全部を画面に並べない。
  // abilities は本人に付く。仕事では増えない。
  const PERSONS = [
    {
      id: "garo", name: "ガロ", race: "オーク", tplId: "orc", icon: "🐗",
      job: "古参・最前列", hired: true, salary: 3,
      resume: {
        prev: "最前列。十九年。",
        wish: "新入りを死なせたくない。",
        note: "戦功3。傷は数えていない。"
      },
      abilities: ["front"], motives: ["protect"],
      base: { hp: 96, atk: 22, def: 9, spd: 6 },
      merit: 3, rankId: "soldier",
      introQuote: "……新入りは、後ろだ。"
    },
    {
      id: "gantz", name: "ガンツ", race: "オーガ", tplId: "shield", icon: "🗿",
      job: "門番", hired: true, salary: 2,
      resume: {
        prev: "城門を任されて十二年。",
        wish: "通すなと言われた者は通しません。",
        note: "遅い。動かない。"
      },
      abilities: ["front", "identify"], motives: ["duty"],
      base: { hp: 120, atk: 13, def: 12, spd: 3 },
      merit: 0, rankId: "soldier"
    },
    {
      id: "mog", name: "モグ", race: "ゴブリン", tplId: "goblin", icon: "👺",
      job: "酒造担当", hired: false, salary: 2,
      resume: {
        prev: "醸造所の下働き。",
        wish: "試作品の感想を聞かせてください。勤務時間外でも構いません。",
        note: "戦闘経験はほとんどありません。"
      },
      // brew があるのはモグだけ。設備（仕事）と能力（本人）の両方が要る。
      abilities: ["brew", "serve"], motives: ["taste_feedback"],
      base: { hp: 60, atk: 14, def: 5, spd: 5 }, merit: 0, rankId: "soldier"
    },
    {
      id: "rize", name: "リゼ", race: "魔法使い", tplId: "mage", icon: "🔥",
      job: "魔術師", hired: false, salary: 3,
      resume: {
        prev: "宮廷魔術師見習い（自主退職）。",
        wish: "詠唱中だけ、前に立たないでください。",
        note: "依頼どおりの仕事を好みます。"
      },
      abilities: ["magic"], motives: ["do_as_asked"],
      base: { hp: 48, atk: 24, def: 3, spd: 8 }, merit: 0, rankId: "soldier"
    },
    {
      id: "honekichi", name: "ホネ吉", race: "骸骨兵", tplId: "skeleton", icon: "💀",
      job: "骸骨兵", hired: false, salary: 1,
      resume: {
        prev: "夜警。",
        wish: "皆勤です。寝ていませんので。",
        note: "食事は不要です。"
      },
      abilities: ["front"], motives: ["duty"],
      base: { hp: 74, atk: 18, def: 7, spd: 6 }, merit: 0, rankId: "soldier"
    },
    {
      id: "rena", name: "レナ", race: "人間", tplId: "swordsman", icon: "🗡",
      job: "元・護衛", hired: false, salary: 3,
      resume: {
        prev: "アレン隊の護衛。",
        wish: "退職理由は、本人に聞いてください。",
        note: "剣は一通り。夜目が利きます。"
      },
      // 元同僚という関係は持っているが、今回の試作は交渉を実装していない。
      // 「知っているのに何も起こらない」を隠さないため、関係だけ持たせて
      // 勤務中は任務を離れない（設計 A の「勝手な転職交渉は始めない」）ことを報告に出す。
      abilities: ["front"], motives: ["duty"],
      relations: [{ to: "allen", kind: "former_colleague" }],
      base: { hp: 82, atk: 21, def: 8, spd: 8 }, merit: 0, rankId: "soldier"
    }
  ];

  // ── 昇進 ────────────────────────────────────
  // 既存 PROMOTION_RANKS と同じ語彙・同じ閾値を使う（試作だけの新しい成長軸を作らない）。
  const RANKS = [
    { id: "soldier", name: "兵卒", threshold: 0 },
    { id: "squad_leader", name: "小隊長", threshold: 4, boost: { hp: 1.05, atk: 1.05, def: 0 } },
    { id: "demon_lord", name: "魔将", threshold: 10, boost: { hp: 1.08, atk: 1.08, def: 1 } }
  ];

  // ── 勇者一行 ────────────────────────────────
  // src/data/enemies.js のステージ8をそのまま持ってこず、
  // 「5名前後・育成1回」の試作規模へ校正した値を試作側で持つ（本編の敵データは変更しない）。
  const HERO_PARTY = [
    { id: "dolf", name: "戦士ドルフ", tplId: "axeman", icon: "🪓", hp: 108, atk: 18, def: 10, spd: 7 },
    {
      id: "allen", name: "勇者アレン", tplId: "hero", icon: "👑",
      hp: 141, atk: 25, def: 12, spd: 10, traits: ["hero_awaken"],
      introQuote: "ここが最後の一線だ。魔王よ、僕たちの世界は渡さない！"
    },
    { id: "el", name: "聖女エル", tplId: "cleric", icon: "✨", hp: 85, atk: 13, def: 8, spd: 6 },
    { id: "mira", name: "賢者ミラ", tplId: "sage", icon: "📖", hp: 75, atk: 21, def: 6, spd: 8 }
  ];

  // 近郊警戒の相手。既存の中盤ステージ相当。
  const PATROL_PARTY = [
    { id: "pt1", name: "王国巡回兵ケイ", tplId: "swordsman", icon: "🗡", hp: 40, atk: 15, def: 4, spd: 6 },
    { id: "pt2", name: "王国巡回兵ノル", tplId: "archer", icon: "🏹", hp: 30, atk: 15, def: 2, spd: 8 }
  ];

  // ── 相手の条件 ──────────────────────────────
  // 設計 5.3 の比較セット。提供者の性格ではなく、こちらが応答を決める。
  // C（離職検討）は転職交渉を実装していないので今回は使わない。
  const GUEST_CONDITIONS = {
    A: {
      id: "A", name: "任務優先",
      hint: "勤務中は飲まない。城下に寄っても仕事の顔のまま。",
      drinks: false,
      refuseLine: "……勤務中だ。すまない。"
    },
    B: {
      id: "B", name: "休憩中",
      hint: "安全と思った店で一杯だけ飲む。",
      drinks: true,
      acceptLine: "……一杯だけ。ここ、いい店だね。"
    }
  };

  // 酒の性質（設計 6.2）。「提供」共通処理だけでは決まらない、品物側の個別定義。
  const SAKE = {
    id: "sake", name: "新酒（試作）",
    // 酔いは今回の来訪・迎撃の間だけ残り、決着後に消える。速度低下として既存数値へ反映。
    effect: { spd: -4, minSpd: 1 },
    effectText: "酔い（速度-4、最低1）"
  };

  // ── 世界 ────────────────────────────────────
  function newWorld(options) {
    options = options || {};
    const seed = options.seed === undefined ? (Date.now() & 0xffff) + 1 : options.seed;
    const condition = GUEST_CONDITIONS[options.guestCondition] ? options.guestCondition : "B";
    const world = {
      seed,
      rng: makeRng(seed),
      guestCondition: condition,
      segment: 0,           // 0=準備 1=最初の勤務 2=城下での出来事 3=勇者到着 4=決着
      maxRoster: 5,
      persons: PERSONS.map(p => ({
        ...p,
        base: { ...p.base },
        resume: { ...p.resume },
        abilities: p.abilities.slice(),
        motives: p.motives.slice(),
        relations: (p.relations || []).slice(),
        assignment: p.hired ? (p.id === "gantz" ? "gate" : "guard") : null,
        // 魔王の裁量。既定は「試飲も任せる」。禁止すれば酒は在庫に残るだけ。
        serveOutsiders: true,
        alive: true,
        deployed: false
      })),
      stock: [],            // { itemId, qty, place, madeBy }
      facts: [],            // 起きたことの台帳。報告も戦闘接続もここからしか作らない
      reports: [],          // 区間ごとの報告（表示用）
      visitor: null,        // 城下に来た客。身元は最初は不明
      arrival: null,        // 勇者到着時に確定する情報
      battle: null,
      outcome: null
    };
    return world;
  }

  function person(world, id) { return world.persons.find(p => p.id === id) || null; }
  function hiredPersons(world) { return world.persons.filter(p => p.hired); }
  function placeOf(world, p) {
    if (!p.hired || !p.assignment) return null;
    return JOBS[p.assignment] ? JOBS[p.assignment].place : null;
  }
  function grants(world, p, key) {
    const job = p.assignment && JOBS[p.assignment];
    return !!(job && job.grants && job.grants[key]);
  }

  function fact(world, data) {
    const f = Object.assign({ seq: world.facts.length + 1, segment: world.segment }, data);
    world.facts.push(f);
    return f;
  }

  // ── 準備段階の操作 ─────────────────────────
  function hire(world, personId, jobId) {
    const p = person(world, personId);
    if (!p) return { ok: false, reason: "no_such_person" };
    if (p.hired) return { ok: false, reason: "already_hired" };
    if (hiredPersons(world).length >= world.maxRoster) return { ok: false, reason: "roster_full" };
    if (!JOBS[jobId]) return { ok: false, reason: "no_such_job" };
    if (JOBS[jobId].oneShot && world.segment !== 0) return { ok: false, reason: "prep_only" };
    p.hired = true;
    p.assignment = jobId;
    fact(world, { verb: "hire", actor: "maou", target: p.id, job: jobId });
    return { ok: true };
  }

  function assign(world, personId, jobId) {
    const p = person(world, personId);
    if (!p || !p.hired || !p.alive) return { ok: false, reason: "unavailable" };
    if (!JOBS[jobId]) return { ok: false, reason: "no_such_job" };
    if (JOBS[jobId].oneShot && world.segment !== 0) return { ok: false, reason: "prep_only" };
    // 仕事変更は「次の未解決の活動」から有効。済んだ勤務はやり直さない。
    p.assignment = jobId;
    fact(world, { verb: "assign", actor: "maou", target: p.id, job: jobId });
    return { ok: true };
  }

  function setServePolicy(world, personId, allowed) {
    const p = person(world, personId);
    if (!p) return { ok: false, reason: "unavailable" };
    p.serveOutsiders = !!allowed;
    fact(world, { verb: "policy", actor: "maou", target: p.id, serveOutsiders: !!allowed });
    return { ok: true };
  }

  // ── 戦闘ユニット ────────────────────────────
  function rankOf(p) {
    let found = RANKS[0];
    for (const r of RANKS) if (p.merit >= r.threshold) found = r;
    return found;
  }

  function statsOf(p) {
    // 昇進の boost は「累計」ではなく到達した階級ぶんを順に掛ける（既存と同じ考え方）。
    const s = { ...p.base };
    for (const r of RANKS) {
      if (!r.boost || p.merit < r.threshold) continue;
      s.hp = Math.round(s.hp * r.boost.hp);
      s.atk = Math.round(s.atk * r.boost.atk);
      s.def = s.def + (r.boost.def || 0);
    }
    return s;
  }

  function toUnit(p) {
    const s = statsOf(p);
    return {
      uid: p.id, name: p.name, race: p.race, tplId: p.tplId, icon: p.icon,
      job: p.job, rankId: rankOf(p).id,
      hp: s.hp, atk: s.atk, def: s.def, spd: s.spd,
      salary: p.salary, loyalty: 60, traits: [], tags: [],
      introQuote: p.introQuote || ""
    };
  }

  // 勇者側。酔いは facts から読む（人物名で分岐しない）。
  function heroUnits(world) {
    const drunkIds = new Set(
      world.facts
        .filter(f => f.verb === "consume" && f.itemId === "sake" && f.effect === "drunk")
        .map(f => f.target)
    );
    return HERO_PARTY.map(e => {
      const u = {
        uid: e.id, name: e.name, tplId: e.tplId, icon: e.icon, race: "人間",
        hp: e.hp, atk: e.atk, def: e.def, spd: e.spd,
        traits: (e.traits || []).slice(), tags: [], introQuote: e.introQuote || ""
      };
      if (drunkIds.has(e.id)) {
        u.spd = Math.max(SAKE.effect.minSpd, u.spd + SAKE.effect.spd);
        u.drunk = true;
      }
      return u;
    });
  }

  // ── 行動候補 ────────────────────────────────
  // 設計 5.2 の順で絞る:
  //   可能性（能力・設備・材料・接触）→ 命令（禁止に反しない）→ 動機 → 相手の応答 → 結果を残す
  function candidateActions(world, p, context) {
    const out = [];
    const place = placeOf(world, p);
    if (!p.hired || !p.alive || !place) return out;

    // 生産する：能力(brew)＋設備(仕事)＋勤務時間
    if (p.abilities.includes("brew") && grants(world, p, "facility_brewery")) {
      const made = world.facts.some(f => f.verb === "produce" && f.actor === p.id);
      if (!made) out.push({ verb: "produce", itemId: "sake", place });
    }

    // 提供する：物が同じ場所にあり、接触できる相手がいて、提供が許されていて、本人に理由がある
    if (context && context.guest && context.guest.place === place) {
      const stock = world.stock.find(s => s.itemId === "sake" && s.place === place && s.qty > 0);
      const already = world.facts.some(f =>
        f.verb === "offer" && f.actor === p.id && f.target === context.guest.id && f.itemId === "sake");
      if (stock && grants(world, p, "serve") && p.abilities.includes("serve")
          && p.motives.includes("taste_feedback") && p.serveOutsiders && !already) {
        out.push({ verb: "offer", itemId: "sake", target: context.guest.id, place });
      }
      // 店の担当だが酒がない／権限がない場合は、普通に店を開けているだけ。
      if (grants(world, p, "shop") && !out.some(a => a.verb === "offer")) {
        out.push({ verb: "shop", target: context.guest.id, place });
      }
    } else if (grants(world, p, "shop")) {
      out.push({ verb: "shop", place });
    }

    if (grants(world, p, "tidy")) out.push({ verb: "tidy", place });
    if (grants(world, p, "identify") && context && context.arriving) {
      out.push({ verb: "identify", target: context.arriving.id, place });
    }
    if (grants(world, p, "defend")) out.push({ verb: "defend", place });
    return out;
  }

  // 相手の応答。提供者ではなく相手側の条件で決める。
  function respondToOffer(world, guest, itemId) {
    const cond = GUEST_CONDITIONS[world.guestCondition];
    if (itemId !== "sake") return { accepted: false, line: "……いや、結構だ。" };
    return cond.drinks
      ? { accepted: true, line: cond.acceptLine }
      : { accepted: false, line: cond.refuseLine };
  }

  function applyAction(world, p, action) {
    const lines = [];
    if (action.verb === "produce") {
      const existing = world.stock.find(s => s.itemId === action.itemId && s.place === action.place);
      if (existing) existing.qty += 3; else world.stock.push({ itemId: "sake", qty: 3, place: action.place, madeBy: p.id });
      fact(world, { verb: "produce", actor: p.id, itemId: "sake", place: action.place });
      lines.push({ personId: p.id, text: `${p.name}が試作の新酒を一樽仕込んだ。` });
      return lines;
    }
    if (action.verb === "offer") {
      const guest = world.visitor;
      const stock = world.stock.find(s => s.itemId === "sake" && s.place === action.place && s.qty > 0);
      if (!guest || !stock) return lines;
      const res = respondToOffer(world, guest, "sake");
      fact(world, {
        verb: "offer", actor: p.id, itemId: "sake", target: guest.id,
        place: action.place, accepted: res.accepted, line: res.line
      });
      if (res.accepted) {
        stock.qty -= 1;
        guest.state.drunk = true;
        fact(world, { verb: "consume", actor: guest.id, itemId: "sake", target: guest.id, effect: "drunk", source: p.id });
        lines.push({ personId: p.id, text: `${p.name}が旅の方へ一杯すすめ、旅の方はそれを飲んだ。`, guestLine: res.line });
      } else {
        lines.push({ personId: p.id, text: `${p.name}が旅の方へ一杯すすめたが、断られた。`, guestLine: res.line });
      }
      return lines;
    }
    if (action.verb === "shop") {
      fact(world, { verb: "shop", actor: p.id, place: action.place });
      lines.push({ personId: p.id, text: action.target
        ? `${p.name}は普通に店を開け、旅の方の相手をした。`
        : `${p.name}は店を開けたが、客は来なかった。` });
      return lines;
    }
    if (action.verb === "tidy") {
      fact(world, { verb: "tidy", actor: p.id, place: action.place });
      lines.push({ personId: p.id, text: `${p.name}が城内の資材を片付けた。` });
      return lines;
    }
    if (action.verb === "identify") {
      const target = action.target;
      fact(world, { verb: "identify", actor: p.id, target, place: action.place });
      return lines;
    }
    if (action.verb === "defend") {
      fact(world, { verb: "defend", actor: p.id, place: action.place });
      lines.push({ personId: p.id, text: `${p.name}は持ち場を離れなかった。`, routine: true });
      return lines;
    }
    return lines;
  }

  function runActions(world, context) {
    const lines = [];
    for (const p of hiredPersons(world)) {
      if (!p.alive) continue;
      const actions = candidateActions(world, p, context);
      // 優先は「緊急の防衛 → 明示された目的（仕事） → 本人の好み」。
      // 同順位が並んだら seed 由来の抽選。名前順・表示順を隠れた優先度にしない。
      const order = { defend: 0, identify: 1, produce: 2, tidy: 2, offer: 3, shop: 4 };
      actions.sort((a, b) => (order[a.verb] ?? 9) - (order[b.verb] ?? 9) || (world.rng() - 0.5));
      for (const action of actions) lines.push(...applyAction(world, p, action));
    }
    return lines;
  }

  // ── 区間を進める ────────────────────────────
  // segment 1: 最初の勤務。生産・近郊警戒・片付け。勇者は城下に近づく。
  // segment 2: 城下での出来事。客が来て、店の担当者が応対する。
  // segment 3: 勇者到着。門で身元が分かる。
  function advance(world, battleRunner) {
    if (world.segment >= 3) return null;
    world.segment += 1;
    const report = { segment: world.segment, lines: [], patrol: null, headline: "", mormo: null };

    if (world.segment === 1) {
      report.headline = "最初の勤務報告";
      // 近郊警戒は最初の勤務のあいだに解決し、自動で帰還する（帰還操作を作らない）。
      const scouts = hiredPersons(world).filter(p => p.assignment === "patrol" && p.alive);
      if (scouts.length && battleRunner) {
        const units = scouts.map(toUnit);
        const result = battleRunner(units, PATROL_PARTY.map(e => ({ ...e, race: "人間", traits: [], tags: [] })));
        report.patrol = { victory: result.victory, contribution: result.contribution, timeline: result.timeline };
        for (const p of scouts) {
          const c = (result.contribution || []).find(x => x.uid === p.id);
          const survived = c ? c.survived : result.victory;
          if (!survived) {
            p.alive = false;
            fact(world, { verb: "died", actor: p.id, where: "patrol" });
            report.lines.push({ personId: p.id, text: `${p.name}は近郊警戒から帰らなかった。` });
            continue;
          }
          const before = rankOf(p);
          p.merit += result.victory ? 2 : 1;
          const after = rankOf(p);
          fact(world, { verb: "sortie", actor: p.id, victory: result.victory, merit: p.merit });
          if (after.id !== before.id) {
            fact(world, { verb: "promote", actor: p.id, rank: after.id });
            report.lines.push({
              personId: p.id, promoted: after.name,
              text: `${p.name}は近郊警戒から生還し、${after.name}になった。`
            });
          } else {
            report.lines.push({ personId: p.id, text: `${p.name}は近郊警戒から生還した（戦功${p.merit}）。` });
          }
          p.assignment = "guard";   // 一度きりの仕事。帰ったら守備へ戻る
        }
      }
      report.lines.push(...runActions(world, {}));
    }

    if (world.segment === 2) {
      report.headline = "城下での出来事";
      // 客が城下の店へ来る。この時点で身元は分からない（「旅の方」）。
      world.visitor = {
        id: "allen",                       // 内部の同一性。画面には出さない
        shownAs: "旅の方", place: "town",
        identityKnown: false, state: {}
      };
      fact(world, { verb: "arrive", actor: world.visitor.id, place: "town", asStranger: true });
      report.lines.push(...runActions(world, { guest: world.visitor }));
      if (!hiredPersons(world).some(p => placeOf(world, p) === "town")) {
        report.lines.push({ text: "城下に人を置いていないので、誰も客に会わなかった。", routine: true });
      }
    }

    if (world.segment === 3) {
      report.headline = "勇者到着";
      const gatekeepers = hiredPersons(world).filter(p => p.alive && grants(world, p, "identify"));
      const identified = gatekeepers.length > 0;
      runActions(world, { arriving: { id: "allen" } });
      world.arrival = {
        identified,
        identifiedBy: identified ? gatekeepers[0].id : null,
        // 「あの客が勇者だった」と言えるのは、
        // ①城下で接触した事実が facts にあり ②門で身元が分かった場合だけ。
        wasGuest: identified && world.facts.some(f => f.verb === "arrive" && f.actor === "allen" && f.asStranger)
      };
      if (world.visitor) world.visitor.identityKnown = identified;
      report.mormo = arrivalReport(world);
    }

    if (world.segment < 3) report.mormo = segmentAside(world, report);
    world.reports.push(report);
    return report;
  }

  // 区間報告に添えるモルモの一言。
  // 全画面の報告にはせず、この区間に**実際に起きた事実**の中で一番大きいものだけを言う。
  // 何も起きていない区間は「変わったことはありません」で終えてよい（毎人の承認を求めない）。
  function segmentAside(world, report) {
    const here = world.facts.filter(f => f.segment === world.segment);
    const died = here.find(f => f.verb === "died");
    if (died) return { expression: "panic", text: `${personName(world, died.actor)}殿が、帰りませんでした……` };
    const drank = here.find(f => f.verb === "consume" && f.effect === "drunk");
    // この時点では相手が誰かを知らない。だから「旅の方」としか言えない。
    if (drank) return { expression: "joy", text: "新酒、旅の方に好評デス！ 一杯だけ、と言いながら飲んでいましたヨ" };
    const refused = here.find(f => f.verb === "offer" && !f.accepted);
    if (refused) return { expression: "worried", text: "お酒はお断りされました。お仕事中だそうデス" };
    const promoted = here.find(f => f.verb === "promote");
    if (promoted) return { expression: "joy", text: `${personName(world, promoted.actor)}殿、生きて帰りました。小隊長デス！` };
    const made = here.find(f => f.verb === "produce");
    if (made) return { expression: "report", text: `${personName(world, made.actor)}殿が、さっそく一樽仕込みました` };
    return { expression: "report", text: "変わったことはありませんデス" };
  }

  // 勇者到着時の報告。facts にある事実だけから作る。無い話はしない。
  function arrivalReport(world) {
    const a = world.arrival || {};
    const offer = world.facts.find(f => f.verb === "offer" && f.target === "allen" && f.itemId === "sake");
    const drank = world.facts.some(f => f.verb === "consume" && f.target === "allen" && f.effect === "drunk");

    if (!a.identified) {
      return {
        expression: "panic",
        text: "魔王様、勇者一行が城門に着きました！ 門に誰もいないので、身元は……見た目でしか分かりませんデス！"
      };
    }
    if (drank) {
      return {
        expression: "panic",
        text: "魔王様、勇者です。先ほどまで、うちで飲んでいた方です",
        detail: offer ? `${personName(world, offer.actor)}が城下の店で一杯すすめ、この方が飲んだ。酔いは${SAKE.effectText}として残っている。` : "",
        emphasis: 3
      };
    }
    if (offer) {
      return {
        expression: "worried",
        text: "魔王様、勇者です。……先ほど、うちの店でお酒を断った方デス",
        detail: `${personName(world, offer.actor)}が一杯すすめたが、断られた。樽は残っている。`
      };
    }
    if (a.wasGuest) {
      return {
        expression: "report",
        text: "魔王様、勇者一行の到着デス。……この方、さっき城下を歩いていた方ですネ",
        detail: "城下に来ていたことは分かるが、店では何もしていない。"
      };
    }
    return { expression: "report", text: "魔王様、勇者一行が城門に着きました。迎撃のご指示を。" };
  }

  function personName(world, id) {
    const p = person(world, id);
    return p ? p.name : "どなたか";
  }

  // ── 迎撃 ────────────────────────────────────
  // 城内・城下の生存者はその場で迎撃隊に選べる（集合の一手を作らない）。
  function deployable(world) {
    return world.persons.filter(p => p.hired && p.alive && placeOf(world, p) !== "away");
  }

  function resolveInterception(world, squadIds, battleRunner) {
    const squad = squadIds.map(id => person(world, id)).filter(p => p && p.hired && p.alive);
    if (!squad.length) {
      // 空編成を隠さない。占領による敗北として処理する。
      world.outcome = { kind: "occupied", victory: false, squad: [] };
      fact(world, { verb: "interception", victory: false, empty: true });
      world.segment = 4;
      return world.outcome;
    }
    const result = battleRunner(squad.map(toUnit), heroUnits(world));
    for (const p of squad) {
      const c = (result.contribution || []).find(x => x.uid === p.id);
      if (c && !c.survived) {
        p.alive = false;
        fact(world, { verb: "died", actor: p.id, where: "interception" });
      }
    }
    world.battle = result;
    world.outcome = {
      kind: "battle", victory: result.victory, squad: squad.map(p => p.id),
      contribution: result.contribution
    };
    fact(world, { verb: "interception", victory: result.victory, squad: squad.map(p => p.id) });
    world.segment = 4;
    return world.outcome;
  }

  // 戦果の1文。該当しなければ出さない（見せ場を均等配分しない）。
  function outcomeSentences(world) {
    const out = [];
    const c = (world.battle && world.battle.contribution) || [];
    const heroHits = ((world.battle && world.battle.timeline) || [])
      .filter(e => e.type === "attack" && e.fromId && e.dmg > 0);
    const allenUnit = ((world.battle && world.battle.timeline) || [])
      .find(e => e.type === "battle_start");
    const allenId = allenUnit ? (allenUnit.enemy.find(u => u.uid === "allen") || {}).id : null;
    if (allenId) {
      const takes = heroHits.filter(e => e.fromId === allenId);
      const byTarget = {};
      for (const e of takes) byTarget[e.toId] = (byTarget[e.toId] || 0) + 1;
      const top = Object.entries(byTarget).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const who = c.find(x => x.id === top[0]);
        if (who && who.survived) out.push(`${who.name}はアレンの攻撃を${top[1]}度受けて生還。`);
      }
    }
    const finisher = c.find(x => x.kills > 0 && x.dealt === Math.max(...c.map(y => y.dealt)));
    if (finisher) out.push(`${finisher.name}が最も多く削った。`);
    const fallen = c.filter(x => !x.survived);
    if (fallen.length) out.push(`${fallen.map(x => x.name).join("、")}は帰らなかった。`);
    // 敗北は「あと何が足りなかったか」が読めるところまで出す（助言はしない）。
    if (world.outcome && !world.outcome.victory && world.battle && world.battle.nearMiss) {
      const nm = world.battle.nearMiss;
      out.push(`勇者一行はHPを${nm.enemyMaxHp - nm.closestRemaining}まで削られ、${nm.closestRemaining}を残して城へ入った。`);
    }
    // 酔いの事実は戦果とは別に、原因として1文だけ残す。
    const drank = world.facts.find(f => f.verb === "consume" && f.target === "allen" && f.effect === "drunk");
    if (drank) out.push(`アレンは城下で${personName(world, drank.source)}の酒を飲んでおり、この迎撃の間だけ速度が落ちていた。`);
    return out;
  }

  const api = {
    PLACES, JOBS, PERSONS, RANKS, HERO_PARTY, PATROL_PARTY, GUEST_CONDITIONS, SAKE,
    makeRng, newWorld, person, hiredPersons, placeOf, grants, rankOf, statsOf,
    toUnit, heroUnits, hire, assign, setServePolicy, candidateActions, advance,
    arrivalReport, deployable, resolveInterception, outcomeSentences
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HeroArrivalWorld = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
