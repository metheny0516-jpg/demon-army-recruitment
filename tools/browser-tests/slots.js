// セーブスロット3つ：タイトルの3札／空きへ新規／**リロードして続きから同じ状態**／
// 別スロットへ新規しても前のスロットが残る／書き出し→削除→読み込みで復元。
//   node tools/browser-tests/slots.js
// 「リロードしたら消える」というオーナーの報告を、ここで毎回見張る。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 指定スロットの札の中の、最初の「新規」ボタンを押す
const newInSlot = (page, slot) =>
  page.locator(`.slot-card [data-action="new"][data-slot="${slot}"]`).first().click();

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  console.log('▼ タイトルの3札');
  ok(await page.locator('.slot-card').count() === 3, `札が3枚（${await page.locator('.slot-card').count()}）`);
  ok(await page.locator('.slot-card.empty').count() === 3, '最初は3枚とも空き');
  ok(await page.locator('[data-action="continue"]').count() === 0, '空きに「続きから」は出ない');

  console.log('\n▼ 空きスロット2へ新規 → 2戦進める');
  await newInSlot(page, 2);
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);
  const slotLabel = await page.locator('.hud-slot').innerText();
  ok(/スロット 2/.test(slotLabel), `HUD に保存先が出る（${slotLabel}）`);
  // 作戦を2つ消化する（戦闘の中身は他のテストが見る。ここは進んで保存されることだけ）
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i++) {
      Game.prepareMissions(true);
      Game.selectMission(0);
      Game.state.phase = 'formation';
      Game.deploy();
    }
    Game.save();
    App.render();
  });
  const turnBefore = await page.evaluate(() => Game.state.turn);
  const goldBefore = await page.evaluate(() => Game.state.gold);
  ok(turnBefore >= 2, `作戦が進んだ（turn=${turnBefore}）`);

  console.log('\n▼ リロード → 札に進み具合が出る → 続きからで同じ状態');
  await page.reload();
  await page.waitForTimeout(200);
  const card2 = await page.locator('.slot-card').nth(1).innerText();
  ok(/スロット 2/.test(card2), 'スロット2の札');
  ok(new RegExp(`作戦${turnBefore}`).test(card2), `札に「作戦${turnBefore}」（${card2.replace(/\n/g, ' / ')}）`);
  ok(await page.locator('.slot-card.empty').count() === 2, 'リロードしても残りは空きのまま');
  await page.locator('[data-action="continue"][data-slot="2"]').click();
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ turn: Game.state.turn, gold: Game.state.gold }));
  ok(after.turn === turnBefore, `リロードしても同じ作戦数（${turnBefore} → ${after.turn}）`);
  ok(after.gold === goldBefore, `所持金も同じ（${goldBefore} → ${after.gold}）`);

  console.log('\n▼ 別の空きスロットへ新規しても、前のスロットは残る');
  await page.click('[data-action="title"]').catch(() => {});
  await page.evaluate(() => App.showTitle());
  await page.waitForTimeout(100);
  await newInSlot(page, 3);
  await page.waitForTimeout(150);
  const metas = await page.evaluate(() => Storage.slotMetas().map(m => ({ slot: m.slot, empty: m.empty, turn: m.turn })));
  ok(metas[1].empty === false && metas[1].turn === turnBefore, `スロット2は無事（turn=${metas[1].turn}）`);
  ok(metas[2].empty === false, 'スロット3に新しいランが入った');
  ok(metas[0].empty === true, 'スロット1は空きのまま');

  console.log('\n▼ 書き出し → 削除 → 読み込みで復元');
  await page.evaluate(() => App.showTitle());
  await page.waitForTimeout(100);
  await page.click('[data-action="exportsave"][data-slot="2"]');
  await page.waitForTimeout(100);
  const text = await page.locator('.save-text').inputValue();
  ok(text.length > 100, `書き出しの文字列が出る（${text.length}文字）`);
  await page.evaluate(() => App.showTitle());
  await page.evaluate(() => { window.confirm = () => true; });
  await page.click('[data-action="deletesave"][data-slot="2"]');
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => Storage.slotMeta(2).empty), '削除でスロット2が空く');
  await page.click('[data-action="importsave"][data-slot="2"]');
  await page.waitForTimeout(100);
  await page.fill('#save-import', text);
  await page.click('[data-action="dosave"][data-slot="2"]');
  await page.waitForTimeout(150);
  const restored = await page.evaluate(() => Storage.slotMeta(2));
  ok(!restored.empty && restored.turn === turnBefore, `読み込みで復元（turn=${restored.turn}）`);
  await page.locator('[data-action="continue"][data-slot="2"]').click();
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => Game.state.gold) === goldBefore, '復元したランで続けられる');

  console.log('\n▼ 壊れた文字列は拒否');
  await page.evaluate(() => App.showTitle());
  await page.click('[data-action="importsave"][data-slot="1"]');
  await page.fill('#save-import', 'こわれてる');
  await page.click('[data-action="dosave"][data-slot="1"]');
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => Storage.slotMeta(1).empty), '拒否されてスロット1は空きのまま');

  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/slots-title.png', fullPage: true });
  console.log(errs.length ? '\n✗ ' + errs.join(', ') : '\n✓ JSエラーなし');
  await b.close();
  process.exit(errs.length || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
