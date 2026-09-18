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
assert(st.roster.length === 1 && st.roster[0].name === 'ガンツ' && st.roster[0].department === 'home' && st.activeUids.length === 0, '城の住人は門番ガンツだけ（留守番）。実働部隊は空');
assert(/2名/.test(Story.currentBeat(st).text) && /戦える者は、いません/.test(Story.currentBeat(st).text), 'モルモは「所属者は2名。戦える者はいません」と言う');
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
// 同じ臆病でも、状況で結果が変わる（一特性＝一イベントにしない）
const cowardSc = vm.runInContext('STORY_SCENES', ctx).find(s => s.id === 'road_coward_supply');
const cw = mk({ name: '臆病2', traits: ['coward'] }); st.roster.push(cw);
const mate = mk({ name: '負傷者', traits: [] }); mate.injured = 1;
assert(cowardSc.resolve(st, { actor: cw }, [cw, mate]).kind === 'stand_mate', '仲間に負傷者がいれば臆病者は残る');
Story.mark(st, 'fled', cw.uid, {});
assert(cowardSc.resolve(st, { actor: cw }, [cw]) === 'stand_memory', '前に逃げた痕跡があれば今回は踏みとどまる');
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

// ── 6本の枝が「特性×仲間×状況×過去」で変わる ──
const SC = id => vm.runInContext('STORY_SCENES', ctx).find(s => s.id === id);
const fresh = (over) => { const m = mk(over); st.roster.push(m); return m; };
// 命令前の突撃
const br = fresh({ name: '怪力2', traits: ['brute'] });
assert(SC('road_brute_charge').resolve(st, { actor: br }, [br, fresh({ name: '見栄', traits: ['show_off'] })]).kind === 'showoff', '見栄っ張りが見ていれば必ず突っ込む');
assert(SC('road_brute_charge').resolve(st, { actor: br }, [br, fresh({ name: '臆病3', traits: ['coward'] })]).kind === 'alone', '仲間が臆病者なら一人で突っ込んで孤立');
Story.mark(st, 'charged_early', br.uid, { won: false });
Game.trace('downed', st.roster[0].uid, null, { round: 1 });
assert(SC('road_brute_charge').resolve(st, { actor: br }, [br]) === 'wait', '前に突っ込んで仲間が倒れていれば命令を待つ');
// 農具を持った手
const fr = fresh({ name: '農家育ち', prevJob: '人間の農家で育った（番犬扱い）' });
assert(SC('arrival_farm_raised').resolve(st, { actor: fr }, [fr]) === 'hesitate', '初めて人間と戦うならためらう');
Story.mark(st, 'hesitated', fr.uid, {});
assert(SC('arrival_farm_raised').resolve(st, { actor: fr }, [fr]) === 'steady', '二度目はもう迷わない');
Game.trace('downed', st.roster[0].uid, null, { round: 2 });
assert(SC('arrival_farm_raised').resolve(st, { actor: fr }, [fr]) === 'strike', '前にためらって仲間が倒れていれば今回は斬る');
st.departed.push({ uid: 7777, name: '故人', cause: 'fallen', army: '開拓保護隊' });
assert(SC('arrival_farm_raised').resolve(st, { actor: fr }, [fr]) === 'rage', '仲間が人間に倒されていれば激昂する');
st.departed.pop();
// 門が閉まる
const sk = fresh({ name: '骨2', traits: ['bone'] }); sk.tplId = 'skeleton'; sk.tags = ['undead'];
assert(SC('arrival_undead_fear').resolve(st, { actor: sk }, [sk]) === 'fear', '骸骨だけなら門は閉まる');
assert(SC('arrival_undead_fear').resolve(st, { actor: sk }, [sk, fresh({ name: 'ゴブ', traits: [] })]).kind === 'vouch', '同族のゴブリンがいれば取りなして半分開く');
const cookOrc = fresh({ name: '料理', traits: ['demon_cook'] }); cookOrc.tplId = 'orc';
assert(SC('arrival_undead_fear').resolve(st, { actor: sk }, [sk, cookOrc]).kind === 'pot', '料理人（ゴブリン以外）がいれば鍋で誤魔化す');
// 村の焚き火（大食漢・見栄っ張り・料理人）
const th = SC('after_village_thanks');
const eater = fresh({ name: '大食', traits: ['big_eater'] }), cook = fresh({ name: '料理2', traits: ['demon_cook'] }), show = fresh({ name: '見栄2', traits: ['show_off'] });
assert(th.resolveEater(st, { eater }) === 'bill', '大食漢だけなら備蓄を食って請求書');
assert(th.resolveEater(st, { eater, cook }) === 'pot', '料理人がいれば鍋の方を食う');
Story.mark(st, 'looted_food', eater.uid, {});
assert(th.resolveEater(st, { eater }) === 'hidden', '前に敵の飯を漁っていれば噂が先回りして備蓄は隠されている');
assert(th.resolveCook(st, { cook, eater }) === 'eaten', '料理人と大食漢が同行なら鍋は食われる');
st.fallenTotal = 1;
assert(th.resolveShow(st, { show }) === 'memorial', '戦死者が出ていれば見栄っ張りは追悼の演説をする');
st.fallenTotal = 0;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
