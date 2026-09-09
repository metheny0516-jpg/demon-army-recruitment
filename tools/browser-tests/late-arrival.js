// 《酒好き》の遅刻が画面でどう見えるか。開戦時にいない → 途中で「遅れて到着」と出て、召喚物扱いにならない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1128, height: 900 } });
    page.on('pageerror', e => { throw e; });
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    await page.waitForSelector('#scene');
    const info = await page.evaluate(() => {
      BattleScene.stop();
      const mk = (name, traits, side, x) => Battle.makeUnit(Object.assign({ uid: name, name, race: 'オーク', tplId: 'orc', hp: 80, atk: 9, def: 3, spd: 5, traits, tags: [], loyalty: 80 }, x || {}), side);
      const late = mk('ガロ', ['drunkard'], 'player', { introQuote: '斧の出番だ' });
      const wall = mk('ガンツ', [], 'player', { hp: 160, atk: 2, tplId: 'ogre' });
      const foe = mk('かかし', [], 'enemy', { hp: 220, atk: 3, spd: 1, tplId: 'swordsman' });
      const r = Battle.simulate([late, wall], [foe]);
      UI.set(BattleScene.shell({ stage: 1, army: '遅刻確認', region: '試写' }));
      window.__done = false;
      BattleScene.play(r.timeline, () => { window.__done = true; });
      const startCount = document.querySelectorAll('#band-player .bu').length;
      return { startCount, hasLate: r.timeline.some(e => e.type === 'summon' && e.late), lateId: late.id };
    });
    assert.equal(info.startCount, 1, '開戦時、味方の帯には遅刻者がいない');
    assert.ok(info.hasLate, 'タイムラインに遅刻の到着がある');
    await page.evaluate(() => BattleScene.skip());
    await page.waitForFunction(() => window.__done === true, null, { timeout: 15000 });
    const after = await page.evaluate(id => {
      const el = document.getElementById('bu-' + id);
      return { present: !!el, label: el ? el.querySelector('.bu-state').textContent : null,
        log: document.getElementById('log').innerText, count: document.querySelectorAll('#band-player .bu').length };
    }, info.lateId);
    assert.equal(after.count, 2, '終了時には遅刻者が帯に加わっている');
    assert.ok(after.present, '遅刻者の要素が描かれている');
    assert.notEqual(after.label, '召喚', '遅刻者に「召喚」の札が付かない');
    assert.match(after.log, /遅れて到着/, '戦況記録に「遅れて到着」が残る');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'late-arrival.png') });
    console.log('late-arrival: 開戦不在→途中到着→召喚扱いにならない、を確認');
  } finally { await browser.close(); }
})();
