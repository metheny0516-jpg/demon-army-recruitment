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
    const fire = async (kind, speed = 1, scale = 1, reverse = false, skip = false) => page.evaluate(({kind, speed, scale, reverse, skip}) => {
      BattleScene.stop();
      UI.set(BattleScene.shell({ stage: 1, region: '試写', army: '遠隔試験' }));
      BattleScene.units = {};
      BattleScene.speed = speed;
      BattleScene.eventScale = scale;
      const caster = { id: 'a', side: reverse ? 'enemy' : 'player', name: '攻撃者', hp: 30, maxHp: 30,
        icon: kind === 'arrow' ? '🏹' : kind === 'stone' ? '🪨' : '🔥', tplId: kind === 'magic' ? 'mage' : null };
      const target = { id: 'b', side: reverse ? 'player' : 'enemy', name: '対象', icon: '🗡', hp: 30, maxHp: 30 };
      for (const u of [caster, target]) { document.getElementById('band-' + u.side).innerHTML = BattleScene.unitHtml(u); BattleScene.registerUnit(u); }
      BattleScene.render({ type: 'attack', fromId: 'a', toId: 'b', dmg: 12, hp: 18, maxHp: 30, emphasis: 1 });
      const projectile = document.querySelector('.battle-projectile');
      const animation = projectile?.getAnimations()[0];
      const frames = animation?.effect.getKeyframes();
      const bodyMotion = BattleScene.units.a.actor.getAnimations()[0];
      const snapshot = { kind: BattleScene.attackKind(BattleScene.units.a), duration: animation?.effect.getTiming().duration,
        motion: bodyMotion?.effect.getTiming().duration,
        frames: frames?.map(f => f.transform), hp: document.getElementById('hp-b').style.transform,
        body: BattleScene.units.a.actor.getAnimations().map(a => a.effect.getKeyframes().map(f => f.transform)),
        text: document.getElementById('action-caption').textContent };
      if (skip) { BattleScene.timeline = [{ type: 'result', victory: true }]; BattleScene.index = 0; BattleScene.finished = false; BattleScene.skip(); }
      return snapshot;
    }, {kind, speed, scale, reverse, skip});
    // 弾の尺は BattleScene が決める（攻撃動作の尺 × 接触の割合）。ここへ数式を写すと、
    // 演出の尺を変えるたびに無関係なテストが落ちる（実際 61c89e3 の等速見直しで落ちた）。
    // 見るのは契約のほう:
    //   ・弾は攻撃動作の途中で当たる（0 < 弾 < 動作。melee より遅い接触になる）
    //   ・倍速はちょうど反比例で縮む（x2で半分、x4で1/4）
    //   ・読む尺を延ばしても攻撃動作自体は伸ばさない（等速・scale1で1秒以内）
    const CONTACT_MIN = .5, CONTACT_MAX = .75;    // 遠隔の接触は動作の後半
    const base = {};
    for (const kind of ['arrow', 'stone', 'magic']) {
      for (const speed of [1, 2, 4]) {
        const info = await fire(kind, speed, .45, true);
        assert.equal(info.kind, kind);
        if (speed === 1) {
          base[kind] = info.motion;
          const full = await fire(kind, 1, 1, true);
          assert.ok(full.motion <= 1000, `攻撃動作が長すぎる: ${full.motion}ms`);
          await fire(kind, speed, .45, true);
        }
        assert.ok(Math.abs(info.motion - base[kind] / speed) < .01,
          `x${speed}で尺が反比例しない: ${base[kind]} → ${info.motion}`);
        const ratio = info.duration / info.motion;
        assert.ok(ratio > CONTACT_MIN && ratio < CONTACT_MAX,
          `弾が動作の途中で当たっていない（弾${info.duration} / 動作${info.motion}）`);
        assert.equal(info.hp, 'scaleX(1)');
        assert.ok(info.body.flat().every(t => !t.includes('translate(')), '遠隔役が接近している');
        const x = t => Number(t.match(/translate\(([-\d.]+)px/)[1]);
        assert.ok(x(info.frames[0]) > x(info.frames.at(-1)), '敵の弾は左へ進む');
        await page.waitForFunction(() => document.getElementById('hp-b').style.transform === 'scaleX(0.6)');
        assert.equal(await page.locator('.battle-projectile, .vfx-slash').count(), 0);
        const forward = await fire(kind, speed, .45, false, true);
        assert.ok(x(forward.frames[0]) < x(forward.frames.at(-1)), '味方の弾は右へ進む');
        assert.equal(await page.locator('.battle-projectile').count(), 0);
        assert.equal(await page.evaluate(() => BattleScene.motions.size + BattleScene.pendingHits.size), 0);
        assert.equal(await page.locator('#hp-b').evaluate(el => el.style.transform), 'scaleX(0.6)');
      }
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const info = await fire('magic', 1, 2);
      assert.ok(info.text.includes('魔法攻撃'));
      await page.waitForTimeout(300);
      if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP || '.screenshots', `ranged-magic-${width}.png`) });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await fire('arrow');
    assert.equal(reduced.hp, 'scaleX(0.6)');
    assert.equal(await page.locator('.battle-projectile').count(), 0);
    await page.evaluate(() => BattleScene.stop());
    assert.deepEqual(await page.evaluate(() => ['mage','necromancer','imp'].map(tplId => BattleScene.attackKind({tplId}))), ['magic','magic','magic']);
    assert.deepEqual(await page.evaluate(() => ['✨','📖','🗡','unknown'].map(icon => BattleScene.attackKind({icon}))), ['magic','magic','melee','melee']);
    await page.click('#ranged');
    assert.equal(await page.locator('#bu-e0 .bu-name').innerText(), '王国弓兵');
    assert.deepEqual(errors, []);
    console.log('✓ 遠隔攻撃: 矢・投石・魔法弾、左右、倍速、命中同期、スキップ、低モーション');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
