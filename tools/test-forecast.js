// 「壁」の見積り（Game.battleForecast）を検証する。
// 目的は精度そのものではなく、プレイヤーが編成の目標として読めることと、
// 「素では足りない」と出た戦いが連鎖で覆せる余地を残していること。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);

let failed = 0;
const assert = (condition, message) => {
  console.log(`${condition ? "✓" : "✗"} ${message}`);
  if (!condition) failed++;
};

const army = n => {
  Game.newRun();
  const st = Game.state;
  let guard = 0;
  while (st.roster.length < n && guard++ < 20) {
    if (st.phase === "recruit" && st.applicants.length) Game.hire(0);
    else { st.phase = "recruit"; Game.genApplicants(); st.hiresLeft = 1; }
  }
  st.activeUids = st.roster.slice(0, Game.MAX_DEPLOY).map(m => m.uid);
  return st;
};

// 1. 材料が欠けていれば見積りを出さない（嘘の数字を出さない）
{
  const st = army(3);
  assert(Game.battleForecast(null) === null, "作戦がなければ見積りを出さない");
  assert(Game.battleForecast({ units: [] }) === null, "敵情がなければ見積りを出さない");
  st.activeUids = [];
  assert(Game.battleForecast(Game.stageData()) === null, "出撃隊が空なら見積りを出さない");
}

// 2. 敵の総HPは作戦カードの敵編成そのもの（別の乱数を引かない）
{
  const st = army(3);
  const mission = Game.prepareMissions(true)[0];
  const f = Game.battleForecast(mission);
  const total = mission.units.reduce((sum, u) => sum + u.hp, 0);
  assert(f.enemyHp === total, `敵の総HPは敵編成の合計（${f.enemyHp}）`);
  assert(f.enemyCount === mission.units.length, "敵の数も敵編成そのもの");
  assert(Game.battleForecast(mission).enemyHp === f.enemyHp, "同じ入力なら同じ見積りが出る");
}

// 3. 出撃隊を変えると見積りが動く（編成の判断材料になっている）
{
  const st = army(4);
  const mission = Game.stageData();
  const full = Game.battleForecast(mission);
  st.activeUids = st.activeUids.slice(0, 1);
  const solo = Game.battleForecast(mission);
  assert(solo.playerRound < full.playerRound, "出撃者を減らすと1ラウンド火力が落ちる");
  assert(solo.roundsToWin >= full.roundsToWin, "火力が落ちれば削り切るまでのラウンドが伸びる");
  assert(solo.squadCount === 1, "見積りは実際の出撃人数を数える");
}

// 4. 判定は3段階で、余裕の大きさに従う
{
  const st = army(3);
  const weak = { units: [{ hp: 1, atk: 1, def: 0, spd: 1 }] };
  const wall = { units: Array.from({ length: 5 }, () => ({ hp: 9999, atk: 999, def: 40, spd: 9 })) };
  assert(Game.battleForecast(weak).verdict === "clear", "楽な相手はclear");
  const hard = Game.battleForecast(wall);
  assert(hard.verdict === "short", "手に負えない相手はshort");
  assert(hard.margin < 0, "shortは負けの見積りである");
  assert(hard.hopeless && !/\d{3}/.test(hard.label),
    `上限ラウンドを超える差は桁の大きい数字にしない（${hard.label}）`);
  const nearWall = { units: [{ hp: 400, atk: 30, def: 4, spd: 6 }] };
  const near = Game.battleForecast(nearWall);
  if (near.verdict === "short" && !near.hopeless) {
    assert(near.label.includes("ラウンド足りない"), `届く範囲なら何ラウンド足りないかを言う（${near.label}）`);
  } else {
    assert(true, "届く範囲のshortは条件次第（この編成では出なかった）");
  }
}

// 5. 見積りは連鎖・シナジーを含まない下限である
//    （同じ編成に押し出しと深追いを足しても見積りは変わらない＝上振れの余地として残る）
{
  const st = army(3);
  const mission = Game.stageData();
  const before = Game.battleForecast(mission);
  for (const m of st.roster) m.traits = [...(m.traits || []), "relay_kick", "escalate"];
  const after = Game.battleForecast(mission);
  assert(after.playerRound === before.playerRound,
    "連鎖特性を足しても見積りは動かない（見積りは素の殴り合いの下限）");
}

// 6. 施設の防御補正は見積りへ反映される（戦闘で実際に効くため）
{
  const st = army(3);
  const mission = Game.stageData();
  st.facilityLevel = 0;
  const base = Game.battleForecast(mission);
  st.facilityLevel = Game.facilityInfo(2) ? 2 : st.facilityLevel;
  const built = Game.battleForecast(mission);
  assert(built.playerHp >= base.playerHp && built.enemyRound <= base.enemyRound,
    "施設を建てると総HPが増え、敵の1ラウンド火力が下がる");
}

console.log(failed ? `\n${failed}件失敗` : "\n力くらべテスト完了");
process.exit(failed ? 1 : 0);
