// 食料まわり（備蓄上限の腐敗・飢餓の出口）。
// 宴は 2026-09-16 に撤去（docs/TICKET_REMOVE_DEAD_2026-09-16.md §1-1）。
// そのとき同居していた腐敗と飢餓適応の検証だけをここへ残した（旧 feast.js）。
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

    // 1) 備蓄上限を超えた食料は傷む
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
    assert.ok(spoil.note.length > 0, '傷んだことが一行残る');

    // 2) 飢餓は3戦で「飢餓適応」へ抜ける。損失で終わらせない出口。
    const hunger = await page.evaluate(() => {
      Game.state.roster = [mk('goblin', 4), mk('skeleton', 5)];
      Game.state.activeUids = [4];
      Game.state.hungerStreak = 0;
      const steps = [];
      for (let i = 0; i < 3; i++) {
        const notes = [];
        const adapted = Game.advanceHunger(true, notes);
        steps.push({ streak: Game.state.hungerStreak, adapted, note: notes[0] || '' });
      }
      const gob = Game.state.roster.find(m => m.uid === 4);
      const skel = Game.state.roster.find(m => m.uid === 5);
      const before = MONSTER_TEMPLATES.find(t => t.id === 'goblin').base.hp;
      // 不足が途切れれば連鎖はリセットされる
      Game.state.hungerStreak = 2;
      Game.advanceHunger(false, []);
      return { steps, gobTraits: gob.traits, gobHp: gob.hp, baseHp: before,
        gobAppetite: Aptitude.of(gob).appetite,
        skelTraits: skel.traits, reset: Game.state.hungerStreak };
    });
    assert.deepEqual(hunger.steps.map(s => s.streak), [1, 2, 0], '3戦目で適応し、連鎖はリセットされる');
    assert.equal(hunger.steps[0].adapted.length, 0, '1戦目ではまだ適応しない');
    assert.ok(hunger.steps[0].note.includes('あと2戦'), '残り戦数が読める');
    assert.ok(hunger.steps[2].adapted.length > 0, '3戦目で飢餓適応が起きる');
    assert.ok(hunger.gobTraits.includes('starved'), '食う者が飢餓適応する');
    assert.equal(hunger.gobAppetite, 0, '飢餓適応すると食料を消費しない');
    assert.ok(hunger.gobHp < hunger.baseHp, '飢餓適応の代償で最大HPが減る');
    assert.ok(!hunger.skelTraits.includes('starved'), '元から食わない者は適応しない');
    assert.equal(hunger.reset, 0, '不足が途切れれば連鎖はリセットされる');

    console.log('✓ 食料：備蓄上限の腐敗／飢餓3戦→飢餓適応');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
