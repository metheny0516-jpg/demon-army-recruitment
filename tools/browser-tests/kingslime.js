// キングスライム合体を編成画面で断れること。クリック操作の安定待ちに依存しない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase, passCommandPhase } = require('./helpers.js');

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

  // スライム3体の編成にする
  const setup = await page.evaluate(() => {
    const t = MONSTER_TEMPLATES.find(x => x.id === 'slime');
    Game.state.roster = [1, 2, 3].map(i => ({
      uid: i, tplId: 'slime', name: 'ぬる' + i, race: t.race, job: '見習い',
      hp: 26, atk: 5, def: 2, spd: 4, salary: 1, loyalty: 80, merit: 0, rankId: 'soldier',
      traits: ['slime_body'], tags: [], quote: '', unpaid: false, department: 'combat'
    }));
    Game.state.activeUids = [1, 2, 3];
    Game.state.uidSeq = 4;
    App.render();
    return { on: Game.state.kingSlimeMerge, text: document.querySelector('.king-panel').innerText };
  });
  if (setup.on !== true) errors.push('既定で合体する設定になっていない');
  if (!setup.text.includes('キングスライム合体')) errors.push('合体パネルが出ない');
  if (!setup.text.includes('3体のまま') || !setup.text.includes('合体して1体')) {
    errors.push('合体すると何を得て何を失うかが並んで読めない');
  }

  // 断れる
  await page.locator('[data-action="kingmerge"]').click();
  const off = await page.evaluate(() => ({ on: Game.state.kingSlimeMerge,
    text: document.querySelector('.king-panel').innerText }));
  if (off.on !== false) errors.push('合体を断れない');
  if (!off.text.includes('合体しない')) errors.push('断った状態が画面から読めない');

  // 断ったまま出撃すると3体のまま戦う
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await passCommandPhase(page);
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({
    roster: Game.state.roster.map(m => m.tplId),
    king: (Game.state.lastBattle.synergies || []).includes('キングスライム')
  }));
  if (after.roster.includes('king_slime')) errors.push('断ったのに合体している');
  if (after.king) errors.push('合体していないのにシナジー発動として記録されている');

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ キングスライム合体：既定は合体・編成画面で断れる');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
