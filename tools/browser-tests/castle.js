// 城のメニューと、採用・軍団で共有する人物詳細の受け入れテスト。
// Aコミットでは人物詳細だけ、UI.castle が入った後は城の3札も検査する。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');

(async () => {
  const stage = String(process.env.CASTLE_STAGE || 'A').toUpperCase();
  const includesStage = wanted => ['A', 'B', 'C'].indexOf(stage) >= ['A', 'B', 'C'].indexOf(wanted);
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const check = (condition, message) => { if (!condition) errors.push(message); };
  await page.goto('file://' + process.env.GAME + '/index.html');
  // 最初の一人を採用した直後の面接を作り、既存メンバーと次の応募者を必ず共存させる。
  await page.evaluate(() => {
    Game.newRun();
    Game.hire(0);
    Game.state.phase = 'recruit';
    UI.recruit();
  });

  // A: 応募者と現軍団が同時に見え、どちらも同じ人物詳細へ入れる。
  const recruitSnapshot = await page.evaluate(() => ({
    phase: Game.state.phase,
    rosterName: Game.state.roster[0] && Game.state.roster[0].name,
    applicantName: Game.state.applicants[0] && Game.state.applicants[0].name
  }));
  const recruitText = await page.locator('body').innerText();
  check(recruitText.includes(recruitSnapshot.rosterName), '面接に既存メンバーが見えない');
  check(recruitText.includes(recruitSnapshot.applicantName), '面接に応募者が見えない');
  check(await page.locator('[data-action="member"][data-uid]').count() > 0,
    '既存メンバーを開く data-action="member" が無い');
  check(await page.locator('[data-action="member"][data-index]').count() > 0,
    '応募者を開く data-action="member" が無い');

  const screenshot = async (name, width) => {
    if (!process.env.SP) return;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.screenshot({ path: `${process.env.SP}/castle-${name}-${width}.png`, fullPage: true });
  };
  await screenshot('recruit', 1128);
  await screenshot('recruit', 390);

  if (await page.locator('[data-action="member"][data-uid]').count()) {
    await page.locator('[data-action="member"][data-uid]').first().evaluate(el => el.click());
    check(await page.locator('.member-detail').count() === 1, '既存メンバーの共通詳細が開かない');
    // 詳細の上端が画面内にあること（fixed の幕を place-items:center にすると上端が画面の外へ逃げ、真っ黒に見えた）
    await page.waitForTimeout(400);
    const detailTop = await page.evaluate(() => Math.round(document.querySelector('.member-detail').getBoundingClientRect().top));
    check(detailTop >= 0 && detailTop < 200, `詳細の上端が画面内にある（top=${detailTop}）`);
    const detailText = await page.locator('.member-detail').innerText();
    check(detailText.includes(recruitSnapshot.rosterName) && /HP|攻|防|速/.test(detailText),
      '人物詳細に名前と能力値が揃わない');
    check(await page.evaluate(() => Game.state.phase) === 'recruit', '人物詳細で recruit phase が変わる');
    if (await page.locator('[data-action="closemember"]').count()) await page.locator('[data-action="closemember"]').click();
    else errors.push('既存メンバー詳細に閉じる操作が無い');
    check(await page.evaluate(() => Game.state.phase) === 'recruit', '人物詳細を閉じると phase が変わる');
  }
  if (await page.locator('[data-action="member"][data-index]').count()) {
    // 応募者札の中には採用ボタンもあるため、札自体を発火して詳細導線を検査する。
    await page.locator('[data-action="member"][data-index]').first().evaluate(el => el.click());
    check(await page.locator('.member-detail [data-action="hire"]').count() === 1,
      '応募者詳細に「採用する」が無い');
    if (await page.locator('[data-action="closemember"]').count()) await page.locator('[data-action="closemember"]').click();
    else errors.push('応募者詳細に閉じる操作が無い');
  }

  // B/C は各コミットで CASTLE_STAGE=B/C を渡して段階的に必須化する。
  // UI.castle の存在だけで先のコミットの検査を始めないため、Aを単独で出荷できる。
  if (includesStage('B')) {
    check(await page.evaluate(() => typeof UI.castle === 'function'), 'UI.castle が実装されていない');
    await page.evaluate(() => {
      while (Game.state.roster.length < 3 && Game.state.applicants.length) Game.hire(0);
    });
    // B: 作戦会議から城へ。3札を切り替えても phase を保ち、戻れる。
    await enterMissionPhase(page);
    const missionPhase = await page.evaluate(() => Game.state.phase);
    check(await page.locator('[data-action="castle"]').count() > 0, '作戦会議に「城」入口が無い');
    if (await page.locator('[data-action="castle"]').count()) await page.locator('[data-action="castle"]').first().click();
    const castleScene = page.locator('[data-scene="castle"]');
    check(await castleScene.count() === 1, '城のメニューが開かない');
    check(await page.locator('[data-action="castletab"]').count() === 3, '城の札が3つではない');
    check(await page.evaluate(() => Game.state.phase) === missionPhase, '城を開くと mission phase が変わる');

    // 軍団札そのものから出撃/留守番・並び替え・解雇を行う。
    const armyTab = page.locator('[data-action="castletab"][data-tab="army"]');
    if (await armyTab.count()) await armyTab.click();
    const beforeActive = await page.evaluate(() => [...Game.state.activeUids]);
    const toggle = page.locator('[data-scene="castle"] [data-action="toggledeploy"]').first();
    check(await toggle.count() > 0, '軍団札に出撃/留守番切替が無い');
    if (await toggle.count()) await toggle.click();
    const afterActive = await page.evaluate(() => [...Game.state.activeUids]);
    check(JSON.stringify(beforeActive) !== JSON.stringify(afterActive), '軍団札の切替で activeUids が変わらない');

    const reorder = page.locator('[data-scene="castle"] [data-action="down"]:not([disabled]), [data-scene="castle"] [data-action="up"]:not([disabled])').first();
    check(await reorder.count() > 0, '軍団札に有効な並び替え操作が無い');
    if (await reorder.count()) {
      const beforeOrder = await page.evaluate(() => [...Game.state.activeUids]);
      await reorder.click();
      const afterOrder = await page.evaluate(() => [...Game.state.activeUids]);
      check(JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder), '軍団札の並び替えで activeUids が変わらない');
    }

    const rosterBeforeFire = await page.evaluate(() => Game.state.roster.length);
    const fire = page.locator('[data-scene="castle"] [data-action="fire"]').last();
    check(await fire.count() > 0, '軍団札に解雇操作が無い');
    if (await fire.count() && rosterBeforeFire > 1) {
      page.once('dialog', dialog => dialog.accept());
      await fire.click();
      check(await page.evaluate(() => Game.state.roster.length) === rosterBeforeFire - 1,
        '軍団札の解雇確認後に roster が変わらない');
    }

    for (const tab of ['army', 'records', 'advisor']) {
      const button = page.locator(`[data-action="castletab"][data-tab="${tab}"]`);
      check(await button.count() === 1, `城の ${tab} 札が無い`);
      if (await button.count()) await button.click();
      check(await page.evaluate(() => Game.state.phase) === missionPhase, `${tab} 札で phase が変わる`);
      const text = await castleScene.count() ? await castleScene.innerText() : '';
      if (tab === 'records') check(/日誌/.test(text) && /蔵/.test(text) && /去った者/.test(text) && /進行度/.test(text),
        '記録札に日誌・蔵・去った者・進行度が揃わない');
      if (tab === 'advisor') check(/シナジー/.test(text) && /施設/.test(text),
        '参謀札にシナジーと施設が揃わない');
    }
    await page.locator('[data-action="backcastle"]').click();
    check(await page.evaluate(() => Game.state.phase) === 'mission', '城から作戦会議へ戻れない');
    check(await page.locator('.mission-grid').count() === 1, '戻った作戦会議が描画されない');

    // 編成は軍団札を共有。既存 action/data 属性のまま操作でき、出撃できる。
    await page.locator('[data-action="missionpick"]').first().click();
    const formationHeight = await page.evaluate(() => document.body.scrollHeight);
    check(await page.evaluate(() => Game.state.phase) === 'formation', '編成の前提を作れない');
    check(await page.locator('[data-action="deploy"]').count() === 1, '編成に「出撃する」が無い');
    // 編成から城へ入り戻っても formation のまま。
    if (await page.locator('[data-action="castle"]').count()) await page.locator('[data-action="castle"]').first().click();
    check(await page.evaluate(() => Game.state.phase) === 'formation', '編成から城を開くと phase が変わる');
    if (await page.locator('[data-action="backcastle"]').count()) await page.locator('[data-action="backcastle"]').click();
    check(await page.evaluate(() => Game.state.phase) === 'formation', '城から編成へ戻れない');
    await screenshot('formation', 1128);
    await screenshot('formation', 390);

    if (await page.locator('[data-action="castle"]').count()) {
      await page.locator('[data-action="castle"]').first().click();
      await screenshot('menu', 1128);
      await screenshot('menu', 390);
      if (await page.locator('[data-action="backcastle"]').count()) await page.locator('[data-action="backcastle"]').click();
    }

    // 結果画面からの入口は実戦を1回終えて確認する。
    await page.evaluate(() => Game.state.roster.forEach(m => { m.hp = 9999; m.atk = 999; m.def = 99; m.spd = 99; }));
    await page.locator('[data-action="deploy"]').click();
    await page.locator('[data-action="skiplog"]').click();
    await page.locator('[data-action="afterbattle"]').click();
    check(await page.evaluate(() => Game.state.phase) === 'result', '結果画面の前提を作れない');
    if (await page.locator('[data-action="castle"]').count()) await page.locator('[data-action="castle"]').first().click();
    else errors.push('結果画面に「城」入口が無い');
    check(await page.evaluate(() => Game.state.phase) === 'result', '結果から城を開くと phase が変わる');
    if (await page.locator('[data-action="backcastle"]').count()) await page.locator('[data-action="backcastle"]').click();
    check(await page.evaluate(() => Game.state.phase) === 'result', '城から結果へ戻れない');

    // C: モバイル用DOMが入ったら、固定主ボタンと2行HUDを検査する。
    if (includesStage('C')) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { Game.state.phase = 'mission'; Game.prepareMissions(true); App.render(); });
      await page.locator('[data-action="missionpick"]').first().click();
      const mobile = await page.evaluate(() => {
        const primary = document.querySelector('[data-action="deploy"]');
        const dock = primary && primary.closest('.formation-actions');
        const rect = primary && primary.getBoundingClientRect();
        const visible = el => {
          const r = el.getBoundingClientRect(), style = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const rows = [...document.querySelectorAll('.hud-row')].filter(visible);
        return {
          hudRows: rows.length,
          hudText: rows.map(row => row.innerText.replace(/\s+/g, ' ').trim()),
          region: Game.stageData().region,
          primaryPosition: primary && getComputedStyle(primary).position,
          dockPosition: dock && getComputedStyle(dock).position,
          rect: rect && { top: rect.top, bottom: rect.bottom },
          viewportHeight: innerHeight,
          inViewport: !!rect && rect.bottom <= innerHeight + 1 && rect.top >= -1,
          height: document.body.scrollHeight
        };
      });
      check(mobile.hudRows === 2, `HUDの見える行が2行ではない: ${mobile.hudRows}`);
      const row1 = mobile.hudText[0] || '', row2 = mobile.hudText[1] || '';
      check(['所持金', '食料', '建材'].every(label => row1.includes(label)),
        `HUD 1行目に所持金・食料・建材が揃わない: ${row1}`);
      check(['魔王軍', '王国攻略', '警戒', '🏰 城'].every(label => row2.includes(label)),
        `HUD 2行目に魔王軍Lv・王国攻略・警戒・城が揃わない: ${row2}`);
      const visibleHud = mobile.hudText.join(' ');
      check(!['作戦 ', '給与・手当', '出撃 '].some(label => visibleHud.includes(label))
        && !/軍団\s+\d+\//.test(visibleHud) && !visibleHud.includes(mobile.region),
        `スマホHUDに記録へ移す項目が残る: ${visibleHud}`);
      check(mobile.primaryPosition === 'fixed' || mobile.dockPosition === 'fixed',
        `幅390pxで主ボタンが固定されない: button=${mobile.primaryPosition}, dock=${mobile.dockPosition}`);
      check(mobile.inViewport, `幅390pxで「出撃する」が画面内に無い: ${JSON.stringify(mobile.rect)} / ${mobile.viewportHeight}px`);
      const bBaseline = Number(process.env.CASTLE_B_FORMATION_HEIGHT) || formationHeight;
      console.log(`  編成scrollHeight: B基準 ${bBaseline}px / Cスマホ ${mobile.height}px`);
    }
  }

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : `✓ 城UI ${stage}段階`);
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
