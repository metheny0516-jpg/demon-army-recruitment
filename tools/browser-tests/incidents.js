// 噂の札（docs/SPEC_INCIDENTS_IMPL_2026-09-14.md 4節）：
// 作戦会議の5枚目に札が出る／城下町の張り紙にも同じ札が出る／めくると見学者を選んで結果が出る／
// 「なぜ」欄が痕跡を名指しする／やめると消える。390px で横に溢れない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// slime_pond が出る状態を作る：スライム2体・宿舎Lv1・異なる2種の痕跡
const SEED = () => {
  const st = Game.state;
  st.roster.forEach(m => { m.race = 'スライム'; });
  while (st.roster.length < 2) st.roster.push(Object.assign(Game.rollApplicant('slime'), { race: 'スライム' }));
  st.activeUids = st.roster.map(m => m.uid);
  st.town.lv.hostel = 1;
  Game.trace('sparked', st.roster[0].uid, null, { skill: '火球' });
  Game.trace('carried_materials', st.roster[1].uid, null, { amount: 2, facility: null });
  Incidents.settle(Game);
  App.render();
};

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.slot-card [data-action="new"][data-slot="1"]').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 作戦会議の5枚目');
  await page.evaluate(SEED);
  await page.waitForTimeout(200);
  const shape = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.mission-card')];
    const rumor = document.querySelector('.mission-card.rumor');
    return {
      total: cards.length,
      last: rumor ? cards[cards.length - 1] === rumor : false,
      text: rumor ? rumor.innerText.replace(/\s+/g, ' ') : '',
      open: !!document.querySelector('[data-action="incidentopen"]'),
      decline: !!document.querySelector('[data-action="incidentdecline"]'),
      wide: document.documentElement.scrollWidth > innerWidth
    };
  });
  ok(shape.total === 5 && shape.last, `作戦3枚＋訓練＋噂の札で5枚、噂は右端（${shape.total}枚）`);
  ok(/池からの同居人/.test(shape.text) && /水面の顔/.test(shape.text), `題と予兆の一行が出る（${shape.text.slice(0, 40)}）`);
  ok(shape.open && shape.decline, '「めくる」と「やめる」が並ぶ');
  ok(!shape.wide, '390px で横に溢れない');
  if (process.env.SP) await page.screenshot({ path: process.env.SP + '/incident-390.png', fullPage: true });

  console.log('\n▼ 城下町の張り紙（同じ札）');
  const town = await page.evaluate(() => {
    UI.castle('town');
    const rumor = document.querySelector('.town-rumors .mission-card.rumor');
    const panel = document.querySelector('.town-panel');
    const map = document.querySelector('.world-map');
    const cards = document.querySelectorAll('.town-card').length;
    const box = document.querySelector('.town-rumors');
    return {
      has: !!rumor, id: rumor ? rumor.dataset.incident : null,
      afterMap: !!(box && map && map.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeCards: !!(box && panel && cards > 0
        && box.compareDocumentPosition(document.querySelector('.town-card')) & Node.DOCUMENT_POSITION_FOLLOWING)
    };
  });
  ok(town.has && town.id === 'slime_pond', '張り紙にも同じ札が出る');
  ok(town.afterMap && town.beforeCards, '地図の下・施設一覧の上に出る');

  console.log('\n▼ めくる → 見学者を選ぶ → 結果');
  await page.evaluate(() => { App.render(); });
  await page.locator('.mission-card.rumor [data-action="incidentopen"]').click();
  await page.waitForTimeout(150);
  const pick = await page.evaluate(() => ({
    picks: document.querySelectorAll('[data-action="incidentpick"]').length,
    text: (document.querySelector('.event-panel') || {}).innerText || ''
  }));
  ok(pick.picks === 2, `名簿から見学者を選ぶ（${pick.picks}人）`);
  ok(/池からの同居人/.test(pick.text), '選ぶ画面にも札の題が出る');
  await page.locator('[data-action="incidentpick"]').first().click();
  await page.waitForTimeout(200);
  const result = await page.evaluate(() => {
    const box = document.querySelector('.incident-result');
    const why = document.querySelector('.incident-why');
    return {
      text: box ? box.innerText.replace(/\s+/g, ' ') : '',
      mormo: !!document.querySelector('.incident-result .mormo-brief'),
      whyClosed: why ? !why.open : null,
      // details は畳んでいると innerText に中身が出ない。中の文そのものを読む。
      why: why ? (why.querySelector('div') || {}).textContent || '' : '',
      done: !!Game.state.incidents.done.slime_pond,
      offered: Object.keys(Game.state.incidents.offered).length
    };
  });
  ok(/池の光を浴びて/.test(result.text), `結果の文が出る（${result.text.slice(0, 40)}）`);
  ok(result.mormo, 'モルモの一言が付く');
  ok(result.whyClosed === true, '「なぜ」は畳んで出す（押すと開く）');
  ok(/火の粉|建材/.test(result.why) && /2体以上|1体/.test(result.why),
    `「なぜ」が痕跡と隠れた状態を名指しする（${result.why.slice(0, 60)}）`);
  ok(result.done && result.offered === 0, 'めくった札は札の列から消える');
  await page.locator('[data-action="incidentdone"]').click();
  await page.waitForTimeout(150);
  ok(await page.locator('.mission-card.rumor').count() === 0, '戻ると札はもう無い');

  console.log('\n▼ やめる');
  const declined = await page.evaluate(async () => {
    Game.state.incidents.done = {};
    Incidents.settle(Game); App.render();
    const before = document.querySelectorAll('.mission-card.rumor').length;
    document.querySelector('[data-action="incidentdecline"]').click();
    await new Promise(r => setTimeout(r, 120));
    return { before, after: document.querySelectorAll('.mission-card.rumor').length,
      done: !!Game.state.incidents.done.slime_pond };
  });
  ok(declined.before === 1 && declined.after === 0, 'やめると札が消える');
  ok(!declined.done, 'A の札は無記録（やめても記録に残さない）');

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
