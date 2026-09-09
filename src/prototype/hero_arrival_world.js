// 勇者襲来 縦切り試作 v2 ── 世界ロジック（DOM非依存 / Node からも読める）
//
// v1（2026-09-09 午前）はオーナー試遊で「ボタンをぽちぽちするだけ」と評価された。
// 原因は動的要素の不足ではなく、**賭けが無かったこと**だと判断して組み直した。
//   v1: 相手の条件をプレイヤーが選んでいた（cond=B）。酒を出せば必ず飲む。当たり前の結果。
//   v2: 相手の条件は毎ラン隠れて決まる。酒を出す＝当たるか分からない賭けになる。
//
// 賭けを成立させるために足したもの（範囲は A/B のまま。CHAIN も新戦闘機構も足していない）:
//   1. 応募者は毎ラン抽選。同じ顔ぶれにしない → 「今回はモグがいない」が起きる
//   2. 有限予算。採用が痛い選択になる → 店に人を割くと迎撃が薄くなる
//   3. 酒が二種類。当たりやすいが効果小／当たりにくいが効果大 → 賭けの性格を選べる
//   4. 近郊警戒は本物の博打。育つが、帰らないこともある
//   5. 3ラン連続で遊び、結果が1行ずつ残る → 「あの応募者を採っていたら」の材料
//
// やっていないこと: 転職交渉 / プルの摂食 / 洪水 / 反乱 / 研究暴走 / CHAIN /
//   新しい戦闘機構 / 一マス移動 / T管理 / 本編セーブへの接続。
//
// 設計上の約束（これを壊すと試作の意味が消える）:
//   1. 「モグを採ったから勇者イベント」にしない。起きることは必ず
//      〈仕事 → 能力・設備・材料 → 接触 → 提供 → 相手の応答〉から作る。
//   2. 相手が飲むかは**相手側の条件**が決める。提供者の性格では決まらない。
//   3. 身元は接触時には分からない。モルモの「先ほどまで、うちで飲んでいた方です」は
//      台本ではなく facts に残った事実からのみ作る。事実が無ければ言わない。

