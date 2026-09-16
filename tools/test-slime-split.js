// 増殖の元（docs/DESIGN_ARC_SLIME_2026-09-15.md ②・battle.js 側）。
//   node tools/test-slime-split.js
// 火の火の粉を浴びたスライムは、options.slimeSplit.enabled のときだけ、以後のラウンドの頭に分身を出す（cap まで）。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/skill_effects.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Battle = vm.runInContext('Battle', ctx);
const SPARK = vm.runInContext('SPARK', ctx);
const ENEMY_BIG_MOVE = vm.runInContext('ENEMY_BIG_MOVE', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, x, side) => Battle.makeUnit(Object.assign({
  uid: name, name, race: 'オーク', hp: 80, atk: 10, def: 3, spd: 5, traits: [], tags: [], loyalty: 80, spirit: 3 }, x || {}), side || 'player');
const rations = () => ({ consumed: 3, need: 3, shortage: 0, emptied: false, bigEaterUids: [], cookUid: null, hungerUid: null, feastUid: null });
const foes = n => Array.from({ length: n }, (_, i) => mk('兵' + i, { race: '人間', hp: 400, atk: 1, def: 0, spd: 3 + i, spirit: undefined }, 'enemy'));
const events = (h, type) => h.timeline.filter(e => e.type === type);
const run = (extra, rounds) => {
  ENEMY_BIG_MOVE.chance = 0; SPARK.chance = 1;
  const slime = mk('ぷに', { tplId: 'slime', race: 'スライム', hp: 60, atk: 5, spd: 4 });
  const mage = mk('術師', { tplId: 'mage', race: '魔法使い', skills: ['mage_fireball'], spirit: 9 });
  const h = Battle.start([slime, mage], foes(2), Object.assign({ rations: rations(), seed: 7, manual: true }, extra || {}));
  h.next();
  h.next({ p0: { cmd: 'guard' }, p1: { cmd: 'skill', skill: 'mage_fireball' } });
  for (let i = 0; i < rounds; i++) if (!h.done) h.next({ p0: { cmd: 'guard' }, p1: { cmd: 'guard' } });
  return h;
};

console.log('▼ 1. 火を浴びたスライムが、次のラウンドから分身を出す');
{
  const h = run({ slimeSplit: { enabled: true } }, 5);
  assert(events(h, 'note').some(e => e.split && e.unitId === 'p0'), '火の粉を浴びた直後に「震えている」の字幕が出る');
  const sums = events(h, 'summon').filter(e => e.unit && /分身/.test(e.unit.name));
  assert(sums.length === 3, `分身は上限 3 体まで（${sums.length}）`);
  const r1 = h.timeline.findIndex(e => e.type === 'round_start' && e.round === 2);
  assert(h.timeline.indexOf(sums[0]) > r1, '最初の分身はラウンド2の頭（火を浴びた次のラウンド）');
  assert(sums[0].unit.atk === 1 && sums[0].unit.maxHp === 18, `分身は攻撃1・HP 30%（atk ${sums[0].unit.atk} / hp ${sums[0].unit.maxHp}）`);
  assert(sums.every(e => e.parentEventId), '分身の召喚は火の粉の一撃を親に持つ（因果が残る）');
  const res = h.result || (() => { let g = 0; while (!h.done && g++ < 60) h.next({}); return h.result; })();
  const rec = (res.slimeSplit || []).find(x => x.uid === 'ぷに');
  assert(rec && rec.count === 3 && rec.byUid === '術師' && rec.skillId === 'mage_fireball', 'result.slimeSplit に誰が誰の火で何体増えたかが載る');
}
console.log('▼ 2. 条件を渡さなければ何も起きない');
{
  const h = run({}, 5);
  assert(!events(h, 'summon').some(e => e.unit && /分身/.test(e.unit.name)), 'options.slimeSplit が無ければ分身は出ない');
  assert(!events(h, 'note').some(e => e.split), '字幕も出ない');
}
console.log('▼ 3. スライム以外は増えない');
{
  ENEMY_BIG_MOVE.chance = 0; SPARK.chance = 1;
  const orc = mk('前列', { hp: 60 }), mage = mk('術師', { tplId: 'mage', race: '魔法使い', skills: ['mage_fireball'], spirit: 9 });
  const h = Battle.start([orc, mage], foes(2), { rations: rations(), seed: 7, manual: true, slimeSplit: { enabled: true } });
  h.next(); h.next({ p0: { cmd: 'guard' }, p1: { cmd: 'skill', skill: 'mage_fireball' } });
  for (let i = 0; i < 3; i++) if (!h.done) h.next({ p0: { cmd: 'guard' }, p1: { cmd: 'guard' } });
  assert(events(h, 'note').some(e => e.spark) && !events(h, 'note').some(e => e.split), '火の粉は飛ぶが、オークは震えない');
}
console.log('▼ 4. cap は options で変えられる');
{
  const h = run({ slimeSplit: { enabled: true, cap: 1 } }, 5);
  assert(events(h, 'summon').filter(e => e.unit && /分身/.test(e.unit.name)).length === 1, 'cap 1 なら1体');
}
if (failed) { console.log(`✗ ${failed} 件失敗`); process.exit(1); }
console.log('増殖の元テスト完了');
