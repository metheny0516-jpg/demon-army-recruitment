// V3: 死霊の縦（入口→中盤→完成）が通常の出撃処理で成立することを固定する。
//
// 個々の仕組み（墓守→魂→徴収、召喚、殉職手当）は test-death-chain / test-summon-chain /
// test-rescue-martyr が手組みのタイムラインで検証している。ここで守るのは**別の性質**である。
//   1. 出撃順（＝配置）が結果を決める。術師を先頭に置くと系統そのものが成立しない
//   2. 「倒れる → 蘇る → **その後もう一度働く**」が本番の Game.deploy() で起きる
//   3. 一度耐える／自己蘇生／他者蘇生／召喚が、データ上べつのものとして読める
//   4. 召喚物は軍団員ではない（永続軍団に増えない・戦没者名簿に載らない）
// 蘇生タイミング・戦闘式・共通CHAIN倍率は変更していない。ここは追認のためのテストである。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

// seed 固定。同じ編成・同じ seed 一覧なら何度走らせても同じ結果になる。
function boot(seed) {
  let s = seed;
  const rnd = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const M = Object.create(Math); M.random = rnd;
  const store = {};
  const ctx = { console, Math: M, Date, JSON, localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
  } };
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  return { Game: vm.runInContext('Game', ctx), MISSION_TYPES: vm.runInContext('MISSION_TYPES', ctx) };
}

// 本番の生成器で作った個体に、職と特性だけを固定する（能力値は本番の範囲のまま）
function build(Game, spec) {
  const m = Game.rollApplicant(spec.tpl);
  m.traits = spec.traits.slice();
  m.department = spec.dept || 'combat';
  m.name = spec.name;
  return m;
}

const ENTRY = [
  { tpl: 'zombie', name: '前衛ガロ', traits: ['tenacity'] },
  { tpl: 'skeleton', name: '骨兵ボネ', traits: ['bone'] },
  { tpl: 'necromancer', name: '術師ネル', traits: ['necromancy', 'gravekeeper'] }
];
const FULL = [
  { tpl: 'zombie', name: '前衛ガロ', traits: ['tenacity'] },
  { tpl: 'skeleton', name: '骨兵ボネ', traits: ['bone', 'tough_skin'] },
  { tpl: 'skeleton', name: '徴収係サイ', traits: ['bone', 'soul_harvest'] },
  { tpl: 'goblin', name: '強欲グル', traits: ['coward', 'greedy'] },
  { tpl: 'necromancer', name: '術師ネル', traits: ['necromancy', 'gravekeeper'] },
  { tpl: 'necromancer', name: '供養係クロ', traits: ['necromancy', 'gravekeeper'], dept: 'construction' }
];

// order: 'rear'（術師を最後＝後衛） / 'front'（術師を先頭＝最も狙われる）
function trial(seed, specs, order, conquest, facility) {
  const { Game, MISSION_TYPES } = boot(seed);
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false;
  // 人材を作る前に進行度を決める。rollApplicant() は campaignLevel() を見て
  // 能力値と給与を決めるので、順番を逆にすると別物の軍団になる。
  st.conquest = conquest;
  st.turn = conquest + 1;
  st.roster = specs.map(spec => build(Game, spec));
  const deployed = st.roster.filter((m, i) => !specs[i].dept);
  const ordered = order === 'front'
    ? [...deployed.filter(m => m.traits.includes('necromancy')), ...deployed.filter(m => !m.traits.includes('necromancy'))]
    : [...deployed.filter(m => !m.traits.includes('necromancy')), ...deployed.filter(m => m.traits.includes('necromancy'))];
  st.activeUids = ordered.map(m => m.uid).slice(0, Game.MAX_DEPLOY);
  st.food = 12; st.gold = 200;
  st.facilityLevel = facility ? 2 : 0;
  st.activeFacilityId = facility || null;
  st.pendingFacilityChoiceLevel = null;
  st.selectedMission = Game.buildMission(MISSION_TYPES.find(m => m.id === 'invade'));
  st.phase = 'formation';
  const out = Game.deploy();
  const tl = out.result.timeline;
  const actedAfter = (i, id) => tl.slice(i + 1).some(e => (e.type === 'attack' || e.type === 'splash') && e.fromId === id);
  const necroRevives = tl.filter(e => e.type === 'revive' && e.traitId === 'necromancy');
  return {
    Game, out, tl,
    necroRevives,
    selfRevives: tl.filter(e => e.type === 'revive' && e.traitId === 'tenacity'),
    survives: tl.filter(e => e.type === 'survive'),
    summons: tl.filter(e => e.type === 'summon'),
    souls: tl.filter(e => e.type === 'resource_gain' && e.resource === 'soul'),
    soulHarvest: tl.filter(e => e.type === 'trait_trigger' && e.traitId === 'soul_harvest'),
    martyr: tl.filter(e => e.type === 'resource_gain' && e.label === '殉職手当'),
    revivedActed: necroRevives.some(e => actedAfter(tl.indexOf(e), e.unitId)),
    summonActed: tl.some((e, i) => e.type === 'summon' && e.unit && actedAfter(i, e.unit.id))
  };
}

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i);
const rate = list => Math.round(list.filter(Boolean).length / list.length * 100);

