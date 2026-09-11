// 撤退の判断：味方が初めて倒れたところで戦闘が止まり、「続ける／退く」を聞かれる。
// 退けば、そこから先の攻撃は描画されない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 撤退の提案だけは自動で送らせない。二択が出ること自体を見たいので、
// 「戦闘を再開」ボタンの一言（遅刻・大食漢）だけ即送りにする。
async function autoDismissAsidesExceptRetreat(page) {
  await page.addInitScript(() => {
    const patch = () => {
      if (typeof MormoScene === "undefined" || !MormoScene.show) return setTimeout(patch, 5);
      const show = MormoScene.show.bind(MormoScene);
      window.__reports = [];
      MormoScene.show = function (o) {
        window.__reports.push({ text: o.text, kicker: o.kicker, expression: o.expression });
        show(o); this.close();
      };
      const aside = MormoScene.aside.bind(MormoScene);
      window.__asides = [];
      MormoScene.aside = function (o) {
        window.__asides.push({ text: o.text, choices: (o.choices || []).map(c => c.label) });
        const box = aside(o);
        // 二択（撤退の提案）は人が答えるまで置いておく
        if (!(o.choices || []).length) queueMicrotask(() => box && box.querySelector('.mormo-aside-continue')?.click());
        return box;
      };
    };
    patch();
  });
}

// 「紙の前衛＋頑丈な後衛」。前衛が倒れ、後衛が立っている＝提案の条件を満たす。
// 大食漢を後衛に置いてあるのは、同じラウンドに別の一言が止めていても
// 提案が字幕へ落ちないことを見るため（仕様6節の落とし穴）。
const SETUP = () => {
  Game.state.roster = [
    { uid: 901, tplId: 'goblin', name: '捨て駒A', race: 'ゴブリン', job: '', hp: 1, atk: 1, def: 0, spd: 1,
      salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false, injured: 0 },
    { uid: 902, tplId: 'ogre', name: '生存者', race: 'オーガ', job: '', hp: 400, atk: 12, def: 20, spd: 3,
      salary: 2, loyalty: 70, traits: ['big_eater'], tags: [], quote: '', unpaid: false, injured: 0 }
  ];
  Game.state.activeUids = Game.state.roster.map(m => m.uid);
  Game.state.stage = 1; Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
  App.render();
};

// 描画された attack を数える。退いたあとに増えなければ「先の戦闘は起きていない」
const COUNT_ATTACKS = () => {
  window.__drawn = [];
  const render = BattleScene.render.bind(BattleScene);
  BattleScene.render = function (ev) { window.__drawn.push(ev.type); return render(ev); };
};


