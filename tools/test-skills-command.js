// 技（SKILLS）と敵の役割（2026-09-12）・battle.js 側。仕様 docs/SPEC_SKILLS_2026-09-12.md 3節・5節。
//   node tools/test-skills-command.js
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/skill_effects.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Battle = vm.runInContext('Battle', ctx);
const U = vm.runInContext('U', ctx);
const SKILLS = vm.runInContext('SKILLS', ctx);
const ENEMY_BIG_MOVE = vm.runInContext('ENEMY_BIG_MOVE', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, x, side) => Battle.makeUnit(Object.assign({
  uid: name, name, race: 'オーク', hp: 80, atk: 10, def: 3, spd: 5, traits: [], tags: [], loyalty: 80, spirit: 3 }, x || {}), side || 'player');
const rations = () => ({ consumed: 3, need: 3, shortage: 0, emptied: false, bigEaterUids: [], cookUid: null, hungerUid: null, feastUid: null });
const opts = (x) => Object.assign({ rations: rations(), seed: 7 }, x || {});
const foes = (n, x) => Array.from({ length: n }, (_, i) => mk('兵' + i, Object.assign({ race: '人間', hp: 120, atk: 6, def: 1, spd: 3 + i, spirit: undefined }, x || {}), 'enemy'));
const events = (h, type) => h.timeline.filter(e => e.type === type);
const startWith = (p, e, x) => { const h = Battle.start(p, e, opts(x)); return { h, prompt: h.next() }; };
const finish = h => { let g = 0; while (!h.done && g++ < 60) h.next({}); return h.result; };
// 敵の大技は乱数で入るので、狙った検証では止める
const bigChance = ENEMY_BIG_MOVE.chance;

console.log('▼ 1. 指示窓の材料：技の一覧（種族技→上位技）、理由、互換の skill');
{
  ENEMY_BIG_MOVE.chance = 0;
  const p = [mk('ガロ', { skills: ['ogre_smash'], traits: ['ogre_charge'], spirit: 1 }), mk('ネク', { skills: ['necro_hand'], spirit: 3 }), mk('王', { skills: ['king_wave'], hp: 100, spirit: 3 })];
  p[2].hp = 30;
  const { prompt } = startWith(p, foes(2));
  const g = prompt.allies[0];
  assert(g.skills.length === 2 && g.skills[0].id === 'ogre_smash' && g.skills[1].id === 'ogre_charge', `種族技→上位技の順（${g.skills.map(s => s.id).join(',')}）`);
  assert(g.skill && g.skill.id === 'ogre_smash', 'skill（互換）は先頭');
  assert(g.skills[0].ready && /命中70%/.test(g.skills[0].note) && g.skills[0].cost === 1, '振り下ろすは選べて、一行の説明と気合1');
  assert(!g.skills[1].ready && g.skills[1].why === '気合不足', `上位技（気合3）は気合1では「気合不足」（${g.skills[1].why}）`);
  const n = prompt.allies[1];
  assert(!n.skills[0].ready && n.skills[0].why === '条件外', `死者の手は倒れた者がいなければ条件外（${n.skills[0].why}）`);
  assert(!prompt.allies[2].skills[0].ready && prompt.allies[2].skills[0].why === '条件外', '大波はHP50%未満なら条件外');
  assert(Array.isArray(prompt.fallen) && prompt.fallen.length === 0, 'fallen（倒れた味方）が載る');
  assert(prompt.enemies.every(e => e.role === 'fighter' && e.intent === 'attack'), '敵の役割の既定は fighter');
}

