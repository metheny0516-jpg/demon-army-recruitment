// 敵将（docs/SPEC_CAPTAINS_BD_2026-09-15.md）：名簿データ・Captains の純粋関数・戦闘の「見逃す／雇う」。
//   node tools/test-captains.js
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js', 'src/data/promotions.js',
  'src/data/synergies.js', 'src/data/enemies.js', 'src/data/territories.js', 'src/data/enemy_captains.js',
  'src/core/util.js', 'src/core/synergy.js', 'src/core/skill_effects.js', 'src/core/battle.js', 'src/core/territory.js', 'src/core/captains.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Battle = vm.runInContext('Battle', ctx), C = vm.runInContext('Captains', ctx), DATA = vm.runInContext('ENEMY_CAPTAINS', ctx);
const TRAITS = vm.runInContext('TRAITS', ctx), TRIBES = vm.runInContext('TERRITORY_TRIBES', ctx), STAGES = vm.runInContext('ENEMY_STAGES', ctx);
const ENEMY_BIG_MOVE = vm.runInContext('ENEMY_BIG_MOVE', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };

console.log('▼ 1. 名簿データ');
const ids = Object.keys(DATA);
assert(ids.length === 13, `敵将 13 人（${ids.length}）`);
assert(ids.every(id => (DATA[id].traits || []).every(t => TRAITS[t])), '癖は全部既存の TRAITS にある');
assert(ids.every(id => ['village', 'tribe', 'kingdom'].includes(DATA[id].thread)), '糸は village / tribe / kingdom');
assert(TRIBES.filter(t => t.chief).every(t => DATA[t.chief.id]), '部族の首領は全員、名簿に戦闘の値を持つ');
assert(ids.filter(id => DATA[id].offer === 'hire').every(id => DATA[id].hire && DATA[id].hire.race), '雇える者は hire（種族・忠誠）を持つ');

console.log('▼ 2. 状態・隊列・最終戦');
{
  const st = {};
  assert(C.state(st, 'polka').status === 'unseen', '初期は unseen');
  C.mark(st, 'polka', 'alive'); C.mark(st, 'polka', 'alive');
  assert(C.state(st, 'polka').seen === 2, '会った回数を数える');
  const base = STAGES[0].units;
  const units = C.attach(base, 'polka', st, 1);
  assert(units.length === base.length + 1 && units[0].captain.id === 'polka' && units[0].captain.offer === 'spare', '隊列の先頭に敵将が乗り、captain の印が付く');
  assert(units[0].hp === Math.round(30 * 1.3), `ポルカは会った回数で +15%/回（HP ${units[0].hp}）`);
  assert(C.pickForCard(st, 'kingdom', 2) && C.pickForCard(st, 'kingdom', 3) === null, '「⚠ ○○がいる」札は3決着に1回');
  C.mark(st, 'bold', 'slain'); C.mark(st, 'zack', 'hired');
  const hero = STAGES[7].units;
  const party = C.heroParty(st, hero, 1);
  assert(party.length === 4 && party[0].role === 'commander', `最終戦は勇者＋3枠（${party.length}）`);
  assert(!party.some(u => u.captain && (u.captain.id === 'bold' || u.captain.id === 'zack')), '討った者・雇った者は勇者の隣に立たない');
  assert(party.slice(1).every(u => u.captain), '残りの枠は討たれなかった敵将で埋まる（会っていない者も含む）');
  for (const id of ids) if (DATA[id].joinsHero && id !== 'zack') C.mark(st, id, 'slain');
  const party2 = C.heroParty(st, hero, 1);
  assert(party2.length === 4 && party2.slice(1).every(u => !u.captain), '全員討てば既定の3人');
  const s = C.summary(st);
  assert(s.slain.length >= 6 && s.hired.includes('ザック'), `魔界史の材料（討った ${s.slain.length}・雇った ${s.hired.join()}）`);
  assert(C.ambush(st, 0, () => 0) === null, '警戒 0 では不意打ちは起きない');
  assert(C.ambush({}, 10, () => 0.1, false) && C.ambush({}, 10, () => 0.1, false).kind === 'captain', '警戒 10 で乱数 0.1 なら敵将の不意打ち');
  assert(C.ambush({}, 10, () => 0.1, true).kind === 'hall', '殿堂があれば一部は先代の英雄');
}

