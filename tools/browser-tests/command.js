// 魔王命令：戦闘がラウンド2の終わりで止まり、命令を選んで続きが走ることを実プレイの導線で見る。
// 「見ているだけ」から「一度だけ決める」へ変わる場所なので、詰まないことを最優先で確認する。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  // 2ラウンドで終わらない戦いを作る（瞬殺だと命令の出番がないのが正しい挙動）
  const setUpLongFight = async () => {
    await page.evaluate(() => {
      const st = Game.state;
      st.roster.forEach(m => { m.hp = 200; m.atk = 6; m.def = 8; });
      if (!st.selectedMission) Game.prepareMissions(true), Game.selectMission(2);
      st.selectedMission.units.forEach(u => { u.hp = u.hp * 14; u.atk = 2; });
      st.phase = 'formation';
      App.render();
    });
  };
  await setUpLongFight();

  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.waitForSelector('[data-action="command"]', { timeout: 15000 });
  ok(true, '戦闘の途中で命令画面に入る');

  const phase = await page.evaluate(() => Game.state.phase);
  ok(phase === 'command', '命令待ちのフェーズになっている');

  const cards = await page.locator('.command-card').count();
  ok(cards === await page.evaluate(() => Battle.COMMANDS.length),
    `命令の選択肢がすべて出ている（${cards}個）`);
  const situation = await page.locator('.command-sides').count();
  ok(situation === 1, '両軍の戦況が出ている');

  const goldBefore = await page.evaluate(() => Game.state.gold);
  await page.screenshot({ path: process.env.SP + '/command.png' });

  // 命令を出す → 後半が再生される → 戦果へ進める
  await page.locator('[data-action="command"][data-id="rally"]').click();
  await page.waitForTimeout(200);
  const scene = await page.locator('#band-player').count();
  ok(scene === 1, '命令のあと、戦闘の続きが再生される');

  await page.click('[data-action="skiplog"]');
  await page.waitForSelector('[data-action="afterbattle"]', { timeout: 15000 });
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => ({
    phase: Game.state.phase,
    notes: (Game.state.lastBattle && Game.state.lastBattle.notes) || [],
    rounds: Game.state.lastBattle && Game.state.lastBattle.logLength,
    gold: Game.state.gold
  }));
  ok(['result', 'defeat', 'clear', 'gameover'].includes(after.phase),
    `戦闘が最後まで終わって戦果へ進む（${after.phase}）`);
  ok(after.notes.some(n => n.includes('魔王命令')), '出した命令が戦果の記録に残る');
  ok(after.gold !== goldBefore || after.phase !== 'result', '戦果の精算は命令のあとに一度だけ行われる');

  // 命令を見送っても進める
  await page.evaluate(() => { Game.state.phase = 'mission'; App.render(); });
  await page.evaluate(() => Game.selectMission(2));
  await setUpLongFight();
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.waitForSelector('[data-action="command"]', { timeout: 15000 });
  await page.locator('[data-action="command"][data-id=""]').click();
  await page.waitForTimeout(150);
  await page.click('[data-action="skiplog"]');
  await page.waitForSelector('[data-action="afterbattle"]', { timeout: 15000 });
  ok(true, '命令を見送っても戦闘は最後まで進む');

  ok(errors.length === 0, errors.length ? 'JSエラー: ' + errors.join(' / ') : 'JSエラーなし');
  console.log(process.exitCode ? '✗ 魔王命令' : '✓ 魔王命令：区切りで止まる・3択・続きの再生・見送り');
  await browser.close();
})();
