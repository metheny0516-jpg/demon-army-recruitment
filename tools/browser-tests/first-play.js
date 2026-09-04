const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('file://' + process.env.GAME + '/index.html');
      await page.locator('[data-action="new"]').first().click();
      assert.match(await page.locator('.mormo-scene-text').evaluate(() => MormoScene.text), /いつ起きるか/);
      await page.evaluate(() => {
        MormoScene.close(); Game.hire(0); Game.skipHire(); Game.selectMission(0); App.render(); App.formationReport();
      });
      assert.match(await page.evaluate(() => MormoScene.text), /先頭ほど/);
      await page.evaluate(() => MormoScene.close());
      await page.waitForTimeout(400);
      const widths = await page.locator('.card-identity').evaluateAll(els => els.map(e => e.getBoundingClientRect().width));
      assert.ok(widths.length && widths.every(w => w >= 100), JSON.stringify(widths));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, `first-formation-${width}.png`), fullPage: true });
      await page.evaluate(() => {
        UI.set(BattleScene.shell({ stage: 1, army: '王国軍', region: '回廊' }));
        for (const side of ['player', 'enemy']) {
          document.getElementById('band-' + side).innerHTML = Array.from({ length: 5 }, (_, i) => BattleScene.unitHtml({
            id: side + i, side, tplId: side === 'enemy' ? 'swordsman' : 'goblin', name: '部隊員' + i, hp: 20, maxHp: 20,
          })).join('');
        }
        const banner = document.getElementById('cutin');
        banner.innerHTML = '<b>戦場の事件</b><span>援軍が駆けつけた！</span>';
        banner.style.opacity = '1'; banner.style.transform = 'translateY(-50%)';
      });
      const overlaps = await page.evaluate(() => {
        const b = document.getElementById('cutin').getBoundingClientRect();
        return [...document.querySelectorAll('.bu-name, .scene-army')].some(e => {
          const r = e.getBoundingClientRect(); return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
        });
      });
      assert.equal(overlaps, false, '事件バナーが名前に重なる');
      if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, `first-battle-${width}.png`) });
      await page.close();
    }
    console.log('✓ 初回案内・390/1280px編成名幅・5対5事件バナー');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
