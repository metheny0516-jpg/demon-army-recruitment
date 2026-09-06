const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const species = process.env.SPECIES || true;
const orc = species !== true;
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(species => { replay(2, false, species); BattleScene.stop(); }, species);
      await page.waitForFunction(() => [...document.querySelectorAll('.bu-sprite-img')].every(i => i.complete && i.naturalWidth === 512));
      for (const id of ['p0', 'p1']) {
        for (const pose of ['idle', 'attack-windup', 'strike', 'recover', 'hurt', 'fallen']) {
          await page.evaluate(({id, pose}) => BattleScene.setPose(BattleScene.units[id], pose), {id, pose});
          await page.waitForFunction(({id, pose}) => {
            const img = BattleScene.units[id].sprite;
            return img.dataset.pose === pose && img.complete && img.naturalWidth === 512;
          }, {id, pose});
        }
      }
      await page.evaluate(() => BattleScene.stop());
      await page.waitForTimeout(500);
      if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, `${orc ? 'orc' : 'species'}-${width}.png`) });
    }
    // 攻撃動作の尺は BattleScene が決める。ここへ数式を写すと演出を調整するたびに
    // このテストが落ちる（61c89e3 の等速見直しで実際に落ちた）。見るのは契約:
    //   ・倍速はちょうど反比例で縮む（x2で半分、x4で1/4）
    //   ・読む尺を延ばしても攻撃動作自体は伸ばさない（等速・scale1で1秒以内）
    const swing = (speed, id) => page.evaluate(({speed, id}) => {
      BattleScene.stop(); BattleScene.speed = speed; BattleScene.eventScale = .45;
      const toId = id.startsWith('p') ? 'e0' : 'p0';
      BattleScene.setHp(BattleScene.units[toId], 30, 30);
      BattleScene.render({ type: 'attack', fromId: id, toId, dmg: 12, hp: 18, maxHp: 30, emphasis: 1 });
      return { toId, duration: BattleScene.units[id].actor.getAnimations()[0].effect.getTiming().duration };
    }, {speed, id});
    const baseSwing = {};
    for (const speed of [1, 2, 4]) {
      for (const id of ['p0', 'p1', 'e0', 'e1']) {
        const result = await swing(speed, id);
        if (speed === 1) {
          baseSwing[id] = result.duration;
          const full = await page.evaluate(id => {
            BattleScene.stop(); BattleScene.speed = 1; BattleScene.eventScale = 1;
            const toId = id.startsWith('p') ? 'e0' : 'p0';
            BattleScene.render({ type: 'attack', fromId: id, toId, dmg: 12, hp: 18, maxHp: 30, emphasis: 1 });
            return BattleScene.units[id].actor.getAnimations()[0].effect.getTiming().duration;
          }, id);
          assert.ok(full <= 1000, `攻撃動作が長すぎる: ${full}ms`);
          await page.waitForFunction(() => BattleScene.motions.size === 0);
          await swing(speed, id);
        }
        assert.ok(Math.abs(result.duration - baseSwing[id] / speed) < .01,
          `x${speed}で尺が反比例しない: ${baseSwing[id]} → ${result.duration}`);
        await page.waitForFunction(() => BattleScene.motions.size === 0);
        assert.equal(await page.evaluate(id => BattleScene.units[id].fill.style.transform, result.toId), 'scaleX(0.6)');
        assert.equal(await page.evaluate(id => BattleScene.units[id].sprite.dataset.pose, id), 'idle');
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      BattleScene.render({type:'attack',fromId:'p0',toId:'e0',dmg:1,hp:17,maxHp:30});
    });
    assert.equal(await page.evaluate(() => BattleScene.motions.size), 0);
    if (!orc) assert.equal(await page.locator('.vfx-slash').count(), 0);
    await page.evaluate(species => { replay(2, false, species); BattleScene.skip(); }, species);
    assert.equal(await page.evaluate(() => BattleScene.motions.size + BattleScene.pendingHits.size), 0);
    await page.evaluate(() => BattleScene.spriteFailed(BattleScene.units.p0.sprite));
    assert.equal(await page.locator('#bu-p0 .battle-sprite').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`✓ ${orc ? species + ': 6' : 'species: 12'} poses, both sides, x1/x2/x4, HP timing, skip, reduced motion, fallback`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
