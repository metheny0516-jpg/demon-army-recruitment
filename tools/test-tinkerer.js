// 《改造癖》：本人は戦場にいない。生活部門で糧食を発酵させた結果、食べた誰かが酔って遅刻する。
//   node tools/test-tinkerer.js
// battle.js は伝票（options.rations.fermentedBy）を読むだけ。書くのは run.js（別コミット）。
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
const mk = (name, traits, side, x) => Battle.makeUnit(Object.assign({ uid: name, name, race: 'オーク', hp: 80, atk: 10, def: 3, spd: 5, traits, tags: [], loyalty: 80 }, x || {}), side);
const rations = (extra) => Object.assign({ consumed: 3, need: 3, shortage: 0, emptied: false, bigEaterUids: [], cookUid: null, hungerUid: null, feastUid: null }, extra || {});

// 1. 発酵した糧食：大食漢がいればその者が酔う。改造癖の本人は出撃していない
{
  const ogre = mk('ボグマ', ['big_eater'], 'player', { race: 'オーガ' });
  const orc = mk('ガロ', [], 'player');
  const foe = mk('かかし', [], 'enemy', { hp: 200, atk: 1, spd: 1 });
  const r = Battle.simulate([orc, ogre], [foe], { rations: rations({ fermentedBy: 99, fermentedByName: 'グド', bigEaterUids: ['ボグマ'] }) });
  const t = r.timeline;
  const start = t.find(e => e.type === 'battle_start');
  assert(start.absent.some(u => u.id === ogre.id), '発酵糧食を食べた大食漢が開戦時にいない');
  assert(start.player.some(u => u.id === orc.id), '他の者は普通にいる');
  const line = t.find(e => e.type === 'dialogue' && e.late && e.unitId === ogre.id && e.name === 'モルモ');
  assert(!!line && /グド/.test(line.quote) && /ボグマ/.test(line.quote), 'モルモの一言に、酔った者と原因を作った者（出撃していない）の両方が出る');
  const self = t.find(e => e.type === 'dialogue' && e.late && e.offstage && e.unitId === ogre.id);
  assert(!!self && vm.runInContext('TRAITS.tinkerer.lines.absentSelf', ctx).includes(self.quote), '酔った本人の舞台裏の一言は改造癖側のプールから');
  const arrive = t.find(e => e.type === 'summon' && e.late && e.unit.id === ogre.id);
  assert(!!arrive && vm.runInContext('TRAITS.tinkerer.lines.arrive', ctx).includes(arrive.quote), '到着の台詞も改造癖側のプール（酒好きの台詞と混ざらない）');
  const c = r.contribution.find(x => x.uid === 'ボグマ');
  assert(c && c.late === 1 && c.lateCause === 'fermented_rations', '戦果に「発酵糧食で遅れた」が残る（酒好きの遅刻と区別できる）');
}
// 2. 大食漢がいなければ、食べた誰か（アンデッド以外）
{
  const orc = mk('ガロ', [], 'player');
  const bone = mk('ホネ吉', [], 'player', { race: '骸骨兵', tags: ['undead'] });
  const foe = mk('かかし', [], 'enemy', { hp: 200, atk: 1, spd: 1 });
  const r = Battle.simulate([bone, orc], [foe], { rations: rations({ fermentedBy: 99, fermentedByName: 'グド' }) });
  const start = r.timeline.find(e => e.type === 'battle_start');
  assert(start.absent.some(u => u.id === orc.id), '食べる者（アンデッド以外）が酔う');
  assert(start.player.some(u => u.id === bone.id), 'アンデッドは食べないので酔わない');
}
// 3. 伝票に発酵が無ければ何も起きない／糧食を食べていなければ何も起きない
{
  const orc = mk('ガロ', [], 'player');
  const foe = mk('かかし', [], 'enemy', { hp: 50 });
  const a = Battle.simulate([orc], [foe], { rations: rations() });
  assert(!a.timeline.find(e => e.type === 'battle_start').absent.length, '発酵していなければ誰も遅れない');
  const b = Battle.simulate([mk('ガロ', [], 'player')], [mk('かかし', [], 'enemy', { hp: 50 })], { rations: rations({ fermentedBy: 99, consumed: 0 }) });
  assert(!b.timeline.find(e => e.type === 'battle_start').absent.length, '糧食を食べていなければ酔わない');
}
// 4. 酒好きの遅刻と重なっても、一人が二重に遅れない
{
  const orc = mk('ガロ', ['drunkard'], 'player');
  const foe = mk('かかし', [], 'enemy', { hp: 200, atk: 1, spd: 1 });
  const r = Battle.simulate([orc], [foe], { rations: rations({ fermentedBy: 99 }) });
  const start = r.timeline.find(e => e.type === 'battle_start');
  assert(start.absent.length === 1 && start.absent[0].id === orc.id, '既に酒で遅れている者は、発酵の方では選ばれない（絶対に来る者がいなくても進行不能にはならない）');
  assert(typeof r.victory === 'boolean', '決着は付く');
}
// 6. 暴食の宴（feastUid）の大食漢が発酵で離席していたら、1ラウンド目の追加行動もしない
//    （オーナー試遊：二人とも遅刻なのに、透明のオーガが敵を殴っていた）
{
  const ogre = mk('ボグマ', ['big_eater'], 'player', { race: 'オーガ' });
  const orc = mk('ガロ', ['drunkard'], 'player');
  const foe = mk('かかし', [], 'enemy', { hp: 500, atk: 1, spd: 1 });
  const r = Battle.simulate([orc, ogre], [foe], { rations: rations({ consumed: 6, fermentedBy: 99, fermentedByName: 'グド', bigEaterUids: ['ボグマ'], feastUid: 'ボグマ' }) });
  const t = r.timeline;
  const start = t.find(e => e.type === 'battle_start');
  assert(start.absent.some(u => u.id === ogre.id), '大食漢は発酵で離席している');
  const arrive = t.findIndex(e => e.type === 'summon' && e.late && e.unit.id === ogre.id);
  const firstHit = t.findIndex(e => e.type === 'attack' && e.fromId === ogre.id);
  assert(!t.some(e => e.type === 'trait_trigger' && e.traitId === 'glutton_feast'), '離席中なら「暴食の宴」も告げない');
  assert(firstHit === -1 || (arrive !== -1 && firstHit > arrive), '離席中の大食漢は到着前に攻撃しない');
}

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
