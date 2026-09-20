// 隔離試作の人物ハプニング。自然発生率0のまま forceHappenings で処理だけ検証する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/skill_effects.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = p => p > 0; U.pick = arr => arr[0]; U.rand = () => 0.75;', ctx);
const Battle = vm.runInContext('Battle', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, race, side, x = {}) => Battle.makeUnit(Object.assign({ uid: name, name, race, hp: 160, atk: 12, def: 2, spd: 5, traits: [], tags: [], loyalty: 80 }, x), side);
const roundOf = (timeline, index) => timeline.slice(0, index + 1).filter(e => e.type === 'round_start').at(-1)?.round || 0;

// 通常プレイでは、乱数関数が0%を誤ってtrue扱いしても隔離試作は漏れない。
{
  const s = mk('スラ', 'スライム', 'player'), e = mk('兵', '人間', 'enemy', { hp: 300 });
  const r = Battle.simulate([s], [e]);
  assert(!r.incidents.some(i => i.id === 'slime_cling'), '強制指定なしでは隔離試作が通常戦闘へ漏れない');
}

function checkClingSpeeds(slimeSpd, enemySpd, label) {
  const s = mk('スラ', 'スライム', 'player', { spd: slimeSpd, atk: 3 });
  const e = mk('兵', '人間', 'enemy', { spd: enemySpd, hp: 500, atk: 1 });
  const r = Battle.simulate([s], [e], { forceHappenings: ['slime_cling'] });
  const incident = r.timeline.find(e => e.type === 'incident' && e.id === 'slime_cling');
  const stops = r.timeline.filter(e => e.type === 'note' && e.cling);
  const sStops = stops.filter(e => e.unitId === s.id), eStops = stops.filter(x => x.unitId === e.id);
  assert(!!incident && sStops.length === 1 && eStops.length === 2, `${label}：本人は発動時込み2回、敵は貼付後2回だけ停止`);
  const laterSlimeAttack = r.timeline.findIndex((x, i) => i > r.timeline.indexOf(incident) && x.type === 'attack' && x.fromId === s.id);
  assert(laterSlimeAttack >= 0, `${label}：先に2回を消化した側は3回目まで止められない`);
}
checkClingSpeeds(10, 2, 'スライム先手');
checkClingSpeeds(2, 10, 'スライム後手');

// 接着相手が倒れ、その後蘇生しても接着は戻らない。
{
  const s = mk('スラ', 'スライム', 'player', { spd: 12, hp: 20, atk: 2 });
  const necro = mk('ネクロ', 'ネクロマンサー', 'player', { spd: 1, traits: ['necromancy'], atk: 1 });
  const stuck = mk('貼付先', '人間', 'enemy', { spd: 10, hp: 300, atk: 1 });
  const killer = mk('別の敵', '人間', 'enemy', { spd: 9, hp: 300, atk: 100 });
  const r = Battle.simulate([s, necro], [stuck, killer], {
    forceHappenings: ['slime_cling'], forceHappeningTargetIds: { slime_cling: stuck.uid }
  });
  const death = r.timeline.findIndex(e => e.type === 'death' && e.unitId === s.id);
  const revive = r.timeline.findIndex((e, i) => i > death && e.type === 'revive' && e.unitId === s.id);
  const after = revive >= 0 ? r.timeline.slice(revive + 1) : [];
  assert(death >= 0 && revive > death, '接着中に倒れた者を死霊術で蘇生できる');
  assert(!after.some(e => e.type === 'note' && e.cling && e.unitId === s.id), '蘇生後に接着状態は復活しない');
}

