// 現在の戦闘レンダラが標準速度で何秒かかるかを、実際のタイムラインで測る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js', 'src/core/util.js',
  'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js',
  'src/core/run.js', 'src/ui/battle_scene.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => k in store ? store[k] : null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const Scene = vm.runInContext('BattleScene', ctx);
const power = m => m.hp + m.atk * 3 + m.def * 2 + m.spd;

// 尺の計画は BattleScene.plan() が唯一の真実。ここでは再現せず、そのまま呼ぶ。
function measure(timeline, finalBattle) {
  Scene.isFinalBattle = finalBattle;
  const pacing = Scene.plan(timeline);
  return {
    ms: pacing.plannedMs,
    // 契約の測定指標: 尺のうち「縮めない事件」が占める割合
    protectedShare: pacing.plannedMs > 0 ? pacing.protectedMs / pacing.plannedMs : 0
  };
}

const perStage = {};
for (let run = 0; run < 200; run++) {
  Game.newRun();
  const st = Game.state;
  let guard = 0;
  while (!['gameover', 'clear'].includes(st.phase) && guard++ < 300) {
    while (st.phase === 'recruit' && st.applicants.length) {
      if (!Game.canHire()) { Game.skipHire(); break; }
      const best = st.applicants.reduce((b, m, i) => power(m) > power(st.applicants[b]) ? i : b, 0);
      Game.hire(best);
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      const best = Game.departmentRoster('combat').slice().sort((a, b) => power(b) - power(a))
        .slice(0, Game.MAX_DEPLOY);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day);
      else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      const invade = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(invade >= 0 ? invade : 0);
    }
    if (st.phase === 'formation') {
      st.activeUids = Game.departmentRoster('combat').slice().sort((a, b) => power(b) - power(a))
        .slice(0, Game.MAX_DEPLOY).map(m => m.uid);
      const out = Game.deploy();
      if (!out) break;
      const stage = out.stageData.baseStage;
      const finalBattle = out.stageData.missionKind === 'invade' && stage === Game.MAX_CONQUEST;
      (perStage[stage] ||= []).push(measure(out.result.timeline, finalBattle));
    }
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'event') {
      const options = Game.eventOptions();
      if (options.length) Game.chooseEvent(options[0].i);
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') {
      if (Game.canRetry()) Game.retry();
      else Game.concede();
    }
  }
}

const avg = values => values.reduce((sum, n) => sum + n, 0) / values.length;
console.log('敵段階  平均x1  平均x2  最長x1  保護占有  標本');
for (const stage of Object.keys(perStage).sort((a, b) => a - b)) {
  const samples = perStage[stage];
  const mean = avg(samples.map(s => s.ms));
  const share = avg(samples.map(s => s.protectedShare));
  console.log(`${String(stage).padStart(4)}  ${(mean / 1000).toFixed(1).padStart(6)}秒  ${(mean / 2000).toFixed(1).padStart(6)}秒  ${(Math.max(...samples.map(s => s.ms)) / 1000).toFixed(1).padStart(6)}秒  ${(share * 100).toFixed(0).padStart(6)}%  ${samples.length}`);
}
