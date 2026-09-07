// ビルド名（魔界史に残る「この軍団は何だったか」）。
//
// 見ているのは文言の好みではなく契約:
// 名前は record の中身だけから決まり（KPIに依存しない＝simでもテストでも同じ名前が出る）、
// 起きたことが違えば名前も違い、何も起きなかったランはそう名乗る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

// ── 1. 起きたことが名前になる ──────────────────────────────
const name = r => Game.buildName(r);
assert(name({ facilityLevel: 3, activeFacilityId: 'graveyard',
  discoveredSynergyIds: ['legion_of_dead'], maxArmySize: 9 }) === '墓地を三度も回した死の軍勢',
  '施設Lv.3の墓地と死の軍勢が、そのまま名前になる');
assert(name({ payrollChoices: { withhold: 7 }, mainRace: 'ゴブリン', maxArmySize: 8 })
  === '給料を払わなかったゴブリン軍団', '未払いを重ねたランは給与方針で名指しされる');
assert(name({ mainRace: 'オーガ', maxArmySize: 3, battlesWon: 6, fallenTotal: 0 })
  === '誰ひとり死なせなかったオーガの一党', '小さい軍団は「一党」を名乗り、無死は無死と記される');

// ── 2. 何も起きなかったランは、そう名乗る（設計憲法 第12節） ────────
assert(name({ mainRace: 'スライム', maxArmySize: 7 }) === '特筆すべきことのないスライム軍団',
  '特筆すべきことのないランには、そう書く');
assert(name({}) === '特筆すべきことのない寄せ集め軍団', '空の記録でも落ちずに名前を返す');

// ── 3. シナジーを発見していれば、種族より先にそれを名乗る ──────────
assert(name({ mainRace: 'オーク', maxArmySize: 6, discoveredSynergyIds: ['elite_few'], alert: 14 })
  === '指名手配された精鋭', 'シナジー名が中核になるときは「軍団」を重ねない');

// ── 4. ほぼ全ランで起きることは名前を占領しない ────────────────
// 拠点接収と再起はどちらも「普通の行動」なので、他に言うことがあるランでは名乗らない。
assert(name({ mainRace: 'ゴブリン', maxArmySize: 8, seizeUsed: true, retriesUsed: 1,
  maxOverkill: 250 }) === '過剰殺戮のゴブリン軍団',
  '珍しいことが起きていれば、拠点接収や再起より先にそちらを名乗る');
assert(name({ mainRace: 'ゴブリン', maxArmySize: 8, seizeUsed: true, retriesUsed: 1 })
  === '一度死に損なったゴブリン軍団', '他に何も無いランだけが、普通の行動を名前にする');

// ── 5. 起きたことが違えば名前も違う ────────────────────────
const variants = [
  { mainRace: 'ゴブリン', maxArmySize: 8, missionCounts: { raid: 6 } },
  { mainRace: 'ゴブリン', maxArmySize: 8, retriesUsed: 1 },
  { mainRace: 'ゴブリン', maxArmySize: 8, seizeUsed: true },
  { mainRace: 'ゴブリン', maxArmySize: 8, battleIncidentTotal: 25 },
  { mainRace: 'ゴブリン', maxArmySize: 8, maxOverkill: 250 }
].map(name);
assert(new Set(variants).size === variants.length,
  '同じ種族・同じ規模でも、そのランで起きたことが違えば違う名前になる');

// ── 6. ラン終了時に record へ焼き込まれる ─────────────────────
Game.newRun();
Object.assign(Game.state, {
  roster: [], activeUids: [], battlesWon: 3, fallenTotal: 12,
  raceCounts: { 骸骨兵: 5 }, maxArmySize: 8, seizeUsed: true
});
Game.endRun(false);
const record = Game.state.record;
assert(typeof record.buildName === 'string' && record.buildName.length > 0,
  'endRun は魔界史の記録へ buildName を焼き込む');
assert(record.seizeUsed === true, '拠点接収したかどうかも記録に残る（名前の材料になるため）');
assert(record.buildName === Game.buildName(record),
  '名前は record の中身だけで再現できる（KPIや乱数に依存しない）');

console.log('all build name tests passed');
