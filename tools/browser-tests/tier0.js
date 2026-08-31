const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok=(c,m)=>console.log((c?'  ✓ ':'  ✗ ')+m);
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="missionpick"]').last().click();

  // ── 2) 解雇ボタンの間隔と大きさ ──
  console.log('▼ 解雇ボタンの誤タップ対策（編成画面）');
  const geo = await page.evaluate(() => {
    const down = document.querySelector('[data-action="down"]');
    const fire = document.querySelector('[data-action="fire"]');
    if (!down || !fire) return null;
    const d = down.getBoundingClientRect(), f = fire.getBoundingClientRect();
    return { gap: Math.round(f.left - d.right), fireH: Math.round(f.height), downH: Math.round(d.height) };
  });
  ok(geo.gap >= 20, `並び替えと解雇の間隔: ${geo.gap}px（修正前は6px）`);
  ok(geo.fireH >= 40, `解雇ボタンの高さ: ${geo.fireH}px（修正前は32px）`);
  await page.screenshot({ path: process.env.SP+'/tier0-formation.png', fullPage:true });

  // ── 1) 決着バナーとVS帯の重なり ──
  console.log('▼ 決着表示');
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.waitForTimeout(200);
  const overlap = await page.evaluate(() => {
    const mid = document.querySelector('.scene-mid');
    const res = document.querySelector('.scene-result');
    if (!mid || !res) return null;
    const midVisible = getComputedStyle(mid).opacity !== '0';
    const m = mid.getBoundingClientRect(), r = res.getBoundingClientRect();
    const vertOverlap = !(m.bottom < r.top || m.top > r.bottom);
    return { midVisible, vertOverlap, text: res.textContent.trim() };
  });
  ok(overlap && !overlap.midVisible, `決着中はVS帯が非表示（重なっても読める）`);
  console.log(`    決着テキスト: "${overlap.text}" / 領域は重なる: ${overlap.vertOverlap}`);
  await page.screenshot({ path: process.env.SP+'/tier0-result.png' });

  // ── 3) シナジーヒントの文言 ──
  await page.click('[data-action="afterbattle"]'); await page.waitForTimeout(150);
  if (await page.locator('[data-action="nextrecruit"]').count()) {
    await page.click('[data-action="nextrecruit"]'); await page.waitForTimeout(150);
  }
  console.log('▼ シナジーのヒント文');
  const hint = await page.locator('.panel').filter({ hasText:'発動中のシナジー' }).first().innerText().catch(()=>'');
  const lies = hint.includes('職業');
  ok(!lies, `「職業」への言及なし（職業条件のシナジーは実在しないため）`);
  console.log(`    現在の文言: ${hint.split('\n').slice(1).join(' ').slice(0,60)}`);

  console.log(errs.length?'\n✗ '+errs.join(', '):'\n✓ JSエラーなし');
  await b.close(); process.exit(errs.length?1:0);
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
