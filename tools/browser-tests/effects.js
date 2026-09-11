const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  await page.evaluate(() => {
    // BattleScene.shell() は世代表示に Game.state を使う。単体テストでも実ランと同じ前提を作る。
    Game.newRun();
    localStorage.removeItem('maou_speed');
    const player = { id: 'p0', tplId: 'goblin', name: '古参のゴブ太', race: 'ゴブリン', icon: '👺', side: 'player', hp: 30, maxHp: 30 };
    const enemy = { id: 'e0', name: '勇者アレン', icon: '⚔️', side: 'enemy', hp: 50, maxHp: 50 };
    UI.set(BattleScene.shell({
      stage: 8, baseStage: Game.MAX_CONQUEST, missionKind: 'invade',
      region: '王都', army: '勇者アレン一行'
    }));
    BattleScene.play([
      { type: 'battle_start', player: [player], enemy: [enemy] },
      { type: 'round_start', round: 1, emphasis: 1, text: '── ラウンド 1 ──' },
      { type: 'attack', fromId: 'p0', toId: 'e0', dmg: 8, hp: 42, maxHp: 50, emphasis: 1 },
      { type: 'round_start', round: 2, emphasis: 1, text: '── ラウンド 2 ──' },
      { type: 'synergy', id: 'general_command', name: '将軍の号令', desc: '全軍、進め！' },
      { type: 'incident', id: 'mutiny', name: '仲間割れ', unitId: 'p0', targetId: 'p0', emphasis: 3 },
      { type: 'revive', unitId: 'p0', hp: 10, maxHp: 30 },
      { type: 'result', victory: true }
    ]);
  });

  await page.waitForTimeout(120);
  if (!await page.locator('.scene.final-battle').count()) errors.push('最終決戦の専用背景が無い');
  if (!await page.locator('.scene-intro.show').count()) errors.push('最終決戦の開幕表示が無い');

  // 尺は BattleScene が決める（61c89e3 で等速を遅くした）。固定の待ち時間を書くと
  // 演出の尺を変えるたびにここが落ちるので、出るべき表示の側を待つ。
  const appears = async (label, fn, timeout = 8000) => {
    try { await page.waitForFunction(fn, null, { timeout }); return true; }
    catch (e) { errors.push(label); return false; }
  };

  if (await appears('ラウンド開始表示が無い', () => document.querySelector('.round-banner.show'))) {
    if ((await page.locator('#round-number').innerText()) !== 'ROUND 1') errors.push('ROUND 1 が読めない');
  }

  await appears('攻撃者と対象が読めない', () => {
    const t = document.getElementById('action-caption')?.textContent || '';
    return t.includes('古参のゴブ太') && t.includes('勇者アレン');
  });
  const action = await page.locator('#action-caption').innerText();
  if (!action.includes('古参のゴブ太') || !action.includes('勇者アレン')) errors.push('攻撃者と対象が読めない');

  // 画像VFXはタイムライン契約を変えず、対象カード上へ一時的に重なる。
  await page.evaluate(() => {
    BattleScene.stop();
    BattleScene.render({
      type: 'attack', fromId: 'p0', toId: 'e0', dmg: 8, hp: 34, maxHp: 50, emphasis: 2
    });
  });
  await appears('命中前の溜めがない',
    () => document.querySelector('#bu-p0 .bu-sprite-img')?.dataset.pose === 'attack-windup');
  const windup = await page.locator('#bu-p0 .bu-sprite-img').getAttribute('data-pose');
  if (windup !== 'attack-windup') errors.push('命中前の溜めがない');
  // 画像VFXは接触の瞬間に出る。いつ当たるかは尺しだいなので、出るのを待つ。
  await appears('斬撃・命中の画像VFXが出ない',
    () => document.querySelector('#bu-e0 .bu-vfx.vfx-slash') && document.querySelector('#bu-e0 .bu-vfx.vfx-impact'));
  const vfx = await page.locator('#bu-e0 .bu-vfx').evaluateAll(images => images.map(image => ({
    kind: image.className,
    loaded: image.complete && image.naturalWidth > 0
  })));
  if (!vfx.some(item => item.kind.includes('vfx-slash') && item.loaded)) errors.push('斬撃画像VFXが対象へ表示されない');
  if (!vfx.some(item => item.kind.includes('vfx-impact') && item.loaded)) errors.push('命中画像VFXが対象へ表示されない');
  const pose = await page.locator('#bu-p0 .bu-sprite-img').evaluate(image => ({
    pose: image.dataset.pose,
    loaded: image.complete && image.naturalWidth > 0
  }));
  if (pose.pose !== 'strike' || !pose.loaded) errors.push('ゴブリンの振り抜きへ切り替わらない');
  if (process.env.SP) await page.screenshot({ path: (process.env.SP || '.screenshots') + '/scene-image-vfx.png' });

  await page.evaluate(() => {
    BattleScene.render({ type: 'survive', unitId: 'p0', hp: 1, maxHp: 30, emphasis: 2 });
    BattleScene.render({ type: 'revive', unitId: 'p0', hp: 10, maxHp: 30, emphasis: 2 });
    BattleScene.render({ type: 'overkill', toId: 'e0', percent: 180, excess: 40, rank: '蹂躙', emphasis: 2 });
  });
  await appears('guard/revive/overkill の画像VFXが出ない', () =>
    ['guard', 'revive', 'overkill'].every(kind => document.querySelector(`.bu-vfx.vfx-${kind}`)));
  for (const kind of ['guard', 'revive', 'overkill']) {
    const loaded = await page.locator(`.bu-vfx.vfx-${kind}`).evaluateAll(images =>
      images.some(image => image.complete && image.naturalWidth > 0));
    if (!loaded) errors.push(`${kind}画像VFXが表示されない`);
  }

  const timing = await page.evaluate(() => ({
    round: BattleScene.SPECIAL_DURATION.round_start,
    attack: BattleScene.DURATION[1],
    cap: BattleScene.BUDGET_MS
  }));
  if (timing.round < 1000 || timing.attack < 600 || timing.cap < 40000) errors.push('観戦テンポ設定が短すぎる');

  await page.evaluate(() => BattleScene.render({
    type: 'resource_forfeit', sourceId: 'p0', resource: 'gold', amount: 2,
    label: '殉職手当', emphasis: 2, text: '殉職手当2Gを没収', cls: 'loot'
  }));
  const forfeitAction = await page.locator('#action-caption').innerText();
  const forfeitFloat = await page.locator('#pop-p0').innerText();
  if (!forfeitAction.includes('殉職手当没収') || !forfeitAction.includes('-2G')) {
    errors.push('殉職手当の没収理由と金額が中央字幕で読めない');
  }
  if (!forfeitFloat.includes('-2G')) errors.push('殉職手当の没収額が対象者へ表示されない');

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ ラウンド区切り・攻撃表示・画像VFX・最終決戦演出');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
