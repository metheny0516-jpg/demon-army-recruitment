// 第二幕の中身（データのみ）：新種族3・技6・敵段階9〜14・事件2。
//   node tools/test-act2-content.js
// **今の幕（第一幕）では出ないこと**が最重要。応募に混ざらず、段階9へも進めない。
const fs = require('fs'), vm = require('vm');
const dataFiles = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js'
];
const coreFiles = ['src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of [...dataFiles, ...coreFiles]) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const get = name => vm.runInContext(name, ctx);
const TRAITS = get('TRAITS'), Game = get('Game'), Battle = get('Battle');
const ACT2 = get('typeof MONSTER_TEMPLATES_ACT2 !== "undefined" ? MONSTER_TEMPLATES_ACT2 : null');
const STAGES = get('ENEMY_STAGES');
const STAGES2 = get('typeof ENEMY_STAGES_ACT2 !== "undefined" ? ENEMY_STAGES_ACT2 : null');
const CAP = get('typeof ACT_STAGE_CAP !== "undefined" ? ACT_STAGE_CAP : null');
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };

const SPECIES = ['succubus', 'minotaur', 'lich'];
const TIER1 = { succubus: 'allure', minotaur: 'charge', lich: 'soul_drain' };
const TIER2 = { succubus: 'enthrall', minotaur: 'rampage', lich: 'death_pulse' };

// ── 1. 新種族3体の形 ───────────────────────────────
assert(Array.isArray(ACT2) && ACT2.length === 3, `第二幕の種族は3体（${ACT2 ? ACT2.length : "配列が無い"}）`);
for (const id of SPECIES) {
  const t = (ACT2 || []).find(x => x.id === id);
  assert(!!t, `${id} がいる`);
  if (!t) continue;
  assert(t.tier === 4, `${id} は tier 4（${t.tier}）`);
  assert(t.act === 2, `${id} に act: 2 の印がある`);
  assert(!!t.race && typeof t.race === "string", `${id} に種族名がある（${t.race}）`);
  assert(t.jobs.length === 5, `${id} の jobs は5（${t.jobs.length}）`);
  for (const key of ['prevJobs', 'motives', 'flaws', 'names', 'quotes']) {
    assert(t[key].length >= 8, `${id} の ${key} は8以上（${t[key].length}）`);
  }
  const voiceKeys = ['dead', 'mvp', 'idle', 'hurt', 'unpaid', 'win', 'lose', 'hungry', 'feast', 'chain'];
  for (const key of voiceKeys) {
    assert(Array.isArray(t.voices[key]) && t.voices[key].length >= 3,
      `${id} の voices.${key} が3本以上（${(t.voices[key] || []).length}）`);
  }
  // 2026-09-12：1段目の癖のうち行動だったもの（誘惑・突進）は技（SKILLS）へ移った。テンプレートは skills で種族技を持つ。
  const SPECIES_SKILL = vm.runInContext('SPECIES_SKILL', ctx);
  assert((t.skills || []).includes(SPECIES_SKILL[id]) || t.fixedTraits.includes(TIER1[id]),
    `${id} は種族技 ${SPECIES_SKILL[id]} を持つ（旧1段目 ${TIER1[id]} は技へ移った）`);
  assert(t.traitPool.every(p => TRAITS[p]), `${id} の traitPool は既存の特性だけ`);
  assert(t.base && t.base.hp > 0 && t.base.atk > 0, `${id} に base がある`);
}
// 台詞の縛り：全角28文字以内・数字を言わない
{
  const bad = [];
  for (const t of ACT2 || []) {
    for (const line of [...t.quotes, ...Object.values(t.voices).flat()]) {
      if ([...line].length > 28) bad.push(`${t.id}「${line}」が長い（${[...line].length}字）`);
      if (/[0-9０-９]|[%％]/.test(line)) bad.push(`${t.id}「${line}」が数値を言っている`);
    }
  }
  assert(bad.length === 0, `台詞は28字以内・数値なし${bad.length ? `：${bad.slice(0, 3).join(" / ")}` : ""}`);
}

