// シナジーと連鎖の「見せ場」演出。積み上がるCHAIN・全画面演出・伝播の稲妻。
// 快感は演出でしか出ないので、壊れても気づけるようにここで縛る。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');

const scenario = () => {
  let n = 0;
  const ev = o => ({ eventId: 'ev' + (++n), emphasis: 0, ...o });
  const player = [0, 1].map(i => ({ id: 'p' + i, tplId: 'goblin', side: 'player', name: 'ゴブ' + i, icon: '👺', hp: 40, maxHp: 40 }));
  const enemy = [0, 1, 2].map(i => ({ id: 'e' + i, side: 'enemy', name: '敵' + i, icon: '🗡', hp: 20, maxHp: 20 }));
  return [
    ev({ type: 'battle_start', player, enemy, text: '開始' }),
    ev({ type: 'round_start', round: 1 }),
    ev({ type: 'synergy', id: 'goblin_horde', name: 'ゴブリン軍団', desc: 'A' }),
    ev({ type: 'synergy', id: 'arcane_circle', name: '魔法結社', desc: 'B' }),
    ev({ type: 'synergy', id: 'overload', name: '魔王軍完成', desc: 'C' }),
    ev({ type: 'attack', fromId: 'p0', toId: 'e0', dmg: 60, hp: 0, maxHp: 20, dead: true, chainId: 'c1', chainDepth: 1, text: 'a' }),
    ev({ type: 'overkill', fromId: 'p0', toId: 'e0', excess: 40, percent: 200, rank: '蹂躙', rankId: 'overkill', emphasis: 3, chainId: 'c1', chainDepth: 2 }),
    ev({ type: 'momentum', gain: 14, total: 14, mult: 1.14, emphasis: 2, chainId: 'c1', chainDepth: 3, text: '戦意' }),
    ev({ type: 'trait_trigger', sourceId: 'p0', traitId: 'overload', name: '魔王軍完成', emphasis: 3, chainId: 'c1', chainDepth: 3, text: 'b' }),
    ev({ type: 'splash', fromId: 'p0', toId: 'e1', dmg: 44, hp: 0, maxHp: 20, dead: true, chainId: 'c1', chainDepth: 4, text: 'c' }),
    ev({ type: 'momentum', gain: 21, total: 35, mult: 1.35, emphasis: 3, chainId: 'c1', chainDepth: 5, text: '戦意' }),
    ev({ type: 'trait_trigger', sourceId: 'p0', traitId: 'overload', name: '魔王軍完成', emphasis: 3, chainId: 'c1', chainDepth: 5, text: 'd' }),
    ev({ type: 'splash', fromId: 'p0', toId: 'e2', dmg: 38, hp: 0, maxHp: 20, dead: true, chainId: 'c1', chainDepth: 6, text: 'e' }),
    ev({ type: 'round_start', round: 2 }),
    ev({ type: 'result', victory: true })
  ];
};

