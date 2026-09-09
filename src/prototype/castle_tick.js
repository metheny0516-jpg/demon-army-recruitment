// 魔王城 tick エンジン（検証用・画面なし）
//
// 目的はただひとつ。**「世界が勝手に回っている」が本当に成立するかを、
// 手書きの筋書きではなく生成されたログで確かめること。**
//
// なぜ手書きではないか：設計書 v0.2 の「六つの具体進行」は読むと面白かったが、
// 実装したら死んでいた。書き手が良い瞬間だけを選ぶからである。
// ここでは規則だけを書き、出来事は選ばない。ログは編集せずそのまま読む。
//
// ── 守っている約束 ───────────────────────────────────
// 1. 個別の筋書きを書かない。「逃げたゴブリンが食堂でオーク隊長に会って出撃する」は
//    専用コードではなく、〈逃走〉〈同室の者へ話す〉〈義侠は仲間の危機へ向かう〉
//    という汎用規則の積み重ねからしか起こしてはいけない。
// 2. 人物名で分岐しない。効くのは所在・特性・知識・命令・体力だけ。
// 3. 起きたことには必ず原因（cause）を残す。あとから因果を辿れないものは出さない。
// 4. 知らないことには反応できない。情報は接触でしか伝わらない。
//
// 1 tick ＝ 体感5秒くらいのつもり。5分＝60 tick を目安にする。

