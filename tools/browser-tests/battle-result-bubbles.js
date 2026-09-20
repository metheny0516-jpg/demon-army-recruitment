const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch(process.env.CHROME ? {executablePath:process.env.CHROME} : {});
 try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
  await page.evaluate(() => {
   Game.newRun();
   UI.set(BattleScene.shell({stage:1,region:'試験',army:'試験'}));
   const u={id:'p0',tplId:'goblin',name:'ゴブ太',side:'player',hp:30,maxHp:30};
   document.getElementById('band-player').innerHTML=BattleScene.unitHtml(u);
   BattleScene.registerUnit(u); BattleScene.bindBattlefieldTaps();
   Game.state.lastGrowth=[{uid:1,name:'ゴブ太',key:'hp',delta:1}];
   Game.state.lastBattle={victory:true,reward:18,contribution:[{name:'ゴブ太',voice:'査定に響きますよね？',survived:true}],unlocked:[{name:'ゴブ太',skillName:'連撃'}]};
   window.beforeReport=JSON.stringify(Game.state);
   BattleScene.startReport();
  });
  assert.match(await page.locator('.bu-bubble').innerText(),/査定/);
  await page.waitForTimeout(3300);
  assert.match(await page.locator('.bu-bubble').innerText(),/査定/);
  assert.equal(await page.evaluate(()=>BattleScene.reportTimer),null);

  await page.locator('#scene').click({position:{x:5,y:5}});
  assert.match(await page.locator('.bu-bubble').innerText(),/HPが1アップ/);
  await page.evaluate(()=>BattleScene.advanceReport());
  assert.match(await page.locator('.bu-bubble').innerText(),/連撃/);
  await page.evaluate(()=>BattleScene.skip());
  assert.equal(await page.locator('.bu-bubble').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(Game.state)===window.beforeReport),true);
  await page.evaluate(()=>{BattleScene.startReport(); UI.set(UI.growthPanel());});
  assert.equal(await page.evaluate(()=>BattleScene.reportTimer===null),true);
  assert.match(await page.locator('.growth-panel').innerText(),/一回り/);
  assert.deepEqual(errors,[]);
  console.log('battle result bubbles browser: passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
