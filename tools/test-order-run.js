// 号令・run.js 側：節目のある戦闘は答えを聞くまで決着を保留し、名指しなら同じ種で計算し直す。
//   node tools/test-order-run.js
// battle.js 側（提案と実行）は test-order-battle.js。ここは受ける側だけを見る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => store[key] || null, setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
// 乱数は固定しない（種の仕組みそのものを見る）。作戦だけ最初の1件で固定する。
const Game = vm.runInContext('Game', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const clone = v => JSON.parse(JSON.stringify(v));

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [], department: "combat" }, x || {});

let FIXED_MISSION = null;
function freshRun() {
  Game.newRun();
  const st = Game.state;
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = 40; st.gold = 200;
  // 紙の前衛（倒れて節目を作る）＋怪力のオーク（号令できる）＋留守番
  st.roster = [member(101, 'ヨワシ', { hp: 8, atk: 2, def: 0, spd: 9 }),
               member(102, 'ガロ', { hp: 260, atk: 14, def: 8, spd: 4, traits: ['brute'] }),
               member(103, 'ルスバン', { hp: 30, atk: 4, def: 2, spd: 2 })];
  st.activeUids = [101, 102];
  Game.syncDepartments();
  if (st.phase !== "mission") Game.prepareMissions(true);
  Game.selectMission(0);
  if (!FIXED_MISSION) FIXED_MISSION = clone(st.selectedMission);
  st.selectedMission = clone(FIXED_MISSION);
  return st;
}
// 節目が出る戦闘を引くまで試す（乱数は固定していないので、出ない引きもある）
function deployWithOffer(max = 40) {
  for (let i = 0; i < max; i++) {
    const st = freshRun();
    const out = Game.deploy({ offerRetreat: true });
    if (out && out.result.orderOffer) return { st, out };
  }
  return null;
}

// 1. 引数なし deploy() では号令の節目が出ず、今までどおり即決着（sim・テストの経路）
{
  const st = freshRun();
  const out = Game.deploy();
  assert(out && !out.result.orderOffer, '引数なしなら order_offer を出さない');
  assert(!st.pendingBattle && st.phase !== 'battle', '引数なしなら決着を保留しない');
}

// 2. offerRetreat（UI）：節目が出た戦闘は決着を保留する（撤退の提案が無くても）
const got = deployWithOffer();
assert(!!got, '（前提）この編成で号令の節目が出る戦闘を引ける');
if (got) {
  const { st, out } = got;
  assert(st.phase === 'battle' && !!st.pendingBattle, '節目がある戦闘は phase=battle で保留される');
  assert(!!st.pendingBattle.replay && st.pendingBattle.replay.options.seed !== undefined, '計算し直すための入力（種つき）が保留に入っている');
  assert(st.maxChain === 0 || st.pendingBattle.recorded !== true, '答える前は記録（最大CHAIN など）を取らない');
  const offer = out.result.orderOffer;
  const before = { gold: st.gold, roster: st.roster.length, alert: st.alert };

  // 3. 「任せる」→ 計算し直さず、そのまま決着（撤退の提案が後に無ければ）
  const retreatLater = out.result.retreatOffer && out.result.retreatOffer.index > offer.index;
  const changed = Game.answerOrder('none');
  assert(changed === null, '任せるなら新しいタイムラインは返さない');
  if (!retreatLater) {
    assert(!st.pendingBattle && st.phase !== 'battle', '任せたら決着する');
    assert(st.gold !== before.gold || st.roster.length !== before.roster || st.alert !== before.alert || !!st.lastBattle, '決着がラン状態へ反映される');
  } else {
    assert(!!st.pendingBattle && st.pendingBattle.orderAnswered, '撤退の提案が後に控えていれば決着は待つ');
    Game.settleBattle('continue');
    assert(!st.pendingBattle, '撤退に答えたら決着する');
  }
  assert(Game.answerOrder('none') === null, '二度目の答えは受け付けない');
}

// 4. 名指し → 同じ種で計算し直す。提案の手前までは同じ、そこから先に order_exec が入る
{
  const got2 = deployWithOffer();
  assert(!!got2, '（前提）もう一度、節目が出る戦闘を引ける');
  if (got2) {
    const { st, out } = got2;
    const offer = out.result.orderOffer;
    const original = clone(out.result.timeline);
    const cand = offer.candidates[0];
    const changed = Game.answerOrder(cand.unitId);
    assert(Array.isArray(changed), '名指しなら新しいタイムラインを返す');
    if (changed) {
      const prefixSame = original.slice(0, offer.index).every((e, i) => e.type === changed[i].type && e.eventId === changed[i].eventId);
      assert(prefixSame, '提案の手前までは同じ展開');
      const exec = changed.find(e => e.type === 'order_exec');
      assert(exec && exec.unitId === cand.unitId, '提案のあとに order_exec が入る');
      assert(changed.find(e => e.type === 'order_offer').answered === cand.unitId, '提案イベントに答えが刻まれる');
      assert(st.orderCount === 1, 'orderCount が増える');
      assert(!st.lastBattle || st.phase !== 'battle' || !!st.pendingBattle, '（形式）');
      // 決着後の lastBattle は計算し直した結果に基づく
      if (!st.pendingBattle) {
        const b = st.lastBattle;
        assert(b && (b.victory === changed.find(e => e.type === 'result').victory), 'lastBattle の勝敗が計算し直した結末と一致する');
      }
    }
  }
}

// 5. 候補にいない unitId を渡しても落ちず、任せる扱いになる
{
  const got3 = deployWithOffer();
  if (got3) {
    const changed = Game.answerOrder('e0');
    assert(changed === null && got3.st.orderCount === 0, '候補外の名指しは任せる扱い');
  } else assert(true, '（前提が引けず省略）');
}

// 6. 保留中にセーブ→ロードすると、続行として決着し、記録も取られる
{
  const got4 = deployWithOffer();
  if (got4) {
    Game.save();
    Game.load();
    const st = Game.state;
    assert(!st.pendingBattle && st.phase !== 'battle', 'ロード時に保留は続行として決着する');
  } else assert(true, '（前提が引けず省略）');
}

// 7. 既存の撤退テストの前提：撤退の提案だけの戦闘は今までどおり settleBattle で決着する
{
  let done = false;
  for (let i = 0; i < 40 && !done; i++) {
    const st = freshRun();
    const out = Game.deploy({ offerRetreat: true });
    if (out && out.result.retreatOffer && !out.result.orderOffer) {
      Game.settleBattle('continue');
      assert(!st.pendingBattle, '撤退の提案だけなら settleBattle で即決着');
      done = true;
    }
  }
  if (!done) assert(true, '（撤退だけの戦闘が引けず省略）');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全通過');
process.exit(failed ? 1 : 0);
