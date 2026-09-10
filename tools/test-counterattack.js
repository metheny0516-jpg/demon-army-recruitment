// 王国の反撃：こちらの動きで警戒が溜まり、閾値を超えると討伐隊が城へ来る。
//   node tools/test-counterattack.js
// 守れば警戒が引いて名が上がる。守れなければ城が荒らされる。勇者に負ければ城陥落。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js',
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
const ENEMY_STAGES = vm.runInContext('ENEMY_STAGES', ctx);
const COUNTERATTACK = vm.runInContext('COUNTERATTACK', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const fix = src => vm.runInContext(src, ctx);
const resetRng = () => fix('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];');
resetRng();

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [],
  department: "combat", injured: 0, relicIds: [],
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 } }, x || {});
const tank = (uid, name) => member(uid, name, { hp: 900, atk: 90, def: 40, spd: 20 });
const paper = (uid, name) => member(uid, name, { hp: 1, atk: 1, def: 0, spd: 1 });

function freshRun(roster, activeUids, extra) {
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false;
  st.applicants = []; st.hiresLeft = 0;
  st.food = 60; st.gold = 300;
  st.roster = roster; st.activeUids = activeUids;
  for (const m of st.roster) Game.baseOf(m);
  Game.syncDepartments();
  Object.assign(st, extra || {});
  return st;
}
// 予約された防衛戦を1回戦う
function fightDefense(st) {
  Game.prepareMissions(true);
  assert(st.missionOffers.length === 1 && st.missionOffers[0].missionKind === "defend",
    `作戦会議は防衛の一択（${st.missionOffers.map(m => m.missionKind).join(",")}）`);
  Game.selectMission(0);
  st.phase = "formation";
  return Game.deploy();
}

// 1. 予約：閾値で必ず、閾値−1 で確率
{
  const st = freshRun([tank(101, 'カタブツ')], [101], { alert: COUNTERATTACK.threshold });
  assert(!!Game.checkCounterattack(), '警戒が閾値なら必ず予約される');
  assert(st.counterattack.pending && st.counterattack.kind === "punitive", '討伐隊が予約された');
  assert(/討伐隊/.test(st.counterattack.armyName), `隊名は段階表から（${st.counterattack.armyName}）`);
  assert(Game.checkCounterattack() === null, '予約中に二重予約しない');
}
{
  const st = freshRun([tank(102, 'カタブツ')], [102], { alert: COUNTERATTACK.threshold - 1 });
  fix('U.chance = () => false;');
  assert(Game.checkCounterattack() === null, '閾値−1 で確率を外せば予約されない');
  fix('U.chance = () => true;');
  assert(!!Game.checkCounterattack(), '閾値−1 で確率を引けば予約される');
  resetRng();
}
{
  const st = freshRun([tank(103, 'カタブツ')], [103], { alert: COUNTERATTACK.threshold - 2 });
  fix('U.chance = () => true;');
  assert(Game.checkCounterattack() === null, '閾値−2 では確率を引いても予約されない');
  resetRng();
}

// 2. 予約中でも面接と編成は通常どおり（備える時間を作るのが目的）
{
  const st = freshRun([tank(104, 'カタブツ'), member(105, 'ヒカエ')], [104],
    { alert: COUNTERATTACK.threshold });
  Game.checkCounterattack();
  Game.genApplicants();
  assert(st.applicants.length > 0, '予約中でも応募者は来る');
  assert(Game.toggleDeploy(105) === true, '予約中でも編成を変えられる');
}

