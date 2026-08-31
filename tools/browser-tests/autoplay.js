const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  const click = async sel => { await page.locator(sel).first().click(); await page.waitForTimeout(40); };
  let runs = 0;
  for (runs = 1; runs <= 3; runs++) {
    await click('[data-action="new"]');
    let steps = 0;
    while (steps++ < 120) {
      // 敗北しても再起可能なうちは確定していない。ここでは「ここで終わる」を選んで確定させる。
      if (await page.locator('[data-action="concede"]').count()) { await click('[data-action="concede"]'); continue; }
      // ハプニングは適当に選んで進める
      if (await page.locator('[data-action="eventpick"]').count()) { await click('[data-action="eventpick"]'); continue; }
      if (await page.locator('[data-action="eventdone"]').count()) { await click('[data-action="eventdone"]'); continue; }
      // 戦闘結果の「次へ」
      if (await page.locator('[data-action="afterresult"]').count()) { await click('[data-action="afterresult"]'); continue; }
      // gameover(敗北確定 or 全クリア)画面だけを終端とみなす。result()の1戦ごとの勝利画面はスルーする。
      if (await page.locator('.banner').count()
          && !(await page.locator('[data-action="nextrecruit"], [data-action="afterresult"]').count())) break;
      if (await page.locator('[data-action="hire"]:not([disabled])').count()) { await click('[data-action="hire"]:not([disabled])'); continue; }
      // 満員なら1体解雇して入れ替える（プレイヤーと同じ操作）
      if (await page.locator('[data-action="hire"][disabled]').count() && await page.locator('[data-action="fire"]').count()) {
        await click('[data-action="fire"]'); continue;
      }
      if (await page.locator('[data-action="deploy"]:not([disabled])').count()) {
        await click('[data-action="deploy"]');
        await click('[data-action="skiplog"]');
        await click('[data-action="afterbattle"]');
        continue;
      }

      if (await page.locator('[data-action="missionpick"]').count()) {
        await page.locator('[data-action="missionpick"]').last().click();
        await page.waitForTimeout(40);
        continue;
      }

      if (await page.locator('[data-action="skip"]').count()) { await click('[data-action="skip"]'); continue; }
      break;
    }
    const over = await page.locator('.banner').count() > 0
      && !(await page.locator('[data-action="nextrecruit"], [data-action="afterresult"]').count())
      && !(await page.locator('[data-action="concede"]').count());
    if (!over) { console.log(`  ラン${runs}: 決着画面に到達せず`); break; }
    const head = (await page.locator('.banner h2').innerText()).trim();
    const cause = (await page.locator('.banner div').first().innerText()).trim();
    console.log(`  ✓ ラン${runs} 終了: ${head} / ${cause}`);
    await page.screenshot({ path: process.env.SP + `/shot-gameover.png`, fullPage: true });
    await click('[data-action="history"]');
    const recs = await page.locator('.history-item').count();
    console.log(`    魔界史に ${recs} 代分の記録`);
    if (recs !== runs) throw new Error(`記録数が合わない: ${recs} != ${runs}`);
    await page.screenshot({ path: process.env.SP + `/shot-history.png`, fullPage: true });
    // セーブが消えていること（決着後に「続きから」が残らない）
    if (await page.locator('[data-action="continue"]').count()) throw new Error('決着後もセーブが残っている');
    await click('[data-action="title"]');
  }
  console.log(errors.length ? '\n✗ JSエラー:\n' + errors.join('\n') : '\n✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗ 失敗:', e.message); process.exit(1); });
