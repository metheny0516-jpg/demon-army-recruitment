const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ok=(c,m)=>{ if(!c) process.exitCode=1; console.log((c?'  ✓ ':'  ✗ ')+m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="missionpick"]').last().click();

  // ── 2) 取り返しのつかない操作の誤タップ対策（編成画面）──
  // 編成画面の構成は変わりうる（出撃隊／控えの分離など）ので、特定のボタンの
  // 組み合わせを名指しせず「取り返しのつかないボタン（.danger）は他のボタンから
  // 20px以上離れていること」という不変条件そのものを測る。
  // 並び替え同士（前へ／後ろへ）が近いのは押し間違えても取り返せるので対象外。
  console.log('▼ 誤タップ対策（編成画面）');
  // 控えのカードにだけ「解雇」が出る。最も危険な組み合わせ（解雇 ↔ 出撃隊へ）を
  // 画面に出すため、1体を控えに落としてから測る。
  await page.locator('[data-action="toggledeploy"]').first().click();
  await page.waitForTimeout(120);
  const geo = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const dangers = [...document.querySelectorAll('button.danger')].filter(vis);
    const others = [...document.querySelectorAll('button')].filter(b => vis(b) && !b.classList.contains('danger'));
    let minGap = Infinity, label = '';
    for (const d of dangers) {
      const dr = d.getBoundingClientRect();
      for (const o of others) {
        const orr = o.getBoundingClientRect();
        // 上下左右いずれかの隙間。矩形が重なっていなければ短い方を取る
        const dx = Math.max(orr.left - dr.right, dr.left - orr.right);
        const dy = Math.max(orr.top - dr.bottom, dr.top - orr.bottom);
        const gap = Math.round(Math.max(dx, dy));
        if (gap < minGap) { minGap = gap; label = `${d.textContent.trim()} ↔ ${o.textContent.trim()}`; }
      }
    }
    const smalls = [...document.querySelectorAll('button.small')].filter(vis)
      .map(b => b.getBoundingClientRect());
    return {
      dangers: dangers.length,
      gap: minGap === Infinity ? null : minGap,
      gapLabel: label,
      minH: smalls.length ? Math.round(Math.min(...smalls.map(r => r.height))) : null
    };
  });
  ok(geo.dangers > 0, `取り返しのつかないボタンを検出（解雇 ${geo.dangers}個）`);
  ok(geo.gap !== null && geo.gap >= 20, `解雇と他ボタンの最小間隔: ${geo.gap}px（修正前は6px）… ${geo.gapLabel}`);
  ok(geo.minH !== null && geo.minH >= 40, `小ボタンの最小高さ: ${geo.minH}px（修正前は32px）`);
  await page.screenshot({ path: process.env.SP+'/tier0-formation.png', fullPage:true });

  // ── 3) シナジーヒントの文言 ──
  // 戦闘後に測ると勝敗次第で画面が変わり（敗北なら魔界史へ）、パネルに辿り着けない
  // 回が混ざる。編成画面なら必ず出るので、戦う前のここで測る。
  console.log('▼ シナジーのヒント文');
  const synPanel = page.locator('.panel').filter({ hasText: '発動中のシナジー' }).first();
  const found = await synPanel.count() > 0;
  ok(found, `シナジーパネルを表示できた（空テスト防止）`);
  const hint = found ? await synPanel.innerText() : '';
  ok(found && !hint.includes('職業'), `「職業」への言及なし（職業条件のシナジーは実在しないため）`);
  console.log(`    現在の文言: ${hint.split('\n').slice(1).join(' ').slice(0,60)}`);

  // 控えに落とした1体を出撃隊へ戻す
  await page.locator('.reserve-section [data-action="toggledeploy"]:not([disabled])').first().click();
  await page.waitForTimeout(120);

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

  console.log(errs.length?'\n✗ '+errs.join(', '):'\n✓ JSエラーなし');
  await b.close(); process.exit(errs.length || process.exitCode ? 1 : 0);
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
