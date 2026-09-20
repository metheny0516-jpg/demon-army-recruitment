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
    // 札のクラスは .bu（.battle-unit はこのコードベースに存在しない）。
    // 見え方は src/battlefield.css の `.battlefield .bu.absent`（opacity .28＋グレースケール）。
    const aloft = await page.evaluate(() => {
      const el = document.querySelector('#bu-p0');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { absent: el.classList.contains('absent'), opacity: Number(cs.opacity), filter: cs.filter };
    });
    assert.ok(aloft && aloft.absent && aloft.opacity < 0.5 && /grayscale/.test(aloft.filter),
      `上空偵察中はハーピーが地上から消える（${JSON.stringify(aloft)}）`);
    await page.evaluate(() => BattleScene.speed = 4);
    // 試写は「事件で止めて見せる」「モルモの確認窓」で人の操作を待つ（設計どおり）。
    // テストも人と同じように進める：窓は「続ける」を押し、止まった一コマは戦場をタップする。
    // これをしないと finished に到達せず、演出の不具合と区別できない（2026-09-20）。
    for (let i = 0; i < 400 && !await page.evaluate(() => BattleScene.finished); i++) {
      await page.evaluate(() => {
        const cont = document.querySelector('.mormo-aside.show .mormo-aside-continue');
        if (cont) return cont.click();
        const hint = document.querySelector('#hold-hint.show');
        if (hint) return BattleScene.advanceBeat();
      });
      await page.waitForTimeout(50);
    }
    assert.ok(await page.evaluate(() => BattleScene.finished), '人と同じ操作で最後まで進む');
    assert.equal(await page.evaluate(() => !!BattleScene.units.p0.absent), false, '帰還後は戦場へ戻る');
    assert.equal(await page.evaluate(() => document.querySelector('#bu-p0').classList.contains('absent')), false,
      '帰還後は札の薄さも戻る');
    // 離陸後に「最後まで飛ばす」を押しても札の薄さが残らない（2026-09-20）。
    // skip() は render() を通らない独自経路を持ち、そこが summon を ev.late だけで
    // 判定していたため、偵察の帰還を取りこぼして札が薄いまま残っていた。
    await page.evaluate(() => { BattleScene.speed = 4; replayPersonalityHappening('harpy_scout'); });
    await page.waitForFunction(() => BattleScene.units.p0 && BattleScene.units.p0.absent === true, null, { timeout: 12000 });
    await page.evaluate(() => BattleScene.skip());
    await page.waitForFunction(() => BattleScene.finished, null, { timeout: 12000 });
    assert.equal(await page.evaluate(() => document.querySelectorAll('.bu.absent').length), 0,
      '離陸後に飛ばしても、薄いままの札が残らない');

    assert.deepEqual(errors, [], '試写中にJSエラーがない');
    console.log('✓ 人物ハプニング5件：隔離試写・実戦計算・ハーピー離脱帰還');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
