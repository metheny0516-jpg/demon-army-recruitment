// 技（コマンドバトル）：指示パネルで「技」を選ぶと気合を払って必ず技が出る。気合が足りなければ選べない。
// （旧：号令の提案。2026-09-11 にコマンドバトルへ移行。号令のエンジンは sim・node テストの土台として残る）
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

const SETUP = (spirit) => {
  Game.state.roster = [
    { uid: 901, tplId: 'ogre', name: 'ガロ', race: 'オーガ', job: '', hp: 260, atk: 14, def: 6, spd: 3,
      salary: 2, loyalty: 70, traits: ['ogre_charge'], skills: ['ogre_smash'], tags: [], quote: '', unpaid: false, injured: 0, spirit }
  ];
  Game.state.activeUids = [901];
  Game.state.stage = 1; Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
  App.render();
  BattleScene.speed = 4;
};

// 窓が閉じるまで、いま指示中の者を「たたかう」で決めていく（狙い選びは「前から」）
async function decideRest(page) {
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate(() => document.getElementById('command-panel').hidden)) return;
    await page.evaluate(() => {
      const pick = document.querySelector('[data-pick=""]');
      if (pick) return pick.click();
      document.querySelector('.cmd-btn[data-cmd="attack"]').click();
    });
  }
}

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 1128, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 指示パネルに「技」が出て、気合が表示される');
  await page.evaluate(SETUP, 3);
  await page.click('[data-action="deploy"]');
  await page.waitForSelector('#command-panel:not([hidden])', { timeout: 20000 });
  const panel = await page.evaluate(() => ({
    head: document.querySelector('.cmd-head').innerText,
    unit: document.getElementById('command-panel').dataset.unit,
    active: document.querySelectorAll('#band-player .bu.cmd-active').length,
    skill: (document.querySelector('.cmd-btn[data-cmd="skill"]') || {}).innerText || '',
    disabled: !!(document.querySelector('.cmd-btn[data-cmd="skill"]') || {}).disabled,
    spirit: (document.querySelector('.cmd-spirit') || {}).innerText || '',
    paused: BattleScene.paused, pending: !!Game.state.pendingBattle, phase: Game.state.phase
  }));
  ok(/ラウンド 1/.test(panel.head), `ラウンド1の指示待ち（${panel.head}）`);
  ok(panel.unit === 'p0' && panel.active === 1, `先頭の者の窓が開き、その札にカーソルが乗る（${panel.unit}, active=${panel.active}）`);
  ok(/振り下ろす/.test(panel.skill) && /気合1/.test(panel.skill), `技のボタン（${panel.skill.replace(/\n/g, ' ')}）`);
  ok(!panel.disabled, '気合が足りるので技は選べる');
  ok(/気合 ●●●/.test(panel.spirit), `気合の表示（${panel.spirit}）`);
  ok(panel.paused && panel.pending && panel.phase === 'battle', '戦闘は指示待ちで止まり、決着は保留');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/order-offer.png' });

  console.log('▼ 技を選んで決定すると、気合を払って技が必ず出る');
  await page.evaluate(() => { document.querySelector('.cmd-btn[data-cmd="skill"]').click(); });
  // 敵が複数なら狙い選びに移る（窓が細くなり、敵の札が光る）。「前から」で確定。
  const picking = await page.evaluate(() => document.getElementById('command-panel').dataset.mode === 'target'
    && document.querySelectorAll('#band-enemy .bu.cmd-pick').length > 0);
  ok(picking, '技を選ぶと狙い選びに移り、敵の札がタップ対象になる');
  await page.evaluate(() => { document.querySelector('[data-pick=""]').click(); });
  // 残りの者は「たたかう」で決めていく。最後の一人で即ラウンド開始（決定ボタンは無い）
  await decideRest(page);
  ok(await page.evaluate(() => document.getElementById('command-panel').hidden), '最後の一人が決めた瞬間にラウンドが始まる');
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  const after = await page.evaluate(() => ({
    log: document.getElementById('log').innerText,
    execs: BattleScene.timeline.filter(e => e.type === 'order_exec' && e.manual).length,
    skillUse: BattleScene.timeline.filter(e => e.type === 'order_exec' && e.species).length,
    pending: !!Game.state.pendingBattle, phase: Game.state.phase,
    spirit: (Game.state.roster.find(m => m.uid === 901) || {}).spirit
  }));
  ok(/魔王「ガロ、振り下ろす！」/.test(after.log), `戦況記録に魔王の指示が残る`);
  ok(after.execs === 1, `技の実行が1回（${after.execs}）`);
  ok(after.skillUse === 1, `種族技として実行された（species=${after.skillUse}）`);
  ok(!after.pending && ['result', 'defeat', 'clear', 'gameover'].includes(after.phase), `決着した（${after.phase}）`);
  ok(after.spirit === 3, `気合は技で1減り、出撃の決着で1戻る（3 → ${after.spirit}）`);

  console.log('▼ 気合が足りなければ技は選べない');
  await page.evaluate(() => { Game.newRun(); });
  await enterMissionPhase(page);
  await page.evaluate(SETUP, 0);
  await page.click('[data-action="deploy"]');
  await page.waitForSelector('#command-panel:not([hidden])', { timeout: 20000 });
  ok(await page.evaluate(() => document.querySelector('.cmd-btn[data-cmd="skill"]').disabled), '気合0なら技のボタンは押せない');
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  ok(await page.evaluate(() => BattleScene.timeline.filter(e => e.type === 'order_exec').length === 0), '技は出ない');

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})();
