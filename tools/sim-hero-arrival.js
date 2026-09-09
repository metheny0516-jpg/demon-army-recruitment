// 勇者襲来 縦切り試作の数値校正。
//   node tools/sim-hero-arrival.js [回数]
//
// 見るのは勝率そのものより「差が出るか」。
//   ・前衛をガロ／ガンツに入れ替えて、被弾する人物と持ちこたえ方が変わるか
//   ・ガロの育成前／後で、生存や行動の余裕が実際に増えるか
//   ・酒を飲ませた回（アレン速度-2）と断られた回で差が出るか
// 差が出ないなら、演出でごまかさず数値へ戻る（設計 3.6）。
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/synergies.js',
  'src/core/util.js', 'src/core/synergy.js', 'src/core/battle.js'
];
const ctx = { console, Math, Date, JSON };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const Battle = vm.runInContext('Battle', ctx);
const W = require(path.join(ROOT, 'src/prototype/hero_arrival_world.js'));

const N = Number(process.argv[2] || 200);

function fight(playerRaw, enemyRaw) {
  const p = playerRaw.map(u => Battle.makeUnit(u, 'player'));
  const e = enemyRaw.map(u => Battle.makeUnit(u, 'enemy'));
  return Battle.simulate(p, e);
}

// 迎撃1回。squad は人物ID、opts で育成と酔いを切り替える。
function interception(squadIds, opts = {}) {
  const w = W.newWorld({ seed: 1, guestCondition: opts.drunk ? 'B' : 'A' });
  for (const id of squadIds) if (!W.person(w, id).hired) W.hire(w, id, 'guard');
  if (opts.trained) {
    const garo = W.person(w, 'garo');
    garo.merit = 5;               // 近郊警戒を1回こなした想定（小隊長）
  }
  if (opts.drunk) {
    w.facts.push({ verb: 'consume', actor: 'allen', target: 'allen', itemId: 'sake', effect: 'drunk', source: 'mog' });
  }
  const squad = squadIds.map(id => W.toUnit(W.person(w, id)));
  return fight(squad, W.heroUnits(w));
}

function run(label, squadIds, opts) {
  let wins = 0, rounds = 0, deaths = 0;
  const takenBy = {};
  for (let i = 0; i < N; i++) {
    const r = interception(squadIds, opts);
    if (r.victory) wins++;
    rounds += r.rounds;
    for (const c of r.contribution) {
      if (!c.survived) deaths++;
      takenBy[c.name] = (takenBy[c.name] || 0) + c.taken;
    }
  }
  const top = Object.entries(takenBy).sort((a, b) => b[1] - a[1])
    .slice(0, 3).map(([n, v]) => `${n} ${Math.round(v / N)}`).join(' / ');
  console.log(
    `${label.padEnd(34)} 勝率 ${String(Math.round(wins / N * 100)).padStart(3)}%` +
    `  平均${(rounds / N).toFixed(1)}R  戦没${(deaths / N).toFixed(2)}人/戦  被弾: ${top}`
  );
  return wins / N;
}

console.log(`勇者襲来 試作の迎撃 — 各${N}回\n`);
const standard = ['garo', 'gantz', 'honekichi', 'rize', 'rena'];
run('標準5名（ガロ先頭・育成なし）', standard);
run('標準5名（ガロ先頭・育成あり）', standard, { trained: true });
run('前衛をガンツへ（育成なし）', ['gantz', 'garo', 'honekichi', 'rize', 'rena']);
run('リゼを外して職人モグを入れる', ['garo', 'gantz', 'honekichi', 'mog', 'rena']);
run('4名（レナなし）', ['garo', 'gantz', 'honekichi', 'rize']);
console.log('');
run('標準5名・相手が酒を飲んでいる', standard, { drunk: true });
run('標準5名・育成あり＋酒', standard, { trained: true, drunk: true });
console.log('');
// 近郊警戒そのもの（ガロ単独で行かせる回）
let survived = 0, promoted = 0;
for (let i = 0; i < N; i++) {
  const w = W.newWorld({ seed: i + 1 });
  const garo = W.person(w, 'garo');
  const r = fight([W.toUnit(garo)], W.PATROL_PARTY.map(e => ({ ...e, race: '人間', traits: [], tags: [] })));
  const c = r.contribution[0];
  if (c.survived) { survived++; if (garo.merit + (r.victory ? 2 : 1) >= 4) promoted++; }
}
console.log(`近郊警戒（ガロ単独）  生還 ${Math.round(survived / N * 100)}%  昇進到達 ${Math.round(promoted / N * 100)}%`);
