// 戦闘糧食→大食漢・料理人・飢餓・暴食の宴を検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => store[key] || null, setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx), Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const monster = (uid, tplId, name, traits, spd) => ({
  uid, tplId, name, race: tplId === 'ogre' ? 'オーガ' : tplId === 'imp' ? 'インプ' : 'ゴブリン',
  job: traits.includes('demon_cook') ? '魔界料理人' : '戦士', hp: 100, atk: 10, def: 1, spd,
  salary: 0, loyalty: 90, traits, tags: [], unpaid: false, department: 'combat', merit: 0, rankId: 'soldier'
});

Game.newRun();
Game.state.openingPrototype = false;
Game.state.roster = [
  monster(1, 'ogre', '大食い甲', ['brute', 'big_eater'], 5),
  monster(2, 'ogre', '大食い乙', ['brute', 'big_eater'], 4),
  monster(3, 'goblin', '料理長', ['demon_cook'], 3),
  monster(4, 'imp', '飢え魔', ['hunger_demon'], 8)
];
Game.state.activeUids = [1, 2, 3, 4];
Game.state.food = 5;
const quote = Game.battleRationQuote();
assert(quote.need === 5 && quote.consumed === 5 && quote.emptied, '大食い編成が食料5を使い切る');
assert(quote.totalNeed === 5 && quote.remainingNeed === 0, '前払いと戦後消費を分けても総食料需要を増やさない');
const notes = [], paid = Game.prepareBattleRations(notes);
assert(Game.state.food === 0 && paid.emptied, '戦闘前に食料を前払いする');
const prepared = Game.preparedRoster(paid);
assert(prepared[0].battleDmgMult === 3.5, '大食漢1.25×料理人1.4×飢餓2を最も大食いの味方へ適用');
assert(prepared.every(m => m.battleTakenMult === 1.3), '飢餓の代償として全軍被ダメージ+30%');

const units = prepared.map(m => Battle.makeUnit(m, 'player'));
const enemy = Battle.makeUnit({ name:'訓練標的', race:'人間', hp:999, atk:1, def:0, spd:1, traits:[], tags:[] }, 'enemy');
const result = Battle.simulate(units, [enemy], { rations: {
  ...paid, cookUid: 3, bigEaterUids: [1, 2], hungerUid: 4, feastUid: 3
} });
assert(result.timeline.some(e => e.type === 'resource_consume' && e.resource === 'food'), '食料消費を因果イベントにする');
assert(result.timeline.some(e => e.traitId === 'big_eater'), '大食漢の発火を表示する');
assert(result.timeline.some(e => e.traitId === 'demon_cook'), '魔界料理人の発火を表示する');
assert(result.timeline.some(e => e.traitId === 'hunger_demon'), '食料が0へ遷移した時だけ飢餓が発火する');
const feastAttack = result.timeline.find(e => e.type === 'attack' && e.label === '暴食の宴');
assert(feastAttack, '食料4以上で最も遅い味方が追加行動する');
assert(feastAttack.chainDepth === 3 && (feastAttack.traits || []).includes('CHAIN 3 ×1.25'),
  '暴食の宴はCHAIN 3の共通倍率で増幅する');

Game.state.food = 0;
const alreadyEmpty = Game.battleRationQuote();
assert(!alreadyEmpty.emptied, 'すでに食料0なら飢餓を再発火しない');

Game.state.food = 0;
Game.state.roster.forEach(m => { m.loyalty = 90; });
const starving = Game.prepareBattleRations([]);
Game.processDepartments({ foodReward: 0, materialReward: 0 }, [], undefined, starving);
assert(Game.state.lastDepartmentReport.foodShortage === 5, '戦闘前の糧食不足を戦後報告へ引き継ぐ');
assert(Game.state.roster.every(m => m.loyalty === 72), '糧食5不足にも改修後の忠誠低下上限18を適用する');

Game.state = { roster: [monster(9, 'ogre', '旧オーガ', ['brute'], 2)], applicants: [], activeUids: [9] };
Game.migrateState();
assert(Game.state.roster[0].traits.includes('big_eater'), '旧セーブのオーガへ大食漢を補う');

console.log('暴食・飢餓CHAINテスト完了');
