// 戦果の「施設と死者の働き」が、タイムラインだけから正しく導出されるか。
//
// 見ているのは表示のHTMLではなく集計の性質:
// 施設発火の回数と召喚数、全滅直後の召喚を「全滅回避」と呼べること、
// 死者ごとの連鎖（耐えた／戦死／誰が戻したか／全快か／召喚）が個体別に分かれること、
// そしてラン側の戦果へ共通補正（Lv）と稼働施設（Joker）が分けて残ること。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx), Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const player = (uid, name, traits, hp, atk, spd, tags) => Battle.makeUnit({
  uid, tplId: 'test', name, race: '試験魔族', job: '', hp, atk, def: 0, spd,
  salary: 0, loyalty: 100, traits, tags: tags || []
}, 'player');
const enemy = (name, hp, atk, spd) => Battle.makeUnit({
  name, race: '人間', hp, atk, def: 0, spd, salary: 0, traits: [], tags: []
}, 'enemy');

// ── 1. 墓地：全滅直後の召喚を「全滅回避」と読む ───────────────────
let victim = player(1, '最後の戦没者', [], 10, 8, 12);
let result = Battle.simulate([victim], [enemy('処刑人', 999, 30, 1)], { graveyard: true });
let facility = result.facilitySummary;
assert(facility.facilities.length === 1 && facility.facilities[0].facilityId === 'graveyard',
  '施設要約は facility_trigger を施設ごとにまとめる');
assert(facility.facilities[0].summons === 1 && facility.facilities[0].rescued && facility.rescuedFromWipe,
  '味方全員が倒れた後の墓地召喚を「全滅回避」として残す');
// 施設Lv.＝Jokerが1戦闘に働ける回数（2026-09-03、共通HP・防御補正の撤去と引き換え）
{
  const fodder = () => [player(11, '一番手', [], 10, 1, 12), player(12, '二番手', [], 10, 1, 11),
    player(13, '三番手', [], 10, 1, 10)];
  const executioner = () => [enemy('処刑人', 999, 30, 1)];
  const works1 = Battle.simulate(fodder(), executioner(), { graveyard: true, facilityWorks: 1 });
  const works3 = Battle.simulate(fodder(), executioner(), { graveyard: true, facilityWorks: 3 });
  const summonsOf = r => (r.facilitySummary.facilities[0] || { summons: 0 }).summons;
  assert(summonsOf(works1) === 1, '墓地Lv.1は戦死者を1体だけ起こす');
  assert(summonsOf(works3) > summonsOf(works1),
    '墓地Lv.3は同じ戦闘でより多くの戦死者を起こす（Lv.＝働く回数）');
  assert(summonsOf(works3) <= 3, '墓地はLv.の回数を超えて働かない');
}

let chains = result.deathChains;
assert(chains.length === 1 && chains[0].name === '最後の戦没者'
  && chains[0].steps.join(' → ') === '戦死 → 骸骨従者を召喚' && chains[0].permanentDeath,
  '死者の連鎖は本人の戦死と、そこから生まれた召喚を並べ、戻らなければ永久戦死と記す');

// ── 2. 墓地：通常ラウンド終了の召喚は全滅回避ではない ───────────────
victim = player(2, '先に倒れる者', [], 10, 1, 12);
const survivor = player(3, '生き残る壁', [], 999, 1, 1);
result = Battle.simulate([victim, survivor], [enemy('雑兵', 60, 30, 5)], { graveyard: true });
facility = result.facilitySummary;
assert(facility.facilities[0] && facility.facilities[0].summons === 1 && !facility.facilities[0].rescued
  && !facility.rescuedFromWipe, '味方が残っている間の墓地召喚は全滅回避と呼ばない');
assert(result.deathChains.length === 1 && result.deathChains[0].name === '先に倒れる者',
  '倒れていない味方は死者の連鎖に載らない');

// ── 3. 執念と死霊術：誰が戻したかを分ける ───────────────────────
vm.runInContext('U.rand = () => 0;', ctx);
victim = player(4, '執念の一兵', ['tenacity'], 10, 8, 12);
result = Battle.simulate([victim], [enemy('執念試験官', 999, 30, 1)]);
chains = result.deathChains;
assert(chains[0].steps[0] === '戦死' && chains[0].steps[1] === '執念で復活',
  '自力復活は「執念で復活」と読む');