console.log('▼ 2. 振り下ろす：気合を払い、最後に動き、×2.0。外れることもある');
{
  let hits = 0, misses = 0, lastOk = true, paid = true;
  for (let seed = 1; seed <= 30; seed++) {
    const p = [mk('ガロ', { skills: ['ogre_smash'], spd: 20, atk: 10, spirit: 2 })];
    const e = foes(2, { hp: 400, atk: 1 });
    const h = Battle.start(p, e, opts({ seed }));
    h.next();
    h.next({ p0: { cmd: 'skill', skill: 'ogre_smash', target: 'e1' } });
    if (p[0].spirit !== 1) paid = false;
    const r1 = h.timeline.filter(ev => ev.round === undefined ? true : true);
    const atk = events(h, 'attack').filter(ev => ev.fromId === 'p0' && ev.label === '振り下ろす');
    const miss = events(h, 'note').filter(ev => ev.skillMiss);
    if (atk.length) { hits++; if (atk[0].toId !== 'e1') lastOk = false; if (atk[0].dmg < 15) lastOk = false; }
    else if (miss.length) misses++;
    // 最後に動く：ラウンド1で p0 の攻撃イベントが敵の攻撃より後
    const round1 = h.timeline.slice(h.timeline.findIndex(ev => ev.type === 'round_start'));
    const iMine = round1.findIndex(ev => ev.fromId === 'p0' || (ev.type === 'note' && ev.skillMiss));
    const iFoe = round1.findIndex(ev => ev.type === 'attack' && ev.fromId && ev.fromId.startsWith('e'));
    if (iMine >= 0 && iFoe >= 0 && iMine < iFoe) lastOk = false;
  }
  assert(paid, '気合1を払う（2→1）');
  assert(hits > 0 && misses > 0 && hits + misses === 30, `当たり${hits}・外れ${misses}（命中70%）`);
  assert(lastOk, '狙った敵に×2.0級のダメージ、速度20でも最後に動く');
}

console.log('▼ 3. 火球：敵全体に当たり、次のラウンドは息切れ。鬨の声：味方全員+30%（本人は身構える）');
{
  const p = [mk('ミラ', { skills: ['mage_fireball'], spd: 9 }), mk('ポン', { skills: ['goblin_warcry'], spd: 8 }), mk('ガロ', { spd: 1, atk: 10 })];
  const e = foes(3, { hp: 500, atk: 1 });
  const h = Battle.start(p, e, opts({ seed: 3 }));
  h.next();
  h.next({ p0: { cmd: 'skill' }, p1: { cmd: 'skill' }, p2: { cmd: 'attack', target: 'e0' } });
  const fire = events(h, 'attack').filter(ev => ev.fromId === 'p0' && ev.label === '火球');
  assert(fire.length === 3, `火球が敵3体に当たる（${fire.length}）`);
  assert(p[0].flags.winded === true, '火球のあと息切れ');
  const garo = events(h, 'attack').find(ev => ev.fromId === 'p2');
  assert(garo && garo.traits.includes('鬨の声'), `鬨の声がガロの一撃に乗る（${garo && garo.traits.join('/')}）`);
  assert(!events(h, 'attack').some(ev => ev.fromId === 'p1'), '鬨の声を上げた本人はこのラウンド攻撃しない');
  const p2 = h.next({ p0: { cmd: 'attack' }, p1: { cmd: 'attack' }, p2: { cmd: 'attack' } });
  assert(events(h, 'note').some(ev => ev.winded && ev.unitId === 'p0'), 'ラウンド2でミラは息が上がって動かない');
  assert(!p[2].flags.buff, '鼓舞はラウンドの終わりに消える');
}

console.log('▼ 4. 骨の壁：味方をかばう（指示の直後から効く）。粘りつく：動けなくする／外すと殴られる');
{
  let covered = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const p = [mk('弱', { hp: 60, spd: 1, atk: 1 }), mk('骨', { skills: ['skeleton_wall'], hp: 200, spd: 2 })];
    const e = foes(1, { atk: 20, spd: 9 });
    const h = Battle.start(p, e, opts({ seed }));
    h.next();
    h.next({ p0: { cmd: 'attack' }, p1: { cmd: 'skill', target: 'p0' } });
    const hit = events(h, 'attack').find(ev => ev.fromId === 'e0');
    if (hit && hit.toId === 'p1') covered++;     // 直接狙われた回も、かばった回も、弱には届かない
  }
  assert(covered === 12, `敵の一撃は毎回、骨が受ける（${covered}/12）`);
  let stunned = 0, retaliated = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const p = [mk('ぷる', { skills: ['slime_cling'], spd: 9, hp: 300 })];
    const e = foes(1, { atk: 5, spd: 1, hp: 300 });
    const h = Battle.start(p, e, opts({ seed }));
    h.next();
    h.next({ p0: { cmd: 'skill' } });
    if (events(h, 'note').some(ev => ev.stunned)) stunned++;
    if (events(h, 'attack').some(ev => ev.fromId === 'e0' && ev.label === '反撃')) retaliated++;
  }
  assert(stunned > 10 && retaliated > 5 && stunned + retaliated === 40, `動けなくした${stunned}・振り払われて殴られた${retaliated}`);
}

