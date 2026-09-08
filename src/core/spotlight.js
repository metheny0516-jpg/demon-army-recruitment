// 戦果の「なぜそうなったか」を1文ぶんの**事実**に落とすAPI（設計書 6.1 / チケットB1）。
//
// ここは読むだけ。戦闘計算にもラン状態にも触らない。タイムラインを後から読み直して、
// 「誰の能力が、誰の何を動かし、その結果どうなったか」を根拠つきで1件返す。
//
// ── 文章はここで作らない ────────────────────────────────
// 引き継ぎメモ 2-1 の約束どおり「計算」と「見せ方」を分ける。返すのは名前・数値・
// 根拠イベントIDだけで、日本語の組み立てはUI側（ui.js）が持つ。
// ここで文字列を作ると、同じ事実の言い方が戦果・モルモ・魔界史で三重管理になる。
//
// ── 証拠が無ければ出さない ──────────────────────────────
// 設計書 6.1:「該当する証拠がなければ文を出さない。『変えたから勝った』と反実仮想を
// 断言しない。」したがって各 kind は、**接続の両端が実イベントとして揃ったときだけ**
// 候補になる。片方しか無いものは候補にすらしない（null を返す）。
const Spotlight = {
  // 出力契約のバージョン。保存された戦果を読む側が推定変換しないための目印。
  DEF_VERSION: 1,

  // 選ぶ順序（同点なら先に定義した kind が勝つ）。
  //
  // 設計書の優先順は「今回変えた人の確実な働き → 初めての接続 → 既存の代表経路」。
  // 1番目には前回出撃との差分（チケットR2の buildChanges）が要るが、まだ無い。
  // **無いものを推測で埋めない**ので、いまは2番目以降だけを実装している。
  // 実装している範囲での順序は「結果がどこまで届いたか」で決める:
  //   撃破まで届いた > 追加の行動が起きた > 効果量だけ
  // これは第4節「接続数」を見せるための順序であって、強さの順ではない。
  reach(candidate) {
    if (!candidate) return 0;
    if (candidate.numbers && candidate.numbers.killed) return 3;
    if (candidate.numbers && candidate.numbers.actions > 0) return 2;
    return 1;
  },

  of(timeline) {
    const events = (timeline || []).filter(Boolean);
    if (!events.length) return null;
    const candidates = [
      lootRelay(events),
      mealBoost(events),
      reviveReturn(events)
    ].filter(Boolean);
    if (!candidates.length) return null;
    const best = candidates.reduce((top, c) =>
      this.reach(c) > this.reach(top) ? c : top, candidates[0]);
    // 保存して読み直せる形だけにする（関数・循環を持ち込まない）。
    return JSON.parse(JSON.stringify({ defVersion: this.DEF_VERSION, candidateCount: candidates.length, ...best }));
  }
};

// 表示に使う名前は battle_start のスナップショットと summon から引く（text を解析しない）。
function nameIndex(events) {
  const names = new Map();
  for (const e of events) {
    if (e.type === "battle_start") for (const u of [...(e.player || []), ...(e.enemy || [])]) names.set(u.id, u.name);
    if (e.type === "summon" && e.unit) names.set(e.unit.id, e.unit.name);
  }
  return names;
}

const person = (names, id) => id ? { id, name: names.get(id) || null } : null;

