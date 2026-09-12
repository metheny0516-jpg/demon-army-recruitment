// 逃亡の猶予と慰留（2026-09-12）：忠誠0で即去らず一度は荷物をまとめる。慰留（retain）で戻る。次の決着まで0なら去る。
//   node tools/test-retain.js
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/traces.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };

Game.newRun();
const st = Game.state;
const m = Game.rollApplicant('goblin'); m.uid = 501; m.loyalty = 0; m.salary = 3;
st.roster = [m]; st.activeUids = [501]; st.gold = 20;
let notes = [];
Game.processDepartures(notes);
assert(st.roster.length === 1 && m.leaving === true, '忠誠0でも一度目は去らず、荷物をまとめる（leaving）');
assert(notes.some(n => /荷物をまとめ/.test(n)), `日誌に予告が出る（${notes[0]}）`);
assert(Game.canRetain(m) && Game.retainCost(m) === 6, `慰留できる（給与3の2倍＝${Game.retainCost(m)}G）`);
const out = Game.retain(501);
assert(out && st.gold === 14 && m.loyalty === 30 && m.leaving === false && m.unpaid === false, `慰留：14G残り、忠誠30、荷物を解く（${JSON.stringify(out)}）`);
notes = [];
Game.processDepartures(notes);
assert(st.roster.length === 1 && !m.leaving, '忠誠が戻っていれば去らない');
m.loyalty = 0; notes = [];
Game.processDepartures(notes);
assert(m.leaving === true && st.roster.length === 1, 'また0になれば再び荷物をまとめる（猶予は毎回）');
notes = [];
Game.processDepartures(notes);
assert(st.roster.length === 0 && notes.some(n => /去った/.test(n)), '次の決着まで0のままなら去る');
assert((st.departed || []).some(d => d.uid === 501 && d.cause === 'deserted'), '去った者は departed に deserted で残る');
st.gold = 2; const m2 = Game.rollApplicant('imp'); m2.uid = 502; m2.loyalty = 10; m2.salary = 3; st.roster = [m2];
assert(!Game.canRetain(m2) && Game.retain(502) === false, '金が足りなければ慰留できない');
m2.loyalty = 60; st.gold = 50;
assert(!Game.canRetain(m2), `忠誠が ${Game.RETAIN_THRESHOLD} を超えていれば慰留は出ない`);
console.log(failed ? `\n失敗 ${failed}` : '\n全通過');
process.exitCode = failed ? 1 : 0;
