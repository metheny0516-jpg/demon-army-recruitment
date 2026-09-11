// コマンドバトル（2026-09-11）・battle.js 側：ラウンドごとに止まり、指示（たたかう／まもる／技／おまかせ／退く）で解決する。
//   node tools/test-command-battle.js
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Battle = vm.runInContext('Battle', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, traits, side, x) => Battle.makeUnit(Object.assign({
  uid: name, name, race: 'オーク', hp: 80, atk: 10, def: 3, spd: 5, traits, tags: [], loyalty: 80 }, x || {}), side);
const rations = () => ({ consumed: 3, need: 3, shortage: 0, emptied: false, bigEaterUids: [], cookUid: null, hungerUid: null, feastUid: null });
const scene = () => ({
  p: [mk('ガロ', ['brute'], 'player', { hp: 300, atk: 12, def: 6, spd: 4, spirit: 2 }), mk('ミラ', ['fireball'], 'player', { race: '魔族', hp: 120, atk: 9, def: 2, spd: 6, spirit: 0 })],
  e: [mk('兵A', [], 'enemy', { race: '人間', hp: 200, atk: 12, def: 2, spd: 7 }), mk('兵B', [], 'enemy', { race: '人間', hp: 200, atk: 8, def: 2, spd: 3 })]
});

// 1. start() は最初のラウンドの頭で止まり、指示の材料（味方・技・気合・敵・構え）を返す
{
  const s = scene();
  const b = Battle.start(s.p, s.e, { rations: rations(), seed: 7 });
  assert(Array.isArray(b.timeline), 'タイムラインの参照が取れる');
  const step = b.next();
  assert(b.timeline.some(e => e.type === 'battle_start'), '最初の next() で battle_start が積まれている');
  assert(step.type === 'commands' && step.round === 1, `最初はラウンド1の指示待ち（${step.type}）`);
  assert(step.allies.length === 2 && step.enemies.length === 2, '戦場の味方と敵が列挙される');
  const garo = step.allies.find(a => a.name === 'ガロ'), mira = step.allies.find(a => a.name === 'ミラ');
  assert(garo.skill && garo.skill.id === 'brute' && garo.skill.cost === 1 && garo.skill.ready === true, 'ガロの技（怪力・気合1）は使える');
  assert(mira.skill && mira.skill.ready === false && mira.spirit === 0, 'ミラは気合0なので技は使えない');
  assert(step.enemies.every(e => e.intent === 'attack'), 'ラウンド1の敵の構えは通常');
  assert(step.canRetreat === false, '誰も倒れていないので退けない');
}

// 2. まもる：この手番は攻撃せず、受けるダメージが半分になる。指示した相手（target）に攻撃が向く
{
  const s = scene();
  const b = Battle.start(s.p, s.e, { rations: rations(), seed: 7 });
  b.next();
  const before = b.timeline.length;
  const step = b.next({ p0: { cmd: 'guard' }, p1: { cmd: 'attack', target: 'e1' } });
  const ev = b.timeline.slice(before);
  assert(ev.some(e => e.type === 'note' && e.guarding && e.unitId === 'p0'), 'まもった者は「身を守っている」');
  assert(!ev.some(e => e.type === 'attack' && e.fromId === 'p0'), 'まもった者はこのラウンド攻撃しない');
  const hitsOnGaro = ev.filter(e => e.type === 'attack' && e.toId === 'p0');
  assert(hitsOnGaro.every(e => (e.traits || []).includes('まもる')), `ガロへの攻撃に「まもる」の印（${hitsOnGaro.length}件）`);
  const miraAttack = ev.find(e => e.type === 'attack' && e.fromId === 'p1');
  assert(miraAttack && miraAttack.toId === 'e1', '狙いを指示した敵（兵B）へ攻撃が向く');
  assert(step.type === 'commands' && step.round === 2, '次のラウンドの指示待ちになる');
  // 次のラウンドは まもる が解けている
  const step3 = b.next({});
  const ev2 = b.timeline.slice(before + ev.length);
  assert(!ev2.some(e => e.type === 'note' && e.guarding) || step3.type === 'end', '指示しなければ まもる は続かない');
}

