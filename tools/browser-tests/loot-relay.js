const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    for (const [width, speed, reduced] of [[1280, 1, false], [390, 2, false], [390, 4, true]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('file://' + process.env.GAME + '/battle-preview.html');
      const result = await page.evaluate(speed => {
        BattleScene.speed = speed;
        const result = replayLootRelay();
        window.relayTimeline = result.timeline;
        window.relaySeen = [];
        const render = BattleScene.render.bind(BattleScene);
        BattleScene.render = ev => {
          const duration = render(ev);
          relaySeen.push({ type: ev.type, sourceId: ev.sourceId,
            origin: document.getElementById('chain-origin').textContent,
            reason: document.getElementById('chain-reason').textContent });
          return duration;
        };
        return { chain: result.chainSummary.maxChain, planned: BattleScene.pacing.plannedMs,
          raw: result.timeline.reduce((n, e) => n + BattleScene.durationOf(e), 0) };
      }, speed);
      assert.ok(result.chain >= 6, '実戦エンジンから複数人の連鎖が生まれる');
      assert.ok(result.planned >= result.raw, '中間も省略・圧縮せず読む間を確保する');
      await page.waitForFunction(() => relaySeen.some(e => e.type === 'trait_trigger' && e.sourceId === 'p2'), null, {timeout: 90000});
      if (!reduced) {
        const dir = process.env.SP || '.screenshots';
        fs.mkdirSync(dir, {recursive: true});
        await page.screenshot({path: path.join(dir, `loot-relay-${width}.png`), fullPage: true});
      }
      await page.waitForFunction(() => BattleScene.finished, null, {timeout: 90000});
      const snapshot = () => ({
        hp: Object.values(BattleScene.units).map(u => u.fill.style.transform),
        dead: Object.values(BattleScene.units).map(u => u.el.dataset.life),
        morale: document.getElementById('morale-mult').textContent,
        origin: document.getElementById('chain-origin').textContent,
        reason: document.getElementById('chain-reason').textContent
      });
      const normal = await page.evaluate(snapshot);
      const seen = await page.evaluate(() => relaySeen);
      assert.ok(seen.some(e => e.sourceId === 'p1' && e.origin === '起点：グルグ' && e.reason.includes('強欲')),
        '他人の金貨に反応しても起点の人材を見失わない');
      await page.evaluate(() => { BattleScene.play(relayTimeline, () => {}); BattleScene.skip(); });
      assert.deepEqual(await page.evaluate(snapshot), normal, 'スキップと通常再生のHP・戦意・因果表示が一致');
      assert.equal(await page.locator('.chain-bolt, .burst.show, .chain-flare.live').count(), 0, 'スキップ後に一時演出が残らない');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'スマホでも横にはみ出さない');
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px x${speed} reduced=${reduced} CHAIN=${result.chain} ${Math.round(result.raw)}→${Math.round(result.planned)}ms`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
