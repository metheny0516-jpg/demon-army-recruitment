const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.evaluate(() => { Game.state.gold = 30; App.render(); });
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  if (await page.evaluate(() => Game.state.phase) !== 'recruit') throw new Error('無料枠終了で面接が自動終了した');
  const first = await page.locator('[data-action="hire"]').first().innerText();
  if (!first.includes('紹介料 4G') || !first.includes('給与')) throw new Error('紹介料と給与を区別していない');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  const second = await page.locator('[data-action="hire"]').first().innerText();
  if (!second.includes('紹介料 8G')) throw new Error('追加紹介料が倍増しない');
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  if (!await page.locator('[data-action="skip"]').count()) throw new Error('再開後に面接終了操作がない');
  await page.locator('[data-action="skip"]').click();
  if (await page.evaluate(() => Game.state.phase) !== 'mission') throw new Error('明示終了で作戦会議へ進まない');

  // U1: 応募者の能力→接続1件→代償の順で読み、必要操作と起点/反応を区別できる。
  await page.evaluate(() => {
    const [looter, greedy] = Game.state.roster;
    looter.name = 'グルグ'; looter.race = 'ゴブリン'; looter.traits = ['pickpocket']; looter.tags = [];
    greedy.name = 'ボル'; greedy.race = 'インプ'; greedy.traits = ['greedy']; greedy.tags = ['caster'];
    Game.state.roster = [looter];
    Game.state.activeUids = [looter.uid];
    Game.state.applicants = [greedy];
    Game.state.phase = 'recruit';
    UI.recruit();
  });
  const cardText = await page.locator('.card').first().innerText();
  if (!cardText.includes('起点\nグルグの《追い剥ぎ》') || !cardText.includes('反応\nボルの《強欲》')) {
    throw new Error('採用接続で起点と反応者を区別していない');
  }
  if (!cardText.includes('1Gを略奪予約') || !cardText.includes('必要：採用・出撃')) {
    throw new Error('略奪予約と採用・出撃条件が読めない');
  }
  const order = await page.locator('.card').first().evaluate(card => ({
    trait: [...card.children].findIndex(el => el.classList.contains('traits')),
    link: [...card.children].findIndex(el => el.classList.contains('applicant-links')),
    cost: [...card.children].findIndex(el => el.matches('[data-action="hire"]')
      || (el.querySelector && el.querySelector('[data-action="hire"]')))
  }));
  if (!(order.trait < order.link && order.link < order.cost)) throw new Error('能力→接続→代償の情報順になっていない');

  // U1: 種族に限定せず、《死霊術》を持つ本人の生存条件と最前列警告を既存欄へ出す。
  await page.evaluate(() => {
    const unit = Game.state.roster[0];
    unit.name = 'ネル'; unit.traits = ['necromancy'];
    Game.state.activeUids = [unit.uid];
    Game.state.phase = 'formation';
    UI.formation();
  });
  const deathText = await page.locator('text=💀 死亡反応').locator('..').innerText();
  if (!deathText.includes('本人が生存してラウンド終了') || !deathText.includes('ネルは最前列')) {
    throw new Error('死霊術本人の生存条件と最前列警告が読めない');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('✓ 面接継続・追加紹介・U1情報順/接続条件・死霊術の生存条件');
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
