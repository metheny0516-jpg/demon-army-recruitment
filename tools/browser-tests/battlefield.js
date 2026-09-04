const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + process.env.GAME + '/index.html');
    const setup = async (count = 1) => page.evaluate(count => {
      BattleScene.stop();
      Game.newRun();
      UI.set(BattleScene.shell({ stage: 1, region: '地下回廊', army: '王国斥候隊' }));
      BattleScene.units = {};
      BattleScene.speed = 1;
      BattleScene.eventScale = 1;
      for (const side of ['player', 'enemy']) {
        const units = Array.from({ length: count }, (_, i) => ({ id: side + i, side,
          tplId: side === 'player' ? 'goblin' : undefined, icon: '⚔️', name: side === 'player' ? 'ゴブ太' + i : '王国斥候' + i, hp: 30, maxHp: 30 }));
        document.getElementById('band-' + side).innerHTML = units.map(u => BattleScene.unitHtml(u)).join('');
        units.forEach(u => BattleScene.registerUnit(u));
      }
    }, count);
    const attack = async () => page.evaluate(() => BattleScene.render({ type: 'attack', fromId: 'player0', toId: 'enemy0', dmg: 12, hp: 18, maxHp: 30, emphasis: 1 }));
    const shot = async name => { if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, name + '.png') }); };
    await setup();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#bu-enemy0').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await shot('battlefield-idle');
    await attack();
    assert.equal(await page.locator('#hp-enemy0').evaluate(el => el.style.transform), 'scaleX(1)');
    await page.waitForTimeout(75);
    await shot('battlefield-windup');
    await setup();
    await attack();
    await page.waitForTimeout(225);
    assert.equal(await page.locator('#hp-enemy0').evaluate(el => el.style.transform), 'scaleX(0.6)');
    await page.evaluate(() => { for (const a of BattleScene.motions) a.pause(); });
    await shot('battlefield-contact');
    await page.evaluate(() => { for (const a of BattleScene.motions) a.play(); });
    // Screenshot capture pauses the animation clock; wait for bounded completion after resuming.
    await page.waitForFunction(() => BattleScene.motions.size === 0, null, { timeout: 2000 });
    assert.equal(await page.locator('#bu-player0 img').getAttribute('data-pose'), 'idle');
    assert.equal(await page.evaluate(() => BattleScene.motions.size), 0);
    for (const speed of [1, 2, 4]) {
      await setup();
      await page.evaluate(speed => { BattleScene.speed = speed; BattleScene.eventScale = .45; }, speed);
      await attack();
      await page.evaluate(() => { BattleScene.timeline = [{ type: 'result', victory: true }]; BattleScene.index = 0; BattleScene.finished = false; BattleScene.skip(); });
      assert.equal(await page.locator('#hp-enemy0').evaluate(el => el.style.transform), 'scaleX(0.6)');
      assert.equal(await page.evaluate(() => BattleScene.motions.size + BattleScene.pendingHits.size + BattleScene.timers.length), 0);
      await page.waitForTimeout(400);
      assert.equal(await page.locator('.bu-vfx, .fnum').count(), 0);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup();
    await attack();
    assert.equal(await page.evaluate(() => BattleScene.motions.size), 0);
    assert.equal(await page.locator('#hp-enemy0').evaluate(el => el.style.transform), 'scaleX(0.6)');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await setup(5);
      await page.waitForTimeout(200);
      await shot('battlefield-five-' + width);
      assert.ok(await page.evaluate(() => {
        const stage = document.getElementById('scene').getBoundingClientRect();
        return [...document.querySelectorAll('.bu')].every(el => { const r = el.getBoundingClientRect(); return r.left >= stage.left && r.right <= stage.right && r.bottom <= stage.bottom; });
      }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(errors, []);
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    await page.click('#crowd');
    assert.equal(await page.locator('.bu').count(), 10);
    await page.click('[data-action="speed"]');
    assert.equal(await page.locator('#speed-btn').innerText(), '速度 x2');
    await page.click('[data-action="skiplog"]');
    assert.equal(await page.locator('.scene-result.win').count(), 1);
    await page.click('#replay');
    assert.equal(await page.locator('.bu').count(), 2);
    assert.deepEqual(errors, []);
    console.log('✓ 横向き戦場: 命中同期・戻り・倍速スキップ・低モーション・5対5・試写操作');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
