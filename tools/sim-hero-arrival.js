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

// 迎撃1回。squad は人物ID。面接を通さず直接名簿へ入れて数値だけを見る。
function interception(squadIds, opts = {}) {
  const w = W.newWorld({ seed: opts.seed || 1, allApplicants: true });
  for (const id of squadIds) {
    const p = W.person(w, id);
    if (!p) throw new Error('no such person: ' + id);
    if (!p.hired) {
      p.hired = true;
      p.assignment = 'guard';
      W.HIDDEN_TRAITS[p.hidden].apply(p);   // 採用時と同じく隠れた性質を効かせる
    }
  }
  if (opts.trained) W.person(w, 'garo').merit = 5;   // 近郊警戒を1回こなした想定
  if (opts.drink) {
    w.facts.push({ verb: 'consume', actor: 'allen', target: 'allen', drinkId: opts.drink, source: 'mog' });
  }
  return fight(squadIds.map(id => W.toUnit(W.person(w, id))), W.heroUnits(w));
}

function run(label, squadIds, opts) {
  let wins = 0, rounds = 0, deaths = 0;
  const takenBy = {};
  for (let i = 0; i < N; i++) {
    const r = interception(squadIds, Object.assign({ seed: i + 1 }, opts));
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
// 予算6G・枠3 で**実際に組める**編成だけを比べる（7G の編成は組めないので出さない）
const cheap = ['garo', 'gantz', 'honekichi', 'boru', 'pipi'];             // 1+1+1 = 3G
const power = ['garo', 'gantz', 'honekichi', 'boru', 'rize'];             // 1+1+3 = 5G
const shop  = ['garo', 'gantz', 'mog', 'honekichi', 'boru'];              // 2+1+1 = 4G
run('安く5人そろえる（3G）', cheap);
run('安く5人＋火力1枚（5G）', power);
run('4人で火力に寄せる（リゼ+レナ 6G）', ['garo', 'gantz', 'rize', 'rena']);
run('追加採用なし（在籍2名のみ）', ['garo', 'gantz']);
console.log('');
run('同じ5人＋ガロを近郊警戒で育てた', power, { trained: true });
run('同じ5人＋前衛をガンツへ', ['gantz', 'garo', 'honekichi', 'boru', 'rize']);
console.log('');
run('店に1枠（モグ）＝賭けが外れた', shop);
run('店に1枠（モグ）＝新酒が通った', shop, { drink: 'ale' });
run('店に1枠（ドゥバ3G）＝蒸留酒が通った', ['garo', 'gantz', 'duba', 'honekichi', 'boru'], { drink: 'spirit' });
console.log('');
const both = ['garo', 'gantz', 'mog', 'rize', 'honekichi'];   // 2+3+1 = 6G ちょうど
run('店も火力も取る（6G）＝外れた', both);
run('店も火力も取る（6G）＝通った', both, { drink: 'ale' });
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
