// 発火条件を出撃5枠の外まで数えること、シナジーの重ねがけ（魔王軍完成）が乗ること。
// 「枠の奪い合い」が消えて同時発動が起きるかを、実際の判定関数で見る。
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
    await page.evaluate(() => {
      window.mk = (id, uid) => {
        const t = MONSTER_TEMPLATES.find(row => row.id === id);
        return { uid, tplId: id, name: id + uid, race: t.race, job: '', hp: t.base.hp, atk: t.base.atk,
          def: t.base.def, spd: t.base.spd, salary: t.salary[0], loyalty: 70, merit: 0,
          rankId: 'soldier', traits: (t.traits || []).slice(), tags: (t.tags || []).slice() };
      };
      window.box = list => Synergy.sandbox(list);
    });

    // 1) 出撃隊だけでは足りず、軍団全体で数えれば届く
    const pool = await page.evaluate(() => {
      const army = [1, 2, 3, 4].map(i => mk('goblin', i));
      const squad = box(army.slice(0, 2));          // 出撃は2体だけ
      const withoutPool = Synergy.active(squad).map(s => s.id);
      const withPool = Synergy.active(squad, { pool: box(army) }).map(s => s.id);
      return { withoutPool, withPool };
    });
    assert.ok(!pool.withoutPool.includes('goblin_horde'), '出撃2体だけでは軍団は立たない');
    assert.ok(pool.withPool.includes('goblin_horde'), '控えを数えれば軍団が立つ');

    // 2) 効果が乗るのは出撃した者だけ。控えは戦わない
    const effect = await page.evaluate(() => {
      const army = [1, 2, 3, 4].map(i => mk('goblin', i));
      const squad = box(army.slice(0, 2));
      Synergy.applyAll(squad, { pool: box(army) });
      return squad.map(u => u.mods.dmgMult);
    });
    assert.ok(effect.every(m => m > 1), '出撃したゴブリンだけが強化される');

    // 3) 枠を奪い合わずに2種類が同時発動し、魔王軍完成が重なる
    const stack = await page.evaluate(() => {
      const army = [
        ...[1, 2, 3, 4].map(i => mk('goblin', i)),
        ...[5, 6, 7, 8].map(i => mk('mage', i))
      ];
      const squad = box([army[0], army[4]]);        // ゴブリン1・魔法使い1だけ出撃
      const ids = Synergy.active(squad, { pool: box(army) }).map(s => s.id);
      const before = box([army[0], army[4]]);
      Synergy.applyAll(before, { pool: box(army) });
      return { ids, mults: before.map(u => u.mods.dmgMult) };
    });
    assert.ok(stack.ids.includes('goblin_horde'), 'ゴブリン軍団が立つ');
    assert.ok(stack.ids.includes('arcane_circle'), '同じ編成で魔法結社も立つ（枠を奪い合わない）');
    assert.ok(stack.ids.includes('overload'), '2つ以上で魔王軍完成が重なる');

    // 4) 魔王軍完成は単独では立たない
    const single = await page.evaluate(() => {
      const army = [1, 2, 3, 4].map(i => mk('goblin', i));
      return Synergy.active(box(army.slice(0, 2)), { pool: box(army) }).map(s => s.id);
    });
    assert.ok(!single.includes('overload'), '1つだけでは魔王軍完成にならない');

    // 5) 編成画面の予告が本番と同じ答えを返す
    const preview = await page.evaluate(() => {
      const army = [
        ...[1, 2, 3, 4].map(i => mk('goblin', i)),
        ...[5, 6, 7, 8].map(i => mk('mage', i))
      ];
      const squad = [army[0], army[4]];
      const rows = Synergy.preview(squad, { slots: 5, pool: army }).filter(r => r.active).map(r => r.id);
      const real = Synergy.active(box(squad), { pool: box(army) }).map(s => s.id);
      return { rows: rows.slice().sort(), real: real.slice().sort() };
    });
    assert.deepEqual(preview.rows, preview.real, '予告と本番の発動シナジーが一致する');

    console.log('✓ シナジー: 枠外の発火条件・出撃者だけへの効果・重ねがけ・予告の一致');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
