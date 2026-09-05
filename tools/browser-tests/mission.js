const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase, passCommandPhase } = require('./helpers.js');
const ok = (condition, message) => console.log((condition ? '  ✓ ' : '  ✗ ') + message);

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);   // 開幕3日は daily.js の担当。ここは作戦会議から先を見る

  const cards = page.locator('.mission-card');
  ok(await cards.count() === 3, '作戦が3種類提示される');
  ok(await page.locator('.mission-economy').count() === 3, '各作戦に収支見込が表示される');
  ok(await page.locator('.mission-formation').count() === 3, '各作戦に敵編成名と特徴が事前表示される');
  ok(await page.locator('.mission-purpose').count() === 3, '各作戦の戦略目的が表示される');
  const missionText = await page.locator('.mission-grid').innerText();
  ok(missionText.includes('資金・食料を補給') && missionText.includes('忠誠回復・建材確保')
    && missionText.includes('決戦へ進む'), '補給・再建・決戦進行の役割が区別される');
  ok((missionText.match(/施設施工見込/g) || []).length === 3, '全作戦に勝利後の施工見込が表示される');
  ok(missionText.includes('決戦まであと8勝'), '王国侵攻に最終決戦までの距離が表示される');
  const before = await page.evaluate(() => ({ alert: Game.state.alert, conquest: Game.state.conquest, turn: Game.state.turn }));

  await page.locator('[data-action="missionpick"]').first().click();
  await page.evaluate(() => Game.state.roster.forEach(m => { m.hp = 9999; m.atk = 999; m.def = 99; m.spd = 99; }));
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await passCommandPhase(page);
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({
    alert: Game.state.alert,
    conquest: Game.state.conquest,
    turn: Game.state.turn,
    raids: Game.state.missionCounts.raid
  }));
  ok(after.alert === before.alert + 2, '略奪で警戒度が2上がる');
  ok(after.conquest === before.conquest, '略奪では王国攻略が進まない');
  ok(after.turn === before.turn + 1 && after.raids === 1, '作戦数と略奪回数が記録される');

  console.log(errors.length ? '✗ JSエラー: ' + errors.join(', ') : '✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || process.exitCode ? 1 : 0);
})().catch(error => { console.error('✗', error.message); process.exit(1); });
