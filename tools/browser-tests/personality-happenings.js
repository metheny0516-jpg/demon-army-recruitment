const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const { autoDismissMormo } = require('./helpers.js');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await autoDismissMormo(page);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    assert.equal(await page.locator('[id^="happening-"]').count(), 5, '隔離試写の入口が5件ある');

    const expected = {
      slime_cling: e => e.type === 'incident' && e.id === 'slime_cling',
      troll_nap: e => e.type === 'incident' && e.id === 'troll_nap',
      harpy_scout: e => e.type === 'attack' && e.label === '偵察急降下',
      minotaur_wrong_way: e => e.type === 'splash' && e.label === '誤突進',
      ogre_lunch: e => e.type === 'heal' && e.label === '弁当を半分'
    };
    for (const id of Object.keys(expected)) {
      const timeline = await page.evaluate(id => {
        BattleScene.speed = 4;
        return replayPersonalityHappening(id).timeline;
      }, id);
      assert.ok(timeline.some(expected[id]), `${id} の実戦計算を試写できる`);
      await page.evaluate(() => BattleScene.skip());
    }

    // 偵察中だけ札が消え、帰還イベントで戻る。
    await page.evaluate(() => { BattleScene.speed = 1; replayPersonalityHappening('harpy_scout'); });
    await page.waitForFunction(() => BattleScene.units.p0 && BattleScene.units.p0.absent === true, null, { timeout: 12000 });
    assert.ok(await page.locator('.battle-unit.absent').count() >= 1, '上空偵察中はハーピーが地上から消える');
    await page.evaluate(() => BattleScene.speed = 4);
    await page.waitForFunction(() => BattleScene.finished, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => !!BattleScene.units.p0.absent), false, '帰還後は戦場へ戻る');
    assert.deepEqual(errors, [], '試写中にJSエラーがない');
    console.log('✓ 人物ハプニング5件：隔離試写・実戦計算・ハーピー離脱帰還');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
