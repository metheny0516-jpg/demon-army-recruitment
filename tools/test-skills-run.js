// 育成の run.js 側：出撃を重ねた者が上位技を覚え、基礎能力が少し伸びる。
//   node tools/test-skills-run.js
// 技そのものの効き方（戦闘）は test-skills-battle.js。ここは解放と成長だけを見る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const TRAITS = vm.runInContext('TRAITS', ctx);
const SKILL_RULES = vm.runInContext('SKILL_RULES', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: ["brute"], tags: [],
  department: "combat", injured: 0, relicIds: [],
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 } }, x || {});

let FIXED_MISSION = null;
function freshRun(roster, activeUids) {
  Game.newRun();
  const st = Game.state;
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = 90; st.gold = 400;
  st.roster = roster;
  st.activeUids = activeUids;
  for (const m of st.roster) Game.baseOf(m);
  Game.syncDepartments();
  if (st.phase !== "mission") Game.prepareMissions(true);
  Game.selectMission(0);
  if (!FIXED_MISSION) FIXED_MISSION = JSON.parse(JSON.stringify(st.selectedMission));
  st.selectedMission = JSON.parse(JSON.stringify(FIXED_MISSION));
  return st;
}
// 決着を1回進める（勝敗は問わない。出撃さえすれば1戦）
function fightOnce(st) {
  Game.prepareMissions(true); Game.selectMission(0);
  st.selectedMission = JSON.parse(JSON.stringify(FIXED_MISSION));
  st.phase = "formation";
  Game.deploy();
}

// 1. 解放：5戦では1段目、6戦目の決着で置き換わる
{
  const tank = member(101, 'ガロ', { hp: 800, atk: 40, def: 25 });
  const st = freshRun([tank], [101]);
  const notes = [];
  for (let i = 0; i < 5; i++) {
    Game.memberRecord(tank).battles = i;
    const got = Game.checkSkillUnlock(tank, notes);
    assert(!got, `${i}戦では覚えない`);
    if (i > 0) break;   // 1件だけ見れば足りる（0戦と1戦）
  }
  Game.memberRecord(tank).battles = SKILL_RULES.unlockBattles - 1;
  assert(!Game.checkSkillUnlock(tank, notes), `${SKILL_RULES.unlockBattles - 1}戦ではまだ覚えない`);
  Game.memberRecord(tank).battles = SKILL_RULES.unlockBattles;
  const gained = Game.checkSkillUnlock(tank, notes);
  assert(!!gained && gained.skillId === 'blood_howl',
    `${SKILL_RULES.unlockBattles}戦で覚える（${gained && gained.skillName}）`);
  assert(!tank.traits.includes('brute'), '1段目（怪力）が消える');
  assert(tank.traits.includes(gained.skillId), '上位技が入る');
  assert(tank.skillTier === 2, 'skillTier が 2 になる');
  assert(notes.some(n => /覚えた/.test(n)), 'notes に「覚えた」が積まれる');
  assert(!!gained.quote && TRAITS[gained.skillId].lines.unlock.includes(gained.quote),
    `本人の一言が unlock のプールから出る（${gained.quote}）`);
  assert(!Game.checkSkillUnlock(tank, notes), '二度目は覚えない（もう上位技を持っている）');
}

// 2. 遺物の癖・共通特性は残る。fixedTrait だけが消える
{
  const tank = member(102, 'ツギ', { hp: 800, atk: 40, def: 25, traits: ['brute', 'drunkard', 'tinkerer'] });
  const st = freshRun([tank], [102]);
  Game.memberRecord(tank).battles = SKILL_RULES.unlockBattles;
  Game.checkSkillUnlock(tank, []);
  assert(!tank.traits.includes('brute'), '1段目だけが消える');
  assert(tank.traits.includes('drunkard') && tank.traits.includes('tinkerer'), '癖はそのまま残る');
}