console.log('▼ 5. 死者の手：倒れた味方を起こし、自分の身を削る。追い剥ぎ：金貨を予約');
{
  const p = [mk('弱', { hp: 5, spd: 1 }), mk('ネク', { skills: ['necro_hand'], hp: 100, spd: 5, spirit: 3 })];
  const e = foes(1, { atk: 30, spd: 9, hp: 300 });
  const h = Battle.start(p, e, opts({ seed: 2 }));
  h.next();
  let pr = h.next({ p0: { cmd: 'attack' }, p1: { cmd: 'attack' } });
  assert(!p[0].alive && pr.fallen.length === 1 && pr.fallen[0].id === 'p0', '弱が倒れ、fallen に載る');
  assert(pr.allies[0].skills[0].ready, '倒れた者がいれば死者の手は選べる');
  assert(p[1].spirit === 3 || p[1].spirit === 3, '（気合：弱が倒れて+1、上限3で据え置き）');
  h.next({ p1: { cmd: 'skill', target: 'p0' } });
  assert(p[0].alive && p[0].hp === 2 && events(h, 'revive').some(ev => ev.unitId === 'p0' && ev.sourceId === 'p1'), `弱がHP30%で起きる（HP ${p[0].hp}）`);
  assert(p[1].hp <= 80 && p[1].spirit === 1, `ネクは身を削り（HP ${p[1].hp}）、気合2を払う（残${p[1].spirit}）`);
  const q = [mk('チッチ', { skills: ['imp_rob'], spd: 9 })];
  const h2 = Battle.start(q, foes(1, { hp: 300, atk: 1 }), opts({ seed: 5 }));
  h2.next();
  let robbed = false;
  for (let i = 0; i < 3 && !robbed; i++) { h2.next({ p0: { cmd: 'skill' } }); robbed = events(h2, 'resource_gain').some(ev => ev.label === '追い剥ぎ' && ev.amount === 2); }
  assert(robbed, '追い剥ぎで2Gの略奪予約が出る');
}

console.log('▼ 6. 気合の増減：まもるで大技を受け切る+1、味方が倒れる+1。result.spiritGained');
{
  const p = [mk('盾', { hp: 300, spd: 1, spirit: 0 })];
  const e = foes(1, { atk: 10, spd: 9, hp: 500 });
  const h = Battle.start(p, e, opts({ seed: 1 }));
  h.next();
  h.next({ p0: { cmd: 'attack' } });
  e[0].flags.charging = true;             // 次のラウンドに大技
  h.next({ p0: { cmd: 'guard' } });
  const big = events(h, 'attack').find(ev => ev.fromId === 'e0' && ev.traits.includes('大技') && ev.traits.includes('まもる'));
  assert(!!big, '大技をまもるで受けた');
  assert(p[0].spirit === 1 && events(h, 'note').some(ev => ev.spiritGain === 1), `気合が0→1（${p[0].spirit}）`);
  const r = finish(h);
  assert(r.spiritGained && r.spiritGained['盾'] >= 1, `result.spiritGained に載る（${JSON.stringify(r.spiritGained)}）`);
}

