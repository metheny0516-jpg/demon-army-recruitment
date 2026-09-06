const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, passCommandPhase } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();

  // 中盤戦らしい見た目にするため、強めの部隊で6戦目をぶつける
  await page.evaluate(() => {
    Game.state.stage = 6;
    Game.state.conquest = 5;
    Game.state.turn = 6;
    Game.state.roster.forEach(m => { m.hp = 70; m.atk = 22; m.def = 5; });
    Game.state.phase = 'formation';
    App.render();
  });
  await page.click('[data-action="deploy"]');

  // 演出中の様子を時間差でキャプチャ
  const shots = [];
  for (const t of [400, 1200, 2600, 5000]) {
    await page.waitForTimeout(t - (shots.length ? [400,1200,2600,5000][shots.length-1] : 0));
    const f = `${process.env.SP || ".screenshots"}/scene-${t}.png`;
    await page.screenshot({ path: f });
    shots.push(f);
  }
  const info = await page.evaluate(() => ({
    events: BattleScene.timeline.length,
    played: BattleScene.index,
    units: Object.keys(BattleScene.units).length,
    speed: BattleScene.speed,
    // 演出の総尺を計算
    totalMs: BattleScene.timeline.reduce((s,e)=> s + BattleScene.durationOf(e), 0)
  }));
  console.log(`イベント数 ${info.events} / ユニット ${info.units}体 / 総尺 ${(info.totalMs/1000).toFixed(1)}秒(x1)`);
  console.log(`5秒時点で ${info.played}/${info.events} イベント再生済み`);

  // 速度切替
  await page.click('[data-action="speed"]');
  console.log('速度ボタン →', await page.locator('#speed-btn').innerText());

  // スキップ
  await page.click('[data-action="skiplog"]');
  await page.waitForTimeout(200);
  const nextVisible = await page.locator('#next-btn').isVisible();
  const dead = await page.locator('.bu.dead').count();
  const res = await page.locator('.scene-result').count();
  console.log(`スキップ後: 結果ボタン=${nextVisible} 死亡表示=${dead}体 決着バナー=${res}`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/scene-end.png' });

  await passCommandPhase(page);

  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(150);
  console.log('結果画面へ遷移:', await page.locator('.banner').count() > 0 ? 'OK' : 'NG');

  console.log(errors.length ? '\n✗ JSエラー:\n' + errors.join('\n') : '\n✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
