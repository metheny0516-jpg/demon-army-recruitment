// 城下町の札（2026-09-12）：札が出る／建てる／銀行で借りる・返す／家計簿。390px で横に溢れない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, keepMormoChoices, enterMissionPhase } = require('./helpers.js');
const path = require('node:path');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await keepMormoChoices(page);
  await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
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
  // 前借り（docs/SPEC_BANK_ADVANCE_2026-09-19.md）。担保を選んでから契約が成立する。
  await page.locator('[data-action="townborrow"][data-id="small"]').click();
  await page.waitForTimeout(200);
  await page.locator('#mormo-scene .mormo-scene-next').click();          // 全文表示
  await page.waitForSelector('#mormo-scene .mormo-scene-choice');
  await page.locator('#mormo-scene .mormo-scene-choice[data-action="advancepick"]').first().click();
  await page.waitForTimeout(250);
  const borrowed = await page.evaluate(() => {
    const a = Game.state.town.advance;
    return a ? { repay: a.repay, left: a.settlesLeft, uid: a.uid, gold: Game.state.gold } : null;
  });
  ok(borrowed && borrowed.repay === 20 && borrowed.left === 3 && borrowed.gold === 60,
    `小口 15G を借りた（返す ${borrowed && borrowed.repay}G・あと${borrowed && borrowed.left}決着・所持金 ${borrowed && borrowed.gold}）`);
  ok(/前借り/.test(await page.evaluate(() => document.querySelector('.hud').textContent)), 'HUD に前借りが出る（畳んだ行の中）');
  await page.evaluate(() => { if (MormoScene.active) MormoScene.close(); UI.castle('town'); });
  await page.waitForTimeout(150);
  await page.locator('[data-action="townrepay"]').last().click();
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => Game.state.town.advance === null && Game.state.gold === 40),
    `いま返した（所持金 ${await page.evaluate(() => Game.state.gold)}）`);
  await page.evaluate(() => { if (MormoScene.active) MormoScene.close(); Game.state.gold = 45; UI.castle('town'); });
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

  // ── 前借りの期限切れ（docs/SPEC_BANK_ADVANCE_2026-09-19.md §2-3）──
  // 決着の中で期限が切れ、払えず2択になる経路。ここで銀行の音も鳴る。
  console.log('▼ 前借りの期限切れ');
  await page.evaluate(() => {
    Sound.muted = false; Sound.volume = 0.01;      // 音は解禁しないと鳴らない
    Sound.media.forEach(a => a.pause()); Sound.media.clear();
    // 前借りの期限切れ（docs/SPEC_BANK_ADVANCE_2026-09-19.md §2-3）。
    // 利子の差し押さえは廃止したので、銀行が牙を剥くのはここだけになった。
    const st = Game.state;
    st.gold = 0;
    st.roster[0].merit = 30;                        // 大口の担保に立てる戦功
    Town.borrow(Game, 'large', st.roster[0].uid);   // 受け取り 50G・返す 80G
    st.town.advance.settlesLeft = 1;                // 次の決着が期限
    st.gold = 0;                                    // 勝利報酬を足しても 80G には届かない
    st.roster.forEach(m => { m.hp = 9999; m.atk = 999; m.def = 99; m.spd = 99; });
    Game.prepareMissions(true);
    Game.selectMission(0); App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.click('[data-action="skiplog"]');
  await page.click('[data-action="afterbattle"]');
  await page.click('[data-action="afterresult"]');
  await page.waitForTimeout(300);
  await page.locator('#mormo-scene .mormo-scene-next').click();          // 全文表示
  await page.waitForSelector('#mormo-scene .mormo-scene-choice');
  const overdue = await page.evaluate(() => ({
    prompt: (Game.state.advancePrompt || {}).kind || null,
    labels: [...document.querySelectorAll('#mormo-scene .mormo-scene-choice')].map(b => b.textContent.trim())
  }));
  ok(overdue.prompt === 'overdue', `払えないと2択を聞かれる（${overdue.prompt}）`);
  ok(overdue.labels.length === 2, `連れて行かせる／待ってもらう（${overdue.labels.join('／') || 'なし'}）`);
  const rosterBefore = await page.evaluate(() => Game.state.roster.length);
  await page.locator('#mormo-scene .mormo-scene-choice[data-action="advancehandover"]').click();
  await page.waitForTimeout(300);
  const taken = await page.evaluate(() => ({
    roster: Game.state.roster.length,
    note: (Game.state.relics || []).some(r => r.note),
    advance: Game.state.town.advance,
    credit: Game.state.town.credit,
    played: [...Sound.media].map(a => (a.currentSrc || a.src || '').split('/').pop())
  }));
  ok(taken.roster === rosterBefore - 1, `担保の者が連れて行かれた（${rosterBefore} → ${taken.roster}）`);
  ok(taken.note, '蔵に借用書が残る');
  ok(taken.advance === null && taken.credit === false, '契約は帳消し、そのランはもう借りられない');
  ok(taken.played.includes('town-bank.wav'), `銀行の音が鳴る（${taken.played.join(' ') || 'なし'}）`);
  await page.evaluate(() => { if (MormoScene.active) MormoScene.close(); App.render(); });
  await page.waitForTimeout(150);

  // ── 施設の詳細（docs/SPEC_FACILITY_DETAIL_2026-09-13.md §1・§7）──
  console.log('▼ 施設の詳細が開き、その場で増築できる');
  await page.evaluate(() => {
    Game.state.gold = 200; Game.state.materials = 60; Game.state.turn = 7;
    Game.state.town.builtTurn = 0; Game.state.town.builtCount = 0;
    App.render();
  });
  await page.click('[data-action="castle"]');
  await page.click('[data-action="castletab"][data-tab="town"]');
  await page.waitForTimeout(120);
  await page.locator('.town-card .town-name[data-id="market"]').click();
  await page.waitForTimeout(150);
  const detail = await page.evaluate(() => {
    const body = document.querySelector('.fd-body');
    return {
      open: !!document.querySelector('.facility-detail'),
      title: (document.querySelector('.fd-title') || {}).innerText || '',
      art: (document.querySelector('.fd-art') || {}).dataset?.lv,
      bg: body ? getComputedStyle(body).backgroundImage : '',
      mormo: (document.querySelector('.fd-mormo') || {}).innerText || '',
      born: (document.querySelector('.fd-history') || {}).innerText || '',
      wide: document.documentElement.scrollWidth <= innerWidth
    };
  });
  ok(detail.open && /市場/.test(detail.title), `市場の詳細が開く（${detail.title.replace(/\s+/g, ' ')}）`);
  ok(/bg-market\.webp/.test(detail.bg), `施設ごとの背景が乗る（${detail.bg.slice(0, 60)}）`);
  ok(/デス/.test(detail.mormo), `モルモの一言が Lv 別に出る（${detail.mormo}）`);
  ok(/生んだもの/.test(detail.born), '「生んだもの」が読める');
  ok(detail.wide, '390px で横に溢れない');
  if (process.env.SP) await page.screenshot({ path: path.join(process.env.SP, 'facility-detail-390.png'), fullPage: true });

  const lvBefore = await page.evaluate(() => Town.lv(Game.state, 'market'));
  await page.locator('.fd-build [data-action="townbuild"]').click();
  await page.waitForTimeout(250);
  const grown = await page.evaluate(() => ({
    lv: Town.lv(Game.state, 'market'),
    still: !!document.querySelector('.facility-detail'),
    art: document.querySelector('.fd-art')?.dataset.lv,
    upgraded: (Game.state.town.stats.market || {}).upgraded || []
  }));
  ok(grown.lv === lvBefore + 1 && grown.still, `詳細のまま増築できる（Lv${lvBefore}→${grown.lv}）`);
  ok(String(grown.art) === String(grown.lv), `絵がその場で差し替わる（data-lv=${grown.art}）`);
  ok(grown.upgraded.includes(7), `増築した決着が記録に残る（${JSON.stringify(grown.upgraded)}）`);

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})().catch(e => { console.error(e); process.exit(1); });
