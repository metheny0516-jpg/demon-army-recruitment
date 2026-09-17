const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);
  await page.evaluate(() => {
    const mk = (uid, tplId, race, spd) => ({ uid, tplId, name: race, race, job: '', hp: 180, atk: 10, def: 5, spd,
      salary: 2, loyalty: 70, traits: [], skills: [], tags: [], quote: '', unpaid: false, injured: 0, spirit: 3 });
    // サキュバスは第二幕・tier4 なので、通常の採用では並ばない。ここは名簿を差し替えて出す。
    Game.state.roster = [mk(911, 'goblin', 'ゴブリン', 9), mk(912, 'slime', 'スライム', 6),
      mk(913, 'zombie', 'ゾンビ', 3), mk(914, 'succubus', 'サキュバス', 7)];
    Game.state.activeUids = [911, 912, 913, 914];
    Game.state.stage = 1; Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
    App.render(); BattleScene.speed = 4;
  });
  await page.click('[data-action="deploy"]');
  await page.waitForSelector('#command-panel:not([hidden])', { timeout: 20000 });

  for (const [id, species] of [['p0', 'goblin'], ['p1', 'slime'], ['p2', 'zombie'], ['p3', 'succubus']]) {
    await page.evaluate(unitId => {
      const u = BattleScene.units[unitId]; BattleScene.commandPose(u, 'ready'); BattleScene.poseEnter(u);
    }, id);
    await page.waitForTimeout(150);
    const moving = await page.evaluate(unitId => BattleScene.units[unitId].sprite.getAttribute('src'), id);
    assert.match(moving, new RegExp(`/${species}/ready-spin/[0-7]\\.webp$`));
    await page.waitForTimeout(340);
    const held = await page.evaluate(unitId => BattleScene.units[unitId].sprite.getAttribute('src'), id);
    assert.match(held, new RegExp(`/${species}/ready-spin/8\\.webp$`));
  }

  const stable = await page.evaluate(() => {
    const u = BattleScene.units.p0, before = u.readySpinToken;
    BattleScene.cmdSeq.activeId = document.getElementById('command-panel').dataset.unit;
    BattleScene.renderCommandPanel(BattleScene.manual.prompt);
    return { before, after: u.readySpinToken, src: u.sprite.getAttribute('src') };
  });
  assert.equal(stable.after, stable.before, 'target/menu redraw must not restart or cancel the active spin');

  await page.evaluate(() => {
    const u = BattleScene.units.p0; BattleScene.commandPose(u, 'ready'); BattleScene.poseEnter(u);
    setTimeout(() => BattleScene.commandPose(u, 'guard'), 40);
  });
  await page.waitForTimeout(500);
  assert.match(await page.evaluate(() => BattleScene.units.p0.sprite.getAttribute('src')), /\/goblin\/guard\.webp$/,
    'a decided command must cancel old frame timers');

  await page.evaluate(() => {
    const u = BattleScene.units.p1; BattleScene.commandPose(u, 'ready'); BattleScene.poseEnter(u); BattleScene.stop();
  });
  await page.waitForTimeout(500);
  assert.match(await page.evaluate(() => BattleScene.units.p1.sprite.getAttribute('src')), /\/slime\/idle\.webp$/,
    'stop must prevent old frame timers from polluting the next scene');
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('ready spin: 4 species, redraw stability, command cancellation, stop cancellation OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