console.log('▼ 3. 戦闘：見逃す／雇う（コマンドバトルだけ）');
{
  ENEMY_BIG_MOVE.chance = 0;
  const mk = (name, x, side) => Battle.makeUnit(Object.assign({ uid: name, name, race: 'オーク', hp: 120, atk: 20, def: 5, spd: 9, traits: [], tags: [], loyalty: 80, spirit: 3 }, x || {}), side || 'player');
  const rations = { consumed: 3, need: 3, shortage: 0, emptied: false, bigEaterUids: [], cookUid: null, hungerUid: null, feastUid: null };
  const st = {};
  const foes = C.attach([{ name: '兵', role: 'fighter', icon: '🗡', hp: 30, atk: 3, def: 0, spd: 1 }], 'gareth', st, 1).map(u => Battle.makeUnit(Object.assign({ race: '人間', tags: [] }, u), 'enemy'));
  assert(foes[0].captain && foes[0].captain.id === 'gareth', 'makeUnit が captain を写す');
  foes[0].hp = 20;   // 30% 以下から始める
  const h = Battle.start([mk('殴り手'), mk('殴り手2')], foes, { rations, seed: 3 });
  const p = h.next();
  assert(p.canSpare && p.canSpare.captainId === 'gareth' && p.canSpare.kind === 'spare', `HP 30% 以下の敵将で canSpare が出る（${JSON.stringify(p.canSpare)}）`);
  assert(p.enemies.find(e => e.captain === 'gareth'), '敵の一覧に captain が載る');
  let step = h.next({ spare: true, p0: { cmd: 'attack', target: 'e1' }, p1: { cmd: 'attack', target: 'e1' } });
  let g = 0; while (step.type !== 'end' && g++ < 30) step = h.next({ p0: { cmd: 'attack', target: 'e1' }, p1: { cmd: 'attack', target: 'e1' } });
  const r = step.result;
  assert(r.timeline.some(e => e.type === 'spare' && e.captainId === 'gareth'), 'spare イベントが出る');
  assert(r.spared.length === 1 && r.spared[0].kind === 'spare', 'result.spared に載る');
  assert(r.victory === true, '敵将が去っても残りを倒せば勝ち');
  C.settle(st, r, ['gareth']);
  assert(C.state(st, 'gareth').status === 'spared', 'settle で spared になる');
  // 断る：spare を送らなければ二度と聞かれない
  const st2 = {};
  const foes2 = C.attach([{ name: '兵', role: 'fighter', icon: '🗡', hp: 30, atk: 3, def: 0, spd: 1 }], 'zack', st2, 1).map(u => Battle.makeUnit(Object.assign({ race: '人間', tags: [] }, u), 'enemy'));
  foes2[0].hp = 5;
  const h2 = Battle.start([mk('殴り手', { atk: 1 }), mk('殴り手2', { atk: 1 })], foes2, { rations, seed: 4 });
  const p2 = h2.next();
  assert(p2.canSpare && p2.canSpare.kind === 'hire', 'ザックは「雇う」の提案');
  const p3 = h2.next({ p0: { cmd: 'guard' }, p1: { cmd: 'guard' } });
  assert(p3.type === 'commands' && !p3.canSpare, '断ったら同じ戦闘では二度と出ない');
  // 自動戦闘（simulate）では提案が無く、result.spared は空
  const foes3 = C.attach([{ name: '兵', role: 'fighter', icon: '🗡', hp: 30, atk: 3, def: 0, spd: 1 }], 'gareth', {}, 1).map(u => Battle.makeUnit(Object.assign({ race: '人間', tags: [] }, u), 'enemy'));
  const r3 = Battle.simulate([mk('殴り手'), mk('殴り手2')], foes3, { rations, seed: 5 });
  assert(Array.isArray(r3.spared) && r3.spared.length === 0, '自動戦闘では spared は空');
  const st3 = {};
  C.settle(st3, r3, ['gareth']);
  assert(r3.victory && C.state(st3, 'gareth').status === 'slain', `討って勝てば settle で slain（${C.state(st3, 'gareth').status}）`);
}