// ── 2. 技6つ ─────────────────────────────────────
for (const id of SPECIES) {
  const upper = TRAITS[TIER2[id]], lower = TRAITS[TIER1[id]];
  assert(!!lower, `${TIER1[id]}（1段目）がある`);
  assert(!!upper && !!upper.skill, `${TIER2[id]}（上位技）がある`);
  if (!upper || !upper.skill) continue;
  // wizard≠mage の事故の再発防止：species はテンプレートの id と一致していること
  assert((ACT2 || []).some(t => t.id === upper.skill.species),
    `${TIER2[id]} の species がテンプレートの id と一致（${upper.skill.species}）`);
  assert(upper.skill.tier === 2, `${TIER2[id]} は tier 2`);
  assert(upper.skill.replaces === TIER1[id], `${TIER2[id]} が置き換えるのは ${TIER1[id]}`);
  assert(upper.autoLimit === 1, `${TIER2[id]} の autoLimit は1`);
  assert(upper.order && upper.order.cost >= 1 && upper.order.cost <= 3,
    `${TIER2[id]} の号令の代償は1〜3（${upper.order && upper.order.cost}）`);
  for (const key of ['unlock', 'use', 'order']) {
    assert((upper.lines[key] || []).length >= 3, `${TIER2[id]} の lines.${key} が3本以上`);
  }
  // 1段目も号令できる（既存の1段目と同じ作り）
  assert(lower.order && (lower.lines.order || []).length >= 3, `${TIER1[id]} も号令の台詞を持つ`);
}
{
  const bad = [];
  for (const id of [...Object.values(TIER1), ...Object.values(TIER2)]) {
    for (const line of Object.values(TRAITS[id].lines || {}).flat()) {
      if ([...line].length > 28) bad.push(`${id}「${line}」（${[...line].length}字）`);
      if (/[0-9０-９]|[%％]/.test(line)) bad.push(`${id}「${line}」が数値を言っている`);
    }
  }
  assert(bad.length === 0, `技の台詞も28字以内・数値なし${bad.length ? `：${bad.slice(0, 3).join(" / ")}` : ""}`);
}

// ── 3. 技が battle.js で落ちない ─────────────────────
// chain.js の CLASSIFY に第二幕の技は無いので、ctx.trigger を呼ぶと例外が飛ぶ。
// 呼んでいないことを、実際に戦闘を回して確かめる。
{
  vm.runInContext('U.rand = () => 0.5; U.chance = () => true; U.pick = arr => arr[0];', ctx);
  const mk = (name, traits, side, x) => Battle.makeUnit(Object.assign({
    uid: name, name, race: 'サキュバス', tplId: 'succubus', hp: 120, atk: 14, def: 4, spd: 6,
    traits, tags: [], loyalty: 80 }, x || {}), side);
  for (const id of [...Object.values(TIER1), ...Object.values(TIER2)]) {
    let ok = true, why = '';
    try {
      const ally = mk('使い手', [id], 'player');
      const mate = mk('相棒', [], 'player', { hp: 200 });
      const foes = [mk('敵1', [], 'enemy', { race: '人間', hp: 90, atk: 8 }),
        mk('敵2', [], 'enemy', { race: '人間', hp: 90, atk: 8 }),
        mk('敵3', [], 'enemy', { race: '人間', hp: 90, atk: 8 })];
      const r = Battle.simulate([ally, mate], foes, {});
      ok = Array.isArray(r.timeline) && r.timeline.length > 0;
    } catch (e) { ok = false; why = e.message; }
    assert(ok, `${id} を持たせた戦闘が最後まで回る${why ? `（${why}）` : ""}`);
  }
  vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);
}

