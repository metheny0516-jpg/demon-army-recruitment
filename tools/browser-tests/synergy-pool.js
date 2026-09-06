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

    // 2) 効果が乗るのは出撃した者だけ。控えは条件を数えるだけで戦わない。
    //    出撃側が強くなることだけを見ていると、「控えにも乗ってしまう」不具合を
    //    素通しする。控えの倍率が等倍のままであることも同じ検査で押さえる。
    const effect = await page.evaluate(() => {
      const army = [1, 2, 3, 4].map(i => mk('goblin', i));
      const all = box(army);                        // 軍団全体（発火条件を数える母集団）
      const squad = all.slice(0, 2);                // そのうち出撃するのは2体
      Synergy.applyAll(squad, { pool: all });
      return { squad: squad.map(u => u.mods.dmgMult), bench: all.slice(2).map(u => u.mods.dmgMult) };
    });
    assert.ok(effect.squad.every(m => m > 1), '出撃したゴブリンだけが強化される');
    assert.ok(effect.bench.every(m => m === 1),
      `控えには効果が乗らない（実際: ${effect.bench.join(',')}）`);

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

    // 6) 積んだシナジーが「画面の出来事」になる：OVERKILL撃破が次の敵へ伝播する
    //    ここだけは実戦のBattle.simulateを回すので乱数が入る。乱数のままだと
    //    「積んだほうが深い」が偶然で揺れ、後から入った不具合と区別できない。
    //    そこで戦闘の間だけ Math.random を種つきの数列へ差し替え、
    //    積まない側と積んだ側へ **同じ乱数列** を与えて対にして比べる。
    //    （U.rand/pick/chance はすべて Math.random を通るので、これで全部が決まる）
    const chain = await page.evaluate(() => {
      const stage = ENEMY_STAGES[2];
      const squad = () => ['goblin', 'ogre', 'goblin'].map((id, j) => {
        const t = MONSTER_TEMPLATES.find(x => x.id === id);
        return Battle.makeUnit({ uid: 100 + j, tplId: id, name: t.race + j, race: t.race, job: '',
          hp: t.base.hp * 3, maxHp: t.base.hp * 3, atk: t.base.atk * 3, def: t.base.def,
          spd: t.base.spd, salary: 1, loyalty: 70, traits: [], tags: (t.tags || []).slice(),
          battleDmgMult: 1, battleTakenMult: 1 }, 'player');
      });
      const foes = () => stage.units.map((u, j) => Battle.makeUnit({ ...u, uid: 900 + j,
        name: u.name || '敵', maxHp: u.hp, traits: u.traits || [], tags: u.tags || [] }, 'enemy'));
      const army = ids => Synergy.sandbox(ids.map((id, j) => {
        const t = MONSTER_TEMPLATES.find(x => x.id === id);
        return { uid: j + 1, tplId: id, race: t.race, name: t.race + j, traits: [], tags: (t.tags || []).slice(),
          hp: t.base.hp, atk: t.base.atk, def: t.base.def, spd: t.base.spd, salary: t.salary[0] };
      }));
      const ROUNDS = 60;
      const real = Math.random;
      const seeded = seed => { let s = seed >>> 0; return () => {
        s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296;
      }; };
      const measure = pool => {
        let deep = 0, fired = 0;
        for (let i = 0; i < ROUNDS; i++) {
          Math.random = seeded(0x5eed + i * 7919);   // 何度走らせても同じ60戦
          const r = Battle.simulate(squad(), foes(), { synergyPool: pool });
          if (((r.chainSummary && r.chainSummary.maxChain) || 0) >= 4) deep++;
          if ((r.timeline || []).some(e => e.traitId === 'overload')) fired++;
        }
        return { deep, fired };
      };
      try {
        const flat = measure(army(['goblin', 'ogre']));
        const stacked = measure(army(['goblin', 'goblin', 'goblin', 'goblin',
          'mage', 'mage', 'mage', 'mage', 'ogre']));
        return { flat, stacked, rounds: ROUNDS };
      } finally {
        Math.random = real;
      }
    });
    assert.equal(chain.flat.fired, 0, 'シナジーを積んでいなければ伝播しない');
    assert.ok(chain.stacked.fired > 0, '魔王軍完成が立つと余剰が次の敵へ伝播する');
    assert.ok(chain.stacked.deep > chain.flat.deep,
      `積んだほうが連鎖が深い（同じ乱数列で 積まない ${chain.flat.deep}/${chain.rounds} → 積んだ ${chain.stacked.deep}/${chain.rounds}）`);

    console.log('✓ シナジー: 枠外の発火条件・出撃者だけへの効果・重ねがけ・積むほど伸びる連鎖・予告の一致');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
