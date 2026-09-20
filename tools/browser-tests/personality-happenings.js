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
    // 札の状態表示（2026-09-20）。接着は本人と相手の両方に、同じ組番号で出る。
    await page.evaluate(() => { BattleScene.speed = 4; replayPersonalityHappening('slime_cling'); });
    await page.waitForFunction(() => document.querySelectorAll('.bu-cond-cling').length >= 2, null, { timeout: 15000 });
    const cling = await page.evaluate(() => [...document.querySelectorAll('.bu-cond-cling')].map(el => ({
      side: el.closest('.bu').dataset.side, text: el.textContent,
      // 札は重なって並ぶので、前へ出ていないと後ろの札に隠れて読めない
      z: Number(getComputedStyle(el.closest('.bu')).zIndex) || 0
    })));
    assert.equal(cling.length, 2, '接着は本人と相手の両方に出る');
    assert.ok(cling.some(c => c.side === 'player') && cling.some(c => c.side === 'enemy'), '味方側と敵側の両方に出る');
    assert.ok(cling.every(c => /接着中/.test(c.text) && /①/.test(c.text)), `同じ組番号で対応が分かる（${cling.map(c => c.text).join(' / ')}）`);
    assert.ok(cling.every(c => c.z >= 10), '接着の帯は後ろの札に隠れない');
    // 組が増えたら番号も変わる（試写の強制発火は1事件1回なので、描画側を直接見る）
    const pairs = await page.evaluate(() => {
      const u = BattleScene.units.p0;
      BattleScene.condition(u, 'cling', true, { pair: 2 });
      const two = u.el.querySelector('.bu-cond-cling').textContent;
      BattleScene.condition(u, 'cling', true, { pair: 3 });
      const three = u.el.querySelector('.bu-cond-cling').textContent;
      return { two, three };
    });
    assert.ok(/②/.test(pairs.two) && /③/.test(pairs.three), `組ごとに番号が変わる（${JSON.stringify(pairs)}）`);
    await page.evaluate(() => BattleScene.skip());
    await page.waitForFunction(() => BattleScene.finished, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => document.querySelectorAll('.bu-cond').length), 0,
      '飛ばしても接着の帯が残らない');

    // 睡眠は寝ている間だけ出て、起きたら消える。
    await page.evaluate(() => { BattleScene.speed = 4; replayPersonalityHappening('troll_nap'); });
    await page.waitForFunction(() => document.querySelectorAll('.bu-cond-nap').length >= 1, null, { timeout: 15000 });
    assert.match(await page.locator('.bu-cond-nap').first().innerText(), /睡眠中/, '寝ている間は睡眠中が出る');
    await page.evaluate(() => BattleScene.skip());
    await page.waitForFunction(() => BattleScene.finished, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => document.querySelectorAll('.bu-cond').length), 0,
      '起きたあと・飛ばしたあとに睡眠中が残らない');

    // 次の戦闘へ持ち越さない。
    await page.evaluate(() => { BattleScene.speed = 4; replayPersonalityHappening('slime_cling'); });
    await page.waitForFunction(() => document.querySelectorAll('.bu-cond-cling').length >= 2, null, { timeout: 15000 });
    await page.evaluate(() => replayPersonalityHappening('minotaur_wrong_way'));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.bu-cond').length), 0,
      '次の戦闘に前の状態表示を持ち越さない');

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
