// 撤退の判断・run.js 側：提案が出た戦闘だけ決着を保留し、「続ける／退く」で結末を分ける。
//   node tools/test-retreat-run.js
// battle.js 側（印を置く側）は test-retreat-battle.js。ここは受ける側だけを見る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
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
// 乱数を固定して「同じ戦闘」を二度作れるようにする（続行の一致比較に要る）
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);
const Game = vm.runInContext('Game', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const clone = v => JSON.parse(JSON.stringify(v));

// 紙の兵と硬い兵。紙のほうが途中で倒れ、硬いほうが立ったまま残る
const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [], department: "combat" }, x || {});

function freshRun() {
  Game.newRun();
  const st = Game.state;
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = 40; st.gold = 200;
  st.roster = [member(101, 'ヨワシ', { hp: 8, atk: 2, def: 0, spd: 9 }),
               member(102, 'カタブツ', { hp: 500, atk: 40, def: 20, spd: 4 }),
               member(103, 'ルスバン', { hp: 30, atk: 4, def: 2, spd: 2 })];
  st.activeUids = [101, 102];
  Game.syncDepartments();
  if (st.phase !== "mission") Game.prepareMissions(true);
  Game.selectMission(0);
  // 作戦は毎回引き直される（報酬も敵隊列も変わる）。同じ戦闘を二度作れるように
  // 最初の1件で固定する。撤退の検査は「同じ戦闘の二つの結末」を比べるものなので、
  // ここが揺れると比較そのものが嘘になる。
  if (!FIXED_MISSION) FIXED_MISSION = clone(st.selectedMission);
  st.selectedMission = clone(FIXED_MISSION);
  return st;
}
let FIXED_MISSION = null;

// 0. 前提：この編成で撤退の提案が出る戦闘になる
{
  const st = freshRun();
  const out = Game.deploy({ offerRetreat: true });
  assert(!!out && !!out.result.retreatOffer, '（前提）この戦闘では撤退の提案が出る');
  assert(out.result.retreatOffer.contribution.some(c => c.uid === 101 && c.injured && c.survived),
    '（前提）提案時点の戦果で、倒れた者は担いで帰れる扱いになっている');
}

// 1. 引数なしの deploy() は今までどおり即決着（sim・テスト58本の経路）
{
  const st = freshRun();
  const before = { gold: st.gold, roster: st.roster.length };
  Game.deploy();
  assert(!st.pendingBattle, '引数なしなら決着を保留しない');
  assert(st.phase === "result" || st.phase === "defeat" || st.phase === "clear",
    `引数なしなら今までどおりのフェーズ（${st.phase}）`);
  assert(st.gold !== before.gold || st.roster.length !== before.roster || !!st.lastBattle,
    '引数なしなら戦闘の結果がラン状態へ反映されている');
}

// 2. offerRetreat：決着を保留し、ラン状態はまだ動かない
{
  const st = freshRun();
  const before = { gold: st.gold, alert: st.alert, roster: clone(st.roster), turn: st.turn, lastBattle: st.lastBattle };
  Game.deploy({ offerRetreat: true });
  assert(st.phase === "battle", `保留中のフェーズは battle（${st.phase}）`);
  assert(!!st.pendingBattle, 'pendingBattle に決着に要るものが入っている');
  assert(st.gold === before.gold, '所持金はまだ動いていない');
  assert(st.alert === before.alert, '警戒度はまだ動いていない');
  assert(JSON.stringify(st.roster) === JSON.stringify(before.roster), '名簿はまだ動いていない');
  assert(st.turn === before.turn && st.lastBattle === before.lastBattle, 'ターンも戦果もまだ動いていない');
}

// 3. settleBattle("continue") は引数なし deploy() と同じ状態になる
{
  const a = (() => { const st = freshRun(); Game.deploy(); return clone({ gold: st.gold, alert: st.alert, turn: st.turn,
    roster: st.roster.map(m => m.uid), phase: st.phase, victory: st.lastBattle.victory, reward: st.lastBattle.reward }); })();
  const b = (() => { const st = freshRun(); Game.deploy({ offerRetreat: true }); Game.settleBattle("continue");
    return clone({ gold: st.gold, alert: st.alert, turn: st.turn,
      roster: st.roster.map(m => m.uid), phase: st.phase, victory: st.lastBattle.victory, reward: st.lastBattle.reward }); })();
  assert(JSON.stringify(a) === JSON.stringify(b), '続行の結末は引数なし deploy() と完全に一致する');
  assert(!Game.state.pendingBattle, '決着したら pendingBattle は消える');
}