// 3. 傭兵は育たない
{
  const merc = member(103, 'ヤトイ', { mercenary: true });
  Game.memberRecord(merc).battles = 20;
  assert(Game.checkSkillUnlock(merc, []) === null, '傭兵は技を覚えない');
  const before = merc.atk;
  Game.applyGrowth(merc);
  assert(merc.atk === before, '傭兵は伸びない');
}

// 4. 小成長：base から積み、頭打ちがある
{
  const m = member(104, 'ノビル', { hp: 40, atk: 20, def: 10 });
  const st = freshRun([m], [104]);
  const base = { ...m.base };
  const expect = n => Math.round(base.atk * SKILL_RULES.growthPerBattle * Math.min(n, SKILL_RULES.growthCapBattles));
  Game.memberRecord(m).battles = 10;
  Game.applyGrowth(m);
  assert(m.atk === base.atk + expect(10), `10戦で atk ${base.atk} → ${m.atk}（+${expect(10)}）`);
  // 目安は「10戦で 1 + growthPerBattle×10」。率は sim で決めるので、率から期待値を作る。
  const expected10 = 1 + SKILL_RULES.growthPerBattle * 10;
  assert(Math.abs(m.atk / base.atk - expected10) < 0.03,
    `10戦でおよそ ×${expected10.toFixed(2)}（${(m.atk / base.atk).toFixed(3)}）`);
  Game.memberRecord(m).battles = 13;
  Game.applyGrowth(m);
  assert(m.atk === base.atk + expect(12), `13戦でも12戦ぶんで頭打ち（${m.atk}）`);
  const expectedCap = 1 + SKILL_RULES.growthPerBattle * SKILL_RULES.growthCapBattles;
  assert(Math.abs(m.atk / base.atk - expectedCap) < 0.03,
    `頭打ちはおよそ ×${expectedCap.toFixed(2)}（${(m.atk / base.atk).toFixed(3)}）`);
  assert(m.spd === 3, 'spd は伸びない');
  // 何度呼んでも二重に足さない
  const after = m.atk;
  Game.applyGrowth(m); Game.applyGrowth(m);
  assert(m.atk === after, '同じ戦数で何度呼んでも二重加算しない');
}

// 5. 昇進の boost と二重にならない
{
  const m = member(105, 'エラク', { hp: 40, atk: 20, def: 10 });
  const st = freshRun([m], [105]);
  const base = { ...m.base };
  Game.memberRecord(m).battles = 12;
  Game.applyGrowth(m);
  const grown = m.atk;
  const ranks = vm.runInContext('PROMOTION_RANKS', ctx);
  const next = ranks.find(r => r.boost && r.boost.atk);
  Game.promote(m, next, []);
  const promoted = m.atk;
  assert(promoted > grown, `昇進で伸びる（${grown} → ${promoted}）`);
  assert(m.base.atk === base.atk, '昇進しても base は動かない');
  Game.applyGrowth(m);
  assert(m.atk === promoted, '昇進後に成長を掛け直しても値が動かない（二重加算しない）');
}

// 6. 決着を通した実地：撤退した戦いも1戦に数える
{
  const weak = member(106, 'ヨワシ', { hp: 8, atk: 2, def: 0, spd: 9 });
  const tank = member(107, 'カタブツ', { hp: 800, atk: 40, def: 25, spd: 4 });
  const st = freshRun([weak, tank], [106, 107]);
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  const after = st.roster.find(m => m.uid === 107);
  assert(after && Game.memberRecord(after).battles === 1, '退いた戦いも1戦に数える');
  assert(after && after.grown && after.grown.atk >= 1, `退いた戦いでも伸びる（+${after.grown.atk}）`);
}
{
  // 6戦通すと本当に置き換わる（決着処理から呼ばれている）
  const tank = member(108, 'レキセン', { hp: 900, atk: 60, def: 30, spd: 8 });
  const st = freshRun([tank], [108]);
  for (let i = 0; i < SKILL_RULES.unlockBattles; i++) {
    if (st.phase === "gameover" || st.phase === "clear") break;
    fightOnce(st);
  }
  const m = st.roster.find(x => x.uid === 108);
  assert(!!m && Game.memberRecord(m).battles >= SKILL_RULES.unlockBattles,
    `決着を${SKILL_RULES.unlockBattles}回通した（${m && Game.memberRecord(m).battles}戦）`);
  assert(!!m && m.skillTier === 2, '決着処理から解放が呼ばれている');
  assert(!!st.lastBattle && Array.isArray(st.lastBattle.unlocked), 'lastBattle.unlocked がある');
}

