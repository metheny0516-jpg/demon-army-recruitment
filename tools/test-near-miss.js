// ニアミスは戦闘中の別状態ではなく、timelineだけから導出できることを検証する。
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/core/battle.js', 'utf8'), ctx, { filename: 'src/core/battle.js' });
const Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

const timeline = [
  { type: 'battle_start', player: [{ id: 'p0', hp: 30, maxHp: 30 }], enemy: [{ id: 'e0', hp: 100, maxHp: 100 }] },
  { type: 'attack', fromId: 'p0', toId: 'e0', dmg: 60, hp: 40, maxHp: 100, text: '　魔物 → 勇者 に 60 ダメージ' },
  { type: 'heal', unitId: 'e0', amount: 30, hp: 70, maxHp: 100 },
  { type: 'attack', fromId: 'e0', toId: 'p0', dmg: 30, hp: 0, maxHp: 30, text: '　勇者 → 魔物 に 30 ダメージ' },
  { type: 'death', unitId: 'p0', text: '　魔物 は倒れた！' },
  { type: 'result', victory: false, text: '魔王軍は全滅した……' }
];
const miss = Battle.summarizeNearMiss(timeline);
assert(miss.enemyMaxHp === 100, '開始時の敵総HPを記録する');
assert(miss.closestRemaining === 40 && miss.closestDamage === 60 && miss.closestPercent === 60, '最も敵HPが低かった瞬間を導出する');
assert(miss.finalRemaining === 70, '敵の回復後の最終HPを区別する');
assert(miss.lastEventText === '魔物 は倒れた！', '決着前の最後の出来事を導出する');
