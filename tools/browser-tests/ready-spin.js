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

  // ── 10コマ契約（.codex/skills/battle-spin-9frame/SKILL.md）──
  // 8＝指示待ちの見せ場、9＝命令を受けて戦闘態勢に入った姿。用途が違う。
  // いま 9.webp を持つ種族はまだ無いので、素材に依らず「いつ・どの順で出すか」を見る。

  // (2)(3) 対象選びへ進んだだけ・もどるでは確定後回転を再生しない。確定した1回だけ再生する。
  await page.evaluate(() => {
    BattleScene.confirmSpinCalls = [];
    BattleScene.rawConfirmSpinEnter = BattleScene.confirmSpinEnter;
    BattleScene.confirmSpinEnter = function (u) { BattleScene.confirmSpinCalls.push(u.id); return false; };
  });
  const panel = page.locator('#command-panel');
  await panel.locator('[data-cmd="attack"]').first().click();          // → 狙い選びへ
  await page.waitForTimeout(60);
  assert.deepEqual(await page.evaluate(() => BattleScene.confirmSpinCalls), [],
    'entering target selection is not a confirmed action');
  await panel.locator('[data-nav="back"]').first().click();            // もどる
  await page.waitForTimeout(60);
  assert.deepEqual(await page.evaluate(() => BattleScene.confirmSpinCalls), [],
    'going back is not a confirmed action');
  await page.evaluate(() => BattleScene.renderCommandPanel(BattleScene.manual.prompt));  // 再描画
  await page.waitForTimeout(60);
  assert.deepEqual(await page.evaluate(() => BattleScene.confirmSpinCalls), [],
    'a redraw is not a confirmed action');
  await panel.locator('[data-cmd="guard"]').first().click();           // まもる＝対象不要で確定
  await page.waitForTimeout(60);
  assert.equal((await page.evaluate(() => BattleScene.confirmSpinCalls)).length, 1,
    'a confirmed action plays the confirm turn exactly once');
  await page.evaluate(() => { BattleScene.confirmSpinEnter = BattleScene.rawConfirmSpinEnter; });

  // (4) 確定時は 0→7 を1周して 9 に着地する。素材が無くても順番は検査できるよう、
  //     img.src の代入だけを記録する（読み込みは起こさない）。
  const order = await page.evaluate(async () => {
    const u = BattleScene.units.p3, img = u.sprite, rec = [];
    const real = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(img, 'src', {
      configurable: true, get() { return rec[rec.length - 1] || ''; },
      set(v) { rec.push(String(v).split('/').slice(-2).join('/')); }
    });
    BattleScene.CONFIRM_SPIN_SPRITES.add('succubus');
    BattleScene.confirmSpinEnter(u);
    await new Promise(r => setTimeout(r, 320));
    delete img.src; void real;
    return rec;
  });
  assert.deepEqual(order, ['ready-spin/0.webp', 'ready-spin/1.webp', 'ready-spin/2.webp', 'ready-spin/3.webp',
    'ready-spin/4.webp', 'ready-spin/5.webp', 'ready-spin/6.webp', 'ready-spin/7.webp', 'ready-spin/9.webp'],
    'the confirm turn is one cycle of 0..7 landing on 9: ' + order.join(','));

  // (5)(7) 着地したら行動順まで保つ。同じ人物の再描画では回り直さないし、9 を手放さない。
  const held = await page.evaluate(() => {
    const u = BattleScene.units.p3, before = u.readySpinToken;
    BattleScene.cmdSeq.commands[u.id] = { cmd: 'guard', target: null, skill: null };
    BattleScene.renderCommandPanel(BattleScene.manual.prompt);
    return { before, after: u.readySpinToken, confirmHeld: u.confirmHeld, pose: u.sprite.dataset.pose };
  });
  assert.equal(held.after, held.before, 'a redraw must not restart the confirm turn');
  assert.equal(held.confirmHeld, true, 'the combat-ready pose is held until the action begins');
  assert.equal(held.pose, 'confirm');

  // (6) 行動が始まれば既存のモーションが 9 を上書きする。
  await page.evaluate(() => BattleScene.setPose(BattleScene.units.p3, 'attack-windup'));
  assert.match(await page.evaluate(() => BattleScene.units.p3.sprite.getAttribute('src')),
    /\/succubus\/attack-windup\.webp$/, 'the action motion overrides the combat-ready pose');


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
  // (8) 戦闘が終われば古いタイマーは発火しない（保持も解ける）。
  await page.evaluate(() => {
    const u = BattleScene.units.p3;
    BattleScene.confirmSpinEnter(u); BattleScene.stop();
  });
  await page.waitForTimeout(320);
  assert.equal(await page.evaluate(() => BattleScene.units.p3.confirmHeld), false,
    'stop must release the hold and drop queued frames');
  assert.match(await page.evaluate(() => BattleScene.units.p3.sprite.getAttribute('src')),
    /\/succubus\/(idle|fallen)\.webp$/, 'stop must not leave the confirm frames on screen');

  // (9) 9.webp を持たない旧9コマの種族は従来どおり。いまはサキュバスもこちら。
  const legacy = await page.evaluate(async () => {
    const u = BattleScene.units.p3;
    BattleScene.CONFIRM_SPIN_SPRITES.delete('succubus');
    BattleScene.commandPose(u, 'guard');
    const played = BattleScene.confirmSpinEnter(u);
    await new Promise(r => setTimeout(r, 220));
    return { played, src: u.sprite.getAttribute('src'), confirmHeld: u.confirmHeld };
  });
  assert.equal(legacy.played, false, 'a nine-frame character must not play the confirm turn');
  assert.equal(legacy.confirmHeld, false);
  assert.match(legacy.src, /\/succubus\/guard\.webp$/, 'a nine-frame character keeps its existing pose');

  // (10) 低モーションでは回さず、8（指示待ち）と 9（戦闘準備）へ直接切り替える。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { const u = BattleScene.units.p3; BattleScene.commandPose(u, 'ready'); BattleScene.poseEnter(u); });
  await page.waitForTimeout(120);
  assert.match(await page.evaluate(() => BattleScene.units.p3.sprite.getAttribute('src')),
    /\/succubus\/ready-spin\/8\.webp$/, 'reduced motion goes straight to the command-request pose');
  const reduced = await page.evaluate(async () => {
    const u = BattleScene.units.p3, img = u.sprite, rec = [];
    Object.defineProperty(img, 'src', {
      configurable: true, get() { return rec[rec.length - 1] || ''; },
      set(v) { rec.push(String(v).split('/').slice(-2).join('/')); }
    });
    BattleScene.CONFIRM_SPIN_SPRITES.add('succubus');
    BattleScene.confirmSpinEnter(u);
    await new Promise(r => setTimeout(r, 220));
    delete img.src;
    BattleScene.CONFIRM_SPIN_SPRITES.delete('succubus');
    return rec;
  });
  assert.deepEqual(reduced, ['ready-spin/9.webp'],
    'reduced motion goes straight to the combat-ready pose: ' + reduced.join(','));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('ready spin: 4 species, redraw stability, command/stop cancellation, '
    + 'confirm turn 0..7→9, held until the action, redraw-safe, nine-frame fallback, reduced motion OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
