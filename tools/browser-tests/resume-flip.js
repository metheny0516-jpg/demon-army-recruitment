const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
  await page.click('[data-action="new"]');
  await page.waitForSelector('.applicant-deck');

  const visibleCards = () => page.locator('.applicant-member:visible');
  if (await visibleCards().count() !== 1) errors.push('390pxで履歴書が一枚だけにならない');
  const first = await visibleCards().locator('.card.resume').getAttribute('data-resume-index');

  await page.evaluate(() => {
    window.__resumeCues = [];
    const cue = Sound.cue.bind(Sound);
    Sound.cue = function (name, data) { window.__resumeCues.push(name); return cue(name, data); };
  });
  await page.click('[data-action="resumenext"]');
  await page.waitForTimeout(390);
  const next = await visibleCards().locator('.card.resume').getAttribute('data-resume-index');
  const initialCount = await page.evaluate(() => Game.state.applicants.length);
  if (Number(next) !== (Number(first) + 1) % initialCount) errors.push(`次の一枚で添字が進まない（${first}→${next}）`);
  if (!await page.evaluate(() => window.__resumeCues.includes('page'))) errors.push('めくりが Sound.cue("page") を通らない');

  await page.click('[data-action="resumeprev"]');
  await page.waitForTimeout(390);
  if (await visibleCards().locator('.card.resume').getAttribute('data-resume-index') !== first) {
    errors.push('前の一枚で逆向きに戻らない');
  }

  // 末尾の次は先頭へ戻る（仕様 U2 の既定）。
  await page.evaluate(() => { UI.resumeIndex = Game.state.applicants.length - 1; UI.recruit(); });
  await page.click('[data-action="resumenext"]');
  await page.waitForTimeout(390);
  if (await visibleCards().locator('.card.resume').getAttribute('data-resume-index') !== '0') errors.push('末尾から先頭へ循環しない');

  // めくりの途中でも採用処理を止めない。
  // 採用の成否は**名簿**で見る。Game.hire() は st.applicants から採用者を抜かず、
  // canHire() が真なら genApplicants() で候補を作り直すので、applicants.length は減らない
  // （src/core/run.js の hire()）。ここを applicants で見ると、めくりの有無に関わらず必ず落ちる。
  const beforeHire = await page.evaluate(() => Game.state.roster.length);
  await page.click('[data-action="resumenext"]');
  await page.locator('.applicant-member.is-current [data-action="hire"]:not([disabled])').click();
  await page.waitForTimeout(30);
  if (await page.evaluate(() => Game.state.roster.length) !== beforeHire + 1) errors.push('めくり中に採用できない');
  await page.waitForTimeout(360);
  if (await page.evaluate(() => UI.resumeFlipping || UI.resumeFlipTimer != null)) errors.push('採用後も旧めくりタイマーが残る');

  // ミュート中は page の外部音源を再生しない。
  const playedMuted = await page.evaluate(async () => {
    let played = 0;
    const original = Sound.playRecorded.bind(Sound);
    Sound.playRecorded = function (name, boost) { if (name === 'page') played++; return original(name, boost); };
    Sound.setMuted(true);
    UI.resumeFlipping = false;
    UI.turnResume(1);
    await new Promise(resolve => setTimeout(resolve, 370));
    return played;
  });
  if (playedMuted !== 0) errors.push('ミュート中にpage音が再生された');
  await page.evaluate(() => Sound.setMuted(false));

  // reduced-motion は待たずに切り替わり、CSSの動きも無い。
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => {
    const before = UI.resumeIndex;
    UI.turnResume(1);
    const card = document.querySelector('.applicant-member.is-current .card.resume');
    const css = card ? getComputedStyle(card) : null;
    return { before, after: UI.resumeIndex, animation: css?.animationDuration, transition: css?.transitionDuration };
  });
  if (reduced.before === reduced.after) errors.push('reduced-motionで即切り替わらない');
  if (reduced.animation !== '0s' || reduced.transition !== '0s') {
    errors.push(`reduced-motionで動きが残る（animation ${reduced.animation}, transition ${reduced.transition}）`);
  }

  // PCは比較用の2列表示を維持し、めくりボタンを出さない。
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1128, height: 1000 });
  await page.evaluate(() => { Game.newRun(); App.render(); });
  const desktop = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.applicant-member')];
    const tops = cards.map(c => Math.round(c.getBoundingClientRect().top));
    const nav = document.querySelector('.resume-nav');
    return { count: cards.length, rows: new Set(tops).size, nav: nav ? getComputedStyle(nav).display : 'missing' };
  });
  if (desktop.count > 1 && desktop.rows >= desktop.count) errors.push('1128pxで2列にならない');
  if (desktop.nav !== 'none') errors.push('1128pxでめくりボタンが表示される');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('✓ 履歴書一枚表示・前後循環・めくり中採用・低モーション・pageミュート・PC二列');
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
