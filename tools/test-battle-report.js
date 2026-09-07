// 戦果画面が「何が連鎖したか」「火力以外で誰が働いたか」を伝えられるか。
//
// 見ているのは表示のHTMLではなく、そこへ渡す集計の性質:
// 代表CHAIN経路が一本であること、非ダメージ貢献が正しい人物へ帰属すること、
// そして既存の評価（戦功・昇進・勝敗）がそれに一切影響されないこと。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js', 'src/data/missions.js',
  'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => key in store ? store[key] : null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
vm.runInContext('U.chance = () => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Game = vm.runInContext('Game', ctx), Battle = vm.runInContext('Battle', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };
const unit = (uid, tplId, name, traits, tags, hp, atk, spd) => Battle.makeUnit({
  uid, tplId, name, race: tplId, job: '', hp, atk, def: 0, spd,
  salary: 0, loyalty: 90, traits, tags
}, 'player');
const labels = path => (path ? path.steps.map(s => s.label) : []);

// ── 1. 代表経路は最深イベントから親をたどった一本 ───────────────────
const handmade = [
  { type: 'battle_start', player: [{ id: 'p0', side: 'player', hp: 10, maxHp: 10 }], enemy: [{ id: 'e0', side: 'enemy', hp: 10, maxHp: 10 }] },
  { eventId: 'a1', type: 'attack', fromId: 'p0', toId: 'e0', chainId: 'a1', chainDepth: 1 },
  { eventId: 'g1', type: 'resource_gain', sourceId: 'p0', resource: 'gold', amount: 1, label: '追い剥ぎ', parentEventId: 'a1', chainId: 'a1', chainDepth: 2 },
  { eventId: 't1', type: 'trait_trigger', sourceId: 'p0', traitId: 'greedy', name: '強欲', parentEventId: 'g1', chainId: 'a1', chainDepth: 3 },
  { eventId: 'a2', type: 'attack', fromId: 'p0', toId: 'e0', parentEventId: 't1', chainId: 'a1', chainDepth: 4 },
  // 別の枝（深度3で止まる）。深い方だけを選ばせるための分岐
  { eventId: 'b1', type: 'trait_trigger', sourceId: 'p0', name: '別の発火', parentEventId: 'g1', chainId: 'a1', chainDepth: 3 },
  { eventId: 'b2', type: 'note', parentEventId: 'b1', chainId: 'a1', chainDepth: 4 }
];
const path = Battle.deepestChainPath(handmade);
assert(path.depth === 4 && path.steps.length === 4, '最深イベントから起点までの一本だけを返す');
assert(JSON.stringify(labels(path)) === JSON.stringify(['攻撃', '追い剥ぎ +1G', '強欲', '追加攻撃']),
  '代表経路が「攻撃 → 追い剥ぎ +1G → 強欲 → 追加攻撃」になる');
assert(!path.steps.some(s => s.eventId === 'b1' || s.eventId === 'b2'), '分岐した別の枝を混ぜない');

// ── 2. 因果情報のない旧データでも安全 ────────────────────────────
assert(Battle.deepestChainPath([{ type: 'attack' }, { type: 'result', victory: true }]) === null,
  '因果メタデータの無い旧データでは代表経路を作らない（空表示になる）');
assert(Battle.deepestChainPath([]) === null && Battle.deepestChainPath(null) === null, '空タイムラインでも落ちない');
assert(Battle.deepestChainPath([{ eventId: 'x', type: 'attack', chainDepth: 1 }]) === null,
  '起点だけの単発は連鎖として表示しない');
const broken = Battle.deepestChainPath([
  { eventId: 'x', type: 'attack', chainDepth: 1, parentEventId: 'y' },   // 親が存在しない
  { eventId: 'y', type: 'death', unitId: 'e0', chainDepth: 2, parentEventId: 'x' }
]);
assert(broken && broken.steps.length === 2, '親リンクが循環していても止まる');

// ── 3. 略奪Gと殉職手当の没収 ─────────────────────────────────
const looter = unit(1, 'goblin', '追い剥ぎゴブ', ['pickpocket', 'greedy'], [], 30, 8, 12);
const lootEnemy = Battle.makeUnit({ name: '隊商', race: '人間', hp: 20, atk: 1, def: 0, spd: 1, traits: [], tags: [] }, 'enemy');
const loot = Battle.simulate([looter], [lootEnemy]);
const lootRow = loot.contribution.find(c => c.uid === 1);
assert(lootRow.resources.gold >= 1, '略奪した金貨を本人の純増減へ帰属する');
assert(lootRow.traitTriggers === loot.timeline.filter(e => e.type === 'trait_trigger' && e.sourceId === looter.id).length,
  '能力発火回数を発火させた本人へ帰属する');

const forfeitTimeline = [
  { type: 'battle_start', player: [{ id: 'p0', side: 'player', hp: 10, maxHp: 10 }], enemy: [] },
  { eventId: 'g1', type: 'resource_gain', sourceId: 'p0', resource: 'gold', amount: 2, label: '殉職手当' },
  { eventId: 'f1', type: 'resource_forfeit', sourceId: 'p0', resource: 'gold', amount: 2, label: '殉職手当' }
];
const forfeitUnit = unit(9, 'goblin', '殉職者', [], [], 10, 1, 1);
forfeitUnit.id = 'p0';
const forfeited = Battle.summarizeContribution(forfeitTimeline, [forfeitUnit]);
assert(forfeited[0].resources.gold === 0, '殉職手当の没収を純増減から差し引く');

// ── 4. 蘇生の帰属 ───────────────────────────────────────
const fallen = unit(2, 'goblin', '戦死候補', [], [], 8, 3, 12);
const necro = unit(3, 'necromancer', '死霊術師', ['necromancy'], ['caster'], 60, 2, 2);
const executioner = Battle.makeUnit({ name: '処刑人', race: '人間', hp: 400, atk: 30, def: 0, spd: 10, traits: [], tags: [] }, 'enemy');
const necroFight = Battle.simulate([fallen, necro], [executioner]);
const necroRow = necroFight.contribution.find(c => c.uid === 3);
const fallenRow = necroFight.contribution.find(c => c.uid === 2);
assert(necroRow.revivesGiven === 1, '死霊術による蘇生を術者へ帰属する');
assert(fallenRow.revivesGiven === 0 && fallenRow.selfRevives === 0, '蘇生された本人を蘇生者として数えない');

vm.runInContext('U.rand = () => 0.1;', ctx);   // 《執念》は25%抽選なので、この戦闘だけ必ず起こす
const stubborn = unit(4, 'goblin', '執念のゴブ', ['tenacity'], [], 8, 3, 12);
const selfFight = Battle.simulate([stubborn], [Battle.makeUnit(
  { name: '処刑人', race: '人間', hp: 400, atk: 30, def: 0, spd: 10, traits: [], tags: [] }, 'enemy')]);
const selfRow = selfFight.contribution.find(c => c.uid === 4);
assert(selfRow.selfRevives === 1 && selfRow.revivesGiven === 0, '執念の自己蘇生を本人へ帰属する（他者蘇生とは分ける）');
vm.runInContext('U.rand = () => 0.5;', ctx);

// ── 5. 召喚物を個人貢献へ混ぜない ─────────────────────────────
const graveKeeper = unit(5, 'necromancer', '墓地番', [], ['caster'], 60, 2, 2);
const bait = unit(6, 'goblin', '囮', [], [], 5, 2, 12);
const summonFight = Battle.simulate([bait, graveKeeper], [Battle.makeUnit(
  { name: '処刑人', race: '人間', hp: 400, atk: 20, def: 0, spd: 10, traits: [], tags: [] }, 'enemy')], { graveyard: true });
assert(summonFight.summonCount === 1, '墓地から骸骨従者を召喚できている');
assert(summonFight.contribution.every(c => c.uid !== null && c.uid !== undefined),
  '召喚された骸骨従者を個人貢献の行に混ぜない');
assert(summonFight.contribution.length === 2, '個人貢献はロスターの2体だけ');

// ── 6. 既存評価が非ダメージ貢献に影響されない ──────────────────────
Game.newRun();
const roster = Game.state.roster;
const contribution = roster.slice(0, 2).map((m, i) => ({
  uid: m.uid, id: 'p' + i, name: m.name, dealt: 10 - i, taken: i, kills: 1, survived: true, died: false
}));
const meritBefore = roster.slice(0, 2).map(m => m.merit || 0);
Game.awardMerit(contribution.map(c => ({ ...c })), []);
const meritPlain = roster.slice(0, 2).map(m => m.merit || 0);
for (const [i, m] of roster.slice(0, 2).entries()) m.merit = meritBefore[i];
Game.awardMerit(contribution.map(c => ({
  ...c, resources: { gold: 99, soul: 5 }, traitTriggers: 20, revivesGiven: 3, selfRevives: 1, healed: 40
})), []);
const meritRich = roster.slice(0, 2).map(m => m.merit || 0);
assert(JSON.stringify(meritPlain) === JSON.stringify(meritRich),
  '非ダメージ貢献を足しても戦功・昇進の計算は変わらない');

// ── 7. 主要記録は2つ、経路は勝敗に関係なく同じ契約で出る ────────────────
for (const fight of [loot, necroFight, summonFight]) {
  const summary = fight.chainSummary;
  assert(Number.isFinite(summary.maxChain) && Number.isFinite(fight.overkillSummary.maxPercent),
    `${fight.victory ? '勝利' : '敗北'}でも最大CHAINと最大OVERKILLを同じ形で持つ`);
  assert(summary.deepest === null || summary.deepest.depth === summary.maxChain,
    '代表経路の深さが最大CHAINと一致する');
}

console.log('戦果CHAIN・非ダメージ貢献テスト完了');
