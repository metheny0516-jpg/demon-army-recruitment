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

// ── 1. いまの効き目を実測で出す ─────────────────────────
const three = [goblin(1), goblin(2), goblin(3)];
const horde3 = find(Synergy.preview(three, { slots: 5 }), 'goblin_horde');
assert(horde3.active && Math.abs(horde3.now.dmgMult - 1.15) < 0.001,
  'ゴブリン3体の与ダメージ倍率を ×1.15 と実測する');
assert(horde3.now.affected === 3, '効果の対象人数を数える');

const five = [goblin(1), goblin(2), goblin(3), goblin(4), goblin(5)];
const horde5 = find(Synergy.preview(five, { slots: 5 }), 'goblin_horde');
assert(Math.abs(horde5.now.dmgMult - 1.45) < 0.001, 'ゴブリン5体では ×1.45 まで伸びる（3体の3倍）');

// ── 2. あと1体で / 入れ替えると ────────────────────────
assert(horde3.next && Math.abs(horde3.next.dmgMult - 1.30) < 0.001,
  '枠が空いていれば「あと1体で ×1.30」を出す');
assert(horde3.swapOutRace === null, '枠が空いているときは入れ替えを勧めない');
assert(horde5.next === null, '出撃枠が埋まり、これ以上伸びないなら何も勧めない');

const mixed = [goblin(1), goblin(2), goblin(3), ogre(1), ogre(2)];
const hordeMixed = find(Synergy.preview(mixed, { slots: 5 }), 'goblin_horde');
assert(hordeMixed.next && Math.abs(hordeMixed.next.dmgMult - 1.30) < 0.001,
  '枠が埋まっていれば「入れ替えると ×1.30」を出す');
assert(hordeMixed.swapOutRace === 'オーガ' && hordeMixed.nextRace === 'ゴブリン',
  '誰を誰に替えればよいかを名指しする（混ぜると倍率を失うことが見える）');

// ── 3. 未発動でも「あと何体」を実測で出す ────────────────────
const two = [goblin(1), goblin(2)];
const horde2 = find(Synergy.preview(two, { slots: 5 }), 'goblin_horde');
assert(!horde2.active && horde2.need === 1 && horde2.needRace === 'ゴブリン',
  '未発動なら「あと1体（ゴブリン）」で届くと出す');
const legion = find(Synergy.preview(two, { slots: 5 }), 'legion_of_dead');
assert(!legion.active && legion.need === null,
  '手持ちを増やしても届かないシナジーには「あと何体」を出さない');

// ── 4. 説明文ではなく実際の apply を測っている ─────────────────
// 定義の効果を変えたら表示も変わること（説明文を写しているだけなら変わらない）
const original = SYNERGIES.find(s => s.id === 'goblin_horde').apply;
SYNERGIES.find(s => s.id === 'goblin_horde').apply = function (units) {
  for (const u of units) if (u.race === 'ゴブリン') u.mods.dmgMult *= 3;
};
const tripled = find(Synergy.preview(three, { slots: 5 }), 'goblin_horde');
assert(Math.abs(tripled.now.dmgMult - 3) < 0.001, '効果量は説明文ではなく実際の適用結果から取る');
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

console.log('シナジー予告テスト完了');
