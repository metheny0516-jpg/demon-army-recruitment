// 前回出撃との差分（R2）。
//
// 守りたい性質:
//   1. 「何を変えたか」だけを答える。勝敗も戦闘結果も見ない（効果を捏造する材料にしない）
//   2. 比較する前が無いとき（初戦・旧セーブ）は差分なし。「全部変えた」と読み替えない
//   3. 顔ぶれが同じでも並び順が変われば「配置を変えた」と分かる（先頭ほど狙われる）
//   4. 再起で巻き戻せば比較の基準も戻る
//   5. KPI の試行判定と見る次元がずれていない
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js', 'src/data/monsters.js', 'src/data/promotions.js',
  'src/data/departments.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/battle_happenings.js', 'src/data/events.js', 'src/data/missions.js',
  'src/data/achievements.js', 'src/data/demon_kings.js', 'src/data/portraits.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/kpi.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/spotlight.js', 'src/core/run.js'];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; } } };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Game = vm.runInContext('Game', ctx);
const KPI = vm.runInContext('KPI', ctx);
const Spotlight = vm.runInContext('Spotlight', ctx);
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); console.log(`✓ ${m}`); };

const unit = (uid, name) => ({ uid, tplId: 'goblin', name, race: 'ゴブリン', job: '', hp: 30, atk: 8,
  def: 2, spd: 7, salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false });
const mission = { missionKind: 'invade' };

console.log('▼ 比較する前が無いとき');
{
  Game.newRun();
  Game.state.roster = [unit(1, 'ゴブ太'), unit(2, 'ゴブ次')];
  Game.state.activeUids = [1, 2];
  const snap = Game.buildSnapshot(mission);
  const d = Game.buildChanges(null, snap);
  assert(d.first === true, '前が無いことを first で示す');
  assert(d.hired.length === 0 && d.deployed.length === 0 && d.changedUids.length === 0,
    '「全部変えた」と読み替えない（差分は空）');
}

console.log('▼ 採用・出撃・入れ替え');
{
  Game.newRun();
  Game.state.roster = [unit(1, 'ゴブ太'), unit(2, 'ゴブ次'), unit(3, '控えのゴブ三')];
  Game.state.activeUids = [1, 2];
  const before = Game.buildSnapshot(mission);
  // 新顔を採用して出す。ゴブ次を外し、控えのゴブ三も出す
  Game.state.roster.push(unit(4, '新顔のゴブ四'));
  Game.state.activeUids = [1, 3, 4];
  const after = Game.buildSnapshot(mission);
  const d = Game.buildChanges(before, after);
  assert(d.hired.map(x => x.name).join() === '新顔のゴブ四', '前回の軍団にいなかった人は「採用」');
  assert(d.deployed.map(x => x.name).join() === '控えのゴブ三', '控えから出した人は「出撃」');
  assert(d.benched.map(x => x.name).join() === 'ゴブ次', '外した人も分かる');
  assert(d.changedUids.sort().join() === '2,3,4', '今回動かした人は採用・出撃・留守番へ回した3人（外した者は留守番に変わる）');
}

console.log('▼ 顔ぶれが同じでも並び順が変われば配置を変えたと分かる');
{
  Game.newRun();
  Game.state.roster = [unit(1, 'ゴブ太'), unit(2, 'ゴブ次')];
  Game.state.activeUids = [1, 2];
  const before = Game.buildSnapshot(mission);
  Game.state.activeUids = [2, 1];
  const d = Game.buildChanges(before, Game.buildSnapshot(mission));
  assert(d.reordered === true, '並び順が変われば reordered（先頭ほど狙われるので意味が違う）');
  assert(d.hired.length === 0 && d.deployed.length === 0, '出入りはしていないので採用・出撃は空');
}

