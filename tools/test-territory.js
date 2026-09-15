// 地図の上の戦争・段階A：土地20＋部族10のデータと Territory の純粋関数（docs/DESIGN_WORLD_CAMPAIGN_2026-09-15.md）。
//   node tools/test-territory.js
const fs = require('fs'), vm = require('vm');
const ctx = { console };
vm.createContext(ctx);
for (const f of ['src/data/territories.js', 'src/core/territory.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const T = vm.runInContext('Territory', ctx);
const LANDS = vm.runInContext('TERRITORY_LANDS', ctx), TRIBES = vm.runInContext('TERRITORY_TRIBES', ctx), KINDS = vm.runInContext('TERRITORY_KINDS', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };

console.log('▼ 1. データの形');
assert(LANDS.length === 20 && TRIBES.length === 10, `土地20＋部族10（${LANDS.length}+${TRIBES.length}）`);
assert(LANDS.every(p => KINDS[p.kind]), '土地の kind は全部 TERRITORY_KINDS にある');
assert(new Set(LANDS.concat(TRIBES).map(p => p.id)).size === 30, 'id が重複しない');
assert(LANDS.concat(TRIBES).every(p => p.garrison >= 1 && p.garrison <= 14), 'garrison は段階表の 1〜14');
assert(LANDS.concat(TRIBES).every(p => (p.adj || []).every(a => a === 'castle' || T.byId(a))), '隣接は全部存在する id');
assert(LANDS.filter(p => p.act === 1).length === 12 && TRIBES.filter(p => p.act === 1).length === 8, '第一幕は土地12・部族8');
assert(LANDS.filter(p => p.kind === 'capital').length === 2, '都は2つ（幕ごとに1）');

console.log('▼ 2. グラフ：魔王城から全部へ道がある');
{
  const seen = new Set(['castle']); const q = ['castle'];
  while (q.length) for (const n of T.neighbors(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert(seen.size === 31, `魔王城から30か所すべてへ到達（${seen.size - 1}）`);
  assert(T.neighbors('castle').sort().join() === 'h01,t01,t02', `魔王城の隣は 辺境の村・ゴブリンの丘・沼（${T.neighbors('castle').sort().join()}）`);
}

console.log('▼ 3. 候補と領土');
{
  const st = { turn: 0, act: 1 };
  const f0 = T.frontier(st).map(p => p.id).sort();
  assert(f0.join() === 'h01,t01,t02', `最初の候補は魔王城の隣3つ（${f0.join()}）`);
  let c = T.candidates(st, () => 0);
  assert(c.length === 3, `候補は3つ（${c.length}）`);
  T.take(st, 'h01'); T.take(st, 'h02');
  const f1 = T.frontier(st).map(p => p.id).sort();
  assert(f1.includes('h03') && f1.includes('h04') && !f1.includes('h06'), `橋の向こうの関所は、橋を落とすまで出ない（${f1.join()}）`);
  assert(!T.frontier(st).some(p => p.act === 2), '第一幕に第二幕の場所は出ない');
  st.turn = 1; c = T.candidates(st, () => 0.99);
  assert(c.filter(p => T.isTribe(p.id)).length >= 1 && c.filter(p => T.isLand(p.id)).length >= 1, `人間界と魔界が両方混ざる（${c.map(p => p.id).join()}）`);
  T.take(st, 'h04'); T.take(st, 'h06'); T.take(st, 'h08');
  const e = T.effects(st);
  assert(e.food === 2 && e.applicants === 1 && e.gold === 3 && e.defenseLine === 1, `効き目の合計（食料${e.food}・応募${e.applicants}・金${e.gold}・防衛線${e.defenseLine}）`);
  T.take(st, 't02');
  assert(T.effects(st).recruit.join() === 'slime', '従えた部族の種族が recruit に載る');
  assert(T.conquestOf(st) === Math.floor(5 * 8 / 12), `征服度の互換（土地5→${T.conquestOf(st)}）`);
  for (const id of ['h03', 'h05', 'h07', 'h09', 'h10', 'h11', 'h12']) T.take(st, id);
  assert(T.conquestOf(st) === 8, '王都を落とせば征服度 8');
  T.lose(st, 'h08');
  assert(!T.has(st, 'h08') && T.effects(st).gold === 0, '奪い返されると効き目も消える');
}

console.log('▼ 4. 贈ると巡回');
assert(T.tributeCost('t02').gold === 8 && T.tributeCost('t02').food === 4, '沼（段階1）は金8・食料4で贈れる');
assert(T.tributeCost('t01') === null, '首領のいるゴブリンの丘は贈れない');
assert(T.tributeCost('h01') === null, '人間界の土地は贈れない');
assert(T.patrolStage({ territory: { lands: [], tribes: [] } }) === 1 && T.patrolStage({ territory: { lands: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], tribes: [] } }) === 2, '巡回の段階は領土で 1→2、上限2');

console.log(failed ? `\n失敗 ${failed}` : '\n全通過');
process.exitCode = failed ? 1 : 0;
