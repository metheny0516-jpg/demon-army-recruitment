// CHAIN V2の戦闘中・スキップ・戦果が、同じ構造化stepを同じ文言で表示することを固定する。
const fs = require('fs'), vm = require('vm');
const ctx = { console, document: {}, Game: { state: { chainDefVersion: 2, generation: 2, turn: 3 } } };
vm.createContext(ctx);
for (const file of [
  'src/data/battle_happenings.js', 'src/core/util.js', 'src/core/chain.js',
  'src/ui/chain_view.js', 'src/ui/ui.js', 'src/ui/battle_scene.js'
]) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });

const Formatter = vm.runInContext('ChainViewUI', ctx);
const UI = vm.runInContext('UI', ctx);
const Scene = vm.runInContext('BattleScene', ctx);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log(`✓ ${msg}`); };

const fixtures = [
  ['略奪', { actorName: '盗む役', abilityName: '追い剥ぎ', effect: {
    type: 'resource_gain', label: '追い剥ぎ', amount: 1, resource: 'gold', targetName: null
  } }, '追い剥ぎ +1G'],
  ['食料', { actorName: null, abilityName: null, effect: {
    type: 'resource_consume', label: '食料消費', amount: 2, resource: 'food'
  } }, '食料消費 2food'],
  ['暴食', { actorName: '宴の主', abilityName: '暴食の宴',
    declaredBy: { actorName: '宴の主', abilityName: '暴食の宴' },
    effect: { type: 'attack', label: '追加攻撃', targetName: '傭兵' }
  }, '《暴食の宴》による追加攻撃'],
  ['死霊', { actorName: '前衛', abilityName: null,
    effect: { type: 'revive', targetName: '前衛' }
  }, '前衛を蘇生'],
  ['墓地', { actorName: null, abilityName: '墓地',
    declaredBy: { actorName: null, abilityName: '墓地' },
    effect: { type: 'summon', fallenName: '前衛', summonedName: '前衛の骸骨従者' }
  }, '《墓地》による前衛の骸骨従者を召喚'],
  ['OVERKILL', { actorName: '殴り役', abilityName: '魔王軍完成',
    declaredBy: { actorName: '殴り役', abilityName: '魔王軍完成' },
    effect: { type: 'splash', label: '追撃', targetName: '弓手' }
  }, '《魔王軍完成》による追撃'],
  ['仲間割れ', { actorName: '謀反役', abilityName: '今ここで下剋上',
    declaredBy: { actorName: '謀反役', abilityName: '今ここで下剋上' },
    effect: { type: 'splash', label: '巻き添え', targetName: '味方' }
  }, '《今ここで下剋上》による巻き添え'],
  ['ストライキ', { actorName: '前衛', abilityName: '戦場ストライキ',
    effect: { type: 'incident', label: '戦場ストライキ', targetName: '前衛' }
  }, '戦場ストライキ'],
  ['暴食未実行の親', { actorName: null, abilityName: null,
    effect: { type: 'resource_consume', label: '食料消費', amount: 1, resource: 'food' }
  }, '食料消費 1food'],
  ['分岐A', { actorName: '強欲A', abilityName: '強欲', sharedDeclaration: true,
    declaredBy: { actorName: '強欲A', abilityName: '強欲' },
    effect: { type: 'attack', label: '追加攻撃', targetName: '弓手ミナ' }
  }, '《強欲》による追加攻撃'],
  ['分岐B', { actorName: '強欲B', abilityName: '強欲', sharedDeclaration: true,
    declaredBy: { actorName: '強欲A', abilityName: '強欲' },
    effect: { type: 'attack', label: '追加攻撃', targetName: '盾のガル' }
  }, '《強欲》による追加攻撃']
];

for (const [name, step, expected] of fixtures) {
  const shared = Formatter.stepLabel(step);
  assert(shared === expected, `${name}: 共通フォーマッタの期待文言`);
  assert(Scene.chainStepLabel(step) === shared, `${name}: 通常再生とスキップは共通文言を読む`);
  assert(UI.chainViewStepLabel(step) === shared, `${name}: 戦果も共通文言を読む`);
}

const summon = fixtures.find(([name]) => name === '墓地')[1];
assert(summon.actorName === null && summon.declaredBy.actorName === null
  && summon.effect.fallenName === '前衛' && summon.effect.summonedName === '前衛の骸骨従者',
  '召喚は人物行為者・宣言者を立てず、戦没者と召喚個体を別役で保持する');
const branches = fixtures.filter(([name]) => name.startsWith('分岐')).map(([, step]) => step);
assert(branches[0].declaredBy.actorName === branches[1].declaredBy.actorName
  && branches[0].actorName !== branches[1].actorName
  && branches[0].effect.targetName !== branches[1].effect.targetName,
  '分岐2経路は宣言者を共有し、実行者と対象を混同しない');
assert(!Formatter.stepLabel.toString().includes('.text'), '共通フォーマッタはraw textを解析しない');

console.log('\nOK: CHAIN V2の表示文言を戦闘中・スキップ・戦果で一本化。');