console.log('▼ 戦闘結果を見ていない');
{
  const src = fs.readFileSync('src/core/run.js', 'utf8');
  const body = src.slice(src.indexOf('  buildChanges(prev, next) {'));
  const fn = body.slice(0, body.indexOf('\n  },'));
  assert(!/victory|result|timeline|dmg|勝/.test(fn),
    'buildChanges は勝敗も戦闘結果も参照しない（効果を捏造する材料にしない）');
}

console.log('▼ KPIの試行判定と次元がずれていない');
{
  Game.newRun();
  Game.state.roster = [unit(1, 'ゴブ太'), unit(2, 'ゴブ次')];
  Game.state.activeUids = [1, 2];
  const snapA = Game.buildSnapshot(mission);
  const printA = KPI.fingerprint(Game.state, mission);
  Game.state.activeUids = [2, 1];
  const snapB = Game.buildSnapshot(mission);
  const printB = KPI.fingerprint(Game.state, mission);
  const diff = Game.buildChanges(snapA, snapB);
  const kpiChanged = printA !== printB;
  const buildChanged = diff.reordered || diff.hired.length || diff.deployed.length
    || diff.benched.length || diff.reassigned.length;
  assert(kpiChanged === !!buildChanged,
    `並び替えを両方が同じに判定する（KPI:${kpiChanged} 差分:${!!buildChanged}）`);
}

console.log('▼ 「今回動かした人」が戦果の1文の選び方に効く');
{
  const timeline = [
    { type: 'battle_start', eventId: 'e0',
      player: [{ id: 'p0', name: 'ネル' }, { id: 'p1', name: 'ガロ' },
        { id: 'p2', name: 'グルグ' }, { id: 'p3', name: 'ボル' }],
      enemy: [{ id: 'x0', name: '騎士' }] },
    // 撃破まで届いた略奪の連鎖（動かしていない人たち）
    { type: 'resource_gain', eventId: 'e1', chainId: 'e1', sourceId: 'p2', resource: 'gold', amount: 1, label: '追い剥ぎ' },
    { type: 'trait_trigger', eventId: 'e2', parentEventId: 'e1', sourceId: 'p3', traitId: 'greedy', name: '強欲' },
    { type: 'attack', eventId: 'e3', parentEventId: 'e2', fromId: 'p3', toId: 'x0', dmg: 40, dead: true },
    // 撃破まで届かない蘇生（今回動かした人）
    { type: 'revive', eventId: 'e4', unitId: 'p1', sourceId: 'p0', traitId: 'necromancy' },
    { type: 'attack', eventId: 'e5', fromId: 'p1', toId: 'x0', dmg: 3 }
  ];
  const plain = Spotlight.of(timeline);
  assert(plain.kind === 'loot_relay' && plain.changedActor === false,
    '誰も動かしていなければ、結果が遠くまで届いたほうを採る');
  const aimed = Spotlight.of(timeline, { highlightIds: ['p0', 'p1'] });
  assert(aimed.kind === 'revive_return', '今回動かした人が実際に働いた回は、そちらを先に採る');
  assert(aimed.changedActor === true, '「今回動かした人」の印が立つ');
  const untouched = Spotlight.of(timeline, { highlightIds: ['p9'] });
  assert(untouched.changedActor === false, '動かしただけで働いていない人には印を立てない');
}

console.log('▼ 再起で比較の基準も戻る');
{
  Game.newRun();
  Game.state.roster = [unit(1, 'ゴブ太'), unit(2, 'ゴブ次')];
  Game.state.activeUids = [1, 2];
  Game.state.lastBuildSnapshot = Game.buildSnapshot(mission);
  Game.saveCheckpoint();
  Game.state.activeUids = [2];
  Game.state.lastBuildSnapshot = Game.buildSnapshot(mission);
  assert(Game.state.lastBuildSnapshot.deployed.length === 1, '巻き戻す前は新しい基準');
  Game.retry();
  assert(Game.state.lastBuildSnapshot.deployed.length === 2,
    'やり直したら比較の基準もチェックポイントへ戻る');
}

console.log('✓ 前回出撃との差分：結果を見ない・前が無ければ空・配置も見る・戦果の選び方へ効く');
