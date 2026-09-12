// node tools/test-skill-catalog.js — カタログ単体の境界と実戦差し込み口。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { SKILL_EFFECTS: FX, ENEMY_ROLES: ROLES } = require('../src/core/skill_effects');
const { SKILL_CATALOG: CATALOG } = require('../src/data/skills_catalog');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log(`✓ ${name}`); }
function unit(id, extra = {}) {
  return Object.assign({ id, uid: id, name: id, race: 'オーク', tplId: 'orc', side: id[0] === 'e' ? 'enemy' : 'player',
    hp: 100, maxHp: 100, atk: 20, def: 0, spd: 5, alive: true, flags: {}, mods: { dmgMult: 1, takenMult: 1 }, spirit: 0 }, extra);
}
function context(kind, extra = {}) {
  const u = unit('p0'), ally = unit('p1', { hp: 40 }), enemy = unit('e0'), rear = unit('e1', { spd: 2 });
  const c = { unit: u, skill: CATALOG[`catalog_${kind}`], cmd: {}, allies: [u, ally], enemies: [enemy, rear],
    round: 1, options: {}, timeline: [], calls: [], onField: a => a.alive && !a.flags.absent,
    rand: () => 0.5, chance: () => true, pick: a => a[0], ...extra };
  c.pickEnemy = () => c.enemies.find(a => a.id === c.cmd.targetId && c.onField(a)) || c.enemies.find(c.onField);
  c.lowestAlly = (a, except) => a.filter(x => c.onField(x) && x !== except).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
  c.applyDamage = (a, t, n, kind, opts) => {
    const dmg = Math.max(1, Math.round(n)); c.calls.push({ type: 'damage', attacker: a, target: t, dmg, opts });
    t.hp -= dmg; if (t.hp <= 0) { t.hp = 0; t.alive = false; } return { dmg };
  };
  c.damage = (t, mult, label) => c.applyDamage(c.unit, t, Math.max(1, c.unit.atk * mult - Math.floor(t.def / 2)), 'attack', { label }).dmg;
  c.heal = (t, ratio, label) => { const n = Math.min(t.maxHp - t.hp, Math.ceil(t.maxHp * ratio)); t.hp += n; c.calls.push({ type: 'heal', target: t, n, label }); return n; };
  c.act = (a, allies, enemies, round, opts) => c.applyDamage(a, opts.target, a.atk * (opts.mult || 1), 'attack', opts).dmg;
  c.emit = (type, event) => c.calls.push({ type, ...event });
  c.note = text => c.emit('note', { text });
  c.moveBack = (a, t) => { a.splice(a.indexOf(t), 1); a.push(t); };
  c.gainSpirit = (t, n) => { t.spirit = Math.min(3, t.spirit + n); };
  c.gainBattleResource = (u, resource, n) => c.calls.push({ type: 'loot', n });
  c.summon = spec => c.calls.push({ type: 'summon', spec });
  return c;
}
function use(c) { const fx = FX[c.skill.kind]; (fx.immediate || fx.resolve)(c); return c; }
const damage = c => c.calls.filter(x => x.type === 'damage');

