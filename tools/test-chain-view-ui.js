// 戦果UIがランの記録定義に従い、V1と保存済みV2を混同しないことを固定する。
const fs = require('fs'), vm = require('vm');
const ctx = { console, document: {}, Game: { state: { chainDefVersion: 1, generation: 2, turn: 3 } } };
vm.createContext(ctx);
for (const file of ['src/core/util.js', 'src/core/chain.js', 'src/ui/chain_view.js', 'src/ui/ui.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const UI = vm.runInContext('UI', ctx);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`✓ ${msg}`); };

const legacySteps = [
  { label: '攻撃', actorName: 'ゴブ太' },
  { label: '追い剥ぎ +1G', actorName: 'ゴブ太' },
  { label: '強欲', actorName: 'ヨクバリ' },
  { label: '追加攻撃', actorName: 'ヨクバリ' }
];
const v2Steps = [
  { actorName: 'ゴブ太', abilityName: null, declaredBy: null,
    effect: { type: 'attack', label: '攻撃', targetName: '騎士' } },
  { actorName: 'ゴブ太', abilityName: '追い剥ぎ', declaredBy: null,
    effect: { type: 'resource_gain', label: '追い剥ぎ', amount: 1, resource: 'gold' } },
  { actorName: 'ヨクバリ', abilityName: '強欲', declaredBy: { abilityName: '強欲', actorName: 'ヨクバリ' },
    effect: { type: 'attack', label: '追加攻撃', targetName: '弓手' } }
];
const battle = {
  chainSummary: { maxChain: 4, deepest: { steps: legacySteps } },
  chainView: { defVersion: 2, maxDepth: 3, rawMaxDepth: 4, deepest: { steps: v2Steps } },
  overkillSummary: { maxPercent: 0 }, synergies: []
};

let model = UI.battleChainView(battle);
assert(model.version === 1 && model.maxChain === 4 && model.steps === legacySteps,
  'V1途中ランはchainViewがあっても既存chainSummaryを表示する');
let html = UI.breakthroughPanel(battle);
assert(html.includes('CHAIN 4') && html.includes('強欲') && html.includes('追加攻撃'),
  'V1戦果の段数と既存経路を維持する');

ctx.Game.state.chainDefVersion = 2;
model = UI.battleChainView(battle);
assert(model.version === 2 && model.maxChain === 3 && model.steps === v2Steps,
  'V2ランは保存済みchainViewの正規化段数と経路を読む');
html = UI.breakthroughPanel(battle);
assert(html.includes('CHAIN 3'), 'V2戦果は正規化した最大CHAINを表示する');
assert(html.includes('攻撃') && html.includes('追い剥ぎ +1G')
  && html.includes('《強欲》による追加攻撃'),
  'V2経路を構造化された能力・効果から3段で表示する');
assert(!html.includes('強欲</span><span class="chain-arrow">→</span><span class="chain-step">追加攻撃'),
  '宣言と実効果を別々の段として表示しない');

const withoutView = { ...battle };
delete withoutView.chainView;
model = UI.battleChainView(withoutView);
assert(model.version === 1 && model.maxChain === 4,
  'chainViewの無い旧セーブはV1表示へ戻り、推定生成しない');

const wrongContract = { ...battle, chainView: { ...battle.chainView, defVersion: 3 } };
model = UI.battleChainView(wrongContract);
assert(model.version === 1 && model.maxChain === 4,
  '未知のchainView契約版はV1へ安全に戻す');

const summon = UI.chainViewStepLabel({ actorName: null, abilityName: '墓地',
  declaredBy: { abilityName: '墓地', actorName: null },
  effect: { type: 'summon', fallenName: '前衛', summonedName: '前衛の骸骨従者' } });
assert(summon === '《墓地》による前衛の骸骨従者を召喚',
  '召喚は戦没者を行為者にせず、能力と召喚個体から表示する');
assert(!UI.chainViewStepLabel.toString().includes('.text'), 'V2ラベル生成はraw textを解析しない');

console.log('\nOK: 戦果UIのV1/V2分離。表示切替はランの記録定義に従う。');
