const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok=(c,m)=>{ if(!c) process.exitCode=1; console.log((c?'  ✓ ':'  ✗ ')+m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport:{width:390,height:844} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();

  // 仲間割れが必ず起きる状況を作る（忠誠の低い者を2体）
  await page.evaluate(() => {
    Game.state.roster.forEach(m => { m.loyalty = 40; m.hp = 60; m.atk = 20; });
    Game.state.gold = 20;
    Game.state.phase = 'formation'; App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(150);

  // 結果画面 →「次へ」でイベントへ（確率なので、出るまで戦闘を繰り返す）
  let fired=false;
  for (let i=0;i<12 && !fired;i++){
    if (await page.locator('[data-action="afterresult"]').count()) {
      await page.click('[data-action="afterresult"]'); await page.waitForTimeout(120);
    }
    if (await page.locator('[data-action="eventpick"]').count()) { fired=true; break; }
    if (await page.locator('[data-action="missionpick"]').count()) {
      await page.locator('[data-action="missionpick"]').last().click(); await page.waitForTimeout(100);
    }
    // イベントが出なければ次の戦闘へ
    if (await page.locator('[data-action="deploy"]:not([disabled])').count()) {
      await page.click('[data-action="deploy"]'); await page.click('[data-action="skiplog"]');
      await page.click('[data-action="afterbattle"]'); await page.waitForTimeout(120);
    } else if (await page.locator('[data-action="hire"]:not([disabled])').count()) {
      await page.locator('[data-action="hire"]:not([disabled])').first().click(); await page.waitForTimeout(100);
    } else break;
  }
  ok(fired, 'ハプニング画面が表示された');
  if (fired) {
    const title = (await page.locator('.event-panel h2').innerText()).trim();
    const text  = (await page.locator('.event-text').innerText()).trim();
    const nOpts = await page.locator('[data-action="eventpick"]').count();
    console.log(`    「${title}」 選択肢${nOpts}個`);
    console.log('    ' + text.split('\n').join('\n    '));
    ok(nOpts >= 1, '選択肢が表示されている');
    await page.screenshot({ path: process.env.SP+'/event-choice.png', fullPage:true });

    await page.locator('[data-action="eventpick"]').first().click();
    await page.waitForTimeout(150);
    const outcome = (await page.locator('.event-text').innerText()).trim();
    console.log('    → ' + outcome.split('\n').join('\n      '));
    ok(outcome.length > 0, '結果テキストが出た');
    ok(await page.locator('[data-action="eventdone"]').count()===1, '「次の応募者を面接する」で先へ進める');
    await page.screenshot({ path: process.env.SP+'/event-outcome.png', fullPage:true });
    await page.click('[data-action="eventdone"]'); await page.waitForTimeout(150);
    ok(await page.evaluate(()=>Game.state.phase)==='recruit', '採用フェーズへ遷移した');
  }
  ok(errs.length===0, 'JSエラーなし'+(errs.length?': '+errs.join(', '):''));
  await b.close();
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
