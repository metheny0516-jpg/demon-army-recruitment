// 傭兵市場が編成画面で使えること。クリック操作の安定待ちに依存しない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('[data-action="hire"]:not([disabled])').first();
    if (await btn.count()) await btn.click();
  }
  await enterMissionPhase(page);
  await page.locator('[data-action="missionpick"]').first().click();

  // 金が無いときは雇えないことが読める
  await page.evaluate(() => { Game.state.gold = 0; App.render(); });
  const poor = await page.locator('.merc-panel').innerText();
  if (!poor.includes('傭兵市場')) errors.push('傭兵市場のパネルが出ない');
  if (!/必要/.test(poor)) errors.push('金貨が足りないことが読めない');
  if (!await page.locator('[data-action="hiremerc"][disabled]').count()) {
    errors.push('金貨不足でも雇うボタンが押せてしまう');
  }

  // 雇うと所持金が減り、雇用中として出る
  const before = await page.evaluate(() => { Game.state.gold = 60; App.render();
    return { gold: Game.state.gold, cost: Game.mercenaryCost(),
      roster: Game.state.roster.length, name: Game.mercenaryOffers()[0].name }; });
  await page.locator('[data-action="hiremerc"]').first().click();
  const after = await page.evaluate(() => ({ gold: Game.state.gold,
    hired: (Game.state.mercenaries || []).map(m => m.name),
    roster: Game.state.roster.length, active: Game.state.activeUids.length }));
  if (after.gold !== before.gold - before.cost) errors.push('雇用費が所持金から引かれない');
  if (!after.hired.includes(before.name)) errors.push('雇った傭兵が記録されない');
  const panel = await page.locator('.merc-panel').innerText();
  if (!panel.includes('雇用中')) errors.push('雇用中の表示が出ない');
  if (!panel.includes(before.name)) errors.push('雇った傭兵の名前が読めない');

  // 出撃5枠を消費しない
  const squad = await page.evaluate(() => Game.activeRoster().length);
  if (after.active !== squad) errors.push('傭兵が出撃枠を消費している');
  if (after.roster !== before.roster) errors.push('傭兵がロスターへ入っている: ' + after.roster);

  // 戦って、戦果に傭兵として出て、戦闘後は去る
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(200);
  const result = await page.evaluate(() => ({
    badges: Array.from(document.querySelectorAll('.contrib-badge')).map(b => b.textContent),
    left: (Game.state.mercenaries || []).length,
    roster: Game.state.roster.length
  }));
  if (!result.badges.some(b => b.includes('傭兵'))) errors.push('戦果に傭兵の印が出ない');
  if (result.left !== 0) errors.push('戦闘後も傭兵が残っている');
  if (result.roster > before.roster) errors.push('傭兵が軍団に居座っている: ' + result.roster);

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 傭兵市場：雇用・出撃・戦果表示・契約終了');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
