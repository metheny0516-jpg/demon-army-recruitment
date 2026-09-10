// 《大食漢》：倒した敵の飯を食い、次の手番を飛ばす。数値ではなく順番に効く。
//   node tools/test-glutton.js
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
vm.runInContext('U.chance = () => true; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, traits, side, x) => Battle.makeUnit(Object.assign({ uid: name, name, race: 'オーガ', hp: 100, atk: 30, def: 5, spd: 9, traits, tags: [], loyalty: 80 }, x || {}), side);

// 4体の弱い敵。毎ラウンド1体ずつ倒せる。
const ogre = mk('ボグマ', ['big_eater'], 'player', { hp: 100 });
ogre.hp = 60;   // 食べれば回復が見える
const foes = [1, 2, 3, 4].map(i => mk('見習い' + i, [], 'enemy', { hp: 5, atk: 1, spd: 1 }));
const r = Battle.simulate([ogre], foes);
const t = r.timeline;
const eats = t.filter(e => e.type === 'trait_trigger' && e.traitId === 'big_eater' && /食べ始めた/.test(e.text));
const busy = t.filter(e => e.type === 'trait_trigger' && e.traitId === 'big_eater' && /まだ食べている/.test(e.text));
assert(eats.length >= 1, '敵を倒すと、その場で食べ始める');
const pool = vm.runInContext('TRAITS.big_eater.lines.eat', ctx);
assert(eats.every(e => pool.includes(e.quote)), '台詞はプールから出る');
assert(eats.every(e => e.parentEventId), '食べ始めた出来事は撃破を親に持つ（因果が辿れる）');
const heal = t.find(e => e.type === 'heal' && e.unitId === ogre.id);
assert(!!heal && heal.amount > 0, '食べた分だけ少し回復する（結果であって目的ではない）');
// 食べた次のラウンドは動かない
const firstEat = t.indexOf(eats[0]);
const nextRound = t.findIndex((e, i) => i > firstEat && e.type === 'round_start');
const roundAfter = t.findIndex((e, i) => i > nextRound && e.type === 'round_start');
const slice = t.slice(nextRound, roundAfter > 0 ? roundAfter : t.length);
assert(slice.some(e => e.type === 'trait_trigger' && /まだ食べている/.test(e.text)), '次のラウンドは「まだ食べている」');
assert(!slice.some(e => e.type === 'attack' && e.fromId === ogre.id), 'その間は攻撃しない（順番に効く）');
assert(eats.length <= 2, '1戦闘で食べるのは2回まで');
assert(busy.length === eats.length, '食べた回数だけ、動かない手番がある');
assert(typeof r.victory === 'boolean', '決着は付く');
// 敵側には効かない
const foe = mk('大食いの敵', ['big_eater'], 'enemy', { hp: 100 });
const me = mk('味方', [], 'player', { hp: 5 });
const r2 = Battle.simulate([me], [foe]);
assert(!r2.timeline.some(e => e.type === 'trait_trigger' && e.traitId === 'big_eater'), '敵は食べ始めない');
console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