// 3. 防衛戦に勝つ
{
  const st = freshRun([tank(201, 'カタブツ')], [201], { alert: COUNTERATTACK.threshold });
  Game.checkCounterattack();
  const mats = st.materials, food = st.food;
  const out = fightDefense(st);
  assert(out.result.victory === true, '（前提）守り切った');
  assert(st.alert === 0, `警戒が引く（${st.alert}）`);
  assert(st.materials === mats + COUNTERATTACK.seize.materials, `建材を押収（${mats}→${st.materials}）`);
  assert(st.lastBattle.notes.some(x => new RegExp(`食料 \\+${COUNTERATTACK.seize.food}`).test(x)),
    `食料も押収した（${st.lastBattle.notes.find(x => /押収/.test(x))}）`);
  assert(st.defenses.won === 1, 'defenses.won が増える');
  assert(st.lastBattle.defense && st.lastBattle.defended, 'lastBattle に守り切った印');
  assert(st.counterattack === null, '予約は消える');
  assert(st.conquest === 0, '征服は進まない（防衛は攻略ではない）');
  // 名は上がる：次の面接だけ応募者が1人多い
  // 名声は決着の中の genApplicants() が読んで消費する（＝退けた直後の面接に効く）。
  assert(st.renownBonus === 0, '読んだら消える（1回きり）');
  st.renownBonus = 1;
  const withBonus = Game.applicantCount();
  const without = Game.applicantCount();
  assert(withBonus === without + 1, `名声がある回だけ応募者+1（${withBonus} → ${without}）`);
}

// 4. 防衛戦で退く → 荒らされる
{
  const st = freshRun([paper(301, 'ヨワシ'), tank(302, 'カタブツ'), member(303, 'ルスバン')],
    [301, 302], { alert: COUNTERATTACK.threshold, facilityLevel: 2, buildProgress: 9, food: 10 });
  st.relics = [{ id: 'relic_1', name: 'ガロの杯', traitId: 'drunkard',
    from: { name: 'ガロ', race: 'オーク', cause: 'fallen', army: null, turn: 2 }, holderUid: null }];
  Game.checkCounterattack();
  Game.prepareMissions(true); Game.selectMission(0); st.phase = "formation";
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  assert(st.facilityLevel === 1, `施設レベルが下がる（2→${st.facilityLevel}）`);
  assert(st.buildProgress === 3, `進捗はその段階の入口へ戻る（${st.buildProgress}）`);
  const r = st.lastBattle.ransacked;
  assert(!!r && r.foodAfter === Math.floor(r.foodBefore / 2),
    `食料が半減（${r && r.foodBefore}→${r && r.foodAfter}）`);
  assert(r.facilityBefore === 2 && r.facilityAfter === 1, '荒らしの記録に施設の増減が残る');
  assert(r.relic === 'ガロの杯', `奪われた品が記録される（${r.relic}）`);
  assert((st.relics || []).length === 0, '蔵の遺物が持ち去られる');
  assert(st.plundered.length === 1 && st.plundered[0].name === 'ガロの杯',
    `持ち去られた品が控えられる（${JSON.stringify(st.plundered)}）`);
  assert(st.alert === COUNTERATTACK.threshold - Math.floor(COUNTERATTACK.threshold / 2),
    `警戒は半分だけ引く（${st.alert}）`);
  assert(st.defenses.lost === 1, 'defenses.lost が増える');
  assert(st.roster.some(m => m.uid === 303), '留守番は無事');
  assert(st.ransackCount === 1, 'ransackCount が増える');
}

// 5. 何も無い城を荒らされても落ちない
{
  const st = freshRun([paper(401, 'ヨワシ'), tank(402, 'カタブツ')], [401, 402],
    { alert: COUNTERATTACK.threshold, facilityLevel: 0, food: 0 });
  st.relics = [];
  Game.checkCounterattack();
  Game.prepareMissions(true); Game.selectMission(0); st.phase = "formation";
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  const r0 = st.lastBattle.ransacked;
  assert(st.facilityLevel === 0 && !!r0 && r0.foodBefore === 0 && r0.relic === null,
    '施設0・食料0・遺物なしでも落ちない（奪うものが無いだけ）');
  assert(st.ransackCount === 1, '荒らされた事実だけは残る');
}

