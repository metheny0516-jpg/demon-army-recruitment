// 訓練場（docs/DESIGN_TRAINING_2026-09-13.md）。
//   node tools/test-training.js
// 死なない・金0・警戒0・戦闘数+1・技が開く・給与半額・相手の段階解放。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js', 'src/data/town.js',
  'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/town.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const Town = vm.runInContext('Town', ctx);
const MISSION_TYPES = vm.runInContext('MISSION_TYPES', ctx);
const COUNTERATTACK = vm.runInContext('COUNTERATTACK', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 60, atk: 10, def: 3, spd: 5, salary: 5, loyalty: 60, traits: [], skills: [], tags: [],
  department: "combat", injured: 0, relicIds: [], merit: 0, rankId: "soldier", spirit: 1,
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 } }, x || {});

function freshRun(extra, roster) {
  Game.newRun();
  const st = Game.state;
  st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false;
  st.applicants = []; st.hiresLeft = 0;
  st.food = 30; st.gold = 300; st.materials = 5;
  st.roster = roster || [member(101, 'カタブツ', { hp: 900, atk: 90, def: 40, spd: 20 })];
  st.activeUids = st.roster.map(m => m.uid);
  for (const m of st.roster) Game.baseOf(m);
  Game.syncDepartments();
  Object.assign(st, extra || {});
  return st;
}
// 訓練を1回やる
function trainOnce(st, opponentId) {
  if (opponentId) st.trainingOpponentId = opponentId;
  Game.prepareMissions(true);
  const at = st.missionOffers.findIndex(m => m.missionKind === 'train');
  Game.selectMission(at);
  st.phase = 'formation';
  const mission = st.selectedMission;
  Game.deploy();
  return mission;
}

// ── 1. 作戦会議の4枚目 ───────────────────────────
{
  const st = freshRun();
  Game.prepareMissions(true);
  assert(st.missionOffers.length === 4, `札は4枚（${st.missionOffers.length}）`);
  const t = st.missionOffers.find(m => m.missionKind === 'train');
  assert(!!t && t.training === true, '訓練の札がある');
  assert(t.region === '訓練場' && /訓練：/.test(t.missionTitle), `題と場所（${t.missionTitle}／${t.region}）`);
  assert(t.reward === 0 && t.conquestDelta === 0 && t.alertDelta === 0 && t.materialReward === 0,
    `金・征服・警戒・建材は動かない（報酬${t.reward} 征服${t.conquestDelta} 警戒${t.alertDelta} 建材${t.materialReward}）`);
}
{
  // 防衛が来ている決着でも訓練は選べる
  const st = freshRun({ alert: COUNTERATTACK.threshold });
  Game.checkCounterattack();
  Game.prepareMissions(true);
  const kinds = st.missionOffers.map(m => m.missionKind);
  assert(kinds.length === 2 && kinds.includes('defend') && kinds.includes('train'),
    `防衛の決着は「防衛＋訓練」（${kinds.join(',')}）`);
}