const watch = async (page, ms, step) => {
  const seen = { burst: [], chain: [], bolts: 0, settle: false, heat: new Set(), cutins: new Set(), morale: [], moraleLit: false, surge: new Set() };
  for (let t = 0; t < ms; t += step) {
    await page.waitForTimeout(step);
    const st = await page.evaluate(() => ({
      burst: document.querySelector('.burst.show') ? (document.getElementById('burst-name').textContent || '') : '',
      chain: (document.querySelector('.chain-flare.live b') || {}).textContent || '',
      settle: !!document.querySelector('.chain-flare.settle'),
      bolts: document.querySelectorAll('.chain-bolt').length,
      cutin: document.querySelector('.cutin.show') ? (document.getElementById('cutin-name').textContent || '') : '',
      heat: [...document.getElementById('scene').classList].filter(c => c.startsWith('heat-')),
      surge: [...document.querySelectorAll('.fnum.surge')].map(e => [...e.classList].find(c => /^s\d$/.test(c)) || ''),
      morale: (document.getElementById('morale-mult') || {}).textContent || '',
      moraleLit: !!document.querySelector('.morale.lit')
    }));
    if (st.burst) seen.burst.push(st.burst);
    if (st.chain) seen.chain.push(Number(st.chain));
    if (st.settle) seen.settle = true;
    seen.bolts += st.bolts;
    if (st.cutin) seen.cutins.add(st.cutin);
    for (const t of st.surge) if (t) seen.surge.add(t);
    if (st.morale) seen.morale.push(st.morale);
    if (st.moraleLit) seen.moraleLit = true;
    for (const h of st.heat) seen.heat.add(h);
  }
  return seen;
};

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + process.env.GAME + '/battle-preview.html');
    await page.evaluate(s => { BattleScene.speed = 1; BattleScene.play(s, () => {}); }, scenario());
    const seen = await watch(page, await page.evaluate(() => BattleScene.pacing.plannedMs + 2000), 320);

    assert.ok(seen.cutins.has('ゴブリン軍団') && seen.cutins.has('魔法結社'),
      `通常のシナジーは帯で流れる: ${[...seen.cutins]}`);
    assert.ok(seen.burst.includes('魔王軍完成'), '魔王軍完成は全画面で見せる');
    assert.ok(seen.burst.includes('蹂躙'), '余剰100%以上のOVERKILLは全画面で見せる');
    assert.ok(!seen.burst.includes('ゴブリン軍団'), '通常のシナジーで全画面は出さない（テンポを殺す）');
    // CHAINは積み上がって残る
    assert.ok(seen.chain.length > 4, `CHAINは点滅ではなく居座る（観測 ${seen.chain.length} 回）`);
    assert.equal(Math.max(...seen.chain), 6, '最も深い段まで数字が伸びる');
    assert.deepEqual(seen.chain, seen.chain.slice().sort((a, b) => a - b), 'CHAINは伸びる一方で、途中で戻らない');
    assert.ok(seen.settle, '鎖が途切れたら×Nで締める');
    assert.ok(seen.bolts > 0, '伝播は次の敵へ稲妻が走る');
    assert.ok(seen.heat.has('heat-3'), '深い連鎖では戦場そのものが焼ける');
    // 戦意：OVERKILLの見返りが常に画面に出ていて、上がっていくこと
    assert.ok(seen.morale.includes('×1.00'), '戦意メーターは戦闘開始から出ている');
    assert.ok(seen.morale.includes('×1.14') && seen.morale.includes('×1.35'),
      `戦意が段階的に上がる（観測 ${[...new Set(seen.morale)]}）`);
    assert.ok(seen.moraleLit, '戦意が上がったら点灯する');
    const nums = seen.morale.map(t => Number(t.replace('×', '')));
    assert.deepEqual(nums, nums.slice().sort((a, b) => a - b), '戦意は戦闘中に下がらない');
    assert.ok(seen.surge.size > 0, `連鎖と戦意でダメージ数字が大きくなる（観測 ${[...seen.surge]}）`);
    assert.deepEqual(errors, [], 'JSエラーが出ていない');

    // 倍速でも同じ見せ場が出る（尺だけ縮む）
    await page.evaluate(s => { BattleScene.speed = 4; BattleScene.play(s, () => {}); }, scenario());
    const fast = await watch(page, await page.evaluate(() => BattleScene.pacing.plannedMs / 4 + 5000), 200);
    assert.ok(fast.burst.includes('魔王軍完成'), 'x4でも魔王軍完成は出る');
    assert.ok(Math.max(0, ...fast.chain) >= 4, `x4でもCHAINは伸びる（最大 ${Math.max(0, ...fast.chain)}）`);

    // スキップすると演出が残らない
    await page.evaluate(s => { BattleScene.speed = 1; BattleScene.play(s, () => {}); }, scenario());
    await page.waitForTimeout(1500);
    await page.evaluate(() => BattleScene.skip());
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      burst: document.querySelectorAll('.burst.show').length,
      chain: document.querySelectorAll('.chain-flare.live, .chain-flare.settle').length,
      bolts: document.querySelectorAll('.chain-bolt').length,
      heat: [...document.getElementById('scene').classList].filter(c => c.startsWith('heat-')).length
    }));
    assert.deepEqual(after, { burst: 0, chain: 0, bolts: 0, heat: 0 }, 'スキップで演出が残らない');

    // 低モーションでは稲妻とフラッシュを出さず、内容は読める
    const reduced = await browser.newPage({ viewport: { width: 390, height: 760 }, reducedMotion: 'reduce' });
    await reduced.goto('file://' + process.env.GAME + '/battle-preview.html');
    await reduced.evaluate(s => { BattleScene.speed = 1; BattleScene.play(s, () => {}); }, scenario());
    const calm = await watch(reduced, await reduced.evaluate(() => BattleScene.pacing.plannedMs + 2000), 320);
    assert.equal(calm.bolts, 0, '低モーションでは稲妻を出さない');
    assert.ok(calm.burst.includes('魔王軍完成'), '低モーションでも何が起きたかは読める');
    await reduced.close();

    console.log('✓ 見せ場：帯と全画面の出し分け・積み上がるCHAIN・締め・伝播の稲妻・熱・戦意メーター・倍速・スキップ・低モーション');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
