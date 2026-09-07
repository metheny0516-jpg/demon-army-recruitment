const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
const ok=(c,m)=>{ if(!c) process.exitCode=1; console.log((c?'  ✓ ':'  ✗ ')+m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  console.log('▼ 新規開始直後（部隊0体）で面接を打ち切ろうとする');
  const skipDisabled = await page.locator('[data-action="skip"][disabled]').count();
  // 「作戦会議へ進む」ボタンは面接終了へ統合された（1ba62ac）。守りたい性質は
  // 「空部隊のまま採用画面を抜ける押せるボタンが無い」ことなので、ボタン名ではなくそれを測る
  const formEnabled = await page.locator('[data-action="toformation"]:not([disabled])').count();
  ok(skipDisabled===1, '「面接を終了」が無効化されている');
  ok(formEnabled===0, '空部隊で作戦会議へ進める有効ボタンが無い');

  console.log('▼ 万一 空部隊で編成画面に入っても脱出できるか');
  await page.evaluate(() => { Game.skipHire(); App.render(); });
  const escape = await page.locator('[data-action="title"]').count();
  ok(escape>=1, '「タイトルへ戻る」で脱出できる');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/softlock-fixed.png', fullPage:true });
  await page.click('[data-action="title"]'); await page.waitForTimeout(120);
  ok(await page.locator('[data-action="new"]').count() >= 1, 'タイトルに戻れた');   // 魔王は複数から選ぶ
  console.log(errs.length?'\n✗ '+errs.join(', '):'\n✓ JSエラーなし');
  await b.close(); process.exit(errs.length || process.exitCode ? 1 : 0);
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
