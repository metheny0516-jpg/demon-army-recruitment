// 城下町の札（2026-09-12）：札が出る／建てる／銀行で借りる・返す／家計簿。390px で横に溢れない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const path = require('node:path');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.locator('.slot-card [data-action="new"][data-slot="1"]').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);
  await page.evaluate(() => { Game.state.gold = 60; Game.state.materials = 12; Game.state.conquest = 2; Game.state.turn = 3; App.render(); });
  await page.click('[data-action="castle"]');
  await page.click('[data-action="castletab"][data-tab="town"]');
  await page.waitForTimeout(100);
  ok(await page.locator('.town-panel').count() === 1, '城下町の札が開く');
  ok(/税収/.test(await page.locator('.town-summary').innerText()), `税収の一行（${(await page.locator('.town-summary').innerText()).replace(/\s+/g, ' ')}）`);
  ok(await page.locator('.town-card').count() === 8, '施設8つ（町6・軍2。2026-09-13 の統合）');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px で横に溢れない');
  if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'town-390.png'), fullPage: true });
  // 地図（2026-09-13）にも同じ data-action の区画があるので、ここは**一覧の側**を名指しする
  await page.locator('.town-card [data-action="townbuild"][data-id="market"]').click();
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ lv: Town.lv(Game.state, 'market'), gold: Game.state.gold, materials: Game.state.materials, tax: Town.taxPerSettle(Game.state) }));
  ok(after.lv === 1 && after.gold === 45 && after.materials === 9 && after.tax === 6, `市場を建てた（Lv${after.lv}・所持金${after.gold}・建材${after.materials}・税${after.tax}）`);
  ok(await page.locator('.town-card [data-action="townbuild"]:not([disabled])').count() === 0, '同じ決着ではもう建てられない（一覧は全部 disabled）');
  await page.locator('[data-action="townborrow"][data-amount="20"]').click();
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => Game.state.town.debt === 20 && Game.state.gold === 65), '20G 借りた');
  ok(/借金/.test(await page.evaluate(() => document.querySelector('.hud').textContent)), 'HUD に借金が出る（畳んだ行の中）');
  await page.locator('[data-action="townrepay"]').last().click();
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => Game.state.town.debt === 0 && Game.state.gold === 45), '全部返した');
  // ── 統合（2026-09-13）：8施設が「町（6）」「軍（2）」の2見出しで並ぶ ──
  console.log('▼ 町と軍の2見出し');
  const groups = await page.evaluate(() => ({
    heads: [...document.querySelectorAll('.town-group')].map(h => h.textContent.replace(/\s+/g, ' ').trim()),
    cards: document.querySelectorAll('.town-card').length,
    army: [...document.querySelectorAll('.town-card')].map(c => c.textContent)
      .filter(t => /巨大厨房|墓地/.test(t)).length,
    ledger: [...document.querySelectorAll('.town-card')].some(c => /恐喝帳簿/.test(c.textContent))
  }));
  ok(groups.heads.length === 2 && /町（6）/.test(groups.heads[0]) && /軍（2）/.test(groups.heads[1]),
    `見出しが2つ（${groups.heads.join(' / ')}）`);
  ok(groups.cards === 8, `施設の札が8枚（${groups.cards}）`);
  ok(groups.army === 2, `巨大厨房と墓地が「軍」に並ぶ（${groups.army}）`);
  ok(!groups.ledger, '恐喝帳簿の札は無い');

  console.log('▼ 軍団の札に施設パネルは無い（城下町へ寄せた）');
  const moved = await page.evaluate(() => {
    UI.castle('army');
    return { facility: document.querySelectorAll('.castle-facility, .facility-blueprint').length,
      town: document.querySelectorAll('.town-card').length };
  });
  ok(moved.facility === 0 && moved.town === 0, `軍団の札に施設の話は出ない（${moved.facility}）`);

  // ── 音（2026-09-14）：施設が落ちた決着で金庫の音が鳴る ──
  // 実際の経路（利子が払えず銀行が差し押さえる）を通して、決着の画面で鳴ることを見る。
  console.log('▼ 施設が落ちた決着の音');
  await page.evaluate(() => {
    Sound.muted = false; Sound.volume = 0.01;      // 音は解禁しないと鳴らない
    Sound.media.forEach(a => a.pause()); Sound.media.clear();
    const st = Game.state;
    st.town.lv.market = 2;                          // 落とせる施設を用意
    st.town.debt = 2000; st.gold = 0;               // 利子が払えない ＝ 差し押さえ
    st.roster.forEach(m => { m.hp = 9999; m.atk = 999; m.def = 99; m.spd = 99; });
    Game.prepareMissions(true);
    Game.selectMission(0); App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(250);
  const razed = await page.evaluate(() => ({
    lv: Town.lv(Game.state, 'market'),
    seized: (Game.state.town.ledger || []).some(r => r.seized),
    played: [...Sound.media].map(a => (a.currentSrc || a.src || '').split('/').pop()),
    cleared: Game.state.town.lastDemolished === undefined,
    screen: (document.querySelector('.banner h2') || {}).textContent || ''
  }));
  ok(razed.lv === 1, `利子が払えず市場が1段落ちた（Lv${razed.lv}）`);
  ok(razed.played.includes('town-bank.wav'), `決着の画面で town-bank.wav が鳴る（${razed.played.join(' ') || 'なし'}）`);
  ok(razed.cleared, '鳴らしたら控えは消える（次の決着では鳴らない）');

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})().catch(e => { console.error(e); process.exit(1); });
