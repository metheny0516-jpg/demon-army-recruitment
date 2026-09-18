const {chromium}=require(process.env.PLAYWRIGHT || 'playwright');
const assert=require('assert');
(async()=>{
 const browser=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+process.env.GAME+'/index.html?nostory=1');
 await page.evaluate(()=>{
   Game.newRun();const st=Game.state;st.phase='mission';st.day=4;st.turn=10;st.roster=[Object.assign(Game.rollApplicant('slime'),{uid:101})];st.town.lv.hostel=1;st.traces=[];
   Game.trace('ate',101,null,{});Game.trace('sparked',101,null,{});Incidents.settle(Game);
   // 張り紙は「あとで、と言った噂」を読み返す場所になった（§3）。
   // 作戦会議の5枚目に出すには、先にモルモが見せている必要がある。
   Incidents.later(Game,'slime_pond');
   Game.prepareMissions();App.render();
 });
 const open=page.locator('[data-action="incidentopen"][data-id="slime_pond"]');assert.equal(await open.count(),1);
 await open.click();assert(await page.locator('[data-action="incidentpick"]').count());
 assert.equal(await page.evaluate(()=>!!Game.state.incidents.done.slime_pond),false);
 await page.locator('[data-action="incidentpick"]').first().click();
 assert((await page.locator('.incident-result').innerText()).includes('池の光'));
 const contrast=await page.locator('.incident-result').evaluate(el=>{
   const css=getComputedStyle(el),lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
   const a=lum(css.color),b=lum(css.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });assert(contrast>=4.5,'結果本文のコントラスト');
 assert.equal(await page.locator('.incident-result details').getAttribute('open'),null);
 await page.locator('.incident-result summary').click();assert((await page.locator('.incident-result details').innerText()).includes('スライム'));
 if(process.env.SP)await page.screenshot({path:process.env.SP+'/incident-result.png',fullPage:true});
 await page.click('[data-action="incidentback"]');assert.equal(await open.count(),0);
 await page.evaluate(()=>{const st=Game.state;st.incidents.done={};st.incidents.tail=null;st.incidents.active=0;Incidents.settle(Game);
   for(const p of [...st.incidents.pending]) Incidents.later(Game,p.id);
   UI.castle('town');});
 assert.equal(await page.locator('.town-notices [data-action="incidentopen"]').count(),1);
 await page.locator('.town-notices [data-action="incidentopen"]').click();await page.click('[data-action="incidentdecline"]');
 assert.equal(await page.locator('.town-panel').count(),1);
 assert.equal(await page.evaluate(()=>Object.keys(Game.state.incidents.offered).length),0);
 await page.evaluate(()=>{const st=Game.state;st.roster=[Object.assign(Game.rollApplicant('skeleton'),{uid:102})];st.traces=[];st.incidents={};Game.trace('hired',102,null,{});Game.trace('cooked',102,null,{});Incidents.settle(Game);
   for(const p of [...st.incidents.pending]) Incidents.later(Game,p.id);
   UI.set(UI.incidentCards('B'),'result');});
 await page.click('[data-action="incidentdecline"]');assert.equal(await page.evaluate(()=>Game.state.incidents.done.skeleton_choir.branch),'ignored');
 // ── 張り紙を待たない（docs/SPEC_FORCED_OMEN_2026-09-16.md §2-2・§2-3・§3）──
 // 決着の報告のあと、面接に入る前にモルモが札を持ってくる。
 const setupPending=()=>page.evaluate(()=>{
   Game.newRun();const st=Game.state;st.day=4;st.turn=10;
   st.roster=[Object.assign(Game.rollApplicant('slime'),{uid:201})];st.town.lv.hostel=1;st.traces=[];
   st.incidents=undefined;Incidents.init(st);
   Game.trace('ate',201,null,{});Game.trace('sparked',201,null,{});
   Incidents.settle(Game);
   return Game.state.incidents.pending.map(p=>p.id);
 });
 assert.deepEqual(await setupPending(),['slime_pond'],'決着で待ち行列に積まれる');
 // 面接に入る前に全画面で出る（3択）
 await page.evaluate(()=>{Game.state.phase='recruit';App.render();App.presentPending(()=>{window.__after=true;});});
 await page.locator('#mormo-scene .mormo-scene-next').click();      // 全文表示
 await page.waitForSelector('#mormo-scene .mormo-scene-choice');
 const labels=await page.locator('#mormo-scene .mormo-scene-choice').allInnerTexts();
 assert.equal(labels.length,3,'めくる／やめる／あとで の3択: '+labels.join('・'));
 assert(labels[2].includes('あとで'),'3つ目はあとで');
 assert.equal(await page.evaluate(()=>window.__after||false),false,'札を出し終える前に元の流れへ進まない');
 // あとで → 張り紙に残る
 await page.locator('#mormo-scene .mormo-scene-choice[data-action="incidentlater"]').click();
 assert.equal(await page.evaluate(()=>Game.state.incidents.pending.length),0,'あとでで待ち行列から外れる');
 assert.equal(await page.evaluate(()=>!!Game.state.incidents.offered.slime_pond),true);
 await page.evaluate(()=>UI.castle('town'));
 assert.equal(await page.locator('.town-notices [data-action="incidentopen"][data-id="slime_pond"]').count(),1,'あとで→張り紙に残る');
 // やめる → 張り紙に残らない
 await setupPending();
 await page.evaluate(()=>{Game.state.phase='recruit';App.render();App.presentPending(()=>{});});
 await page.locator('#mormo-scene .mormo-scene-next').click();
 await page.waitForSelector('#mormo-scene .mormo-scene-choice');
 await page.locator('#mormo-scene .mormo-scene-choice[data-action="incidentdecline"]').click();
 assert.equal(await page.evaluate(()=>!!Game.state.incidents.offered.slime_pond),false);
 await page.evaluate(()=>UI.castle('town'));
 assert.equal(await page.locator('.town-notices [data-action="incidentopen"][data-id="slime_pond"]').count(),0,'やめる→張り紙に残らない');
 // まだ見せていない札は張り紙に出さない（先にモルモから聞く）
 await setupPending();
 await page.evaluate(()=>UI.castle('town'));
 assert.equal(await page.locator('.town-notices [data-action="incidentopen"][data-id="slime_pond"]').count(),0,'未表示の札は張り紙に出さない');
 assert.deepEqual(errors,[]);console.log('✓ incidents: 作戦会議・見学者・結果・なぜ・城下町・自然発生・張り紙を待たない');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