// ── 4. 敵段階9〜14 ───────────────────────────────
assert(Array.isArray(STAGES2) && STAGES2.length === 6, `第二幕の段階は6つ（${STAGES2 ? STAGES2.length : "配列が無い"}）`);
if (STAGES2) {
  assert(STAGES2.every((s, i) => s.stage === 9 + i), `stage が9〜14の連番（${STAGES2.map(s => s.stage).join(",")}）`);
  assert(STAGES2.every(s => s.units.length >= 2 && s.units.length <= 5), 'units は2〜5体');
  assert(STAGES2.every(s => (s.variants || []).length >= 1), 'variants が各段階に1つ以上');
  const rewards = STAGES2.map(s => s.reward);
  assert(rewards.every((r, i) => i === 0 || r > rewards[i - 1]), `reward が単調増加（${rewards.join(",")}）`);
  assert(rewards[0] > STAGES[STAGES.length - 1].reward,
    `段階9の報酬が段階8より大きい（${STAGES[STAGES.length - 1].reward} → ${rewards[0]}）`);
  const last = STAGES2[STAGES2.length - 1];
  assert(/勇者/.test(last.army), `段階14は勇者一行（${last.army}）`);
  assert(last.units.some(u => /カイ/.test(u.name)), '竜騎士カイがいる');
  assert(last.units.some(u => (u.traits || []).includes('hero_awaken')), '勇者に hero_awaken');
  assert(last.units.some(u => u.introQuote), '勇者に口上がある');
  // 敵用の特性フックはまだ無いので、hero_awaken 以外の traits は付けない
  const extra = STAGES2.flatMap(s => (s.units || []).flatMap(u => (u.traits || [])))
    .filter(t => t !== 'hero_awaken');
  assert(extra.length === 0, `hero_awaken 以外の敵特性は付けない（${extra.join(",") || "なし"}）`);
}
assert(CAP && CAP[1] === 8 && CAP[2] === 14, `ACT_STAGE_CAP が幕ごとの上限を持つ（${JSON.stringify(CAP)}）`);

// ── 5. 今の幕では出ない（いちばん大事）──────────────────
{
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false;
  const drawn = new Set();
  for (let i = 0; i < 200; i++) {
    st.conquest = i % 8; st.turn = 1;
    drawn.add(Game.rollApplicant().tplId);
  }
  const leaked = SPECIES.filter(id => drawn.has(id));
  assert(leaked.length === 0, `200回引いても第二幕の種族は応募に混ざらない（${leaked.join(",") || "混ざらない"}）`);
}
{
  // 第一幕の着地を壊していない：段階表の長さと MAX_CONQUEST
  assert(STAGES.length === 8, `第一幕の段階表は8のまま（${STAGES.length}）`);
  assert(Game.MAX_CONQUEST === 8, `MAX_CONQUEST は8のまま（${Game.MAX_CONQUEST}）`);
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false;
  st.conquest = 7; st.turn = 30;
  assert(Game.armyLevel() === 8, `魔王軍レベルの上限も8のまま（${Game.armyLevel()}）`);
  const types = get('MISSION_TYPES');
  const mission = Game.buildMission(types.find(t => t.id === 'invade'));
  assert(mission.baseStage === 8, `進軍で引ける最大の段階は8（${mission.baseStage}）`);
}

// ── 6. 事件2つ ───────────────────────────────────
{
  const EVENTS = get('EVENTS');
  const act2Events = EVENTS.filter(e => {
    const src = String(e.check || '') + String(e.cast || '');
    return SPECIES.some(id => src.includes(id)) || /サキュバス|ミノタウロス|リッチ/.test(src);
  });
  assert(act2Events.length >= 2, `新種族の事件が2件以上（${act2Events.length}）`);
  // 今の幕では発火しない（新種族が名簿に入らないので check が通らない）
  Game.newRun();
  const st = Game.state;
  st.roster = st.roster || [];
  const fired = act2Events.filter(e => { try { return !!e.check(st); } catch (x) { return false; } });
  assert(fired.length === 0, `第二幕の事件は今の名簿では起きない（${fired.map(e => e.id).join(",") || "起きない"}）`);
  // 種族名を文へ直書きしていない
  const bad = act2Events.filter(e => /サキュバス|ミノタウロス|リッチ/.test(String(e.text || '')));
  assert(bad.length === 0, `事件の文に種族名を直書きしていない（${bad.map(e => e.id).join(",") || "なし"}）`);
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
