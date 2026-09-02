// 編成画面で「いま何倍か」「何をすれば伸びるか」が読めること。
// クリック操作に依存せず、実画面を描いて中身を読む。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('[data-action="hire"]:not([disabled])').first();
    if (await btn.count()) await btn.click();
  }
  await enterMissionPhase(page);
  await page.locator('[data-action="missionpick"]').first().click();

  // 実プレイで起きた状況の再現: 脆さを嫌ってゴブリン3体＋オーガ2体にした編成
  const build = squad => page.evaluate(list => {
    const template = id => MONSTER_TEMPLATES.find(t => t.id === id);
    const make = (id, uid, name) => {
      const t = template(id);
      return { uid, tplId: id, name, race: t.race, job: '', hp: t.base.hp, atk: t.base.atk,
        def: t.base.def, spd: t.base.spd, salary: t.salary[0], loyalty: 70, merit: 0, rankId: 'soldier',
        traits: [...(t.fixedTraits || [t.fixedTrait]).filter(Boolean), 'pack'], tags: (t.tags || []).slice(),
        quote: '', unpaid: false, department: 'combat' };
    };
    Game.state.roster = list.map((id, i) => make(id, i + 1, id + (i + 1)));
    Game.state.activeUids = Game.state.roster.map(m => m.uid);
    App.render();
    return document.querySelector('.panel .syn-list') ? document.body.innerText : document.body.innerText;
  }, squad);

  const mixed = await build(['goblin', 'goblin', 'goblin', 'ogre', 'ogre']);
  if (!mixed.includes('ゴブリン軍団')) errors.push('発動中のシナジー名が出ない');
  if (!mixed.includes('×1.15')) errors.push('いまの効果量（×1.15）が読めない: 混成3体');
  if (!/オーガを.*ゴブリン.*替える/.test(mixed.replace(/\n/g, ' '))) {
    errors.push('枠が埋まっているのに入れ替えの案内が出ない');
  }
  if (!mixed.includes('×1.30')) errors.push('入れ替え後の倍率が読めない');

  const pure = await build(['goblin', 'goblin', 'goblin', 'goblin', 'goblin']);
  if (!pure.includes('×1.45')) errors.push('純ゴブリン5体の倍率（×1.45）が読めない');
  if (/替えると|あと1体で/.test(pure.replace(/\n/g, ' ').split('組み合わせ候補')[0])) {
    errors.push('これ以上伸びない編成に伸ばし方を出している');
  }

  // 編成で決まる特性（群れの本能）も見えること。混ぜると落ちるのが読めるか
  if (!/いまの並びで効いている特性/.test(pure)) errors.push('特性の効き目の見出しが無い');
  if (!/群れの本能/.test(pure)) errors.push('《群れの本能》が編成画面に出ない');
  const packPure = (pure.match(/群れの本能[^\n]*×([\d.]+)/) || [])[1];
  const packMixed = (mixed.match(/群れの本能[^\n]*×([\d.]+)/) || [])[1];
  if (!packPure || !packMixed) errors.push('特性の倍率が読めない: ' + packPure + ' / ' + packMixed);
  else if (!(Number(packPure) > Number(packMixed))) {
    errors.push(`混ぜても特性の倍率が落ちて見えない: 純${packPure} 混成${packMixed}`);
  }

  const two = await build(['goblin', 'goblin', 'ogre']);
  if (!/あと1体/.test(two)) errors.push('未発動シナジーの「あと何体」が読めない');

  await page.locator('.panel', { hasText: '発動中のシナジー' }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: (process.env.SP || '.') + '/synergy-panel.png' });
  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 編成画面で効果量と「あと1体で／入れ替えると」が読める');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