// 6. 勇者：魔王軍レベルが上限なら討伐隊ではなく勇者が来る
{
  const st = freshRun([tank(501, 'カタブツ')], [501],
    { alert: COUNTERATTACK.threshold, conquest: ENEMY_STAGES.length - 1 });
  assert(Game.armyLevel() === ENEMY_STAGES.length, '（前提）魔王軍レベルが上限');
  Game.checkCounterattack();
  assert(st.counterattack.kind === "hero", `来るのは勇者（${st.counterattack.kind}）`);
  Game.prepareMissions(true);
  assert(st.missionOffers[0].baseStage === ENEMY_STAGES[ENEMY_STAGES.length - 1].stage,
    `勇者戦は段階8（${st.missionOffers[0].baseStage}）`);
  Game.selectMission(0); st.phase = "formation";
  Game.deploy();
  assert(st.phase === "clear", `勇者を退ければクリア（${st.phase}）`);
  assert(st.clearedBy === "defense", '待った着地として記録される');
  assert(st.heroCame === true, '勇者は来た');
}
{
  // 勇者に城を明け渡す＝城陥落。再建は無い
  const st = freshRun([paper(601, 'ヨワシ'), tank(602, 'カタブツ')], [601, 602],
    { alert: COUNTERATTACK.threshold, conquest: ENEMY_STAGES.length - 1 });
  Game.checkCounterattack();
  assert(st.counterattack.kind === "hero", '（前提）勇者戦');
  Game.prepareMissions(true); Game.selectMission(0); st.phase = "formation";
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  assert(st.phase === "gameover", `城陥落で終わり（${st.phase}）`);
  assert(st.castleFell === true, 'castleFell が立つ');
  assert(!!st.record && st.record.cause === "城陥落",
    `ランの記録が「城陥落」（${st.record && st.record.cause}）`);
  assert(st.record.clearedBy === null, 'クリアではない');
}
{
  // 勇者を退けた後は、警戒が溜まっても もう来ない
  const st = freshRun([tank(701, 'カタブツ')], [701],
    { alert: COUNTERATTACK.threshold, heroCame: true, conquest: ENEMY_STAGES.length - 1 });
  assert(Game.checkCounterattack() === null, '勇者が済んでいれば予約されない');
}

// 7. 進軍に勝つと警戒+2
{
  const st = freshRun([tank(801, 'カタブツ')], [801], { alert: 0 });
  Game.prepareMissions(true);
  const invade = st.missionOffers.findIndex(m => m.missionKind === "invade");
  assert(invade >= 0, '（前提）通常は3択');
  assert(st.missionOffers[invade].alertDelta === 2, '進軍の警戒度が +2');
  Game.selectMission(invade); st.phase = "formation";
  Game.deploy();
  assert(st.alert >= 2, `進軍に勝つと警戒が上がる（${st.alert}）`);
}

// 8. 全滅の警戒度は +3
{
  const st = freshRun([paper(901, 'イケ1'), paper(902, 'イケ2'), member(903, 'ルスバン')],
    [901, 902], { alert: 0 });
  Game.prepareMissions(true); Game.selectMission(0); st.phase = "formation";
  Game.deploy();
  assert(st.wipeCount === 1, '（前提）全滅した');
  assert(st.alert >= Game.WIPE_ALERT, `全滅の警戒度は +${Game.WIPE_ALERT}（${st.alert}）`);
}

// 9. 旧セーブ
{
  Game.newRun();
  const st = Game.state;
  delete st.counterattack; delete st.heroCame; delete st.defenses;
  delete st.ransackCount; delete st.plundered; delete st.renownBonus;
  Game.migrateState();
  assert(st.counterattack === null && st.heroCame === false, '反撃の既定値が入る');
  assert(st.defenses && st.defenses.won === 0, 'defenses が入る');
  assert(Array.isArray(st.plundered) && st.ransackCount === 0, 'plundered / ransackCount が入る');
}

// 13. 城陥落（勇者の防衛戦で全滅）は記録を確定してから gameover になる（st.record が無いと画面が落ちる）
{
  const st = freshRun([paper(951, 'カミ')], [951], { gold: 0 });
  st.counterattack = { pending: true, kind: 'hero', armyName: '勇者一行' };
  Game.prepareMissions(true);
  const defend = st.missionOffers.findIndex(m => m.missionKind === 'defend');
  assert(defend >= 0, '（前提）勇者の防衛戦が予約されている');
  Game.selectMission(defend); st.phase = 'formation';
  Game.deploy();
  assert(st.phase === 'gameover' && st.castleFell === true, `城陥落で gameover（${st.phase}）`);
  assert(!!st.record && st.record.cleared === false, '記録が確定している（gameover 画面が読む st.record がある）');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