// 7. 旧セーブ（base 無し）
{
  Game.newRun();
  const st = Game.state;
  st.roster = [{ uid: 201, tplId: 'orc', name: '旧人', race: 'オーク', job: '兵',
    hp: 33, atk: 9, def: 5, spd: 3, salary: 3, loyalty: 60, traits: ['brute'], tags: [] }];
  Game.migrateState();
  const old = st.roster[0];
  assert(old.base && old.base.atk === 9, '現在値が base になる');
  assert(old.grown && old.grown.atk === 0, 'それまでの伸びは「もう入っている」扱い');
  assert(old.skillTier === 1, 'skillTier が入る');
  Game.memberRecord(old).battles = 3;
  Game.applyGrowth(old);
  assert(old.atk === 9 + Math.round(9 * SKILL_RULES.growthPerBattle * 3),
    `旧セーブでも落ちずに伸びる（${old.atk}）`);
}
{
  // 上位技を既に持つ旧セーブは skillTier 2 と判定される
  Game.newRun();
  const st = Game.state;
  st.roster = [{ uid: 202, tplId: 'ogre', name: '古参', race: 'オーガ', job: '兵',
    hp: 60, atk: 15, def: 8, spd: 3, salary: 5, loyalty: 60, traits: ['ogre_charge'], tags: [] }];
  Game.migrateState();
  assert(st.roster[0].skillTier === 2, '上位技を持つ旧セーブは skillTier 2');
}

// 8. nextSkillFor（面接の札が読む）
{
  const rookie = member(203, 'シンジン');
  assert(Game.nextSkillFor(rookie) && Game.nextSkillFor(rookie).id === 'blood_howl',
    '1段目を持つ者は次に覚える技を引ける（オークの怪力 → 血の雄叫び）');
  const done = member(204, 'ベテラン', { traits: ['blood_howl'] });
  assert(Game.nextSkillFor(done) === null, 'もう覚えている者は null');
  const none = member(205, 'ナニモ', { traits: [] });
  assert(Game.nextSkillFor(none) === null, '技の無い者は null');
  // 11技すべてが 1段目から引けること
  const tier2 = Object.keys(TRAITS).filter(id => (TRAITS[id].skill || {}).tier === 2);
  const reachable = tier2.filter(id => {
    const holder = member(900, 'x', { tplId: TRAITS[id].skill.species, traits: [TRAITS[id].skill.replaces] });
    const got = Game.nextSkillFor(holder);
    return got && got.id === id;
  });
  assert(reachable.length === tier2.length,
    `11技すべてが自分の種族の1段目から引ける（${reachable.length}/${tier2.length}）`);
  // 1段目は種族をまたいで共有されている（怪力＝オーガとオーク、粘体＝スライムとキングスライム）。
  // 種族で絞らないと、オークが「ぶちかまし」を覚える。
  const orc = member(906, 'オーク', { tplId: 'orc', traits: ['brute'] });
  const ogre = member(907, 'オーガ', { tplId: 'ogre', traits: ['brute'] });
  assert(Game.nextSkillFor(orc).id === 'blood_howl', 'オークの怪力 → 血の雄叫び');
  assert(Game.nextSkillFor(ogre).id === 'ogre_charge', 'オーガの怪力 → ぶちかまし');
  const slime = member(908, 'スライム', { tplId: 'slime', traits: ['slime_body'] });
  const king = member(909, '王', { tplId: 'king_slime', traits: ['slime_body'] });
  assert(Game.nextSkillFor(slime).id === 'split', 'スライムの粘体 → 分裂');
  assert(Game.nextSkillFor(king).id === 'tidal_wave', 'キングスライムの粘体 → 大波');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
