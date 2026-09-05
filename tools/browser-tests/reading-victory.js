const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    await page.evaluate(() => { BattleScene.speed = 4; replayLootRelay(); });
    await page.waitForFunction(() => document.querySelectorAll('#chain-history-list li').length >= 3);
    await page.locator('#chain-history summary').click();
    await page.waitForFunction(() => BattleScene.paused);
    const index = await page.evaluate(() => BattleScene.index);
    await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(() => BattleScene.index), index, '履歴を読む間は次のイベントへ進まない');
    await page.screenshot({ path: '.screenshots/reading-history-mobile.png', fullPage: true });
    await page.locator('#pause-btn').click();
    await page.waitForFunction(i => BattleScene.index > i, index);
    await page.evaluate(() => BattleScene.skip());
    assert.ok(await page.locator('#chain-history-list li').count() > 3, 'skipも残りの因果を履歴へ保存');
    for (const speed of [1, 4]) {
      await page.evaluate(speed => {
        window.cues = []; window.doneCount = 0;
        Sound.cue = kind => cues.push({ kind, at: Date.now() });
        BattleScene.speed = speed;
        BattleScene.play([{type:'battle_start',player:[],enemy:[]}, { type: 'result', victory: true }], () => doneCount++);
        BattleScene.stop(); BattleScene.index = BattleScene.timeline.length; BattleScene.resolveBattle({type:'result',victory:true});
        window.winStart = Date.now();
      }, speed);
      await page.waitForTimeout(600);
      assert.equal(await page.locator('.scene-result').count(), 0, '最後に静かな一拍を置く');
      await page.waitForFunction(() => document.querySelector('.scene-result.win'));
      const cue = await page.evaluate(() => cues.filter(c => c.kind === 'win'));
      assert.equal(cue.length, 1, '勝利音は一度だけ');
      assert.ok(cue[0].at - await page.evaluate(() => winStart) >= 850);
      assert.equal(await page.locator('#next-btn').isVisible(), false, '曲の途中で次へを出さない');
      await page.screenshot({ path: `.screenshots/victory-x${speed}.png`, fullPage: true });
      await page.waitForFunction(() => BattleScene.finished);
      assert.ok(await page.evaluate(() => Date.now() - winStart) >= 4300, '倍速でも勝利の間を維持');
      assert.equal(await page.evaluate(() => doneCount), 1);
    }
    await page.evaluate(() => { BattleScene.play([{type:'battle_start',player:[],enemy:[]},{type:'result',victory:true}], () => {}); BattleScene.skip(); });
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('.scene-result').count(), 1, '勝利待ちのskipで二重表示しない');
    console.log('PASS reading pause/history, victory silence/fanfare timing x1/x4, skip');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