test('drain: 実HP分だけ吸収・満タン上限', () => {
  const c = context('drain'); c.unit.hp = 50; c.enemies[0].hp = 10; use(c);
  assert.equal(c.unit.hp, 53); assert.equal(c.enemies[0].alive, false);
});
test('pierce: 防御999を無視し乱数道具を使う', () => {
  const c = context('pierce'); c.enemies[0].def = 999; let draws = 0; c.rand = () => { draws++; return 0.5; }; use(c);
  assert.equal(c.enemies[0].hp, 80); assert.equal(draws, 1);
});
test('double: 同一対象に二発、死亡後は追撃なし', () => {
  const c = use(context('double')); assert.equal(c.enemies[0].hp, 72); assert.equal(damage(c).length, 2);
  const d = context('double'); d.enemies[0].hp = 1; use(d); assert.equal(damage(d).length, 1);
});
test('execute: HP30%の境界と対象からの反撃', () => {
  const c = context('execute'); c.enemies[0].hp = 30; use(c); assert.equal(damage(c)[0].dmg, 60);
  const d = context('execute'); d.enemies[0].hp = 31; use(d); assert.equal(damage(d)[0].target, d.unit); assert.equal(d.enemies[0].hp, 31);
});
test('quake: 遅い順・元の敵列を保存・味方最後尾に巻き添え', () => {
  const c = use(context('quake')); assert.deepEqual(damage(c).map(x => x.target.id), ['e1', 'e0', 'p1']);
  assert.deepEqual(c.enemies.map(x => x.id), ['e0', 'e1']); assert.equal(c.allies[1].hp, 30);
});
test('mend_all: 生存者だけ回復・攻撃なし', () => {
  const c = context('mend_all'); c.allies.push(unit('p2', { alive: false, hp: 0 })); use(c);
  assert.equal(c.allies[1].hp, 55); assert.equal(c.unit.hp, 100); assert.equal(c.allies[2].hp, 0); assert.equal(damage(c).length, 0);
});
test('sacrifice: HP移譲・自殺なし・過剰支払いなし', () => {
  const c = use(context('sacrifice')); assert.equal(c.unit.hp, 50); assert.equal(c.allies[1].hp, 90);
  c.unit.hp = 1; use(c); assert.equal(c.unit.hp, 1);
  c.unit.hp = 100; c.allies[1].hp = 99; use(c); assert.equal(c.unit.hp, 99); assert.equal(c.allies[1].hp, 100);
});
test('wall_all: 全生存味方が即まもる', () => {
  const c = use(context('wall_all')); assert(c.allies.every(a => a.flags.guarding)); assert.equal(damage(c).length, 0);
});
test('gamble: 成功と専用反動はctx.chanceだけで分岐', () => {
  const c = use(context('gamble')); assert.equal(c.enemies[0].hp, 40);
  const d = context('gamble', { chance: p => { assert.equal(p, 0.5); return false; } }); use(d);
  assert.equal(d.unit.hp, 80); assert.equal(d.enemies[0].hp, 100); assert.equal(damage(d)[0].opts.incident, true);
});
test('rally_fallen: 無人時0.5・召喚を除いた戦闘不能数', () => {
  const c = use(context('rally_fallen')); assert.equal(damage(c)[0].dmg, 10);
  const d = context('rally_fallen'); d.allies.push(unit('p2', { alive: false }), unit('ps0', { alive: false, flags: { summoned: true } })); use(d);
  assert.equal(damage(d)[0].dmg, 30);
});
test('summon_minion: HP30%攻撃50%・一戦一回', () => {
  const c = context('summon_minion'); use(c); use(c);
  const calls = c.calls.filter(x => x.type === 'summon'); assert.equal(calls.length, 1);
  assert.equal(calls[0].spec.maxHp, 30); assert.equal(calls[0].spec.atk, 10);
});
test('disarm: 指定対象の攻撃だけ下げ、1を割らない', () => {
  const c = context('disarm'); c.cmd.targetId = 'e1'; c.enemies[1].atk = 2; use(c);
  assert.equal(c.enemies[1].atk, 1); assert.equal(c.enemies[0].atk, 20); assert.equal(damage(c).length, 0);
});
test('cleanse: 三状態だけ解除し、息切れの代償は残す', () => {
  const c = context('cleanse'); c.allies[1].flags = { stunned: true, charmed: true, burn: { at: 2 }, winded: true }; use(c);
  assert.deepEqual(c.allies[1].flags, { winded: true });
});
test('rescue: 指定味方を最後尾にかばい、自分は選べない', () => {
  const c = context('rescue'); c.allies.push(unit('p2')); c.cmd.targetId = 'p1'; use(c);
  assert.equal(c.allies.at(-1).id, 'p1'); assert.equal(c.unit.flags.covering, 'p1'); assert.equal(c.unit.flags.coverRatio, 0.6);
});
test('burn_touch: 生存対象だけ次R燃焼', () => {
  const c = use(context('burn_touch')); assert.equal(c.enemies[0].flags.burn.at, 2); assert.equal(c.enemies[0].flags.burn.source, c.unit);
  const d = context('burn_touch'); d.enemies[0].hp = 1; use(d); assert.equal(d.enemies[0].flags.burn, undefined);
});
test('shatter_guard: 攻撃前にまもる解除', () => {
  const c = context('shatter_guard'); c.enemies[0].flags.guarding = true; const hit = c.damage;
  c.damage = (t, m, l) => { assert.equal(t.flags.guarding, false); return hit(t, m, l); }; use(c); assert.equal(c.enemies[0].hp, 84);
});
test('spirit_gift: 自分以外に気合、上限3', () => {
  const c = use(context('spirit_gift')); assert.equal(c.allies[1].spirit, 1); assert.equal(c.unit.spirit, 0);
  c.allies[1].spirit = 3; use(c); assert.equal(c.allies[1].spirit, 3);
});
test('finishing_loot: この一撃で倒した時だけ予約', () => {
  const c = use(context('finishing_loot')); assert(!c.calls.some(x => x.type === 'loot'));
  const d = context('finishing_loot'); d.enemies[0].hp = 1; use(d); assert.equal(d.calls.find(x => x.type === 'loot').n, 1);
});
test('flank: 敵最後尾を狙い自分も最後尾へ', () => {
  const c = use(context('flank')); assert.equal(damage(c)[0].target.id, 'e1'); assert.equal(c.allies.at(-1), c.unit);
});
test('siphon_guard: 敵の鼓舞だけ消し自分はまもる', () => {
  const c = context('siphon_guard'); c.enemies[0].flags = { buff: { mult: 1.3 }, stunned: true }; use(c);
  assert.equal(c.enemies[0].flags.buff, undefined); assert.equal(c.enemies[0].flags.stunned, true); assert.equal(c.unit.flags.guarding, true);
});

