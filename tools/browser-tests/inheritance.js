// 継承（画面側）：HUDのLv、蔵での遺物の受け渡し、面接の縁の応募者、魔界史の「去った者たち」
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
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ HUDに魔王軍レベル');
  ok((await page.locator('.hud .army-level').count()) === 1, '.hud に .army-level がある');
  const lvText = await page.locator('.hud .army-level').textContent();
  ok(/Lv\.\d/.test(lvText), `Lv.表示: "${lvText.trim()}"`);

  console.log('▼ 蔵：渡す／戻す');
  const setup = await page.evaluate(() => {
    Game.state.roster = [
      { uid: 801, tplId: 'goblin', name: '生き残り', race: 'ゴブリン', job: '雑用兵', hp: 20, atk: 5, def: 2, spd: 5,
        salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false, injured: 0,
        rankId: 'soldier', merit: 0, record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 }, relicIds: [] }
    ];
    Game.state.activeUids = [801];
    Game.state.relics = [{
      id: 'relic_test1', name: 'ガロの杯', traitId: 'drunkard',
      from: { name: 'ガロ', race: 'オーク', cause: 'fallen', army: '神殿騎士団', turn: 7 },
      holderUid: null
    }];
    Game.state.phase = 'formation';
    App.render();
    return true;
  });
  ok(setup, '検証用の名簿と遺物を用意した');
  await page.locator('[data-action="member"][data-uid="801"]').evaluate(el => el.click());
  ok((await page.locator('.member-detail [data-action="giverelic"]').count()) === 1, '人物詳細に蔵の遺物を渡す操作が出る');
  await page.click('.member-detail [data-action="giverelic"]');
  await page.waitForTimeout(50);
  const afterGive = await page.evaluate(() => ({
    holderUid: Game.relicOf('relic_test1').holderUid,
    traits: Game.state.roster[0].traits,
    relicIds: Game.state.roster[0].relicIds
  }));
  ok(afterGive.holderUid === 801, `遺物の持ち主が設定された (holderUid=${afterGive.holderUid})`);
  ok(afterGive.traits.includes('drunkard'), '持ち主に特性が付いた');
  ok(afterGive.relicIds.includes('relic_test1'), '持ち主の relicIds に載った');
  await page.locator('[data-action="member"][data-uid="801"]').evaluate(el => el.click());
  ok((await page.locator('.member-detail .relic-chip').count()) >= 1, '人物詳細に🏺の表示が出る');
  await page.click('.member-detail [data-action="storerelic"]');
  await page.waitForTimeout(50);
  const afterStore = await page.evaluate(() => ({
    holderUid: Game.relicOf('relic_test1').holderUid,
    traits: Game.state.roster[0].traits
  }));
  ok(afterStore.holderUid === null, '蔵に戻った');
  ok(!afterStore.traits.includes('drunkard'), '特性が外れた');

  console.log('▼ 面接：縁の応募者とモルモの一言');
  await page.evaluate(() => {
    Game.state.departed = [{
      uid: 999, name: 'ガロ', race: 'オーク', tplId: 'orc', job: '戦士', traits: [], rankId: 'soldier', merit: 0,
      cause: 'fallen', day: 5, turn: 7, army: '神殿騎士団',
      record: { battles: 8, wins: 5, downed: 1, carried: 0, late: 0, ate: 0 }, relicId: 'relic_test1'
    }];
    Game.state.pendingBond = null;
    Game.state.applicants = Game.state.applicants || [];
    if (!Game.state.applicants.length) Game.state.applicants = [Game.rollApplicant()];
    Game.state.applicants[0].bond = { name: 'ガロ', cause: 'fallen', kind: 'admirer', army: '神殿騎士団' };
    Game.state.applicants[0].motive = 'ガロ隊長に憧れて';
    Game.state.applicants[0].relicId = 'relic_test1';
    Game.state.phase = 'recruit';
    App.render();
  });
  ok((await page.locator('.army-history-line').count()) === 1, '面接画面に軍団史の1行がある');
  // 押すと「去った者たち」が開く（魔界史を待たずにラン中に読める）
  ok((await page.locator('.departed-panel').count()) >= 1, '軍団史の行が開ける一覧になっている');
  ok(!(await page.locator('.departed-panel .departed-row').first().isVisible()),
    '既定では畳まれている（面接の邪魔をしない）');
  await page.locator('.departed-panel > summary').first().click();
  await page.waitForTimeout(80);
  const openedText = await page.locator('.departed-panel .departed-row').first().textContent();
  ok(/ガロ/.test(openedText) && /戦死/.test(openedText) && /8戦/.test(openedText),
    `開くと去った者の戦歴が読める: "${openedText.trim()}"`);
  ok(/ガロの杯/.test(openedText), '残した遺物の名も読める');
  const historyText = await page.locator('.army-history-line').textContent();
  ok(historyText.includes('ガロ') && historyText.includes('戦死'), `軍団史の中身: "${historyText.trim()}"`);
  ok((await page.locator('.bond-note').count()) >= 1, '縁の印（🕯）が札に出る');
  const bondText = (await page.locator('.bond-note').allTextContents()).join(' ');
  ok(bondText.includes('ガロ') && bondText.includes('縁'), `縁の印の中身: "${bondText}"`);
  ok(bondText.includes('持って来た'), `持って来た遺物の印: "${bondText}"`);

  // モルモの一言：nextrecruit 経由で報告が積まれるので、捕まえて中身を見る
  const reportSeen = await page.evaluate(() => new Promise(resolve => {
    const show = MormoScene.show.bind(MormoScene);
    MormoScene.show = function (o) { MormoScene.show = show; resolve(o.text || ''); show(o); this.close(); };
    App.onAction('nextrecruit', {});
    setTimeout(() => resolve(''), 500);
  }));
  ok(reportSeen.includes('ガロ') && reportSeen.includes('話ばかり'), `モルモの一言に故人の名: "${reportSeen}"`);

  console.log('▼ 叩き上げ（終盤に来た低ティア）');
  await page.evaluate(() => {
    Game.state.conquest = 7; Game.state.turn = 1;
    Game.genApplicants();
    // 必ず1人は低ティアを混ぜる（重みが下がっているので偶然に頼らない）
    Game.state.applicants[0] = Game.rollApplicant('kobold');
    Game.state.phase = 'recruit'; App.render();
  });
  await page.waitForTimeout(80);
  ok((await page.locator('.veteran-note').count()) >= 1, '終盤に来た低ティアの札に「🎖 歴戦」が出る');
  const vetText = await page.locator('.veteran-note').first().textContent();
  ok(/歴戦/.test(vetText), `印の中身: "${vetText.trim()}"`);
  const vetMotive = await page.evaluate(() => {
    const m = Game.state.applicants.find(a => a.veteran);
    return m ? { motive: m.motive, inPool: VETERAN_MOTIVES.includes(m.motive) } : null;
  });
  ok(vetMotive && vetMotive.inPool, `志望理由が叩き上げのプールから出る: "${vetMotive && vetMotive.motive}"`);

  console.log('▼ 蔵は空でも出る（誰かが去っていれば）');
  await page.evaluate(() => {
    Game.state.relics = [];                 // 品は何も残っていない
    Game.state.departed = [{ uid: 900, name: '無名', race: 'コボルト', tplId: 'kobold',
      job: '兵', traits: [], rankId: 'soldier', merit: 0, cause: 'deserted', day: 1, turn: 2,
      army: null, record: { battles: 2, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 }, relicId: null }];
    Game.state.phase = 'formation'; App.render();
  });
  await page.waitForTimeout(80);
  await page.locator('[data-action="castle"]').first().click();
  await page.locator('[data-action="castletab"][data-tab="records"]').click();
  ok((await page.locator('.vault-panel').count()) === 1, '遺物が1つも無くても蔵パネルは出る');
  const emptyVault = await page.locator('.vault-panel').textContent();
  ok(/蔵は空/.test(emptyVault) && /無名/.test(emptyVault),
    `空の蔵が誰が何も残さなかったかを言う: "${emptyVault.replace(/\s+/g, ' ').trim().slice(0, 60)}"`);
  ok((await page.locator('.records-departed .departed-panel').count()) === 1, '記録札から去った者たちへ行ける');
  await page.evaluate(() => { Game.state.departed = []; App.render(); });
  await page.waitForTimeout(80);
  await page.locator('[data-action="castle"]').first().click();
  await page.locator('[data-action="castletab"][data-tab="records"]').click();
  ok((await page.locator('.vault-panel').count()) === 1, '記録札では空の蔵も確認できる');

  console.log('▼ 魔界史：去った者たち');
  await page.evaluate(() => {
    const record = {
      gen: 1, cleared: false, buildName: null, battlesWon: 3, conquest: 1, alert: 0,
      reignYears: 5, maxPower: 10, maxChain: 0, maxOverkill: 0, mainRace: 'ゴブリン',
      region: '辺境', cause: 'テスト敗北', finalRoster: [],
      departed: [{ name: 'ガロ', race: 'オーク', cause: 'fallen', army: '神殿騎士団', battles: 8, wins: 5, relicName: 'ガロの杯' }]
    };
    const history = Storage.appendHistory(record);
    UI.history(history);
  });
  ok((await page.locator('.departed-list').count()) === 1, '魔界史に「去った者たち」が出る');
  const departedText = await page.locator('.departed-row').first().textContent();
  ok(departedText.includes('ガロ') && departedText.includes('戦死') && departedText.includes('ガロの杯'),
    `去った者たちの1行: "${departedText.trim()}"`);

  ok(errs.length === 0, 'JSエラーなし' + (errs.length ? ': ' + errs.join(', ') : ''));
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/inheritance.png', fullPage: true });
  await b.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
