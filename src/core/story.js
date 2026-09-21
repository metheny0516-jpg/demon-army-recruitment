// ストーリーの進行（第一幕）。設計は docs/STORY_ACT1_DESIGN_2026-09-18.md。
// データは src/data/story_act1.js。ここは「いつ・誰に・何を差すか」だけ。
//
// 契約：
//   st.story = { chapter, seen: [beatId...], flags: {}, npcs: {}, queue: [beat...], next: phase|null }
//   Story.enabled … false なら何もしない（sim・既存テストは既定で false。ブラウザは true）
//   Story.queueBeats(st, trigger) … 幹の場面を st.story.queue に積む。積めば true
//   Story.rollScenes(st, slot, party, ctx) … 枝を最大1本引いて effect を適用し、表示用の場面を返す
//   Story.mark(st, tag, uid, data) … 痕跡 `story`（object=tag）を1件積む
const Story = {
  // ブラウザでは有効。`index.html?nostory=1` で無効（既存のブラウザ回帰テストはこれで物語を飛ばす）。
  // node（sim・テスト）では既定で無効。物語のテストは Story.enabled = true にして走らせる。
  enabled: (typeof window !== "undefined" && !/nostory/.test(String(window.location && window.location.search || ""))),

  init(st) {
    if (!st) return;
    if (!st.story || typeof st.story !== "object") {
      st.story = { chapter: 1, seen: [], flags: {}, npcs: {}, queue: [], next: null };
    }
    const s = st.story;
    if (!Array.isArray(s.seen)) s.seen = [];
    if (!s.flags) s.flags = {};
    if (!s.npcs) s.npcs = {};
    if (!Array.isArray(s.queue)) s.queue = [];
    if (typeof s.chapter !== "number") s.chapter = 1;
    if (this.routeEnabled() && !s.route) {
      s.route = { version: 1, completed: {}, pending: [], shown: [] };
      // 未読の旧「征服度だけ」の章場面は新しい事実ベースの報告へ置き換える。
      if (s.queue.some(b => b.id === "finale")) s.seen = s.seen.filter(id => id !== "finale");
      s.queue = s.queue.filter(b => !(b.chapter >= 2) || /^route_/.test(b.id));
      // 戦闘・編成中の選択は捨てない。作戦会議だけ次の描画で札を更新する。
      if (st.phase === "mission") st.missionOffers = [];
    }
  },

  chapterFor(st) {
    const c = Math.max(0, Number(st.conquest) || 0);
    const hit = STORY_CHAPTERS.find(ch => c >= ch.conquest[0] && c <= ch.conquest[1]);
    return hit || STORY_CHAPTERS[STORY_CHAPTERS.length - 1];
  },

  chapter(st) { return STORY_CHAPTERS.find(ch => ch.n === (st.story ? st.story.chapter : 1)) || STORY_CHAPTERS[0]; },

  // 名前の差し込み口。幹の文面が読む。
  // 聞き返し役。物語の説明を「え、どういうこと？」と聞き直す係。名簿からその場面ごとに一人選ぶ
  // （ガンツは永久にいるわけではないので固定しない。オーナー指示 2026-09-18）。口調は性別で変える。
  pickAsker(st) {
    const pool = (st.roster || []).filter(m => m && m.name);
    if (!pool.length) return null;
    const m = U.pick(pool);
    const tpl = (typeof MONSTER_TEMPLATES !== "undefined" ? MONSTER_TEMPLATES : []).concat(typeof MONSTER_TEMPLATES_ACT2 !== "undefined" ? MONSTER_TEMPLATES_ACT2 : []).find(t => t.id === m.tplId);
    return { uid: m.uid, name: m.name, gender: m.gender || (tpl && tpl.gender) || "male" };
  },

  helpers(st, asker) {
    return {
      asker: () => asker || null,
      staffNames: () => st.roster.map(m => m.name),
      // 聞き返し役。門番ガンツ（最初から城にいるオーク）。いなければ null（その行は出さない）
      gantz: () => st.roster.find(m => m.staff && m.name === "ガンツ") || null,
      villager: () => st.roster.find(m => /ゴブリン村の出/.test(m.prevJob || "")) || null,
      oldestName: () => {
        const list = st.roster.filter(m => m.uid !== undefined).slice().sort((a, b) => a.uid - b.uid);
        return list.length ? list[0].name : null;
      }
    };
  },

  // 幹。trigger に合う未見の場面を全部（章の順に）積む。章の更新もここで行う。
  queueBeats(st, trigger) {
    if (!this.enabled || !st) return false;
    this.init(st);
    const s = st.story;
    const now = this.chapterFor(st).n;
    let queued = 0;
    for (const beat of STORY_BEATS) {
      // 地図ありの本編は征服度ではなく、実際の場所・決着で第二章以降を進める。
      if (this.routeEnabled() && beat.chapter >= 2) continue;
      if (beat.trigger !== trigger) continue;
      if (s.seen.includes(beat.id)) continue;
      if (beat.chapter > now) continue;
      // 章の場面は「その章になったとき」に一度だけ。飛び越えた章の場面は出さない（古い話を今しない）。
      if (beat.trigger === "after_battle" && /_open$/.test(beat.id) && beat.chapter < now) { s.seen.push(beat.id); continue; }
      let ok = true;
      try { ok = !beat.check || !!beat.check(st); } catch (e) { ok = false; }
      if (!ok) continue;
      const h = this.helpers(st, this.pickAsker(st));
      let cast = {};
      try { cast = beat.cast ? beat.cast(st, h) : {}; } catch (e) { cast = {}; }
      let text = "";
      try { text = beat.text(st, h); } catch (e) { text = ""; }
      if (!text) continue;
      s.seen.push(beat.id);
      const bg = typeof beat.bg === "function" ? beat.bg(st) : (beat.bg || null);
      s.queue.push({ id: beat.id, kicker: beat.kicker || "", title: beat.title || "", cast, text, html: beat.html || null, chapter: beat.chapter, bg, mormo: beat.mormo || null });
      queued++;
    }
    s.chapter = now;
    if (this.routeEnabled()) queued += this.queueRoute(st, trigger);
    return queued > 0;
  },

  currentBeat(st) { return st && st.story && st.story.queue && st.story.queue[0] || null; },
  shiftBeat(st) { if (st && st.story && st.story.queue) st.story.queue.shift(); },

  // 第1章の最初の出撃：救援。まだ決着していなければ、作戦会議は救援一択。
  rescuePending(st) {
    if (!this.enabled || !st) return false;
    this.init(st);
    return this.chapterFor(st).n === 1 && !st.story.flags.rescueResolved
      && !(st.counterattack && st.counterattack.pending);
  },

  // 救援作戦の札。地図の「ゴブリンの丘」（魔王城の隣）を舞台にし、勝てばそこが領土になる
  // （従えた部族と同じ扱い＝ゴブリンが応募に来る）。敵は開拓保護隊（数値は場所の守備段階のまま）。
  // 地図が無い環境では進軍の札を元にする。
  rescueMission(game) {
    const place = typeof Territory !== "undefined" ? Territory.byId("t01") : null;
    const invade = MISSION_TYPES.find(m => m.id === "invade");
    const suppress = MISSION_TYPES.find(m => m.id === "suppress");
    // 札の骨（場所・領土の印）は「従える」の型で、敵は**人間の段階表**から作る。
    // 従えるの型の敵は反乱軍＝魔物の姿になる（rebelLook）ので、そのままだと王国軍がゾンビになる（オーナー試遊 2026-09-18）。
    const shell = game.buildMission(place ? suppress : invade, null, place || undefined);
    const humans = game.buildMission(invade);
    const names = ["開拓保護隊の兵テト", "開拓保護隊の兵ポル", "開拓保護隊の兵ネス", "開拓保護隊の兵ロイ"];
    const units = (humans.units || []).filter(u => !u.captain && !u.rebel)
      .map((u, i) => ({ ...u, name: names[i % names.length] }));
    return {
      ...shell,
      story: "goblin_rescue",
      twoStage: false, missionPhase: "main",
      territoryLine: "救えば、村のゴブリンが応募に来る",
      missionTitle: "ゴブリン村を救援する",
      strategyLabel: "救援",
      strategyHint: "王国軍に囲まれたゴブリンの村を解放する。第一章の最初の出撃。",
      description: "包囲しているのは開拓保護隊。名目は盗賊討伐。伍長は令状を信じている。",
      army: "開拓保護隊",
      region: "ゴブリン村",
      reward: humans.reward,
      formationId: humans.formationId, formationName: humans.formationName, formationHint: humans.formationHint,
      units
    };
  },

  // 枝。slot に合う場面のうち、接点のある者がいるものから1本。effect を適用して表示用を返す。
  rollScenes(st, slot, party, ctx) {
    if (!this.enabled || !st || !Array.isArray(party) || !party.length) return [];
    this.init(st);
    const mission = (ctx && ctx.mission) || {};
    const pool = [];
    for (const sc of STORY_SCENES) {
      if (sc.slot !== slot) continue;
      if (sc.missions && !sc.missions.includes(mission.story)) continue;
      let hit = null;
      try { hit = sc.check(st, party, mission, ctx); } catch (e) { hit = null; }
      if (hit) pool.push(sc);
    }
    if (!pool.length) return [];
    // 道中は「何も起きない」も起きる（枝を毎回引かない）。戦後の救援の決着は必ず引く。
    const must = pool.some(sc => sc.missions);
    if (!must && slot !== "aftermath" && !U.chance(this.ROAD_CHANCE)) return [];
    const total = pool.reduce((a, sc) => a + (sc.weight || 1), 0);
    let r = U.rand() * total, pick = pool[0];
    for (const sc of pool) { r -= (sc.weight || 1); if (r <= 0) { pick = sc; break; } }
    const castIds = pick.cast(st, party) || {};
    const cast = this.resolveCast(st, castIds);
    ctx.party = party;
    try { pick.effect(st, cast, ctx); } catch (e) { /* 場面が失敗してもゲームは止めない */ }
    let text = "";
    try { text = pick.text(st, cast); } catch (e) { text = ""; }
    if (!text) return [];
    const stored = {};
    for (const k of Object.keys(castIds)) if (castIds[k] !== undefined) stored[k] = castIds[k];
    return [{ id: pick.id, slot, title: pick.title, cast: stored, text, bg: pick.bg || null }];
  },
  ROAD_CHANCE: 0.7,

  // cast の値：数値 uid → 名簿の者、"k:id" → 王国側の人物、"mormo" → モルモ。
  resolveCast(st, cast) {
    const out = {};
    for (const k of Object.keys(cast || {})) {
      const v = cast[k];
      if (v === undefined) continue;
      if (typeof v === "number") out[k] = st.roster.find(m => m.uid === v) || this.departedStub(st, v);
      else if (v === "mormo") out[k] = { name: "モルモ", mormo: true };
      else if (typeof v === "string" && v.startsWith("k:")) {
        const kc = KINGDOM_CAST[v.slice(2)];
        out[k] = kc ? { name: kc.name, race: kc.title, icon: kc.icon, kingdom: kc.id } : null;
      } else if (typeof v === "string" && v.startsWith("n:")) {
        const id = v.slice(2);
        const npc = (typeof STORY_NPCS !== "undefined" && STORY_NPCS[id]) || (st.story && st.story.npcs && st.story.npcs[id]) || null;
        out[k] = npc ? { name: npc.name, race: npc.title || npc.race || "ゴブリン村", icon: npc.icon || "🙂", tplId: npc.tplId || (id === "villageYouth" ? "goblin" : undefined), npc: true } : null;
      } else out[k] = null;
    }
    return out;
  },

  departedStub(st, uid) {
    const d = (st.departed || []).find(x => x.uid === uid);
    return d ? { name: d.name, race: d.race, tplId: d.tplId, uid, gone: true } : null;
  },

  villageYouthName(st) {
    const used = new Set(st.roster.map(m => m.name));
    return ["ピコ", "ズック", "ガビ", "ノロ", "モグ", "ケチャ"].find(n => !used.has(n)) || "ピコ";
  },

  // 痕跡 `story`。object にタグを入れる（kind を増やさない）。
  mark(st, tag, uid, data) {
    if (typeof Traces === "undefined" || !st || !Array.isArray(st.traces)) return null;
    return Traces.record(st.traces, { kind: "story", subject: typeof uid === "number" ? uid : null, object: tag, data: data || {}, day: st.day, turn: st.turn });
  },
  count(st, tag) { return (typeof Traces === "undefined" || !st) ? 0 : Traces.count(st.traces, { kind: "story", object: tag }); },

  // 根：救った村から応募者が来る（第2章以降・一度だけ）。縁の枠と同じく面接に1人混ぜる。
  villageApplicant(game) {
    const st = game.state;
    if (!this.enabled || !st || !st.story) return null;
    const youth = st.story.npcs.villageYouth;
    if (!youth || st.story.flags.villageRecruitSent) return null;
    if (this.chapterFor(st).n < 2 || !st.applicants.length) return null;
    if (!U.chance(0.6)) return null;
    const a = game.rollApplicant("goblin");
    const savior = st.roster.find(m => (youth.savedBy || []).includes(m.uid));
    a.name = youth.name;
    a.prevJob = "ゴブリン村の見張り（包囲されるまで）";
    a.motive = savior ? `${savior.name}に村を助けられました。今度は自分が` : "魔王軍に村を助けられました。恩を返しに";
    a.flaw = "焚き火の話を何度でもする";
    a.story = "village_youth";
    st.applicants[U.randInt(0, st.applicants.length - 1)] = a;
    st.story.flags.villageRecruitSent = true;
    return a;
  },

  // 開幕の「城の住人」。採用ではなく最初からいる者（履歴書経由ではない）。
  initialStaff(game) {
    const st = game.state;
    if (!this.enabled || !st) return;
    this.init(st);
    const gantz = game.rollApplicant("orc");
    Object.assign(gantz, {
      name: "ガンツ", job: "門番", prevJob: "魔王城の門番（前魔王の代から）", motive: "門があるので",
      flaw: "話が長いと途中で分からなくなる", quote: "……通れ。魔王様だろ", salary: 2, loyalty: 92, department: "home"
    });
    // 実働部隊は空のまま始める（「最初に誰が来るか」を採用に残す。レビュー 2026-09-18）。
    for (const m of [gantz]) {
      st.roster.push(m);
      game.memberRecord(m);
      game.baseOf(m);
      if (!m.skillTier) m.skillTier = 1;
      if (typeof m.spirit !== "number") m.spirit = game.spiritRules().start;
      if (!Array.isArray(m.relicIds)) m.relicIds = [];
      st.raceCounts[m.race] = (st.raceCounts[m.race] || 0) + 1;
      if (!st.recruitedTplIds.includes(m.tplId)) st.recruitedTplIds.push(m.tplId);
      m.staff = true;
    }
    st.maxArmySize = Math.max(st.maxArmySize || 0, st.roster.length);
  }
};

