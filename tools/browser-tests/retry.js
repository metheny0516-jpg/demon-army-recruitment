const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, passCommandPhase } = require('./helpers.js');
const ok = (c,m) => console.log((c?'  ✓ ':'  ✗ ')+m);
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errs=[]; page.on('pageerror', e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');

  // --- 1. 敗北 → 再起画面 ---
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  // 「1戦勝った直後の採用フェーズ」を再現する（ここが再起の戻り先になる）
  await page.evaluate(() => { Game.state.gold = 40; Game.genApplicants(); Game.nextRecruit(); App.render(); });
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  const goldBefore = await page.evaluate(() => Game.state.checkpoint.gold);
  await page.evaluate(() => {
    Game.state.stage = 8;
    Game.state.conquest = 7;
    Game.state.turn = 8;
    Game.state.roster.forEach(m => { m.hp=5; m.atk=1; m.def=0; });
    Game.state.phase='formation'; App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]'); await passCommandPhase(page);
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(150);
  console.log('▼ 敗北 → 再起の提示');
  ok(await page.locator('[data-action="retry"]').count()===1, '「再起する」ボタンが出る');
  ok(await page.locator('[data-action="concede"]').count()===1, '「ここで終わる」ボタンが出る');
  ok((await page.evaluate(()=>JSON.parse(localStorage.getItem('maou_history')||'[]').length))===0, '再起可能な間は魔界史に記録されない');
  const saveAlive = await page.evaluate(()=>!!localStorage.getItem('maou_save'));
  ok(saveAlive, '再起可能な状態はセーブに残る（途中で閉じても復帰できる）');
  await page.screenshot({ path: process.env.SP + '/retry-defeat.png', fullPage: true });

  // --- 2. リロードして復帰できるか ---
  await page.reload(); await page.waitForTimeout(150);
  await page.click('[data-action="continue"]');
  await page.waitForTimeout(150);
  console.log('▼ 途中で閉じて再開');
  ok(await page.locator('[data-action="retry"]').count()===1, 'リロード後も再起画面から再開できる');

  // --- 3. 再起を実行 ---
  await page.click('[data-action="retry"]');
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({phase:Game.state.phase, stage:Game.state.stage, gold:Game.state.gold, left:Game.state.retriesLeft, used:Game.state.retriesUsed}));
  console.log('▼ 再起の実行');
  ok(st.phase==='recruit', `採用フェーズへ巻き戻る (phase=${st.phase})`);
  ok(st.stage!==8, `巻き戻った戦に戻る (stage=${st.stage})`);
  ok(st.gold===Math.floor(goldBefore/2), `所持金が半減 ${goldBefore}→${st.gold}`);
  ok(st.left===0 && st.used===1, `再起回数が減る (残り${st.left}/使用${st.used})`);

  // --- 4. 2度目の敗北は確定する ---
  await page.evaluate(() => {
    Game.state.stage = 8;
    Game.state.conquest = 7;
    Game.state.turn = 8;
    if(!Game.state.roster.length) Game.state.roster.push({uid:1,name:'囮',race:'スライム',job:'',hp:1,atk:1,def:0,spd:1,salary:1,loyalty:50,traits:[],tags:[],quote:'',unpaid:false});
    Game.state.activeUids = Game.state.roster.slice(0, 5).map(m => m.uid);
    Game.state.roster.forEach(m => { m.hp=1; m.atk=1; m.def=0; });
    Game.state.phase='formation'; App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]'); await passCommandPhase(page);
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(150);
  console.log('▼ 再起を使い切った後の敗北');
  ok(await page.locator('[data-action="retry"]').count()===0, '再起ボタンは出ない');
  const hist = await page.evaluate(()=>JSON.parse(localStorage.getItem('maou_history')||'[]'));
  ok(hist.length===1, '魔界史に記録される');
  ok(hist[0] && hist[0].retriesUsed===1, `記録に再起回数が残る (retriesUsed=${hist[0]&&hist[0].retriesUsed})`);
  const saveGone = await page.evaluate(()=>localStorage.getItem('maou_save'));
  ok(saveGone===null, 'セーブが正しく消える');
  await page.reload(); await page.waitForTimeout(150);
  ok(await page.locator('[data-action="continue"]').count()===0, 'リロードしても「続きから」は出ない');
  await page.screenshot({ path: process.env.SP + '/retry-final.png', fullPage: true });

  console.log(errs.length ? '\n✗ JSエラー: '+errs.join(', ') : '\n✓ JSエラーなし');
  await b.close(); process.exit(errs.length || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗ 失敗:', e.message); process.exit(1); });
