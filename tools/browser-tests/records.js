// 魔界史の主要記録（最大CHAIN・最大OVERKILL）が、終了画面と歴史カードで読めること。
// クリック操作に依存せず、画面を直接描いて中身を読む。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  // 終了画面（第N代魔王軍の記録）
  const overText = await page.evaluate(() => {
    Game.newRun();
    const record = {
      gen: 3, demonKingName: '若き魔王', cleared: true, battlesWon: 8, conquest: 8, alert: 2,
      reignYears: 35, maxPower: 420, maxArmySize: 12, maxChain: 12, maxOverkill: 684,
      generalsMade: [], hallOfFame: null, battleIncidentTotal: 1, facilityLevel: 2,
      mainRace: 'ゴブリン', region: '王都（制圧）', cause: '人間界を征服し引退',
      payrollChoices: { regular: 8 }, finalRoster: []
    };
    UI.gameover(record, [record]);
    return document.body.innerText;
  });
  if (!await page.locator('.record-highlights').count()) errors.push('終了画面に主要記録の並びが無い');
  if (!overText.includes('最大CHAIN') || !overText.includes('12')) errors.push('終了画面で最大CHAINが読めない');
  if (!overText.includes('最大OVERKILL') || !overText.includes('684%')) errors.push('終了画面で最大OVERKILLが読めない');
  const overCells = await page.locator('.record-highlights b').allInnerTexts();
  if (overCells.length !== 2) errors.push('主要記録が2つではない: ' + overCells.join(','));

  // 魔界史の各カード。フィールドの無い旧レコードも混ぜる
  const histText = await page.evaluate(() => {
    UI.history([
      { gen: 1, cleared: false, reignYears: 8, maxPower: 90, maxArmySize: 4, battlesWon: 2,
        finalRoster: [], generalsMade: [], payrollChoices: {}, mainRace: 'スライム',
        region: '辺境', cause: '敗北' },                                   // 旧レコード（記録フィールド無し）
      { gen: 2, cleared: true, reignYears: 30, maxPower: 300, maxArmySize: 10, battlesWon: 8,
        maxChain: 9, maxOverkill: 420, finalRoster: [], generalsMade: [], payrollChoices: {},
        mainRace: 'ゴブリン', region: '王都（制圧）', cause: '征服' }
    ]);
    return document.body.innerText;
  });
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.history-item'))
    .filter(el => el.querySelector('.record-highlights'))
    .map(el => el.querySelector('.record-highlights').innerText.replace(/\n/g, ' ')));
  const runCards = cards.slice(0, 2);
  if (runCards.length !== 2) errors.push('魔界史カードの主要記録が2枚ぶん出ていない: ' + cards.length);
  if (!runCards.some(t => t.includes('⛓ 0') && t.includes('💥 0%'))) {
    errors.push('旧レコードが0として表示されない: ' + runCards.join(' | '));
  }
  if (!runCards.some(t => t.includes('⛓ 9') && t.includes('💥 420%'))) {
    errors.push('魔界史カードで2つの主要記録が読めない: ' + runCards.join(' | '));
  }
  if (histText.includes('総余剰') || histText.includes('獲得G')) errors.push('主要記録以外の統計が並んでいる');

  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/records-history.png', fullPage: true });
  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 終了画面と魔界史で主要記録2つが読める');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
