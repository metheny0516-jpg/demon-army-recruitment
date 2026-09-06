const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { silenceMormoFromNow, enterMissionPhase, passCommandPhase } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // スマホ縦
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file://' + process.env.GAME + '/index.html');
  const step = async (label, fn) => {
    await fn();
    await page.waitForTimeout(120);
    console.log(`  ✓ ${label}`);
  };

  console.log('▼ スマホ縦(390x844)で通しプレイ');
  await step('タイトル表示', async () => {
    if (!(await page.locator('h1').innerText()).includes('魔王')) throw new Error('title missing');
  });
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-title.png' });

  await step('新規ゲーム → 応募者3名', async () => {
    await page.click('[data-action="new"]');
    const n = await page.locator('.card').count();
    if (n !== 3) throw new Error('applicants=' + n);
    const mormo = page.locator('#mormo-scene .mormo-scene-portrait');
    if (!(await mormo.count()) || await mormo.evaluate(img => !img.complete || !img.naturalWidth)) {
      throw new Error('全画面のモルモ画像が表示されていない');
    }
  });
  // 報告が全画面で出ること自体はここまでで確認した。
  // この先は下の画面を操作するので、報告は即送りにする（実プレイでは人が送る）
  await silenceMormoFromNow(page);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-recruit.png', fullPage: true });

  await step('1人目採用（設立枠が残り再面接）', async () => {
    await page.click('[data-action="hire"]');
    if (!(await page.locator('[data-action="hire"]').count())) throw new Error('2回目の面接が出ない');
  });
  await step('2人目採用 → 作戦会議 → 編成画面', async () => {
    await page.click('[data-action="hire"]');
    await enterMissionPhase(page);   // 開幕3日は daily.js の担当。ここは通常ループを通しで見る
    await page.locator('[data-action="missionpick"]').last().click();
    await page.waitForSelector('[data-action="deploy"]');
  });
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-formation.png', fullPage: true });

  await step('並び替え（前へ/後ろへ）', async () => {
    const before = await page.locator('.card-name').first().innerText();
    await page.locator('[data-action="down"]').first().click();
    const after = await page.locator('.card-name').first().innerText();
    if (before === after) throw new Error('並び替えが効いていない');
    await page.locator('.department-combat-section .card').nth(1).locator('[data-action="front"]').click();
    const restored = await page.locator('.card-name').first().innerText();
    if (restored !== before) throw new Error('最前列へ一発で戻せない');
  });

  await step('控えへ回す（配属という操作は無い）', async () => {
    const before = await page.locator('.department-combat-section .card').count();
    await page.locator('.department-combat-section [data-action="toggledeploy"]').first().click();
    if (await page.locator('.reserve-section .card').count() < 1) throw new Error('控えへ回せない');
    if (await page.locator('.department-combat-section .card').count() !== before - 1) {
      throw new Error('出撃隊から抜けていない');
    }
    await page.locator('.reserve-section [data-action="toggledeploy"]').first().click();
  });

  await step('給与方針を意図的未払いへ変更', async () => {
    if (await page.locator('[data-action="payrollpolicy"]').count() !== 2) throw new Error('給与方針が2択でない');
    await page.locator('[data-action="payrollpolicy"][data-policy="withhold"]').click();
    if (!(await page.locator('.payroll-option.selected').innerText()).includes('今回は未払い')) {
      throw new Error('未払い方針を選択できない');
    }
    if (!(await page.locator('[data-action="deploy"]').innerText()).includes('今回は未払い')) {
      throw new Error('出撃ボタンへ給与方針が反映されない');
    }
  });

  await step('出撃 → 戦闘ログ', async () => {
    // smoke は画面遷移の契約テスト。ランダム敗北で後半のセーブ検証を飛ばさない。
    await page.evaluate(() => Game.activeRoster().forEach(m => { m.hp = 999; m.atk = 99; m.def = 50; }));
    await page.click('[data-action="deploy"]');
    await page.waitForSelector('#log');
    await page.click('[data-action="skiplog"]');
    const lines = await page.locator('#log div').count();
    if (lines < 5) throw new Error('ログ行数=' + lines);
    console.log(`    ログ${lines}行`);
  });
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-battle.png' });

  await step('結果画面へ', async () => {
    await passCommandPhase(page);
    await page.click('[data-action="afterbattle"]');
  });
  const won = await page.locator('.banner.win').count() > 0;
  console.log(`    → ${won ? '勝利' : '敗北'}`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-result.png', fullPage: true });

  // 勝利していれば数戦回してセーブ復元も見る
  if (won) {
    for (let i = 0; i < 3; i++) {
      if (await page.locator('[data-action="afterresult"]').count()) await page.click('[data-action="afterresult"]');
      if (await page.locator('[data-action="choosefacility"]').count()) await page.locator('[data-action="choosefacility"]').first().click();
      if (await page.locator('[data-action="nextrecruit"]').count()) {
        await page.click('[data-action="nextrecruit"]');
        if (await page.locator('[data-action="hire"]').count()) await page.locator('[data-action="hire"]').first().click();
        else await page.click('[data-action="skip"]');
      }
      if (await page.locator('[data-action="missionpick"]').count()) {
        await page.locator('[data-action="missionpick"]').last().click();
      }
      if (await page.locator('[data-action="deploy"]').count()) {
        await page.click('[data-action="deploy"]');
        await page.click('[data-action="skiplog"]');
        await passCommandPhase(page);
        await page.click('[data-action="afterbattle"]');
      }
      await page.waitForTimeout(80);
    }
    console.log('  ✓ 追加3戦を消化');
  }

  // リロード → 続きから
  const gameOver = await page.locator('.banner.lose').count() > 0;
  await page.reload();
  await page.waitForTimeout(150);
  const hasContinue = await page.locator('[data-action="continue"]').count() > 0;
  console.log(`  ✓ リロード後の「続きから」: ${hasContinue ? 'あり' : 'なし'}（ゲームオーバー済み=${gameOver}）`);
  if (hasContinue) {
    await page.click('[data-action="continue"]');
    await page.waitForTimeout(120);
    const restored = await page.locator('.hud').count() > 0;
    if (!restored) throw new Error('セーブ復元に失敗');
    console.log('  ✓ セーブ復元OK');
  }

  // 魔界史
  await page.reload();
  await page.click('[data-action="history"]');
  await page.waitForTimeout(120);
  console.log(`  ✓ 魔界史画面（記録 ${await page.locator('.history-item').count()} 件）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-history.png', fullPage: true });

  // PC幅でも崩れないか
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-pc.png', fullPage: true });
  console.log('  ✓ PC幅レンダリング');

  console.log(errors.length ? '\n✗ JSエラー:\n' + errors.join('\n') : '\n✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗ 失敗:', e.message); process.exit(1); });
