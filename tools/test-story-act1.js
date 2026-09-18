// 第一幕のストーリー：幹が必ず出る／救援一択／枝が出撃者で変わる／痕跡 story が残り消えない。
//   node tools/test-story-act1.js
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js', 'src/data/mormo_lines.js', 'src/data/story_act1.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js',
  'src/core/chain.js', 'src/core/spotlight.js', 'src/core/traces.js', 'src/core/story.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const Story = vm.runInContext('Story', ctx);
const Traces = vm.runInContext('Traces', ctx);
const STORY_BEATS = vm.runInContext('STORY_BEATS', ctx);
let failed = 0, passed = 0;
const assert = (condition, message) => {
  if (condition) { passed++; console.log(`✓ ${message}`); }
  else { failed++; console.log(`✗ ${message}`); }
};

// ── 無効なら今までどおり ──
Story.enabled = false;
Game.newRun();
assert(Game.state.phase === 'recruit' && Game.state.roster.length === 0, 'Story 無効：面接から始まり名簿は空（既存の挙動）');

// ── 有効：即位 → 面接 → 救援要請 → 救援一択 → 出撃 → 地図 ──
Story.enabled = true;
Game.newRun();
let st = Game.state;
assert(st.phase === 'story' && Story.currentBeat(st) && Story.currentBeat(st).id === 'throne', '開始は即位の場面');
assert(st.roster.length === 2 && st.roster.some(m => m.name === 'ガンツ' && m.department === 'home') && st.roster.some(m => m.name === 'ぷに'), '城の住人はガンツ（留守番）とぷに');
assert(/3名/.test(Story.currentBeat(st).text), 'モルモは「所属者は3名」と言う（住人2＋モルモ）');
assert(Game.storyDone() === 'recruit' && st.phase === 'recruit', '即位を閉じると面接へ');
Game.hire(0);
Game.skipHire();
assert(st.phase === 'story' && Story.currentBeat(st).id === 'rescue_call', '面接を終えると救援要請');
assert(Game.storyDone() === 'mission' && st.phase === 'mission', '要請を閉じると作戦会議');
assert(st.missionOffers.length === 1 && st.missionOffers[0].story === 'goblin_rescue' && st.missionOffers[0].army === '開拓保護隊', '第1章の作戦は救援一択（開拓保護隊）');
assert(st.missionOffers[0].units.every(u => /開拓保護隊/.test(u.name)), '敵の名前は開拓保護隊');
Game.prepareMissions();
assert(st.missionOffers.length === 1 && st.missionOffers[0].story === 'goblin_rescue', '作り直しても救援一択のまま');
Game.selectMission(0);
const out = Game.deploy();
assert(!!out && st.lastBattle && st.lastBattle.story && Array.isArray(st.lastBattle.story.post), '決着の戦果に道中・戦後の場面が付く');
assert(st.story.flags.rescueResolved === true, '救援は一戦で決着する');
const resolvedTag = st.story.flags.villageSaved ? 'saved_village' : 'abandoned_village';
assert(Story.count(st, resolvedTag) === 1, `痕跡 story に ${resolvedTag} が1件`);
assert(st.lastBattle.story.post.length === 1 && /after_village/.test(st.lastBattle.story.post[0].id), '戦後は村の場面が必ず出る');
if (st.phase === 'result') {
  const next = Game.afterResult();
  assert(next === 'story' && Story.currentBeat(st).id === 'map_opens', '結果の次は地図が開く');
  let guard = 0;
  while (st.phase === 'story' && guard++ < 10) Game.storyDone();
  assert(st.phase !== 'story', '幹を閉じ切ると通常の進行へ戻る');
  if (st.story.flags.villageSaved) assert(st.story.seen.includes('ch2_open'), '村を救って征服が進めば第2章の場面も見た');
}
Game.prepareMissions(true);
assert(st.missionOffers.length === 3 && st.missionOffers.every(m => !m.story), '救援のあとは通常の3択');

// ── 枝：出撃者の性格で変わる ──
const mk = (over) => ({ uid: 900 + Math.floor(Math.random() * 1000), tplId: 'goblin', name: over.name, race: 'ゴブリン', traits: over.traits || [], tags: [], prevJob: over.prevJob || '' });
Story.ROAD_CHANCE = 1;
st.roster.push(mk({ name: '臆病者', traits: ['coward'] }));
let party = [st.roster[st.roster.length - 1]];
let sctx = { mission: { story: 'goblin_rescue' }, enemyUnits: [{ name: 'a', hp: 10, atk: 1, def: 0, spd: 5 }, { name: 'b', hp: 10, atk: 1, def: 0, spd: 5 }], notes: [] };
let scenes = Story.rollScenes(st, 'road', party, sctx);
assert(scenes.length === 1 && scenes[0].id === 'road_coward_supply' && /臆病者/.test(scenes[0].text), '臆病者がいれば逃げ足の場面');
st.roster.push(mk({ name: '怪力', traits: ['brute'] }));
party = [st.roster[st.roster.length - 1]];
const before = sctx.enemyUnits.length;
scenes = Story.rollScenes(st, 'road', party, sctx);
assert(scenes.length === 1 && scenes[0].id === 'road_brute_charge' && sctx.enemyUnits.length !== before, '怪力がいれば命令前の突撃で敵の頭数が変わる');
st.roster.push(mk({ name: '荷運び', prevJob: '王国軍の荷運び（脱走）' }));
party = [st.roster[st.roster.length - 1]];
const spdBefore = sctx.enemyUnits[0].spd;
scenes = Story.rollScenes(st, 'road', party, sctx);
assert(scenes[0] && scenes[0].id === 'road_deserter' && sctx.enemyUnits[0].spd < spdBefore, '元荷運びがいれば夜道で敵の出足が鈍る');
const none = Story.rollScenes(st, 'road', [mk({ name: '普通', traits: ['pack'] })], sctx);
assert(none.length === 0, '接点のない出撃者なら道中は何も起きない');
const bone = { ...mk({ name: '骨', traits: ['bone'] }), tplId: 'skeleton', tags: ['undead'] };
st.roster.push(bone);
scenes = Story.rollScenes(st, 'arrival', [bone], sctx);
assert(scenes[0] && scenes[0].id === 'arrival_undead_fear' && st.story.flags.villageFear, '骸骨がいれば村の門が閉まる');

// ── 日誌と保護 ──
const journal = Game.journal(50);
const storyLine = journal.flatMap(g => g.lines).find(l => l.kind === 'story');
assert(!!storyLine && !/[a-z_]{4,}/.test(storyLine.text), '日誌の story 行は日本語で書かれる');
const list = [];
for (let i = 0; i < 450; i++) Traces.record(list, { kind: i === 0 ? 'story' : 'hired', subject: 1, object: i === 0 ? 'saved_village' : null, data: {} });
assert(list.some(t => t.kind === 'story'), '痕跡 story は上限で落とされない');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