// ── 2. 相手の段階解放 ───────────────────────────
{
  const st = freshRun({ conquest: 0 });
  const open = () => Game.trainingOpponents().filter(o => o.unlocked).map(o => o.id);
  assert(open().join(',') === 'scarecrow', `征服0では案山子だけ（${open()}）`);
  st.conquest = 2;
  assert(open().join(',') === 'scarecrow,mock', `征服2で模擬戦が開く（${open()}）`);
  st.conquest = 4;
  assert(open().join(',') === 'scarecrow,mock,veteran', `征服4で猛者が開く（${open()}）`);
  assert(Game.trainingOpponent().id === 'veteran', '既定は解放済みで一番強い相手');
  assert(Game.trainingOpponent('scarecrow').id === 'scarecrow', '選んだ相手が返る');
  st.conquest = 0;
  assert(Game.trainingOpponent('veteran').id === 'scarecrow', '未解放を指定しても解放済みに落ちる');
}
{
  // 案山子は 0.6 倍、模擬戦は等倍、猛者は 1.2 倍＋隊長1体
  const st = freshRun({ conquest: 4 });
  const of = id => { st.trainingOpponentId = id; return Game.buildMission(MISSION_TYPES.train); };
  // 比べる相手は**本戦**の隊列（進軍は2戦制なので、前哨のままだと敵が半分になる）
  st.outpost = { stage: st.conquest, cleared: true, formationId: null };
  const real = Game.buildMission(MISSION_TYPES.find(t => t.id === 'invade'));
  const scare = of('scarecrow'), mock = of('mock'), vet = of('veteran');
  const hp = m => m.units.reduce((a, u) => a + u.hp, 0);
  assert(scare.units.length === mock.units.length, '案山子と模擬戦は同じ人数');
  assert(hp(scare) < hp(mock), `案山子は弱い（HP合計 ${hp(scare)} < ${hp(mock)}）`);
  assert(vet.units.length === mock.units.length + 1, `猛者は隊長が1体多い（${vet.units.length}）`);
  assert(vet.units.some(u => u.role === 'commander' && /隊長/.test(u.name)), '隊長の役が付いている');
  assert(hp(vet) > hp(mock), `猛者は硬い（${hp(vet)} > ${hp(mock)}）`);
  assert(mock.units.length === real.units.length, '模擬戦は本戦と同じ人数（予行演習）');
  assert(scare.trainingMerit === 1 && vet.trainingMerit === 2, '戦功は案山子1・猛者2');
}

// ── 3. 決着：入るもの・出るもの ────────────────────
{
  const st = freshRun({ conquest: 2, alert: 3 });
  const before = { gold: st.gold, alert: st.alert, materials: st.materials, turn: st.turn,
    relics: (st.relics || []).length, traces: (st.traces || []).length, conquest: st.conquest };
  trainOnce(st, 'mock');
  assert(st.gold < before.gold, `金は入らない（給与で減るだけ：${before.gold} → ${st.gold}）`);
  assert(st.alert === before.alert, `警戒度は動かない（${st.alert}）`);
  assert(st.materials === before.materials, `建材も入らない（${st.materials}）`);
  assert(st.conquest === before.conquest, '王国攻略は進まない');
  assert((st.relics || []).length === before.relics, '遺物は増えない');
  assert((st.traces || []).length === before.traces, `痕跡は残らない（${(st.traces || []).length}）`);
  assert(st.turn === before.turn + 1, `1決着として進む（作戦 ${before.turn} → ${st.turn}）`);
  assert(st.phase === 'result', `結果画面へ（${st.phase}）`);
  assert(st.lastBattle.training === true, 'lastBattle に稽古の印');
  assert(st.lastBattle.reward === 0, `報酬0（${st.lastBattle.reward}）`);
}
{
  // 税収は無い。前借りの期限は普通どおり1つ減る（逃げ場を作らない）
  // ＝利子の毎決着処理は廃止した（docs/SPEC_BANK_ADVANCE_2026-09-19.md §2-6）。
  const st = freshRun({ conquest: 3 });
  Town.init(st);
  st.roster[0].merit = 0;
  Town.borrow(Game, 'small', st.roster[0].uid);
  const leftBefore = st.town.advance.settlesLeft;
  const goldBefore = st.gold;
  trainOnce(st, 'scarecrow');
  const notes = st.lastBattle.notes.join(' / ');
  assert(/稽古の日は徴税に出ない/.test(notes), `税収の一行（${notes.match(/[^/]*徴税[^/]*/) || 'なし'}）`);
  assert(!/税収 \+/.test(notes), '税は入っていない');
  assert(st.town.advance.settlesLeft === leftBefore - 1,
    `稽古でも前借りの期限は減る（${leftBefore} → ${st.town.advance.settlesLeft}）`);
  assert(st.gold < goldBefore, '金は減る方向にしか動かない');
}

