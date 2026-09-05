// 戦闘の尺が「事件の大きさ」に比例するか（GAME_DESIGN_PRINCIPLES 第3節）。
//
// 見ているのは「予算を守れているか」ではなく、
// 「縮められたのが通常攻撃と無反応区間だけか」「大きい事件が長くなるか」という性質。
// BattleScene.plan() は純関数なので DOM 無しで直接呼べる。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js',
  'src/core/run.js', 'src/ui/battle_scene.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: k => k in store ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Battle = vm.runInContext('Battle', ctx);
const Game = vm.runInContext('Game', ctx);
const Scene = vm.runInContext('BattleScene', ctx);
Scene.isFinalBattle = false;

const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
let nextId = 0;
const attack = (extra) => Object.assign(
  { type: 'attack', fromId: 'p0', toId: 'e0', dmg: 3, hp: 10, maxHp: 10, emphasis: 1, chainDepth: 1,
    eventId: `a${nextId++}` },
  extra || {});
const many = n => Array.from({ length: n }, () => attack());
const of = (plan, timeline, type) => plan.items[timeline.findIndex(e => e.type === type)];

// 1. 予算内なら何も縮めない
const short = [{ type: 'battle_start', eventId: 's1' }, ...many(10), { type: 'result', victory: true, eventId: 'r1' }];
const shortPlan = Scene.plan(short);
assert(shortPlan.items.every(i => i.scale === 1) && shortPlan.compressScale === 1,
  '総尺が予算内なら全イベントの倍率が1のまま');

// 2. 通常攻撃だけで目安を超えても自動圧縮しない
const longPlan = Scene.plan(many(200));
assert(longPlan.rawMs > Scene.BUDGET_MS, '通常攻撃200発は予算を超える');
assert(longPlan.compressScale === 1,
  '長い戦闘も等速を保ち、自動では早送りしない');
assert(longPlan.items.every(i => i.scale === longPlan.compressScale), '通常攻撃も等速を維持');

// 3. 同じ長さの戦闘に事件を混ぜる → 事件は縮まない
const mixed = [
  ...many(120),
  { type: 'synergy', id: 'goblin_horde', name: 'ゴブリンの群れ', emphasis: 3, eventId: 'sy1' },
  { type: 'overkill', percent: 400, emphasis: 2, eventId: 'ok1' },
  { type: 'revive', unitId: 'p0', eventId: 'rv1' },
  { type: 'summon', unit: { id: 'p9', side: 'player' }, eventId: 'sm1' },
  attack({ chainDepth: 4 }),
  { type: 'death', unitId: 'p1', permanent: true, eventId: 'd1' },
  { type: 'result', victory: true, reversal: true, eventId: 'r2' }
];
const mixedPlan = Scene.plan(mixed);
assert(mixedPlan.compressScale === 1, '事件混じりの長期戦も自動圧縮しない');
for (const type of ['synergy', 'overkill', 'revive', 'summon', 'death', 'result']) {
  assert(of(mixedPlan, mixed, type).scale === 1, `${type} は圧縮されない`);
}
assert(mixedPlan.items[mixed.findIndex(e => e.chainDepth === 4)].scale === 1,
  'chainDepth4 の攻撃（深い連鎖の一段）は圧縮されない');

// 4. 反応を生んだ攻撃は起点として保護される
const withChild = [
  attack({ eventId: 'src' }),
  { type: 'resource_gain', sourceId: 'p0', resource: 'gold', amount: 3, eventId: 'g1', parentEventId: 'src', chainDepth: 2 },
  ...many(200)
];
const childPlan = Scene.plan(withChild);
assert(childPlan.items[0].protected && childPlan.items[0].scale === 1,
  '何かが反応した攻撃は起点として保護される');

// 5. 何も反応しなかった火球の追撃（深度2）も等速
const splashIdx = withChild.length;
const withSplash = [...withChild, { type: 'splash', fromId: 'p0', toId: 'e1', dmg: 2, label: '火球', emphasis: 1, chainDepth: 2, eventId: 'sp1' }];
const splashPlan = Scene.plan(withSplash);
assert(!splashPlan.items[splashIdx].protected && splashPlan.items[splashIdx].scale === 1,
  '子を持たない追撃も等速を保つ');

// 6. 保護区間だけで予算を超えても、保護は1.0のまま
const heavy = [...Array.from({ length: 60 }, (_, i) => ({ type: 'synergy', id: 'goblin_horde', name: 'x', emphasis: 3, eventId: `h${i}` })), ...many(20)];
const heavyPlan = Scene.plan(heavy);
assert(heavyPlan.protectedMs > Scene.BUDGET_MS, '保護区間だけで予算を超える戦闘を作れている');
assert(heavyPlan.compressScale === Scene.MIN_COMPRESS, '長期戦でも待ち時間は縮まない');
assert(heavyPlan.items.filter(i => i.protected).every(i => i.scale === 1),
  '予算を超えても保護区間は縮めない（予算は上限ではない）');
assert(heavyPlan.plannedMs > Scene.BUDGET_MS, '事件が多い戦闘は予算を超えて長くなってよい');

