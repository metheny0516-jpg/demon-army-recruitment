// モルモが遷移先の小さな部品ではなく、タイプ音つきの全画面報告として立つか。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { dismissMormo } = require('./helpers.js');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  await page.evaluate(() => {
    window.__mormoCues = 0;
    const original = Sound.cue.bind(Sound);
    Sound.cue = (name, data) => {
      if (name === 'mormo') window.__mormoCues++;
      return original(name, data);
    };
  });

  await page.click('[data-action="new"]');
  const scene = page.locator('#mormo-scene');
  if (await scene.count() !== 1) errors.push('新規ゲーム開始時にモルモ報告が出ない');
  const box = await scene.boundingBox();
  if (!box || box.width < 380 || box.height < 830) errors.push(`モルモ報告が全画面でない: ${JSON.stringify(box)}`);
  const img = page.locator('.mormo-scene-portrait');
  if (!await img.evaluate(el => el.complete && el.naturalWidth > 0)) errors.push('モルモ画像を読めない');

  const before = await page.locator('.mormo-scene-text').innerText();
  await page.waitForTimeout(220);
  const after = await page.locator('.mormo-scene-text').innerText();
  if (!(after.length > before.length)) errors.push('台詞がタイプ表示されない');
  if (await page.evaluate(() => window.__mormoCues) < 1) errors.push('タイプ表示にモルモの声が付かない');

  const next = page.locator('.mormo-scene-next');
  await next.click();
  if (!(await page.locator('.mormo-scene-next').innerText()).includes('次へ')) errors.push('1回目のタップで全文表示にならない');
  await page.locator('.mormo-scene-backdrop').dispatchEvent('click');
  if (await page.locator('#mormo-scene').count() !== 1) errors.push('画面余白のクリックでモルモ報告が閉じる');
  await page.waitForTimeout(1800);
  if (await page.locator('#mormo-scene').count() !== 1) errors.push('入力なしでモルモ報告が自動的に閉じる');
  await next.click();
  if (await page.locator('#mormo-scene').count()) errors.push('2回目のタップで報告が閉じない');
  if (await page.locator('[data-action="hire"]').count() !== 3) errors.push('報告後に採用画面へ進まない');

  await page.locator('[data-action="hire"]').first().click();
  await page.locator('[data-action="hire"]').first().click();
  // 採用後にも報告が出る。ここは報告そのものではなく「作戦→編成」の遷移を見たいので送る
  while (await dismissMormo(page)) { /* 出ている報告を送り切る */ }
  // 3日間プロトタイプでは最初の作戦決定が遠征／防衛の選択になる（どちらも formationReport を通る）
  await page.locator('[data-action="openingbattle"]').first().click();
  if (await page.locator('#mormo-scene').count() !== 1) errors.push('作戦決定と編成の間にモルモ報告が出ない');
  if (await page.locator('[data-action="deploy"]').count() !== 1) errors.push('報告の背後に遷移先を準備できていない');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  if (await page.locator('#mormo-scene').count()) errors.push('キーボードで報告を進められない');

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ モルモ: 全画面報告・タイプ表示・発話音・明示送り・作戦遷移');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
