// 宴：余剰食料の使い道。備蓄上限・大食漢の倍化・アンデッド軍団では開けないことを見る。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await autoDismissMormo(page);
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.click('[data-action="new"]');
    // 履歴書の形はゲーム側のテンプレから作る。テスト側でmonsterの形を仮定しない。
    await page.evaluate(() => {
      window.mk = (id, uid) => {
        const t = MONSTER_TEMPLATES.find(row => row.id === id);
        return { uid, tplId: id, name: id + uid, race: t.race, job: '', hp: t.base.hp, atk: t.base.atk,
          def: t.base.def, spd: t.base.spd, salary: t.salary[0], loyalty: 50, merit: 0,
          rankId: 'soldier', traits: [], tags: (t.tags || []).slice() };
      };
    });

    // 1) 食う者がいれば宴は成立し、備蓄が足りなければ開けない
    const poor = await page.evaluate(() => {
      Game.state.roster = [mk('orc', 1)];
      Game.state.activeUids = [1];
      Game.state.food = 0;
      const q = Game.feastQuote();
      return { possible: q.possible, affordable: q.affordable, held: !!Game.holdFeast() };
    });
    assert.equal(poor.possible, true, '食う者がいれば宴は成立する');
    assert.equal(poor.affordable, false, '備蓄0では開けない');
    assert.equal(poor.held, false, '開けない宴は実行されない');

    // 2) 備蓄が十分なら開けて、忠誠が上がり、食料が減る
    const rich = await page.evaluate(() => {
      Game.state.food = 50;
      const before = { food: Game.state.food, loyalty: Game.state.roster[0].loyalty };
      const q = Game.feastQuote();
      const held = Game.holdFeast();
      return { before, cost: q.cost, gain: q.loyaltyGain, held,
        food: Game.state.food, loyalty: Game.state.roster[0].loyalty,
        twice: Game.holdFeast() };
    });
    assert.ok(rich.held, '余剰があれば宴は開ける');
    assert.equal(rich.food, rich.before.food - rich.cost, '宴のぶんだけ食料が減る');
    assert.equal(rich.loyalty, rich.before.loyalty + rich.gain, '食う者の忠誠が上がる');
    assert.equal(rich.twice, null, '同じ作戦で二度は開けない');

    // 3) 大食漢は食う量も効果も倍
    const big = await page.evaluate(() => {
      Game.state.feastPending = null;
      const plain = Game.feastQuote();
      Game.state.roster[0].traits = ['big_eater'];
      const eater = Game.feastQuote();
      Game.state.roster[0].traits = ['big_eater', 'demon_cook'];
      const cooked = Game.feastQuote();
      return { plain, eater, cooked };
    });
    assert.ok(big.eater.cost > big.plain.cost, '大食漢がいると食う量が増える');
    assert.ok(big.eater.dmgBonus > big.plain.dmgBonus, '大食漢がいると効果も上がる');
    assert.ok(big.cooked.cost < big.eater.cost, '魔界料理人がいると必要な食料が減る');

    // 4) アンデッドだけの軍団では宴が成立しない
    const undead = await page.evaluate(() => {
      Game.state.roster = [mk('skeleton', 2)];
      Game.state.activeUids = [2];
      Game.state.feastPending = null;
      return Game.feastQuote().possible;
    });
    assert.equal(undead, false, '食事不要の軍団に宴はない');

    // 5) 備蓄上限を超えた食料は傷む
    const spoil = await page.evaluate(() => {
      Game.state.roster = [mk('goblin', 3)];
      Game.state.activeUids = [3];
      const cap = Game.foodCapacity();
      Game.state.food = cap + 7;
      const notes = [];
      const over = Game.spoilFood(notes);
      return { cap, over, food: Game.state.food, note: notes[0] || '' };
    });
    assert.equal(spoil.over, 7, '上限を超えたぶんだけ傷む');
    assert.equal(spoil.food, spoil.cap, '備蓄は上限で止まる');
    assert.ok(spoil.note.includes('宴'), '腐敗ログが宴へ誘導する');

    console.log('✓ 宴：成立条件・大食漢と料理人の倍率・アンデッド不成立・備蓄上限の腐敗');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