console.log('▼ 7. 敵の役割：僧侶は仲間を癒やし、術士は偶数ラウンドに全体、盾役は守り、隊長は号令、弓は弱った者を狙う');
{
  const p = [mk('ガロ', { hp: 400, atk: 30, spd: 9 })];
  const e = [mk('騎士', { race: '人間', hp: 60, atk: 5, def: 0, spd: 5, role: 'fighter', spirit: undefined }, 'enemy'),
             mk('僧', { race: '人間', hp: 200, atk: 3, spd: 1, role: 'priest', spirit: undefined }, 'enemy')];
  const h = Battle.start(p, e, opts({ seed: 4 }));
  let pr = h.next();
  pr = h.next({ p0: { cmd: 'attack', target: 'e0' } });   // 騎士を殴って60%未満へ
  const hurt = e[0].hp < e[0].maxHp * 0.6;
  assert(hurt && pr.enemies.find(x => x.id === 'e1').intent === 'heal', `騎士が弱ると、次の指示窓で僧の intent が heal（${pr.enemies.map(x => x.intent).join('/')}）`);
  const before = e[0].hp;
  h.next({ p0: { cmd: 'guard' } });
  assert(events(h, 'heal').some(ev => ev.unitId === 'e0' && ev.sourceId === 'e1'), `僧が騎士を癒やす（${before}→${e[0].hp}）`);

  const p2 = [mk('A', { hp: 300, spd: 1, atk: 1 }), mk('B', { hp: 300, spd: 1, atk: 1 })];
  const e2 = [mk('術士', { race: '人間', hp: 300, atk: 10, spd: 9, role: 'caster', spirit: undefined }, 'enemy')];
  const h2 = Battle.start(p2, e2, opts({ seed: 4 }));
  h2.next();
  const pr2 = h2.next({ p0: { cmd: 'attack' }, p1: { cmd: 'attack' } });
  assert(pr2.enemies[0].intent === 'aoe', 'ラウンド2の指示窓で術士の intent が aoe');
  h2.next({ p0: { cmd: 'attack' }, p1: { cmd: 'attack' } });
  const aoe = events(h2, 'attack').filter(ev => ev.fromId === 'e0' && ev.label === '全体攻撃');
  assert(aoe.length === 2, `術士の全体攻撃が味方2人に当たる（${aoe.length}）`);

  const p3 = [mk('ガロ', { hp: 400, atk: 30, spd: 9 })];
  const e3 = [mk('盾兵', { race: '人間', hp: 300, atk: 5, spd: 5, role: 'shield', spirit: undefined }, 'enemy'),
              mk('弓', { race: '人間', hp: 100, atk: 5, spd: 1, role: 'archer', spirit: undefined }, 'enemy')];
  const h3 = Battle.start(p3, e3, opts({ seed: 4 }));
  h3.next();
  h3.next({ p0: { cmd: 'attack', target: 'e1' } });   // 弓を削る（100→約70）
  h3.next({ p0: { cmd: 'attack', target: 'e1' } });   // （→約40。半分以下になったので次のラウンドは盾兵がかばう）
  const pr3 = h3.prompt;
  h3.next({ p0: { cmd: 'attack', target: 'e1' } });
  const cover = events(h3, 'attack').find(ev => ev.fromId === 'p0' && ev.toId === 'e0' && ev.traits.includes('かばう'));
  assert(pr3.enemies.find(x => x.id === 'e0').intent === 'guard', `弓が半分を切ると、盾兵の intent が guard（${pr3.enemies.map(x => x.intent).join('/')}）`);
  assert(!!cover, `盾兵が弱った弓をかばう（弓HP ${e3[1].hp}）`);

  const p4 = [mk('前', { hp: 300, spd: 1, atk: 1 }), mk('後', { hp: 300, spd: 1, atk: 1 })];
  p4[1].hp = 30;
  const e4 = [mk('弓手', { race: '人間', hp: 300, atk: 5, spd: 9, role: 'archer', spirit: undefined }, 'enemy')];
  let back = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const q = [mk('前', { hp: 300, spd: 1, atk: 1 }), mk('後', { hp: 300, spd: 1, atk: 1 })]; q[1].hp = 30;
    const f = [mk('弓手', { race: '人間', hp: 300, atk: 5, spd: 9, role: 'archer', spirit: undefined }, 'enemy')];
    const hh = Battle.start(q, f, opts({ seed })); hh.next(); hh.next({ p0: { cmd: 'attack' }, p1: { cmd: 'attack' } });
    if (events(hh, 'attack').some(ev => ev.fromId === 'e0' && ev.toId === 'p1')) back++;
  }
  assert(back >= 12, `弓手は最も弱った者を狙う（20戦中${back}回、先頭60%の既定なら約6）`);

  const p5 = [mk('A', { hp: 300, spd: 1, atk: 1 })];
  const e5 = [mk('隊長', { race: '人間', hp: 300, atk: 10, spd: 9, role: 'commander', spirit: undefined }, 'enemy'),
              mk('兵', { race: '人間', hp: 300, atk: 10, spd: 5, spirit: undefined }, 'enemy')];
  const h5 = Battle.start(p5, e5, opts({ seed: 4 }));
  h5.next(); h5.next({ p0: { cmd: 'attack' } });
  const boosted = events(h5, 'attack').find(ev => ev.fromId === 'e1');
  assert(boosted && boosted.traits.includes('隊長の号令'), `隊長の号令が兵の一撃に乗る（${boosted && boosted.traits.join('/')}）`);
  ENEMY_BIG_MOVE.chance = bigChance;
}

