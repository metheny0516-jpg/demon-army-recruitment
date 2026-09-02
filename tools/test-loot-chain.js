// 略奪→金貨→強欲→追加行動と、勝利時だけの金貨確定を検証する。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => true; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
const Game = vm.runInContext('Game', ctx);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const make = (name, side, overrides) => Battle.makeUnit(Object.assign({
  name, race: side === 'player' ? 'ゴブリン' : '人間', hp: 40, atk: 8, def: 0, spd: 8,
  salary: 0, loyalty: 80, traits: [], tags: [], rankId: 'soldier'
}, overrides || {}), side);

let result = Battle.simulate(
  [make('欲張りゴブリン', 'player', { traits: ['pickpocket', 'greedy'] })],
  [make('金持ちかかし', 'enemy', { hp: 200, atk: 1, spd: 1 })]
);
const firstAttack = result.timeline.find(e => e.type === 'attack');
const loot = result.timeline.find(e => e.type === 'resource_gain' && e.resource === 'gold');
const greed = result.timeline.find(e => e.type === 'trait_trigger' && e.traitId === 'greedy');
const extra = result.timeline.find(e => e.type === 'attack' && e.label === '強欲');
assert(loot && loot.parentEventId === firstAttack.eventId && loot.amount === 1,
  '最初の攻撃から追い剥ぎ1Gが発火する');
assert(greed && greed.parentEventId === loot.eventId, '金貨獲得から強欲が発火する');
assert(extra && extra.parentEventId === greed.eventId, '強欲から追加攻撃が発生する');
assert(extra.chainId === firstAttack.chainId && extra.chainDepth === 4,
  '攻撃→金貨→強欲→追加攻撃が同じCHAIN 4になる');
assert(result.timeline.filter(e => e.type === 'resource_gain').length === 1,
  '追い剥ぎは1戦闘1回で追加攻撃から再発火しない');
assert(result.timeline.filter(e => e.type === 'trait_trigger' && e.traitId === 'greedy').length === 1,
  '強欲は同じ連鎖で1回だけ発火する');
assert(result.resourceChanges.gold === 1 && result.chainSummary.maxChain >= 4,
  '予約金貨と最大CHAINをタイムラインから集計する');

const raider = make('略奪隊長', 'player', { hp:100, atk:50, spd:12, traits:['pickpocket', 'greedy'] });
const wing1 = make('略奪兵A', 'player', { hp:100, atk:50, spd:10 });
const wing2 = make('略奪兵B', 'player', { hp:100, atk:50, spd:8 });
result = Battle.simulate([raider, wing1, wing2], [
  make('標的A', 'enemy', { hp:10, atk:1, spd:1 }),
  make('標的B', 'enemy', { hp:10, atk:1, spd:1 }),
  make('標的C', 'enemy', { hp:200, atk:1, spd:1 })
], { extortionLedger:true });
const coordinatedLoot = result.timeline.filter(e => e.type === 'resource_gain' && e.label === '略奪者の連携');
const ledger = result.timeline.find(e => e.type === 'facility_trigger' && e.facilityId === 'extortion_ledger');
assert(coordinatedLoot.length >= 2, 'ゴブリン3体以上なら敵撃破ごとに略奪者の連携で1Gを予約する');
assert(ledger && ledger.amount === 3, '予約金貨が初めて3Gへ達した瞬間に恐喝帳簿が発火する');
assert(ledger.parentEventId === result.timeline.filter(e => e.type === 'resource_gain' && e.resource === 'gold')[2].eventId,
  '3G目の金貨獲得を恐喝帳簿の原因にする');
const ledgerIndex = result.timeline.indexOf(ledger);
const boosted = result.timeline.slice(ledgerIndex + 1).find(e => e.type === 'attack' && (e.traits || []).includes('恐喝帳簿'));
assert(boosted && boosted.dmg >= 70, '恐喝帳簿が次の味方攻撃だけを40%強化する');
assert(result.timeline.filter(e => e.type === 'facility_trigger' && e.facilityId === 'extortion_ledger').length === 1,
  '恐喝帳簿は1戦闘1回だけ発火する');

const goblin = (atk, hp) => ({
  uid: 1, tplId: 'goblin', name: 'テスト略奪兵', race: 'ゴブリン', job: '盗賊',
  hp, atk, def: 0, spd: 99, salary: 0, loyalty: 90,
  traits: ['pickpocket'], tags: [], unpaid: false, department: 'combat', merit: 0, rankId: 'soldier'
});

Game.newRun();
Object.assign(Game.state, {
  roster: [goblin(999, 999)], activeUids: [1], applicants: [], phase: 'formation', selectedMission: null
});
let goldBefore = Game.state.gold;
let output = Game.deploy();
assert(output.result.victory && output.result.resourceChanges.gold === 1, '勝利戦で1Gを予約する');
assert(Game.state.lastBattle.lootGold === 1, '勝利時に予約金貨を戦果へ確定する');
assert(Game.state.gold >= goldBefore + output.stageData.reward + 1,
  '勝利報酬とは別に略奪金を所持金へ加える');

Game.newRun();
Object.assign(Game.state, {
  roster: [goblin(1, 1)], activeUids: [1], applicants: [], phase: 'formation', selectedMission: null
});
goldBefore = Game.state.gold;
output = Game.deploy();
assert(!output.result.victory && output.result.resourceChanges.gold === 1, '敗北戦でも戦闘中の略奪予約は記録する');
assert(Game.state.gold === goldBefore && Game.state.lastBattle.lootGold === 0,
  '敗北時は予約金貨を破棄する');

Game.newRun();
const applicant = Game.rollApplicant('goblin');
assert(applicant.traits.includes('coward') && applicant.traits.includes('pickpocket'),
  '新しいゴブリンは既存の卑怯者を保ったまま追い剥ぎを持つ');

Game.state = {
  roster: [Object.assign(goblin(8, 20), { traits: ['coward'] })],
  applicants: [], activeUids: [1]
};
Game.migrateState();
assert(Game.state.roster[0].traits.includes('pickpocket'), '旧セーブのゴブリンにも追い剥ぎを補う');

console.log('略奪経済CHAINテスト完了');
