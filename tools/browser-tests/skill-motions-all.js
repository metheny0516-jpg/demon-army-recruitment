// 31技を実戦計算で発生させ、その実イベントを描画。固定の架空attackで網羅扱いしない。
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+process.env.GAME+'/battle-preview.html');
  const ids=await page.evaluate(()=>Object.keys(SKILLS));assert.equal(ids.length,31);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:844});
   for(const id of ids){
    const result=await page.evaluate(id=>{
     let timeline,chosen;
     for(let seed=1;seed<=12;seed++){
      timeline=replayAllSkillMotion(id,seed);
      chosen=timeline.find(e=>e.motion?.skillId===id && e.motion.outcome!=='miss');
      if(chosen)break;
     }
     if(!chosen)return {found:false};
     BattleScene.stop();BattleScene.speed=1;BattleScene.eventScale=1;
     const oldHit=BattleScene.hit,oldSet=BattleScene.setHp;
     window.skillDrawStats={hits:0,hp:0};
     BattleScene.hit=function(...a){skillDrawStats.hits++;return oldHit.apply(this,a);};
     BattleScene.setHp=function(...a){skillDrawStats.hp++;return oldSet.apply(this,a);};
     // 元メソッドへ必ず戻す。毎技のラッパー累積を避ける。
     window.restoreSkillMethods=()=>{BattleScene.hit=oldHit;BattleScene.setHp=oldSet;};
     window.chosenSkillEvent=chosen;
     const units=Object.keys(BattleScene.units).length;
     const before=JSON.stringify(chosen);
     BattleScene.plan([chosen]);BattleScene.render(chosen);
     const ghosts=[...document.querySelectorAll('.motion-ghost')];
     return {found:true,unitCount:units,eventUnchanged:before===JSON.stringify(chosen),ghostSafe:ghosts.every(e=>e.getAttribute('aria-hidden')==='true'&&!e.id&&!e.querySelector('[id],[data-action]')),duration:BattleScene.durationOf(chosen),type:chosen.type};
    },id);
    assert.ok(result.found,id+': actual effect event');assert.ok(result.eventUnchanged);assert.ok(result.ghostSafe);
    await page.waitForTimeout(result.duration+450);
    const end=await page.evaluate(()=>{restoreSkillMethods();return {fx:document.querySelectorAll('.motion-fx,.battle-projectile').length,pending:BattleScene.pendingHits.size,units:Object.keys(BattleScene.units).length,hits:skillDrawStats.hits};});
    assert.equal(end.fx,0,id+': effects cleaned');assert.equal(end.pending,0);assert.equal(end.units,result.unitCount);
    if(!['attack','splash'].includes(result.type))assert.equal(end.hits,0,id+': support is not damage');
    await page.evaluate(()=>{BattleScene.stop();BattleScene.render(chosenSkillEvent);BattleScene.stop();});
    assert.deepEqual(await page.evaluate(()=>({fx:document.querySelectorAll('.motion-fx,.battle-projectile').length,pending:BattleScene.pendingHits.size,motions:BattleScene.motions.size,groups:BattleScene.motionGroupsSeen.size})),{fx:0,pending:0,motions:0,groups:0});
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const id of ids){
   await page.evaluate(id=>{const events=replayAllSkillMotion(id,1);BattleScene.stop();const ev=events.find(e=>e.motion?.skillId===id);if(ev)BattleScene.render(ev);},id);
   assert.equal(await page.locator('.motion-ghost,.motion-darkness,.battle-projectile').count(),0,id+': reduced motion');
  }
  assert.deepEqual(errors,[]);console.log('✓ 31技の実効果描画・支援非攻撃・装飾安全性・後始末・低モーション');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
