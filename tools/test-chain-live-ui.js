// 戦闘中UIがV2ランだけ正規化stepを使い、V1のraw表示契約を変えないことを固定する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/battle_happenings.js', 'src/core/chain.js', 'src/ui/chain_view.js', 'src/ui/battle_scene.js'];
const ctx = { console, Game: { state: { chainDefVersion: 1 } } };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Scene = vm.runInContext('BattleScene', ctx);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`✓ ${msg}`); };

const timeline = [
  { eventId: 'start', type: 'battle_start', player: [
    { id: 'p0', name: '盗む役' }, { id: 'p1', name: '反応役' }
  ], enemy: [{ id: 'e0', name: '傭兵ガレス' }, { id: 'e1', name: '傭兵ボルド' }] },
  { eventId: 'a1', type: 'attack', chainId: 'a1', chainDepth: 1,
    fromId: 'p0', toId: 'e0', label: '攻撃', dmg: 8 },
  { eventId: 'g1', type: 'resource_gain', parentEventId: 'a1', chainId: 'a1', chainDepth: 2,
    sourceId: 'p0', traitId: 'mugger', name: '追い剥ぎ', label: '追い剥ぎ', resource: 'gold', amount: 1 },
  { eventId: 'd1', type: 'trait_trigger', parentEventId: 'g1', chainId: 'a1', chainDepth: 3,
    sourceId: 'p1', traitId: 'greedy', name: '強欲' },
  { eventId: 'a2', type: 'attack', parentEventId: 'd1', chainId: 'a1', chainDepth: 4,
    fromId: 'p1', toId: 'e1', label: '追加攻撃', dmg: 6 }
];

Scene.prepareChainView(timeline);
assert(Scene.chainViewVersion === 1 && Scene.chainEventViews.size === 0,
  'V1ランは正規化表示表を作らず、既存raw表示へ介入しない');
assert(timeline[3].chainDepth === 3 && timeline[4].chainDepth === 4,
  'V1準備はraw chainDepthを書き換えない');

ctx.Game.state.chainDefVersion = 2;
Scene.prepareChainView(timeline);
const declaration = Scene.chainEventView(timeline[3]);
const effect = Scene.chainEventView(timeline[4]);
assert(declaration.depth === 2 && declaration.counted === false,
  '強欲の宣言は前段と同じ深さで、表示段として数えない');
assert(effect.depth === 3 && effect.counted === true,
  '強欲による追加攻撃を結合後の3段目として数える');
assert(Scene.chainStepView(timeline[3]) === null,
  '宣言イベント単体では固定帯・カウンタ用stepを返さない');
assert(Scene.chainDisplayDepth(timeline[3]) === 0 && Scene.chainDisplayDepth(timeline[4]) === 3,
  'CHAINカウンタは宣言で進まず、実効果で結合後の3段へ進む');
const step = Scene.chainStepView(timeline[4]);
assert(step.depth === 3 && step.actorName === '反応役'
  && step.declaredBy.actorName === '反応役' && step.declaredBy.abilityName === '強欲',
  '追加攻撃stepが実行者・宣言者・能力を保持する');
assert(Scene.chainStepLabel(step) === '《強欲》による追加攻撃',
  '戦闘中も宣言と実効果を1つの表示ラベルに結合する');
assert((Scene.chainPaths.get('a2') || []).map(s => s.depth).join(',') === '1,2,3',
  '戦闘中の代表経路は攻撃→追い剥ぎ→強欲による追加攻撃の3段になる');
assert(timeline[4].chainDepth === 4,
  'V2表示準備後もraw因果グラフとchainDepthを破壊しない');
assert(!Scene.chainStepLabel.toString().includes('.text'), '戦闘中V2ラベルはraw textを解析しない');

console.log('\nOK: 戦闘中CHAIN UIのV1/V2分離。倍率・演出閾値はrawのまま。');