console.log('▼ 8. 自動戦闘（simulate）は技を勝手に使わない。役割の無い敵は今までどおり');
{
  const p = [mk('ガロ', { skills: ['ogre_smash'] })];
  const r = Battle.simulate(p, foes(2), opts({ seed: 9 }));
  assert(!r.timeline.some(ev => ev.type === 'order_exec' && ev.species), '種族技は指示でだけ出る');
  assert(r.spiritGained !== undefined, 'result に spiritGained がある');
}

console.log('▼ 9. 差し込み口：SKILL_EFFECTS の新しい kind と ENEMY_ROLES の新しい role が呼ばれる');
{
  const FX = vm.runInContext('SKILL_EFFECTS', ctx), ROLES = vm.runInContext('ENEMY_ROLES', ctx);
  FX.test_drain = { resolve(c) { const t = c.pickEnemy(); const d = c.damage(t, 0.5, 'テスト吸収'); c.heal(c.unit, 0.1, 'テスト吸収'); c.note('　吸収した', 'trait'); } };
  FX.test_stance = { immediate(c) { c.unit.flags.guarding = true; } };
  ROLES.test_bomber = {
    plan(c, nextRound) { return nextRound === 2 ? { kind: 'bomb', intent: 'bomb', text: '爆薬を取り出した' } : undefined; },
    run(c, plan) { if (plan.kind !== 'bomb') return undefined; for (const p of c.enemies.filter(c.onField)) c.damage(p, 0.3, '爆発'); return true; }
  };
  SKILLS.test_drain = { name: 'テスト吸収', cost: 1, kind: 'test_drain', target: 'enemy', note: 'x' };
  SKILLS.test_stance = { name: 'テスト構え', cost: 1, kind: 'test_stance', target: 'none', note: 'x' };
  const p = [mk('A', { skills: ['test_drain', 'test_stance'], hp: 100, spd: 9 })];
  p[0].hp = 50;
  const e = [mk('爆弾兵', { race: '人間', hp: 300, atk: 5, spd: 1, role: 'test_bomber', spirit: undefined }, 'enemy')];
  const h = Battle.start(p, e, opts({ seed: 6 }));
  h.next();
  let pr = h.next({ p0: { cmd: 'skill', skill: 'test_drain' } });
  assert(events(h, 'attack').some(ev => ev.label === 'テスト吸収') && events(h, 'heal').some(ev => ev.label === 'テスト吸収'), '登録した kind の resolve が呼ばれる（damage/heal の道具が使える）');
  assert(pr.enemies[0].intent === 'bomb' && events(h, 'intent').some(ev => /爆薬/.test(ev.text)), `登録した role の plan が予告になる（${pr.enemies[0].intent}）`);
  h.next({ p0: { cmd: 'skill', skill: 'test_stance' } });
  const bomb = events(h, 'attack').find(ev => ev.label === '爆発');
  assert(bomb && bomb.traits.includes('まもる'), '登録した role の run が動き、immediate の構え（まもる）が効いている');
  delete SKILLS.test_drain; delete SKILLS.test_stance; delete FX.test_drain; delete FX.test_stance; delete ROLES.test_bomber;
}

