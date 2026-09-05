// 編成画面のシナジー予告（Synergy.preview）。
//
// 守りたい性質は「効果量が説明文ではなく実測であること」と
// 「いまの編成から何をすれば伸びるかが出ること」。
// 実測で混成が純種族より弱かった（3ゴブ+2オーガ 28% vs 5ゴブ 100% @S6）のに、
// 画面には「+15%刻み」としか出ておらず、その差が見えなかったための機能。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/monsters.js', 'src/data/promotions.js', 'src/data/synergies.js',
  'src/core/util.js', 'src/core/synergy.js'
];
const ctx = { console, Math: Object.create(Math), Date, JSON };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Synergy = vm.runInContext('Synergy', ctx);
const SYNERGIES = vm.runInContext('SYNERGIES', ctx);
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`✓ ${message}`); };

const goblin = n => ({ uid: n, name: 'ゴブ' + n, race: 'ゴブリン', rankId: 'soldier', salary: 2,
  traits: ['coward', 'pickpocket'], tags: [] });
const ogre = n => ({ uid: 100 + n, name: 'オーガ' + n, race: 'オーガ', rankId: 'soldier', salary: 7,
  traits: ['brute'], tags: [] });
const find = (list, id) => list.find(e => e.id === id);

// 軍団で数え、出撃者へ適用する。控えを足す予告でも本番と同じ値になる。
const three = [goblin(1), goblin(2), goblin(3)];
const four = [...three, goblin(4)];
const five = [...four, goblin(5)];
const horde3 = find(Synergy.preview(three, {slots:5, pool:four}), 'goblin_horde');
assert(horde3.active && Math.abs(horde3.now.dmgMult - 1.12) < .001,
  '軍団4体・出撃3体なら出撃ゴブリンを1.12倍にする');
assert(horde3.now.affected === 3, '効果対象は出撃3体だけ');
assert(horde3.viaRecruit && Math.abs(horde3.next.dmgMult - 1.24) < .001,
  '控えをもう1人採用すれば出撃枠を変えず1.24倍になる');
const horde5 = find(Synergy.preview(five, {slots:5, pool:five}), 'goblin_horde');
assert(Math.abs(horde5.now.dmgMult - 1.24) < .001, '軍団5体では1.24倍');
assert(horde5.viaRecruit && Math.abs(horde5.next.dmgMult - 1.36) < .001,
  '出撃枠が満員でも軍団への追加採用を予告する');
const mixed = [...three, ogre(1), ogre(2)];
const hordeMixed = find(Synergy.preview(mixed, {slots:5, pool:[...mixed, goblin(4)]}), 'goblin_horde');
assert(hordeMixed.swapOutRace === null && hordeMixed.viaRecruit, '軍団条件のためオーガを外す案内はしない');
const two = [goblin(1), goblin(2)];
const horde2 = find(Synergy.preview(two, {slots:5, pool:two}), 'goblin_horde');
assert(!horde2.active && horde2.need === 2 && horde2.needRace === 'ゴブリン', '2体ならあと2体で発火');
const legion = find(Synergy.preview(two, {slots:5, pool:two}), 'legion_of_dead');
assert(!legion.active && legion.need === null, '異なる能力が必要なら同じ人材の追加だけでは届かない');
const original = SYNERGIES.find(s => s.id === 'goblin_horde').apply;
SYNERGIES.find(s => s.id === 'goblin_horde').apply = function(units) {
  for (const u of units) if (u.race === 'ゴブリン') u.mods.dmgMult *= 3;
};
const tripled = find(Synergy.preview(three, {slots:5, pool:four}), 'goblin_horde');
assert(Math.abs(tripled.now.dmgMult - 3) < .001, '説明文でなく実際の適用結果を測る');
SYNERGIES.find(s => s.id === 'goblin_horde').apply = original;
// ── 5. 予告は編成を書き換えない ────────────────────────
const squad = [goblin(1), goblin(2), goblin(3), ogre(1)];
const before = JSON.stringify(squad);
Synergy.preview(squad, { slots: 5 });
assert(JSON.stringify(squad) === before, '予告の計算がロスターを書き換えない（使い捨ての写しで測る）');
assert(squad.every(u => u.mods === undefined), 'ロスターへ mods を生やさない');

// ── 6. 被ダメージ側の効果も出す ───────────────────────
const elite = [
  { uid: 1, name: '精鋭1', race: 'オーガ', rankId: 'soldier', salary: 6, traits: [], tags: [] },
  { uid: 2, name: '精鋭2', race: 'インプ', rankId: 'soldier', salary: 6, traits: [], tags: [] }
];
const few = find(Synergy.preview(elite, { slots: 5 }), 'elite_few');
assert(few.active && Math.abs(few.now.dmgMult - 1.8) < 0.001 && Math.abs(few.now.takenMult - 0.6) < 0.001,
  '与ダメージと被ダメージの両方を測る（精鋭主義 ×1.80 / ×0.60）');

