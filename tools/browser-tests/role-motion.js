const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME});
  try {
    const page = await browser.newPage({viewport:{width:390,height:900}});
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    const ids = (process.env.ROLES || 'archer,cleric,sage').split(',');
    for (const role of ids) for (const speed of [1,2,4]) {
      await page.evaluate(({role,speed}) => {
        replay(1,false,role); BattleScene.stop(); BattleScene.speed=speed; BattleScene.eventScale=.45;
        window.poseTrace=[];
        window.originalPose ||= BattleScene.setPose;
        BattleScene.setPose=function(u,p) { if(u?.el.id==='bu-p0') poseTrace.push(p); return originalPose.call(this,u,p); };
        BattleScene.render({type:'attack',fromId:'p0',toId:'e0',dmg:6,hp:18,maxHp:24,emphasis:1});
      },{role,speed});
      assert.equal(await page.evaluate(() => BattleScene.units.p0.sprite.dataset.pose),'attack-windup');
      await page.waitForFunction(() => poseTrace.includes('recover') && BattleScene.motions.size===0);
      assert.deepEqual(await page.evaluate(() => poseTrace),['attack-windup','strike','recover','idle']);
      assert.equal(await page.locator('#hp-e0').evaluate(e=>e.style.transform),'scaleX(0.75)');
      assert.equal(await page.locator('.battle-projectile').count(),0);
    }
    console.log('✓ role motion: actual windup/strike/recover/idle playback, compressed x1/x2/x4, HP and projectile cleanup');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
