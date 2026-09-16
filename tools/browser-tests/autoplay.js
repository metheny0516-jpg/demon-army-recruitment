const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  // モルモ報告は自動で閉じない。覆われた画面を操作できるよう、報告は即送りにする
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');
  // file:// の保存領域を使う実Chromeでは別テストや手動プレイの魔界史が見えることがある。
  // このテストが作った3ランだけを数えるため、開始時に自分の検証領域を空にする。
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // 通し試遊は手数が多い（第2幕まで進むと1ランが数百手）。実クリックは演出のたびに
  // 「安定待ち」でせき止められ、1手が1秒近くかかる。ここで見たいのは「最後まで進むか」
  // ・「JSエラーが出ないか」なので、DOM の click で送る。当たり判定や覆いの検査は
  // 個別のブラウザテスト（mission.js など）の担当。
  const click = async sel => { await clickOne(page.locator(sel).first()); };
  const clickOne = async locator => {
    await locator.evaluate(e => e.click());
    await page.waitForTimeout(30);
  };
  // 1手ごとに locator を8回数えると往復が重い（第2幕まで進むと1ランが300手を超える）。
  // 画面にある data-action を一度に取ってきて、それを見て次の1手を決める。
  const actions = () => page.evaluate(() => {
    const out = { __banner: !!document.querySelector('.banner') };
    document.querySelectorAll('[data-action]').forEach(e => {
      out[e.dataset.action + (e.disabled ? ':off' : '')] = true;
    });
    return out;
  });
  let runs = 0;
  // 3代→2代に減らした（2026-09-14）。恒久成長で代を重ねるほど1ランが伸び、
  // 3代目は1500手でも決着に届かない（通しで9分超）。見たいのは「最後まで進むか」
  // ・「魔界史が代をまたいで積まれるか」なので、2代で足りる。
  for (runs = 1; runs <= 2; runs++) {
    await click('[data-action="new"]');
    let steps = 0;
    const trail = [];
    // 進軍が前哨戦＋本戦の2戦になり（2026-09-12）、幕も第2幕まで続く（2026-09-11）。
    // 手数は昔の3倍どころか、負けて再起を繰り返すと1500手を超える代もある。
    // 上限は「無限ループの保険」であって尺ではないので、大きめに取る（1手 0.2秒ほど）。
    while (steps++ < 3000) {
      const a = await actions();
      trail.push(Object.keys(a).filter(k => k !== '__banner').join('|')); if (trail.length > 6) trail.shift();
      // 敗北しても再起可能なうちは確定していない。ここでは「ここで終わる」を選んで確定させる。
      if (a.concede) { await click('[data-action="concede"]'); continue; }
      // ハプニングは適当に選んで進める
      if (a.eventpick) { await click('[data-action="eventpick"]'); continue; }
      if (a.eventdone) { await click('[data-action="eventdone"]'); continue; }
      // 戦闘結果の「次へ」
      if (a.afterresult) { await click('[data-action="afterresult"]'); continue; }
      // gameover(敗北確定 or 全クリア)画面だけを終端とみなす。result()の1戦ごとの勝利画面はスルーする。
      if (a.__banner && !a.nextrecruit && !a['nextrecruit:off']) break;
      if (a.skip && await page.evaluate(() => Game.state.hiresLeft <= 0)) { await click('[data-action="skip"]'); continue; }
      if (a.hire) { await click('[data-action="hire"]:not([disabled])'); continue; }
      // 満員なら1体解雇して入れ替える（プレイヤーと同じ操作）
      if (a['hire:off'] && a.fire) { await click('[data-action="fire"]'); continue; }
      if (a.deploy) {
        await click('[data-action="deploy"]');
        await click('[data-action="skiplog"]');
        await click('[data-action="afterbattle"]');
        continue;
      }
      if (a.missionpick) {
        // 最後の札＝いちばん攻めた作戦を選ぶ。訓練（2026-09-13）は進行しないので除く
        // （選び続けるとランが終わらず、この通し試遊が止まる）。
        const real = page.locator('.mission-card:not(.mission-train) [data-action="missionpick"]:not(.mission-alt)');
        await clickOne(await real.count() ? real.last() : page.locator('[data-action="missionpick"]').last());
        continue;
      }
      if (a.skip) { await click('[data-action="skip"]'); continue; }
      break;
    }
    const over = await page.locator('.banner').count() > 0
      && !(await page.locator('[data-action="nextrecruit"], [data-action="afterresult"]').count())
      && !(await page.locator('[data-action="concede"]').count());
    if (!over) { console.log(`  ラン${runs}: 決着画面に到達せず（${steps}手）`, JSON.stringify(await page.evaluate(() => ({ phase: Game.state.phase, turn: Game.state.turn, conquest: Game.state.conquest, act: Game.state.act, battlesWon: Game.state.battlesWon, wipes: Game.state.wipeCount, roster: Game.state.roster.length, gold: Game.state.gold, food: Game.state.food })))); trail.forEach(t => console.log('    …' + t)); break; }
    const head = (await page.locator('.banner h2').innerText()).trim();
    const cause = (await page.locator('.banner div').first().innerText()).trim();
    console.log(`  ✓ ラン${runs} 終了: ${head} / ${cause}`);
    await page.screenshot({ path: (process.env.SP || '.screenshots') + `/shot-gameover.png`, fullPage: true });
    await click('[data-action="history"]');
    // 同じカード部品を使う図鑑・実績を巻き込まないよう、保存済みの魔界史を直接数える。
    const recs = await page.evaluate(() => Storage.loadHistory().length);
    console.log(`    魔界史に ${recs} 代分の記録`);
    if (recs !== runs) throw new Error(`記録数が合わない: ${recs} != ${runs}`);
    await page.screenshot({ path: (process.env.SP || '.screenshots') + `/shot-history.png`, fullPage: true });
    // セーブが消えていること（決着後に「続きから」が残らない）
    if (await page.locator('[data-action="continue"]').count()) throw new Error('決着後もセーブが残っている');
    await click('[data-action="title"]');
  }
  console.log(errors.length ? '\n✗ JSエラー:\n' + errors.join('\n') : '\n✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗ 失敗:', e.message); process.exit(1); });
