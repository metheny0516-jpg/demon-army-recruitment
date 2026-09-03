// 前代の教訓（ロードマップ⑦：失敗を方向転換の材料に）。
//
// 見ているのは文言ではなく契約:
// 敗北の内容から教訓が選ばれ、必ず3つ提示され、選んだものが次代に一度だけ効き、
// 効くのは強さではなく応募プールの偏りであること。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx), Storage = vm.runInContext('Storage', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

// ── 1. 敗北の内容が、提示される教訓を決める ─────────────────────
const ids = r => Game.lessonOffers(r).map(l => l.id);
assert(ids({ facilityLevel: 0, battlesWon: 8 })[0] === 'mason',
  '城を建てられずに滅びたランは、まず石工の記憶を差し出す');
assert(ids({ facilityLevel: 2, fallenTotal: 9, battlesWon: 8 })[0] === 'mourning',
  '戦死者を多く出したランは、まず弔いの記憶を差し出す');
assert(ids({ facilityLevel: 2, battlesWon: 2 }).includes('rout'),
  '早々に敗走したランには敗走の記憶が並ぶ');

// ── 2. どんな負け方でも必ず3つ出る ───────────────────────────
// 「当てはまったものだけ」にすると、綺麗に負けたランで選択肢が消えてしまう。
const clean = { facilityLevel: 3, fallenTotal: 0, battlesWon: 8, maxChain: 9,
  payrollChoices: {}, battleIncidentTotal: 0, finalResources: { food: 9 } };
assert(Game.lessonOffers(clean).length === 3, '何にも当てはまらない負け方でも教訓は3つ提示される');
assert(Game.lessonOffers({}).length === 3, '空の記録でも落ちずに3つ返す');

// ── 3. 選んだ教訓は次代に一度だけ効く ──────────────────────────
assert(Game.chooseLesson('mourning'), '教訓を選べる');
assert(!Game.chooseLesson('存在しない教訓'), '知らない教訓は選べない');
Game.newRun();
assert(Game.activeLesson() && Game.activeLesson().id === 'mourning',
  '次のランは選んだ教訓を持って始まる');
assert(Storage.loadLesson() === null, '読んだ教訓は消える（持ち越しは1ランだけ）');
Game.newRun();
assert(Game.activeLesson() === null, 'さらに次のランへは持ち越さない');

// ── 4. 効くのは強さではなく応募プールの偏り（設計憲法 第9節） ─────────
// 弔いの記憶は死を扱う者を寄せる。確定ではないので、多数回引いて比率で見る。
const countUndeadish = () => {
  const want = new Set(['necromancer', 'skeleton', 'zombie']);
  let n = 0;
  for (let i = 0; i < 400; i++) if (want.has(Game.rollApplicant().tplId)) n++;
  return n;
};
Game.newRun();
const plain = countUndeadish();
Game.chooseLesson('mourning');
Game.newRun();
const biased = countUndeadish();
assert(biased > plain, `弔いの記憶は死を扱う者を応募へ寄せる（${plain} → ${biased} / 400）`);

// 敗走の記憶は顔ぶれではなく面接の枠を増やす
Game.newRun();
const baseCount = Game.applicantCount();
Game.chooseLesson('rout');
Game.newRun();
assert(Game.applicantCount() === baseCount + 1, '敗走の記憶は応募者を1名増やす');

// ── 5. 教訓は個体の能力値を触らない ────────────────────────────
Game.newRun();
const before = Game.rollApplicant();
Game.chooseLesson('mason');
Game.newRun();
const after = Game.rollApplicant();
assert(typeof before.hp === 'number' && typeof after.hp === 'number',
  '教訓を持っていても応募者の作られ方（能力値の算出）は変わらない');

console.log('all lesson tests passed');
