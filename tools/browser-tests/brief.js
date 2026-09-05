// 指名求人：中盤解禁・費用が倍々・条件に寄るが確定ではない・面接をまたいで持ち越さない。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    autoDismissMormo(page);
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.click('[data-action="new"]');

    // 1) 序盤は解禁されていない（まず何が出るか見る段階を潰さない）
    const early = await page.evaluate(() => {
      Game.state.conquest = 0; Game.state.turn = 1;
      return { level: Game.campaignLevel(), unlocked: Game.briefUnlocked(),
        shown: !!document.querySelector('.brief-panel') };
    });
    assert.equal(early.unlocked, false, '序盤は指名求人が使えない');
    assert.equal(early.shown, false, '序盤はパネルも出ない');

    // 2) 中盤で解禁され、パネルが出る
    const mid = await page.evaluate(() => {
      Game.state.conquest = 3; Game.state.gold = 200;
      Game.state.phase = 'recruit';
      UI.recruit();
      return { level: Game.campaignLevel(), unlocked: Game.briefUnlocked(),
        buttons: document.querySelectorAll('.brief-option').length };
    });
    assert.ok(mid.unlocked, '中盤で解禁される');
    assert.equal(mid.buttons, 6, '募集要項が6種類でる');

    // 3) 費用は出すたび倍
    const cost = await page.evaluate(() => {
      Game.state.briefsThisPhase = 0;
      const seq = [];
      for (let i = 0; i < 3; i++) { seq.push(Game.briefCost()); Game.state.briefsThisPhase++; }
      Game.state.briefsThisPhase = 0;
      return seq;
    });
    assert.deepEqual(cost, [6, 12, 24], '求人費が倍々に増える');

    // 4) 指名すると条件に合う者が来やすい。ただし確定ではない
    const hit = await page.evaluate(() => {
      let matched = 0, total = 0, offBrief = 0;
      const brief = RECRUIT_BRIEFS.find(b => b.id === 'undead');
      for (let i = 0; i < 60; i++) {
        Game.state.gold = 999;
        Game.state.briefsThisPhase = 0;
        Game.postBrief('undead');
        for (const m of Game.state.applicants) {
          total++;
          const t = MONSTER_TEMPLATES.find(x => x.id === m.tplId);
          if (brief.match(t)) matched++; else offBrief++;
        }
      }
      return { rate: matched / total, offBrief };
    });
    assert.ok(hit.rate > 0.5, `指名した条件に寄る（実測 ${(hit.rate * 100).toFixed(0)}%）`);
    assert.ok(hit.offBrief > 0, '確定ではない。条件外も来る');

    // 5) 金貨が減り、足りなければ出せない
    const pay = await page.evaluate(() => {
      Game.state.gold = 6; Game.state.briefsThisPhase = 0;
      const ok = Game.postBrief('caster');
      const after = Game.state.gold;
      const again = Game.canPostBrief('caster');
      return { ok, after, again };
    });
    assert.equal(pay.ok, true, '払えれば出せる');
    assert.equal(pay.after, 0, '求人費を払う');
    assert.equal(pay.again, false, '払えなければ出せない');

    // 6) 次の面接へは持ち越さない
    const carry = await page.evaluate(() => {
      Game.state.gold = 99; Game.state.briefsThisPhase = 0;
      Game.postBrief('caster');
      const during = Game.state.briefId;
      Game.nextRecruit();
      return { during, after: Game.state.briefId, cost: Game.briefCost() };
    });
    assert.equal(carry.during, 'caster', '面接中は指名が残る');
    assert.equal(carry.after, null, '次の面接には持ち越さない');
    assert.equal(carry.cost, 6, '求人費も戻る');

    console.log('✓ 指名求人：中盤解禁・6要項・倍々の求人費・条件に寄るが確定でない・持ち越さない');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