// ── 4. 死なない（HP0 は負傷） ─────────────────────
{
  const st = freshRun({ conquest: 4 }, [member(201, 'ヨワシ', { hp: 1, atk: 1, def: 0, spd: 1 })]);
  trainOnce(st, 'veteran');
  const m = st.roster.find(x => x.uid === 201);
  assert(!!m, '稽古では死なない（名簿に残る）');
  assert(m && m.injured === 1, `倒れた者は負傷（injured=${m && m.injured}）`);
  assert(!st.activeUids.includes(201), '負傷者は出撃隊から外れる');
  assert((st.lastFallen || []).length === 0, '戦没者は出ない');
  assert((st.departed || []).length === 0, '去った者にも載らない');
  assert((st.lastBattle.trainingDown || []).includes('ヨワシ'), '結果画面へ「倒れた者」が渡る');
  assert(st.phase === 'result', `全員倒れても結果画面（${st.phase}）`);
}

// ── 5. 育つものは本番と同じ ───────────────────────
{
  const st = freshRun({ conquest: 2 });
  const m = st.roster[0];
  const before = { battles: Game.memberRecord(m).battles, atk: m.atk, merit: m.merit, loyalty: m.loyalty };
  trainOnce(st, 'mock');
  const after = st.roster.find(x => x.uid === m.uid);
  assert(Game.memberRecord(after).battles === before.battles + 1, `戦闘数 +1（${Game.memberRecord(after).battles}）`);
  assert(after.atk > before.atk, `小成長する（攻撃 ${before.atk} → ${after.atk}）`);
  assert(after.merit === before.merit + 1, `戦功は生存 +1 のみ（${after.merit}）`);
  assert(after.loyalty >= before.loyalty + 1, `忠誠 +1（${before.loyalty} → ${after.loyalty}）`);
}
{
  // 猛者は戦功 +2。撃破や最多与ダメは数えない
  const st = freshRun({ conquest: 4 });
  trainOnce(st, 'veteran');
  assert(st.roster[0].merit === 2, `猛者は戦功 +2（${st.roster[0].merit}）`);
}
{
  // 技は訓練だけで開く（種族技3戦）
  const st = freshRun({ conquest: 2 });
  for (let i = 0; i < 3; i++) { if (st.phase === 'gameover' || st.phase === 'clear') break; trainOnce(st, 'scarecrow'); }
  const m = st.roster[0];
  assert(Game.memberRecord(m).battles === 3, `3回稽古した（${Game.memberRecord(m).battles}）`);
  assert(m.skills.length >= 1, `訓練だけで種族技が開く（${m.skills.join(',')}）`);
}

// ── 6. 給与は半分（端数切り上げ） ──────────────────
{
  const st = freshRun({ conquest: 2 }, [member(301, 'ゴロ', { salary: 5, hp: 900, atk: 90, def: 40 })]);
  const full = Game.salaryTotal();
  const before = st.gold;
  trainOnce(st, 'mock');
  const paid = before - st.gold;
  assert(paid === Math.ceil(full / 2), `半額（満額${full}G → 支払い${paid}G）`);
  assert(Game.salaryRatio({ training: true }) === 0.5 && Game.salaryRatio({}) === 1, 'salaryRatio の切り替え');
}

// ── 7. 回数制限なし・防衛の予約は消えない ─────────────
{
  const st = freshRun({ conquest: 2 });
  for (let i = 0; i < 5; i++) trainOnce(st, 'scarecrow');
  assert(Game.memberRecord(st.roster[0]).battles === 5, `何回でもできる（${Game.memberRecord(st.roster[0]).battles}回）`);
}
{
  const st = freshRun({ conquest: 2, alert: COUNTERATTACK.threshold });
  Game.checkCounterattack();
  assert(!!st.counterattack, '（前提）防衛戦が予約されている');
  trainOnce(st, 'scarecrow');
  assert(!!st.counterattack, '訓練しても防衛の予約は消えない（次の作戦会議にまた出る）');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
