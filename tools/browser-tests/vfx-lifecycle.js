const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.evaluate(() => {
      Game.newRun();
      UI.set(BattleScene.shell({ stage: 1, region: '試験', army: '試験隊' }));
      const unit = { id: 'p0', tplId: 'goblin', name: 'ゴブ太', side: 'player', icon: '👺', hp: 30, maxHp: 30 };
      document.getElementById('band-player').innerHTML = BattleScene.unitHtml(unit);
      BattleScene.registerUnit(unit);
    });
    for (const speed of [1, 2, 4]) {
      for (const scale of [1, 0.45]) {
        const durations = await page.evaluate(({ speed, scale }) => {
          BattleScene.stop();
          BattleScene.speed = speed;
          BattleScene.eventScale = scale;
          const u = BattleScene.units.p0;
          for (const kind of Object.keys(BattleScene.VFX_DURATION)) BattleScene.unitVfx(u, kind);
          BattleScene.unitPose(u, 'attack-windup', 360);
          BattleScene.float(u, '12');
          return [...document.querySelectorAll('.bu-vfx, .fnum')].map(el => parseFloat(getComputedStyle(el).animationDuration) * 1000);
        }, { speed, scale });
        [500, 460, 680, 860, 860, 900].forEach((ms, i) => assert.ok(Math.abs(durations[i] - ms * scale / speed) < 1));
        await page.waitForTimeout(950 * scale / speed + 50);
        assert.equal(await page.locator('.bu-vfx, .fnum').count(), 0);
        assert.equal(await page.locator('.bu-sprite-img').getAttribute('data-pose'), 'idle');
      }
    }
    const cleanup = await page.evaluate(() => {
      const u = BattleScene.units.p0;
      BattleScene.showAction('攻撃');
      BattleScene.cutin('試験', '試験', 'overkill');
      BattleScene.pulse('guard');
      BattleScene.float(u, '12');
      BattleScene.unitVfx(u, 'guard');
      u.el.classList.add('dead', 'hit', 'acting');
      BattleScene.timeline = [{ type: 'result', victory: true }];
      BattleScene.index = 0;
      BattleScene.finished = false;
      BattleScene.skip();
      return { leftovers: document.querySelectorAll('#scene .show, .bu-vfx, .fnum, .fx-active, .bu.hit, .bu.acting').length,
        dead: u.el.classList.contains('dead'), result: !!document.querySelector('.scene-result.win'), timers: BattleScene.timers.length };
    });
    assert.deepEqual(cleanup, { leftovers: 0, dead: true, result: true, timers: 0 });
    const fallback = await page.evaluate(() => {
      const u = BattleScene.units.p0, img = u.sprite;
      img.dispatchEvent(new Event('error'));
      const portrait = img.src.endsWith('/goblin.png') && !img.parentElement.classList.contains('battle-sprite');
      BattleScene.unitPose(u, 'attack-windup');
      BattleScene.stop();
      const stable = img.src.endsWith('/goblin.png');
      img.dispatchEvent(new Event('error'));
      return { portrait, stable, emoji: !!u.el.querySelector('.bu-portrait.noimg'), removed: !img.isConnected,
        cached: !BattleScene.portraitHtml({ tplId: 'goblin', icon: '👺' }).includes('<img') };
    });
    assert.deepEqual(fallback, { portrait: true, stable: true, emoji: true, removed: true, cached: true });
    assert.deepEqual(errors, []);
    console.log('✓ VFX: x1/x2/x4・圧縮・スキップ・画像フォールバック');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
