// 敵将・中ボスの戦闘絵（docs/SPEC_CAPTAIN_ART_2026-09-18.md）。
// 敵将は tplId を持たず、BattleScene.artId が icon の対応表を引いていたので、
// 表に無い者（迷宮の主 🐂・塔の主 🗼・審問官 📜 など）は絵文字のまま戦場に立っていた。
//   node tools/browser-tests/captain-art.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await autoDismissMormo(page);
    await page.goto('file://' + process.env.GAME + '/index.html');
    await page.click('[data-action="new"]');
    await page.locator('[data-action="hire"]:not([disabled])').first().click();
    await enterMissionPhase(page);

    // 迷宮の主を敵の先頭に立てて出撃する（Captains.attach は本番と同じ道）
    await page.evaluate(() => {
      Game.state.roster = [{ uid: 971, tplId: 'orc', name: 'オーク', race: 'オーク', job: '', hp: 400, atk: 20, def: 18,
        spd: 9, salary: 2, loyalty: 70, traits: [], skills: [], tags: [], quote: '', unpaid: false, injured: 0, spirit: 3 }];
      Game.state.activeUids = [971];
      Game.state.phase = 'formation';
      App.render();
      BattleScene.speed = 4;
    });

    // 13人ぶん、絵の割り当てが artId まで通ることを見る（描画の入口と同じ関数）
    const assigned = await page.evaluate(() => {
      const out = [];
      for (const id of Captains.ids()) {
        const [unit] = Captains.attach([], id, { captains: {} }, 1);
        out.push({ id, name: unit.name, icon: unit.icon, tplId: unit.tplId,
          art: BattleScene.artId(unit), sprites: !!BattleScene.BATTLE_SPRITES[BattleScene.artId(unit)] });
      }
      return out;
    });
    assert.equal(assigned.length, 13, '敵将は13人');
    const emojiStill = assigned.filter(c => !c.sprites);
    assert.deepEqual(emojiStill.map(c => `${c.name}(${c.icon})`), [],
      '絵文字のまま戦場に立つ敵将がいない');
    for (const c of assigned) assert.equal(c.art, c.tplId, `${c.name} の絵は look どおり（${c.art}）`);
    const lord = assigned.find(c => c.id === 'labyrinth_lord');
    assert.equal(lord.art, 'minotaur', `迷宮の主はミノタウロスの絵（${lord.art}）`);

    // 実際に戦場へ立てて、絵の img が出る（絵文字の span ではない）ことを見る
    const drawn = await page.evaluate(async () => {
      const [unit] = Captains.attach([], 'labyrinth_lord', { captains: {} }, 1);
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = BattleScene.portraitHtml(unit);
      const img = host.querySelector('img.bu-sprite-img');
      const out = { tpl: img ? img.dataset.tplId : null, src: img ? img.getAttribute('src') : null,
        text: host.textContent.trim() };
      host.remove();
      return out;
    });
    assert.equal(drawn.tpl, 'minotaur', `札にミノタウロスの絵が入る（${drawn.tpl}）`);
    assert.ok(/minotaur\/idle\.webp$/.test(drawn.src || ''), `絵の src（${drawn.src}）`);
    assert.ok(!/🐂/.test(drawn.text), `絵文字が残っていない（${drawn.text}）`);

    assert.deepEqual(errors, []);
    console.log(`✓ captain-art: 敵将13人すべてに戦闘絵（迷宮の主=${lord.art}／`
      + `塔の主=${assigned.find(c => c.id === 'tower_lord').art}／`
      + `審問官=${assigned.find(c => c.id === 'inquisitor').art}）`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
