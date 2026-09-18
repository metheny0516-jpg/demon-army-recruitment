const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  // 第二幕の最終ステージ直前に進め、決着後も軍団が残ることを確認する
  await page.evaluate(() => {
    Game.state.act = 2;
    Game.state.stage = 14;
    Game.state.conquest = 13;
    Game.state.turn = 60;
    Game.state.alert = 6;
    Game.state.gold = 999;
    Game.state.roster.forEach(m => { m.hp = 9999; m.atk = 999; m.def = 99; m.spd = 99; });
    Game.checkCounterattack();
    Game.prepareMissions(true);
    Game.selectMission(0);
    Game.state.phase = 'formation';
    App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(150);
  const win = await page.locator('.banner.win').count();
  const head = await page.locator('.banner h2').innerText();
  const state = await page.evaluate(() => ({ phase: Game.state.phase, act2Cleared: Game.state.act2Cleared, saved: !!Storage.loadRun(), history: Storage.loadHistory().length }));
  console.log(`  第二幕決着: banner.win=${win} / 見出し="${head.trim()}" / ${JSON.stringify(state)}`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/shot-clear.png', fullPage: true });

  // 力試し（docs/SPEC_TRIAL_BATTLE_2026-09-18.md）：決着後の作戦会議に札が出て、選んで戦闘へ入れる。
  await page.evaluate(() => {
    Game.afterResult();
    // 面接は応募者の数だけ続く。作戦会議まで進めてから札を見る。
    for (let i = 0; i < 12 && Game.state.phase === 'recruit'; i++) Game.skipHire();
    if (Game.state.phase !== 'mission') Game.prepareMissions(true);
    App.render();
  });
  await page.waitForTimeout(200);
  const trialCard = await page.locator('.mission-card.mission-trial').count();
  const trialText = trialCard ? (await page.locator('.mission-card.mission-trial').innerText()).replace(/\n/g, ' ') : '';
  // 札は画面のボタンから選ぶ（本番と同じ道）。編成画面まで来ることを見る。
  const trialButton = page.locator('.mission-card.mission-trial [data-action="missionpick"]');
  if (await trialButton.count()) await trialButton.first().click();
  await page.waitForTimeout(200);
  const picked = await page.evaluate(() => {
    const m = Game.state.selectedMission;
    if (!m || m.missionKind !== 'trial') return null;
    return { army: m.army, level: m.trial.level, mult: m.trial.mult, training: m.training, phase: Game.state.phase };
  });
  // 出撃そのものは Game.deploy()（出撃ボタンと同じ道）。編成画面の描画待ちに引っかからない。
  const fighting = await page.evaluate(() => {
    const out = Game.deploy();
    return !!out && (Game.state.lastBattle !== undefined);
  });
  const trialOk = trialCard === 1 && picked && picked.training === true
    && picked.phase === 'formation' && fighting;
  console.log(`  力試し: 札=${trialCard} 第${(picked ? picked.level : -1) + 1}段 相手=${picked ? picked.army : '—'}`
    + ` ×${picked ? picked.mult : '—'} → 戦闘へ=${fighting}`);
  if (!trialOk) console.log(`✗ 力試しの札から戦闘へ入れない（${trialText.slice(0, 60)}）`);

  console.log(errors.length ? '✗ JSエラー: ' + errors.join(', ') : '✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || !win || state.phase !== 'result' || !state.act2Cleared || !state.saved || state.history !== 0 || !trialOk || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
