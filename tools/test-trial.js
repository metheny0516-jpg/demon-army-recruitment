// 力試し（docs/SPEC_TRIAL_BATTLE_2026-09-18.md）：
// 第二幕決着後だけ出る梯子。誰も死なず、全滅してもランが終わらない。
//   node tools/test-trial.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const store = {}, ctx = { console, Math, Date, JSON,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] } };
vm.createContext(ctx);
const files = [...fs.readFileSync('index.html', 'utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)].map(m => m[1]);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const { Game, Captains, U } = vm.runInContext('({Game,Captains,U})', ctx);
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('✓ ' + name); } catch (e) { console.error('✗ ' + name, e.message); process.exitCode = 1; } };

// 第二幕決着後の状態を作る（決着そのものは test-act-progress.js が見ている）
function afterAct2(roster = ['orc', 'orc', 'goblin']) {
  Game.newRun();
  const st = Game.state;
  st.roster = roster.map((id, i) => Object.assign(Game.rollApplicant(id), { uid: i + 1, hp: 400, atk: 30, def: 20 }));
  st.activeUids = st.roster.map(m => m.uid);
  st.conquest = Game.MAX_CONQUEST;
  st.act = 2;
  st.act2Cleared = { by: 'conquest', turn: st.turn };
  st.gold = 100; st.food = 40;
  return st;
}

test('第二幕の前は札が出ない', () => {
  Game.newRun();
  Game.prepareMissions(true);
  assert(!Game.state.missionOffers.some(m => m.missionKind === 'trial'), '第二幕の前に力試しの札が出ている');
});

test('第二幕決着後の作戦会議に出る（略奪・力試し・訓練）', () => {
  const st = afterAct2();
  Game.prepareMissions(true);
  assert.deepEqual(st.missionOffers.map(m => m.missionKind).sort(), ['raid', 'train', 'trial']);
  const trial = st.missionOffers.find(m => m.missionKind === 'trial');
  assert.equal(trial.training, true, '稽古と同じ経路（誰も死なない）');
  assert.equal(trial.conquestDelta, 0);
  assert.equal(trial.alertDelta, 0);
  assert.equal(trial.reward, 0, '入金は決着でだけ行う');
  assert(trial.trialReward > 0, '勝てば金が入る');
  assert.equal(trial.trial.level, 0);
});

test('予約済みの防衛が残る旧セーブでは出さない', () => {
  const st = afterAct2();
  st.counterattack = { pending: true, kind: 'hero' };
  Game.prepareMissions(true);
  assert(!st.missionOffers.some(m => m.missionKind === 'trial'));
  assert(st.missionOffers.some(m => m.missionKind === 'defend'));
});

test('段ごとに顔ぶれが3つを順繰りする', () => {
  const st = afterAct2();
  Captains.init(st);
  const names = [0, 1, 2, 3].map(level => Game.trialLineup(level).name);
  assert.equal(names[0], names[3], '3段で一巡する');
  assert.equal(new Set(names.slice(0, 3)).size, 3, `3段ぶんは別の顔ぶれ（${names.slice(0, 3).join('／')}）`);
  assert(names.includes('勇者アレン一行（再々）'));
  assert(names.includes('連合軍総力戦'));
});

test('敵将が2人未満の段0は連合軍で代替する', () => {
  const st = afterAct2();
  Captains.init(st);
  // state() は未登録なら複製を返すので、書き込みは mark() を通す
  for (const id of Captains.ids()) Captains.mark(st, id, 'slain');
  assert.equal(Game.trialLineup(0).name, '連合軍総力戦', '討ちすぎた周回は連合軍が来る');
  // 2人残っていれば討ち漏らした者たちが来る
  const [a, b] = Captains.ids();
  Captains.mark(st, a, 'alive');
  Captains.mark(st, b, 'spared');
  assert.equal(Game.trialLineup(0).name, '討ち漏らした者たち');
  assert(Game.trialLineup(0).units.length > 2, '空いた枠は正規兵が埋める（人数で強さが変わらない）');
});

