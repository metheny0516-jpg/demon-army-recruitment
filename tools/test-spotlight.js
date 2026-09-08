// 戦果1文の材料（Spotlight・チケットB1）。
//
// 守りたい性質:
//   1. 証拠が揃ったときだけ出る。片端しか無い接続は候補にしない（反実仮想を言わない）
//   2. 返すのは事実だけで、日本語の文は作らない（見せ方はUIの担当）
//   3. 根拠イベントIDが必ず実在のイベントを指す（あとから追跡できる）
//   4. 保存して読み直せる（関数・循環を持ち込まない）
//   5. 実戦のタイムラインでも動く
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js', 'src/data/monsters.js', 'src/data/promotions.js',
  'src/data/synergies.js', 'src/data/enemies.js', 'src/data/battle_happenings.js',
  'src/core/util.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/spotlight.js'];
const ctx = { console, Math: Object.create(Math), Date, JSON };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Spotlight = vm.runInContext('Spotlight', ctx);
const Battle = vm.runInContext('Battle', ctx);
const U = vm.runInContext('U', ctx);
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); console.log(`✓ ${m}`); };

// 手組みのタイムライン。戦闘計算を通さずに「証拠の有無」だけを見る。
const start = (player, enemy) => ({ type: 'battle_start', eventId: 'e0',
  player: player.map(([id, name]) => ({ id, name })), enemy: enemy.map(([id, name]) => ({ id, name })) });

console.log('▼ 証拠が揃わないものは候補にしない');
{
  assert(Spotlight.of([]) === null, '空のタイムラインは null');
  assert(Spotlight.of(null) === null, 'null も null（落ちない）');
  // 金貨は出たが、誰も反応していない
  assert(Spotlight.of([
    start([['p0', 'グルグ']], [['x0', '衛兵']]),
    { type: 'resource_gain', eventId: 'e1', chainId: 'e1', sourceId: 'p0', resource: 'gold', amount: 1, label: '追い剥ぎ' }
  ]) === null, '金貨が出ただけ（反応なし）では1文にしない');
  // 反応の宣言はあるが、実際の攻撃になっていない
  assert(Spotlight.of([
    start([['p0', 'グルグ'], ['p1', 'ボル']], [['x0', '衛兵']]),
    { type: 'resource_gain', eventId: 'e1', chainId: 'e1', sourceId: 'p0', resource: 'gold', amount: 1, label: '追い剥ぎ' },
    { type: 'trait_trigger', eventId: 'e2', parentEventId: 'e1', sourceId: 'p1', traitId: 'greedy', name: '強欲' }
  ]) === null, '「反応した」宣言だけで攻撃が無ければ1文にしない');
  // 料理で強化したが、本人が一度も殴っていない
  assert(Spotlight.of([
    start([['p0', 'ミミ'], ['p1', 'ドン']], [['x0', '騎士']]),
    { type: 'trait_trigger', eventId: 'e1', traitId: 'demon_cook', name: '魔界料理人',
      sourceId: 'p0', targetId: 'p1', amountPercent: 24 }
  ]) === null, '料理で強化しても着地の一撃が無ければ1文にしない');
  // 他者蘇生したが、復帰後に何もしていない
  assert(Spotlight.of([
    start([['p0', 'ネル'], ['p1', 'ガロ']], [['x0', '騎士']]),
    { type: 'revive', eventId: 'e1', unitId: 'p1', sourceId: 'p0', traitId: 'necromancy' }
  ]) === null, '蘇生しても復帰後の行動が無ければ1文にしない');
  // 自力復活（執念）は人材どうしの接続ではない
  assert(Spotlight.of([
    start([['p1', 'ガロ']], [['x0', '騎士']]),
    { type: 'revive', eventId: 'e1', unitId: 'p1', sourceId: 'p1', traitId: 'tenacity' },
    { type: 'attack', eventId: 'e2', fromId: 'p1', toId: 'x0', dmg: 9 }
  ]) === null, '自力復活は「人材どうしの接続」ではないので出さない');
}

