// 種族技と小成長（画面側）：札の🗡、面接の「6戦で【…】」、結果画面の「覚えた」と一言、
// 戦闘のキャプションに lines.use。仕様 docs/SPEC_SKILLS_2026-09-10.md 5.4・6・7節。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 名簿の札：1段目にも上位技にも🗡');
  await page.evaluate(() => {
    Game.state.roster = [
      { uid: 701, tplId: 'ogre', name: '一段目', race: 'オーガ', job: '', hp: 100, atk: 12, def: 10, spd: 5,
        salary: 2, loyalty: 70, traits: ['brute'], tags: [], quote: '', unpaid: false, injured: 0,
        rankId: 'soldier', merit: 0, base: { hp: 100, atk: 12, def: 10 }, grown: {}, skillTier: 1,
        record: { battles: 3, wins: 2, downed: 0, carried: 0, late: 0, ate: 0 } },
      { uid: 702, tplId: 'ogre', name: '上位技', race: 'オーガ', job: '', hp: 130, atk: 15, def: 12, spd: 5,
        salary: 2, loyalty: 70, traits: ['ogre_charge'], tags: [], quote: '', unpaid: false, injured: 0,
        rankId: 'soldier', merit: 0, base: { hp: 100, atk: 12, def: 10 }, grown: {}, skillTier: 2,
        record: { battles: 6, wins: 4, downed: 0, carried: 0, late: 0, ate: 0 } }
    ];
    Game.state.activeUids = [701, 702];
    Game.state.phase = 'formation';
    App.render();
  });
  const rowTexts = await page.locator('.member-row').allTextContents();
  const marks = rowTexts.filter(t => t.includes('🗡')).length;
  ok(marks >= 2, `🗡が1段目・上位技の両方の名簿行に出る（${marks}件）`);
  const detailTexts = [];
  for (const uid of [701, 702]) {
    await page.locator(`[data-action="member"][data-uid="${uid}"]`).evaluate(el => el.click());
    detailTexts.push(await page.locator('.member-detail').innerText());
    await page.locator('[data-action="closemember"]').click();
  }
  ok(detailTexts.some(t => /怪力/.test(t)), '1段目（怪力）が人物詳細に出る');
  ok(detailTexts.some(t => /ぶちかまし/.test(t)), '上位技（ぶちかまし）が人物詳細に出る');

  console.log('▼ 名簿の札：戦歴');
  const recordTexts = detailTexts;
  ok(recordTexts.some(t => /3戦（2勝）/.test(t)), `3戦2勝の戦歴が出る（${recordTexts.join(' / ')}）`);
  ok(recordTexts.some(t => /6戦（4勝）/.test(t)), `6戦4勝の戦歴が出る`);
  ok(!recordTexts.some(t => /\+/.test(t)), '伸び幅（+3など）は出さない');

  console.log('▼ 名簿の札：0戦の者には戦歴を出さない');
  await page.evaluate(() => {
    Game.state.roster.push({
      uid: 703, tplId: 'ogre', name: '新人', race: 'オーガ', job: '', hp: 100, atk: 12, def: 10, spd: 5,
      salary: 2, loyalty: 70, traits: ['brute'], tags: [], quote: '', unpaid: false, injured: 0,
      rankId: 'soldier', merit: 0, base: { hp: 100, atk: 12, def: 10 }, grown: {}, skillTier: 1,
      record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 }
    });
    Game.state.activeUids = Game.state.roster.map(m => m.uid);
    App.render();
  });
  const cardsCount = await page.locator('.member-row').count();
  await page.locator('[data-action="member"][data-uid="703"]').evaluate(el => el.click());
  const rookieDetail = await page.locator('.member-detail').innerText();
  ok(cardsCount === 3 && /出撃 0戦/.test(rookieDetail), `3人目の詳細は0戦と分かる（名簿${cardsCount}行）`);
  await page.locator('[data-action="closemember"]').click();

  console.log('▼ 面接：応募者に「6戦で【…】」（数値は出さない）');
  await page.evaluate(() => {
    Game.state.phase = 'recruit';
    Game.state.applicants = Game.state.applicants && Game.state.applicants.length
      ? Game.state.applicants : [Game.rollApplicant()];
    const a = Game.state.applicants[0];
    a.tplId = 'ogre'; a.race = 'オーガ'; a.traits = ['brute']; a.mercenary = false;
    a.bond = null; a.relicId = null; a.veteran = false;
    App.render();
  });
  const hint = await page.locator('.skill-hint').first().textContent();
  ok(/6戦で【ぶちかまし】/.test(hint), `応募者札に「6戦で【ぶちかまし】」（${hint}）`);
  ok(!/\d+\s*(HP|攻撃|防御)/.test(hint) && !/12|10/.test(hint), '能力値の数字は出さない');

  console.log('▼ 面接：既に上位技を持つ応募者には出さない');
  await page.evaluate(() => {
    const a = Game.state.applicants[0];
    a.name = '上位技持ち応募者';
    a.traits = ['ogre_charge'];
    App.render();
  });
  const firstCardHint = await page.locator('.applicant-member').first().locator('.skill-hint').count();
  ok(firstCardHint === 0, '上位技を既に持つ応募者には「6戦で」を出さない');

  console.log('▼ 結果画面：技を覚えた本人の一言');
  await page.evaluate(() => {
    Game.state.roster = [
      { uid: 704, tplId: 'ogre', name: 'ぶちかまし太郎', race: 'オーガ', job: '', hp: 130, atk: 15, def: 12, spd: 5,
        salary: 2, loyalty: 70, traits: ['ogre_charge'], tags: [], quote: '', unpaid: false, injured: 0,
        rankId: 'soldier', merit: 0, base: { hp: 100, atk: 12, def: 10 }, grown: {}, skillTier: 2,
        record: { battles: 6, wins: 4, downed: 0, carried: 0, late: 0, ate: 0 } }
    ];
    Game.state.activeUids = [704];
    Game.state.lastBattle = {
      victory: true, retreated: false, missionKind: '討伐', missionTitle: 'テスト戦', army: 'テスト軍',
      region: '', reward: 10, lootGold: 0, notes: ['ぶちかまし太郎が【ぶちかまし】を覚えた'],
      synergies: [], incidents: [], contribution: [], logLength: 0,
      unlocked: [{ uid: 704, name: 'ぶちかまし太郎', skillId: 'ogre_charge', skillName: 'ぶちかまし', quote: '……体が、覚えた' }]
    };
    Game.state.lastPayrollReport = { policyId: 'regular', paid: 0, base: 0, loyaltyDelta: 0 };
    Game.state.phase = 'result';
    App.render();
  });
  const unlockPanel = await page.locator('.skill-unlock-panel').count();
  ok(unlockPanel === 1, '結果画面に技を覚えたパネルが出る');
  const unlockText = await page.locator('.skill-unlock-panel').innerText();
  ok(/ぶちかまし太郎/.test(unlockText) && /【ぶちかまし】/.test(unlockText), `本人名と技名が出る（${unlockText.slice(0, 60)}）`);
  ok(/……体が、覚えた/.test(unlockText), '本人の一言（lines.unlock）が出る');

  console.log('▼ 結果画面：unlocked が無ければ何も出さない');
  await page.evaluate(() => {
    delete Game.state.lastBattle.unlocked;
    App.render();
  });
  ok(await page.locator('.skill-unlock-panel').count() === 0, 'lastBattle.unlocked が無ければパネルは出ない');

  console.log('▼ 戦闘：技のキャプションに lines.use');
  await page.evaluate(() => {
    Game.state.roster = [{ uid: 705, tplId: 'ogre', name: '検証用', race: 'オーガ', job: '', hp: 300, atk: 30, def: 10, spd: 5,
      salary: 2, loyalty: 70, traits: ['ogre_charge'], tags: [], quote: '', unpaid: false, injured: 0 }];
    Game.state.activeUids = [705];
    Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
    App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.waitForSelector('#scene', { timeout: 20000 });
  const captions = await page.evaluate(() => {
    window.__captions = [];
    const useLines = (TRAITS.ogre_charge.lines && TRAITS.ogre_charge.lines.use) || [];
    const fakeUnit = { name: '検証用', el: document.createElement('div'), side: 'player' };
    BattleScene.units = BattleScene.units || {};
    BattleScene.units[9001] = fakeUnit;
    BattleScene.clearFocus = BattleScene.clearFocus || (() => {});
    BattleScene.pulse = BattleScene.pulse || (() => {});
    const ev = { type: 'trait_trigger', sourceId: 9001, traitId: 'ogre_charge', name: 'ぶちかまし', quote: useLines[0], eventId: 'e1' };
    BattleScene.render(ev);
    const c = document.getElementById('action-caption');
    return { text: c ? c.textContent : '', quote: useLines[0] };
  });
  ok(!!captions.quote, 'ogre_charge に lines.use がある');
  ok(captions.text.includes(captions.quote), `キャプションに lines.use の一言が出る（${captions.text}）`);
  ok(await page.locator('.mormo-aside-choices').count() === 0, '技の発動は下半分の一言で戦闘を止めない');

  await page.evaluate(() => { BattleScene.speed = 4; BattleScene.skip(); });
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 20000 }).catch(() => {});

  if (errs.length) { process.exitCode = 1; console.log('  ✗ ページ例外: ' + errs.join(' / ')); }
  await b.close();
})();
