const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    const snapshot = () => page.evaluate(() => Object.entries(BattleScene.units).map(([id, u]) => ({
      id, hp: u.fill.style.transform, life: u.el.dataset.life,
      label: u.el.querySelector('.bu-state').textContent
    })).sort((a, b) => a.id.localeCompare(b.id)));
    await page.evaluate(() => { BattleScene.speed = 4; replayArrival(); });
    await page.waitForFunction(() => BattleScene.finished);
    const normal = await snapshot();
    for (const delay of [0, 400, 800]) {
      await page.evaluate(() => replayArrival());
      if (delay) await page.waitForTimeout(delay);
      await page.evaluate(() => BattleScene.skip());
      assert.deepEqual(await snapshot(), normal, `skip at ${delay}ms differs`);
      assert.equal(await page.evaluate(() => BattleScene.motions.size + BattleScene.pendingHits.size), 0);
    }
    await page.evaluate(() => {
      const s = BattleScene.units.ps0;
      BattleScene.setHp(s, 6, 12);
      BattleScene.addSummon({ id: 'ps0', side: 'player', hp: 12, maxHp: 12 });
    });
    assert.equal((await snapshot()).find(u => u.id === 'ps0').hp, 'scaleX(0.5)');
    await page.evaluate(() => {
      BattleScene.render({ type: 'death', unitId: 'p0', permanent: true });
    });
    assert.equal((await snapshot()).find(u => u.id === 'p0').label, '戦死');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        for (let i = 0; i < 6; i++) BattleScene.addSummon({ id: 'extra' + i, name: '増援', side: 'player', icon: '💀', hp: 10, maxHp: 10 });
      });
      assert.equal(await page.evaluate(() => {
        const stage = document.getElementById('scene').getBoundingClientRect();
        return [...document.querySelectorAll('.bu-state')].every(el => el.getBoundingClientRect().bottom <= stage.bottom);
      }), true, 'reinforcements overflow stage');
      if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP || '.screenshots', `arrival-${width}.png`), fullPage: true });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { BattleScene.stop(); BattleScene.render({ type: 'revive', unitId: 'p0', hp: 10, maxHp: 30 }); });
    assert.equal(await page.evaluate(() => BattleScene.motions.size), 0);
    assert.deepEqual(errors, []);
    console.log('✓ arrival: normal/skip, duplicate summon, permanent death, 8 units, reduced motion');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