console.log('▼ 略奪 → 追撃');
{
  const got = Spotlight.of([
    start([['p0', 'グルグ'], ['p1', 'ボル']], [['x0', '衛兵']]),
    { type: 'resource_gain', eventId: 'e1', chainId: 'e1', sourceId: 'p0', resource: 'gold', amount: 1, label: '追い剥ぎ' },
    { type: 'trait_trigger', eventId: 'e2', parentEventId: 'e1', sourceId: 'p1', traitId: 'greedy', name: '強欲' },
    { type: 'attack', eventId: 'e3', parentEventId: 'e2', fromId: 'p1', toId: 'x0', dmg: 44, dead: true }
  ]);
  assert(got.kind === 'loot_relay', '種別は loot_relay');
  assert(got.origin.name === 'グルグ' && got.originAbility === '追い剥ぎ', '起点は金貨を出した人と、その能力名');
  assert(got.actor.name === 'ボル' && got.ability.name === '強欲', '反応したのは別人で、能力名も出る');
  assert(got.target.name === '衛兵' && got.numbers.dmg === 44 && got.numbers.killed === true, '着地の相手・ダメージ・撃破が出る');
  assert(got.sameActor === false, '別人どうしの接続だと分かる');
  assert(!('text' in got) && !JSON.stringify(got).includes('を受け'), '日本語の文は作らない（見せ方はUIの担当）');
}

console.log('▼ 料理 → 強化 → 撃破');
{
  const got = Spotlight.of([
    start([['p0', 'ミミ'], ['p1', 'ドン']], [['x0', '騎士']]),
    { type: 'trait_trigger', eventId: 'e1', traitId: 'demon_cook', name: '魔界料理人',
      sourceId: 'p0', targetId: 'p1', amountPercent: 24 },
    { type: 'attack', eventId: 'e2', fromId: 'p1', toId: 'x0', dmg: 65, dead: true,
      mealBoost: { first: true, amountPercent: 24 } }
  ]);
  assert(got.kind === 'meal_boost' && got.origin.name === 'ミミ' && got.actor.name === 'ドン', '料理人と強化された人が別々に出る');
  assert(got.numbers.percent === 24 && got.numbers.killed === true, '効果量と撃破が出る');
}

console.log('▼ 蘇生 → 復帰後の行動');
{
  const got = Spotlight.of([
    start([['p0', 'ネル'], ['p1', 'ガロ']], [['x0', '騎士']]),
    { type: 'revive', eventId: 'e1', unitId: 'p1', sourceId: 'p0', traitId: 'necromancy' },
    { type: 'attack', eventId: 'e2', fromId: 'p1', toId: 'x0', dmg: 7 },
    { type: 'attack', eventId: 'e3', fromId: 'p1', toId: 'x0', dmg: 8 }
  ]);
  assert(got.kind === 'revive_return' && got.origin.name === 'ネル' && got.actor.name === 'ガロ', '蘇生した人と復帰した人が別々に出る');
  assert(got.numbers.actions === 2 && got.numbers.dmg === 15, '復帰後に何回動いたかを数える');
  assert(got.numbers.killed === false, '撃破していないなら撃破とは書かせない');
}

