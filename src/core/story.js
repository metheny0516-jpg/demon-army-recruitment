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
  },

  chapterFor(st) {
    const c = Math.max(0, Number(st.conquest) || 0);
    const hit = STORY_CHAPTERS.find(ch => c >= ch.conquest[0] && c <= ch.conquest[1]);
    return hit || STORY_CHAPTERS[STORY_CHAPTERS.length - 1];
  },

  chapter(st) { return STORY_CHAPTERS.find(ch => ch.n === (st.story ? st.story.chapter : 1)) || STORY_CHAPTERS[0]; },

  // 名前の差し込み口。幹の文面が読む。
  helpers(st) {
    return {
      staffNames: () => st.roster.map(m => m.name),
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
      if (beat.trigger !== trigger) continue;
      if (s.seen.includes(beat.id)) continue;
      if (beat.chapter > now) continue;
      // 章の場面は「その章になったとき」に一度だけ。飛び越えた章の場面は出さない（古い話を今しない）。
      if (beat.trigger === "after_battle" && /_open$/.test(beat.id) && beat.chapter < now) { s.seen.push(beat.id); continue; }
      let ok = true;
      try { ok = !beat.check || !!beat.check(st); } catch (e) { ok = false; }
      if (!ok) continue;
      const cast = beat.cast ? beat.cast(st) : {};
      let text = "";
      try { text = beat.text(st, this.helpers(st)); } catch (e) { text = ""; }
      if (!text) continue;
      s.seen.push(beat.id);
      s.queue.push({ id: beat.id, kicker: beat.kicker || "", title: beat.title || "", cast, text, html: beat.html || null, chapter: beat.chapter });
      queued++;
    }
    s.chapter = now;
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

  // 救援作戦の札。進軍の札を元に名前と敵名だけ差し替える（数値は段階1のまま）。
  rescueMission(mission) {
    const names = ["開拓保護隊の兵テト", "開拓保護隊の兵ポル", "開拓保護隊の兵ネス", "開拓保護隊の兵ロイ"];
    return {
      ...mission,
      story: "goblin_rescue",
      missionTitle: "ゴブリン村を救援する",
      strategyLabel: "救援",
      strategyHint: "王国軍に囲まれたゴブリンの村を解放する。第一章の最初の出撃。",
      description: "包囲しているのは開拓保護隊。名目は盗賊討伐。伍長は令状を信じている。",
      army: "開拓保護隊",
      region: "ゴブリン村",
      units: mission.units.map((u, i) => ({ ...u, name: names[i % names.length] }))
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
    return [{ id: pick.id, slot, title: pick.title, cast: stored, text }];
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
      flaw: "門から離れると落ち着かない", quote: "……通れ。魔王様だろ", salary: 2, loyalty: 92, department: "home"
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