(function (root) {
  "use strict";

  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    s = Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    s = (s ^ (s >>> 13)) >>> 0;
    s = Math.imul(s, 0xc2b2ae35) >>> 0;
    s = (s ^ (s >>> 16)) >>> 0 || 1;
    const next = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 16; i++) next();
    return next;
  }

  // ── 城 ──────────────────────────────────────
  // 一本道にしない。勇者が選ぶ余地と、逃げ場と、迂回路を持たせる。
  const ROOMS = {
    outside:  { id: "outside",  name: "城外",   links: ["gate"] },
    gate:     { id: "gate",     name: "城門",   links: ["outside", "hall", "yard"] },
    yard:     { id: "yard",     name: "中庭",   links: ["gate", "kitchen", "hall"] },
    hall:     { id: "hall",     name: "大広間", links: ["gate", "yard", "kitchen", "lab", "dungeon", "throne"] },
    kitchen:  { id: "kitchen",  name: "食堂",   links: ["yard", "hall"] },
    lab:      { id: "lab",      name: "研究室", links: ["hall", "furnace"] },
    furnace:  { id: "furnace",  name: "魔力炉", links: ["lab"] },
    dungeon:  { id: "dungeon",  name: "地下牢", links: ["hall"] },
    throne:   { id: "throne",   name: "玉座",   links: ["hall"] }
  };

  // 最短経路。勇者の進軍と、駆けつけに使う。
  function path(from, to, sealed) {
    if (from === to) return [];
    const blocked = new Set(sealed || []);
    const prev = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      for (const nxt of ROOMS[cur].links) {
        if (blocked.has([cur, nxt].sort().join("-"))) continue;
        if (nxt in prev) continue;
        prev[nxt] = cur;
        if (nxt === to) {
          const route = [];
          let c = to;
          while (c !== from) { route.unshift(c); c = prev[c]; }
          return route;
        }
        queue.push(nxt);
      }
    }
    return [];
  }

  // ── 特性 ────────────────────────────────────
  // 効果はすべて「どの規則が自分に適用されるか」でしかない。名前では分岐しない。
  const TRAITS = {
    brave:    { name: "剛胆",   desc: "劣勢でも逃げにくい" },
    coward:   { name: "臆病",   desc: "深手を負うと逃げる" },
    loyalfoe: { name: "義侠",   desc: "仲間がやられたと知ると、命令より現場を優先する" },
    lazy:     { name: "怠惰",   desc: "持ち場を離れたがらない。伝令も遅い" },
    curious:  { name: "好奇心", desc: "知らない出来事を聞くと、見に行く" },
    dutiful:  { name: "職務忠実", desc: "命令の範囲を守る" },
    drunk:    { name: "酒好き", desc: "食堂にいると腰が重い" }
  };

  // ── 出来事の型 ───────────────────────────────
  // knowledge に入るのはこの型。人物はこれを見て反応する。
  //   intrusion  侵入者がいる           { room, who }
  //   defeat     味方がやられた         { room, who, by }
  //   escape     逃げた                 { room, who, to }
  //   noise      よく分からない物音     { room }

  function makeWorld(options) {
    options = options || {};
    const rng = makeRng(options.seed === undefined ? 1 : options.seed);
    const agents = [];
    let nextId = 1;

    const add = (spec) => {
      const a = Object.assign({
        id: "a" + nextId++,
        side: "demon",
        hp: 20, maxHp: 20, atk: 5, def: 1,
        traits: [],
        room: "hall",
        post: null,          // 持ち場。命令で決まる
        order: "hold",       // hold=持ち場を守る / free=任せる
        goal: null,          // { kind, room, cause }
        knows: [],           // 知っている出来事
        alive: true,
        busyUntil: 0
      }, spec);
      a.maxHp = a.hp;
      a.post = a.post || a.room;
      agents.push(a);
      return a;
    };

    return {
      seed: options.seed === undefined ? 1 : options.seed,
      rng, tick: 0, agents, add,
      events: [],           // 起きたことの台帳（原因つき）
      log: [],              // 読むための行
      pending: [],          // プレイヤーが介入できる瞬間
      over: null
    };
  }

  function at(world, room) { return world.agents.filter(a => a.alive && a.room === room); }
  function enemiesOf(world, a) { return at(world, a.room).filter(b => b.side !== a.side); }
  function alliesOf(world, a) { return at(world, a.room).filter(b => b.side === a.side && b !== a); }
  const has = (a, t) => a.traits.includes(t);

  function record(world, type, data, cause) {
    const ev = Object.assign({ id: "e" + (world.events.length + 1), tick: world.tick, type, cause: cause || null }, data);
    world.events.push(ev);
    return ev;
  }

  function say(world, room, text, ev) {
    world.log.push({ tick: world.tick, room, text, cause: ev ? ev.cause : null, evId: ev ? ev.id : null });
  }

  // 知識は接触でしか伝わらない。同じ部屋にいる者へだけ渡る。
  function learn(world, agent, ev) {
    if (agent.knows.some(k => k.id === ev.id)) return false;
    agent.knows.push(ev);
    return true;
  }

  // 部屋をまたいで情報が動くときだけ意味がある。
  // 同室の者は同時に見ているので、伝え合わせない（最初の生ログで12行の重複が出た）。
  // 1 tick に1件だけ、まだ誰も知らないことを1行で伝える。
  function spread(world, agent) {
    if (has(agent, "lazy") && world.rng() < 0.5) return;   // 怠惰は伝令が遅い
    const listeners = alliesOf(world, agent);
    if (!listeners.length) return;
    for (const ev of agent.knows) {
      // その部屋で起きたことを、その部屋の者へ伝えても意味がない
      if (ev.room === agent.room) continue;
      const fresh = listeners.filter(o => !o.knows.some(k => k.id === ev.id));
      if (!fresh.length) continue;
      for (const o of fresh) learn(world, o, ev);
      say(world, agent.room,
        `${agent.name}が${fresh.length === 1 ? fresh[0].name : `その場の${fresh.length}名`}に「${describe(ev)}」と伝えた`, ev);
      return;   // 1 tick に1件だけ
    }
  }

  function describe(ev) {
    switch (ev.type) {
      case "intrusion": return `${ROOMS[ev.room].name}に侵入者`;
      case "defeat": return `${ev.whoName}が${ROOMS[ev.room].name}でやられた`;
      case "escape": return `${ev.whoName}が${ROOMS[ev.room].name}から逃げた`;
      case "noise": return `${ROOMS[ev.room].name}で物音`;
      default: return ev.type;
    }
  }

  // ── 反応規則 ────────────────────────────────
  // 「誰が」ではなく「どういう者が、何を知ったら、何をしたくなるか」だけを書く。
  // ここに個別の人物名や個別の事件名を書いてはいけない。
  const REACTIONS = [
    {
      id: "rush_to_fallen",
      // 仲間がやられたと知った義侠は、命令より現場を優先する
      when: (w, a, ev) => ev.type === "defeat" && has(a, "loyalfoe") && ev.side === a.side,
      goal: (w, a, ev) => ({ kind: "engage", room: ev.room, cause: ev.id }),
      line: (a, ev) => `${a.name}「${ev.whoName}がやられただと」`
    },
    {
      id: "rush_to_fight",
      // 義侠は「やられた」まで待たない。仲間が戦っていると知れば向かう。
      // 最初の生ログでは、逃げてきたゴブリンから侵入を聞いたのに動かなかった。
      when: (w, a, ev) => (ev.type === "intrusion" || ev.type === "escape") && has(a, "loyalfoe"),
      goal: (w, a, ev) => ({ kind: "engage", room: ev.room, cause: ev.id }),
      line: (a, ev) => `${a.name}「${ROOMS[ev.room].name}か。行くぞ」`
    },
    {
      id: "stand_in_the_way",
      // 剛胆な者は、侵入を知れば迎え撃つ側へ回る（命令があれば従う）
      when: (w, a, ev) => ev.type === "intrusion" && has(a, "brave") && a.order === "free",
      goal: (w, a, ev) => ({ kind: "engage", room: ev.room, cause: ev.id }),
      line: (a, ev) => `${a.name}「${ROOMS[ev.room].name}だな」`
    },
    {
      id: "hide_from_trouble",
      // 臆病な非戦闘員は、侵入を知ると奥へ下がる。全員が向かうわけではない。
      when: (w, a, ev) => ev.type === "intrusion" && has(a, "coward") && !has(a, "brave")
        && a.role !== "herald" && a.room !== ev.room,
      goal: (w, a, ev) => ({ kind: "hide", room: "throne", cause: ev.id }),
      line: (a, ev) => `${a.name}「こっちに来ませんように……」`
    },
    {
      id: "answer_intrusion",
      // 職務忠実な者は、自分の持ち場が侵されたと知れば向かう
      when: (w, a, ev) => ev.type === "intrusion" && has(a, "dutiful") && ev.room === a.post,
      goal: (w, a, ev) => ({ kind: "engage", room: ev.room, cause: ev.id }),
      line: (a, ev) => `${a.name}「持ち場です。行きます」`
    },
    {
      id: "go_look",
      // 好奇心は、よく分からないものを見に行く
      when: (w, a, ev) => ev.type === "noise" && has(a, "curious"),
      goal: (w, a, ev) => ({ kind: "look", room: ev.room, cause: ev.id }),
      line: (a, ev) => `${a.name}「なんの音だ？」`
    },
    {
      id: "report_up",
      // 伝令役は、知ったことを玉座へ届けようとする
      when: (w, a, ev) => a.role === "herald" && (ev.type === "intrusion" || ev.type === "defeat"),
      goal: (w, a, ev) => ({ kind: "report", room: "throne", cause: ev.id }),
      line: (a, ev) => `${a.name}「魔王様にお知らせしないと……！」`
    }
  ];

  function react(world, agent, ev) {
    agent.actedOn = agent.actedOn || {};
    for (const rule of REACTIONS) {
      if (agent.actedOn[ev.id + rule.id]) continue;   // 同じ件に二度は動かない
      if (!rule.when(world, agent, ev)) continue;
      const goal = rule.goal(world, agent, ev);
      // 命令が優先されるかどうか。義侠だけが命令を越えられる。
      const overrides = rule.id === "rush_to_fallen";
      if (agent.order === "hold" && !overrides) continue;
      if (agent.goal && agent.goal.kind === goal.kind && agent.goal.room === goal.room) continue;
      agent.actedOn[ev.id + rule.id] = true;
      agent.goal = goal;
      say(world, agent.room, rule.line(agent, ev), ev);
      record(world, "decide", { who: agent.id, whoName: agent.name, rule: rule.id, room: goal.room }, ev.id);
      return true;
    }
    return false;
  }

  // ── 行動 ────────────────────────────────────
  function step(world) {
    world.tick += 1;

    // 1. 侵入者を見つける。目撃は部屋ごとに1回で、その場の味方は同時に知る。
    for (const room of Object.keys(ROOMS)) {
      const here = at(world, room);
      const foes = here.filter(x => x.side === "hero");
      const ours = here.filter(x => x.side === "demon");
      if (!foes.length || !ours.length) continue;
      if (ours.every(a => a.knows.some(k => k.type === "intrusion" && k.room === room))) continue;
      const ev = record(world, "intrusion", { room, who: foes[0].id, whoName: foes[0].name, count: foes.length });
      for (const a of ours) learn(world, a, ev);
      say(world, room,
        `${ours.map(a => a.name).join("と")}が${foes.map(f => f.name).join("・")}を見つけた`, ev);
    }

    // 1.5 叫び。自分の部屋の異変は、隣の部屋までは声が届く。
    //     これが無いと城の奥は最後まで何も知らないままだった（生ログで判明）。
    for (const a of world.agents) {
      if (!a.alive || a.side !== "demon") continue;
      const here = a.knows.find(k => k.type === "intrusion" && k.room === a.room && k.tick === world.tick);
      if (!here || a.shouted === here.id) continue;
      a.shouted = here.id;
      const heard = [];
      for (const nb of ROOMS[a.room].links) {
        for (const o of at(world, nb)) {
          if (o.side !== "demon") continue;
          if (learn(world, o, here)) heard.push(o.name);
        }
      }
      if (heard.length) say(world, a.room, `${a.name}が声を上げた（${heard.join("・")}に届いた）`, here);
    }

    // 2. 知ったことに反応する（知らないことには反応できない）
    for (const a of world.agents) {
      if (!a.alive) continue;
      // 新しいものから順に見て、1 tick に反応するのは1件まで。
      for (const ev of a.knows.slice(-6).reverse()) if (react(world, a, ev)) break;
    }

    // 3. 話す（接触でしか情報は動かない）
    for (const a of world.agents) if (a.alive && a.side === "demon") spread(world, a);

    // 4. 戦う／動く
    for (const a of world.agents) {
      if (!a.alive) continue;
      const foes = enemiesOf(world, a);
      if (foes.length) { doFight(world, a, foes); continue; }
      doMove(world, a);
    }

    // 4.5 その tick の打ち合いを部屋ごとに1行へまとめる
    if (world.blows && world.blows.length) {
      const byRoom = {};
      for (const b of world.blows) (byRoom[b.room] = byRoom[b.room] || []).push(b.text);
      for (const [room, texts] of Object.entries(byRoom)) {
        const hp = at(world, room).map(x => `${x.name} ${Math.max(0, x.hp)}`).join(" / ");
        world.log.push({ tick: world.tick, room, text: `打ち合い: ${texts.join("、")}`, cause: null });
        world.log.push({ tick: world.tick, room, text: `　残り: ${hp}`, cause: null });
      }
      world.blows = [];
    }

    // 5. 決着判定
    const heroesInThrone = at(world, "throne").filter(a => a.side === "hero");
    if (heroesInThrone.length) world.over = { kind: "throne_reached", tick: world.tick };
    if (!world.agents.some(a => a.alive && a.side === "hero")) world.over = { kind: "repelled", tick: world.tick };
  }

  function doFight(world, a, foes) {
    // 非戦闘員は殴り合わない。逃げ道があれば必ず下がる。
    if (a.noncombat) {
      const away = ROOMS[a.room].links.filter(r => r !== "outside" && !at(world, r).some(x => x.side !== a.side));
      if (away.length) {
        const to = away[Math.floor(world.rng() * away.length)];
        say(world, a.room, `${a.name}は戦わずに${ROOMS[to].name}へ退いた`);
        a.room = to;
        a.shakenUntil = world.tick + 6;
        return;
      }
    }
    // 深手を負った臆病者は逃げる。剛胆は逃げない。
    if (a.hp <= a.maxHp * 0.35 && has(a, "coward") && !has(a, "brave")) {
      const away = ROOMS[a.room].links.filter(r => r !== "outside" && !at(world, r).some(x => x.side !== a.side));
      if (away.length) {
        const to = away[Math.floor(world.rng() * away.length)];
        const ev = record(world, "escape", { room: a.room, who: a.id, whoName: a.name, to });
        learn(world, a, ev);
        say(world, a.room, `${a.name}は深手を負い、${ROOMS[to].name}へ逃げた`, ev);
        a.room = to;
        a.goal = null;
        // 怯えている間は持ち場へ戻らない。ここを入れないと次の tick で戦場へ歩いて帰る。
        a.shakenUntil = world.tick + 10;
        return;
      }
    }
    const target = foes[Math.floor(world.rng() * foes.length)];
    const dmg = Math.max(1, Math.round((a.atk - target.def) * (0.7 + world.rng() * 0.6)));
    target.hp -= dmg;
    // 打撃1行ずつは読めなかったので、その tick のその部屋ぶんをまとめて出す
    world.blows = world.blows || [];
    world.blows.push({ room: a.room, text: `${a.name}→${target.name} ${dmg}` });
    if (target.hp <= 0) {
      target.alive = false;
      const ev = record(world, "defeat", { room: a.room, who: target.id, whoName: target.name, side: target.side, by: a.id, byName: a.name });
      say(world, a.room, `★ ${target.name}、倒れる（${a.name}）`, ev);
      for (const w of at(world, a.room)) learn(world, w, ev);
    }
  }

  function doMove(world, a) {
    // 勇者側は玉座を目指して進む
    if (a.side === "hero") {
      // 部屋を抜けるのに手間取る。城は廊下ではない。
      a.linger = (a.linger || 0) + 1;
      const fought = world.events.some(e => e.type === "defeat" && e.room === a.room && e.tick >= world.tick - 2);
      const need = fought ? 3 : 2;      // 戦った部屋では息を整える
      if (a.linger < need) {
        if (a.linger === 1) say(world, a.room, `${a.name}は${ROOMS[a.room].name}を検分している`);
        return;
      }
      a.linger = 0;
      const route = path(a.room, "throne", world.sealed);
      if (route.length) {
        const to = route[0];
        say(world, a.room, `${a.name}が${ROOMS[to].name}へ進む`);
        a.room = to;
      }
      return;
    }
    // 目的があれば向かう
    if (a.goal) {
      if (a.room === a.goal.room) {
        if (a.goal.kind === "report") {
          const src = world.events.find(e => e.id === a.goal.cause);
          const ev = record(world, "reported", { room: a.room, who: a.id, whoName: a.name }, a.goal.cause);
          say(world, a.room, `【報告】${a.name}「魔王様、${src ? describe(src) : "異変"}です！」`, ev);
          world.pending.push({ tick: world.tick, about: a.goal.cause, text: src ? describe(src) : "異変" });
          a.goal = null;
        } else if (a.goal.kind === "look") {
          say(world, a.room, `${a.name}は${ROOMS[a.room].name}へ来てみたが、もう何もなかった`);
          a.goal = null;
        } else if (a.goal.kind === "hide") {
          a.goal = null;
        }
        return;
      }
      // 怠惰は腰が重い。ただし魔王直々の命令なら別。
      if (!a.commanded && has(a, "lazy") && world.rng() < 0.5) return;
      if (!a.commanded && has(a, "drunk") && a.room === "kitchen" && world.rng() < 0.4) {
        say(world, a.room, `${a.name}はまだ杯を置かない`);
        return;
      }
      const route = path(a.room, a.goal.room, world.sealed);
      if (route.length) {
        const to = route[0];
        say(world, a.room, `${a.name}が${ROOMS[to].name}へ向かう`, { id: null, cause: a.goal.cause });
        world.log[world.log.length - 1].cause = a.goal.cause;
        a.room = to;
      }
      return;
    }
    // 怯えている間は持ち場へ戻らない。敵の気配がある部屋からは、さらに下がる。
    if (a.shakenUntil && world.tick < a.shakenUntil) {
      const danger = ROOMS[a.room].links.some(r => at(world, r).some(x => x.side !== a.side));
      if (danger) {
        const safe = ROOMS[a.room].links.filter(r =>
          r !== "outside" && !at(world, r).some(x => x.side !== a.side)
          && !ROOMS[r].links.some(rr => at(world, rr).some(x => x.side !== a.side)));
        if (safe.length) {
          const to = safe[Math.floor(world.rng() * safe.length)];
          say(world, a.room, `${a.name}はさらに${ROOMS[to].name}へ下がった`);
          a.room = to;
        }
      }
      return;
    }

    // 目的がなければ持ち場へ戻る
    if (a.room !== a.post) {
      const route = path(a.room, a.post, world.sealed);
      if (route.length) { a.room = route[0]; }
    }
  }

  // ── 魔王の介入 ──────────────────────────────
  // 生ログで分かったこと：介入が無いと、世界は動いていても毎回同じ順に動く。
  // 20本のうち12本で因果の並びが完全に一致した。観察だけでは映画になる。
  // ここは「盤面が勝手に動く」ことと「プレイヤーがいる意味」を分ける要。
  const ORDERS = {
    // 増援。指定した者を指定の部屋へ向かわせる。命令なので怠惰も酔いも越える。
    send: (world, opt) => {
      const a = world.agents.find(x => x.alive && x.id === opt.who);
      if (!a || a.side !== "demon") return false;
      a.goal = { kind: "engage", room: opt.room, cause: "order" };
      a.commanded = true;
      say(world, a.room, `【命令】${a.name}へ、${ROOMS[opt.room].name}へ向かえ`);
      record(world, "order", { kind: "send", who: a.id, whoName: a.name, room: opt.room });
      return true;
    },
    // 下がらせる。捨てる判断。
    pull: (world, opt) => {
      const a = world.agents.find(x => x.alive && x.id === opt.who);
      if (!a || a.side !== "demon") return false;
      a.goal = { kind: "hide", room: opt.room, cause: "order" };
      a.commanded = true;
      a.shakenUntil = 0;
      say(world, a.room, `【命令】${a.name}へ、${ROOMS[opt.room].name}まで下がれ`);
      record(world, "order", { kind: "pull", who: a.id, whoName: a.name, room: opt.room });
      return true;
    },
    // 扉を閉ざす。勇者の経路をひとつ潰す。開け直しはできない。
    seal: (world, opt) => {
      world.sealed = world.sealed || [];
      const key = [opt.from, opt.to].sort().join("-");
      if (world.sealed.includes(key)) return false;
      world.sealed.push(key);
      say(world, opt.from, `【命令】${ROOMS[opt.from].name}と${ROOMS[opt.to].name}の扉を閉ざした`);
      record(world, "order", { kind: "seal", from: opt.from, to: opt.to });
      return true;
    }
  };

  function intervene(world, order) {
    const fn = ORDERS[order.kind];
    return fn ? fn(world, order) : false;
  }

  const api = { ROOMS, TRAITS, REACTIONS, ORDERS, path, makeRng, makeWorld, step, at, describe, record, learn, intervene };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CastleTick = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