test('段が上がるほど相手が強くなる', () => {
  afterAct2();
  const mults = [0, 1, 2, 3].map(l => Game.trialMult(l));
  for (let i = 1; i < mults.length; i++) assert(mults[i] > mults[i - 1], `段${i}で強くなる`);
  assert(Math.abs(mults[0] - Game.TRIAL_BASE) < 1e-9, '段0 は基準の倍率');
});

test('勝てば段が上がり、金と戦功と称号が入る', () => {
  const st = afterAct2();
  Game.prepareMissions(true);
  const mission = st.missionOffers.find(m => m.missionKind === 'trial');
  const gold = st.gold, merit = st.roster[0].merit || 0;
  const notes = [];
  Game.settleTrial(mission, { victory: true, contribution: st.roster.map(m => ({ uid: m.uid, name: m.name, damage: m.uid })) }, notes);
  assert.equal(st.trials.level, 1, '段が上がる');
  assert.equal(st.trials.best, 1);
  assert.equal(st.trials.wins, 1);
  assert.equal(st.gold, gold + mission.trialReward, `称賛の金（${mission.trialReward}G）`);
  assert.equal(st.roster[0].merit, merit + 2, '生存者に戦功 +2');
  assert(st.roster.some(m => /段の壁を越えた者/.test(m.epithet || '')), '殊勲者に称号');
});

test('負けても段は下がらず、失うのは面目だけ', () => {
  const st = afterAct2();
  Game.prepareMissions(true);
  const mission = st.missionOffers.find(m => m.missionKind === 'trial');
  st.trials.level = 2; st.trials.best = 2;
  const gold = st.gold, merit = st.roster[0].merit || 0;
  const notes = [];
  Game.settleTrial({ ...mission, trial: { level: 2, mult: 2 } },
    { victory: false, contribution: st.roster.map(m => ({ uid: m.uid, name: m.name, damage: 1 })) }, notes);
  assert.equal(st.trials.level, 2, '段は据え置き');
  assert.equal(st.trials.losses, 1);
  assert.equal(st.gold, gold, '金は減らない');
  assert.equal(st.roster[0].merit, merit, '戦功も増えない');
  assert(notes.length > 0, '日誌に一行残る');
});

test('全滅しても誰も死なず、ランは続く', () => {
  const st = afterAct2(['orc']);
  Game.prepareMissions(true);
  const at = st.missionOffers.findIndex(m => m.missionKind === 'trial');
  Game.selectMission(at);
  const before = { roster: st.roster.length, wipes: st.wipeCount || 0, alert: st.alert, conquest: st.conquest };
  // 全滅で帰ってくる決着（HP0 は稽古の経路が負傷へ変える）
  U.seeded(7);
  const out = Game.deploy();
  assert(out, '出撃できる');
  assert.equal(st.roster.length, before.roster, '誰も名簿から消えない');
  assert.equal(st.wipeCount || 0, before.wipes, '全滅として数えない');
  assert.equal(st.alert, before.alert, '王国の警戒は動かない');
  assert.equal(st.conquest, before.conquest, '王国攻略も動かない');
  assert(['result', 'recruit', 'preparation'].includes(st.phase), `ランが続く（${st.phase}）`);
  assert(st.phase !== 'gameover', 'endRun しない');
});

test('旧セーブにも梯子の器が入る', () => {
  const st = afterAct2();
  delete st.trials;
  Game.migrateState();
  assert.deepEqual(st.trials, { level: 0, best: 0, wins: 0, losses: 0, last: null });
});

test('記録に「どこまで登ったか」が残る', () => {
  const st = afterAct2();
  st.trials = { level: 4, best: 4, wins: 4, losses: 2, last: null };
  Game.endRun(true);
  assert.deepEqual(Game.state.record.trials, { best: 4, wins: 4, losses: 2 });
});

console.log(`${passed} trial tests passed`);