// ① 略奪 → 追撃。「グルグの略奪を受け、ボルが追撃した」
//
// 金貨獲得を親に持つ反応のうち、**実際に攻撃という形になったもの**だけを採る。
// 倍率だけの反応（追い剥ぎコンビ・恐喝帳簿）は行動を起こしていないので、
// これ単独では「誰が動いた」と書けない。書けないものは候補にしない。
function lootRelay(events) {
  const names = nameIndex(events);
  const byId = new Map(events.filter(e => e.eventId).map(e => [e.eventId, e]));
  for (const reaction of events) {
    if (reaction.type !== "trait_trigger" || !reaction.parentEventId) continue;
    const gold = byId.get(reaction.parentEventId);
    if (!gold || gold.type !== "resource_gain" || gold.resource !== "gold") continue;
    // その宣言が実際に起こした攻撃（親子でたどる。時間的な隣接では結び付けない）
    const hit = events.find(e => e.parentEventId === reaction.eventId
      && (e.type === "attack" || e.type === "splash"));
    if (!hit) continue;
    const origin = person(names, gold.sourceId);
    const actor = person(names, reaction.sourceId || hit.fromId);
    if (!origin || !actor) continue;
    return {
      kind: "loot_relay",
      origin, originAbility: gold.label || null,
      actor, ability: { id: reaction.traitId || null, name: reaction.name || null },
      target: person(names, hit.toId),
      // 同じ人が自分の金貨に自分で反応した場合も事実としては正しいが、
      // 「人材どうしが繋がった」ではないので印を立てて、文言を変えられるようにする。
      sameActor: origin.id === actor.id,
      numbers: { gold: gold.amount || 0, dmg: hit.dmg || 0, actions: 1, killed: !!hit.dead },
      evidence: [gold.eventId, reaction.eventId, hit.eventId].filter(Boolean)
    };
  }
  return null;
}

// ② 料理 → 強化 → 撃破。「ミミの料理がドンを強化。ドンが騎士を撃破した」
//
// 強化された者の**最初の有効打**まで揃ったときだけ候補にする。
// 強化しただけで一度も殴らずに終わった戦闘は、着地の証拠が無いので出さない。
function mealBoost(events) {
  const names = nameIndex(events);
  const cook = events.find(e => e.type === "trait_trigger" && e.traitId === "demon_cook" && e.targetId);
  if (!cook) return null;
  const hit = events.find(e => e.mealBoost && e.mealBoost.first);
  if (!hit) return null;
  const origin = person(names, cook.sourceId);
  const actor = person(names, cook.targetId);
  if (!origin || !actor) return null;
  return {
    kind: "meal_boost",
    origin, originAbility: cook.name || null,
    actor, ability: null,
    target: person(names, hit.toId),
    sameActor: origin.id === actor.id,
    numbers: {
      percent: cook.amountPercent || hit.mealBoost.amountPercent || 0,
      dmg: hit.dmg || 0, actions: 1, killed: !!hit.dead
    },
    evidence: [cook.eventId, hit.eventId].filter(Boolean)
  };
}

// ③ 蘇生 → 復帰後の行動。「ネルがガロを蘇生。ガロは復帰後に2回攻撃した」
//
// 他者による蘇生だけを採る。執念の自力復活は「人材どうしの接続」ではないので、
// 事実としては正しくてもこの1文の役には立たない。
// 復帰後の行動は、蘇生イベントより後ろにある本人の攻撃を数える。
function reviveReturn(events) {
  const names = nameIndex(events);
  const at = events.findIndex(e => e.type === "revive" && e.sourceId && e.sourceId !== e.unitId);
  if (at < 0) return null;
  const revive = events[at];
  const after = events.slice(at + 1)
    .filter(e => (e.type === "attack" || e.type === "splash") && e.fromId === revive.unitId);
  if (!after.length) return null;   // 復帰したが何もしないまま終わった → 着地の証拠が無い
  const origin = person(names, revive.sourceId);
  const actor = person(names, revive.unitId);
  if (!origin || !actor) return null;
  const killer = after.find(e => e.dead) || null;
  return {
    kind: "revive_return",
    origin, originAbility: revive.traitId === "necromancy" ? "死霊術" : null,
    actor, ability: { id: revive.traitId || null, name: null },
    target: killer ? person(names, killer.toId) : null,
    sameActor: false,
    numbers: {
      actions: after.length,
      dmg: after.reduce((sum, e) => sum + (e.dmg || 0), 0),
      killed: !!killer
    },
    evidence: [revive.eventId, ...after.map(e => e.eventId)].filter(Boolean)
  };
}

if (typeof module !== "undefined") module.exports = { Spotlight };