(function (root) {
  "use strict";

  // ── 決定的乱数 ───────────────────────────────
  function makeRng(seed) {
    // seed をそのまま xorshift に入れると、小さい値では最初の十数手が偏る。
    // （seed 1〜6 で応募者の抽選が特定の並びに寄り、モグが一度も出ないバグが出た）
    // 混ぜてから空回しして、初手から分布が出るようにする。
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

  const PLACES = {
    castle: { id: "castle", name: "城内" },
    town: { id: "town", name: "城下" },
    gate: { id: "gate", name: "城門前" },
    away: { id: "away", name: "遠方" }
  };

  // ── 仕事 ────────────────────────────────────
  // 仕事が「どこにいるか」「何に触れられるか」「何をしてよいか」を決める。
  // 能力は仕事に付いていない。だから誰を店に置いても酒ができるわけではない。
  const JOBS = {
    guard: {
      id: "guard", name: "守備", place: "castle", short: "守備",
      desc: "城内で守備につく。来客の応対はしない。",
      grants: { defend: true }
    },
    gate: {
      id: "gate", name: "門番", place: "gate", short: "門番",
      desc: "城門で通行と身元を扱う。到着した相手と接触する。",
      grants: { defend: true, identify: true }
    },
    tavern: {
      id: "tavern", name: "城下の店", place: "town", short: "店",
      desc: "城下の酒場で働く。設備があり、来た客と接触できる。",
      grants: { shop: true, facility_brewery: true, serve: true }
    },
    patrol: {
      id: "patrol", name: "近郊警戒", place: "away", short: "警戒",
      desc: "最初の勤務のあいだだけ近郊へ出る。生きて帰れば戦功が付く。",
      grants: { sortie: true }, oneShot: true
    }
  };

  // ── 酒 ──────────────────────────────────────
  // 共通の「提供する」処理だけでは決まらない、品物側の個別定義（設計 10節）。
  // 二種類あるのは賭けの性格を選ばせるため。当たりやすさと効果が逆になっている。
  const DRINKS = {
    ale: {
      id: "ale", name: "新酒", brewer: "brew_ale",
      desc: "口当たりのいい試作。警戒されにくい。",
      effect: { spd: -4, minSpd: 1 }, effectText: "酔い（速度-4）",
      strong: false, servings: 3
    },
    spirit: {
      id: "spirit", name: "蒸留酒", brewer: "brew_spirit",
      desc: "匂いで分かるほど強い。旨いが、警戒されやすい。",
      effect: { spd: -8, minSpd: 1 }, effectText: "泥酔（速度-8）",
      strong: true, servings: 1
    }
  };

  // ── 相手の条件 ──────────────────────────────
  // **毎ラン隠れて決まる。プレイヤーは選べないし、事前に見えない。**
  // ここが v2 の賭けの本体。提供者が誰かでは変わらない。
  const GUEST_CONDITIONS = [
    {
      id: "duty", name: "任務優先", weight: 35,
      hint: "勤務中は飲まない",
      accepts: { normal: false, strong: false },
      refuseLine: "……勤務中だ。すまない。"
    },
    {
      id: "rest", name: "休憩中", weight: 40,
      hint: "軽いものなら一杯だけ飲む。強い酒は警戒する",
      accepts: { normal: true, strong: false },
      acceptLine: "……一杯だけ。ここ、いい店だね。",
      refuseLine: "いや、それは……匂いで分かる。遠慮しておくよ。"
    },
    {
      id: "loose", name: "気が緩んでいる", weight: 25,
      hint: "出されたものは飲む",
      accepts: { normal: true, strong: true },
      acceptLine: "うん、頂こう。……久しぶりだな、こういうのは。"
    }
  ];


  // ── 隠れた性質 ──────────────────────────────
  // 設計 8節「確認済みの能力、本人の申告、噂・未確認情報、未発見の性質を区別する」。
  //
  // 採用をゲームの中心にするための仕組み。履歴書に載るのは**手掛かりの一文**だけで、
  // 中身は働かせるまで分からない。当たることも外れることもある。
  // 総当たりで確定させる手段は用意しない（1ラン1回しか採用できない）。
  //
  // hint は必ずその性質に対応した本当の手掛かりにする。嘘の手掛かりは書かない。
  // ただし一文だけでは断定できない書き方にして、読み手の判断を残す。
  const HIDDEN_TRAITS = {
    none: { id: "none", label: null, apply() {} },
    veteran: {
      id: "veteran", label: "実は場数を踏んでいた",
      reveal: "経歴に書いていなかっただけで、この人は既に戦い慣れていた。",
      apply(p) { p.merit += 4; }
    },
    tough: {
      id: "tough", label: "見た目より打たれ強い",
      reveal: "受けても崩れない。前の職場の評判は本当だった。",
      apply(p) { p.base.def += 4; p.base.hp = Math.round(p.base.hp * 1.12); }
    },
    frail: {
      id: "frail", label: "見た目ほど保たない",
      reveal: "体は大きいが、続かない。長く働けていなかった理由はこれらしい。",
      apply(p) { p.base.hp = Math.round(p.base.hp * 0.78); }
    },
    brewer: {
      id: "brewer", label: "実は酒が造れる",
      reveal: "前の職場で覚えたらしい。履歴書には書いていなかった。",
      apply(p) { if (!p.abilities.includes("brew_ale")) p.abilities.push("brew_ale", "serve"); 
                 if (!p.motives.includes("taste_feedback")) p.motives.push("taste_feedback"); }
    }
  };

  // ── 人物 ────────────────────────────────────
  // 在籍2名は無料。応募者はプールから毎ラン抽選する。
  const RESIDENTS = [
    {
      id: "garo", name: "ガロ", race: "オーク", tplId: "orc", icon: "🐗",
      job: "古参・最前列", salary: 0,
      resume: { prev: "最前列。十九年。", wish: "新入りを死なせたくない。", note: "戦功3。傷は数えていない。" },
      abilities: ["front"], motives: ["protect"],
      base: { hp: 96, atk: 22, def: 9, spd: 6 }, merit: 3,
      introQuote: "……新入りは、後ろだ。"
    },
    {
      id: "gantz", name: "ガンツ", race: "オーガ", tplId: "ogre", icon: "🗿",
      job: "門番", salary: 0,
      resume: { prev: "城門を任されて十二年。", wish: "通すなと言われた者は通しません。", note: "遅い。動かない。" },
      abilities: ["front", "identify"], motives: ["duty"],
      base: { hp: 120, atk: 13, def: 12, spd: 3 }, merit: 0
    }
  ];

  // 応募者プール。毎ラン5名が来る。
  // 「仕事ができる者」と「戦える者」を混ぜてあり、予算6Gでは全部は取れない。
  // 応募者プール。毎ラン6名が面接に来る。
  //   確認済み … race / salary / 見た目の能力帯（画面に出す）
  //   本人の申告 … wish（本当のこともあるし、そうでないこともある）
  //   未確認 … clue の一文だけが出る。hidden の中身は働かせるまで分からない。
  const APPLICANT_POOL = [
    {
      id: "mog", name: "モグ", race: "ゴブリン", tplId: "goblin", icon: "👺",
      job: "酒造担当", salary: 2, kind: "work",
      resume: { prev: "醸造所の下働き。", wish: "試作品の感想を聞かせてください。勤務時間外でも構いません。", note: "戦闘経験はほとんどありません。" },
      clue: "面接中ずっと、樽の話をしていた。",
      hidden: "none",
      abilities: ["brew_ale", "serve"], motives: ["taste_feedback"],
      base: { hp: 60, atk: 14, def: 5, spd: 5 }
    },
    {
      id: "duba", name: "ドゥバ", race: "コボルト", tplId: "kobold", icon: "🐕",
      job: "蒸留担当", salary: 3, kind: "work",
      resume: { prev: "山の蒸留小屋。", wish: "薄いのは酒とは言いません。", note: "一度に一杯しか作れません。手間がかかるので。" },
      clue: "持参した見本の匂いが、部屋に残っている。",
      hidden: "none",
      abilities: ["brew_spirit", "serve"], motives: ["taste_feedback"],
      base: { hp: 66, atk: 16, def: 6, spd: 5 }
    },
    {
      id: "rize", name: "リゼ", race: "魔法使い", tplId: "mage", icon: "🔥",
      job: "魔術師", salary: 3, kind: "fight",
      resume: { prev: "宮廷魔術師見習い（自主退職）。", wish: "詠唱中だけ、前に立たないでください。", note: "依頼どおりの仕事を好みます。" },
      clue: "「見習い」と書いてあるが、退職まで六年在籍している。",
      hidden: "veteran",
      abilities: ["magic"], motives: ["do_as_asked"],
      base: { hp: 48, atk: 22, def: 3, spd: 8 }
    },
    {
      id: "rena", name: "レナ", race: "人間", tplId: "swordsman", icon: "🗡",
      job: "元・護衛", salary: 3, kind: "fight",
      resume: { prev: "アレン隊の護衛。", wish: "退職理由は、本人に聞いてください。", note: "剣は一通り。夜目が利きます。" },
      clue: "勇者の隊にいたと書いてある。退職理由は空欄のまま。",
      hidden: "veteran",
      abilities: ["front"], motives: ["duty"],
      relations: [{ to: "allen", kind: "former_colleague" }],
      base: { hp: 82, atk: 21, def: 8, spd: 8 }
    },
    {
      id: "honekichi", name: "ホネ吉", race: "骸骨兵", tplId: "skeleton", icon: "💀",
      job: "骸骨兵", salary: 1, kind: "fight",
      resume: { prev: "夜警。", wish: "皆勤です。寝ていませんので。", note: "食事は不要です。" },
      clue: "十年ぶんの勤務表を持ってきた。欠勤は一日もない。",
      hidden: "none",
      abilities: ["front"], motives: ["duty"],
      base: { hp: 74, atk: 18, def: 7, spd: 6 }
    },
    {
      id: "dord", name: "ドルド", race: "オーガ", tplId: "ogre", icon: "👹",
      job: "傭兵", salary: 4, kind: "fight",
      resume: { prev: "各地の戦場。雇い主は覚えていません。", wish: "前でいい。後ろは性に合わない。", note: "高い。理由は見れば分かる。" },
      clue: "どの戦場も、在籍が三月より短い。",
      hidden: "frail",
      abilities: ["front"], motives: ["duty"],
      base: { hp: 104, atk: 24, def: 9, spd: 5 }
    },
    {
      id: "pipi", name: "ピピ", race: "インプ", tplId: "imp", icon: "😈",
      job: "見習い", salary: 1, kind: "fight",
      resume: { prev: "特にありません。", wish: "安全なところがいいです。", note: "速いです。それだけです。" },
      clue: "面接の間、一度も座らなかった。",
      hidden: "none",
      abilities: [], motives: ["duty"],
      base: { hp: 44, atk: 17, def: 3, spd: 11 }
    },
    {
      id: "neru", name: "ネル", race: "スライム", tplId: "slime", icon: "🟢",
      job: "雑用", salary: 2, kind: "fight",
      resume: { prev: "貯水槽の底。", wish: "ぶたれても、だいじょうぶ。", note: "刃物が効きにくい体です。" },
      clue: "面接官が落とした書類を、体で受け止めて返してきた。",
      hidden: "tough",
      abilities: ["front"], motives: ["duty"],
      base: { hp: 116, atk: 13, def: 11, spd: 3 }
    },
    {
      id: "gudo", name: "グド", race: "ゾンビ", tplId: "zombie", icon: "🧟",
      job: "元・厨房", salary: 2, kind: "fight",
      resume: { prev: "宿場の厨房。十一年。", wish: "また台所仕事があれば。", note: "手先は器用なほうです。" },
      clue: "宿場の厨房、と書いてある。宿場には酒も出る。",
      hidden: "brewer",
      abilities: ["front"], motives: ["duty"],
      base: { hp: 78, atk: 16, def: 8, spd: 4 }
    },
    {
      id: "vira", name: "ヴィラ", race: "死霊術師", tplId: "necromancer", icon: "🪄",
      job: "死霊術師", salary: 4, kind: "fight",
      resume: { prev: "墓地管理。", wish: "静かな職場を希望します。", note: "写りだけは、やたらといいです。" },
      clue: "推薦状が三通ある。三通とも筆跡が同じ。",
      hidden: "frail",
      abilities: ["magic"], motives: ["do_as_asked"],
      base: { hp: 62, atk: 23, def: 5, spd: 7 }
    },
    {
      id: "boru", name: "ボル", race: "コボルト", tplId: "kobold", icon: "🐕",
      job: "荷運び", salary: 1, kind: "fight",
      resume: { prev: "隊商の荷運び。", wish: "重いものなら任せてください。", note: "特にありません。" },
      clue: "隊商が三度襲われて、三度とも荷を守り切っている。",
      hidden: "tough",
      abilities: ["front"], motives: ["duty"],
      base: { hp: 70, atk: 17, def: 6, spd: 6 }
    },
    {
      id: "zag", name: "ザグ", race: "オーク", tplId: "orc", icon: "🐗",
      job: "元・門衛", salary: 3, kind: "fight",
      resume: { prev: "隣国の城門。", wish: "前の職場より、まともなところで。", note: "推薦状はありません。" },
      clue: "隣国の城門は、三年前に破られている。その時いたかは書いていない。",
      hidden: "veteran",
      abilities: ["front", "identify"], motives: ["duty"],
      base: { hp: 88, atk: 19, def: 8, spd: 6 }
    }
  ];

  const RANKS = [
    { id: "soldier", name: "兵卒", threshold: 0 },
    { id: "squad_leader", name: "小隊長", threshold: 4, boost: { hp: 1.08, atk: 1.10, def: 1 } },
    { id: "demon_lord", name: "魔将", threshold: 10, boost: { hp: 1.08, atk: 1.08, def: 1 } }
  ];

  const HERO_PARTY = [
    { id: "dolf", name: "戦士ドルフ", tplId: "axeman", icon: "🪓", hp: 118, atk: 21, def: 10, spd: 7 },
    {
      id: "allen", name: "勇者アレン", tplId: "hero", icon: "👑",
      hp: 155, atk: 29, def: 12, spd: 10, traits: ["hero_awaken"],
      introQuote: "ここが最後の一線だ。魔王よ、僕たちの世界は渡さない！"
    },
    { id: "el", name: "聖女エル", tplId: "cleric", icon: "✨", hp: 92, atk: 15, def: 8, spd: 6 },
    { id: "mira", name: "賢者ミラ", tplId: "sage", icon: "📖", hp: 84, atk: 24, def: 6, spd: 8 }
  ];

  const PATROL_PARTY = [
    { id: "pt1", name: "王国巡回兵ケイ", tplId: "swordsman", icon: "🗡", hp: 44, atk: 15, def: 5, spd: 6 },
    { id: "pt2", name: "王国巡回兵ノル", tplId: "archer", icon: "🏹", hp: 34, atk: 15, def: 2, spd: 8 }
  ];

  const BUDGET = 6;
  const MAX_ROSTER = 5;
  const APPLICANTS_PER_RUN = 6;

  // ── 世界 ────────────────────────────────────
  function newWorld(options) {
    options = options || {};
    const seed = options.seed === undefined ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : options.seed;
    const rng = makeRng(seed);

    // 応募者を抽選する。毎ラン顔ぶれが変わるので「今回はモグがいない」が起きる。
    const pool = APPLICANT_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // options.allApplicants は数値検証（sim / テスト）用。遊ぶときは使わない。
    const applicants = options.allApplicants ? APPLICANT_POOL.slice() : pool.slice(0, APPLICANTS_PER_RUN);

    // 相手の条件を隠して決める。**プレイヤーには最後まで見せない。**
    // これが賭けの本体。酒を出しても飲むとは限らない。
    const total = GUEST_CONDITIONS.reduce((s, c) => s + c.weight, 0);
    let roll = rng() * total;
    let condition = GUEST_CONDITIONS[GUEST_CONDITIONS.length - 1];
    for (const c of GUEST_CONDITIONS) { if ((roll -= c.weight) < 0) { condition = c; break; } }

    const mk = (p, hired) => ({
      ...p,
      base: { ...p.base },
      resume: { ...p.resume },
      abilities: p.abilities.slice(),
      motives: p.motives.slice(),
      relations: (p.relations || []).slice(),
      merit: p.merit || 0,
      hidden: p.hidden || "none",
      // 申告値。隠れた性質を適用する前の姿で、判明するまで画面に出すのはこちら。
      declared: { ...p.base },
      declaredMerit: p.merit || 0,
      revealed: !p.hidden || p.hidden === "none" ? false : false,
      hired: !!hired,
      assignment: hired ? (p.id === "gantz" ? "gate" : "guard") : null,
      serveOutsiders: true,
      alive: true,
      deployed: false,
      deployOrder: 0
    });

    const persons = RESIDENTS.map(p => mk(p, true)).concat(applicants.map(p => mk(p, false)));
    return {
      seed, rng,
      condition,                 // 内部だけが知っている
      budget: BUDGET,
      spent: 0,
      maxRoster: MAX_ROSTER,
      // 面接。一人ずつ来て、その場で採るか見送るかを答える。見送ったら戻らない。
      interview: { queue: applicants.map(p => p.id), index: 0 },
      segment: -1,               // -1=面接 0=配属 1=最初の勤務 2=城下 3=到着 4=決着
      persons,
      stock: [],
      facts: [],
      reports: [],
      visitor: null,
      arrival: null,
      battle: null,
      outcome: null
    };
  }

  function person(world, id) { return world.persons.find(p => p.id === id) || null; }
  function hiredPersons(world) { return world.persons.filter(p => p.hired); }
  function applicants(world) { return world.persons.filter(p => !p.hired && p.salary > 0); }
  function remainingBudget(world) { return world.budget - world.spent; }
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

  // 本人が造れる酒（能力側）。仕事で設備が要る。
  function brewableBy(p) {
    return Object.values(DRINKS).find(d => p.abilities.includes(d.brewer)) || null;
  }

  // ── 面接 ────────────────────────────────────
  // 応募者は一人ずつ来る。**その場で採るか見送るかを答える。戻れない。**
  // 一覧から予算内で足し算する形をやめたのは、それだと読まずに進められるため。
  function currentApplicant(world) {
    const iv = world.interview;
    if (!iv || iv.index >= iv.queue.length) return null;
    return person(world, iv.queue[iv.index]);
  }

  function canAfford(world, p) {
    return p && p.salary <= remainingBudget(world)
      && hiredPersons(world).length < world.maxRoster;
  }

  function hire(world, personId, jobId) {
    const p = person(world, personId);
    if (!p) return { ok: false, reason: "no_such_person" };
    if (p.hired) return { ok: false, reason: "already_hired" };
    if (world.segment !== -1) return { ok: false, reason: "interview_over" };
    if (currentApplicant(world) !== p) return { ok: false, reason: "not_current" };
    if (hiredPersons(world).length >= world.maxRoster) return { ok: false, reason: "roster_full" };
    if (p.salary > remainingBudget(world)) return { ok: false, reason: "no_budget" };
    p.hired = true;
    p.assignment = JOBS[jobId] ? jobId : "guard";
    world.spent += p.salary;
    // 隠れた性質は採用した時点で効き始める。ただし判明するまで画面には出さない。
    HIDDEN_TRAITS[p.hidden].apply(p);
    fact(world, { verb: "hire", actor: "maou", target: p.id, job: p.assignment, cost: p.salary });
    world.interview.index += 1;
    return { ok: true };
  }

  // 見送る。次のランで同じ人が来るとは限らない。
  function pass(world, personId) {
    const p = person(world, personId);
    if (!p || world.segment !== -1 || currentApplicant(world) !== p) return { ok: false, reason: "not_current" };
    fact(world, { verb: "pass", actor: "maou", target: p.id });
    world.interview.index += 1;
    return { ok: true };
  }

  function interviewDone(world) {
    return world.interview.index >= world.interview.queue.length;
  }

  // 面接を終えて配属へ。以後は採用できない。
  function closeInterview(world) {
    if (world.segment !== -1) return { ok: false, reason: "already_closed" };
    world.interview.index = world.interview.queue.length;
    world.segment = 0;
    return { ok: true };
  }

  // ── 隠れた性質の判明 ────────────────────────
  // 採用の答え合わせ。働かせて初めて分かる。台詞だけで匂わせず、必ず数値か能力が動く。
  function revealHidden(world, p, when) {
    if (p.revealed || p.hidden === "none") return null;
    const trait = HIDDEN_TRAITS[p.hidden];
    // 酒造は店に置いて仕込んだときに、体の話は戦って初めて分かる。
    if (p.hidden === "brewer" && when !== "produce") return null;
    if (p.hidden !== "brewer" && when !== "battle") return null;
    p.revealed = true;
    fact(world, { verb: "reveal", actor: p.id, trait: trait.id, when });
    return trait;
  }

  // 画面に出す能力値。判明していなければ申告値を出す。
  function shownStats(p) {
    if (p.revealed || p.hidden === "none") return statsOf(p);
    const s = { ...p.declared };
    for (const r of RANKS) {
      if (!r.boost || p.declaredMerit < r.threshold) continue;
      s.hp = Math.round(s.hp * r.boost.hp);
      s.atk = Math.round(s.atk * r.boost.atk);
      s.def = s.def + (r.boost.def || 0);
    }
    return s;
  }

  function shownRank(p) {
    const merit = (p.revealed || p.hidden === "none") ? p.merit : p.declaredMerit;
    let found = RANKS[0];
    for (const r of RANKS) if (merit >= r.threshold) found = r;
    return found;
  }

  function assign(world, personId, jobId) {
    const p = person(world, personId);
    if (!p || !p.hired || !p.alive) return { ok: false, reason: "unavailable" };
    if (!JOBS[jobId]) return { ok: false, reason: "no_such_job" };
    if (JOBS[jobId].oneShot && world.segment !== 0) return { ok: false, reason: "prep_only" };
    p.assignment = jobId;
    return { ok: true };
  }

  function setServePolicy(world, personId, allowed) {
    const p = person(world, personId);
    if (!p) return { ok: false, reason: "unavailable" };
    p.serveOutsiders = !!allowed;
    return { ok: true };
  }

  // ── 戦闘ユニット ────────────────────────────
  function rankOf(p) {
    let found = RANKS[0];
    for (const r of RANKS) if (p.merit >= r.threshold) found = r;
    return found;
  }

  function statsOf(p) {
    const s = { ...p.base };
    for (const r of RANKS) {
      if (!r.boost || p.merit < r.threshold) continue;
      s.hp = Math.round(s.hp * r.boost.hp);
      s.atk = Math.round(s.atk * r.boost.atk);
      s.def = s.def + (r.boost.def || 0);
    }
    return s;
  }

  // 戦いに出す＝答え合わせ。出す前に判明はしない。
  function revealSquad(world, squad) {
    const found = [];
    for (const p of squad) {
      const trait = revealHidden(world, p, "battle");
      if (trait) found.push({ personId: p.id, name: p.name, label: trait.label, reveal: trait.reveal });
    }
    return found;
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

  // 勇者側。酔いは facts から読む。人物名で分岐しない。
  function heroUnits(world) {
    const drinks = new Map();
    for (const f of world.facts) {
      if (f.verb === "consume" && f.drinkId) drinks.set(f.target, DRINKS[f.drinkId]);
    }
    return HERO_PARTY.map(e => {
      const u = {
        uid: e.id, name: e.name, tplId: e.tplId, icon: e.icon, race: "人間",
        hp: e.hp, atk: e.atk, def: e.def, spd: e.spd,
        traits: (e.traits || []).slice(), tags: [], introQuote: e.introQuote || ""
      };
      const drink = drinks.get(e.id);
      if (drink) {
        u.spd = Math.max(drink.effect.minSpd, u.spd + drink.effect.spd);
        u.drunk = drink.effectText;
      }
      return u;
    });
  }

  // ── 行動候補（設計 5.2）───────────────────
  function candidateActions(world, p, context) {
    const out = [];
    const place = placeOf(world, p);
    if (!p.hired || !p.alive || !place) return out;

    // 生産する：能力（本人）＋設備（仕事）＋勤務時間
    const drink = brewableBy(p);
    if (drink && grants(world, p, "facility_brewery")) {
      const made = world.facts.some(f => f.verb === "produce" && f.actor === p.id);
      if (!made) out.push({ verb: "produce", drinkId: drink.id, place });
    }

    // 提供する：物が同じ場所にあり、接触できる相手がいて、許されていて、本人に理由がある
    if (context && context.guest && context.guest.place === place) {
      const stock = world.stock.find(s => s.place === place && s.qty > 0);
      const already = world.facts.some(f =>
        f.verb === "offer" && f.actor === p.id && f.target === context.guest.id);
      if (stock && grants(world, p, "serve") && p.abilities.includes("serve")
          && p.motives.includes("taste_feedback") && p.serveOutsiders && !already) {
        out.push({ verb: "offer", drinkId: stock.drinkId, target: context.guest.id, place });
      }
      if (grants(world, p, "shop") && !out.some(a => a.verb === "offer")) {
        out.push({ verb: "shop", target: context.guest.id, place });
      }
    } else if (grants(world, p, "shop")) {
      out.push({ verb: "shop", place });
    }

    if (grants(world, p, "identify") && context && context.arriving) {
      out.push({ verb: "identify", target: context.arriving.id, place });
    }
    if (grants(world, p, "defend")) out.push({ verb: "defend", place });
    return out;
  }

  // 相手の応答。提供者ではなく**相手側の条件**が決める。
  function respondToOffer(world, guest, drinkId) {
    const drink = DRINKS[drinkId];
    const cond = world.condition;
    const ok = drink.strong ? cond.accepts.strong : cond.accepts.normal;
    return {
      accepted: ok,
      line: ok ? cond.acceptLine : cond.refuseLine
    };
  }

  function applyAction(world, p, action) {
    const lines = [];
    if (action.verb === "produce") {
      const drink = DRINKS[action.drinkId];
      world.stock.push({ drinkId: drink.id, qty: drink.servings, place: action.place, madeBy: p.id });
      fact(world, { verb: "produce", actor: p.id, drinkId: drink.id, place: action.place });
      const found = revealHidden(world, p, "produce");
      if (found) {
        lines.push({ personId: p.id, hit: true, revealed: found.label,
          text: `${p.name}が${drink.name}を仕込んだ（${drink.servings}杯）。${found.reveal}` });
      } else {
        lines.push({ personId: p.id, text: `${p.name}が${drink.name}を仕込んだ（${drink.servings}杯）。` });
      }
      return lines;
    }
    if (action.verb === "offer") {
      const guest = world.visitor;
      const stock = world.stock.find(s => s.place === action.place && s.qty > 0);
      if (!guest || !stock) return lines;
      const drink = DRINKS[stock.drinkId];
      const res = respondToOffer(world, guest, stock.drinkId);
      fact(world, {
        verb: "offer", actor: p.id, drinkId: drink.id, target: guest.id,
        place: action.place, accepted: res.accepted, line: res.line
      });
      if (res.accepted) {
        stock.qty -= 1;
        guest.state.drunk = drink.id;
        fact(world, { verb: "consume", actor: guest.id, drinkId: drink.id, target: guest.id, source: p.id });
        lines.push({ personId: p.id, text: `${p.name}が旅の方へ${drink.name}をすすめ、旅の方はそれを飲んだ。`, guestLine: res.line, hit: true });
      } else {
        lines.push({ personId: p.id, text: `${p.name}が旅の方へ${drink.name}をすすめたが、断られた。`, guestLine: res.line, miss: true });
      }
      return lines;
    }
    if (action.verb === "shop") {
      fact(world, { verb: "shop", actor: p.id, place: action.place });
      lines.push({ personId: p.id, routine: true, text: action.target
        ? `${p.name}は普通に店を開け、旅の方の相手をした。`
        : `${p.name}は店を開けたが、客は来なかった。` });
      return lines;
    }
    if (action.verb === "identify") {
      fact(world, { verb: "identify", actor: p.id, target: action.target, place: action.place });
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
      const order = { defend: 0, identify: 1, produce: 2, offer: 3, shop: 4 };
      actions.sort((a, b) => (order[a.verb] ?? 9) - (order[b.verb] ?? 9) || (world.rng() - 0.5));
      for (const action of actions) lines.push(...applyAction(world, p, action));
    }
    return lines;
  }

  // ── 区間を進める ────────────────────────────
  function advance(world, battleRunner) {
    if (world.segment >= 3) return null;
    world.segment += 1;
    const report = { segment: world.segment, lines: [], patrol: null, headline: "", mormo: null };

    if (world.segment === 1) {
      report.headline = "最初の勤務";
      const scouts = hiredPersons(world).filter(p => p.assignment === "patrol" && p.alive);
      if (scouts.length && battleRunner) {
        report.revealed = revealSquad(world, scouts);
        const result = battleRunner(scouts.map(toUnit),
          PATROL_PARTY.map(e => ({ ...e, race: "人間", traits: [], tags: [] })));
        report.patrol = { victory: result.victory, contribution: result.contribution, timeline: result.timeline };
        for (const p of scouts) {
          const c = (result.contribution || []).find(x => x.uid === p.id);
          const survived = c ? c.survived : result.victory;
          if (!survived) {
            p.alive = false;
            fact(world, { verb: "died", actor: p.id, where: "patrol" });
            report.lines.push({ personId: p.id, miss: true, text: `${p.name}は近郊警戒から帰らなかった。` });
            continue;
          }
          const before = rankOf(p);
          p.merit += result.victory ? 2 : 1;
          const after = rankOf(p);
          fact(world, { verb: "sortie", actor: p.id, victory: result.victory, merit: p.merit });
          if (after.id !== before.id) {
            fact(world, { verb: "promote", actor: p.id, rank: after.id });
            report.lines.push({ personId: p.id, promoted: after.name, hit: true,
              text: `${p.name}は生きて帰り、${after.name}になった。` });
          } else {
            report.lines.push({ personId: p.id, text: `${p.name}は生きて帰った（戦功${p.merit}）。` });
          }
          p.assignment = "guard";
        }
      }
      report.lines.push(...runActions(world, {}));
    }

    if (world.segment === 2) {
      report.headline = "城下での出来事";
      world.visitor = { id: "allen", shownAs: "旅の方", place: "town", identityKnown: false, state: {} };
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
        wasGuest: identified && world.facts.some(f => f.verb === "arrive" && f.actor === "allen" && f.asStranger)
      };
      if (world.visitor) world.visitor.identityKnown = identified;
      report.mormo = arrivalReport(world);
    }

    if (world.segment < 3) report.mormo = segmentAside(world, report);
    world.reports.push(report);
    return report;
  }

  function personName(world, id) {
    const p = person(world, id);
    return p ? p.name : "どなたか";
  }

  // 区間報告に添えるモルモの一言。この区間に**実際に起きた事実**の中で一番大きいものだけを言う。
  function segmentAside(world, report) {
    const here = world.facts.filter(f => f.segment === world.segment);
    const died = here.find(f => f.verb === "died");
    if (died) return { expression: "panic", text: `${personName(world, died.actor)}殿が、帰りませんでした……` };
    const drank = here.find(f => f.verb === "consume");
    // この時点で相手が誰かを知らない。だから「旅の方」としか言えない。
    if (drank) return { expression: "joy", text: `${DRINKS[drank.drinkId].name}、旅の方に好評デス！ いい飲みっぷりでしたヨ` };
    const refused = here.find(f => f.verb === "offer" && !f.accepted);
    if (refused) return { expression: "worried", text: "お酒はお断りされました。……売り上げはゼロデス" };
    const promoted = here.find(f => f.verb === "promote");
    if (promoted) return { expression: "joy", text: `${personName(world, promoted.actor)}殿、生きて帰りました！` };
    const made = here.find(f => f.verb === "produce");
    if (made) return { expression: "report", text: `${personName(world, made.actor)}殿が、さっそく仕込みました` };
    return { expression: "report", text: "変わったことはありませんデス" };
  }

  // 勇者到着時の報告。facts にある事実だけから作る。
  function arrivalReport(world) {
    const a = world.arrival || {};
    const offer = world.facts.find(f => f.verb === "offer" && f.target === "allen");
    const drank = world.facts.find(f => f.verb === "consume" && f.target === "allen");

    if (!a.identified) {
      return { expression: "panic",
        text: "魔王様、勇者一行が城門に着きました！ 門に誰もいないので、身元は……見た目でしか分かりませんデス！" };
    }
    if (drank) {
      return {
        expression: "panic",
        text: "魔王様、勇者です。先ほどまで、うちで飲んでいた方です",
        detail: `${personName(world, drank.source)}が城下の店で${DRINKS[drank.drinkId].name}をすすめ、この方が飲んだ。${DRINKS[drank.drinkId].effectText}が残っている。`,
        emphasis: 3
      };
    }
    if (offer) {
      return {
        expression: "worried",
        text: "魔王様、勇者です。……先ほど、うちの店でお酒を断った方デス",
        detail: `${personName(world, offer.actor)}がすすめたが、断られた。酒は残っている。`
      };
    }
    if (a.wasGuest) {
      return { expression: "report",
        text: "魔王様、勇者一行の到着デス。……この方、さっき城下を歩いていた方ですネ" };
    }
    return { expression: "report", text: "魔王様、勇者一行が城門に着きました。迎撃のご指示を。" };
  }

  // ── 迎撃 ────────────────────────────────────
  function deployable(world) {
    return world.persons.filter(p => p.hired && p.alive && placeOf(world, p) !== "away");
  }

  function resolveInterception(world, squadIds, battleRunner) {
    const squad = squadIds.map(id => person(world, id)).filter(p => p && p.hired && p.alive);
    if (!squad.length) {
      world.outcome = { kind: "occupied", victory: false, squad: [] };
      fact(world, { verb: "interception", victory: false, empty: true });
      world.segment = 4;
      return world.outcome;
    }
    world.revealedAtBattle = revealSquad(world, squad);
    const result = battleRunner(squad.map(toUnit), heroUnits(world));
    for (const p of squad) {
      const c = (result.contribution || []).find(x => x.uid === p.id);
      if (c && !c.survived) {
        p.alive = false;
        fact(world, { verb: "died", actor: p.id, where: "interception" });
      }
    }
    world.battle = result;
    world.outcome = { kind: "battle", victory: result.victory, squad: squad.map(p => p.id), contribution: result.contribution };
    fact(world, { verb: "interception", victory: result.victory, squad: squad.map(p => p.id) });
    world.segment = 4;
    return world.outcome;
  }

  function outcomeSentences(world) {
    const out = [];
    const c = (world.battle && world.battle.contribution) || [];
    const timeline = (world.battle && world.battle.timeline) || [];
    const start = timeline.find(e => e.type === "battle_start");
    const allenId = start ? ((start.enemy.find(u => u.uid === "allen") || {}).id) : null;
    if (allenId) {
      const takes = timeline.filter(e => e.type === "attack" && e.fromId === allenId && e.dmg > 0);
      const byTarget = {};
      for (const e of takes) byTarget[e.toId] = (byTarget[e.toId] || 0) + 1;
      const top = Object.entries(byTarget).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const who = c.find(x => x.id === top[0]);
        if (who && who.survived) out.push(`${who.name}はアレンの攻撃を${top[1]}度受けて生還。`);
      }
    }
    const best = c.length ? c.reduce((m, x) => x.dealt > m.dealt ? x : m) : null;
    if (best && best.dealt > 0) out.push(`${best.name}が最も多く削った。`);
    const fallen = c.filter(x => !x.survived);
    if (fallen.length) out.push(`${fallen.map(x => x.name).join("、")}は帰らなかった。`);
    const drank = world.facts.find(f => f.verb === "consume" && f.target === "allen");
    if (drank) out.push(`アレンは城下で${personName(world, drank.source)}の${DRINKS[drank.drinkId].name}を飲んでおり、この迎撃の間だけ動きが鈍っていた。`);
    if (world.outcome && !world.outcome.victory && world.battle && world.battle.nearMiss) {
      const nm = world.battle.nearMiss;
      out.push(`勇者一行はHPを${nm.enemyMaxHp - nm.closestRemaining}まで削られ、${nm.closestRemaining}を残して城へ入った。`);
    }
    return out;
  }

  // ラン記録。次のランの「あの応募者を採っていたら」の材料。
  function runRecord(world) {
    const hires = hiredPersons(world).filter(p => p.salary > 0);
    const drank = world.facts.find(f => f.verb === "consume" && f.target === "allen");
    const offer = world.facts.find(f => f.verb === "offer" && f.target === "allen");
    return {
      seed: world.seed,
      victory: !!(world.outcome && world.outcome.victory),
      kind: world.outcome ? world.outcome.kind : "unfinished",
      hires: hires.map(p => p.name),
      spent: world.spent,
      condition: world.condition.name,        // 終わってから明かす
      bet: offer ? (drank ? "当たり" : "外れ") : "賭けなし",
      drink: drank ? DRINKS[drank.drinkId].name : null,
      survivors: hiredPersons(world).filter(p => p.alive).map(p => p.name),
      lost: world.persons.filter(p => p.hired && !p.alive).map(p => p.name),
      // 採用の答え合わせ。判明したものだけを書く（採らなかった人の中身は明かさない）
      found: world.facts.filter(f => f.verb === "reveal")
        .map(f => `${personName(world, f.actor)}：${HIDDEN_TRAITS[f.trait].label}`),
      passed: world.facts.filter(f => f.verb === "pass").map(f => personName(world, f.target))
    };
  }

  const api = {
    PLACES, JOBS, RESIDENTS, APPLICANT_POOL, RANKS, HERO_PARTY, PATROL_PARTY,
    GUEST_CONDITIONS, DRINKS, BUDGET, MAX_ROSTER,
    HIDDEN_TRAITS, APPLICANTS_PER_RUN,
    makeRng, newWorld, person, hiredPersons, applicants, remainingBudget,
    placeOf, grants, rankOf, statsOf, brewableBy,
    currentApplicant, canAfford, pass, interviewDone, closeInterview,
    revealHidden, shownStats, shownRank,
    toUnit, heroUnits, hire, assign, setServePolicy, candidateActions,
    advance, arrivalReport, deployable, resolveInterception, outcomeSentences, runRecord
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HeroArrivalWorld = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