// トロル：2回休み。防御値を変えず、受動的な肩代わりは残す。
{
  const troll = mk('トロ', 'トロル', 'player', { spd: 10, hp: 80, maxHp: 160, traits: ['bone_wall'] });
  const ally = mk('仲間', 'ゴブリン', 'player', { spd: 1, hp: 30 });
  const foe = mk('敵', '人間', 'enemy', { spd: 5, hp: 500, atk: 20 });
  const beforeDef = troll.def;
  const r = Battle.simulate([ally, troll], [foe], { forceHappenings: ['troll_nap'], forceHappeningTurns: { troll_nap: 2 } });
  const naps = r.timeline.filter(e => e.napping || (e.type === 'incident' && e.id === 'troll_nap'));
  assert(naps.length === 2, 'トロルは発動手番と次の通常手番の計2回だけ休む');
  assert(troll.def === beforeDef, '昼寝で防御力を勝手に下げない');
  assert(r.timeline.some(e => e.type === 'trait_trigger' && e.traitId === 'bone_wall'), '睡眠中も受動的な既存の肩代わりは無効化しない');
  assert(r.timeline.filter(e => e.type === 'heal' && e.label === '昼寝').length >= 1, '休んだ回ごとの実回復量をhealイベントで表示する');
}

// ハーピー：離脱手番を1回目とし、指定回数後に固定100%・必中・気合なしで帰還。
{
  const h = mk('ハピ', 'ハーピー', 'player', { spd: 10, atk: 20, traits: [], spirit: 2 });
  const wall = mk('壁', 'ゴブリン', 'player', { spd: 1, atk: 1, hp: 500 });
  const foe = mk('敵', '人間', 'enemy', { spd: 2, hp: 500, def: 3, atk: 1 });
  const r = Battle.simulate([h, wall], [foe], { forceHappenings: ['harpy_scout'], forceHappeningTurns: { harpy_scout: 1 } });
  const incidentIndex = r.timeline.findIndex(e => e.type === 'incident' && e.id === 'harpy_scout');
  const arrivalIndex = r.timeline.findIndex(e => e.type === 'summon' && e.scout);
  const dive = r.timeline.find(e => e.type === 'attack' && e.label === '偵察急降下');
  assert(roundOf(r.timeline, incidentIndex) === 1 && roundOf(r.timeline, arrivalIndex) === 2, '1回休みは離脱手番を失い、次の本人手番相当で帰還');
  assert(dive && dive.dmg === h.atk - foe.def, '事故の帰還攻撃は通常攻撃100%相当・必中');
  assert(!r.timeline.some(e => e.type === 'order_exec' || e.skillId === 'harpy_dive') && h.spirit === 2, '急降下技の習得・気合消費とは混同しない');
}
{
  const h = mk('ハピ', 'ハーピー', 'player', { spd: 10, atk: 20 });
  const wall = mk('壁', 'ゴブリン', 'player', { hp: 500, atk: 1 });
  const foe = mk('敵', '人間', 'enemy', { hp: 500, atk: 1 });
  const r = Battle.simulate([h, wall], [foe], { forceHappenings: ['harpy_scout'], forceHappeningTurns: { harpy_scout: 2 } });
  const arrival = r.timeline.findIndex(e => e.type === 'summon' && e.scout);
  assert(roundOf(r.timeline, arrival) === 3, '2回休みは離脱手番と次の手番を失い、その次に帰還');
}
{
  const h = mk('ハピ', 'ハーピー', 'player', { spd: 10 });
  const foe = mk('敵', '人間', 'enemy', { hp: 500, atk: 1 });
  const r = Battle.simulate([h], [foe], { forceHappenings: ['harpy_scout'] });
  const c = r.contribution.find(x => x.uid === 'ハピ');
  assert(!r.victory && !r.timeline.some(e => e.type === 'summon' && e.scout), '上空の本人しか残らなければ帰還待ちにせず敗北');
  assert(c && c.survived && !c.died, '上空で敗北した本人は自動戦死・負傷にしない');
}

