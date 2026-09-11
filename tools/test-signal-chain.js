// 連鎖の見取り図（Synergy.signalChain）。ゴブリンの略奪連鎖だけを対象にした試作。
//
// 守りたい性質:
//   1. 起点・反応・再発火が **links とシナジーの実際の check** から出ること（desc を読まない）
//   2. 成立していない役者を「成立している」と言わないこと
//   3. 欠けを埋める案は **いま手元にある駒** からしか出ないこと（完成レシピを公開しない）
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/monsters.js', 'src/data/promotions.js',
  'src/data/departments.js', 'src/data/synergies.js',
  'src/core/util.js', 'src/core/synergy.js'
];
const ctx = { console, Math: Object.create(Math), Date, JSON };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Synergy = vm.runInContext('Synergy', ctx);
const FACILITIES = vm.runInContext('FACILITIES', ctx);
const GOLD = '金貨獲得';
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); console.log(`✓ ${m}`); };
const has = (list, id) => list.some(n => n.id === id);

const unit = (uid, name, race, traits) => ({ uid, name, race, job: '', rankId: 'soldier', salary: 2, traits, tags: [] });
const thief = (n) => unit(n, 'ゴブ' + n, 'ゴブリン', ['pickpocket']);
const greed = (n) => unit(n, 'コボ' + n, 'コボルト', ['greedy']);
const plain = (n) => unit(200 + n, 'オーガ' + n, 'オーガ', ['brute']);

console.log('▼ 起点だけが居るとき');
{
  const squad = [thief(1)];
  const map = Synergy.signalChain(GOLD, squad, { pool: squad, slots: 5 });
  assert(has(map.sources, 'pickpocket'), '《追い剥ぎ》が金貨獲得の起点として出る');
  assert(map.reactors.length === 0, '反応する者が居ないので反応は空');
  assert(map.loops === false, '反応が無いので再発火もしない');
  assert(map.sources[0].on === '自分が敵へ初めてダメージを与えたとき', '発火条件は links の on から出る');
  assert(map.sources[0].once === true, '追い剥ぎは一度きりだと分かる');
}

console.log('▼ 起点と反応がつながったとき');
{
  const squad = [thief(1), greed(2)];
  const map = Synergy.signalChain(GOLD, squad, { pool: squad, slots: 5 });
  assert(has(map.sources, 'pickpocket'), '起点は追い剥ぎ');
  assert(has(map.reactors, 'greedy'), '《強欲》が金貨獲得への反応として出る');
  assert(map.relaySignals.includes('追加攻撃'), '反応が次に出す信号は追加攻撃');
  assert(map.loops === false, '起点が一度きりのものだけなら、まだ回り続けはしない');
}

console.log('▼ ゴブリン2体で《追い剥ぎコンビ》が反応側に加わる');
{
  const squad = [thief(1), thief(2)];
  const map = Synergy.signalChain(GOLD, squad, { pool: squad, slots: 5 });
  assert(has(map.reactors, 'goblin_pair'), '成立したシナジーも反応として並ぶ');
  assert(map.reactors.find(n => n.id === 'goblin_pair').kind === 'synergy', 'シナジーだと区別できる');
}

console.log('▼ 何度も回る形になったとき');
{
  // ゴブリン4体で《ゴブリン軍団》＝撃破のたびに金貨（once ではない起点）
  const squad = [thief(1), thief(2), thief(3), greed(4)];
  const pool = squad.concat([thief(5)]);
  const map = Synergy.signalChain(GOLD, squad, { pool, slots: 5 });
  assert(has(map.sources, 'goblin_horde'), '《ゴブリン軍団》が繰り返し撃てる起点として出る');
  assert(map.sources.find(n => n.id === 'goblin_horde').once === false, '撃破のたびなので一度きりではない');
  assert(map.loops === true, '繰り返す起点＋追加攻撃を出す反応が揃えば、回り続けると言える');
}

console.log('▼ 欠けを埋める案は手持ちからしか出ない');
{
  // 出撃は追い剥ぎだけ。控えに強欲持ちが居る
  const bench = greed(9);
  const squad = [thief(1)];
  const map = Synergy.signalChain(GOLD, squad, { pool: [squad[0], bench], slots: 5 });
  const byBench = map.missing.filter(m => m.uid === bench.uid);
  assert(byBench.length === 1, '控えに居る強欲持ちが「出撃させる」案として1件出る');
  assert(byBench[0].role === 'reactor' && byBench[0].id === 'greedy', '役は反応側で、能力名は強欲');
  assert(byBench[0].how.includes('コボ9'), '誰を動かせばよいかが書いてある');
}
{
  // 手持ちに金貨関係の駒が一切無い編成では、案そのものが出ない（完成レシピを公開しない）
  const squad = [plain(1), plain(2)];
  const map = Synergy.signalChain(GOLD, squad, { pool: squad, slots: 5 });
  assert(map.sources.length === 0 && map.reactors.length === 0, '何も成立していない');
  assert(map.missing.every(m => m.kind === 'synergy'), '持っていない特性の名前は案に出さない');
  assert(!map.missing.some(m => m.id === 'greedy' || m.id === 'pickpocket'),
    '手元に無い《強欲》《追い剥ぎ》を「これを採れ」とは言わない');
}

console.log('▼ 施設は実際に働けるときだけ並ぶ');
{
  const ledger = FACILITIES.find(f => f.id === 'extortion_ledger');
  const squad = [thief(1)];
  const off = Synergy.signalChain(GOLD, squad, { pool: squad, slots: 5, facility: ledger, facilityReady: false });
  assert(!has(off.reactors, 'extortion_ledger'), '会計職が居ない＝働けない施設は反応に並ばない');
  const on = Synergy.signalChain(GOLD, squad, { pool: squad, slots: 5, facility: ledger, facilityReady: true });
  assert(has(on.reactors, 'extortion_ledger'), '条件を満たした施設は反応として並ぶ');
}

console.log('✓ 連鎖の見取り図：起点・反応・再発火・手持ちだけの案');