// 実エンジン: カタログIDの解決、支払い、構え、行動順、同seed再現を検証。
const sandbox = { console, Math: Object.create(Math) };
sandbox.Math.random = () => { throw new Error('seedなしの乱数は禁止'); };
vm.createContext(sandbox);
for (const file of ['src/data/traits.js', 'src/data/skills.js', 'src/data/skills_catalog.js', 'src/data/battle_happenings.js',
  'src/data/monsters.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/core/util.js',
  'src/core/synergy.js', 'src/core/skill_effects.js', 'src/core/battle.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}
const Battle = vm.runInContext('Battle', sandbox);
vm.runInContext('ENEMY_BIG_MOVE.chance = 0', sandbox);
function battle(kind, role = 'fighter', seed = 7, extra = {}) {
  const mk = (id, side, x) => Battle.makeUnit({ uid: id, name: id, race: side === 'player' ? 'オーク' : '人間',
    hp: 500, atk: 20, def: 0, spd: side === 'player' ? 9 : 2, traits: [], tags: [], spirit: 3, loyalty: 80, ...x }, side);
  const p = [mk('hero', 'player', { skills: [`catalog_${kind}`] }), mk('mate', 'player', {})];
  p[0].hp = 350; p[1].hp = 250;
  const e = [mk('foe', 'enemy', { role }), mk('rear', 'enemy', { spd: 1 })];
  const h = Battle.start(p, e, { seed, rations: { consumed: 3, need: 3, shortage: 0, emptied: false, bigEaterUids: [] }, ...extra });
  h.next(); return { h, p, e };
}
test('全kind: 実戦でID解決と気合支払い・同seed再現', () => {
  for (const [id, sk] of Object.entries(CATALOG)) {
    assert(FX[sk.kind], id); assert(sk.lines.use.length >= 2 && sk.lines.use.length <= 3, id);
    assert(sk.lines.miss.length >= 2 && sk.lines.miss.length <= 3, id);
    assert([...sk.note].length <= 28, `${id}: ${[...sk.note].length}文字`); assert.equal(sk.species, '');
    const run = () => { const b = battle(sk.kind); b.h.next({ p0: { cmd: 'skill', skill: id, target: sk.target === 'ally' ? 'p1' : 'e0' }, p1: { cmd: 'guard' } }); return b; };
    const b = run(), other = run();
    assert(b.h.timeline.some(x => x.type === 'order_exec' && x.skillId === id), id);
    assert(b.p[0].spirit <= 3 - sk.cost, id);
    assert.equal(JSON.stringify(b.h.timeline), JSON.stringify(other.h.timeline), id);
  }
});
test('実戦: 即時防壁は敵攻撃を半減し、次R頭で消える', () => {
  const b = battle('wall_all'); b.h.next({ p0: { cmd: 'skill' }, p1: { cmd: 'attack' } });
  assert(b.h.timeline.some(x => x.type === 'attack' && x.fromId === 'e0' && x.traits.includes('まもる')));
  assert.equal(b.p[0].flags.guarding, false);
});
test('実戦: 最後順と命中失敗はエンジンが処理', () => {
  const b = battle('pierce'); b.h.next({ p0: { cmd: 'skill' }, p1: { cmd: 'guard' } });
  const hits = b.h.timeline.filter(x => x.type === 'attack'); assert.equal(hits.at(-1).fromId, 'p0');
  const data = vm.runInContext('SKILL_CATALOG', sandbox), old = data.catalog_drain.hit;
  try { data.catalog_drain.hit = 0; const d = battle('drain'); d.h.next({ p0: { cmd: 'skill' }, p1: { cmd: 'guard' } });
    assert(d.h.timeline.some(x => x.skillMiss)); assert(!d.h.timeline.some(x => x.type === 'heal')); assert.equal(d.p[0].spirit, 2);
  } finally { data.catalog_drain.hit = old; }
});

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freezeDeep);
  }
  return value;
}
test('mourning: 同族の戦死だけ。退職は対象外、長い名前も28字以内', () => {
  const c = context('mourning'); c.options = freezeDeep({ departed: [{ race: 'オーク', cause: 'retired', name: '先輩' }] }); use(c);
  assert.equal(damage(c)[0].dmg, 20);
  const d = context('mourning'); d.options = freezeDeep({ departed: [{ race: 'オーク', cause: 'fallen', name: '長'.repeat(50) }] }); use(d);
  assert.equal(damage(d)[0].dmg, 30); assert(d.calls.filter(x => x.type === 'note').every(x => [...x.text].length <= 28));
});
test('carried_debt: subject本人・object恩人のuid照合、未記録ならかばわない', () => {
  const c = context('carried_debt'); c.options = freezeDeep({ traces: [{ kind: 'carried', subject: 'p0', object: 'p1', data: {} }] }); use(c);
  assert.equal(c.unit.flags.covering, 'p1'); assert.equal(c.unit.flags.coverRatio, 0.6);
  for (const object of [null, '不在']) {
    const d = context('carried_debt'); d.options = freezeDeep({ traces: [{ kind: 'carried', subject: 'p0', object }] }); use(d);
    assert.equal(d.unit.flags.covering, undefined);
  }
});
test('veteran: 本人のdownedのみ、50%上限、uidなしで他人の履歴を使わない', () => {
  const c = context('veteran'); c.options = freezeDeep({ traces: Array.from({ length: 9 }, () => ({ kind: 'downed', subject: 'p0' })) }); use(c);
  assert.equal(damage(c)[0].dmg, 30);
  const d = context('veteran'); d.unit.uid = null; d.options = freezeDeep({ traces: [{ kind: 'downed', subject: null }] }); use(d);
  assert.equal(damage(d)[0].dmg, 20);
});
test('relic_weight: 遺物数・今R期限・強い鼓舞を保存・入力不変', () => {
  const c = context('relic_weight'); c.options = freezeDeep({ relics: [{ id: 'a' }, { id: 'b' }] });
  c.allies[1].flags.buff = { mult: 1.5, until: 3, name: '強い鼓舞' }; use(c);
  assert.equal(c.unit.flags.buff.mult, 1.1); assert.equal(c.unit.flags.buff.until, 1); assert.equal(c.allies[1].flags.buff.mult, 1.5);
  assert.equal(c.allies[1].flags.buff.until, 3);
});
test('carried_resolve: 現行carried(object=null)で発動、他人の記録は使わない', () => {
  const c = context('carried_resolve'); c.options = freezeDeep({ traces: [{ kind: 'carried', subject: 'p0', object: null, data: { army: '討伐軍' } }] }); use(c);
  assert.equal(c.unit.flags.covering, 'p1'); assert.equal(c.unit.flags.coverRatio, 0.4);
  const d = context('carried_resolve'); d.options = c.options; d.unit.uid = '別人'; use(d); assert.equal(d.unit.flags.covering, undefined);
});
test('全痕跡kind: options未指定相当で安全、凍結済み履歴を変更しない', () => {
  const options = freezeDeep({ traces: [{ kind: 'downed', subject: 'hero' }, { kind: 'carried', subject: 'hero', object: 'mate' }],
    departed: [{ cause: 'fallen', race: 'オーク', name: '古参' }], relics: [{ id: '剣' }] });
  const before = JSON.stringify(options);
  for (const kind of ['mourning', 'carried_debt', 'veteran', 'relic_weight', 'carried_resolve']) {
    use(context(kind));
    const b = battle(kind, 'fighter', 7, options); b.h.next({ p0: { cmd: 'skill' }, p1: { cmd: 'guard' } });
    assert.equal(JSON.stringify(options), before);
    if (kind === 'relic_weight') assert.equal(b.p[0].flags.buff, undefined, '実戦のラウンド末で鼓舞解除');
    if (kind === 'carried_debt' || kind === 'carried_resolve') assert(b.h.timeline.some(x => x.type === 'note' && /かばった/.test(x.text)));
  }
});

