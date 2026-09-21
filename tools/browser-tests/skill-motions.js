// 演出契約。固定イベントを実レンダラへ渡し、軌道・着弾・終了処理を見る。
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath:process.env.CHROME} : {});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    await page.evaluate(() => {
      BattleScene.stop();
      window.motionRecords=[];
      for (const name of ['animateActor','projectileMotion','setHp','motionFx']) {
        const original=BattleScene[name];
        BattleScene[name]=function(...args) { window.motionRecords.push({name,unit:args[0]?.name,kind:typeof args[0]==='string'?args[0]:null,frames:name==='animateActor'?args[1]:null,duration:name==='animateActor'?args[2]:null});return original.apply(this,args); };
      }
      window.motionStage = () => {
        BattleScene.stop();
        UI.set(BattleScene.shell({stage:1,army:'検証',region:'モーション'}));
        const mk=(id,side)=>({id,side,tplId:'ogre',name:id,icon:'👹',hp:100,maxHp:100});
        BattleScene.play([{type:'battle_start',player:[mk('p0','player')],enemy:[mk('e0','enemy'),mk('e1','enemy')]}]);
        BattleScene.stop(); BattleScene.finished=false; BattleScene.speed=1; BattleScene.eventScale=1;
        window.motionRecords=[];
      };
      window.motionAttack = (skillId, second=false) => {
        const ev={type:'attack',fromId:'p0',toId:second?'e1':'e0',skillId,dmg:20,hp:80,maxHp:100,emphasis:1};
        BattleScene.attackMotion(BattleScene.units.p0,BattleScene.units[ev.toId],ev,second);
      };
    });
    for (const width of [390,1280]) {
      await page.setViewportSize({width,height:844});
      for (const id of [null,'ogre_smash','mino_rush','knight_ittou','mage_fireball','succubus_charm']) {
        // 舞台を組んだだけの「素のはみ出し」を基準にする。390px では本線でも 19px 出ており
        // （scrollWidth 391 / clientWidth 372）、絶対0は本線でも満たせない条件だった。
        // ここで見たいのは「モーションが余分なはみ出しを残さないこと」。
        const rest = await page.evaluate(()=>{motionStage();const s=document.getElementById('scene');return s.scrollWidth-s.clientWidth;});
        await page.evaluate(id=>{motionAttack(id);if(id==='mage_fireball')motionAttack(id,true);},id);
        const start=await page.evaluate(()=>motionRecords);
        assert.equal(start.filter(r=>r.name==='setHp').length,0,'HP is deferred until contact');
        assert.equal(start.filter(r=>r.name==='animateActor'&&r.unit==='p0').length,1,'one actor motion');
        if (!id) assert.ok(start.find(r=>r.frames)?.frames.some(f=>f.transform==='translate(24px,0px)'));
        if(id==='mage_fireball')assert.equal(start.filter(r=>r.name==='projectileMotion').length,1);
        await page.waitForTimeout(1250);
        const end=await page.evaluate(()=>({records:motionRecords,pending:BattleScene.pendingHits.size,fx:document.querySelectorAll('.motion-fx,.battle-projectile').length,overflow:document.getElementById('scene').scrollWidth-document.getElementById('scene').clientWidth}));
        assert.equal(end.records.filter(r=>r.name==='setHp').length,id==='mage_fireball'?2:1);
        assert.equal(end.pending,0);assert.equal(end.fx,0);
        assert.equal(end.overflow,rest,`${width}px ${id}：モーション後に余分な横はみ出しを残さない（素 ${rest}px → ${end.overflow}px）`);
      }
    }
    // 発動直後のスキップでも未着弾HPを確定し、暗幕・transform・タイマーを残さない。
    await page.evaluate(()=>{motionStage();motionAttack('knight_ittou');BattleScene.skip();});
    assert.deepEqual(await page.evaluate(()=>({fx:document.querySelectorAll('.motion-fx,.battle-projectile').length,pending:BattleScene.pendingHits.size,motions:BattleScene.motions.size})),{fx:0,pending:0,motions:0});
    await page.evaluate(()=>{motionStage();BattleScene.render({type:'note',unitId:'p0',skillId:'ogre_smash',skillMiss:true,text:'外れた'});});
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(()=>motionRecords.filter(r=>r.name==='setHp'||r.kind==='vertical').length),0);
    for(const speed of [2,4]){
      const time=await page.evaluate(speed=>{motionStage();BattleScene.speed=speed;motionAttack('mino_rush');return motionRecords.find(r=>r.name==='animateActor').duration;},speed);
      assert.equal(time,880/speed);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    const reduced=await page.evaluate(()=>{motionStage();motionAttack('knight_ittou');return {hp:motionRecords.filter(r=>r.name==='setHp').length,dark:document.querySelectorAll('.motion-darkness').length};});
    assert.deepEqual(reduced,{hp:1,dark:0});
    await page.evaluate(()=>BattleScene.stop());
    assert.deepEqual(errors,[]);
    console.log('✓ skill motions: 390/1280, normal+5, AoE, skip, miss, speed, reduced');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