vm.runInContext('U.rand = () => 0.5;', ctx);

const fallen = player(5, '蘇生される者', [], 10, 1, 12, ['undead']);
const necro = player(6, '術者', ['necromancy'], 999, 1, 1);
result = Battle.simulate([fallen, necro], [enemy('雑兵2', 30, 30, 5)]);
const fallenChain = result.deathChains.find(c => c.name === '蘇生される者');
assert(fallenChain && fallenChain.steps[0] === '戦死' && fallenChain.steps[1] === '死霊術で蘇生',
  '死霊術による蘇生は術者の手柄として「死霊術で蘇生」と読む（全快でなければ印を付けない）');
assert(!result.deathChains.some(c => c.name === '術者'), '死んでいない術者は連鎖に載らない');

const undeadA = player(7, '骸骨A', [], 10, 1, 12, ['undead']);
const undeadB = player(8, '骸骨B', [], 999, 1, 2, ['undead']);
const lich = player(9, '死霊術師', ['necromancy'], 999, 1, 1, ['caster']);
lich.race = '死霊術師';
result = Battle.simulate([undeadA, undeadB, lich], [enemy('雑兵3', 30, 30, 5)]);
const fullChain = result.deathChains.find(c => c.name === '骸骨A');
assert(result.activeSynergies.includes('死の軍勢') && fullChain && fullChain.steps[1] === '死霊術で蘇生（全快）',
  '死の軍勢で全快した蘇生には（全快）を付ける');

// ── 4. 施設が無い戦闘は空で安全 ─────────────────────────────
result = Battle.simulate([player(10, '平穏', [], 100, 50, 10)], [enemy('的', 10, 1, 1)]);
assert(result.facilitySummary.facilities.length === 0 && !result.facilitySummary.rescuedFromWipe
  && result.deathChains.length === 0, '施設も死者も無い戦闘では空の要約を返す');

// ── 5. ラン側の戦果へ、共通補正と稼働施設を分けて残す ───────────────
Game.newRun();
Object.assign(Game.state, {
  roster: [{ uid: 1, tplId: 'ogre', name: '巨人', race: 'オーガ', job: '門番', hp: 999, atk: 999, def: 0, spd: 99,
    salary: 0, loyalty: 90, traits: [], tags: [], department: 'combat', merit: 0, rankId: 'soldier' }],
  activeUids: [1], applicants: [], phase: 'formation', selectedMission: null,
  facilityLevel: 2, activeFacilityId: 'graveyard'
});
const meritBefore = Game.state.roster[0].merit;
const out = Game.deploy();
const b = Game.state.lastBattle;
assert(out.result.victory && b.facility && b.facility.level === 2 && b.facility.works === 2,
  '戦果に施設Lvと、Jokerが働ける回数を残す');
assert(b.facility.activeId === 'graveyard' && b.facility.activeName === '墓地',
  '戦果に稼働中の大型施設を残す');
assert(b.facilitySummary && b.facilitySummary.facilities.length === 0 && Array.isArray(b.deathChains),
  '発火しなかった施設は要約に載らず、UIが「今回は発火しなかった」と読める');
const meritWithFacility = Game.state.roster[0].merit - meritBefore;
// 同じ軍団・同じ敵を施設なしで戦わせ、戦功が施設要約の有無で変わらないことを確かめる
Game.newRun();
Object.assign(Game.state, {
  roster: [{ uid: 1, tplId: 'ogre', name: '巨人', race: 'オーガ', job: '門番', hp: 999, atk: 999, def: 0, spd: 99,
    salary: 0, loyalty: 90, traits: [], tags: [], department: 'combat', merit: 0, rankId: 'soldier' }],
  activeUids: [1], applicants: [], phase: 'formation', selectedMission: null
});
Game.deploy();
assert(Game.state.roster[0].merit === meritWithFacility && Game.state.lastBattle.facility.level === 0
  && Game.state.lastBattle.facility.activeId === null,
  '施設要約は戦功へ接続しない（表示専用）。施設なしの戦果はLv.0・稼働なしを残す');

// ── 6. 旧セーブ（要約が無い戦果）でも描画側が壊れないための形 ────────
assert(typeof Battle.summarizeFacility(undefined).facilities.length === 'number'
  && Battle.summarizeDeathChains(null).length === 0, 'タイムラインが無くても空の要約を返す');
console.log('all facility report tests passed');