console.log('▼ 4. 覚醒の閾値の上書き（師を討たれた勇者）');
{
  const mk = (name, x, side) => Battle.makeUnit(Object.assign({ uid: name, name, race: '人間', hp: 100, atk: 10, def: 0, spd: 5, traits: [], tags: [] }, x || {}), side || 'enemy');
  const a = mk('勇者', { traits: ['hero_awaken'] }), b = mk('勇者', { traits: ['hero_awaken'], awakenAt: 0.7 });
  assert(a.awakenAt === null && b.awakenAt === 0.7, 'makeUnit が awakenAt を写す（既定は null＝50%）');
  a.hp = 65; b.hp = 65;
  const ctxA = { attacker: a, mult: 1, notes: [] }, ctxB = { attacker: b, mult: 1, notes: [] };
  TRAITS.hero_awaken.modDealt(ctxA); TRAITS.hero_awaken.modDealt(ctxB);
  assert(!a.flags.awakened && b.flags.awakened, 'HP 65% では既定は覚醒せず、awakenAt 0.7 なら覚醒する');
}

// ── 戦闘絵（docs/SPEC_CAPTAIN_ART_2026-09-18.md）──
// 敵将は tplId を持たないので、BattleScene.artId が icon の対応表を引き、
// 表に無い者（迷宮の主 🐂 など）は絵文字のまま戦場に立っていた。
console.log('\n▼ 6. 戦闘絵');
assert(ids.every(id => DATA[id].look && DATA[id].look.tplId && DATA[id].look.race),
  `13人全員に look がある（無い者: ${ids.filter(id => !(DATA[id].look && DATA[id].look.tplId)).join('、') || 'なし'}）`);
const missingArt = [...new Set(ids.map(id => DATA[id].look && DATA[id].look.tplId))]
  .filter(tpl => tpl && !fs.existsSync(`assets/battle/units/${tpl}/idle.webp`));
assert(missingArt.length === 0, `look の絵が実在する（無い: ${missingArt.join('、') || 'なし'}）`);
// 同じ tplId の応募者がいる種族は、表記を揃える（履歴書・魔界史で名前が割れない）
const MONSTERS = vm.runInContext('typeof MONSTERS !== "undefined" ? MONSTERS : []', ctx);
const raceOf = tpl => (MONSTERS.find(m => m.id === tpl) || {}).race;
const mismatched = ids.filter(id => {
  const look = DATA[id].look || {}; const race = raceOf(look.tplId);
  return race && race !== look.race;
});
assert(mismatched.length === 0,
  `race の表記が応募者と揃っている（ずれ: ${mismatched.map(id => `${id}:${DATA[id].look.race}≠${raceOf(DATA[id].look.tplId)}`).join('、') || 'なし'}）`);

{
  // attach / heroParty が unit へ写すこと（写さないと戦闘画面まで届かない）
  const st = { captains: {} };
  const [lord] = C.attach([], 'labyrinth_lord', st, 1);
  assert(lord.tplId === 'minotaur' && lord.race === 'ミノタウロス',
    `attach した敵将に絵が乗る（${lord.tplId} / ${lord.race}）`);
  const base = [{ name: '勇者アレン', role: 'commander', hp: 120, atk: 24, def: 12, spd: 10, traits: [] }];
  const party = C.heroParty({ captains: {} }, base, 1);
  const joined = party.filter(u => u.captain);
  assert(joined.length > 0 && joined.every(u => u.tplId),
    `勇者一行に加わる敵将にも絵が乗る（${joined.map(u => `${u.name}:${u.tplId}`).join('、') || 'なし'}）`);
}

console.log(failed ? `\n失敗 ${failed}` : '\n全通過');
process.exitCode = failed ? 1 : 0;
