const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  if (!await page.locator('#sound-control').count()) errors.push('音量コントロールが無い');
  if ((await page.locator('#sound-toggle').innerText()).includes('OFF')) errors.push('初期状態がミュート');

  await page.click('[data-action="new"]');
  const audioState = await page.evaluate(() => ({
    unlocked: !!Sound.ctx || !(window.AudioContext || window.webkitAudioContext),
    samples: Sound.samples.size
  }));
  const unlocked = audioState.unlocked;
  if (!unlocked) errors.push('最初の操作で音声を解禁できない');
  if (audioState.samples !== 12) errors.push(`衝撃WAVの事前読込が${audioState.samples}/12`);

  await page.locator('#sound-volume').evaluate(el => {
    el.value = '35';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (await page.evaluate(() => localStorage.getItem('maou_volume')) !== '0.35') errors.push('音量を保存できない');

  await page.click('#sound-toggle');
  if (!(await page.locator('#sound-toggle').innerText()).includes('OFF')) errors.push('ミュート表示へ変わらない');
  await page.reload();
  if (!(await page.locator('#sound-toggle').innerText()).includes('OFF')) errors.push('ミュート設定が復元されない');

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 音声解禁・衝撃WAV・音量・ミュート保存');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