// 日誌の一行。タグごとの言い方（数値は言わない）。
Story.TAG_LINES = {
  saved_village: "ゴブリン村を救った",
  abandoned_village: "ゴブリン村を救えなかった",
  found_supply: "{subject}が逃げた先で補給の荷車を見つけた",
  fled: "{subject}が道中で逃げた",
  stood_ground: "{subject}が踏みとどまった",
  charged_early: "{subject}が命令の前に突っ込んだ",
  waited: "{subject}が今回は命令を待った",
  village_vouched: "{subject}のために仲間が村を取りなした",
  struck: "{subject}が迷わず踏み込んだ",
  raged: "{subject}が真っ先に踏み込み、敵の前衛を崩した",
  village_bill: "{subject}に村長から請求書が来た",
  speech: "{subject}が焚き火の前で演説した",
  drank_on_road: "{subject}が道中で飲んだ",
  night_route: "{subject}の案内で夜道を通った",
  village_helped: "村の投石が{subject}たちを助けた",
  village_feared: "村人が{subject}を見て門を閉めた",
  hesitated: "{subject}が人間の兵を前にためらった",
  looted_food: "{subject}が敵の荷から食料を持ち帰った",
  charmed_soldier: "{subject}に王国兵がついてきかけた"
};
Story.describe = function (trace, nameOf) {
  const tpl = this.TAG_LINES[trace.object] || `{subject}に何かがあった（${trace.object}）`;
  const name = typeof trace.subject === "number" ? (nameOf(trace.subject) || "誰か") : "誰か";
  return tpl.replace(/\{subject\}/g, name);
};

