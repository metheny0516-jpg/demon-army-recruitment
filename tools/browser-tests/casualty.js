// 戦死したモンスターが本当に軍から去るか、蘇生した者が残るかを検証する
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase, passCommandPhase } = require('./helpers.js');
const ok=(c,m)=>{ if(!c) process.exitCode=1; console.log((c?'  ✓ ':'  ✗ ')+m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport:{width:390,height:844} });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();

  await enterMissionPhase(page);   // 開幕3日を終えてから通常ループの状態を組む

  // 前衛が確実に死ぬ状況を作る（脆い前衛＋頑丈な後衛）
  const before = await page.evaluate(() => {
    Game.state.roster = [
      { uid:901, tplId:'goblin', name:'捨て駒A', race:'ゴブリン', job:'', hp:1, atk:1, def:0, spd:1,
        salary:2, loyalty:70, traits:[], tags:[], quote:'', unpaid:false },
      // 攻撃力を抑えてあるのは意図的。強すぎると味方が敵を1ラウンドで倒しきってしまい、
      // 敵が一度も行動せず「捨て駒Aが死なない」戦闘になる（実際にフレークとして出た）。
      // 見たいのは「倒れた者が退場するか」なので、敵が必ず行動する状況を作る。
      { uid:902, tplId:'ogre', name:'生存者', race:'オーガ', job:'', hp:400, atk:12, def:20, spd:3,
        salary:2, loyalty:70, traits:[], tags:[], quote:'', unpaid:false }
    ];
    Game.state.activeUids = Game.state.roster.map(m => m.uid);
    Game.state.stage = 1; Game.state.gold = 50; Game.state.phase='formation'; App.render();
    return Game.state.roster.map(m=>m.name);
  });
  console.log('▼ 戦死者の永久退場');
  console.log('    出撃前:', before.join('、'));
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await passCommandPhase(page);
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(200);

  const st = await page.evaluate(() => ({
    roster: Game.state.roster.map(m=>m.name),
    fallen: (Game.state.lastFallen||[]).map(f=>f.name),
    vacancies: Game.state.pendingVacancies,
    fallenTotal: Game.state.fallenTotal,
    contribution: (Game.state.lastBattle.contribution||[]).map(c=>({n:c.name,survived:c.survived,died:c.died}))
  }));
  console.log('    戦果:', JSON.stringify(st.contribution));
  ok(!st.roster.includes('捨て駒A'), '戦死した「捨て駒A」が軍から消えた');
  ok(st.roster.includes('生存者'), '生存した「生存者」は残っている');
  ok(st.fallen.includes('捨て駒A'), `戦没者に記録された (${st.fallen.join('、')})`);
  ok(st.vacancies === 1, `欠員が1名として記録された (${st.vacancies})`);
  ok(st.fallenTotal === 1, `ラン累計の戦没者数 ${st.fallenTotal}`);
  ok(await page.locator('.fallen-panel').count()===1, '結果画面に戦没者パネルが出る');
  await page.screenshot({ path:(process.env.SP||'.')+'/casualty-result.png', fullPage:true });

  console.log('▼ 欠員募集');
  await page.click('[data-action="afterresult"]'); await page.waitForTimeout(150);
  if (await page.locator('[data-action="eventpick"]').count()) { await page.locator('[data-action="eventpick"]').first().click(); await page.waitForTimeout(120); }
  if (await page.locator('[data-action="eventdone"]').count()) { await page.click('[data-action="eventdone"]'); await page.waitForTimeout(120); }
  const hires = await page.evaluate(()=>Game.state.hiresLeft);
  ok(hires === 2, `通常1名＋欠員1名で ${hires} 名まで採用できる`);
  const txt = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.panel > .muted')).map(e => e.textContent).join(' '));
  ok(txt.includes('欠員'), `画面に欠員募集と明示されている: "${txt.trim().slice(0,40)}"`);

  console.log('▼ 蘇生した者は退場しない');
  const revived = await page.evaluate(() => {
    // 執念（tenacity）持ちのゾンビが倒れて蘇生するまで試行する
    for (let i=0;i<400;i++){
      const p=[Battle.makeUnit({uid:1,tplId:'zombie',name:'不死身',race:'ゾンビ',hp:5,atk:2,def:0,spd:1,
        salary:1,loyalty:50,traits:['tenacity'],tags:['undead'],unpaid:false},'player'),
        Battle.makeUnit({uid:2,tplId:'ogre',name:'守り手',race:'オーガ',hp:300,atk:7,def:5,spd:2,
        salary:1,loyalty:50,traits:[],tags:[],unpaid:false},'player')];
      const e=ENEMY_STAGES[0].units.map(u=>Battle.makeUnit(u,'enemy'));
      const r=Battle.simulate(p,e);
      const z=r.contribution.find(c=>c.name==='不死身');
      if (z && z.died && z.survived) return { died:z.died, survived:z.survived };
    }
    return null;
  });
  ok(!!revived, revived ? `倒れたが生還した状態を再現 (died=${revived.died}, survived=${revived.survived})` : '再現できず');
  ok(errs.length===0, 'JSエラーなし'+(errs.length?': '+errs.join(', '):''));
  await b.close();
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
