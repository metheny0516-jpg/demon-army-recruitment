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
  await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
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
  // 第二幕決着後は同じ軍団で遊び続けるため、従来比較の節目へ一度到達することを確認する。
  for (runs = 1; runs <= 1; runs++) {
    await click('[data-action="new"]');
    let steps = 0;
    const trail = [];
    // 進軍が前哨戦＋本戦の2戦になり（2026-09-12）、幕も第2幕まで続く（2026-09-11）。
    // 手数は昔の3倍どころか、負けて再起を繰り返すと1500手を超える代もある。
    // 上限は「無限ループの保険」であって尺ではないので、大きめに取る（1手 0.2秒ほど）。
    while (steps++ < 3000) {
      if (await page.evaluate(() => !!Game.state.act2Cleared)) break;
      const a = await actions();
      trail.push(Object.keys(a).filter(k => k !== '__banner').join('|')); if (trail.length > 6) trail.shift();
      // 敗北しても再起可能なうちは確定していない。ここでは「ここで終わる」を選んで確定させる。
      if (a.concede) { await click('[data-action="concede"]'); continue; }
      // ハプニングは適当に選んで進める
      if (a.eventpick) { await click('[data-action="eventpick"]'); continue; }
      if (a.eventdone) { await click('[data-action="eventdone"]'); continue; }
      // 戦闘結果の「次へ」
      if (a.afterresult) { await click('[data-action="afterresult"]'); continue; }
      // gameover画面だけを敗北終端とみなす。第二幕決着は上の節目判定で止める。
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
        // 王国攻略が進む札を選ぶ。訓練（2026-09-13）と巡回（領地・段階A 2026-09-15）は
        // 王国を削らないので除く（選び続けるとランが終わらず、この通し試遊が止まる）。
        const invade = page.locator('.mission-card.mission-invade:not(.mission-train):not(.mission-patrol)'
          + ' [data-action="missionpick"]:not(.mission-alt)');
        const real = page.locator('.mission-card:not(.mission-train):not(.mission-patrol)'
          + ' [data-action="missionpick"]:not(.mission-alt)');
        const pick = await invade.count() ? invade.last()
          : (await real.count() ? real.last() : page.locator('[data-action="missionpick"]').last());
        await clickOne(pick);
        continue;
      }
      if (a.skip) { await click('[data-action="skip"]'); continue; }
      break;
    }
    const reached = await page.evaluate(() => !!Game.state.act2Cleared);
    const ended = await page.evaluate(() => Game.state.phase === 'gameover' || Game.state.phase === 'clear');
    if (!reached) {
      const summary = await page.evaluate(() => ({ phase: Game.state.phase, turn: Game.state.turn, conquest: Game.state.conquest, act: Game.state.act, battlesWon: Game.state.battlesWon, wipes: Game.state.wipeCount, roster: Game.state.roster.length, gold: Game.state.gold, food: Game.state.food }));
      if (ended) {
        console.log(`  ✓ ラン${runs} 正式終了: ${JSON.stringify(summary)}`);
        continue;
      }
      trail.forEach(t => console.log('    …' + t));
      throw new Error(`ラン${runs}: 第二幕決着に到達せず（${steps}手） ${JSON.stringify(summary)}`);
    }
    const persisted = await page.evaluate(() => ({ history: Storage.loadHistory().length, save: !!Storage.loadRun() }));
    if (persisted.history !== 0 || !persisted.save) throw new Error(`第二幕決着時の保存契約が違う: ${JSON.stringify(persisted)}`);
    console.log(`  ✓ ラン${runs} 第二幕決着: 軍団セーブを保持、魔界史は未記録`);
    await page.screenshot({ path: (process.env.SP || '.screenshots') + `/shot-act2-clear.png`, fullPage: true });
  }
  console.log(errors.length ? '\n✗ JSエラー:\n' + errors.join('\n') : '\n✓ JSエラーなし');
  await browser.close();
  process.exit(errors.length || process.exitCode ? 1 : 0);
})().catch(e => { console.error('✗ 失敗:', e.message); process.exit(1); });