// 7. 大きさに応じた延長
const synergyBase = Scene.durationOf({ type: 'synergy', id: 'goblin_horde' });
const synergyFirst = Scene.durationOf({ type: 'synergy', id: 'goblin_horde', firstDiscovery: true });
assert(synergyFirst > synergyBase, 'シナジー初発見は通常のシナジーより長く見せる');
const ok1 = Scene.durationOf({ type: 'overkill', emphasis: 1 });
const ok3 = Scene.durationOf({ type: 'overkill', emphasis: 3 });
assert(ok3 > ok1, 'OVERKILLは大きいランクほど長く見せる');
assert(Scene.durationOf({ type: 'result', victory: true, reversal: true }) > Scene.durationOf({ type: 'result', victory: true }),
  '逆転勝利の決着は通常より長く見せる');
assert(Scene.durationOf({ type: 'death', unitId: 'p0', permanent: true }) > Scene.durationOf({ type: 'death', unitId: 'p0' }),
  '永久戦死は通常の死亡より長く見せる');
assert(Scene.durationOf(attack({ chainDepth: 5 })) === Scene.durationOf(attack({ chainDepth: 1 })),
  '深さだけで一段ずつ延長せず、連鎖全体の緩急を計画する');

// 一つの鎖の中間・再発火も読み切れる尺を守る。
const relay = [
  attack({ chainId:'relay', eventId:'r0' }),
  {type:'resource_gain', resource:'gold', chainId:'relay', chainDepth:2},
  {type:'trait_trigger', traitId:'greedy', chainId:'relay', chainDepth:3},
  attack({chainId:'relay', chainDepth:4}),
  {type:'resource_gain', resource:'gold', chainId:'relay', chainDepth:5},
  {type:'trait_trigger', traitId:'greedy', chainId:'relay', chainDepth:6},
  attack({chainId:'relay', chainDepth:7}),
  {type:'overkill', percent:200, emphasis:2, chainId:'relay', chainDepth:8},
  {type:'revive', chainId:'relay', chainDepth:9}
];
const rhythm = Scene.plan(relay);
for (const i of [0,1,2,6,7,8]) assert(rhythm.items[i].duration >= Scene.durationOf(relay[i]), `連鎖の保護点${i}は読む尺を維持`);
assert(rhythm.items.every(i => i.duration >= 3000 && i.scale === 1), '繰り返しを含む全段に最低3秒の読む時間を確保する');
assert(rhythm.items.length === relay.length, '中間イベント自体は省略しない');

// 8. core側の印: 実際の戦闘で永久戦死と逆転フラグが付く
const make = (name, hp, atk, side) => Battle.makeUnit({
  uid: name, name, race: '試験体', hp, atk, def: 0, spd: side === 'player' ? 10 : 5,
  traits: [], tags: [], loyalty: 100
}, side);
vm.runInContext('Math.random = () => 0.5;', ctx);   // 乱数を固定して同じ戦闘を再現する（先頭の味方が狙われる）
const frail = make('捨て駒', 1, 1, 'player');    // 先頭なので必ず狙われて倒れる
const ace = make('魔王砲', 200, 60, 'player');
const foe = make('勇者', 120, 40, 'enemy');
const fight = Battle.simulate([frail, ace], [foe]);
const frailDeath = [...fight.timeline].reverse().find(e => e.type === 'death' && e.unitId === frail.id);
assert(frailDeath && frailDeath.permanent === true, '蘇生せず戦闘を終えた味方の最後の死亡に permanent が付く');
const enemyDeath = fight.timeline.find(e => e.type === 'death' && e.unitId === foe.id);
assert(!enemyDeath || enemyDeath.permanent === undefined, '敵の死亡には permanent を付けない');
const resultEvent = fight.timeline.find(e => e.type === 'result');
assert(typeof resultEvent.reversal === 'boolean', 'result に reversal が boolean で付く');

// 9. detectReversal: 追い詰められた度合いで決まる
const reversalTimeline = ratioLow => [
  { type: 'battle_start', player: [{ id: 'p0', hp: 100, maxHp: 100 }], enemy: [{ id: 'e0', hp: 10, maxHp: 10 }] },
  { type: 'attack', fromId: 'e0', toId: 'p0', dmg: 1, hp: Math.round(100 * ratioLow), maxHp: 100 },
  { type: 'heal', unitId: 'p0', amount: 50, hp: 90, maxHp: 100 },
  { type: 'result', victory: true }
];
assert(Battle.detectReversal(reversalTimeline(0.25)) === true, 'HP2.5割まで落ちてからの勝利は逆転');
assert(Battle.detectReversal(reversalTimeline(0.5)) === false, 'HP5割止まりの勝利は逆転ではない');
const lost = reversalTimeline(0.25).map(e => e.type === 'result' ? { ...e, victory: false } : e);
assert(Battle.detectReversal(lost) === false, '敗北は逆転にならない');

// 10. firstDiscovery はラン内で初回だけ付く
Game.newRun();
Game.state.discoveredSynergyIds = [];
const synergyResult = () => ({ timeline: [{ type: 'synergy', id: 'goblin_horde', name: 'ゴブリンの群れ' }] });
const first = synergyResult();
Game.recordDiscoveredSynergies(first);
assert(first.timeline[0].firstDiscovery === true, '未発見のシナジーには firstDiscovery が付く');
const second = synergyResult();
Game.recordDiscoveredSynergies(second);
assert(second.timeline[0].firstDiscovery === undefined, '2回目のシナジーには firstDiscovery が付かない');
assert(Game.state.discoveredSynergyIds.filter(id => id === 'goblin_horde').length === 1,
  '発見済み一覧へ二重登録しない');

console.log('\n✓ 戦闘の尺は事件の大きさに比例する（全項目）');
