// P3: 配属・食料・施設の結果が、次の選択を生む事件へ接続しているか。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const EVENTS = vm.runInContext('EVENTS', ctx);
const event = id => EVENTS.find(e => e.id === id);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

function unit(over = {}) {
  return Object.assign({
    uid: 1, tplId: 'goblin', name: 'テスト係', race: 'ゴブリン', job: '雑用',
    hp: 20, atk: 4, def: 2, spd: 3, salary: 4, loyalty: 60,
    traits: [], tags: [], department: 'combat', unpaid: false, unpaidStreak: 0,
    merit: 0, rankId: 'soldier'
  }, over);
}

function reset(roster) {
  Game.newRun();
  const st = Game.state;
  st.roster = roster;
  st.activeUids = roster.filter(m => m.department === 'combat').map(m => m.uid).slice(0, 5);
  st.gold = 10;
  st.food = 0;
  st.materials = 0;
  st.lastDepartmentReport = null;
  st.pendingEvent = null;
  st.eventOutcome = null;
  return st;
}

function resolve(id, optionIndex) {
  const ev = event(id);
  const cast = ev.cast(Game.state);
  Game.state.pendingEvent = { id, cast, text: ev.text(Game.state, Game.resolveCast(cast)) };
  Game.state.phase = 'event';
  assert(Game.chooseEvent(optionIndex), `${id} を選択して解決できる`);
  assert(Game.state.eventOutcome.length > 0, `${id} に結果テキストがある`);
}

for (const id of ['kitchen_takeover', 'surplus_rations', 'facility_credit',
  'seasoning_disaster', 'cleaning_dispute', 'iron_ants']) {
  const ev = event(id);
  assert(!!ev, `部門事件 ${id} が登録されている`);
  assert(ev.options.length === 3, `${id} にリスクの異なる3択がある`);
}

// 生活適性・食事不要・前職・建設適性が、同じ事件の結果を変える。
{
  const st = reset([
    unit({ uid: 1, tplId: 'skeleton', name: '骨休め', race: 'スケルトン', department: 'combat', loyalty: 60 }),
    unit({ uid: 2, tplId: 'kobold', name: '猟犬番', race: 'コボルト', job: '猟犬係', department: 'support', loyalty: 60 })
  ]);
  st.lastDepartmentReport = { foodShortage: 0, foodProduced: 5, facilityBefore: 0, facilityAfter: 0 };
  assert(event('seasoning_disaster').check(st), '食料を作った勤務の後に味付け失敗が候補になる');
  resolve('seasoning_disaster', 0);
  assert(st.roster[0].loyalty === 60, '食事不要の人材は失敗料理の忠誠低下を受けない');
  assert(st.roster[1].loyalty === 57, '高い生活適性で失敗料理の被害を軽減する');
}

{
  const st = reset([
    unit({ uid: 1, tplId: 'slime', name: '清掃史', race: 'スライム', job: '井戸の掃除係', department: 'support' }),
    unit({ uid: 2, tplId: 'kobold', name: '毛玉', race: 'コボルト', job: '猟犬係', department: 'support' })
  ]);
  const ev = event('cleaning_dispute');
  assert(ev.check(st), '生活担当と同僚がいると掃除論争が候補になる');
  assert(ev.cast(st).actor === 1, '掃除経験者が論争の当事者として優先される');
  resolve('cleaning_dispute', 1);
  assert(st.food === 2 && st.roster[0].loyalty === 78, '掃除の職歴が衛生改善と忠誠に変わる');
}

{
  const st = reset([
    unit({ uid: 1 }),
    unit({ uid: 2, tplId: 'ogre', name: '解体王', race: 'オーガ', job: '重量物運搬', department: 'support', hp: 30 })
  ]);
  st.materials = 3;
  const ev = event('iron_ants');
  assert(ev.check(st), '建材と建設担当が揃うと鉄アリが候補になる');
  assert(ev.cast(st).actor === 2, '建設適性の高い担当者が駆除役になる');
  resolve('iron_ants', 1);
  assert(st.materials === 6 && st.roster[1].hp === 29, '高い建設適性なら小傷で建材3を回収する');
}

// 食料不足 → 腹の減る人材が事件を起こし、戦力を生活へ回す選択が生まれる。
{
  const st = reset([
    unit({ uid: 1, tplId: 'ogre', name: '腹太', race: 'オーガ', job: '重量物運搬', salary: 6 }),
    unit({ uid: 2, name: '小腹', department: 'support' })
  ]);
  const ev = event('kitchen_takeover');
  assert(!ev.check(st), '勤務報告に食料不足がなければ食堂占拠は起きない');
  st.lastDepartmentReport = { foodShortage: 2, foodProduced: 1, facilityBefore: 0, facilityAfter: 0 };
  assert(ev.check(st), '食料不足から食堂占拠が候補になる');
  assert(ev.cast(st).actor === 1, '最も大食いの戦闘要員が食堂を占拠する');
  resolve('kitchen_takeover', 1);
  assert(Game.departmentOf(st.roster[0]).id === 'support' && !st.activeUids.includes(1),
    '占拠犯を控えへ回すと出撃隊から外れる');
  assert(st.roster[0].salary === 7 && st.food > 0, '炊事責任者への異動は給与と食料に返る');
}

// 生活部門の成功 → 食料を忠誠・G・将来備蓄のどれに使うか選べる。
{
  const st = reset([
    unit({ uid: 1 }),
    unit({ uid: 2, tplId: 'kobold', name: 'まかない', race: 'コボルト', job: '猟犬係', department: 'support' })
  ]);
  st.food = 6;
  st.lastDepartmentReport = { foodShortage: 0, foodProduced: 5, facilityBefore: 0, facilityAfter: 0 };
  const ev = event('surplus_rations');
  assert(ev.check(st), '控えが余剰食料を作ると活用事件が候補になる');
  st.activeUids = st.roster.map(m => m.uid);          // 全員出撃＝控えが空
  assert(!ev.check(st), '控えが空なら余剰食料事件は起きない');
  st.activeUids = [1];
  const beforeGold = st.gold, beforeLoyalty = st.roster[1].loyalty;
  resolve('surplus_rations', 1);
  assert(st.food === 4 && st.gold === beforeGold + 5, '余剰食料をGへ変換できる');
  assert(st.roster[1].loyalty === beforeLoyalty - 8, '横流しには担当者の忠誠コストがある');
}

// 施設完成 → 最も施工適性の高い人材を、金・将来給与・建材の選択へ接続する。
{
  const st = reset([
    unit({ uid: 1 }),
    unit({ uid: 2, tplId: 'ogre', name: '棟梁', race: 'オーガ', job: '重量物運搬', department: 'support' })
  ]);
  st.facilityLevel = 1;
  st.lastDepartmentReport = { foodShortage: 0, foodProduced: 0, facilityBefore: 0, facilityAfter: 1 };
  const ev = event('facility_credit');
  assert(ev.check(st), '施設完成と建設担当が揃うと功績争いが候補になる');
  assert(ev.cast(st).actor === 2, '施工適性の高い担当者が功労者になる');
  const beforeLoyalty = st.roster[1].loyalty;
  resolve('facility_credit', 2);
  assert(st.materials === 2, '式典予算を次の建材へ変換できる');
  assert(st.roster[1].loyalty === beforeLoyalty - 20, '功労者を無視する選択には忠誠コストがある');
}

console.log('✓ P3: 食料不足・生活部門の余剰・施設完成が、次の経営判断へ接続');
