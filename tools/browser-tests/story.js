// 物語（第一幕）：即位 → 面接 → 救援要請 → 救援一択 → 道中 → 戦闘 → 結果に場面 → 地図。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
const ok=(c,m)=>{ if(!c) process.exitCode=1; console.log((c?'  ✓ ':'  ✗ ')+m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport:{width:1128,height:900} });
  await autoDismissMormo(page);
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.waitForTimeout(150);
  ok(await page.locator('[data-action="storydone"]').count() === 1, '新規開始は即位の場面');
  const throne = await page.locator('.story-panel').innerText();
  ok(/2名/.test(throne) && /戦える者は、いません/.test(throne), 'モルモが「所属者は2名、戦える者はいません」と報告する');
  await page.screenshot({ path: process.env.SP + '/story-throne.png' });
  await page.click('[data-action="storydone"]');
  await page.waitForTimeout(120);
  ok(await page.locator('[data-action="hire"]').count() > 0, '即位のあとは面接');
  const staff = await page.evaluate(() => Game.state.roster.map(m => m.name));
  ok(staff.length === 1 && staff[0] === 'ガンツ', '城の住人は門番ガンツだけ（実働部隊は空）');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.waitForTimeout(100);
  await page.click('[data-action="skip"]');
  await page.waitForTimeout(150);
  ok(await page.locator('[data-action="storydone"]').count() === 1, '面接を終えると救援要請の場面');
  const call = await page.locator('.story-panel').innerText();
  ok(/伍長ブレンダン/.test(call), '王国側の人物（伍長ブレンダン）が台詞を持つ');
  ok(await page.locator('.kingdom-face').count() > 0, '王国側の人物の顔枠が出る（絵が無ければ絵文字）');
  await page.screenshot({ path: process.env.SP + '/story-rescue-call.png' });
  await page.click('[data-action="storydone"]');
  await page.waitForTimeout(120);
  ok(await page.locator('.mission-card').count() === 1, '第1章の作戦会議は救援一択');
  ok(/ゴブリン村を救援/.test(await page.locator('.mission-card').innerText()), '札は「ゴブリン村を救援する」');
  await page.click('[data-action="missionpick"]');
  await page.waitForTimeout(120);
  // 道中の枝は確率。臆病者（coward）を必ず連れて行き、道中を必ず引く。
  await page.evaluate(() => { Story.ROAD_CHANCE = 1; Game.state.roster.forEach(m => { m.hp = 80; m.atk = 30; if (!m.traits.includes('coward')) m.traits.push('coward'); }); });
  await page.click('[data-action="deploy"]');
  await page.waitForTimeout(200);
  const pre = await page.locator('[data-action="storybattle"]').count();
  ok(pre === 1, '出撃すると道中の場面が先に出る（臆病者を連れて行ったので逃げ足の場面）');
  if (pre) {
    await page.screenshot({ path: process.env.SP + '/story-road.png' });
    await page.click('[data-action="storybattle"]');
  }
  await page.waitForTimeout(200);
  // コマンドバトルを最後まで飛ばす（smoke と同じ手順）
  await page.waitForSelector('#log');
  await page.click('[data-action="skiplog"]');
  await page.waitForSelector('[data-action="afterbattle"]:visible', { timeout: 20000 });
  if (await page.locator('[data-action="afterbattle"]').count()) await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(200);
  ok(await page.locator('.story-result .story-panel').count() >= 1, '結果画面に道中・戦後の場面が載る');
  const resolved = await page.evaluate(() => Game.state.story.flags.rescueResolved === true);
  ok(resolved, '救援は決着している');
  await page.screenshot({ path: process.env.SP + '/story-result.png' });
  await page.click('[data-action="afterresult"]');
  await page.waitForTimeout(150);
  ok(await page.locator('.story-map svg').count() === 1, '結果の次に地図が開く');
  await page.screenshot({ path: process.env.SP + '/story-map.png' });
  const storyTraces = await page.evaluate(() => Game.state.traces.filter(t => t.kind === 'story').length);
  ok(storyTraces >= 1, '痕跡 story が残っている');
  ok(errs.length === 0, 'ページエラーなし' + (errs.length ? ': ' + errs[0] : ''));
  await b.close();
})();
