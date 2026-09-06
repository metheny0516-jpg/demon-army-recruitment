const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
const ok = (condition, message) => { if (!condition) process.exitCode = 1; console.log((condition ? '  ✓ ' : '  ✗ ') + message); };
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.evaluate(() => {
    Game.state.stage = 8; Game.state.conquest = 7; Game.state.turn = 8;
    Game.state.roster.forEach(m => { m.hp = 8; m.atk = 18; m.def = 0; m.spd = 99; });
    Game.state.phase = 'formation'; App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(120);

  console.log('▼ 敗北時のニアミス表示');
  const miss = await page.evaluate(() => Game.state.lastBattle.nearMiss);
  ok(!!miss && miss.enemyMaxHp > 0 && miss.closestDamage > 0, 'タイムラインから敵HPの到達点を保存する');
  ok(await page.locator('.near-miss-panel').count() === 1, '再起画面にニアミスを表示する');
  const panelText = await page.locator('.near-miss-panel').innerText();
  ok(panelText.includes('敗因メモ') && /\d+%/.test(panelText), '遠い敗北は敗因メモとして割合を表示する');
  await page.evaluate(() => {
    Object.assign(Game.state.lastBattle.nearMiss, { enemyMaxHp: 100, closestRemaining: 8, finalRemaining: 8, closestDamage: 92, closestPercent: 92 });
    App.render();
  });
  const closeText = await page.locator('.near-miss-panel').innerText();
  ok(closeText.includes('最も追い詰めた瞬間') && closeText.includes('あと 8 ダメージ'), '本当のニアミスには残ダメージを強調する');
  if (process.env.SP) await page.screenshot({ path: (process.env.SP || '.screenshots') + '/nearmiss-defeat.png', fullPage: true });

  await page.click('[data-action="concede"]');
  await page.waitForTimeout(80);
  ok(await page.locator('.near-miss-panel').count() === 1, '敗北確定画面にもニアミスを残す');
  console.log(errors.length ? '\n✗ JSエラー: ' + errors.join(', ') : '\n✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || process.exitCode ? 1 : 0);
})().catch(error => { console.error('✗ 失敗:', error.message); process.exit(1); });
