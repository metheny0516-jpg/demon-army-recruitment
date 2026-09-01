// 敵データの開戦台詞が戦闘タイムラインへ載ることを検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/core/util.js', 'src/core/synergy.js', 'src/core/battle.js'
];
const ctx = { console, Math, Date, JSON };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Battle = vm.runInContext('Battle', ctx);
const stages = vm.runInContext('ENEMY_STAGES', ctx);
const finalStage = stages[stages.length - 1];
const player = Battle.makeUnit({ name: '試験兵', race: 'ゴブリン', hp: 999, atk: 1, def: 99, spd: 1, traits: [], tags: [] }, 'player');
const enemies = finalStage.units.map(e => Battle.makeUnit(e, 'enemy'));
const result = Battle.simulate([player], enemies);
const line = result.timeline.find(e => e.type === 'dialogue');
if (!line || line.name !== '勇者アレン' || !line.quote.includes('最後の一線')) {
  throw new Error('勇者アレンの開戦台詞がタイムラインにない');
}
if (result.log.filter(e => e.c === 'dialogue').length !== 1) {
  throw new Error('開戦台詞が戦闘ログへ一度だけ記録されていない');
}
console.log('✓ 敵データの開戦台詞が汎用 dialogue イベントとして再生される');
