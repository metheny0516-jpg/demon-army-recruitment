const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.evaluate(() => {
    Game.state.facilityLevel = 1;
    Game.state.pendingFacilityChoiceLevel = 1;
    Game.state.phase = 'facility';
    Game.save(); App.render();
  });
  if (await page.locator('[data-action="choosefacility"]').count() !== 3) throw new Error('大型施設が3択でない');
  const text = await page.locator('.mission-grid').innerText();
  for (const name of ['恐喝帳簿', '巨大厨房', '墓地']) if (!text.includes(name)) throw new Error(`${name}が表示されない`);
  for (const hint of ['会計職を出撃隊へ配置', '大食漢か魔界料理人', '死霊術師を控えに置く（出撃させない）']) {
    if (!text.includes(hint)) throw new Error(`不足部品「${hint}」が表示されない`);
  }
  await page.locator('[data-action="choosefacility"][data-id="grand_kitchen"]').click();
  if (await page.evaluate(() => Game.state.activeFacilityId) !== 'grand_kitchen') throw new Error('巨大厨房を選択できない');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('✓ 大型Joker施設3択・巨大厨房選択・スマホ幅');
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
