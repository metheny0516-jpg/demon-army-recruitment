// 特性台詞：本数・短さ・出来事の明瞭さと、候補特性がデータだけであることを守る。
//   node tools/test-trait-lines.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of ['src/core/util.js', 'src/data/traits.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
const TRAITS = vm.runInContext('TRAITS', ctx);
let failed = 0;
const assert = (condition, message) => {
  if (condition) console.log(`✓ ${message}`);
  else { failed++; console.log(`✗ ${message}`); }
};

const minimums = {
  drunkard: { absent: 8, absentSelf: 8, arrive: 10 },
  big_eater: { eat: 10, busy: 8 },
  tinkerer: { absent: 6, absentSelf: 6, arrive: 6 },
  timid: { flinch: 6, held: 6, back: 6 },
  show_off: { front: 6, mormo: 4 }
};
for (const [traitId, pools] of Object.entries(minimums)) {
  for (const [poolId, minimum] of Object.entries(pools)) {
    const lines = TRAITS[traitId]?.lines?.[poolId] || [];
    assert(lines.length >= minimum, `${traitId}.${poolId} は ${minimum} 本以上`);
    assert(new Set(lines).size === lines.length, `${traitId}.${poolId} に重複がない`);
  }
}

const allLines = Object.values(TRAITS).flatMap(trait => Object.values(trait.lines || {}).flat());
const oversized = allLines.filter(line => [...line].length > 28);
assert(oversized.length === 0, `全台詞が全角28文字以内${oversized.length ? `: ${oversized.join(' / ')}` : ''}`);
assert(allLines.every(line => !/%|HP|ダメージ|[0-9０-９]/.test(line)), '全台詞に数値表現がない');
assert(TRAITS.drunkard.lines.absent.every(line => line.includes('{name}')), '酒好きの不在報告は全て {name} を含む');
assert(TRAITS.tinkerer.lines.absent.every(line => line.includes('{name}') && line.includes('{by}')), '改造癖の不在報告は全て {name} と {by} を含む');

const foods = ['弁当', '握り飯', '干し肉', 'パン', 'チーズ', '酒', '水筒', '林檎', '携行食', '干し魚', '塩漬け', '堅パン'];
assert(TRAITS.big_eater.lines.eat.every(line => foods.some(food => line.includes(food))), '大食漢の食事台詞は全て物の名前を含む');

const hooks = ['modDealt', 'modTaken', 'postAttack', 'onTriggeredEvents', 'onRoundEnd', 'onLethal', 'lateArrival'];
for (const traitId of ['timid', 'show_off']) {
  const trait = TRAITS[traitId];
  assert(trait?.proposed === true, `${traitId} は proposed 候補`);
  assert(hooks.every(hook => !Object.prototype.hasOwnProperty.call(trait, hook)), `${traitId} はフック関数を持たない`);
}
assert(Object.values(TRAITS).every(trait => !String(trait.desc || '').includes('部門')), '特性説明文に「部門」がない');

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
