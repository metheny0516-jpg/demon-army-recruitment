const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, passCommandPhase } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  // 最終ステージ直前に強引に進め、クリア画面を確認する
  await page.evaluate(() => {
    Game.state.stage = 8;
    Game.state.conquest = 7;
    Game.state.turn = 8;
    Game.state.gold = 999;
    Game.state.roster.forEach(m => { m.hp = 9999; m.atk = 999; m.def = 99; m.spd = 99; });
    Game.state.phase = 'formation';
    App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await passCommandPhase(page);
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(150);
  const win = await page.locator('.banner.win').count();
  const head = await page.locator('.banner h2').innerText();
  console.log(`  クリア画面: banner.win=${win} / 見出し="${head.trim()}"`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-clear.png', fullPage: true });
  console.log(errors.length ? '✗ JSエラー: ' + errors.join(', ') : '✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || !win || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