// ミノタウロス：通常攻撃だけを事故に置換。誤る先が無ければ不成立。
{
  const m = mk('ミノ', 'ミノタウロス', 'player', { spd: 10, traits: ['charge'], atk: 20 });
  const ally = mk('仲間', 'ゴブリン', 'player', { hp: 200 });
  const foe = mk('敵', '人間', 'enemy', { hp: 500, atk: 1 });
  const r = Battle.simulate([m, ally], [foe], {
    forceHappenings: ['minotaur_wrong_way'], forceHappeningTargetIds: { minotaur_wrong_way: ally.uid }
  });
  assert(r.timeline.filter(e => e.type === 'splash' && e.label === '誤突進').length === 1, '誤突進が通常攻撃を一度だけ置き換える');
  assert(!r.timeline.some(e => e.type === 'attack' && e.fromId === m.id && roundOf(r.timeline, r.timeline.indexOf(e)) === 1), '事故後に同じ手番の通常攻撃を重ねない');
  assert(!r.timeline.some(e => e.type === 'trait_trigger' && e.traitId === 'charge'), '事故ラウンドは自動特性chargeだけを抑止する');
}
{
  const m = mk('ミノ', 'ミノタウロス', 'player', { spd: 10, atk: 20 });
  const foe = mk('敵', '人間', 'enemy', { hp: 100, atk: 1 });
  const r = Battle.simulate([m], [foe], { forceHappenings: ['minotaur_wrong_way'] });
  assert(!r.incidents.some(i => i.id === 'minotaur_wrong_way') && r.timeline.some(e => e.type === 'attack' && e.fromId === m.id), '誤る別対象がいなければ事故不成立で通常攻撃を続ける');
}
{
  const m = mk('ミノ', 'ミノタウロス', 'player', { spd: 10, atk: 20, spirit: 2, skills: ['mino_rush'], traits: ['charge'] });
  const ally = mk('仲間', 'ゴブリン', 'player', { hp: 200 });
  const foe = mk('敵', '人間', 'enemy', { hp: 500, atk: 1 });
  const h = Battle.start([m, ally], [foe], { forceHappenings: ['minotaur_wrong_way'], forceHappeningTargetIds: { minotaur_wrong_way: ally.uid } });
  h.next();
  h.next({ p0: { cmd: 'skill', skill: 'mino_rush', target: 'e0' }, p1: { cmd: 'attack', target: 'e0' } });
  assert(h.timeline.some(e => e.type === 'attack' && e.fromId === m.id && e.label === '突進'), 'コマンド技 mino_rush は事故で消さず実行する');
  assert(!h.timeline.some(e => e.type === 'incident' && e.id === 'minotaur_wrong_way'), 'コマンド技の手番では通常攻撃用の事故抽選を通さない');
}

// 大食漢：新事件を増やさず既存最大2回を維持し、満タン本人でも瀕死の仲間へ半分渡す。
{
  const ogre = mk('オーガ', 'オーガ', 'player', { spd: 10, hp: 160, traits: ['big_eater'], atk: 50 });
  const ally = mk('瀕死', 'ゴブリン', 'player', { spd: 1, hp: 100, atk: 1 });
  ally.hp = 10;
  const foes = [1,2,3,4].map(i => mk('敵'+i, '人間', 'enemy', { hp: 5, atk: 1, spd: 2 }));
  const r = Battle.simulate([ogre, ally], foes);
  const eats = r.timeline.filter(e => e.type === 'trait_trigger' && e.traitId === 'big_eater' && !e.busy);
  const shared = r.timeline.filter(e => e.type === 'heal' && e.label === '弁当を半分');
  assert(eats.length <= 2, '大食漢は共通1回制限の例外として既存の最大2回を維持');
  assert(shared.length >= 1 && shared[0].amount > 0 && shared[0].unitId === ally.id, '本人が満タンでも瀕死の仲間へ半分を渡し、実回復量を表示');
  assert(r.incidents.every(i => i.id !== 'ogre_lunch'), '食事休みを別事件として二重発生させない');
}

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