// ── 1. 入口: 後衛に置けば「倒れる→蘇る→もう一度働く」が起きる ────
const entryRear = SEEDS.map(seed => trial(seed, ENTRY, 'rear', 2, null));
const entryFront = SEEDS.map(seed => trial(seed, ENTRY, 'front', 2, null));
const rearRevive = rate(entryRear.map(r => r.necroRevives.length > 0));
const frontRevive = rate(entryFront.map(r => r.necroRevives.length > 0));
const rearActed = rate(entryRear.map(r => r.revivedActed));
assert(rearRevive >= 50, `入口: 術師を後衛に置けば他者蘇生が起きる（${rearRevive}%）`);
assert(rearActed >= 25, `入口: 蘇生された前衛が復帰後にもう一度働く（${rearActed}%）`);

// ── 2. 配置が結果を決める（術師を先頭に置くと成立しない）──────────
assert(rearRevive - frontRevive >= 30,
  `配置で結果が割れる: 他者蘇生は後衛 ${rearRevive}% / 先頭 ${frontRevive}%`);

// ── 3. 完成: 魂・召喚・殉職手当まで届く ────────────────────
const full = SEEDS.map(seed => trial(seed, FULL, 'rear', 6, 'graveyard'));
assert(rate(full.map(r => r.souls.length > 0)) >= 50,
  `完成: 味方の死亡が魂になる（${rate(full.map(r => r.souls.length > 0))}%）`);
assert(rate(full.map(r => r.soulHarvest.length > 0)) >= 50,
  `完成: 蘇生・召喚が魂の徴収へ接続する（${rate(full.map(r => r.soulHarvest.length > 0))}%）`);
assert(rate(full.map(r => r.summons.length > 0)) >= 80,
  `完成: 墓地が戦死者を召喚する（${rate(full.map(r => r.summons.length > 0))}%）`);
assert(rate(full.map(r => r.summonActed)) >= 50,
  `完成: 召喚された骸骨従者が実際に働く（${rate(full.map(r => r.summonActed))}%）`);
console.log(`  （完成編成の内訳: 他者蘇生 ${rate(full.map(r => r.necroRevives.length > 0))}% ／ `
  + `復帰後に行動 ${rate(full.map(r => r.revivedActed))}% ／ `
  + `殉職手当 ${rate(full.map(r => r.martyr.length > 0))}%）`);
assert(full.some(r => r.martyr.length > 0),
  `完成: 蘇生者の撃破から殉職手当（死霊→略奪の橋）が成立する（${rate(full.map(r => r.martyr.length > 0))}%）`);

// ── 4. 4つの復帰を別物として読める ───────────────────────
const sample = full.find(r => r.necroRevives.length && r.summons.length && r.survives.length)
  || full.find(r => r.necroRevives.length && r.summons.length);
assert(!!sample, '前提: 他者蘇生と召喚が同じ戦闘で起きた見本がある');
assert(sample.necroRevives.every(e => e.traitId === 'necromancy' && e.sourceId && e.sourceId !== e.unitId),
  '他者蘇生は「誰が誰を」を持つ（術師と蘇生された者が別人）');
assert(sample.selfRevives.every(e => e.traitId === 'tenacity'),
  '自己蘇生は執念として別のラベルになる');
assert(sample.summons.every(e => e.type === 'summon' && e.unit && e.sourceUnitId),
  '召喚は revive ではなく summon で、誰の遺骸かを持つ');
assert(sample.survives.every(e => e.type === 'survive'),
  '一度耐える（白骨）は蘇生ではなく survive');

// ── 5. 召喚の回数上限は施設Lv.（働ける回数）を超えない ──────────
const works = summonLimitRun => summonLimitRun.Game.facilityWorks();
assert(full.every(r => r.summons.length <= works(r)),
  `召喚の回数は施設Lv.の働ける回数を超えない（上限 ${works(full[0])}体）`);

// ── 6. 召喚物は軍団員ではない ──────────────────────────
const summonRun = full.find(r => r.summons.length > 0);
const roster = summonRun.Game.state.roster;
assert(roster.length <= FULL.length,
  '召喚された骸骨従者は永続軍団に増えない');
assert(!roster.some(m => /骸骨従者/.test(m.name)), '召喚物が軍団名簿に混ざらない');
assert(!(summonRun.Game.state.lastFallen || []).some(f => /骸骨従者/.test(f.name || '')),
  '召喚物は戦没者名簿にも載らない');
assert(summonRun.souls.every(e => !/骸骨従者/.test(e.text || '')),
  '召喚物の死亡からは魂を生成しない');

console.log('\n死霊の縦（V3・追認）: すべて通過');
