const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.waitForTimeout(150);

  const resumes = await page.locator('.resume').count();
  console.log(`採用画面の履歴書欄: ${resumes}件（応募者3名なので3が正しい）`);
  console.log('\n── 1人目の履歴書 ──');
  console.log(await page.locator('.card').first().innerText());

  const h = await page.evaluate(() => document.body.scrollHeight);
  console.log(`\n採用画面のスクロール量: ${h}px (${(h/844).toFixed(2)}画面分)`);
  await page.screenshot({ path: process.env.SP+'/resume-recruit.png', fullPage:true });

  // 編成画面には出さない（スクロール抑制のため）
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.waitForTimeout(120);
  const inFormation = await page.locator('.resume').count();
  console.log(`編成画面の履歴書欄: ${inFormation}件（0が正しい）`);
  const h2 = await page.evaluate(() => document.body.scrollHeight);
  console.log(`編成画面のスクロール量: ${h2}px (${(h2/844).toFixed(2)}画面分)`);

  console.log(errs.length?'\n✗ '+errs.join(', '):'\n✓ JSエラーなし');
  await b.close(); process.exit(errs.length || process.exitCode ? 1 : 0);
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
