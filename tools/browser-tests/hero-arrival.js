// 勇者襲来 縦切り試作 v2 を実際のブラウザで一周する。
// 見るのは「採用が判断になっているか」「答え合わせが届くか」「本編を汚さないか」。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { silenceMormoFromNow } = require('./helpers');

// 面接を回して、名前が hire にマッチする人だけ採る
async function interview(page, takeRe) {
  const taken = [], passed = [];
  for (let i = 0; i < 12; i++) {
    if (!await page.locator('.pa-iv-card').count()) break;
    const name = (await page.locator('.pa-iv-body h1').innerText()).split('\n')[0].trim();
    const canHire = await page.locator('[data-action="hire"]:not([disabled])').count();
    if (takeRe.test(name) && canHire) { taken.push(name); await page.locator('[data-action="hire"]').click(); }
    else { passed.push(name); await page.locator('[data-action="pass"]').click(); }
    await page.waitForTimeout(20);
  }
  return { taken, passed };
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
    page.on('pageerror', e => { throw e; });

    // 本編の設定がある状態から始め、試作が触らないことを見る
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.evaluate(() => {
      localStorage.setItem('maou_save', '{"marker":"main-run"}');
      localStorage.setItem('maou_speed', '3');
      localStorage.setItem('maou_volume', '0.9');
    });
    const before = await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
      return o;
    });

    // ── 面接が判断になっているか ──
    await page.goto('file://' + process.env.GAME + '/hero-arrival.html?seed=42');
    await page.waitForSelector('.pa-iv-card');
    assert.ok(await page.locator('.pa-iv-known').count(), '「確かなこと」が出る');
    assert.ok(await page.locator('.pa-iv-said').count(), '「本人の申告」が出る');
    assert.ok(await page.locator('.pa-iv-unknown').count(), '「未確認」の手掛かりが出る');
    const first = (await page.locator('.pa-iv-body h1').innerText()).split('\n')[0].trim();
    await page.locator('[data-action="pass"]').click();
    const second = (await page.locator('.pa-iv-body h1').innerText()).split('\n')[0].trim();
    assert.notEqual(first, second, '見送ると次の応募者へ進む');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'hero-arrival-interview.png'), fullPage: true });

    // seed=42 は「宿場の厨房」のグドが来る。手掛かりを読んで賭ける。
    const { taken, passed } = await interview(page, /グド|ホネ吉|ボル/);
    assert.ok(taken.includes('グド'), '手掛かりを読んでグドを採用できる');
    assert.ok(passed.length > 0, '見送った応募者がいる');

    // ── 配属 ──
    await page.waitForSelector('.pa-grid');
    await page.locator('[data-action="assign"][data-person="gudo"][data-job="tavern"]').click();
    await page.locator('[data-action="assign"][data-person="boru"][data-job="patrol"]').click();

    // ── 区間1：隠れた能力が判明する ──
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-panel');
    const seg1 = await page.locator('#app').innerText();
    assert.match(seg1, /実は酒が造れる/, '履歴書に無かった能力が、働かせて判明する');
    assert.match(seg1, /新酒を仕込んだ/, '判明した能力がそのまま仕事の結果になる');

    // ── 区間2：身元を知らないまま接触する ──
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-panel');
    const seg2 = await page.locator('#app').innerText();
    assert.match(seg2, /旅の方はそれを飲んだ/, '客が酒を飲む');
    assert.ok(!/勇者|アレン/.test(seg2), 'この時点では勇者ともアレンとも言わない');

    // ── 到着：発見 ──
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('#mormo-scene');
    await page.evaluate(() => MormoScene.reveal());
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => MormoScene.text),
      '魔王様、勇者です。先ほどまで、うちで飲んでいた方です', 'モルモが発見を伝える');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'hero-arrival-reveal.png') });

    await page.evaluate(() => MormoScene.advance());
    await page.waitForTimeout(150);
    await page.evaluate(() => { if (MormoScene.active) { MormoScene.reveal(); MormoScene.advance(); } });
    await page.waitForSelector('.pa-enemies', { timeout: 5000 });
    assert.match(await page.locator('.pa-enemies').innerText(), /酔い/, '城下の出来事が敵情に出る');

    // ── 迎撃 ──
    for (const id of ['garo', 'gantz', 'boru', 'honekichi', 'gudo']) {
      const b = page.locator(`[data-action="deploy"][data-person="${id}"]`);
      if (await b.count()) await b.click();
    }
    await silenceMormoFromNow(page);
    await page.locator('[data-action="startbattle"]').click();
    await page.waitForSelector('#scene');
    await page.evaluate(() => BattleScene.skip());
    await page.waitForTimeout(500);
    await page.locator('[data-action="afterbattle"]').click();

    // ── 決着：採用の答え合わせ ──
    await page.waitForSelector('.pa-reveal');
    const outcome = await page.locator('.pa-reveal').innerText();
    assert.match(outcome, /相手は/, '隠れていた相手の条件が、終わってから明かされる');
    assert.match(outcome, /グド/, '判明した性質が答え合わせに出る');
    assert.match(outcome, /見送った人/, '見送った応募者が残る（次のランの材料）');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'hero-arrival-outcome.png'), fullPage: true });

    // ラン記録が次のランへ持ち越される
    await page.locator('[data-action="restart"]').click();
    await page.waitForSelector('.pa-iv-card');
    assert.ok(await page.locator('.pa-hist').count(), '前のランの記録が面接画面に残る');

    // ── 隔離 ──
    await page.evaluate(() => { BattleScene.cycleSpeed(); Sound.setVolume(0.2); });
    const storage = await page.evaluate(() => {
      const real = window.__heroProtoStorage.real;
      const o = {};
      for (let i = 0; i < real.length; i++) { const k = real.key(i); o[k] = real.getItem(k); }
      return o;
    });
    const mainAfter = Object.fromEntries(Object.entries(storage).filter(([k]) => !k.startsWith('heroproto_')));
    assert.deepEqual(mainAfter, before, '試作は本編の名前空間を一切変更しない');
    assert.ok(storage['heroproto_maou_speed'], '試作の設定は heroproto_ 側に入る');
    assert.ok(storage['heroproto_hero_arrival_runs'], 'ラン記録も heroproto_ 側に入る');

    // ── 店に人を割かなければ、酒の話は起きない ──
    await page.goto('file://' + process.env.GAME + '/hero-arrival.html?seed=9');
    await page.waitForSelector('.pa-iv-card');
    await interview(page, /ホネ吉|ボル|ピピ/);
    await page.waitForSelector('.pa-grid');
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-panel');
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-panel');
    assert.match(await page.locator('.pa-routine').innerText(), /誰も客に会わなかった/,
      '城下に人を置かなければ客に会わない');
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('#mormo-scene');
    await page.evaluate(() => MormoScene.reveal());
    await page.waitForTimeout(150);
    assert.ok(!/飲んでいた方/.test(await page.evaluate(() => MormoScene.text)),
      '酒を出していなければ、その話はしない');

    console.log('hero-arrival: 面接の判断・隠れた性質の判明・発見・敵情への接続・ラン記録・隔離を確認');
  } finally {
    await browser.close();
  }
})();
