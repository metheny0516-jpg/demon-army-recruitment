const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.evaluate(() => {
    Game.newRun();
    localStorage.setItem('maou_speed', '4');
    const player = { id:'p0', tplId:'goblin', name:'生存者', race:'ゴブリン', side:'player', hp:30, maxHp:30 };
    const enemy = { id:'e0', name:'標的', race:'人間', side:'enemy', hp:50, maxHp:50 };
    const skeleton = { id:'ps1', tplId:'skeleton', name:'骸骨従者', race:'骸骨兵', side:'player',
      hp:9, maxHp:9, atk:4, def:0, spd:5, traits:[], tags:['undead'], summoned:true };
    UI.set(BattleScene.shell({ stage:2, baseStage:2, missionKind:'invade', region:'街道', army:'王国兵' }));
    BattleScene.play([
      { type:'battle_start', player:[player], enemy:[enemy] },
      { type:'summon', unit:skeleton, sourceUnitId:'p0', emphasis:3, text:'骸骨従者を召喚！' },
      { type:'attack', fromId:'ps1', toId:'e0', dmg:4, hp:46, maxHp:50, emphasis:1 },
      { type:'result', victory:true, emphasis:3 }
    ]);
  });
  await page.waitForTimeout(800);
  if (!await page.locator('#bu-ps1').count()) errors.push('召喚ユニットのカードが追加されない');
  if (!await page.locator('#band-player #bu-ps1').count()) errors.push('召喚ユニットが味方帯にいない');
  const registered = await page.evaluate(() => !!BattleScene.units.ps1);
  if (!registered) errors.push('召喚ユニットがレンダラへ登録されない');
  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 召喚ユニットの動的表示・攻撃再生');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