// 4. settleBattle("retreat")：担いで帰り、報酬は無く、給与は払い、警戒度は上がる
{
  const st = freshRun();
  const goldBefore = st.gold, alertBefore = st.alert, turnBefore = st.turn;
  Game.deploy({ offerRetreat: true });
  const phase = Game.settleBattle("retreat");
  const weak = st.roster.find(m => m.uid === 101);
  assert(!!weak, '倒れていた者が名簿に残っている（戦死しない）');
  assert(weak && weak.injured === 1, '担いで帰った者は負傷1（次の1戦だけ休む）');
  assert(!st.activeUids.includes(101), '負傷者は出撃隊から外れている');
  assert(!st.lastBattle.reward, '作戦報酬は無い');
  assert(!st.lastBattle.lootGold, '略奪金貨も確定しない');
  assert(st.gold < goldBefore || st.gold === goldBefore, `所持金は報酬ぶん増えていない（${goldBefore}→${st.gold}）`);
  assert(st.alert > alertBefore, `警戒度は上がる（${alertBefore}→${st.alert}）`);
  assert(st.notesHasPayroll !== false && st.lastBattle.notes.some(n => /給与|支払|手当/.test(n)), '給与は払う');
  assert(phase === "result" && st.phase === "result", '敗北ではなく result フェーズ');
  assert(st.lastBattle.retreated === true && st.lastBattle.victory === false, 'lastBattle に撤退の印');
  assert(st.retreatCount === 1, 'retreatCount が1増える');
  assert(st.turn === turnBefore + 1, 'ターンは進む');
  assert(!st.missionOffers.length, '作戦は消える');
  // 表示側が読むものが欠けていないこと（結果画面・戦果の1文・魔界史）
  assert(Array.isArray(st.lastBattle.contribution) && !!st.lastBattle.chainSummary && !!st.lastBattle.facility,
    'lastBattle は今までと同じ形（contribution / chainSummary / facility）');
}

// 5. 負傷者は出撃できない。次の戦闘を一つ決着させると治る
{
  const st = Game.state;   // 4 の続き
  assert(Game.toggleDeploy(101) === false, '負傷者は toggleDeploy で出撃隊へ入れられない');
  assert(Game.assignDepartment(101, "combat") === false, '負傷者は assignDepartment("combat") でも入れられない');
  assert(Game.assignDepartment(101, "home") === true, '留守番としては働ける');
  Game.prepareMissions(true); Game.selectMission(0);
  st.activeUids = [102];
  Game.syncDepartments();
  Game.deploy();
  assert(st.roster.find(m => m.uid === 101).injured === 0, '一戦決着すれば負傷が治る');
  Game.prepareMissions(true); Game.selectMission(0);
  assert(Game.toggleDeploy(101) === true, '治れば出撃できる');
}

// 6. pendingBattle が無ければ settleBattle は false
{
  assert(Game.settleBattle("retreat") === false, '保留中の戦闘が無ければ false');
}

// 7. phase === "battle" のセーブをロードすると、続行として決着している
{
  const st = freshRun();
  Game.deploy({ offerRetreat: true });
  Game.save();
  const saved = store[Object.keys(store)[0]];
  assert(/"phase":"battle"/.test(saved), '（前提）保留中の戦闘がセーブされている');
  Game.load();
  assert(Game.state.phase !== "battle", `ロード後は battle フェーズで止まらない（${Game.state.phase}）`);
  assert(!Game.state.pendingBattle, 'ロード後に pendingBattle は残らない');
  assert(!!Game.state.lastBattle && Game.state.lastBattle.retreated !== true,
    'ロードは続行として決着する（撤退の機会はリロードで取り直せない）');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