// 3. 技：気合を払い、条件を飛ばして技が出る。号令と違って+50%も息切れも無い
{
  const s = scene();
  const b = Battle.start(s.p, s.e, { rations: rations(), seed: 7 });
  b.next();
  const before = b.timeline.length;
  b.next({ p0: { cmd: 'skill' } });
  const ev = b.timeline.slice(before);
  const exec = ev.find(e => e.type === 'order_exec' && e.unitId === 'p0');
  assert(exec && exec.manual === true && exec.cost === 1, '技の実行イベント（manual、気合1）');
  const atk = ev.find(e => e.type === 'attack' && e.fromId === 'p0');
  assert(atk && atk.traits.includes('怪力') && !atk.traits.includes('号令'), '怪力が必ず出て、号令の+50%は付かない');
  assert(s.p[0].spirit === 1, `気合が1減る（${s.p[0].spirit}）`);
  const step = b.next({});
  const ev2 = b.timeline.slice(before + ev.length);
  assert(!ev2.some(e => e.type === 'note' && e.winded && e.unitId === 'p0'), '息切れしない');
  // 気合が足りない者の技は たたかう に落ちる
  const b2 = Battle.start(scene().p, scene().e, { rations: rations(), seed: 7 });
  b2.next();
  const before2 = b2.timeline.length;
  b2.next({ p1: { cmd: 'skill' } });
  assert(!b2.timeline.slice(before2).some(e => e.type === 'order_exec' && e.unitId === 'p1'), '気合0の技は出ない（たたかうに落ちる）');
}

// 4. 退く：味方が倒れていれば canRetreat、retreat: true で結末が退却になる
{
  const p = [mk('カミ', [], 'player', { hp: 1, atk: 1, def: 0, spd: 9, spirit: 1 }), mk('ガロ', ['brute'], 'player', { hp: 300, atk: 6, def: 6, spd: 4, spirit: 2 })];
  const e = [mk('勇者', [], 'enemy', { race: '人間', hp: 900, atk: 30, def: 4, spd: 7 })];
  const b = Battle.start(p, e, { rations: rations(), seed: 3 });
  let step = b.next();
  let guard = 0;
  while (step.type === 'commands' && !step.canRetreat && guard++ < 10) step = b.next({});
  assert(step.type === 'commands' && step.canRetreat && step.downed.includes('カミ'), '倒れた者がいれば退ける');
  const end = b.next({ retreat: true });
  assert(end.type === 'end' && end.result.retreated === true, '退くと終わる（retreated）');
  assert(end.result.retreatOffer && end.result.retreatOffer.contribution.some(c => c.uid === 'カミ' && c.injured && c.survived), '倒れていた者は担いで帰る（負傷）');
  assert(end.result.timeline.some(ev => ev.type === 'result' && ev.retreated), 'result イベントにも退いた印');
}

// 5. おまかせ（指示なし）で最後まで回すと simulate() と同じタイムライン（同じ種）
{
  const a = scene(); const ra = Battle.simulate(a.p, a.e, { rations: rations(), seed: 11 });
  const c = scene(); const b = Battle.start(c.p, c.e, { rations: rations(), seed: 11 });
  let step = b.next(); let n = 0;
  while (step.type !== 'end' && n++ < 40) step = b.next({});
  const key = r => r.timeline.map(e => `${e.type}:${e.dmg || ''}:${e.toId || e.unitId || ''}`).join('|');
  assert(step.type === 'end' && key(step.result) === key(ra), 'おまかせで回した結果は simulate と一致する');
}

// 6. 敵の大技：2ラウンド目以降にたまに構え、その次のラウンドに×1.8。構えた敵は指示の材料に intent: "big"
{
  const found = (() => {
    for (let seed = 1; seed < 200; seed++) {
      const p = [mk('タンク', [], 'player', { hp: 900, atk: 3, def: 8, spd: 2, spirit: 1 })];
      const e = [mk('兵', [], 'enemy', { race: '人間', hp: 600, atk: 10, def: 2, spd: 7 })];
      const b = Battle.start(p, e, { rations: rations(), seed });
      let step = b.next(); let n = 0;
      while (step.type === 'commands' && n++ < 12) {
        if (step.enemies.some(x => x.intent === 'big')) {
          const before = b.timeline.length;
          b.next({ p0: { cmd: 'guard' } });
          const hit = b.timeline.slice(before).find(ev => ev.type === 'attack' && ev.fromId === 'e0');
          return { seed, hit };
        }
        step = b.next({});
      }
    }
    return null;
  })();
  assert(!!found, '構えを見せる敵が現れる（intent: big）');
  if (found) assert(found.hit && found.hit.traits.includes('大技') && found.hit.traits.includes('まもる'), '構えの次のラウンドに大技が来て、まもるで受けられる');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全通過');
process.exit(failed ? 1 : 0);
