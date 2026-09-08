// 戦闘中の答え合わせ。編成画面の見取り図で約束した因果が実際に起きた
// **最初の1回だけ**、同じ言葉で確かめさせる。
//
// 守りたい性質:
//   1. 起点と反応を名指しすること（「よく分からないけどつながった」を潰す）
//   2. 1戦闘に1回だけであること（毎回出すと読み飛ばされる）
//   3. 倍速でも読む尺が残ること（畳み掛けに巻き込まれない）
//   4. 金貨の連鎖が起きない戦闘では出ないこと
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + process.env.GAME + '/battle-preview.html');

  console.log('▼ 略奪の連鎖が起きる戦闘');
  await page.evaluate(() => { BattleScene.speed = 4; replayLootRelay(); });
  await page.waitForSelector('#chain-answer:not([hidden])', { timeout: 30000 });
  const text = await page.locator('#chain-answer').innerText();
  console.log('    ' + text.replace(/\n/g, ' '));
  ok(text.includes('答え合わせ'), '答え合わせだと分かる見出しが付く');
  ok(text.includes('追い剥ぎ'), '金貨を出した側の能力を名指しする');
  ok(text.includes('強欲'), '追加攻撃を生む反応（強欲）を優先して名指しする');

  console.log('▼ 尺と回数');
  const plan = await page.evaluate(() => {
    const at = BattleScene.timeline.findIndex(e => e.type === 'trait_trigger' && e.traitId === 'greedy' && e.parentEventId);
    return { duration: BattleScene.pacing.items[at].duration, scale: BattleScene.pacing.items[at].scale,
             floor: BattleScene.ANSWER_READ_MS };
  });
  ok(plan.duration >= plan.floor, `答え合わせの段は ${plan.duration}ms（下限 ${plan.floor}ms）確保される`);
  ok(plan.scale === 1, '総尺の圧縮に巻き込まれない');
  await page.evaluate(() => BattleScene.skip());
  await page.waitForTimeout(200);
  ok(await page.locator('#chain-answer').count() === 1, '答え合わせは1戦闘に1行だけ');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/chain-answer-390.png' });

  console.log('▼ 金貨の連鎖が起きない戦闘には出さない');
  await page.evaluate(() => {
    const player = [Battle.makeUnit({ name: 'オグ', tplId: 'ogre', race: 'オーガ', traits: [], atk: 40, spd: 9,
      hp: 80, def: 0, salary: 2, loyalty: 100, tags: [] }, 'player')];
    const enemy = [Battle.makeUnit({ name: '衛兵', icon: '🗡', hp: 10, atk: 1, def: 0, spd: 1,
      traits: [], tags: [], loyalty: 100 }, 'enemy')];
    UI.set(BattleScene.shell({ stage: 1, army: '王国軍', region: '対照' }));
    BattleScene.play(Battle.simulate(player, enemy, {}).timeline);
    BattleScene.skip();
  });
  await page.waitForTimeout(200);
  ok(await page.locator('#chain-answer:not([hidden])').count() === 0, '反応が起きていない戦闘では出ない');

  console.log(errs.length ? '✗ ' + errs.join('\n✗ ') : '✓ 答え合わせ：起点と反応の名指し・1戦闘1回・読む尺・出さない条件');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
