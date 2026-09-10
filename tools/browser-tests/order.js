// 号令：戦況が動いたラウンドの終わりに戦闘が止まり、名指しで技を命じるか「任せる」かを聞かれる。
// 名指しなら、そこから先だけが計算し直された展開になり、本人が真っ先に動いて技を出す。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 号令の提案だけは自動で送らせない。「戦闘を再開」の一言と撤退の提案は既定で送る。
async function autoDismissAsidesExceptOrder(page) {
  await page.addInitScript(() => {
    const patch = () => {
      if (typeof MormoScene === "undefined" || !MormoScene.show) return setTimeout(patch, 5);
      const show = MormoScene.show.bind(MormoScene);
      window.__reports = [];
      MormoScene.show = function (o) { window.__reports.push({ text: o.text }); show(o); this.close(); };
      const aside = MormoScene.aside.bind(MormoScene);
      window.__asides = [];
      MormoScene.aside = function (o) {
        const labels = (o.choices || []).map(c => c.label);
        window.__asides.push({ text: o.text, labels });
        const box = aside(o);
        const isOrder = labels.some(l => /任せる/.test(l));
        if (!isOrder) queueMicrotask(() => box && (box.querySelector('.mormo-aside-continue')
          || box.querySelector('.mormo-aside-choice.primary'))?.click());
        return box;
      };
    };
    patch();
  });
}

// 怪力のオーガ一人。敵を毎ラウンド倒す（＝戦況が動く）ので、節目が来る。
const SETUP = () => {
  Game.state.roster = [
    { uid: 901, tplId: 'ogre', name: 'ガロ', race: 'オーガ', job: '', hp: 260, atk: 26, def: 6, spd: 3,
      salary: 2, loyalty: 70, traits: ['brute'], tags: [], quote: '', unpaid: false, injured: 0 }
  ];
  Game.state.activeUids = [901];
  Game.state.stage = 1; Game.state.gold = 80; Game.state.food = 40; Game.state.phase = 'formation';
  App.render();
};

async function deployUntilOffer(page, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await page.evaluate(SETUP);
    await page.evaluate(() => { BattleScene.speed = 4; });
    await page.click('[data-action="deploy"]');
    const found = await page.waitForFunction(() =>
      [...document.querySelectorAll('.mormo-aside-choice')].some(el => /任せる/.test(el.textContent)) || BattleScene.finished,
      null, { timeout: 30000 }).then(() => page.evaluate(() =>
        [...document.querySelectorAll('.mormo-aside-choice')].some(el => /任せる/.test(el.textContent))));
    if (found) return true;
    // 節目が来ないまま終わった（敵が1体だった等）。次の戦闘を引き直す。
    await page.evaluate(() => { Game.newRun(); });
    await enterMissionPhase(page);
  }
  return false;
}

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 1128, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissAsidesExceptOrder(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 節目で止まり、名指しと「任せる」が出る');
  ok(await deployUntilOffer(page), '号令の提案が出る戦闘を引けた');
  const offer = await page.evaluate(() => ({
    text: document.querySelector('.mormo-aside-bubble p').textContent,
    note: (document.querySelector('.mormo-aside-note') || {}).textContent || '',
    labels: [...document.querySelectorAll('.mormo-aside-choice')].map(el => el.textContent.trim()),
    focused: document.activeElement && document.activeElement.textContent.trim(),
    awaiting: BattleScene.mormoAwaiting, paused: BattleScene.paused,
    pending: !!Game.state.pendingBattle, phase: Game.state.phase
  }));
  ok(/号令を/.test(offer.text) && /ガロ/.test(offer.text), `モルモが号令を促し、名前を言う（${offer.text}）`);
  ok(offer.labels.length === 2 && /ガロ/.test(offer.labels[0]) && /怪力を出せ/.test(offer.labels[0]), `名指しのボタン（${offer.labels[0]}）`);
  ok(/任せる/.test(offer.labels[1]) && /任せる/.test(offer.focused || ''), '「任せる」が既定（フォーカス）');
  ok(/息が上がって/.test(offer.note), '代償が添えてある');
  ok(offer.awaiting && offer.paused, '戦闘は止まっている');
  ok(offer.pending && offer.phase === 'battle', '決着は保留されている');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/order-offer.png' });

  console.log('▼ 「最後まで飛ばす」は答える前は進まない');
  await page.evaluate(() => BattleScene.skip());
  await page.waitForTimeout(200);
  ok(await page.locator('.mormo-aside-choices').count() === 1, '答える前の skip() では提案が消えない');
  ok(await page.evaluate(() => !BattleScene.finished), 'skip() でも戦闘は終わらない');

  console.log('▼ 名指しすると、本人が真っ先に動いて技を出し、次の手番は息切れ');
  await page.evaluate(() => { window.__before = BattleScene.timeline.length; });
  await page.locator('.mormo-aside-choice').first().click();
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  const after = await page.evaluate(() => ({
    log: document.getElementById('log').innerText,
    orderCount: Game.state.orderCount, pending: !!Game.state.pendingBattle, phase: Game.state.phase,
    execs: BattleScene.timeline.filter(e => e.type === 'order_exec').length,
    offers: BattleScene.timeline.filter(e => e.type === 'order_offer').length,
    answered: (BattleScene.timeline.find(e => e.type === 'order_offer') || {}).answered
  }));
  ok(/魔王「ガロ、怪力を出せ！」/.test(after.log), '戦況記録に魔王の号令が残る');
  ok(after.execs === 1 && after.answered === 'p0', '差し替えたタイムラインに order_exec が1回、提案に答えが刻まれる');
  ok(/息が上がっている/.test(after.log) || /敵軍を全滅/.test(after.log), '息切れの手番が出る（その前に勝てば出ない）');
  ok(after.orderCount === 1, `号令の回数が数えられる（${after.orderCount}）`);
  ok(!after.pending && ['result', 'defeat', 'clear', 'gameover'].includes(after.phase), `決着した（${after.phase}）`);

  console.log('▼ 「任せる」なら今までどおりの展開のまま');
  await page.evaluate(() => { Game.newRun(); });
  await enterMissionPhase(page);
  ok(await deployUntilOffer(page), 'もう一度、提案が出る戦闘を引けた');
  await page.locator('.mormo-aside-choice.primary').click();
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  const left = await page.evaluate(() => ({
    execs: BattleScene.timeline.filter(e => e.type === 'order_exec').length,
    orderCount: Game.state.orderCount, pending: !!Game.state.pendingBattle
  }));
  ok(left.execs === 0 && left.orderCount === 0, '任せたら order_exec は無く、回数も増えない');
  ok(!left.pending, '保留は解消されている');

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})();
