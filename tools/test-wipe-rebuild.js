// 全滅は敗北であって終了ではない。出撃した者は戦死し、留守番と金で建て直す。
//   node tools/test-wipe-rebuild.js
// 再起（時の巻き戻し）は「名簿が空で雇う金も無い」ときの最後の手段だけに縮めた。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
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
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [],
  department: "combat", injured: 0, relicIds: [],
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 } }, x || {});

// 確実に全滅する出撃隊（紙2人）と、留守番。敵は作戦から来るので味方を弱くして作る。
const doomed = () => [
  member(101, 'イケニエ一号', { hp: 1, atk: 1, def: 0, spd: 1 }),
  member(102, 'イケニエ二号', { hp: 1, atk: 1, def: 0, spd: 1 })
];

let FIXED_MISSION = null;
function freshRun(roster, activeUids, gold) {
  Game.newRun();
  const st = Game.state;
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = 60; st.gold = gold === undefined ? 300 : gold;
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

// 1. 全滅：出撃した者は戦死、留守番は残る、終了しない
{
  const st = freshRun([...doomed(), member(103, 'ルスバン', { hp: 30 })], [101, 102]);
  const alertBefore = st.alert, turnBefore = st.turn;
  const out = Game.deploy();
  // wipe は battle.js の戻り値ではなくタイムラインの result イベントに載る（Game.wipeOf）
  assert(Game.wipeOf(out.result) === "player",
    `（前提）出撃隊が全滅した戦闘（wipe=${Game.wipeOf(out.result)} victory=${out.result.victory}）`);
  assert(st.departed.filter(d => d.cause === 'fallen').length === 2,
    `出撃した2人が departed に fallen で入る（${st.departed.length}件）`);
  assert(st.departed.every(d => d.army), '相手の軍が記録されている');
  assert(!st.roster.some(m => m.uid === 101 || m.uid === 102), '戦死した者は名簿から消える');
  assert(st.roster.some(m => m.uid === 103), '留守番は残る');
  assert(st.phase === "result", `終了しない。フェーズは result（${st.phase}）`);
  assert(st.lastBattle.wiped === true, 'lastBattle.wiped が立つ');
  assert(st.lastBattle.fallen.length === 2, '戻らなかった者が lastBattle に載る');
  assert(!st.lastBattle.reward && !st.lastBattle.lootGold, '報酬も略奪も無い');
  assert(st.alert > alertBefore, `警戒度は上がる（${alertBefore}→${st.alert}）`);
  assert(st.turn === turnBefore + 1, 'ターンは進む');
  assert(st.wipeCount === 1, 'wipeCount が1増える');
  assert(st.fallenTotal === 2, '戦没者の累計に入る');
  assert(st.applicants.length > 0, '次の面接の応募者が用意されている（建て直せる）');
}

// 2. 戦歴のある者が全滅すると遺物が蔵に入り、次の面接に縁の者が来る
{
  const vet = member(201, 'ガロ', { hp: 1, atk: 1, def: 0, spd: 1, traits: ['drunkard'] });
  vet.record = { battles: 8, wins: 5, downed: 1, carried: 0, late: 2, ate: 0 };
  const st = freshRun([vet, member(202, 'ルスバン', { hp: 30 })], [201]);
  Game.deploy();
  assert((st.relics || []).length === 1, `遺物が蔵に入る（${(st.relics || []).length}件）`);
  assert(st.relics[0].name.startsWith('ガロの'), `品に名が残る（${st.relics[0] && st.relics[0].name}）`);
  assert(st.lastBattle.relicsLeft.length === 1, '結果画面へ渡す relicsLeft に載る');
  const bonded = st.applicants.filter(m => m.bond);
  assert(bonded.length === 1, `次の面接に縁の者が来る（${bonded.length}人）`);
  assert(bonded[0] && bonded[0].bond.name === 'ガロ' && bonded[0].bond.cause === 'fallen',
    '縁の相手は戦死した本人');
}

// 3. 留守番0・金あり → 建て直せる（面接へ）
{
  const st = freshRun(doomed(), [101, 102], 300);
  Game.deploy();
  assert(!st.roster.length, '（前提）名簿が空になった');
  assert(Game.canRebuild() === true, '金があれば建て直せる');
  assert(st.phase === "result", `フェーズは result（${st.phase}）`);
  assert(st.applicants.length > 0, '応募者が用意されている');
}

// 4. 留守番0・金なし → ここでだけ再起
// **無料採用枠があれば 0G でも建て直せる**（hireCost() が 0 になる）ので、枠も潰す。
{
  const st = freshRun(doomed(), [101, 102], 0);
  st.hiresLeft = 0;
  assert(Game.hireCost() > 0, `（前提）無料枠が無く採用に金が要る（${Game.hireCost()}G）`);
  Game.deploy();
  assert(!st.roster.length, '（前提）名簿が空');
  assert(Game.canRebuild() === false, '雇う金も無ければ建て直せない');
  assert(st.phase === "defeat", `ここでだけ defeat（${st.phase}）`);
  assert(Game.canRetry() === true, '再起が使える');
  Game.retry();
  assert(Game.state.phase !== "defeat", `再起すると defeat から出る（${Game.state.phase}）`);
}
{
  // 再起を使い切っていれば終わり
  const st = freshRun(doomed(), [101, 102], 0);
  st.hiresLeft = 0;
  st.retriesLeft = 0;
  Game.deploy();
  assert(st.phase === "gameover", `再起を使い切っていれば gameover（${st.phase}）`);
}

{
  // 無料採用枠が残っていれば、金が無くても建て直せる（枠は金と同じ意味を持つ）
  const st = freshRun(doomed(), [101, 102], 0);
  st.hiresLeft = 1;
  Game.deploy();
  assert(Game.canRebuild() === true, '無料採用枠があれば 0G でも建て直せる');
  assert(st.phase === "result", `フェーズは result（${st.phase}）`);
}

// 5. 傭兵は戦死に数えない
{
  const st = freshRun([...doomed(), member(105, 'ルスバン', { hp: 30 })], [101, 102]);
  st.mercenaries = [{ uid: 999, tplId: 'orc', name: 'ヤトイ', race: 'オーク', job: '兵',
    hp: 1, atk: 1, def: 0, spd: 1, salary: 0, loyalty: 50, traits: [], tags: [] }];
  Game.deploy();
  assert(!st.departed.some(d => d.name === 'ヤトイ'), '傭兵は departed に入らない');
  assert(st.departed.length === 2, '軍団員2人だけが履歴に載る');
}

// 6. 判定負け（30ラウンド経過。全滅ではない）は撤退と同じ結末
{
  // 両軍とも決め手を欠く編成（攻撃1・防御高）で30ラウンドを使い切らせる
  const a = member(301, 'カタブツ', { hp: 400, atk: 1, def: 30, spd: 3 });
  const st = freshRun([a], [301]);
  st.selectedMission.units = st.selectedMission.units.map(u => ({ ...u, hp: 900, atk: 3, def: 30 }));
  const out = Game.deploy();
  assert(Game.wipeOf(out.result) === null, `（前提）どちらも全滅していない（wipe=${Game.wipeOf(out.result)}）`);
  assert(out.result.victory === false, '（前提）判定負け');
  assert(st.lastBattle.lostOnPoints === true, 'lostOnPoints が立つ');
  assert(st.lastBattle.retreated === false, '撤退の印は立たない');
  assert(st.retreatCount === 0, '退いた回数には数えない（軍風の材料を汚さない）');
  assert(st.roster.some(m => m.uid === 301), '立っていた者は名簿に残る');
  assert(st.phase === "result", `フェーズは result（${st.phase}）`);
  assert(!st.lastBattle.reward, '報酬は無い');
}

// 7. 引数なし deploy()（sim・テスト）と UI 経由で同じ結末
{
  const a = (() => { const st = freshRun([...doomed(), member(401, 'ル', { hp: 30 })], [101, 102]);
    Game.deploy();
    return { phase: st.phase, wiped: st.lastBattle.wiped, roster: st.roster.length, wipeCount: st.wipeCount }; })();
  const b = (() => { const st = freshRun([...doomed(), member(401, 'ル', { hp: 30 })], [101, 102]);
    Game.deploy({ offerRetreat: true });
    if (st.pendingBattle) Game.settleBattle("continue");
    return { phase: st.phase, wiped: st.lastBattle.wiped, roster: st.roster.length, wipeCount: st.wipeCount }; })();
  assert(JSON.stringify(a) === JSON.stringify(b),
    `引数なしと UI 経由で同じ結末（${JSON.stringify(a)} / ${JSON.stringify(b)}）`);
}

// 8. 旧セーブ
{
  Game.newRun();
  const st = Game.state;
  delete st.wipeCount;
  Game.migrateState();
  assert(st.wipeCount === 0, '旧セーブに wipeCount が入る');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
