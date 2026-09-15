// 地図の上の戦争・段階A の配線（docs/SPEC_TERRITORY_A_2026-09-15.md §2）：
// 候補3つが作戦会議に出る／落とすと領土と征服度が進む／贈ると金と食料が減って領土になる／
// 巡回は征服が進まず警戒も上がらない。
//   node tools/test-territory-run.js
const fs = require('fs'), vm = require('vm');
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
} };
vm.createContext(ctx);
const files = [...fs.readFileSync('index.html', 'utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)].map(m => m[1]);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Game = vm.runInContext('Game', ctx), Territory = vm.runInContext('Territory', ctx);
let failed = 0;
const ok = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const fresh = () => { Game.newRun(); const st = Game.state; st.phase = 'mission'; return st; };

// ── 1. 3択は地図の候補3つ ───────────────────────────────
{
  const st = fresh();
  const offers = Game.prepareMissions(true);
  const takes = offers.filter(m => m.territoryMode === 'take');
  ok(takes.length === 3, `落とす／従える札が3枚（${takes.length}）`);
  ok(takes.every(m => Territory.byId(m.territoryId)), '3枚とも地図の場所を指している');
  const frontier = Territory.frontier(st).map(p => p.id);
  ok(takes.every(m => frontier.includes(m.territoryId)), '候補は領土に隣接する場所だけ');
  ok(offers.some(m => m.missionKind === 'train'), '常設の訓練は残っている');
  // 守備段階は征服度ではなく、その場所の garrison から引く
  const first = takes.find(m => m.territoryId === 'h01');
  if (first) ok(first.baseStage === Territory.byId('h01').garrison,
    `守備は場所の段階（辺境の村 ${first.baseStage}）`);
  else ok(true, '（この回の候補に辺境の村は出なかった）');
}

// ── 2. 落とすと領土になり、征服度はそこから写る ────────────────
{
  const st = fresh();
  st.turn = 3;
  const mission = { missionKind: 'invade', territoryId: 'h01', territoryMode: 'take', region: '辺境の村', alertDelta: 0 };
  const notes = [];
  Game.applyMissionOutcome(mission, notes);
  ok(Territory.has(st, 'h01'), '落とした土地が領土になる');
  ok(st.conquest === Territory.conquestOf(st), `征服度は領土から写る（${st.conquest}）`);
  // 6つ落とせば征服度は 4（12 土地で 8 の割り当て）
  for (const id of ['h02', 'h03', 'h04', 'h05', 'h06']) Territory.take(st, id);
  Game.applyMissionOutcome({ missionKind: 'invade', territoryId: 'h07', territoryMode: 'take', region: '峠', alertDelta: 0 }, notes);
  ok(st.conquest === Math.floor(7 * Territory.rules().conquestPerLand),
    `土地が増えると征服度も進む（7土地 → ${st.conquest}）`);

  // 略奪は領土にならず、次に来るとき守備が硬い
  const before = JSON.stringify(st.territory);
  Game.applyMissionOutcome({ missionKind: 'raid', territoryId: 'h08', territoryMode: 'raid', region: '港町', alertDelta: 2 }, notes);
  ok(!Territory.has(st, 'h08') && JSON.stringify(st.territory) === before, '略奪では領土にならない');
  ok(st.raided.h08 === 1 && Game.placeStage(Territory.byId('h08')) === Territory.byId('h08').garrison + 1,
    `略奪した土地は次に来ると1段硬い（${Game.placeStage(Territory.byId('h08'))}）`);
}

// ── 3. 贈ると金と食料が減って、戦わずに領土になる ────────────────
{
  const st = fresh();
  Territory.take(st, 't01');                      // 隣を先に取って t02 を候補に出す
  const cost = Territory.tributeCost('t02');
  st.gold = cost.gold + 10; st.food = cost.food + 5; st.turn = 2;
  const offers = Game.prepareMissions(true);
  const index = offers.findIndex(m => m.missionKind === 'tribute' && m.territoryId === 't02');
  ok(index >= 0, '贈れる部族には「贈る」の札が並ぶ');
  const gold = st.gold, food = st.food, turn = st.turn;
  Game.selectMission(index);
  ok(Territory.has(st, 't02'), '贈ると戦わずに領土になる');
  ok(st.gold === gold - cost.gold && st.food === food - cost.food,
    `金と食料が減る（${gold}→${st.gold}／${food}→${st.food}）`);
  ok(st.turn === turn + 1 && st.phase === 'mission', `決着は1つ進み、出撃には進まない（${st.phase}）`);
  // 払えなければ何も起きない
  const st2 = fresh();
  Territory.take(st2, 't01');
  st2.gold = 0; st2.food = 0;
  const offers2 = Game.prepareMissions(true);
  const i2 = offers2.findIndex(m => m.missionKind === 'tribute');
  if (i2 >= 0) {
    Game.selectMission(i2);
    ok(!Territory.has(st2, offers2[i2].territoryId), '払えなければ従えられない');
  } else ok(true, '（この回は贈れる部族が候補に出なかった）');
}

// ── 4. 巡回は征服が進まず、警戒も上がらない ──────────────────
{
  const st = fresh();
  Territory.take(st, 'h01');
  st.conquest = Territory.conquestOf(st);
  const offers = Game.prepareMissions(true);
  const patrol = offers.find(m => m.missionKind === 'patrol');
  ok(!!patrol, '領土があれば巡回の札が常設で出る');
  ok(patrol.alertDelta === 0 && patrol.conquestDelta === 0, '巡回では警戒も征服も動かない');
  ok(patrol.baseStage === Territory.patrolStage(st), `守備は巡回の段階（${patrol.baseStage}）`);
  const alert = st.alert, conquest = st.conquest, notes = [];
  Game.applyMissionOutcome(patrol, notes);
  ok(st.alert === alert && st.conquest === conquest,
    `巡回の決着でも動かない（警戒 ${st.alert}／攻略 ${st.conquest}）`);
  ok(st.patrolCount === 1, `巡回の回数を数える（${st.patrolCount}）`);
  // 領土が無ければ巡回は出ない
  const st2 = fresh();
  ok(!Game.prepareMissions(true).some(m => m.missionKind === 'patrol'), '領土が無ければ巡回は出ない');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全通過');
process.exit(failed ? 1 : 0);
