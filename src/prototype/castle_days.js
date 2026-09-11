// 魔王城の10日間 ── 「変な奴を3人雇った10日間は、本当に面白いのか？」を試す試作
//
// 判定はオーナーが遊んで決める。三つだけ。
//   「お前何やってんだよ（笑）」が一回出たか
//   「次こいつ何するんだろ」が出たか
//   「次の日ボタンを押してる」という感覚が消えたか
// 勝率もバランスも測らない。今回は雑でいい。
//
// ── 自分に課した縛り ─────────────────────────────
// 1. 人物に持たせるのは特性だけ。台詞と結果は状況から組む。
//    「グドの成長促進餌イベント」のような人物ごとの脚本は一行も書かない。
//    書くのは experimenter（任されたものを勝手に改造する）という特性で、
//    グドがそれを持ち、牧場に置かれたから餌が変わる。厨房なら料理が変わる。
//    3人目で読まれない唯一の方法は、役割（原因／乱入／便乗／傍観）を計算で決めること。
// 2. 割り込みは「行動」の中に落とす。「次の日」ボタンも事件ガチャも作らない。
//    行動を選ぶ → 始まる → 世界が反応する（かもしれない）→ 完了か脱線 → 夜。
// 3. 小さいことは朝の一行に流す。状態が変わったときだけモルモが割り込む。
//    「ガロ殿は昨日も食堂におられました」——この静かな反復が笑いの半分だと思っている。
//
// 事件の原因を毎回採用に紐づけない（ChatGPT の指摘）。
// スライムは牧場の排水から魔力が漏れて自然に増える。雇った奴は原因を加速することも、
// 首を突っ込むことも、食べることも、何もしないこともある。誰が何をしたかは特性×配置で決まる。

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

  // ── 場所 ────────────────────────────────────
  const PLACES = {
    pasture: { id: "pasture", name: "スライム牧場", job: "飼育" },
    kitchen: { id: "kitchen", name: "食堂",       job: "厨房" },
    lab:     { id: "lab",     name: "研究室",     job: "研究" },
    gate:    { id: "gate",    name: "城門",       job: "警備" },
    idle:    { id: "idle",    name: "待機",       job: "待機" }
  };

  // ── 特性 ────────────────────────────────────
  // ここが人物性の全部。人物名はどこにも出てこない。
  // 各フックは「衝動」を返す。エンジンがそれを事実にする。
  const TRAITS = {
    drunk: {
      name: "酒好き", desc: "食堂に居つく。命令に遅れる",
      daily(w, p) {
        if (p.place === "kitchen") return { verb: "linger", line: `${p.name}殿は今日も食堂におられました`, quiet: true };
        if (w.rng() < 0.35) return { verb: "wander", to: "kitchen", line: `${p.name}殿が持ち場を離れて食堂へ`, quiet: true };
        return null;
      },
      onOrder(w, p) {
        if (w.rng() < 0.5) return { verb: "delay", line: `${p.name}「……あとでな」` };
        return null;
      }
    },
    glutton: {
      name: "大食い", desc: "食べられそうなものは食べる",
      incident(w, p, inc) {
        if (inc.id !== "slime" || inc.count < 20) return null;
        if (p.place !== "pasture" && p.place !== "kitchen") return null;
        if (p.ateOn === w.day) return null;
        p.ateOn = w.day;
        const first = !p.ateEver; p.ateEver = true;
        return first
          ? { verb: "eat", amount: 6 + Math.floor(w.rng() * 8), line: `${p.name}「……意外とうまいぞ、これ」`, unlock: "slime_edible" }
          : { verb: "eat", amount: 6 + Math.floor(w.rng() * 8), line: `${p.name}殿が、また牧場で何か食べています`, quiet: true };
      }
    },
    experimenter: {
      name: "改造癖", desc: "任されたものを勝手に良くしようとする",
      assigned(w, p, place) {
        if (place === "pasture") return { verb: "alter", what: "feed", line: `${p.name}「餌を改良しました。愛情の配合です」`, quiet: true };
        if (place === "kitchen") return { verb: "alter", what: "menu", line: `${p.name}「献立を見直しました」`, quiet: true };
        if (place === "lab") return { verb: "alter", what: "furnace", line: `${p.name}「炉の出力を上げておきました」`, quiet: true };
        return null;
      }
    },
    meddler: {
      name: "首を突っ込む", desc: "他人の事件を放っておけない",
      incident(w, p, inc) {
        if (inc.id !== "slime" || inc.count < 40 || p.tookSample) return null;
        p.tookSample = w.day;
        return { verb: "sample", line: `${p.name}「興味深い。少し分けてもらった」`, seed: "sample" };
      }
    },
    coward: {
      name: "臆病", desc: "騒ぎがあると隠れる",
      incident(w, p, inc) {
        if (inc.count < 60 || p.hid === w.day) return null;
        p.hid = w.day;
        return { verb: "hide", line: `${p.name}殿は${PLACES[p.place].name}の隅で震えています`, quiet: true, noFight: true };
      }
    },
    brave: {
      name: "剛胆", desc: "騒ぎがあると勝手に出る",
      battle(w, p) { return { verb: "volunteer", line: `${p.name}「俺も行く」` }; }
    },
    diligent: {
      name: "真面目", desc: "持ち場をきちんと見ている",
      daily(w, p) {
        if (p.place === "pasture" && w.facilities.pasture.slimes > 30 && w.day % 2 === 0)
          return { verb: "cull", amount: 0.08, line: `${p.name}殿が牧場の間引きをしていますが、追いついていません`, quiet: true };
        return null;
      },
      inspect(w, p, place) {
        if (place !== "pasture") return null;
        const f = w.facilities.pasture;
        if (f.drain === "sealed") return { reveal: [], line: `${p.name}「光、消えましたね。……減ってます」` };
        if (w.known.drain) return { reveal: [], line: `${p.name}「排水口、まだ光ってます。増えるのと関係ありますかね」` };
        const reveal = ["drain"]; if (f.feed === "boosted") reveal.push("feed");
        return { reveal, line: `${p.name}「排水口のあたり、妙に光っています${f.feed === "boosted" ? "。餌も、私が変えました" : ""}」` };
      }
    },
    chatty: {
      name: "おしゃべり", desc: "話しかけると他人のことを喋る",
      talk(w, p) {
        const other = w.staff.find(o => o !== p && o.hidden && !o.hidden.known);
        if (!other) return null;
        return { verb: "gossip", about: other.id, line: `${p.name}「${other.name}殿ですか？ あの人、${other.hidden.hint}」` };
      }
    }
  };
  const has = (p, t) => p.traits.includes(t);

  // ── 人物 ────────────────────────────────────
  // 応募者。癖が強いのを揃える。hidden は「雇ってから分かること」で、特性の一つを隠す。
  const APPLICANTS = [
    { id: "gudo", name: "グド", race: "ゾンビ", tplId: "zombie", icon: "🧟", hp: 60, atk: 9, def: 5,
      job: "飼育係", resume: { prev: "魔獣飼育歴15年（前職：解雇）", wish: "スライムは愛情をかければ応えてくれます！", note: "独自の栄養理論あり" },
      traits: ["diligent"], hidden: { trait: "experimenter", hint: "前の職場でも餌を勝手に変えて怒られたそうですよ" } },
    { id: "garo", name: "ガロ", race: "オーク", tplId: "orc", icon: "🐗", hp: 90, atk: 18, def: 8,
      job: "古参戦士", resume: { prev: "最前列。十九年。", wish: "飯と酒があれば文句はない", note: "傷は数えていない" },
      traits: ["brave", "drunk"], hidden: { trait: "glutton", hint: "食えるかどうかを、まず食って確かめる人です" } },
    { id: "vira", name: "ヴィラ", race: "死霊術師", tplId: "necromancer", icon: "🪄", hp: 44, atk: 14, def: 3,
      job: "研究員", resume: { prev: "墓地管理", wish: "静かな職場を希望します", note: "写りだけは、やたらといい" },
      traits: ["chatty"], hidden: { trait: "meddler", hint: "静かな職場と言いながら、他所の騒ぎに真っ先に来ます" } },
    { id: "pipi", name: "ピピ", race: "インプ", tplId: "imp", icon: "😈", hp: 36, atk: 10, def: 2,
      job: "見習い", resume: { prev: "特にありません", wish: "安全なところがいいです", note: "速いです。それだけです" },
      traits: ["coward"], hidden: { trait: "chatty", hint: "口が軽いです。悪気はないんですが" } },
    { id: "neru", name: "ネル", race: "スライム", tplId: "slime", icon: "🟢", hp: 80, atk: 7, def: 9,
      job: "雑用", resume: { prev: "貯水槽の底", wish: "ぶたれても、だいじょうぶ", note: "刃物が効きにくい体です" },
      traits: ["diligent"], hidden: { trait: "brave", hint: "見た目に反して、逃げないタイプです" } }
  ];

  // ── 世界 ────────────────────────────────────
  function newRun(options) {
    options = options || {};
    const seed = options.seed === undefined ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : options.seed;
    return {
      seed, rng: makeRng(seed),
      day: 1, maxDays: 10, phase: "morning",
      staff: [],
      applicants: APPLICANTS.map(a => ({ ...a, traits: a.traits.slice(), resume: { ...a.resume }, hidden: { ...a.hidden, known: false } })),
      facilities: {
        pasture: { slimes: 4, feed: "normal", drain: "leaking" },   // 排水は最初から漏れている。自然現象。
        lab: { furnace: "normal" },
        kitchen: { menu: "normal" }
      },
      known: {},          // プレイヤーが知っていること（drain / feed / slime_edible / regen）
      facts: [],          // 台帳。全部に cause
      digest: [],         // 今朝モルモが読み上げる一行たち
      pending: [],        // 割り込み（全画面）
      incident: null,     // { id:"slime", since, count }
      seeds: [],          // 後日芽が出るもの
      lastBattle: null,
      done: false
    };
  }

  function fact(w, data) {
    const f = Object.assign({ seq: w.facts.length + 1, day: w.day }, data);
    w.facts.push(f);
    return f;
  }
  const staffAt = (w, place) => w.staff.filter(p => p.alive && p.place === place);
  const person = (w, id) => w.staff.find(p => p.id === id) || w.applicants.find(p => p.id === id) || null;

  // 衝動を事実にする。ここが「特性 → 世界」の唯一の翻訳点。
  function resolve(w, p, imp, cause) {
    if (!imp) return null;
    const f = fact(w, { who: p.id, whoName: p.name, verb: imp.verb, text: imp.line, cause, unordered: true, quiet: !!imp.quiet });
    switch (imp.verb) {
      case "wander": p.place = imp.to; break;
      case "alter":
        if (imp.what === "feed") w.facilities.pasture.feed = "boosted";
        if (imp.what === "menu") w.facilities.kitchen.menu = "weird";
        if (imp.what === "furnace") w.facilities.lab.furnace = "hot";
        break;
      case "eat":
        w.facilities.pasture.slimes = Math.max(0, w.facilities.pasture.slimes - imp.amount);
        if (imp.unlock) w.known[imp.unlock] = w.day;
        break;
      case "sample": w.seeds.push({ id: "sample", by: p.id, day: w.day }); break;
      case "cull":
        w.facilities.pasture.slimes = Math.round(w.facilities.pasture.slimes * (1 - imp.amount)); break;
      case "gossip": { const o = person(w, imp.about); if (o) o.hidden.known = "gossip"; break; }
      default: break;
    }
    if (!imp.quiet) w.pending.push({ kind: "line", who: p, text: imp.line, cause: f.seq });
    else w.digest.push({ text: imp.line, cause: f.seq });
    return f;
  }

  // ── 採用・配置 ───────────────────────────────
  function hire(w, id, place) {
    const i = w.applicants.findIndex(a => a.id === id);
    if (i < 0 || w.staff.length >= 4) return false;
    const p = w.applicants.splice(i, 1)[0];
    p.alive = true; p.hurt = false; p.place = "idle";
    w.staff.push(p);
    fact(w, { who: p.id, whoName: p.name, verb: "hire", text: `${p.name}を雇った`, cause: "maou" });
    if (place) assign(w, id, place);
    return true;
  }

  function assign(w, id, place) {
    const p = person(w, id);
    if (!p || !p.alive || !PLACES[place]) return false;
    // 命令に従うか。酒好きは遅れる（が、翌日には行く）
    for (const t of p.traits) {
      const hook = TRAITS[t].onOrder;
      const imp = hook && hook(w, p);
      if (imp && imp.verb === "delay") {
        resolve(w, p, imp, "order");
        p.pendingPlace = place;
        return true;
      }
    }
    doAssign(w, p, place, "order");
    return true;
  }

  function doAssign(w, p, place, cause) {
    p.place = place;
    p.pendingPlace = null;
    fact(w, { who: p.id, whoName: p.name, verb: "assign", place, text: `${p.name}を${PLACES[place].name}へ`, cause });
    // 配置されたことで発火する特性（改造癖など）。隠れた特性もここで効く。
    for (const t of allTraits(p)) {
      const hook = TRAITS[t].assigned;
      const imp = hook && hook(w, p, place);
      if (imp) { resolve(w, p, imp, "assign"); if (p.hidden && p.hidden.trait === t) revealHidden(w, p, "act"); }
    }
  }

  const allTraits = p => p.traits.concat(p.hidden ? [p.hidden.trait] : []);
  function revealHidden(w, p, how) {
    if (!p.hidden || p.hidden.known === "seen") return;
    p.hidden.known = "seen";
    fact(w, { who: p.id, whoName: p.name, verb: "reveal", text: `${p.name}は「${TRAITS[p.hidden.trait].name}」だった`, cause: how });
  }

  // ── 行動（朝に状態から生成）───────────────────
  function actions(w) {
    const out = [];
    if (w.applicants.length && w.staff.length < 4 && (w.day === 1 || w.applicants.some(a => a.id === "slimes")))
      out.push({ id: "recruit", name: "応募者を見る", desc: `${w.applicants.length}名`, hot: w.applicants.some(a => a.id === "slimes") });
    if (w.staff.length)
      out.push({ id: "assign", name: "配置を決める", desc: "誰をどこに置くか" });
    for (const p of w.staff.filter(p => p.alive))
      out.push({ id: "talk", who: p.id, name: `${p.name}と話す`, desc: PLACES[p.place].name });
    out.push({ id: "inspect", name: "スライム牧場を視察する", desc: `${w.facilities.pasture.slimes}匹` });
    if (w.incident && w.facilities.pasture.slimes >= 30)
      out.push({ id: "fight", name: "鎮圧に出る", desc: "戦闘になる", hot: true });
    // 排水が光っているのは早くから見えるが、それが「増える元」だと分かるのは
    // 戦っても戻ると知ったあと、または研究室で調べたあと。ここで弧を飛ばせなくする。
    if (w.known.drain && (w.known.regen || w.known.drainCause) && w.facilities.pasture.drain === "leaking")
      out.push({ id: "seal", name: "排水を止める", desc: "増える元を絶つ", hot: true });
    if (w.incident && staffAt(w, "lab").length && !w.known.drainCause)
      out.push({ id: "research", name: "研究室に調べさせる", desc: `${staffAt(w, "lab")[0].name}に` });
    if (w.known.feed && w.facilities.pasture.feed === "boosted")
      out.push({ id: "revert", name: "餌を元に戻す", desc: "改良をやめさせる" });
    if (w.known.slime_edible && w.facilities.pasture.slimes >= 20)
      out.push({ id: "cook", name: "スライムを料理に回す", desc: "食堂で捌く" });
    out.push({ id: "rest", name: "今日は何もしない", desc: "様子を見る" });
    return out;
  }

  // 行動する。これが一日の本体。割り込みはこの中に落ちる。
  function act(w, action, payload) {
    if (w.phase !== "action") return null;
    w.pending = [];
    const result = { action, lines: [] };
    fact(w, { verb: "act", action: action.id, text: `魔王：${action.name}`, cause: "maou" });

    switch (action.id) {
      case "recruit":
        // payload: [{id, place}]
        for (const h of (payload || [])) hire(w, h.id, h.place);
        result.lines.push(`${(payload || []).map(h => person(w, h.id) ? person(w, h.id).name : h.id).join("、")}を雇った`);
        break;
      case "assign":
        for (const a of (payload || [])) assign(w, a.id, a.place);
        break;
      case "talk": {
        const p = person(w, action.who);
        if (!p) break;
        // 本人の隠れた性質が分かることも、他人のことを喋ることもある
        let said = false;
        for (const t of p.traits) {
          const hook = TRAITS[t].talk;
          const imp = hook && hook(w, p);
          if (imp) { resolve(w, p, imp, "talk"); said = true; break; }
        }
        if (!said && p.hidden && !p.hidden.known) {
          p.talked = (p.talked || 0) + 1;
          if (p.talked >= 2 || w.rng() < 0.4) { p.hidden.known = "told"; result.lines.push(`${p.name}「……${p.hidden.hint.replace(/です$|ですよ$|ますよ$/, "")}」`); }
          else result.lines.push(`${p.name}「別に、なにも」`);
        } else if (!said) {
          const f = w.facilities.pasture;
          result.lines.push(p.place === "pasture" && w.incident
            ? `${p.name}「……数えるのをやめました」`
            : `${p.name}「${PLACES[p.place].name}は変わりないです」`);
        }
        break;
      }
      case "inspect": {
        const n = w.facilities.pasture.slimes;
        result.lines.push(`牧場のスライム：${n}匹`);
        // 誰が牧場にいるかで、見えるものが変わる
        const keeper = staffAt(w, "pasture")[0];
        let seen = false;
        if (keeper) for (const t of allTraits(keeper)) {
          const hook = TRAITS[t].inspect;
          const imp = hook && hook(w, keeper, "pasture");
          if (imp) { for (const k of imp.reveal) w.known[k] = w.day; result.lines.push(imp.line); seen = true; break; }
        }
        if (!seen && n >= 30 && w.rng() < 0.5) { w.known.drain = w.day; result.lines.push("排水口のあたりが、うっすら光っている"); }
        else if (!seen) result.lines.push(keeper ? `${keeper.name}「元気ですよ」` : "誰も見ていない");
        if (w.facilities.pasture.feed === "boosted" && !w.known.feed && w.rng() < 0.6) { w.known.feed = w.day; result.lines.push("餌箱の中身が、見たことのない色をしている"); }
        break;
      }
      case "fight":
        result.battle = true;
        break;
      case "research": {
        const r = staffAt(w, "lab")[0];
        w.known.drainCause = w.day;
        w.known.drain = w.known.drain || w.day;
        result.lines.push(`${r.name}「牧場の排水に、炉の魔力が混ざっています。倒しても、破片がそれを吸って戻る」`);
        break;
      }
      case "seal":
        w.facilities.pasture.drain = "sealed";
        w.known.sealed = w.day;
        result.lines.push("排水口を塞いだ。光が消えていく");
        break;
      case "revert":
        w.facilities.pasture.feed = "normal";
        result.lines.push("餌を元の配合に戻させた");
        { const p = w.staff.find(p => p.alive && p.place === "pasture" && allTraits(p).includes("experimenter"));
          if (p) w.pending.push({ kind: "line", who: p, text: `${p.name}「……せっかく、応えてくれていたのに」` }); }
        break;
      case "cook":
        { const n = Math.min(25, w.facilities.pasture.slimes);
          w.facilities.pasture.slimes -= n;
          w.known.cooked = w.day;
          result.lines.push(`${n}匹を食堂へ回した。献立は「スライムの煮こごり」`); }
        break;
      case "rest":
        result.lines.push("今日は何もしなかった");
        break;
    }

    // 事件が起きていれば、その場にいる者が勝手に動く（乱入・便乗・傍観）
    if (w.incident) for (const p of w.staff.filter(p => p.alive)) {
      for (const t of allTraits(p)) {
        const hook = TRAITS[t].incident;
        const imp = hook && hook(w, p, { id: "slime", count: w.facilities.pasture.slimes });
        if (imp) { resolve(w, p, imp, "incident"); if (p.hidden && p.hidden.trait === t) revealHidden(w, p, "act"); break; }
      }
    }
    w.phase = result.battle ? "battle" : "night";
    return result;
  }

  // ── 戦闘に出る顔ぶれ ─────────────────────────
  // 命令した者だけではない。剛胆は勝手に来る。臆病は来ない。酒好きは来ないこともある。
  function battleParty(w) {
    const party = [];
    for (const p of w.staff.filter(p => p.alive)) {
      if (p.hid === w.day) { w.digest.push({ text: `${p.name}殿は鎮圧に出ませんでした`, cause: null }); continue; }
      if (has(p, "drunk") && p.place === "kitchen" && w.rng() < 0.5) {
        w.pending.push({ kind: "line", who: p, text: `${p.name}「……今、行く。今……」` });
        w.digest.push({ text: `${p.name}殿は鎮圧に間に合いませんでした`, cause: null });
        continue;
      }
      const volunteered = allTraits(p).includes("brave") && p.place !== "pasture";
      if (volunteered) { resolve(w, p, { verb: "volunteer", line: `${p.name}「俺も行く」` }, "battle"); if (p.hidden && p.hidden.trait === "brave") revealHidden(w, p, "act"); }
      party.push(p);
    }
    return party;
  }

  // ── 鎮圧戦のタイムライン ────────────────────
  function buildSlimeBattle(w, partyPeople) {
    const rng = w.rng;
    const count = w.facilities.pasture.slimes;
    const timeline = [];
    let nextId = 1;
    const emit = (type, data) => { data = data || {}; data.type = type; data.eventId = "sb" + nextId++; if (data.emphasis === undefined) data.emphasis = 0; timeline.push(data); return data; };
    const party = partyPeople.map((p, i) => ({
      id: "p" + i, side: "player", uid: p.id, name: p.name, race: p.race, tplId: p.tplId, icon: p.icon,
      maxHp: p.hp, hp: p.hurt ? Math.round(p.hp * 0.7) : p.hp, atk: p.atk, def: p.def, spd: 6,
      traits: [], tags: [], introQuote: has(p, "coward") ? "こんなの聞いてませんよぉ！" : "", alive: true,
      drunk: has(p, "drunk") && p.place === "kitchen"
    }));
    const enemy = [];
    let no = 0;
    const mk = () => ({ id: "e" + (++no), side: "enemy", uid: "s" + no, name: "スライム", race: "スライム", tplId: "slime", icon: "🟢",
      maxHp: 14, hp: 14, atk: 5, def: 1, spd: 4, traits: [], tags: [], alive: true });
    const front = Math.min(6, 3 + Math.floor(count / 40));
    for (let i = 0; i < front; i++) enemy.push(mk());
    let reserve = Math.max(0, Math.min(count, 60) - front);
    const snap = u => ({ id: u.id, name: u.name, race: u.race, tplId: u.tplId, icon: u.icon, side: u.side, hp: u.hp, maxHp: u.maxHp, atk: u.atk, def: u.def, spd: u.spd, traits: [], tags: [], introQuote: u.introQuote || "", summoned: !!u.summoned });
    emit("battle_start", { player: party.map(snap), enemy: enemy.map(snap) });
    emit("incident", { id: "slime", name: "スライム大増殖", emphasis: 3, text: `《スライム大増殖》 ${count}匹。見えているのは一部`, cls: "incident" });
    for (const u of party) if (u.introQuote) emit("dialogue", { unitId: u.id, name: u.name, side: "player", quote: u.introQuote, emphasis: 2, text: `${u.name}「${u.introQuote}」`, cls: "dialogue" });
    const alive = l => l.filter(u => u.alive);
    let killed = 0, round = 0;
    const hurt = (a, t, dmg) => {
      t.hp = Math.max(0, t.hp - dmg); const dead = t.hp <= 0;
      emit("attack", { fromId: a.id, toId: t.id, dmg, hp: t.hp, maxHp: t.maxHp, dead, emphasis: dead ? 2 : 1, text: `${a.name} → ${t.name}に${dmg}`, cls: "hit" });
      if (dead) { t.alive = false; emit("death", { unitId: t.id, emphasis: 1, text: `${t.name}が倒れた`, cls: "death" }); if (t.side === "enemy") killed++; }
    };
    while (round < 12) {
      round++;
      emit("round_start", { round });
      // 減った分だけ後ろから来る。倒しても倒しても、見えている数は減らない。
      while (alive(enemy).length < front && reserve > 0) {
        const s = mk(); s.summoned = true; enemy.push(s); reserve--;
        emit("summon", { unit: snap(s), sourceUnitId: null, emphasis: 1, text: "　後ろから、また来た", cls: "revive" });
      }
      const order = alive(party).concat(alive(enemy)).sort((a, b) => b.spd - a.spd);
      for (const actor of order) {
        if (!actor.alive) continue;
        const foes = actor.side === "player" ? alive(enemy) : alive(party);
        if (!foes.length) break;
        if (actor.side === "player") {
          if (actor.drunk && rng() < 0.4) { emit("note", { emphasis: 1, text: `${actor.name}の攻撃は空を切った`, cls: "trait" }); continue; }
          hurt(actor, foes[0], Math.max(1, Math.round((actor.atk - foes[0].def) * (0.8 + rng() * 0.5))));
        } else {
          const t = rng() < 0.65 ? foes[0] : foes[Math.floor(rng() * foes.length)];
          hurt(actor, t, Math.max(1, Math.round((actor.atk - t.def) * (0.8 + rng() * 0.5))));
        }
      }
      if (!alive(party).length) break;
      if (!alive(enemy).length && reserve <= 0) break;
      if (killed >= 40) { emit("note", { emphasis: 2, text: "　……きりがない。いったん引く", cls: "trait" }); break; }
    }
    const victory = alive(party).length > 0;
    emit("result", { victory, emphasis: 3, text: victory ? `${killed}匹を処分した。牧場はまだ動いている` : "押し切られた", cls: victory ? "result-win" : "result-lose" });
    return { victory, timeline, killed, rounds: round,
      party: party.map(u => ({ uid: u.uid, name: u.name, hp: u.hp, maxHp: u.maxHp, survived: u.alive })) };
  }

  function afterBattle(w, result) {
    w.lastBattle = result;
    const killed = result.killed || 0;
    w.facilities.pasture.slimes = Math.max(2, w.facilities.pasture.slimes - killed);
    w.known.fought = w.day;
    for (const r of result.party || []) {
      const p = person(w, r.uid); if (!p) continue;
      if (!r.survived) { p.alive = false; fact(w, { who: p.id, whoName: p.name, verb: "died", text: `${p.name}が倒れた`, cause: "battle" }); }
      else if (r.hp <= r.maxHp * 0.35) { p.hurt = true; }
    }
    fact(w, { verb: "battle", text: `鎮圧に出た。${killed}匹を処分`, killed, victory: result.victory, cause: "act" });
    w.phase = "night";
  }

  // ── 夜：世界が進む ───────────────────────────
  function night(w) {
    if (w.phase !== "night") return;
    const f = w.facilities.pasture;
    const before = f.slimes;
    // 増える理由は排水。餌の改良は加速。真面目な飼育係は間引く。戦闘で減らしても元が残れば戻る。
    let rate = f.drain === "leaking" ? 1.7 : 0.7;
    if (f.feed === "boosted") rate *= 1.5;
    f.slimes = Math.max(0, Math.round(f.slimes * rate + (f.drain === "leaking" ? 2 : 0)));

    // 遅れていた命令が効く
    for (const p of w.staff.filter(p => p.alive && p.pendingPlace)) doAssign(w, p, p.pendingPlace, "order-late");

    // 日々の癖
    for (const p of w.staff.filter(p => p.alive)) {
      for (const t of allTraits(p)) {
        const hook = TRAITS[t].daily;
        const imp = hook && hook(w, p);
        if (imp) { resolve(w, p, imp, "daily"); break; }
      }
    }

    // 芽が出る
    for (const s of w.seeds.filter(s => !s.sprouted && w.day - s.day >= 2)) {
      s.sprouted = true;
      if (s.id === "sample") w.digest.push({ text: "研究室の水槽が、夜になると光っているそうです", cause: null, notable: true });
    }

    // 朝の日誌
    if (f.slimes !== before) {
      const line = w.known.fought === w.day
        ? `昨日${w.lastBattle.killed}匹処分しましたヨネ？ ……今、${f.slimes}匹います`
        : `スライム牧場：${before} → ${f.slimes}匹`;
      w.digest.push({ text: line, cause: null, notable: w.known.fought === w.day });
      if (w.known.fought === w.day && f.slimes >= before * 0.8) w.known.regen = w.day;
    }

    // 事件の入口。閾値ではなく「昨日より目に見えて増えた」で切る
    if (!w.incident && f.slimes >= 60) {
      w.incident = { id: "slime", since: w.day, count: f.slimes };
      w.pending.push({ kind: "mormo", expression: "panic", text: `魔王様、大変デス！ スライム牧場の個体数が……${f.slimes}匹。止まりません！` });
      fact(w, { verb: "incident", text: "スライム大増殖が始まった", cause: "world" });
    }
    if (w.incident) w.incident.count = f.slimes;

    // 収束と決壊
    if (w.incident && f.drain === "sealed" && f.slimes <= 10) {
      w.incident = null;
      w.pending.push({ kind: "mormo", expression: "joy", text: "魔王様、牧場が落ち着きました。……あの、それで、スライムたちが労働条件について話したいそうデス" });
      w.applicants.push({ id: "slimes", name: "スライム（集団）", race: "スライム", tplId: "slime", icon: "🟢", hp: 40, atk: 4, def: 6,
        job: "応募者", resume: { prev: "貴城の牧場", wish: "有給と、排水の改善を", note: "代表は前列中央の個体です" },
        traits: ["diligent"], hidden: { trait: "chatty", hint: "全員で喋ります", known: false } });
      fact(w, { verb: "resolved", text: "スライム大増殖が収束した", cause: "seal" });
    } else if (w.incident && f.slimes >= 400) {
      w.pending.push({ kind: "mormo", expression: "panic", text: `魔王様……もう、城の廊下にもいます。${f.slimes}匹デス` });
      fact(w, { verb: "overflow", text: "スライムが城内へ溢れた", cause: "world" });
      w.incident.overflow = true;
    }

    w.day += 1;
    w.phase = w.day > w.maxDays ? "done" : "morning";
    if (w.phase === "done") w.done = true;
  }

  // 朝：日誌を読んで、行動へ
  function morning(w) {
    const lines = w.digest.splice(0);
    w.phase = "action";
    return lines;
  }

  // ── 10日間の振り返り（台帳から機械的に）──────────
  function summary(w) {
    const per = {};
    for (const p of w.staff) per[p.id] = { name: p.name, unordered: [], alive: p.alive };
    for (const f of w.facts) if (f.unordered && per[f.who]) per[f.who].unordered.push(`${f.day}日目：${f.text}`);
    return {
      people: Object.values(per),
      incident: w.facts.filter(f => ["incident", "battle", "resolved", "overflow"].includes(f.verb)).map(f => `${f.day}日目：${f.text}`),
      slimes: w.facilities.pasture.slimes,
      resolved: w.facts.some(f => f.verb === "resolved")
    };
  }

  const api = { PLACES, TRAITS, APPLICANTS, makeRng, newRun, person, hire, assign, actions, act, battleParty, buildSlimeBattle, afterBattle, night, morning, summary, allTraits };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CastleDays = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
