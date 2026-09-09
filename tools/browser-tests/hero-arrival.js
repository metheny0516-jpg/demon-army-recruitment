// 勇者襲来 縦切り試作を実際のブラウザで一周し、
// 発見の見せ方と本編からの隔離を確かめる。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { silenceMormoFromNow } = require('./helpers');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // 本編の設定が既にある状態から始め、試作が触らないことを確かめる。
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.evaluate(() => {
      localStorage.setItem('maou_save', '{"marker":"main-run"}');
      localStorage.setItem('maou_speed', '3');
      localStorage.setItem('maou_volume', '0.9');
    });

    // 試作へ入る直前の中身を控えておき、あとで差分だけを見る
    const before = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
      return out;
    });

    await page.goto('file://' + process.env.GAME + '/hero-arrival.html?cond=B&seed=5');
    await page.waitForSelector('.pa-wrap');

    // ── B：モグに店を任せる ──
    await page.locator('[data-action="hire"][data-person="mog"][data-job="tavern"]').click();
    await page.locator('[data-action="hire"][data-person="rize"][data-job="guard"]').click();
    await page.locator('[data-action="hire"][data-person="honekichi"][data-job="guard"]').click();
    assert.ok(await page.locator('.pa-card.is-hired').count() >= 5, '在籍が5名になる');

    // 最初の勤務：酒ができる
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-report');
    const seg1 = await page.locator('.pa-report').innerText();
    assert.match(seg1, /新酒を一樽仕込んだ/, '最初の勤務で酒が仕込まれる');

    // 城下での出来事：身元は分からないまま、客が飲む
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-report');
    const seg2 = await page.locator('.pa-panel').first().innerText();
    assert.match(seg2, /旅の方はそれを飲んだ/, '客が酒を飲む');
    assert.match(seg2, /新酒、旅の方に好評デス/, 'モルモは身元を知らないまま「旅の方」と報告する');
    assert.ok(!/勇者|アレン/.test(seg2), 'この時点では勇者ともアレンとも言わない');

    // 勇者到着：モルモの発見
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('#mormo-scene');
    await page.evaluate(() => { MormoScene.reveal(); });
    await page.waitForTimeout(200);
    const line = await page.evaluate(() => MormoScene.text);
    assert.equal(line, '魔王様、勇者です。先ほどまで、うちで飲んでいた方です', 'モルモが発見を伝える');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'hero-arrival-reveal.png') });

    await page.evaluate(() => MormoScene.advance());           // 事実の続報へ
    await page.waitForTimeout(120);
    await page.evaluate(() => { if (MormoScene.active) { MormoScene.reveal(); MormoScene.advance(); } });
    await page.waitForSelector('.pa-enemies', { timeout: 5000 });

    // 城下の出来事が敵情に出ている
    const enemies = await page.locator('.pa-enemies').innerText();
    assert.match(enemies, /酔い/, '酔いが敵情に表示される');

    // 迎撃
    for (const id of ['garo', 'gantz', 'honekichi', 'rize', 'mog']) {
      await page.locator(`[data-action="deploy"][data-person="${id}"]`).click();
    }
    // 戦闘中のモルモの一言は自動で送る（出ている間はボタンが覆われるため）。
    await silenceMormoFromNow(page);
    await page.locator('[data-action="startbattle"]').click();
    await page.waitForSelector('#scene');
    await page.evaluate(() => BattleScene.skip());
    await page.waitForTimeout(400);
    await page.locator('[data-action="afterbattle"]').click();
    await page.waitForSelector('.pa-ledger');
    const ledger = await page.locator('.pa-ledger').innerText();
    assert.match(ledger, /モグ.*酒を勧め/s, '台帳に提供の事実が残る');
    assert.match(ledger, /酔い.*残った/s, '台帳に酔いの由来が残る');
    if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'hero-arrival-outcome.png'), fullPage: true });

    // ── 隔離の確認 ──
    const storage = await page.evaluate(() => {
      const real = window.__heroProtoStorage.real;
      const out = {};
      for (let i = 0; i < real.length; i++) { const k = real.key(i); out[k] = real.getItem(k); }
      return out;
    });
    assert.equal(storage['maou_save'], '{"marker":"main-run"}', '本編セーブを書き換えていない');
    assert.equal(storage['maou_speed'], '3', '本編の戦闘速度設定を書き換えていない');
    assert.equal(storage['maou_volume'], '0.9', '本編の音量設定を書き換えていない');
    assert.ok(!('maou_history' in storage), '魔界史を作っていない');
    // 本編の名前空間は、試作へ入る前と1文字も変わっていないこと
    const mainAfter = Object.fromEntries(Object.entries(storage).filter(([k]) => !k.startsWith('heroproto_')));
    assert.deepEqual(mainAfter, before, '試作は本編の名前空間を一切変更しない');
    // 試作は普通に遊ぶ範囲では何も保存しない。
    // 保存する操作（速度変更・音量変更）を実際にさせて、行き先が専用の名前空間であることを見る。
    await page.evaluate(() => { BattleScene.cycleSpeed(); Sound.setVolume(0.2); });
    const after = await page.evaluate(() => {
      const real = window.__heroProtoStorage.real;
      const out = {};
      for (let i = 0; i < real.length; i++) { const k = real.key(i); out[k] = real.getItem(k); }
      return out;
    });
    assert.ok(after['heroproto_maou_speed'], '速度設定は heroproto_ 側に入る');
    assert.equal(after['maou_speed'], '3', '本編側の速度設定は変わらない');
    assert.equal(after['maou_volume'], '0.9', '本編側の音量設定は変わらない');

    // ── A：店を任せない普通の迎撃も成立する ──
    await page.goto('file://' + process.env.GAME + '/hero-arrival.html?cond=B&seed=9');
    await page.waitForSelector('.pa-wrap');
    await page.locator('[data-action="hire"][data-person="rize"][data-job="guard"]').click();
    await page.locator('[data-action="hire"][data-person="honekichi"][data-job="guard"]').click();
    await page.locator('[data-action="assign"][data-person="garo"][data-job="patrol"]').click();
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-report');
    const patrolText = await page.locator('.pa-report').innerText();
    assert.match(patrolText, /近郊警戒/, '近郊警戒の結果が報告に出る');
    // 城下に誰も置いていない回。特筆する報告が無くても進行は止まらない。
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('.pa-panel');
    assert.match(await page.locator('.pa-routine').innerText(), /誰も客に会わなかった/,
      '客に会わなかったことは、平穏な勤務としてまとめて出る');
    await page.locator('[data-action="advance"]').click();
    await page.waitForSelector('#mormo-scene');
    await page.evaluate(() => { MormoScene.reveal(); });
    const plain = await page.evaluate(() => MormoScene.text);
    assert.ok(!/飲んでいた方/.test(plain), '店を任せていなければ酒の話はしない');

    console.log('hero-arrival: B の発見・敵情への接続・台帳・隔離・A の通常迎撃を確認');
  } finally {
    await browser.close();
  }
})();