// 指示待ちのたびに「全員たたかう」で進め、「退く」が出るまで待つ（ラウンド1では誰も倒れていない）
async function advanceUntilRetreat(page) {
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => !document.getElementById('command-panel').hidden || BattleScene.finished, null, { timeout: 30000 });
    if (await page.evaluate(() => BattleScene.finished)) return false;
    if (await page.locator('[data-cmdall="retreat"]').count()) return true;
    if (process.env.DEBUG_RETREAT) console.log('    round', await page.evaluate(() => (BattleScene.manual && BattleScene.manual.prompt || {}).round), 'rows', await page.locator('.cmd-row').count());
    await page.evaluate(() => document.querySelector('[data-cmdall="attack"]').click());
  }
  return false;
}

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 1128, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissAsidesExceptRetreat(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 倒れた者が出ると、指示パネルに「退く」が出て戦闘が止まる（コマンドバトル）');
  await page.evaluate(SETUP);
  await page.evaluate(COUNT_ATTACKS);
  await page.evaluate(() => { BattleScene.speed = 4; });
  await page.click('[data-action="deploy"]');
  // ラウンド1で捨て駒Aが倒れ、ラウンド2の指示待ちで「退く」が出る
  ok(await advanceUntilRetreat(page), '「退く」が出るところまで進めた');
  const offer = await page.evaluate(() => ({
    label: document.querySelector('[data-cmdall="retreat"]').textContent,
    paused: BattleScene.paused, panelShown: !document.getElementById('command-panel').hidden,
    rows: BattleScene.manual.prompt.allies.length,
    attacks: window.__drawn.filter(t => t === 'attack').length
  }));
  ok(/捨て駒A/.test(offer.label), `退くボタンに倒れた者の名前（${offer.label}）`);
  ok(/担いで/.test(offer.label), '担いで帰ることが添えてある');
  ok(offer.paused && offer.panelShown, '戦闘は指示待ちで止まっている');
  ok(offer.rows === 1, `立っている者だけが指示の対象（${offer.rows}人）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/retreat-offer.png' });

  console.log('▼ 「全員たたかう」で続ければ今までどおり最後まで進む');
  await page.evaluate(() => document.querySelector('[data-cmdall="attack"]').click());
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  const cont = await page.evaluate(() => ({
    phase: Game.state.phase, retreated: !!(Game.state.lastBattle || {}).retreated,
    pending: !!Game.state.pendingBattle,
    roster: Game.state.roster.map(m => m.name)
  }));
  ok(['result', 'defeat', 'clear', 'gameover'].includes(cont.phase), `続ければ今までどおり決着する（${cont.phase}）`);
  ok(!cont.retreated, '続けた戦闘に撤退の印は付かない');
  ok(!cont.pending, '保留は解消されている');
  ok(!cont.roster.includes('捨て駒A'), '続ければ倒れたまま終わった者は戦死する（今までどおり）');

  console.log('▼ 「退く」を押すと、そこから先の攻撃は描画されない');
  await page.evaluate(() => { Game.newRun(); });
  await enterMissionPhase(page);
  await page.evaluate(SETUP);
  await page.evaluate(COUNT_ATTACKS);
  await page.evaluate(() => { BattleScene.speed = 4; });
  await page.click('[data-action="deploy"]');
  ok(await advanceUntilRetreat(page), '「退く」が出るところまで進めた');
  const atOffer = await page.evaluate(() => window.__drawn.filter(t => t === 'attack').length);
  await page.evaluate(() => document.querySelector('[data-cmdall="retreat"]').click());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 20000 });
  const afterRetreat = await page.evaluate(() => ({
    attacks: window.__drawn.filter(t => t === 'attack').length,
    phase: Game.state.phase, retreated: !!Game.state.lastBattle.retreated,
    injured: (Game.state.roster.find(m => m.uid === 901) || {}).injured,
    roster: Game.state.roster.map(m => m.name),
    log: document.getElementById('log').innerText,
    banner: !!document.querySelector('.scene-result.win, .scene-result.lose')
  }));
  ok(afterRetreat.attacks === atOffer, `退いたあとの攻撃は描画されない（${atOffer} → ${afterRetreat.attacks}）`);
  ok(afterRetreat.roster.includes('捨て駒A'), '倒れていた者を担いで帰った（戦死していない）');
  ok(afterRetreat.injured === 1, `担いで帰った者は負傷1（${afterRetreat.injured}）`);
  ok(afterRetreat.retreated && afterRetreat.phase === 'result', `撤退として決着した（${afterRetreat.phase}）`);
  ok(/退く|撤退/.test(afterRetreat.log), '戦況記録に退いた一行が残る');
  ok(!afterRetreat.banner, '勝敗の決着表示は出ない（勝っても負けてもいない）');

  console.log('▼ 撤退のあとのモルモ報告（勝ったと言わない）');
  await page.evaluate(() => { window.__reports = []; });
  await page.click('[data-action="afterbattle"]');
  await page.waitForTimeout(200);
  const said = await page.evaluate(() => window.__reports.map(r => r.text).join(' / '));
  ok(!/撃退しました/.test(said), `退いたのに「撃退しました」と言わない（${said.slice(0, 60)}）`);
  ok(/退きました/.test(said) && /報酬はありません/.test(said), '「退きました」「報酬はありません」と報告する');
  ok(/捨て駒A/.test(said), '担いで帰った者の名前が出る');

  console.log('▼ 結果画面');
  const report = await page.evaluate(() => ({
    heading: (document.querySelector('.banner h2') || {}).textContent,
    body: (document.querySelector('.banner div') || {}).textContent || '',
    scene: document.querySelector('[data-scene]') ? document.querySelector('[data-scene]').dataset.scene
      : (UI.root && UI.root.dataset.scene),
    badge: document.body.innerText.includes('🩹 負傷')
  }));
  ok(report.heading === '撤退', `結果画面の見出しが「撤退」（${report.heading}）`);
  ok(/捨て駒A/.test(report.body) && /報酬は無い/.test(report.body), `本文に生きている者と「報酬は無い」（${report.body}）`);
  ok(report.scene === 'report', `scene は report のまま（${report.scene}）`);
  ok(await page.locator('.retreat-injured').count() === 1, '結果画面に「負傷。次の戦いは出られない」の一行が出る');
  ok(/捨て駒A/.test(await page.locator('.retreat-injured').innerText()), 'その一行に負傷者の名前が入る');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/retreat-result.png', fullPage: true });

  console.log('▼ 編成画面：負傷者は出撃できない');
  await page.click('[data-action="afterresult"]'); await page.waitForTimeout(200);
  const formation = await page.evaluate(() => {
    const st = Game.state;
    if (st.phase !== 'formation') { st.phase = 'formation'; App.render(); }
    return {
      badge: document.body.innerText.includes('🩹 負傷'),
      canDeploy: Game.toggleDeploy(901),
      canAssign: Game.assignDepartment(901, 'combat')
    };
  });
  ok(formation.badge, '負傷バッジが札に出る');
  ok(formation.canDeploy === false && formation.canAssign === false, '負傷者は出撃隊へ入れられない');
  ok(await page.locator('.injured-note').count() === 1, '出撃隊の見出しの横に「負傷で1名出られない」が出る');

  console.log('▼ 出撃前のモルモ報告が負傷に触れる');
  const preDeploy = await page.evaluate(() => {
    window.__reports = [];
    App.formationReport();
    return window.__reports.map(r => r.text).join(' / ');
  });
  ok(/包帯の身/.test(preDeploy) && /捨て駒A/.test(preDeploy),
    `出撃前の報告で負傷者に触れる（${preDeploy.slice(0, 60)}）`);
  ok(!/生活部門/.test(preDeploy), '廃止した「生活部門」の言い方が残っていない');

  console.log('▼ 提案が出ない戦闘では止まらない（今までどおり）');
  await page.evaluate(() => { Game.newRun(); });
  await enterMissionPhase(page);
  await page.evaluate(() => {
    Game.state.roster = [{ uid: 903, tplId: 'ogre', name: '無双', race: 'オーガ', job: '', hp: 900, atk: 90, def: 40, spd: 20,
      salary: 2, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false, injured: 0 }];
    Game.state.activeUids = [903];
    Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation'; App.render();
  });
  await page.click('[data-action="deploy"]');
  await page.waitForFunction(() => !document.getElementById('command-panel').hidden || BattleScene.finished, null, { timeout: 20000 });
  ok(await page.locator('[data-cmdall="retreat"]').count() === 0, '誰も倒れていなければ「退く」は出ない');
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 20000 });
  ok(await page.evaluate(() => !Game.state.pendingBattle), '保留も残らない');

  if (errs.length) { process.exitCode = 1; console.log('  ✗ ページ例外: ' + errs.join(' / ')); }
  await b.close();
  console.log('retreat: 提案で止まる→続ける／退くで結末が分かれる、を確認');
})();
