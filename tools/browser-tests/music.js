// BGM（軍団が演奏する行進曲）が実際のプレイで鳴り、場面と編成に追従するか。
// 曲そのものではなく「軍団の状態が演奏へ届いているか」を見る。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  // BGMトグルは音量スライダーと同じく、パネルに触れたときだけ現れる
  // （常時出すと固定パネルが広がり、下の「解雇」ボタンへ近づく）。
  if (!await page.locator('#bgm-toggle').count()) errors.push('BGMトグルが無い');
  if (await page.locator('#bgm-toggle').isVisible()) errors.push('BGMトグルが常時表示になっている');
  await page.hover('#sound-control');
  if (!await page.locator('#bgm-toggle').isVisible()) errors.push('パネルに触れてもBGMトグルが出ない');
  if (await page.getAttribute('#bgm-toggle', 'aria-pressed') !== 'false') errors.push('初期状態でBGMが切れている');

  // 最初の操作で演奏が始まること
  await page.click('[data-action="new"]');
  const boot = await page.evaluate(() => ({
    scene: Music.desc && Music.desc.scene,
    running: !!Music.timer,
    connected: !!Music.out,
    track: !!Music.track,
    trackRouted: !!Music.trackGain || Music.trackDirect,
    trackPaused: Music.track ? Music.track.paused : null,
    trackLoop: Music.track ? Music.track.loop : false,
    trackSrc: Music.track ? Music.track.src : '',
    effectiveLevel: Music.trackLevel() * Sound.volume
  }));
  if (boot.scene !== 'recruit') errors.push(`採用画面の場面名が ${boot.scene}`);
  if (!boot.running) errors.push('最初の操作で演奏が始まらない');
  if (!boot.connected) errors.push('BGMが出力へ繋がっていない');
  if (!boot.track || !boot.trackRouted) errors.push('CC0実曲が出力へ繋がっていない');
  if (boot.trackPaused) errors.push('最初の操作でCC0実曲が再生されない');
  if (!boot.trackLoop) errors.push('CC0実曲がループになっていない');
  if (!boot.trackSrc.endsWith('/assets/bgm/raiders-march.ogg')) errors.push(`想定外のBGM素材: ${boot.trackSrc}`);
  if (boot.effectiveLevel < .4) errors.push(`BGMの実効レベルが小さすぎる: ${boot.effectiveLevel}`);

  // 採用すると出撃隊が増え、行進ベースが厚くなること
  const thin = await page.evaluate(() => Music.desc.layers.bass.density);
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  const thick = await page.evaluate(() => Music.desc.layers.bass.density);
  if (!(thick > thin)) errors.push(`採用してもベースが厚くならない: ${thin} → ${thick}`);

  // 場面が進むと曲も進むこと（2人目の採用で作戦会議へ移る）
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="skip"]').click();
  const missionScene = await page.evaluate(() => Music.desc.scene);
  if (missionScene !== 'mission') errors.push(`作戦画面の場面名が ${missionScene}`);

  // 戦闘に入れば行進が速くなること
  await enterMissionPhase(page);   // 開幕3日は daily.js の担当。ここは作戦会議から先を見る
  await page.locator('[data-action="missionpick"]').first().click();
  const marchBpm = await page.evaluate(() => Music.desc.bpm);
  await page.click('[data-action="deploy"]');
  const battle = await page.evaluate(() => ({ scene: Music.desc.scene, bpm: Music.desc.bpm, src: Music.track && Music.track.src }));
  if (battle.scene !== 'battle') errors.push(`戦闘の場面名が ${battle.scene}`);
  if (!(battle.bpm > marchBpm)) errors.push(`戦闘で行進が速くならない: ${marchBpm} → ${battle.bpm}`);
  if (!battle.src || !battle.src.endsWith('/assets/bgm/battle-theme.ogg')) errors.push(`戦闘BGMへ切り替わらない: ${battle.src}`);
  await page.click('[data-action="skiplog"]');
  const settled = await page.evaluate(() => Music.desc.scene);
  if (!['victory', 'defeat'].includes(settled)) errors.push(`決着後の場面名が ${settled}`);
  await page.click('[data-action="afterbattle"]');

  // 未払いは演奏を痩せさせる（ゲーム状態からの導出が生きているか）
  const unrest = await page.evaluate(() => {
    const before = Music.describe(Game.state, { scene: 'battle' });
    const striking = JSON.parse(JSON.stringify(Game.state));
    striking.roster.forEach(m => { m.unpaid = true; m.loyalty = 5; });
    const after = Music.describe(striking, { scene: 'battle' });
    return { before: before.unrest, after: after.unrest, bpmBefore: before.bpm, bpmAfter: after.bpm };
  });
  if (!(unrest.after > unrest.before)) errors.push('未払いが不満に反映されない');
  if (!(unrest.bpmAfter < unrest.bpmBefore)) errors.push('不満で行進が鈍らない');

  // BGMだけを切れて、設定が残ること
  await page.hover('#sound-control');
  await page.click('#bgm-toggle');
  const off = await page.evaluate(() => ({
    pressed: document.getElementById('bgm-toggle').getAttribute('aria-pressed'),
    struck: document.getElementById('bgm-toggle').classList.contains('bgm-off'),
    timer: !!Music.timer,
    trackPaused: Music.track ? Music.track.paused : true
  }));
  if (off.pressed !== 'true' || !off.struck) errors.push('BGMオフの表示にならない');
  if (off.timer) errors.push('BGMを切っても演奏が止まらない');
  if (!off.trackPaused) errors.push('BGMを切ってもCC0実曲が止まらない');
  await page.reload();
  await page.hover('#sound-control');
  if (await page.getAttribute('#bgm-toggle', 'aria-pressed') !== 'true') errors.push('BGM設定が復元されない');

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ BGM: 演奏開始・編成追従・場面追従・未払い反映・オンオフ保存');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
