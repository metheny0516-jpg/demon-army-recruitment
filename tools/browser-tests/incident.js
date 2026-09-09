// 事件試作《スライム大増殖》を実機で一周する。
// 見るのは「事件が世界の状態から出るか」「手が顔ぶれで変わるか」「後遺症が次へ残るか」
// そして本編を汚さないこと。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { silenceMormoFromNow } = require('./helpers');

async function toIncident(page) {
  for (let i = 0; i < 8; i++) {
    await page.locator('[data-action="nextday"]').click();
    await page.waitForTimeout(120);
    if (await page.locator('#mormo-scene').count()) return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    page.on('pageerror', e => { throw e; });

    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.evaluate(() => {
      localStorage.setItem('maou_save', '{"marker":"main-run"}');
      localStorage.setItem('maou_speed', '3');
    });
    const before = await page.evaluate(() => {
      const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
    });

    await page.goto('file://' + process.env.GAME + '/incident.html?seed=7');
    await page.waitForSelector('.iv-wrap');
    assert.match(await page.locator('.iv-state').innerText(), /スライム牧場：3匹/, '平時は牧場3匹から始まる');

    assert.ok(await toIncident(page), '日を進めると事件が起きる');
    await page.evaluate(() => MormoScene.reveal());
    await page.waitForTimeout(150);
    assert.match(await page.evaluate(() => MormoScene.text), /止まりません/, 'モルモが事件を持ってくる');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'incident-alert.png') });

    await page.evaluate(() => MormoScene.advance());
    await page.waitForSelector('.iv-options');
    const opts = await page.locator('.iv-options').innerText();
    assert.match(opts, /リゼに焼き払わせる/, '魔法使いがいるので焼く手が出る');
    assert.match(opts, /ガロを叩き起こす/, '酒好きがいるので叩き起こす手が出る');
    assert.match(opts, /戦闘なし/, '戦わずに終える手もある');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'incident-choice.png'), fullPage: true });

    // 専用バトルへ
    await silenceMormoFromNow(page);
    await page.locator('[data-action="choose"][data-opt="burn"]').click();
    await page.waitForSelector('#scene');
    const enemies = await page.locator('#band-enemy .bu').count();
    assert.ok(enemies >= 4, '前列のスライムと後列の親個体が並ぶ');
    assert.ok(await page.locator('#band-enemy').innerText().then(t => /はらみスライム/.test(t)), '発生源が敵として出る');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'incident-battle.png') });
    await page.evaluate(() => BattleScene.skip());
    await page.waitForTimeout(600);
    await page.locator('[data-action="afterbattle"]').click();

    await page.waitForSelector('.iv-after');
    const after = await page.locator('.iv-after').innerText();
    assert.match(after, /牧場の設備が焼けた/, '焼いた手の後遺症が残る');
    assert.match(after, /炉心|魔力炉/, '炉に何かが残る');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'incident-after.png'), fullPage: true });

    // 後遺症が次の日へ持ち越される
    assert.ok(await page.locator('.iv-history').count(), '起きたことが履歴に残る');
    await page.locator('[data-action="nextday"]').click();
    await page.waitForTimeout(150);

    // 隔離
    const storage = await page.evaluate(() => {
      const real = window.__heroProtoStorage.real; const o = {};
      for (let i = 0; i < real.length; i++) { const k = real.key(i); o[k] = real.getItem(k); } return o;
    });
    const mainAfter = Object.fromEntries(Object.entries(storage).filter(([k]) => !k.startsWith('heroproto_')));
    assert.deepEqual(mainAfter, before, '試作は本編の名前空間を一切変更しない');

    console.log('incident: 事件の発生・顔ぶれで変わる手・専用バトル・後遺症・履歴・隔離を確認');
  } finally { await browser.close(); }
})();