test('bomber: 2R予告と待機、3R全体80%、4Rは通常', () => {
  const c = context('double'), role = ROLES.bomber;
  assert.equal(role.plan(c, 1), null); const prime = role.plan(c, 2); assert.equal(prime.text, '導火線に火をつけた');
  assert.equal(role.run(c, prime), true); assert.equal(damage(c).length, 0);
  assert.equal(role.run(c, role.plan(c, 3)), true); assert.equal(damage(c).length, 2); assert(damage(c).every(x => x.dmg === 16));
  assert.equal(role.plan(c, 4), null);
});
test('summoner: HP半分で一回だけ。予告後に回復していたら召喚しない', () => {
  const c = context('double'), role = ROLES.summoner; assert.equal(role.plan(c, 1), null);
  c.unit.hp = 50; const plan = role.plan(c, 2); assert.equal(plan.intent, 'summon');
  role.run(c, plan); role.run(c, plan); assert.equal(c.calls.filter(x => x.type === 'summon').length, 1);
  assert.equal(role.plan(c, 3), null);
  const d = context('double'); role.run(d, plan); assert(!d.calls.some(x => x.type === 'summon'));
});
test('assassin: HP割合が最低の生存者を実行時に再選択', () => {
  const c = context('double'), role = ROLES.assassin; c.enemies[1].hp = 40;
  const plan = role.plan(c, 1); assert.equal(plan.targetId, 'e1');
  c.enemies[1].alive = false; role.run(c, plan); assert.equal(damage(c)[0].target.id, 'e0'); assert.equal(damage(c)[0].dmg, 26);
});
test('berserker: 傷の割合で今R鼓舞を更新、回復すれば倍率も下がる', () => {
  const c = context('double'), role = ROLES.berserker; c.unit.hp = 25;
  role.run(c, role.plan(c, 1)); assert.equal(c.unit.flags.buff.mult, 1.75); assert.equal(c.unit.flags.buff.until, 1);
  c.unit.hp = 100; c.round = 2; role.run(c, role.plan(c, 2)); assert.equal(c.unit.flags.buff.mult, 1);
});
test('healer_guard: 30%境界で仲間回復、それ以外はguard予告', () => {
  const c = context('double'), role = ROLES.healer_guard;
  const guard = role.plan(c, 1); assert.equal(guard.kind, 'guard'); role.run(c, guard); assert.equal(c.unit.flags.guarding, true);
  c.allies[1].hp = 30; const heal = role.plan(c, 2); assert.equal(heal.targetId, 'p1'); role.run(c, heal); assert.equal(c.allies[1].hp, 55);
});
test('duelist: 最初の攻撃元を保持し、後の攻撃元へ乗り換えない', () => {
  const c = context('double'), role = ROLES.duelist; c.timeline = [
    { type: 'attack', fromId: 'e1', toId: 'p0' }, { type: 'attack', fromId: 'e0', toId: 'p0' }];
  const plan = role.plan(c, 2); assert.equal(plan.targetId, 'e1'); role.run(c, plan); assert.equal(damage(c)[0].target.id, 'e1');
  c.enemies[1].alive = false; assert.equal(role.plan(c, 3), null); assert.equal(role.run(c, plan), false);
});
test('全role: planは乱数・戦場・履歴を変更せず、無関係な計画を処理しない', () => {
  for (const [id, role] of Object.entries(ROLES)) {
    const c = context('double'); c.rand = c.chance = c.pick = () => { throw new Error('予告は乱数禁止'); };
    c.unit.hp = 20;
    freezeDeep(c.allies); freezeDeep(c.enemies); freezeDeep(c.timeline); freezeDeep(c.options);
    assert.doesNotThrow(() => role.plan(c, 2), id); assert.equal(role.run(c, { kind: 'unrelated' }), undefined, id);
  }
});
test('実戦: 六役割の予告・行動・同seed再現', () => {
  for (const id of Object.keys(ROLES)) {
    const run = () => {
      const b = battle('double', id);
      if (id === 'summoner') b.e[0].hp = 230;
      if (id === 'healer_guard') b.e[1].hp = 100;
      for (let round = 1; round <= 3 && !b.h.done; round++) b.h.next({ p0: { cmd: 'attack', target: 'e0' }, p1: { cmd: 'guard' } });
      return b;
    };
    const b = run(), events = b.h.timeline;
    assert.equal(JSON.stringify(events), JSON.stringify(run().h.timeline), id);
    assert(events.some(x => x.type === 'intent' && x.unitId === 'e0'), id);
    if (id === 'bomber') assert.equal(events.filter(x => x.type === 'attack' && x.label === '爆薬投げ').length, 2);
    if (id === 'summoner') assert.equal(events.filter(x => x.type === 'summon' && x.sourceUnitId === 'e0').length, 1);
    if (id === 'assassin') assert(events.some(x => x.type === 'attack' && x.label === '急所狙い' && x.toId === 'p1'));
    if (id === 'berserker') assert(events.some(x => x.type === 'attack' && x.label === '怒りの一撃' && x.traits.includes('傷の怒り')));
    if (id === 'healer_guard') assert(events.some(x => x.type === 'heal' && x.label === '救急の祈り'));
    if (id === 'duelist') assert(events.some(x => x.type === 'attack' && x.label === '一騎打ち' && x.toId === 'p0'));
  }
});

console.log(`カタログ ${tests}テスト通過`);
