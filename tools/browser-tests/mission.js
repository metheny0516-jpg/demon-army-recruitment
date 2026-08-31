const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok = (condition, message) => console.log((condition ? '  ✓ ' : '  ✗ ') + message);

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();

  const cards = page.locator('.mission-card');
  ok(await cards.count() === 3, '作戦が3種類提示される');
  ok(await page.locator('.mission-economy').count() === 3, '各作戦に収支見込が表示される');
  const before = await page.evaluate(() => ({ alert: Game.state.alert, conquest: Game.state.conquest, turn: Game.state.turn }));

  await page.locator('[data-action="missionpick"]').first().click();
  await page.evaluate(() => Game.state.roster.forEach(m => { m.hp = 9999; m.atk = 999; m.def = 99; m.spd = 99; }));
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({
    alert: Game.state.alert,
    conquest: Game.state.conquest,
    turn: Game.state.turn,
    raids: Game.state.missionCounts.raid
  }));
  ok(after.alert === before.alert + 2, '略奪で警戒度が2上がる');
  ok(after.conquest === before.conquest, '略奪では王国攻略が進まない');
  ok(after.turn === before.turn + 1 && after.raids === 1, '作戦数と略奪回数が記録される');

  console.log(errors.length ? '✗ JSエラー: ' + errors.join(', ') : '✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(error => { console.error('✗', error.message); process.exit(1); });
