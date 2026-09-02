// キングスライム合体を「自動」から「魔王の選択」へ変えた契約。
//
// 合体は強くなる代わりに頭数を3体ぶん失う。自動でやると、頭数で伸びるもの
// （低賃金大量採用・群れの本能）を黙って失う罠になる。判断へ返したことを固定する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

const slimeSquad = (n) => {
  Game.newRun();
  const st = Game.state;
  const template = vm.runInContext('MONSTER_TEMPLATES', ctx).find(t => t.id === 'slime');
  st.roster = Array.from({ length: n }, (_, i) => ({
    uid: i + 1, tplId: 'slime', name: 'ぬる' + (i + 1), race: template.race, job: '見習い',
    hp: 26, atk: 5, def: 2, spd: 4, salary: 1, loyalty: 80, merit: 0, rankId: 'soldier',
    traits: ['slime_body'], tags: [], quote: '', unpaid: false, department: 'combat'
  }));
  st.activeUids = st.roster.map(m => m.uid);
  st.uidSeq = n + 1;
  st.applicants = [];
  st.phase = 'formation';
  st.openingPrototype = false;
  st.selectedMission = null;
  st.gold = 20;
  return st;
};

// ── 1. 既定は合体しない ────────────────────────────
let st = slimeSquad(3);
assert(st.kingSlimeMerge === true, '既定は従来どおり合体する（黙って弱くしない）');
assert(Game.kingSlimePreview() !== null, 'スライム3体なら合体の見込みを出せる');
const preview = Game.kingSlimePreview();
assert(preview.before.count === 3 && preview.after.count === 1,
  '3体が1体になることを見込みとして示す');
assert(preview.after.hp > preview.before.hp / 3 * 1.1 && preview.after.hp === Math.round(preview.before.hp * 1.2),
  '合体後のHPは3体の合計の1.2倍');
assert(preview.after.salary < preview.before.salary, '合体すると給与総額は下がる');

assert(Game.setKingSlimeMerge(false) === true, '合体を断れる');
assert(st.kingSlimeMerge === false, '断った選択が状態に残る');
const out = Game.deploy();
assert(out, '合体せずに出撃できる');
assert(Game.state.roster.length === 3 && !Game.state.roster.some(m => m.tplId === 'king_slime'),
  '断れば合体しない（3体のまま）');
assert(!out.result.timeline.some(e => e.type === 'synergy' && e.id === 'king_slime'),
  '合体していないのにカットインを出さない');

// ── 2. 既定のまま出撃すれば合体する ──────────────────────
st = slimeSquad(3);
const merged = Game.deploy();
assert(Game.state.roster.length === 1 && Game.state.roster[0].tplId === 'king_slime',
  '選べば3体が1体のキングスライムになる');
assert(merged.result.timeline.some(e => e.type === 'synergy' && e.id === 'king_slime'),
  '合体したらカットインのイベントが出る');

// ── 3. 断った選択は次の編成でも残る ─────────────────────
st = slimeSquad(3);
Game.setKingSlimeMerge(false);
Game.setKingSlimeMerge(true);
assert(st.kingSlimeMerge === true, '断ったあと、また合体を選び直せる');
Game.setKingSlimeMerge(false);
Game.deploy();
assert(Game.state.roster.length === 3, '断ったら合体しない');

// ── 4. 条件を満たさなければ選べない ──────────────────────
st = slimeSquad(2);
assert(Game.kingSlimePreview() === null, 'スライム2体では合体の見込みを出さない');
assert(Game.setKingSlimeMerge(false) === false,
  '対象がいなければ合体の設定を受け付けない');

// ── 5. 旧セーブの移行 ─────────────────────────────
const legacy = JSON.parse(JSON.stringify(Game.state));
delete legacy.kingSlimeMerge;
Game.state = legacy;
Game.migrateState();
assert(Game.state.kingSlimeMerge === true,
  'フィールドの無い旧セーブは従来どおり「合体する」で移行する');

console.log('キングスライム合体の選択テスト完了');
