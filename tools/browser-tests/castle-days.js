// 魔王城の10日間を実機で通す。事件の弧が通ること、乱入が画面に出ること、本編を汚さないこと。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { silenceMormoFromNow } = require('./helpers');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    page.on('pageerror', e => { throw e; });
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.evaluate(() => { localStorage.setItem('maou_save', '{"m":1}'); localStorage.setItem('maou_speed', '3'); });
    const before = await page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });

    await page.goto('file://' + process.env.GAME + '/castle-days.html?seed=1');
    await page.waitForSelector('.cd-actions');
    // 1日目：採用
    await page.locator('.cd-action', { hasText: '応募者を見る' }).click();
    await page.waitForSelector('.cd-cards');
    for (const [id, place] of [['gudo', 'pasture'], ['garo', 'kitchen'], ['vira', 'lab']]) {
      await page.locator(`.cd-pick[data-id="${id}"]`).check();
      await page.locator(`.cd-where[data-id="${id}"]`).selectOption(place);
    }
    await page.locator('[data-action="recruit-confirm"]').click();
    await page.waitForSelector('[data-action="night"]');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'castle-days-recruit.png'), fullPage: true });
    await page.locator('[data-action="night"]').click();
    await page.waitForSelector('.cd-mormo');
    const d2 = await page.locator('.cd-mormo').innerText();
    assert.match(d2, /愛情の配合|献立/, '雇った奴が、命令していないことを朝の日誌でやっている');
    assert.match(d2, /食堂におられました/, '酒好きは食堂にいる');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'castle-days-morning.png'), fullPage: true });

    await silenceMormoFromNow(page);
    // 事件が起きて鎮圧に出るまで進める
    let fought = false, sawRegen = false;
    for (let day = 2; day <= 10 && !sawRegen; day++) {
      await page.waitForSelector('.cd-actions');
      const names = await page.locator('.cd-action b').allInnerTexts();
      const pick = names.includes('鎮圧に出る') && !fought ? '鎮圧に出る' : names.includes('排水を止める') ? '排水を止める' : 'スライム牧場を視察する';
      await page.locator('.cd-action', { hasText: pick }).first().click();
      if (pick === '鎮圧に出る') {
        fought = true;
        if (await page.locator('[data-action="battle-go"]').count()) {
          const burst = await page.locator('.cd-burst').innerText();
          assert.match(burst, /俺も行く|今、行く|うまいぞ|分けてもらった/, '出撃前に、命令していない乱入が出る');
          if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'castle-days-burst.png'), fullPage: true });
          await page.locator('[data-action="battle-go"]').click();
        }
        await page.waitForSelector('#scene');
        assert.ok(await page.locator('#band-enemy .bu').count() >= 3, 'スライムが並ぶ');
        if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'castle-days-battle.png') });
        await page.evaluate(() => BattleScene.skip());
        await page.waitForTimeout(600);
        await page.locator('[data-action="afterbattle"]').click();
      }
      await page.waitForSelector('[data-action="night"]');
      await page.locator('[data-action="night"]').click();
      await page.waitForTimeout(150);
      if (await page.locator('.cd-mormo').count()) {
        const t = await page.locator('.cd-mormo').innerText();
        if (/処分しましたヨネ/.test(t)) { sawRegen = true; if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'castle-days-regen.png'), fullPage: true }); }
      }
    }
    assert.ok(fought, '事件が起きて鎮圧に出た');
    assert.ok(sawRegen, '倒した翌朝に「処分しましたヨネ？ ……今、N匹います」が出る');

    const storage = await page.evaluate(() => { const r = window.__heroProtoStorage.real; const o = {}; for (let i = 0; i < r.length; i++) { const k = r.key(i); o[k] = r.getItem(k); } return o; });
    assert.deepEqual(Object.fromEntries(Object.entries(storage).filter(([k]) => !k.startsWith('heroproto_'))), before, '本編の名前空間を変更しない');
    console.log('castle-days: 採用・命令外の挙動・事件・乱入・鎮圧・翌朝の再増殖・隔離を確認');
  } finally { await browser.close(); }
})();
