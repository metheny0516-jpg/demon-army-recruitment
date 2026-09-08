// 魔界史へ残す「記憶」1件（R3）。
//
// 守りたい性質:
//   1. ランで一番遠くまで届いた出来事が1件だけ残る
//   2. 戦闘限りのID（p0/x0・根拠eventId）を魔界史へ持ち込まない。名前だけで自立して読める
//   3. 再起で巻き戻せば記憶も戻る（やり直した歴史の出来事は残さない）
//   4. 何も繋がらなかったランでは null のまま（統計だけの記録に嘘の話を足さない）
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
const assert = (c, m) => { if (!c) throw new Error('✗ ' + m); console.log(`✓ ${m}`); };

const spot = (kind, dmg, killed, names) => ({
  defVersion: 1, candidateCount: 1, kind,
  origin: { id: 'p0', name: names[0] }, originAbility: '追い剥ぎ',
  actor: { id: 'p1', name: names[1] }, ability: { id: 'greedy', name: '強欲' },
  target: { id: 'x0', name: '衛兵' }, sameActor: false,
  numbers: { dmg, actions: 1, killed }, evidence: ['e1', 'e2', 'e3']
});
const stage = { army: '王国巡回隊', region: '辺境' };

console.log('▼ 一番遠くまで届いた1件が残る');
{
  Game.newRun();
  assert(Game.state.memory === null, '始めは記憶なし');
  Game.state.turn = 1;
  Game.rememberSpotlight(spot('revive_return', 5, false, ['ネル', 'ガロ']), stage, true);
  assert(Game.state.memory.actor.name === 'ガロ', '最初の1件が入る');
  Game.state.turn = 2;
  Game.rememberSpotlight(spot('loot_relay', 44, true, ['グルグ', 'ボル']), stage, true);
  assert(Game.state.memory.actor.name === 'ボル', '撃破まで届いた回が上書きする');
  Game.state.turn = 3;
  Game.rememberSpotlight(spot('revive_return', 3, false, ['ネル', 'ゾロ']), stage, true);
  assert(Game.state.memory.actor.name === 'ボル', '届かなかった回では上書きしない');
  Game.state.turn = 4;
  Game.rememberSpotlight(spot('loot_relay', 90, true, ['グルグ', 'ドス']), stage, true);
  assert(Game.state.memory.actor.name === 'ドス', '同じ到達度なら大きいほうを採る');
}

console.log('▼ 戦闘限りのIDを魔界史へ持ち込まない');
{
  const m = Game.state.memory;
  const json = JSON.stringify(m);
  assert(!json.includes('"p0"') && !json.includes('"x0"'), '戦闘中の人物IDが残っていない');
  assert(!json.includes('e1') && !m.evidence, '根拠イベントIDが残っていない（戦闘が終われば何も指さない）');
  assert(m.origin.name && m.actor.name && !('id' in m.origin), '名前だけで自立して読める形になっている');
  assert(m.turn === 4 && m.army === '王国巡回隊', 'いつ・誰との戦いかが添えてある');
}

console.log('▼ 魔界史へ載る');
{
  Game.endRun(false);
  const record = Game.state.record;
  assert(record.memory && record.memory.actor.name === 'ドス', 'ラン記録に記憶が入る');
  const history = JSON.parse(store['maou_history']);
  assert(history[history.length - 1].memory.actor.name === 'ドス', '保存された魔界史から読み直せる');
}

console.log('▼ 何も繋がらなかったランには足さない');
{
  Game.newRun();
  Game.rememberSpotlight(null, stage, true);
  Game.endRun(false);
  assert(Game.state.record.memory === null, '証拠が無いランの記録に、嘘の話を足さない');
}

console.log('▼ 再起で巻き戻せば記憶も戻る');
{
  Game.newRun();
  Game.state.turn = 1;
  Game.rememberSpotlight(spot('loot_relay', 20, true, ['前の', '記憶']), stage, true);
  Game.saveCheckpoint();
  Game.state.turn = 2;
  Game.rememberSpotlight(spot('loot_relay', 99, true, ['やり直した', '出来事']), stage, true);
  assert(Game.state.memory.origin.name === 'やり直した', '巻き戻す前は新しいほう');
  Game.retry();
  assert(Game.state.memory.origin.name === '前の',
    'やり直した歴史の出来事は残らない（チェックポイントごと戻る）');
}

console.log('✓ 魔界史の記憶：一番遠い1件・名前だけで自立・再起で戻る・嘘を足さない');
