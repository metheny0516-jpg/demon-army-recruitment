const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.evaluate(() => {
    Game.state.stage = 5;
    Game.state.conquest = 4;
    Game.state.turn = 5;
    Game.state.roster.forEach((m,i) => { m.hp = 60; m.atk = 14 + i*3; m.def = 4; });
    Game.state.phase = 'formation';
    App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(150);

  const rows = await page.locator('.contrib-row').count();
  console.log('戦果パネルの行数:', rows);
  const text = await page.locator('.contrib-list').innerText();
  console.log('内容:\n' + text);

  // 数値整合性チェック: dealt降順になっているか、maxが100%幅か
  const nums = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.contrib-num')).map(e => e.textContent));
  console.log('与ダメ表示:', nums);
  const widths = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.contrib-fill')).map(e => getComputedStyle(e).transform));
  console.log('バーのtransform:', widths);

  await page.screenshot({ path: process.env.SP + '/contrib-result.png', fullPage: true });
  console.log(errors.length ? '✗ ' + errors.join(', ') : '✓ JSエラーなし');
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
