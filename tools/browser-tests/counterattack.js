// 王国の反撃（コミットC・画面側）：仕様 SPEC_COUNTERATTACK_2026-09-10 5.3。
// 予告のモルモ → 作戦会議が一択 → 防衛戦の結果画面（守った／荒らされた）→ HUDのゲージ。
// 勇者の防衛戦で final-battle の演出が出ること。
// run.js 側の実装が未着（Game.checkCounterattack / Game.ransack / Game.isDefenseBattle）でも
// 画面側の検証は続けられるよう、それらは typeof で存在確認してからだけ使う。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const skip = (m) => console.log('  ・skip: ' + m + '（run.js 待ち）');

const DEFEND_CARD = (overrides) => Object.assign({
  stage: 10,
  missionKind: 'defend',
  missionTitle: '城を守る',
  strategyLabel: '討伐隊を迎え撃つ',
  strategyHint: '王国の討伐隊が城へ向かっている。防衛の報酬はない。',
  description: '魔王城へ迫る討伐隊を迎え撃つ。',
  difficulty: '高',
  army: '聖騎士団討伐隊',
  region: '魔王城',
  reward: 0,
  alertDelta: 0,
  conquestDelta: 0,
  loyaltyDelta: 0,
  foodReward: 0,
  materialReward: 0,
  armyPressure: 0,
  baseStage: 5,
  formationId: 'standard',
  formationName: '基本隊列',
  formationHint: '',
  units: []
}, overrides || {});

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 1128, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 予告のモルモ（討伐隊）');
  await page.evaluate(() => {
    window.__reports = [];
    const show = MormoScene.show.bind(MormoScene);
    MormoScene.show = function (o) { window.__reports.push({ text: o.text }); show(o); this.close(); };
    Game.state.counterattack = { pending: true, kind: 'punitive', armyName: '聖騎士団討伐隊' };
    Game.state.lastBattle = {
      victory: true, army: '辺境の自警団', region: '辺境', reward: 10, lootGold: 0,
      synergies: [], incidents: [], notes: [], logLength: 0, contribution: [], nearMiss: null
    };
    Game.state.phase = 'result';
    Game.state.lastDepartmentReport = {};
    App.battleReport();
  });
  let reports = await page.evaluate(() => window.__reports);
  ok(reports.length === 1, `報告が1件出た（${reports.length}）`);
  ok(/王国が討伐隊を出しました/.test(reports[0].text), `討伐隊の予告文言 (${reports[0].text})`);
  ok(!/撃退しました/.test(reports[0].text) || /王国が討伐隊/.test(reports[0].text), '「撃退しました」の既定文と共存でも予告が付く');

  console.log('▼ 予告のモルモ（勇者）');
  await page.evaluate(() => {
    window.__reports = [];
    Game.state.counterattack = { pending: true, kind: 'hero', armyName: '勇者アレン一行' };
    App.battleReport();
  });
  reports = await page.evaluate(() => window.__reports);
  ok(reports.length === 1 && /勇者です。こちらへ来マス/.test(reports[0].text), `勇者の予告文言 (${reports[0] && reports[0].text})`);

  console.log('▼ 作戦会議が defend 一択のときの見出しとボタン');
  await page.evaluate((card) => {
    Game.state.counterattack = { pending: true, kind: 'punitive', armyName: card.army };
    Game.state.missionOffers = [card];
    Game.state.phase = 'mission';
    App.render();
  }, DEFEND_CARD());
  let mission = await page.evaluate(() => ({
    heading: (document.querySelector('.mission-briefing h2') || {}).textContent,
    hasBack: !!document.querySelector('[data-action="backrecruit"]'),
    scene: UI.root.dataset.scene
  }));
  ok(/聖騎士団討伐隊が城へ向かっている/.test(mission.heading || ''), `討伐隊の見出し (${mission.heading})`);
  ok(!mission.hasBack, '一択時は「面接・軍団確認へ戻る」ボタンを出さない');
  ok(mission.scene === 'mission', `scene は mission（第2引数で明示） (${mission.scene})`);

  console.log('▼ 作戦会議が勇者の防衛戦のときの見出し');
  await page.evaluate((card) => {
    Game.state.missionOffers = [card];
    App.render();
  }, DEFEND_CARD({ army: '勇者アレン一行', baseStage: 8 }));
  mission = await page.evaluate(() => ({
    heading: (document.querySelector('.mission-briefing h2') || {}).textContent
  }));
  ok(/勇者アレン一行が城へ向かっている/.test(mission.heading || ''), `勇者の見出し (${mission.heading})`);

  console.log('▼ 結果画面：城を守った');
  await page.evaluate(() => {
    Game.state.lastBattle = {
      victory: true, defense: true, defended: true,
      army: '聖騎士団討伐隊', region: '魔王城', reward: 0, lootGold: 0,
      synergies: [], incidents: [], notes: ['建材+2', '食料+2'], logLength: 0,
      contribution: [], nearMiss: null
    };
    Game.state.phase = 'result';
    App.render();
  });
  let result = await page.evaluate(() => ({
    heading: (document.querySelector('.banner h2') || {}).textContent,
    body: document.querySelector('.banner').innerText
  }));
  ok(result.heading === '城を守った', `見出しが「城を守った」（${result.heading}）`);
  ok(/建材\+2/.test(result.body) && /食料\+2/.test(result.body), `押収した建材・食料に触れる (${result.body.slice(0, 60)})`);

  console.log('▼ 結果画面：城が荒らされた');
  await page.evaluate(() => {
    Game.state.lastBattle = {
      victory: false, defense: true, ransacked: {
        facilityBefore: 2, facilityAfter: 1, foodBefore: 10, foodAfter: 5, relic: '古の指輪'
      },
      army: '聖騎士団討伐隊', region: '魔王城', reward: 0, lootGold: 0,
      synergies: [], incidents: [], notes: [], logLength: 0, contribution: [], nearMiss: null
    };
    App.render();
  });
  result = await page.evaluate(() => ({
    heading: (document.querySelector('.banner h2') || {}).textContent,
    body: document.querySelector('.banner').innerText
  }));
  ok(result.heading === '城が荒らされた', `見出しが「城が荒らされた」（${result.heading}）`);
  ok(/2→1/.test(result.body), `施設Lv低下に触れる (${result.body.slice(0, 100)})`);
  ok(/10→5/.test(result.body), `食料低下に触れる`);
  ok(/古の指輪を奪われた/.test(result.body), `遺物の喪失に触れる`);

  console.log('▼ 結果画面：荒らされた各値が無い場合はその行を出さない');
  await page.evaluate(() => {
    Game.state.lastBattle = {
      victory: false, defense: true, ransacked: {},
      army: '聖騎士団討伐隊', region: '魔王城', reward: 0, lootGold: 0,
      synergies: [], incidents: [], notes: [], logLength: 0, contribution: [], nearMiss: null
    };
    App.render();
  });
  result = await page.evaluate(() => document.querySelector('.banner').innerText);
  ok(!/undefined/.test(result), `値が無くても undefined が出ない (${result.slice(0, 60)})`);

  console.log('▼ 城陥落のゲームオーバー画面');
  await page.evaluate(() => {
    App.render.call ? null : null;
    UI.gameover({
      cleared: false, cause: '城陥落', gen: 1, reignYears: 1, battlesWon: 3,
      conquest: 4, alert: 0, maxPower: 10, finalRoster: [], mainRace: 'ゴブリン', region: '魔王城'
    }, []);
  });
  let gameover = await page.evaluate(() => document.querySelector('.banner').innerText);
  ok(/城陥落/.test(gameover), `「城陥落」の一行がある (${gameover.slice(0, 80)})`);

  console.log('▼ HUD の反撃ゲージ');
  await page.evaluate((card) => {
    Game.state.counterattack = null;
    Game.state.alert = 3;
    Game.state.missionOffers = [];
    Game.state.phase = 'mission';
    App.render();
  });
  let hud = await page.evaluate(() => ({
    hasGauge: !!document.querySelector('.counterattack-gauge'),
    near: !!document.querySelector('.counterattack-gauge.near'),
    hasTag: !!document.querySelector('.counterattack-tag')
  }));
  ok(hud.hasGauge && !hud.near && !hud.hasTag, `警戒3/6でゲージ表示・赤くない・札は出ない (${JSON.stringify(hud)})`);
  ok(!/警戒度 <b>3<\/b>.*\d/.test(await page.evaluate(() => document.querySelector('.hud').innerHTML.match(/警戒度[^<]*<b>\d+<\/b>[^<]*/)[0])), '警戒度の数値のみ、ゲージには数字を出さない');

  await page.evaluate(() => { Game.state.alert = 5; App.render(); });
  hud = await page.evaluate(() => ({ near: !!document.querySelector('.counterattack-gauge.near') }));
  ok(hud.near, `警戒5/6（閾値-1）でゲージが赤くなる (${JSON.stringify(hud)})`);

  await page.evaluate(() => {
    Game.state.counterattack = { pending: true, kind: 'punitive', armyName: '聖騎士団討伐隊' };
    App.render();
  });
  hud = await page.evaluate(() => ({
    hasTag: !!document.querySelector('.counterattack-tag'),
    tagText: (document.querySelector('.counterattack-tag') || {}).textContent
  }));
  ok(hud.hasTag && /討伐隊が向かっている/.test(hud.tagText || ''), `予約済みは「討伐隊が向かっている」の札 (${hud.tagText})`);

  await page.evaluate(() => {
    Game.state.counterattack = { pending: true, kind: 'hero', armyName: '勇者アレン一行' };
    App.render();
  });
  hud = await page.evaluate(() => (document.querySelector('.counterattack-tag') || {}).textContent);
  ok(/勇者が向かっている/.test(hud || ''), `勇者の予約は「勇者が向かっている」の札 (${hud})`);

  console.log('▼ 勇者の防衛戦で final-battle の演出');
  const finalCheck = await page.evaluate(() => {
    const html = BattleScene.shell({ baseStage: 8 });
    return { isFinal: BattleScene.isFinalBattle, hasClass: /final-battle/.test(html) };
  });
  ok(finalCheck.isFinal && finalCheck.hasClass, `baseStage===8 だけで final-battle 判定 (${JSON.stringify(finalCheck)})`);
  const notFinal = await page.evaluate(() => {
    const html = BattleScene.shell({ baseStage: 5, missionKind: 'defend' });
    return { isFinal: BattleScene.isFinalBattle, hasClass: /final-battle/.test(html) };
  });
  ok(!notFinal.isFinal && !notFinal.hasClass, `baseStage!==8 は最終戦演出なし (${JSON.stringify(notFinal)})`);

  console.log('▼ run.js 側の関数（存在すれば軽く触る。無ければ run.js 待ちとして報告）');
  const runFns = await page.evaluate(() => ({
    checkCounterattack: typeof Game.checkCounterattack,
    ransack: typeof Game.ransack,
    isDefenseBattle: typeof Game.isDefenseBattle
  }));
  if (runFns.checkCounterattack === 'function') {
    ok(true, 'Game.checkCounterattack が存在する');
  } else skip('Game.checkCounterattack 未実装');
  if (runFns.ransack === 'function') {
    ok(true, 'Game.ransack が存在する');
  } else skip('Game.ransack 未実装');
  if (runFns.isDefenseBattle === 'function') {
    ok(true, 'Game.isDefenseBattle が存在する');
  } else skip('Game.isDefenseBattle 未実装');

  ok(errs.length === 0, `pageerror なし (${errs.join(' / ')})`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/counterattack.png', fullPage: true });
  await b.close();
})();