console.log('▼ 10. お披露目：覚えた直後の戦いでは上位技が光り、一度だけ気合なし。勝手には出ない（手動）。自動では今までどおり出る');
{
  ENEMY_BIG_MOVE.chance = 0;
  const mkDebut = () => mk('ガロ', { traits: ['ogre_charge'], debutSkill: 'ogre_charge', spirit: 0, atk: 10, spd: 9, hp: 300 });
  const p = [mkDebut()];
  const e = foes(3, { hp: 400, atk: 1 });
  const h = Battle.start(p, e, opts({ seed: 11 }));
  const pr = h.next();
  const sk = pr.allies[0].skills.find(x => x.id === 'ogre_charge');
  assert(sk && sk.debut === true && sk.cost === 0 && sk.ready === true, `お披露目の技は気合0でも選べて cost 0（debut=${sk && sk.debut}, cost=${sk && sk.cost}）`);
  h.next({ p0: { cmd: 'attack' } });
  assert(!events(h, 'trait_trigger').some(ev => ev.traitId === 'ogre_charge'), 'たたかうを選んだラウンドでは勝手に出ない（手動）');
  const pr2 = h.prompt;
  h.next({ p0: { cmd: 'skill', skill: 'ogre_charge' } });
  const ex = events(h, 'order_exec').find(ev => ev.skillId === 'ogre_charge');
  assert(ex && ex.debut === true && ex.cost === 0 && p[0].spirit === 0, 'お披露目で撃つと気合を払わない');
  assert(events(h, 'trait_trigger').some(ev => ev.traitId === 'ogre_charge') && events(h, 'splash').filter(ev => ev.label === 'ぶちかまし').length >= 2, 'ぶちかましが必ず出る（他の敵にも及ぶ）');
  const pr3 = h.prompt;
  const sk3 = pr3 && pr3.allies[0] && pr3.allies[0].skills.find(x => x.id === 'ogre_charge');
  assert(sk3 && sk3.debut === false && sk3.cost === 3 && sk3.ready === false && sk3.why === '気合不足', `2回目からは通常の気合（cost=${sk3 && sk3.cost}, ${sk3 && sk3.why}）`);
  const r = finish(h);
  assert(Array.isArray(r.debutShown) && r.debutShown.includes('ガロ'), 'result.debutShown に載る');
  const auto = Battle.simulate([mkDebut()], foes(3, { hp: 400, atk: 1 }), opts({ seed: 11 }));
  assert(auto.timeline.some(ev => ev.type === 'trait_trigger' && ev.traitId === 'ogre_charge'), '自動戦闘（simulate）では今までどおり勝手に1回出る');
  ENEMY_BIG_MOVE.chance = bigChance;
}

console.log('▼ 11. 演出プリセット（fx）：技のイベントに skillId と fx が載る。通常攻撃には載らない');
{
  ENEMY_BIG_MOVE.chance = 0;
  const p = [mk('ガロ', { skills: ['orc_cleave'], spd: 9 }), mk('ミラ', { skills: ['mage_fireball'], spd: 8 }), mk('ポン', { skills: ['goblin_warcry'], spd: 7 }), mk('ゴロム', { skills: ['troll_rest'], spd: 6, hp: 100 })];
  p[3].hp = 40;
  const e = foes(3, { hp: 500, atk: 1 });
  const h = Battle.start(p, e, opts({ seed: 12 }));
  h.next();
  h.next({ p0: { cmd: 'skill', target: 'e0' }, p1: { cmd: 'skill' }, p2: { cmd: 'skill' }, p3: { cmd: 'skill' } });
  const cleave = events(h, 'attack').find(ev => ev.fromId === 'p0' && ev.label === '薙ぎ払い');
  assert(cleave && cleave.fx === 'heavy' && cleave.skillId === 'orc_cleave', `薙ぎ払い：fx heavy・skillId（${cleave && cleave.fx}）`);
  const fire = events(h, 'attack').filter(ev => ev.fromId === 'p1' && ev.label === '火球');
  assert(fire.length === 3 && fire.every(ev => ev.fx === 'fire' && ev.aoe === true), '火球：3体とも fx fire・aoe 印');
  const warcry = events(h, 'note').find(ev => ev.buff && ev.unitId === 'p2');
  assert(warcry && warcry.fx === 'aura' && Array.isArray(warcry.targets) && warcry.targets.length === 4, '鬨の声：fx aura と対象一覧');
  const rest = events(h, 'heal').find(ev => ev.unitId === 'p3');
  assert(rest && rest.fx === 'holy' && rest.skillId === 'troll_rest', '休む：heal に fx holy');
  const ex = events(h, 'order_exec').find(ev => ev.skillId === 'mage_fireball');
  assert(ex && ex.fx === 'fire' && ex.target === 'all_enemies', 'order_exec に fx と対象の種類');
  h.next({ p0: { cmd: 'attack' }, p1: { cmd: 'attack' }, p2: { cmd: 'attack' }, p3: { cmd: 'attack' } });
  const plain = events(h, 'attack').filter(ev => ev.fromId === 'p0' && !ev.label);
  assert(plain.length && plain.every(ev => !ev.fx && !ev.skillId), '通常攻撃には fx も skillId も無い');
  ENEMY_BIG_MOVE.chance = bigChance;
}

console.log(failed ? `\n失敗 ${failed}` : '\n全通過');
process.exitCode = failed ? 1 : 0;
