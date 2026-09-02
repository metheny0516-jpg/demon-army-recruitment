const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
const ok=(c,m)=>{ if(!c) process.exitCode=1; console.log((c?'  ✓ ':'  ✗ ')+m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport:{width:390,height:844} });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');

  const names = () => page.evaluate(() => Game.state.applicants.map(m=>m.name+'/'+m.race).join(','));
  const gold  = () => page.evaluate(() => Game.state.gold);
  const cost  = () => page.evaluate(() => Game.rerollCost());

  console.log('▼ 1回目は無料');
  const before = await names(), g0 = await gold();
  ok(await cost() === 0, `初回の広告費は0G（所持金 ${g0}G）`);
  await page.click('[data-action="reroll"]');
  await page.waitForTimeout(120);
  ok(await names() !== before, '応募者が入れ替わった');
  ok(await gold() === g0, `所持金は減らない (${await gold()}G)`);

  console.log('▼ 2回目以降は倍々に高くなる');
  const c1 = await cost();
  ok(c1 === 2, `2回目は2G`);
  await page.click('[data-action="reroll"]'); await page.waitForTimeout(120);
  ok(await gold() === g0 - 2, `2G支払った (${await gold()}G)`);
  ok(await cost() === 4, `3回目は4G`);
  await page.click('[data-action="reroll"]'); await page.waitForTimeout(120);
  ok(await gold() === g0 - 6, `さらに4G支払った (${await gold()}G)`);

  console.log('▼ 所持金が足りなければ押せない');
  const disabled = await page.locator('[data-action="reroll"][disabled]').count();
  ok(disabled === 1, `残${await gold()}G < 費用${await cost()}G なのでボタンが無効`);

  console.log('▼ 採用枠は消費しない');
  const left = await page.evaluate(()=>Game.state.hiresLeft);
  ok(left === 2, `出し直しても採用枠は減らない (残り${left})`);

  console.log('▼ 採用すると次の面接で費用がリセットされる');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.waitForTimeout(120);
  ok(await cost() === 0, '新しい面接なので再び無料から');
  await page.screenshot({ path: process.env.SP+'/reroll.png', fullPage:true });
  ok(errs.length===0, 'JSエラーなし'+(errs.length?': '+errs.join(', '):''));
  await b.close();
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