// ── 7. 編成で決まる特性の効き目も実測する ──────────────────
// シナジーだけでは「混ぜると倍率を二重に失う」の片方しか見えない
// ロスターのモンスターは alive を持たない。テストも同じ形で測る
// （alive: true を足した作り物で測ると、実際の編成画面では0になる不具合を見逃す）
const packed = n => Array.from({ length: n }, (_, i) => ({
  uid: i + 1, name: 'ゴブ' + (i + 1), race: 'ゴブリン', rankId: 'soldier', salary: 2,
  loyalty: 70, traits: ['coward', 'pack'], tags: []
}));
const packThree = Synergy.traitEffects(packed(3));
const fivePack = Synergy.traitEffects(packed(5));
assert(packThree.length === 3 && Math.abs(packThree[0].mult - 1.2) < 0.001,
  '《群れの本能》は同族3体で ×1.20');
assert(Math.abs(fivePack[0].mult - 1.4) < 0.001, '同族5体なら ×1.40（頭数で伸びる）');
const mixedSquad = [...packed(3), { uid: 90, name: 'オーガ', race: 'オーガ', rankId: 'soldier',
  salary: 7, loyalty: 90, traits: ['loyal_dog'], tags: [] }];
const mixedEffects = Synergy.traitEffects(mixedSquad);
assert(mixedEffects.find(e => e.name === 'ゴブ1').mult < fivePack[0].mult,
  '混ぜると《群れの本能》の倍率が落ちる（シナジーと二重に失う）');
assert(mixedEffects.some(e => e.traits.some(t => t.name === '忠犬')),
  '忠誠のように編成で決まる特性も測る');
// 状況で決まる特性（卑怯者＝敵HP半分以下、先制＝ラウンド1）は編成画面に出さない
assert(!packThree[0].traits.some(t => t.name === '卑怯者'),
  '敵の状態で決まる特性は「いまの並びの効き目」に混ぜない');
assert(Synergy.traitEffects([]).length === 0, '空の編成でも落ちない');
const untouched = packed(2);
const snapshot = JSON.stringify(untouched);
Synergy.traitEffects(untouched);
assert(JSON.stringify(untouched) === snapshot, '特性の測定も編成を書き換えない');

// ── 8. 採用前に既存軍団との発火経路を読める ──────────────────
const looter = { uid: 201, name: '盗賊', race: 'ゴブリン', traits: ['pickpocket'], tags: [] };
const greedyApplicant = { uid: 202, name: '欲張り', race: 'インプ', traits: ['greedy'], tags: [] };
const greedLinks = Synergy.connections(greedyApplicant, [looter]);
assert(greedLinks.some(link => link.from === '追い剥ぎ' && link.signal === '金貨獲得' && link.to === '強欲'),
  '既存の追い剥ぎ → 金貨獲得 → 応募者の強欲を採用前に示す');
const reverseLinks = Synergy.connections(looter, [greedyApplicant]);
assert(reverseLinks.some(link => link.from === '追い剥ぎ' && link.signal === '金貨獲得' && link.to === '強欲'),
  '応募者が起点を作り、既存軍団が反応する逆向きの接続も示す');
const necro = { uid: 203, name: 'ネクロ', race: '死霊術師', traits: ['necromancy', 'gravekeeper'], tags: ['caster'] };
const harvester = { uid: 204, name: '骨', race: '骸骨兵', traits: ['soul_harvest'], tags: ['undead'] };
const deathLinks = Synergy.connections(harvester, [necro]);
assert(deathLinks.some(link => link.signal === '蘇生' && link.from === '死霊術' && link.to === '魂の徴収'),
  '死霊術 → 蘇生 → 魂の徴収の異種族接続を示す');
assert(Synergy.connections({ traits: ['coward'] }, [looter]).length === 0,
  '直接つながらない能力を無理にシナジー扱いしない');
const ledger = { id: 'extortion_ledger', name: '恐喝帳簿', links: { reacts: ['金貨獲得'], emits: ['攻撃強化'] } };
const facilityLinks = Synergy.connections(looter, [], [ledger]);
assert(facilityLinks.some(link => link.from === '追い剥ぎ' && link.signal === '金貨獲得' && link.to === '恐喝帳簿'),
  '稼働施設を軍団側の要素として履歴書の接続へ含める');

console.log('シナジー予告テスト完了');