// 第一幕の正規筋。状態は既存の story 内だけに保存する。地図なしの旧試験は従来経路。
Object.assign(Story, {
  routeEnabled() { return this.enabled && typeof Territory !== "undefined" && typeof STORY_ROUTE !== "undefined"; },
  routeState(st) {
    this.init(st);
    if (!st.story.route) st.story.route = { version: 1, completed: {}, pending: [], shown: [] };
    const r = st.story.route;
    r.completed = r.completed || {};
    r.pending = Array.isArray(r.pending) ? r.pending : [];
    r.shown = Array.isArray(r.shown) ? r.shown : [];
    return r;
  },
  routeDone(st, step) {
    const r = this.routeState(st);
    return !!r.completed[step.id] || !!(!step.visit && step.place && Territory.has(st, step.place));
  },
  routeStep(st) {
    if (!this.routeEnabled() || (st.act || 1) !== 1 || !st.story?.flags.rescueResolved) return null;
    return STORY_ROUTE.find(step => !this.routeDone(st, step)) || null;
  },
  // 隣接を守り、目的地までの最短経路の最初の未領土を案内する。新しい道は作らない。
  routeWaypoint(st, target) {
    const owned = Territory.owned(st), queue = [[target]], seen = new Set([target]);
    while (queue.length) {
      const path = queue.shift(), id = path[path.length - 1];
      if (owned.has(id)) return path.length > 1 ? Territory.byId(path[path.length - 2]) : null;
      for (const next of Territory.neighbors(id)) {
        const place = Territory.byId(next);
        if (seen.has(next) || (next !== "castle" && (!place || place.act > 1))) continue;
        seen.add(next); queue.push(path.concat(next));
      }
    }
    return null;
  },
  routeObjective(st) {
    const step = this.routeStep(st);
    if (!step) return null;
    const waypoint = step.place ? this.routeWaypoint(st, step.place) : null;
    return { chapter: step.chapter, title: step.title, goal: step.goal,
      hint: st.counterattack?.pending ? "まず迫る敵を退ける。物語の目標はその後も残る。"
        : waypoint && waypoint.id !== step.place ? `まず${waypoint.name}から道を開く。` : step.hint };
  },
  // 候補から目的地への道が永久に抜けないよう1枚だけ加える。既存の選択肢は残す。
  routeOffers(game, offers) {
    const st = game.state, step = this.routeStep(st);
    if (!step || st.counterattack?.pending) return offers;
    if (!step.place) {
      if (!offers.some(m => m.storyRoute === step.id)) {
        const type = MISSION_TYPES.find(t => t.id === "suppress");
        const m = game.buildMission(type);
        m.storyRoute = step.id; m.missionTitle = "報復隊を止める";
        m.region = "魔王城の外門"; m.army = "報復を求める魔族";
        m.description = "捕虜を奪おうとする一団を止める。勝てば報復隊は解散する。";
        m.strategyHint = "捕虜を渡さず、武力で止める。領土は増えない。";
        // 通常の鎮圧と同じ数値・敵将処理。名無しの反乱兵だけ場面に合わせる。
        m.units = m.units.map((u, i) => u.captain ? u : { ...u, name: `報復隊の兵${i + 1}` });
        offers.unshift(m);
      }
    } else {
      const p = this.routeWaypoint(st, step.place);
      if (p && !offers.some(m => m.territoryId === p.id && m.territoryMode === "take")) {
        offers.unshift(game.buildMission(MISSION_TYPES.find(t => t.id === (Territory.isTribe(p.id) ? "suppress" : "invade")), null, p));
        const cost = Territory.tributeCost(p.id);
        if (cost) offers.push(game.tributeOffer(p, cost));
        else if (Territory.isLand(p.id)) offers.push(game.buildMission(MISSION_TYPES.find(t => t.id === "raid"), null, p));
      }
    }
    return offers.map(m => this.dressRouteMission(st, m));
  },
  dressRouteMission(st, mission) {
    if (!this.routeEnabled() || (st.act || 1) !== 1 || !mission || mission.training || mission.story === "goblin_rescue") return mission;
    const step = STORY_ROUTE.find(s => !s.visit && s.place === mission.territoryId && mission.territoryMode === "take");
    if (!step || this.routeDone(st, step)) return mission;
    mission.storyRoute = step.id;
    // 鉱山は地図ではコボルトの領域。オークも一緒に働く。戦闘員数値・敵将は変えない。
    if (step.id === "mine") {
      mission.missionTitle = "鉱山の占領軍を退ける";
      mission.army = "鉱山占領守備隊";
      mission.description = "コボルトとオークが働く鉱山を解放する。人間の作業員も残されている。";
      mission.units = mission.units.map((u, i) => u.captain ? u : { ...u, name: `鉱山守備兵${i + 1}`, tplId: null, race: "人間", icon: "🛡", rebel: false });
    }
    return mission;
  },
  routeScene(st, key, stage, slot) {
    const data = STORY_ROUTE_TEXT[key]?.[stage];
    if (!data) return null;
    const text = typeof data.text === "function" ? data.text(st) : data.text;
    return { id: `route_${key}_${stage}`, slot, title: data.title, bg: data.bg,
      kicker: stage === "intro" ? "作戦の目標" : stage === "post" ? "決着" : "現地",
      chapter: data.chapter, text, choices: data.choices || null, cast: { mormo: "mormo", ...(data.cast || {}) } };
  },
  routePre(st, mission) {
    if (!this.routeEnabled() || (st.act || 1) !== 1 || !mission?.storyRoute || mission.missionPhase === "outpost") return [];
    const scene = this.routeScene(st, mission.storyRoute, "pre", "arrival");
    return scene ? [scene] : [];
  },
  // 実際の勝利決着の後だけ呼ぶ。前哨・略奪・撤退・訓練からは達成しない。
  routeSettled(st, mission, won) {
    if (!this.routeEnabled() || !won || !mission?.storyRoute || mission.missionPhase === "outpost" || mission.training) return;
    const r = this.routeState(st), step = STORY_ROUTE.find(s => s.id === mission.storyRoute);
    if (!step || step.visit || r.completed[step.id]) return;
    if (step.place && (mission.territoryMode !== "take" || !Territory.has(st, step.place))) return;
    r.completed[step.id] = { turn: st.turn, place: step.place || null };
    const scene = this.routeScene(st, step.id, "post", "aftermath");
    if (scene) r.pending.push(scene);
    this.mark(st, "route_completed", null, { title: step.title, place: step.place || null });
  },
  queueRoute(st, trigger) {
    if (!["after_battle", "before_mission"].includes(trigger)) return 0;
    const r = this.routeState(st), queue = st.story.queue;
    let count = 0;
    const add = scene => {
      if (!scene || r.shown.includes(scene.id)) return;
      r.shown.push(scene.id); queue.push(scene); count++;
    };
    // 旧セーブの章場面を再生して矛盾させない。新規に決着した報告だけを積む。
    for (const scene of r.pending.splice(0)) add(scene);
    if (r.defenseDecision === "pending") {
      add(this.routeScene(st, "defense", "choice", "aftermath"));
      return count;
    }
    const ending = (st.actHistory || []).find(a => a.act === 1);
    if (ending && (st.act || 1) >= 2) {
      if (!st.story.seen.includes("finale")) {
        const key = ending.by === "conquest" && Territory.has(st, "h12") ? "capital" : "defense";
        add(this.routeScene(st, key, "ending", "aftermath"));
        st.story.seen.push("finale");
      }
      st.story.chapter = 8;
      return count;
    }
    let step = this.routeStep(st);
    // 町は砦へ向かう途中で制圧する地形。新たに攻略したふりをせず帰還報告で扱う。
    if (step?.visit && Territory.has(st, step.place)) {
      add(this.routeScene(st, step.id, "intro", "road"));
      add(this.routeScene(st, step.id, "post", "aftermath"));
      r.completed[step.id] = { turn: st.turn, place: step.place, visit: true };
      this.mark(st, "route_completed", null, { title: step.title, place: step.place });
      step = this.routeStep(st);
    }
    if (step) {
      st.story.chapter = step.chapter;
      add(this.routeScene(st, step.id, "intro", "road"));
    }
    return count;
  }
});
Story.TAG_LINES.route_completed = "魔王軍の物語が進んだ";
