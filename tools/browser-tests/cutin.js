const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();

  // ゴブリン5体の軍団を作って「ゴブリン軍団」を発動させる
  await page.evaluate(() => {
    const tpl = MONSTER_TEMPLATES.find(t => t.id === 'goblin');
    Game.state.roster = ['グルグ','ザグ','ポポ','ギリ','ヌゴ'].map((n,i) => ({
      uid: 100+i, tplId:'goblin', name:n, race:'ゴブリン', job:'盗賊',
      hp:40, atk:16, def:4, spd:7-i*0.1, salary:3, loyalty:70,
      traits:['coward','pack'], tags:[], quote:'', unpaid:false
    }));
    Game.state.stage = 5;
    Game.state.conquest = 4;
    Game.state.turn = 5;
    Game.state.phase = 'formation';
    App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.waitForTimeout(750);
  await page.screenshot({ path: process.env.SP + '/scene-cutin.png' });
  const shown = await page.locator('#cutin.show').count();
  const name = await page.locator('#cutin-name').innerText();
  console.log(`カットイン表示=${shown} 内容="${name}"`);

  await page.waitForTimeout(3000);
  await page.screenshot({ path: process.env.SP + '/scene-mid5.png' });
  console.log(errors.length ? '✗ ' + errors.join(', ') : '✓ JSエラーなし');
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
