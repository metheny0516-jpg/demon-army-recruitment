// 《酒好き》の遅刻。開戦時に不在で、遅れて summon イベントで到着し、以後は普通に戦う。
//   node tools/test-late-arrival.js
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
// rand=0.5 → lateArrival は 1 ラウンド（0.5<0.5 は偽）。chance/pick も固定して決定的にする。
vm.runInContext('U.chance = () => true; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, traits, side, extra) => Battle.makeUnit(Object.assign({ uid: name, name, race: 'オーク', hp: 60, atk: 10, def: 2, spd: 5, traits, tags: [], loyalty: 80 }, extra || {}), side);

// 1. 基本：開戦時にいない → R2 に到着 → 以後戦う
{
  const late = mk('ガロ', ['drunkard'], 'player', { introQuote: '斧の出番だ' });
  const wall = mk('ガンツ', [], 'player', { hp: 200, atk: 1 });
  const foe = mk('かかし', [], 'enemy', { hp: 300, atk: 1, spd: 1 });
  const r = Battle.simulate([late, wall], [foe]);
  const t = r.timeline;
  const start = t.find(e => e.type === 'battle_start');
  assert(!start.player.some(u => u.id === late.id), '開戦の並びに遅刻者はいない');
  assert(start.player.some(u => u.id === wall.id), '他の味方は普通に並ぶ');
  assert(!t.some(e => e.type === 'dialogue' && e.unitId === late.id), '遅刻者は開戦の口上を言わない');
  const arrive = t.find(e => e.type === 'summon' && e.late && e.unit.id === late.id);
  assert(!!arrive, '遅刻者は late 付きの summon で到着する');
  const arriveIdx = t.indexOf(arrive);
  const r2 = t.findIndex(e => e.type === 'round_start' && e.round === 2);
  const r3 = t.findIndex(e => e.type === 'round_start' && e.round === 3);
  assert(arriveIdx > r2 && (r3 < 0 || arriveIdx < r3), '1ラウンド遅刻なら、ラウンド2の頭で到着する');
  assert(!t.slice(0, arriveIdx).some(e => (e.type === 'attack' || e.type === 'splash') && (e.fromId === late.id || e.toId === late.id)),
    '到着前は攻撃もされず、攻撃もしない');
  assert(t.slice(arriveIdx).some(e => e.type === 'attack' && e.fromId === late.id), '到着後は普通に攻撃する');
  assert(arrive.unit.summoned === false && arrive.unit.late === true, '到着スナップは召喚物ではなく late 印を持つ');
  const c = r.contribution.find(x => x.uid === 'ガロ');
  assert(!!c && c.late === 1, '戦果に遅刻ラウンド数が残る（召喚物として弾かれない）');
  assert(r.contribution.find(x => x.uid === 'ガンツ').late === 0, '遅刻していない者は 0');
}
// 2. 遅刻者しかいない：敵は殴る相手がおらず、到着して一人で戦う。全滅扱いにならない
{
  const late = mk('ガロ', ['drunkard'], 'player');
  const foe = mk('かかし', [], 'enemy', { hp: 30, atk: 5, spd: 9 });
  const r = Battle.simulate([late], [foe]);
  const t = r.timeline;
  const arriveIdx = t.findIndex(e => e.type === 'summon' && e.late);
  assert(arriveIdx > 0, '一人だけでも到着イベントが出る');
  assert(!t.slice(0, arriveIdx).some(e => e.type === 'attack'), '誰もいない戦場では、到着まで誰も殴らない');
  assert(t.some(e => e.type === 'attack' && e.fromId === late.id), '着いてから戦う');
  assert(typeof r.victory === 'boolean', '決着が付く（進行不能にならない）');
}
// 3. 特性が無ければ何も変わらない
{
  const a = mk('普通', [], 'player'), b = mk('かかし', [], 'enemy', { hp: 50 });
  const r = Battle.simulate([a], [b]);
  const start = r.timeline.find(e => e.type === 'battle_start');
  assert(start.player.length === 1 && !r.timeline.some(e => e.type === 'summon'), '酒好きでなければ開戦から居て、到着イベントも出ない');
  assert(start.player[0].late === false, 'スナップの late は既定で false（契約の追加フィールド）');
}
// 4. 敵側には効かない（採用していない者に癖は無い）
{
  const a = mk('普通', [], 'player', { hp: 200 });
  const foe = mk('酔った敵', ['drunkard'], 'enemy', { hp: 50 });
  const r = Battle.simulate([a], [foe]);
  const start = r.timeline.find(e => e.type === 'battle_start');
  assert(start.enemy.some(u => u.id === foe.id), '敵は遅刻しない');
}
console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
