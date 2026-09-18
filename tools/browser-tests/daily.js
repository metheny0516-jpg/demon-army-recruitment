const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { dismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
  await page.click('[data-action="new"]');
  await dismissMormo(page);
  await page.locator('[data-action="hire"]').first().click();
  await page.locator('[data-action="hire"]').first().click();
  await page.locator('[data-action="skip"]').click();
  await dismissMormo(page);
  const state = await page.evaluate(() => ({ phase: Game.state.phase, opening: Game.state.openingPrototype }));
  if (state.opening || state.phase !== 'mission') throw new Error('採用後に通常の作戦会議へ直行しない');
  if (await page.getByText(/勇者到着まで|本日、勇者襲来/).count()) throw new Error('撤廃した3日間の期限表示が残っている');
  if (await page.locator('[data-action="endday"], [data-action="openingbattle"]').count()) throw new Error('撤廃した日次操作が残っている');
  // 地図の候補3つ＋訓練の4枚（2026-09-15。札の中の「略奪」「贈る」も missionpick なので、数えるのは札）
  if (await page.locator('.mission-card').count() !== 4) throw new Error('通常の作戦（候補3つ＋訓練）が出ない');
  if (await page.locator('.mission-card.mission-train').count() !== 1) throw new Error('訓練の札が出ない');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('✓ 開幕3日間を挟まず通常ループへ入る');
  await browser.close();
})().catch(e => { console.error('✗ 失敗:', e.message); process.exit(1); });
