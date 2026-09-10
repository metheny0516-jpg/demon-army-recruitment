// 全滅（player wipe）と判定負け（lostOnPoints）：仕様5.4。
// 全滅は敗北であって終了ではない。結果画面の見出しは「全滅」、モルモは「撃退」と言わず、
// 名簿が空でも金があれば面接へ進める。判定負けの見出しは「敗走」。
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

  console.log('▼ 全滅の結果画面（lastBattle を組んで result を出す）：留守番あり');
  await page.evaluate(() => {
    Game.state.roster = [
      { uid: 701, tplId: 'goblin', name: '留守番太郎', race: 'ゴブリン', job: '', hp: 20, atk: 5, def: 2, spd: 5,
        salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false, injured: 0 }
    ];
    Game.state.gold = 40;
    Game.state.wipeCount = 1;
    Game.state.lastBattle = {
      victory: false, wiped: true,
      fallen: [{ name: '出撃花子', race: 'オーク' }, { name: '出撃次郎', race: 'コボルト' }],
      relicsLeft: [],
      army: '神殿騎士団', region: '辺境', reward: 0, lootGold: 0,
      synergies: [], incidents: [], notes: ['王国警戒度+1（現在 1）'], logLength: 0,
      contribution: [], nearMiss: null
    };
    Game.state.phase = 'result';
    App.render();
  });
  const wipeReport = await page.evaluate(() => ({
    heading: (document.querySelector('.banner h2') || {}).textContent,
    body: document.querySelector('.banner').innerText,
    scene: UI.root && UI.root.dataset.scene
  }));
  ok(wipeReport.heading === '全滅', `見出しが「全滅」（${wipeReport.heading}）`);
  ok(/出撃花子/.test(wipeReport.body) && /出撃次郎/.test(wipeReport.body), `戻らなかった者の名前が出る (${wipeReport.body.slice(0, 80)})`);
  ok(/戻らなかった/.test(wipeReport.body), '「戻らなかった」の文言');
  ok(/留守番太郎|1人が残っている/.test(wipeReport.body) || /城には/.test(wipeReport.body), '留守番の有無に触れる');
  ok(wipeReport.scene === 'report', `scene は report のまま（${wipeReport.scene}）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/wipe-result.png', fullPage: true });

  console.log('▼ 全滅のモルモ報告（「撃退しました」と言わない）');
  await page.evaluate(() => { window.__reports = []; });
  await page.evaluate(() => {
    const show = MormoScene.show.bind(MormoScene);
    MormoScene.show = function (o) { window.__reports = window.__reports || []; window.__reports.push(o); show(o); this.close(); };
    App.battleReport();
  });
  await page.waitForTimeout(100);
  const wipeSaid = await page.evaluate(() => (window.__reports || []).map(r => r.text).join(' / '));
  ok(!/撃退しました/.test(wipeSaid), `「撃退しました」と言わない（${wipeSaid.slice(0, 60)}）`);
  ok(/全員、戻りませんでした/.test(wipeSaid), `全滅の報告文言（${wipeSaid.slice(0, 60)}）`);
  ok(/立て直しましょう/.test(wipeSaid), '留守番がいれば「立て直しましょう」');

  console.log('▼ 全滅から面接へ進める（名簿が空でも金があれば）');
  await page.evaluate(() => {
    Game.state.roster = [];
    Game.state.wipeCount = 1;
    Game.state.gold = 200;
    Game.state.relics = [{ id: 'r1', name: '花子の杯', traitId: 'drunkard', holderUid: null,
      from: { name: '出撃花子', race: 'オーク', cause: 'fallen', army: '神殿騎士団', turn: 3 } }];
    Game.state.lastBattle = {
      victory: false, wiped: true,
      fallen: [{ name: '出撃花子', race: 'オーク' }],
      relicsLeft: [{ name: '花子の杯' }],
      army: '神殿騎士団', region: '辺境', reward: 0, lootGold: 0,
      synergies: [], incidents: [], notes: [], logLength: 0, contribution: [], nearMiss: null
    };
    Game.state.phase = 'result';
    App.render();
  });
  const emptyRosterBody = await page.evaluate(() => document.querySelector('.banner').innerText);
  ok(/城に残る者はいない/.test(emptyRosterBody) || /花子の杯/.test(emptyRosterBody), `名簿が空／遺物の言及がある（${emptyRosterBody.slice(0, 80)}）`);
  await page.click('[data-action="afterresult"]');
  await page.waitForTimeout(150);
  const afterEmpty = await page.evaluate(() => Game.state.phase);
  ok(afterEmpty === 'recruit', `名簿が空でも金があれば面接へ進む（${afterEmpty}）`);
  const recruitBody = await page.evaluate(() => document.body.innerText);
  ok(/軍団は全滅した/.test(recruitBody), '面接に「軍団は全滅した。ここから建て直す」の一行');
  ok(/蔵に\s*1\s*品|花子の杯/.test(recruitBody) || /🏺/.test(recruitBody), '面接に蔵の遺物への言及');

  console.log('▼ 判定負け（敗走）の結果画面');
  await page.evaluate(() => {
    Game.state.roster = [
      { uid: 711, tplId: 'goblin', name: '担がれ太郎', race: 'ゴブリン', job: '', hp: 20, atk: 5, def: 2, spd: 5,
        salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false, injured: 0 }
    ];
    Game.state.lastBattle = {
      victory: false, wiped: false, lostOnPoints: true,
      army: '神殿騎士団', region: '辺境', reward: 0, lootGold: 0,
      synergies: [], incidents: [], notes: [], logLength: 0,
      contribution: [{ name: '担がれ太郎', injured: true, mercenary: false }],
      nearMiss: null
    };
    Game.state.phase = 'result';
    App.render();
  });
  const routReport = await page.evaluate(() => ({
    heading: (document.querySelector('.banner h2') || {}).textContent,
    body: document.querySelector('.banner').innerText
  }));
  ok(routReport.heading === '敗走', `見出しが「敗走」（${routReport.heading}）`);
  ok(/押し返された/.test(routReport.body), '「押し返された」の文言');
  ok(/担がれ太郎/.test(routReport.body), '担いで戻った者の名前が出る');

  console.log('▼ 判定負けのモルモ報告');
  await page.evaluate(() => { window.__reports = []; });
  await page.evaluate(() => {
    const show = MormoScene.show.bind(MormoScene);
    MormoScene.show = function (o) { window.__reports = window.__reports || []; window.__reports.push(o); show(o); this.close(); };
    App.battleReport();
  });
  await page.waitForTimeout(100);
  const routSaid = await page.evaluate(() => (window.__reports || []).map(r => r.text).join(' / '));
  ok(!/撃退しました/.test(routSaid), `判定負けで「撃退しました」と言わない（${routSaid.slice(0, 60)}）`);
  ok(/押し返されました/.test(routSaid) && /担がれ太郎/.test(routSaid), `判定負けの報告文言（${routSaid.slice(0, 60)}）`);

  console.log('▼ 本物の全滅（HP1の味方2人 vs 強い敵）を実戦闘で通す');
  let realWipeOk = true;
  try {
    await page.evaluate(() => { Game.newRun(); });
    await enterMissionPhase(page);
    await page.evaluate(() => {
      Game.state.roster = [
        { uid: 721, tplId: 'goblin', name: '捨て駒甲', race: 'ゴブリン', job: '', hp: 1, atk: 1, def: 0, spd: 1,
          salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false, injured: 0 },
        { uid: 722, tplId: 'goblin', name: '捨て駒乙', race: 'ゴブリン', job: '', hp: 1, atk: 1, def: 0, spd: 1,
          salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false, injured: 0 }
      ];
      Game.state.activeUids = [721, 722];
      // 味方はHP1で反撃しても倒せない相手にする（勝敗が確実に決まるように仕立てる）
      Game.state.selectedMission = {
        stage: 1, army: '討伐軍', region: '試験場', reward: 6, missionKind: 'battle', missionTitle: '試験',
        alertDelta: 1,
        units: [{ name: '殲滅騎士', icon: '⚔️', hp: 999, atk: 999, def: 0, spd: 99 }]
      };
      Game.state.stage = 1; Game.state.gold = 200; Game.state.food = 40; Game.state.phase = 'formation';
      App.render();
    });
    await page.evaluate(() => { BattleScene.speed = 4; });
    await page.click('[data-action="deploy"]');
    await page.evaluate(() => { try { BattleScene.skip(); } catch (e) {} });
    await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 20000 });
    // 撤退の提案が出ていれば「続ける」（既定）が押されて全滅まで進む（autoDismissMormo が primary を押す）
    await page.waitForTimeout(300);
    await page.click('[data-action="afterbattle"]');
    await page.waitForTimeout(150);
    const real = await page.evaluate(() => ({
      phase: Game.state.phase, wiped: !!(Game.state.lastBattle || {}).wiped,
      roster: Game.state.roster.map(m => m.name)
    }));
    ok(real.phase === 'result', `本物の全滅は phase === "result"（${real.phase}）`);
    ok(real.wiped === true, `lastBattle.wiped === true（${real.wiped}）`);
    ok(!real.roster.includes('捨て駒甲') && !real.roster.includes('捨て駒乙'), '出撃した者は名簿から消える');
    await page.click('[data-action="afterresult"]');
    await page.waitForTimeout(150);
    const realNext = await page.evaluate(() => Game.state.phase);
    ok(realNext === 'recruit', `本物の全滅から面接へ進む（${realNext}）`);
  } catch (e) {
    realWipeOk = false;
    console.log('  ✗ 本物の全滅が期待どおり動かなかった（run.js 実装待ちの可能性）: ' + e.message);
    process.exitCode = 1;
  }

  ok(errs.length === 0, 'JSエラーなし' + (errs.length ? ': ' + errs.join(', ') : ''));
  await b.close();
  console.log('wipe: 全滅は敗北であって終了ではない、を確認' + (realWipeOk ? '' : '（本物の全滅は失敗）'));
})().catch(e => { console.error('✗', e.message); process.exit(1); });
