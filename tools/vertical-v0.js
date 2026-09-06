// V0: 3系統（略奪・食料・死霊）の縦検証ハーネス。
//   使い方: node tools/vertical-v0.js [試行数] [--json 出力先]
//
// 目的は「固定編成が本番の計算経路で成立しているか」を測ること。
// 数値式をここで再実装すると run.js と二重になって嘘をつくので、
// **必ず Game.deploy()（＝本番の出撃処理）を通す**。ここがやるのは
//   1. 本番の生成器 rollApplicant() で人材を作り、職と特性だけを固定する
//   2. 軍団・配属・食料・施設・敵ステージを固定して deploy() を呼ぶ
//   3. 返ってきたタイムラインから「何がどこへ繋がったか」を数える
// だけである。乱数は seed 固定（同じ seed 一覧を基準として保存できる）。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/departments.js','src/data/events.js','src/data/demon_kings.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'];

// ── seed 固定の乱数 ────────────────────────────
let rngState = 1;
function mulberry32() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const seededMath = Object.create(Math);
seededMath.random = mulberry32;

const store = {};
const ctx = { console, Math: seededMath, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
const KPI = vm.runInContext('KPI', ctx);
const MISSION_TYPES = vm.runInContext('MISSION_TYPES', ctx);

// ── 固定編成の組み立て ────────────────────────
// 能力値は本番の rollApplicant() が作った範囲そのまま。職と特性だけ差し替える
// （設計書 第9節「能力値を本番生成範囲外へ盛らない」）。
function mk(tplId, opt) {
  opt = opt || {};
  const m = Game.rollApplicant(tplId);
  if (opt.job) m.job = opt.job;
  if (opt.traits) m.traits = opt.traits.slice();
  if (opt.job && opt.job.includes('料理人') && !m.traits.includes('demon_cook')) m.traits.push('demon_cook');
  if (opt.name) m.name = opt.name;
  m.department = opt.dept || 'combat';
  return m;
}

const G_BASE = ['coward','pickpocket'];

// units: [{tpl, traits?, job?, dept?, deploy:bool}]
const FORMATIONS = [
  // ── 略奪 ───────────────────────────────
  { id:'loot-entry', line:'略奪', stage:'入口', conquest:1, food:6, facility:null, facilityLevel:0,
    note:'ゴブリン2体。追い剥ぎ→《追い剥ぎコンビ》で次の味方攻撃+25%',
    units:[ {tpl:'goblin', traits:G_BASE, deploy:true}, {tpl:'goblin', traits:G_BASE, deploy:true} ] },
  { id:'loot-mid', line:'略奪', stage:'中盤', conquest:2, food:8, facility:null, facilityLevel:0,
    note:'金貨を取る役と強欲で反応する役を別人材にする',
    units:[ {tpl:'goblin', traits:G_BASE, deploy:true},
            {tpl:'goblin', traits:['coward','greedy'], deploy:true},
            {tpl:'kobold', traits:['first_strike'], deploy:true} ] },
  { id:'loot-full', line:'略奪', stage:'完成', conquest:4, food:10, facility:'extortion_ledger', facilityLevel:2,
    note:'会計係＋恐喝帳簿、ゴブリン軍団の撃破略奪、オーガの連鎖虐殺まで',
    units:[ {tpl:'goblin', traits:G_BASE, job:'会計係（どんぶり勘定）', deploy:true},
            {tpl:'goblin', traits:['coward','greedy'], deploy:true},
            {tpl:'goblin', traits:['coward','pickpocket','pack'], deploy:true},
            {tpl:'ogre', traits:['brute','big_eater','chain_massacre'], deploy:true},
            {tpl:'goblin', traits:G_BASE, dept:'life', deploy:false} ] },
  { id:'loot-full-CTRL', line:'略奪', stage:'対照(反応役なし)', conquest:4, food:10, facility:'extortion_ledger', facilityLevel:2,
    note:'完成から強欲持ちだけを抜く。金貨は出るが仲間が動かないことの確認',
    units:[ {tpl:'goblin', traits:G_BASE, job:'会計係（どんぶり勘定）', deploy:true},
            {tpl:'goblin', traits:G_BASE, deploy:true},
            {tpl:'goblin', traits:['coward','pickpocket','pack'], deploy:true},
            {tpl:'orc', traits:['brute','tough_skin'], deploy:true},
            {tpl:'goblin', traits:G_BASE, dept:'life', deploy:false} ] },

  // ── 食料 ───────────────────────────────
  { id:'food-entry', line:'食料', stage:'入口', conquest:1, food:8, facility:null, facilityLevel:0,
    note:'出撃料理人＋大食漢のオーガ。糧食が一人の火力へ変わる',
    units:[ {tpl:'goblin', traits:['coward','pickpocket'], job:'魔界料理人（味見が多い）', deploy:true},
            {tpl:'ogre', traits:['brute','big_eater'], deploy:true} ] },
  { id:'food-mid', line:'食料', stage:'中盤', conquest:3, food:14, facility:null, facilityLevel:0,
    note:'生活部門で供給を作り、消費4以上で暴食の宴の追加行動まで',
    units:[ {tpl:'goblin', traits:['coward','pickpocket'], job:'魔界料理人（味見が多い）', deploy:true},
            {tpl:'ogre', traits:['brute','big_eater'], deploy:true},
            {tpl:'orc', traits:['brute','tough_skin'], deploy:true},
            {tpl:'kobold', traits:['first_strike'], deploy:true},
            {tpl:'slime', traits:['slime_body'], dept:'life', deploy:false},
            {tpl:'slime', traits:['slime_body'], dept:'life', deploy:false} ] },
  { id:'food-full', line:'食料', stage:'完成', conquest:5, food:20, facility:'grand_kitchen', facilityLevel:3,
    note:'巨大厨房で食事強化を厚くし、集中打撃から撃破・OVERKILLへ',
    units:[ {tpl:'goblin', traits:['coward','pickpocket'], job:'魔界料理人（味見が多い）', deploy:true},
            {tpl:'ogre', traits:['brute','big_eater','chain_massacre'], deploy:true},
            {tpl:'orc', traits:['brute','tough_skin'], deploy:true},
            {tpl:'kobold', traits:['first_strike'], deploy:true},
            {tpl:'goblin', traits:G_BASE, deploy:true},
            {tpl:'slime', traits:['slime_body'], dept:'life', deploy:false},
            {tpl:'slime', traits:['slime_body'], dept:'life', deploy:false} ] },
  { id:'food-full-CTRL', line:'食料', stage:'対照(料理人なし)', conquest:5, food:20, facility:'grand_kitchen', facilityLevel:3,
    note:'完成から出撃料理人を抜く。食事由来の強化が消えることの確認',
    units:[ {tpl:'goblin', traits:G_BASE, deploy:true},
            {tpl:'ogre', traits:['brute','big_eater','chain_massacre'], deploy:true},
            {tpl:'orc', traits:['brute','tough_skin'], deploy:true},
            {tpl:'kobold', traits:['first_strike'], deploy:true},
            {tpl:'goblin', traits:G_BASE, deploy:true},
            {tpl:'slime', traits:['slime_body'], dept:'life', deploy:false},
            {tpl:'slime', traits:['slime_body'], dept:'life', deploy:false} ] },
  { id:'food-hunger-zero', line:'食料', stage:'分岐(最初から備蓄0)', conquest:5, food:0, facility:null, facilityLevel:0,
    note:'最初から0のまま出撃。飢餓の悪魔が発火しない側の確認',
    units:[ {tpl:'imp', traits:['mischief','hunger_demon'], deploy:true},
            {tpl:'ogre', traits:['brute','big_eater'], deploy:true},
            {tpl:'orc', traits:['brute','tough_skin'], deploy:true} ] },
  { id:'food-hunger-drain', line:'食料', stage:'分岐(今回0になる)', conquest:5, food:3, facility:null, facilityLevel:0,
    note:'今回の糧食で備蓄が尽きる側。emptied 判定で飢餓の悪魔が起きるか',
    units:[ {tpl:'imp', traits:['mischief','hunger_demon'], deploy:true},
            {tpl:'ogre', traits:['brute','big_eater'], deploy:true},
            {tpl:'orc', traits:['brute','tough_skin'], deploy:true} ] },

  // ── 死霊 ───────────────────────────────
  { id:'death-entry', line:'死霊', stage:'入口', conquest:2, food:8, facility:null, facilityLevel:0,
    note:'出撃死霊術師＋前衛。倒れる→蘇る→もう一度働く',
    units:[ {tpl:'necromancer', traits:['necromancy','gravekeeper'], deploy:true},
            {tpl:'zombie', traits:['tenacity'], deploy:true},
            {tpl:'skeleton', traits:['bone'], deploy:true} ] },
  { id:'death-mid', line:'死霊', stage:'中盤', conquest:4, food:10, facility:null, facilityLevel:0,
    note:'墓守＋魂の徴収。死亡が魂になり、復帰がアンデッド強化へ',
    units:[ {tpl:'necromancer', traits:['necromancy','gravekeeper'], deploy:true},
            {tpl:'zombie', traits:['tenacity'], deploy:true},
            {tpl:'skeleton', traits:['bone','soul_harvest'], deploy:true},
            {tpl:'skeleton', traits:['bone','tough_skin'], deploy:true} ] },
  { id:'death-full', line:'死霊', stage:'完成', conquest:6, food:12, facility:'graveyard', facilityLevel:2,
    note:'戦場の蘇生（出撃死霊術師）＋墓地の召喚（建設部門の死霊術師）。殉職手当で略奪へ橋渡し',
    units:[ {tpl:'necromancer', traits:['necromancy','gravekeeper'], deploy:true},
            {tpl:'zombie', traits:['tenacity'], deploy:true},
            {tpl:'skeleton', traits:['bone','soul_harvest'], deploy:true},
            {tpl:'skeleton', traits:['bone','tough_skin'], deploy:true},
            {tpl:'goblin', traits:['coward','greedy'], deploy:true},
            {tpl:'necromancer', traits:['necromancy','gravekeeper'], dept:'construction', deploy:false} ] },
  { id:'death-full-CTRL', line:'死霊', stage:'対照(出撃死霊術師なし)', conquest:6, food:12, facility:'graveyard', facilityLevel:2,
    note:'完成から戦場の死霊術師を抜く。墓地の召喚だけが残ることの確認',
    units:[ {tpl:'orc', traits:['brute','tough_skin'], deploy:true},
            {tpl:'zombie', traits:['tenacity'], deploy:true},
            {tpl:'skeleton', traits:['bone','soul_harvest'], deploy:true},
            {tpl:'skeleton', traits:['bone','tough_skin'], deploy:true},
            {tpl:'goblin', traits:['coward','greedy'], deploy:true},
            {tpl:'necromancer', traits:['necromancy','gravekeeper'], dept:'construction', deploy:false} ] }
];

function setupState(f) {
  Game.newRun();
  const st = Game.state;
  st.conquest = f.conquest;
  st.turn = f.conquest + 1;
  st.roster = [];
  const built = f.units.map(u => mk(u.tpl, { traits: u.traits, job: u.job, dept: u.dept }));
  st.roster = built;
  st.activeUids = built.filter((m, i) => f.units[i].deploy).map(m => m.uid).slice(0, Game.MAX_DEPLOY);
  st.food = f.food;
  st.gold = 200;                       // 給与で出撃が止まらないようにする（測るのは戦闘の接続）
  st.facilityLevel = f.facilityLevel;
  st.activeFacilityId = f.facility;
  st.pendingFacilityChoiceLevel = null;
  st.kingSlimeMerge = false;           // 合体は別系統の話なので固定編成では起こさない
  st.selectedMission = Game.buildMission(MISSION_TYPES.find(m => m.id === 'invade'));
  st.phase = 'formation';
  Game.setPayrollPolicy('regular');
  return st;
}

// ── タイムラインの読み取り ──────────────────────
function analyze(out, st) {
  const tl = out.result.timeline;
  const at = pred => tl.findIndex(pred);
  const count = pred => tl.filter(pred).length;
  const goldGain = e => e.type === 'resource_gain' && e.resource === 'gold';
  const revives = tl.filter(e => e.type === 'revive');
  // 蘇生した者が、そのあと実際に行動したか
  let postReviveActs = 0;
  for (const r of revives) {
    const i = tl.indexOf(r);
    if (tl.slice(i + 1).some(e => (e.type === 'attack' || e.type === 'splash') && e.fromId === r.unitId)) postReviveActs++;
  }
  const goldActors = new Set(tl.filter(goldGain).map(e => e.sourceId));
  const greedyActors = new Set(tl.filter(e => e.type === 'trait_trigger' && e.traitId === 'greedy').map(e => e.sourceId));
  const crossPerson = [...greedyActors].some(id => !goldActors.has(id)) && goldActors.size > 0;
  const rations = st.lastBattle.battleRations || {};
  const chain = out.result.chainSummary || {};
  const ok = out.result.overkillSummary || {};
  return {
    victory: out.result.victory,
    rounds: out.result.rounds,
    maxChain: chain.maxChain || 0,
    maxOverkill: ok.maxPercent || 0,
    synergies: out.result.activeSynergies.slice(),
    // 略奪
    goldEvents: count(goldGain),
    goldAmount: tl.filter(goldGain).reduce((s, e) => s + e.amount, 0),
    pairBoost: count(e => e.type === 'synergy_trigger' && e.synergyId === 'goblin_pair'),
    greedyExtra: count(e => e.type === 'trait_trigger' && e.traitId === 'greedy'),
    ledger: count(e => e.type === 'facility_trigger' && e.facilityId === 'extortion_ledger'),
    crossPersonLoot: crossPerson ? 1 : 0,
    firstGoldIndex: at(goldGain),
    // 食料
    foodConsumed: rations.consumed || 0,
    foodShortage: rations.shortage || 0,
    cookFire: count(e => e.type === 'trait_trigger' && e.traitId === 'demon_cook'),
    bigEaterFire: count(e => e.type === 'trait_trigger' && e.traitId === 'big_eater'),
    hungerFire: count(e => e.type === 'trait_trigger' && e.traitId === 'hunger_demon'),
    feastFire: count(e => e.type === 'trait_trigger' && e.traitId === 'glutton_feast'),
    kitchenFire: count(e => e.type === 'facility_trigger' && e.facilityId === 'grand_kitchen'),
    // 死霊
    playerDeaths: count(e => e.type === 'death' && String(e.unitId).startsWith('p')),
    permanentDeaths: count(e => e.type === 'death' && e.permanent),
    revives: revives.length,
    postReviveActs,
    summons: count(e => e.type === 'summon'),
    soulFire: count(e => e.type === 'trait_trigger' && e.traitId === 'soul_harvest'),
    martyr: count(e => e.type === 'resource_gain' && e.label === '殉職手当'),
    boneSurvive: count(e => e.type === 'survive')
  };
}

const N = Number(process.argv[2] || 40);
const jsonAt = process.argv.indexOf('--json');
const dump = { version: 1, trials: N, baseCommit: 'c8a9f1c', formations: [] };

const AVG = ['maxChain','maxOverkill','goldEvents','goldAmount','pairBoost','greedyExtra','ledger',
  'foodConsumed','foodShortage','cookFire','bigEaterFire','hungerFire','feastFire','kitchenFire',
  'playerDeaths','permanentDeaths','revives','postReviveActs','summons','soulFire','martyr','boneSurvive','rounds'];

for (const f of FORMATIONS) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    rngState = 1000 + i;               // 編成ごとに同じ seed 一覧を使う
    const st = setupState(f);
    const out = Game.deploy();
    if (!out) { console.log(`  !! ${f.id}: 出撃できなかった`); break; }
    rows.push(analyze(out, st));
    KPI.reset();
  }
  if (!rows.length) continue;
  const mean = k => rows.reduce((s, r) => s + (r[k] || 0), 0) / rows.length;
  const rate = k => rows.filter(r => (r[k] || 0) > 0).length / rows.length * 100;
  const win = rows.filter(r => r.victory).length / rows.length * 100;
  const synCount = {};
  for (const r of rows) for (const s of r.synergies) synCount[s] = (synCount[s] || 0) + 1;
  console.log(`\n■ ${f.line} / ${f.stage}  [${f.id}]  ${f.note}`);
  console.log(`  勝率 ${win.toFixed(0)}%　平均ラウンド ${mean('rounds').toFixed(1)}　最大CHAIN ${mean('maxChain').toFixed(2)}　最大OVERKILL ${mean('maxOverkill').toFixed(0)}%`);
  console.log(`  シナジー: ${Object.entries(synCount).map(([k,v])=>`${k}:${v}`).join(' ') || 'なし'}`);
  console.log(`  略奪: 金貨イベント ${mean('goldEvents').toFixed(2)}回/${mean('goldAmount').toFixed(2)}G　コンビ+25% ${mean('pairBoost').toFixed(2)}　強欲追撃 ${mean('greedyExtra').toFixed(2)}（発生率 ${rate('greedyExtra').toFixed(0)}%）　恐喝帳簿 ${mean('ledger').toFixed(2)}　別人材への受け渡し ${(rows.filter(r=>r.crossPersonLoot).length/rows.length*100).toFixed(0)}%`);
  console.log(`  食料: 消費 ${mean('foodConsumed').toFixed(1)}（不足 ${mean('foodShortage').toFixed(1)}）　料理人 ${rate('cookFire').toFixed(0)}%　大食漢 ${rate('bigEaterFire').toFixed(0)}%　宴 ${rate('feastFire').toFixed(0)}%　厨房 ${rate('kitchenFire').toFixed(0)}%　飢餓の悪魔 ${rate('hungerFire').toFixed(0)}%`);
  console.log(`  死霊: 味方戦死 ${mean('playerDeaths').toFixed(2)}（永久 ${mean('permanentDeaths').toFixed(2)}）　蘇生 ${mean('revives').toFixed(2)}（発生率 ${rate('revives').toFixed(0)}%）　復帰後に行動 ${mean('postReviveActs').toFixed(2)}（${rate('postReviveActs').toFixed(0)}%）　召喚 ${mean('summons').toFixed(2)}（${rate('summons').toFixed(0)}%）　魂の徴収 ${rate('soulFire').toFixed(0)}%　殉職手当 ${rate('martyr').toFixed(0)}%　白骨 ${mean('boneSurvive').toFixed(2)}`);
  const rec = { id:f.id, line:f.line, stage:f.stage, note:f.note, winRate:win, synergies:synCount };
  for (const k of AVG) rec[k] = Number(mean(k).toFixed(3));
  for (const k of ['greedyExtra','revives','postReviveActs','summons','soulFire','martyr','cookFire','feastFire','hungerFire']) rec[k + 'Rate'] = Number(rate(k).toFixed(1));
  dump.formations.push(rec);
}

if (jsonAt >= 0 && process.argv[jsonAt + 1]) {
  fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(dump, null, 2));
  console.log(`\nJSONを書き出した: ${process.argv[jsonAt + 1]}`);
}
