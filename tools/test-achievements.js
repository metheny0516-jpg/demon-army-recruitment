// 実績が現在の魔界史だけから決定的に計算できることを検証する。
const fs = require('fs'), vm = require('vm');
const ctx = { console, Set };
vm.createContext(ctx);
for (const file of ['src/data/monsters.js', 'src/data/synergies.js', 'src/data/achievements.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const achievements = vm.runInContext('ACHIEVEMENTS', ctx);
const templates = vm.runInContext('MONSTER_TEMPLATES', ctx);
const synergies = vm.runInContext('SYNERGIES', ctx);
const byId = id => achievements.find(a => a.id === id);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const record = {
  cleared: true, facilityLevel: 3, payrollChoices: { withhold: 5 },
  hallOfFame: { merit: 22 },
  recruitedTplIds: templates.map(t => t.id),
  discoveredSynergyIds: synergies.map(s => s.id)
};
assert(achievements.every(a => a.check([record])), '条件を満たす魔界史ですべての実績を解除する');
assert(!achievements.some(a => a.check([])), '空の魔界史では実績を解除しない');
assert(!byId('black_employer').check([{ payrollChoices: { withhold: 4 } }]), '未払い4回では重点監視にならない');
assert(byId('black_employer').check([
  { payrollChoices: { withhold: 2 } }, { payrollChoices: { withhold: 3 } }
]), '未払い回数は複数ランをまたいで集計する');
console.log('魔王実績テスト完了');