console.log('▼ 複数あるときは「結果がどこまで届いたか」で選ぶ');
{
  const timeline = [
    start([['p0', 'ネル'], ['p1', 'ガロ'], ['p2', 'グルグ'], ['p3', 'ボル']], [['x0', '騎士']]),
    // 蘇生 → 復帰後1回だけ（撃破なし）
    { type: 'revive', eventId: 'e1', unitId: 'p1', sourceId: 'p0', traitId: 'necromancy' },
    { type: 'attack', eventId: 'e2', fromId: 'p1', toId: 'x0', dmg: 3 },
    // 略奪 → 追撃で撃破
    { type: 'resource_gain', eventId: 'e3', chainId: 'e3', sourceId: 'p2', resource: 'gold', amount: 1, label: '追い剥ぎ' },
    { type: 'trait_trigger', eventId: 'e4', parentEventId: 'e3', sourceId: 'p3', traitId: 'greedy', name: '強欲' },
    { type: 'attack', eventId: 'e5', parentEventId: 'e4', fromId: 'p3', toId: 'x0', dmg: 40, dead: true }
  ];
  const got = Spotlight.of(timeline);
  assert(got.kind === 'loot_relay', '撃破まで届いたほうを選ぶ');
  assert(got.candidateCount === 2, '候補が何件あったかも返す（1件だけ見せる判断の根拠）');
}

console.log('▼ 根拠と保存');
{
  const timeline = [
    start([['p0', 'グルグ'], ['p1', 'ボル']], [['x0', '衛兵']]),
    { type: 'resource_gain', eventId: 'e1', chainId: 'e1', sourceId: 'p0', resource: 'gold', amount: 1, label: '追い剥ぎ' },
    { type: 'trait_trigger', eventId: 'e2', parentEventId: 'e1', sourceId: 'p1', traitId: 'greedy', name: '強欲' },
    { type: 'attack', eventId: 'e3', parentEventId: 'e2', fromId: 'p1', toId: 'x0', dmg: 44, dead: true }
  ];
  const got = Spotlight.of(timeline);
  const ids = new Set(timeline.map(e => e.eventId));
  assert(got.evidence.length >= 2 && got.evidence.every(id => ids.has(id)),
    '根拠イベントIDが実在のイベントを指す（あとから追跡できる）');
  assert(JSON.stringify(JSON.parse(JSON.stringify(got))) === JSON.stringify(got), '保存して読み直せる形になっている');
  assert(got.defVersion === 1, '出力契約のバージョンが乗る');
  const before = JSON.stringify(timeline);
  Spotlight.of(timeline);
  assert(JSON.stringify(timeline) === before, 'タイムラインを書き換えない（読むだけ）');
}

console.log('▼ 実戦のタイムラインで動く');
{
  const mk = (name, traits, atk, spd, race) => Battle.makeUnit({
    name, race, tplId: 'goblin', traits, atk, spd, hp: 80, def: 0, salary: 2, loyalty: 100, tags: [] }, 'player');
  const player = [mk('グルグ', ['pickpocket'], 6, 30, 'ゴブリン'),
    mk('欲張りギギ', ['pickpocket', 'greedy'], 18, 20, 'ゴブリン'),
    mk('大槌のボル', ['greedy'], 90, 8, 'オーガ')];
  const enemy = [1, 2, 3].map(i => Battle.makeUnit({ name: '衛兵' + i, icon: '🗡',
    hp: 20, atk: 3, def: 0, spd: 1, traits: [], tags: [], loyalty: 100 }, 'enemy'));
  const old = { rand: U.rand, chance: U.chance, pick: U.pick };
  let fight;
  try {
    U.rand = () => .5; U.chance = p => p >= .5; U.pick = a => a[0];
    fight = Battle.simulate(player, enemy, { synergyPool: player });
  } finally { Object.assign(U, old); }
  const got = Spotlight.of(fight.timeline);
  assert(got !== null, '実戦のタイムラインから1件取れる');
  const ids = new Set(fight.timeline.map(e => e.eventId));
  assert(got.evidence.every(id => ids.has(id)), '実戦でも根拠が実在のイベントを指す');
  console.log(`  （実戦の1件: ${got.kind} ${got.origin.name} → ${got.actor.name} dmg=${got.numbers.dmg} 撃破=${got.numbers.killed}）`);
}

console.log('✓ 戦果1文の材料：証拠が無ければ出さない・事実だけ・追跡できる');
