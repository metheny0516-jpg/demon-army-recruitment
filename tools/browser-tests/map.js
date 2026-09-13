// 全体マップ（docs/WORLD_MAP_DESIGN_2026-09-13.md 7節）：
// 征服度3・前哨済・市場Lv2 のセーブで、印の色・旗・税の表示・施設の区画が出る。横スクロールが無い。
//   node tools/browser-tests/map.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 征服3（村はずれ・街道・関所が領地）／関所の次＝大神殿の前哨は制済／市場Lv2・酒場Lv1・借金20G
const SAVE = () => {
  Game.state.conquest = 3;
  Game.state.outpost = { stage: 3, cleared: true, formationId: 'standard' };
  Game.state.town = { lv: { market: 2, tavern: 1 }, debt: 20, ledger: [], builtThisSettle: 0, exchanged: {} };
  Game.state.lastRansacked = false;
  UI.castle('town');
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

  console.log('▼ 地図が城下町の札の先頭に出る（一覧は下に残る）');
  await page.evaluate(SAVE);
  await page.waitForTimeout(300);
  const shape = await page.evaluate(() => {
    const map = document.querySelector('.world-map');
    const panel = document.querySelector('.town-panel');
    return {
      map: !!map,
      first: panel && panel.firstElementChild === map,
      points: document.querySelectorAll('.map-point').length,
      lots: document.querySelectorAll('.map-lot').length,
      cards: document.querySelectorAll('.town-card').length,
      bank: !!document.getElementById('town-bank'),
      bgLoaded: (() => { const i = document.querySelector('.map-bg'); return !!i && i.complete && i.naturalWidth > 0; })(),
      pins: [...document.querySelectorAll('.mp-pin')].filter(i => i.complete && i.naturalWidth > 0).length
    };
  });
  ok(shape.map && shape.first, '地図が札の先頭にある');
  ok(shape.points === 14, `地点が14（${shape.points}）`);
  ok(shape.lots === 8, `城下町の区画が8（${shape.lots}）`);
  ok(shape.cards === 6, `施設一覧も下に残っている（${shape.cards}件）`);
  ok(shape.bank, '魔界銀行の節がある（金庫の飛び先）');
  ok(shape.bgLoaded, '背景の絵が読める');
  ok(shape.pins === 14, `印の絵が全部読める（${shape.pins}/14）`);

  console.log('\n▼ 状態の見せ方：領地・前哨済・次・まだ遠い・霧');
  const states = await page.evaluate(() => {
    const by = {};
    for (const el of document.querySelectorAll('.map-point')) {
      const name = el.querySelector('.mp-name').textContent;
      by[el.dataset.stage] = {
        cls: [...el.classList].find(c => c.startsWith('mp-') && c !== 'mp-pin'),
        pin: el.querySelector('.mp-pin').getAttribute('src').split('/').pop(),
        text: name,
        disabled: el.disabled,
        action: el.dataset.action || null,
        glow: getComputedStyle(el, '::before').backgroundImage
      };
    }
    return by;
  });
  ok(states['1'].cls === 'mp-owned' && /pin-owned/.test(states['1'].pin), `征服済の地点は領地の印（${states['1'].pin}）`);
  ok(/税 \d+G/.test(states['1'].text), `領地に税が出る（${states['1'].text}）`);
  ok(states['1'].glow !== 'none', '領地は周りの土地も染まる');
  ok(states['4'].cls === 'mp-outpost' && /pin-outpost/.test(states['4'].pin),
    `前哨を制した次の地点は前哨の印（${states['4'].pin}）`);
  ok(/前哨済/.test(states['4'].text), `「前哨済」が出る（${states['4'].text}）`);
  ok(states['4'].action === 'mission' && !states['4'].disabled, '次の地点は押せて、作戦会議へ行く');
  ok(states['6'].disabled && states['6'].cls === 'mp-far', `まだ遠い地点は押せない（${states['6'].cls}）`);
  ok(states['9'].cls === 'mp-fogged' && /？？？/.test(states['9'].text),
    `第二幕の地点は霧（${states['9'].text}）`);
  ok(states['14'].cls === 'mp-fogged', '連合本陣も霧');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/map-390.png' });

  console.log('\n▼ 前哨がまだなら「次の戦い」');
  const nextOnly = await page.evaluate(() => {
    Game.state.outpost = null; UI.castle('town');
    const el = [...document.querySelectorAll('.map-point')].find(p => p.dataset.stage === '4');
    return { cls: [...el.classList].find(c => c.startsWith('mp-') && c !== 'mp-pin'), text: el.querySelector('.mp-name').textContent, action: el.dataset.action };
  });
  ok(nextOnly.cls === 'mp-next' && /次の戦い/.test(nextOnly.text), `前哨前は「次の戦い」（${nextOnly.text}）`);
  ok(nextOnly.action === 'mission', '押せば作戦会議へ');

  console.log('\n▼ 城下町の区画：建った施設と空き地');
  const lots = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.map-lot')];
    const market = all.find(l => l.dataset.id === 'market');
    const smithy = all.find(l => l.dataset.id === 'smithy');
    return {
      market: market ? { text: market.innerText.replace(/\n/g, ' '), built: market.classList.contains('built'), action: market.dataset.action } : null,
      smithy: smithy ? { text: smithy.innerText.replace(/\n/g, ' '), built: smithy.classList.contains('built') } : null,
      empty: all.filter(l => l.classList.contains('mp-empty')).length
    };
  });
  ok(lots.market && /市場/.test(lots.market.text) && /Lv2/.test(lots.market.text), `市場は Lv2（${lots.market && lots.market.text}）`);
  ok(lots.market && lots.market.built && lots.market.action === 'townbuild', '建った区画は押すと「建てる」へ');
  ok(lots.smithy && !lots.smithy.built && /Lv0/.test(lots.smithy.text), `建てていない施設は空き地（${lots.smithy && lots.smithy.text}）`);
  ok(lots.empty === 2, `施設のない区画は空き地のまま（${lots.empty}／8）`);

  console.log('\n▼ 税と借金の一行、荒らされた印');
  const strip = await page.evaluate(() => document.querySelector('.map-strip').innerText.replace(/\n/g, ' '));
  ok(/領地 3/.test(strip) && /税/.test(strip), `領地と税（${strip}）`);
  ok(/借金 20G/.test(strip), `借金も出る（${strip}）`);
  const smoke = await page.evaluate(() => {
    Game.state.lastRansacked = true; UI.castle('town');
    return document.querySelectorAll('.map-point .mp-smoke').length;
  });
  ok(smoke === 1, `荒らされた領地に煙が1つ（${smoke}）`);

  console.log('\n▼ 横スクロールが無い／次に戦う地点が中央');
  const scroll = await page.evaluate(() => {
    Game.state.lastRansacked = false;
    Game.state.outpost = { stage: 3, cleared: true, formationId: 'standard' };
    UI.castle('town');
    if (typeof MapUI !== 'undefined') MapUI.focus(UI.root);
    const map = document.querySelector('.world-map');
    const target = map.querySelector('.map-point.mp-outpost, .map-point.mp-next');
    const mb = map.getBoundingClientRect(), tb = target.getBoundingClientRect();
    return {
      pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      mapWide: map.scrollWidth > map.clientWidth + 1,
      offset: Math.round((tb.top + tb.height / 2) - (mb.top + mb.height / 2)),
      scrolled: map.scrollTop
    };
  });
  ok(!scroll.pageWide, '画面に横スクロールが出ない');
  ok(!scroll.mapWide, '地図そのものも横に溢れない');
  ok(Math.abs(scroll.offset) <= 40, `次に戦う地点が中央に来る（ずれ ${scroll.offset}px）`);
  ok(scroll.scrolled > 0, `初回のスクロール位置が合っている（${scroll.scrolled}px）`);

  console.log('\n▼ 旧セーブ（town も outpost も無い）でも描ける');
  const legacy = await page.evaluate(() => {
    delete Game.state.town; delete Game.state.outpost; Game.state.conquest = 0;
    UI.castle('town');
    const el = [...document.querySelectorAll('.map-point')].find(p => p.dataset.stage === '1');
    return { points: document.querySelectorAll('.map-point').length,
      first: [...el.classList].find(c => c.startsWith('mp-') && c !== 'mp-pin'),
      lots: document.querySelectorAll('.map-lot').length };
  });
  ok(legacy.points === 14 && legacy.lots === 8, '地点も区画も出る');
  ok(legacy.first === 'mp-next', `征服0なら村はずれが次の戦い（${legacy.first}）`);

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
