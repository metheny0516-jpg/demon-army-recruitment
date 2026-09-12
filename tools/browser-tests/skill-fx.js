// 演出プリセット（docs/TICKET_SKILL_FX_2026-09-12.md 1・3節）：
// fx ごとに1回再生して、期待するクラスと数字が出る／全体技は同時に着弾して尺が上限内／
// 残る印は次のラウンド頭で消える／スキップで残骸が残らない／低モーションでは静止画1枚。
//   node tools/browser-tests/skill-fx.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 戦場を1枚出して、イベントを直接流し込む（戦闘の中身は他のテストが見る。ここは絵だけ）
const STAGE = () => {
  const mk = (id, name, side) => ({ id, tplId: 'orc', name, icon: '⚔️', side, hp: 100, maxHp: 100 });
  UI.set(BattleScene.shell({ stage: 1, baseStage: 1, missionKind: 'invade', region: '辺境', army: '王国軍' }));
  BattleScene.play([{ type: 'battle_start',
    player: [mk('p0', 'ガロ', 'player'), mk('p1', 'ホネオ', 'player')],
    enemy: [mk('e0', '衛兵', 'enemy'), mk('e1', '弓手', 'enemy'), mk('e2', '斥候', 'enemy')] }]);
  BattleScene.speed = 1;
};
const FX = ['heavy', 'slash_multi', 'fire', 'dark', 'holy', 'nature', 'wind', 'aura', 'shield', 'summon'];

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.slot-card [data-action="new"][data-slot="1"]').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ プリセット10種：それぞれ1回再生して絵と数字が出る');
  await page.evaluate(STAGE);
  await page.waitForTimeout(600);       // 戦場が出来上がるまで（1件目が空振りしないように）
  // 絵は「溜め→接触」の接触のときに出て、寿命が来ると自分で消える。
  // 出た瞬間を捕まえる（MutationObserver で、消える前の見え方を控える）。
  const played = [];
  for (const fx of FX) {
    const seen = await page.evaluate(async fx => {
      document.querySelectorAll('.bu-vfx').forEach(el => el.remove());
      document.querySelectorAll('.fnum').forEach(el => el.remove());
      const card = document.getElementById('bu-e0');
      const caught = await new Promise(resolve => {
        const done = el => { observer.disconnect(); clearTimeout(timer);
          resolve({ cls: el.className, painted: getComputedStyle(el).backgroundImage !== 'none', life: el.style.animationDuration }); };
        const observer = new MutationObserver(() => {
          const el = card.querySelector(`.bu-vfx.fx-${fx}`);
          if (el) done(el);
        });
        observer.observe(card, { childList: true, subtree: true });
        const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, 2500);
        BattleScene.render({ type: 'attack', fromId: 'p0', toId: 'e0', dmg: 12, hp: 88, maxHp: 100, fx, skillId: 'x', emphasis: 2 });
      });
      return { fx, drawn: !!caught, painted: !!caught && caught.painted, life: caught && caught.life,
        num: card.querySelectorAll('.fnum').length };
    }, fx);
    played.push(seen);
  }
  for (const p of played) {
    ok(p.drawn && p.num >= 1, `${p.fx}：絵と数字が出る（絵${p.drawn ? 1 : 0} / 数字${p.num}）`);
  }
  ok(played.every(p => p.painted), 'スプライトが無い段でも色で見える（クラス名は CodeX の CSS と同じ）');
  await page.evaluate(() => {
    document.querySelectorAll('.fnum').forEach(el => el.remove());
    BattleScene.render({ type: 'attack', fromId: 'p0', toId: 'e0', dmg: 30, hp: 50, maxHp: 100, fx: 'heavy', skillId: 'ogre_smash', emphasis: 2 });
  });
  await page.waitForTimeout(700);
  const heavy = await page.evaluate(() => ({
    big: !!document.querySelector('#bu-e0 .fnum.big'),
    num: (document.querySelector('#bu-e0 .fnum') || {}).textContent || ''
  }));
  ok(heavy.big, `heavy の数字は大きい（${heavy.num}）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/skill-fx-390.png' });

  console.log('\n▼ 全体技：同時に着弾して、総尺は単体の1.6倍まで');
  const aoe = await page.evaluate(() => {
    const one = { type: 'attack', fromId: 'p0', toId: 'e0', dmg: 9, hp: 80, maxHp: 100, fx: 'fire', skillId: 'mage_fireball', aoe: true, emphasis: 1 };
    const timeline = [
      one,
      { ...one, toId: 'e1' },
      { ...one, toId: 'e2' }
    ];
    const plan = BattleScene.plan(timeline);
    const single = BattleScene.durationOf(one);
    document.querySelectorAll('.bu-vfx').forEach(el => el.remove());
    document.querySelectorAll('.fnum').forEach(el => el.remove());
    BattleScene.timeline = timeline;
    BattleScene.render(timeline[0]);      // 先頭で全員ぶん描く
    // 2件目以降は描画しない（字幕と記録だけ）
    BattleScene.render(timeline[1]);
    BattleScene.render(timeline[2]);
    return { durations: plan.items.map(i => i.duration), single };
  });
  await page.waitForTimeout(600);
  const aoeDrawn = await page.evaluate(() => ['e0', 'e1', 'e2'].map(id => document.querySelectorAll(`#bu-${id} .bu-vfx.fx-fire`).length));
  aoe.drawn = aoeDrawn.map(n => n >= 1);
  aoe.after = aoeDrawn;
  ok(aoe.drawn.every(Boolean), `3体とも同時に着弾する（${aoe.drawn.join(',')}）`);
  ok(aoe.after.every(n => n === 1), `2件目以降は二度描きしない（${aoe.after.join(',')}）`);
  ok(aoe.durations[1] === 0 && aoe.durations[2] === 0, `2件目以降の尺は0（${aoe.durations.join(',')}）`);
  ok(aoe.durations[0] <= aoe.single * 1.6 + 1 && aoe.durations[0] > aoe.single,
    `総尺は単体の1.6倍まで（単体 ${aoe.single} → まとめて ${aoe.durations[0]}）`);
  await page.waitForTimeout(300);
  const nums = await page.evaluate(() => ['e0', 'e1', 'e2'].map(id => document.querySelectorAll(`#bu-${id} .fnum`).length));
  ok(nums.every(n => n >= 1), `数字も同時に3つ（${nums.join(',')}）`);

  console.log('\n▼ 残る印：付いて、次のラウンド頭で消える');
  const marks = await page.evaluate(() => {
    BattleScene.render({ type: 'note', unitId: 'e0', stunned: true, text: '　衛兵は動けない', cls: 'trait' });
    BattleScene.render({ type: 'note', unitId: 'p0', buff: true, fx: 'aura', targets: ['p0', 'p1'], text: '　鬨の声', cls: 'trait' });
    BattleScene.render({ type: 'note', unitId: 'p1', forId: 'p0', covering: true, fx: 'shield', text: '　ホネオがガロの前に立つ', cls: 'trait' });
    BattleScene.render({ type: 'attack', fromId: 'p0', toId: 'e1', dmg: 5, hp: 70, maxHp: 100, fx: 'fire', skillId: 'lich_pulse', emphasis: 1 });
    const before = {
      bound: document.querySelectorAll('#bu-e0 .bu-mark-bound').length,
      buff: document.querySelectorAll('.bu-mark-buff').length,
      cover: document.querySelectorAll('#bu-p1 .bu-mark-cover').length,
      covering: document.querySelector('#bu-p1').classList.contains('covering')
    };
    BattleScene.render({ type: 'round_start', round: 2 });
    return { before, after: document.querySelectorAll('.bu-mark').length };
  });
  ok(marks.before.bound === 1, `拘束の印が付く（${marks.before.bound}）`);
  ok(marks.before.buff === 2, `鼓舞は対象全員に付く（${marks.before.buff}）`);
  ok(marks.before.cover === 1 && marks.before.covering, 'かばいの印と縁取り');
  ok(marks.after === 0, `次のラウンド頭で全部消える（残り${marks.after}）`);
  // 燃焼は「燃え移る技」だけ
  await page.evaluate(() => BattleScene.render({ type: 'attack', fromId: 'p0', toId: 'e2', dmg: 5, hp: 70, maxHp: 100, fx: 'fire', skillId: 'lich_pulse', aoe: false, emphasis: 1 }));
  await page.waitForTimeout(500);
  const withBurn = await page.evaluate(() => document.querySelectorAll('#bu-e2 .bu-mark-burn').length);
  await page.evaluate(() => {
    BattleScene.render({ type: 'round_start', round: 3 });
    BattleScene.render({ type: 'attack', fromId: 'p0', toId: 'e2', dmg: 5, hp: 65, maxHp: 100, fx: 'fire', skillId: 'mage_fireball', aoe: false, emphasis: 1 });
  });
  await page.waitForTimeout(500);
  const burn = { withBurn, without: await page.evaluate(() => document.querySelectorAll('#bu-e2 .bu-mark-burn').length) };
  ok(burn.withBurn === 1, `燃焼を残す技には炎の印（${burn.withBurn}）`);
  ok(burn.without === 0, `残さない技（火球）には付かない（${burn.without}）`);

  console.log('\n▼ 味方対象：使用者は前へ出ず、光るのは対象の側');
  const ally = await page.evaluate(() => {
    document.querySelectorAll('.bu-vfx').forEach(el => el.remove());
    BattleScene.render({ type: 'heal', unitId: 'p1', sourceId: 'p0', amount: 12, hp: 90, maxHp: 100, fx: 'holy', skillId: 'x', label: '癒やし' });
    return {
      onTarget: document.querySelectorAll('#bu-p1 .bu-vfx.fx-holy').length,
      onSource: document.querySelectorAll('#bu-p0 .bu-vfx').length,
      sourceActing: document.querySelector('#bu-p0').classList.contains('acting'),
      green: !!document.querySelector('#bu-p1 .fnum.heal')
    };
  });
  ok(ally.onTarget === 1 && ally.onSource === 0, `光るのは対象だけ（対象${ally.onTarget} / 使用者${ally.onSource}）`);
  ok(ally.sourceActing, '使用者は acting だけ（前へ出ない）');
  ok(ally.green, '回復の数字は緑の +n');

  console.log('\n▼ スキップで残骸が残らない');
  await page.evaluate(() => {
    for (const fx of ['heavy', 'dark', 'aura']) BattleScene.render({ type: 'attack', fromId: 'p0', toId: 'e0', dmg: 7, hp: 40, maxHp: 100, fx, skillId: 'x', emphasis: 2 });
    // 前の節で戦闘は決着済み（finished）。skip() は決着後は何もしない設計なので、飛ばす前の状態に戻してから押す
    BattleScene.finished = false; BattleScene.index = 0;
    BattleScene.skip();
  });
  await page.waitForTimeout(1200);
  const left = await page.evaluate(() => ({
    vfx: document.querySelectorAll('.bu-vfx').length,
    projectile: document.querySelectorAll('.battle-projectile').length
  }));
  ok(left.vfx === 0 && left.projectile === 0, `残骸なし（絵${left.vfx} / 弾${left.projectile}）`);

  console.log('\n▼ 低モーション：静止画1枚＋数字');
  const reduced = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  reduced.on('pageerror', e => errs.push('reduced: ' + e.message));
  await autoDismissMormo(reduced);
  await reduced.goto('file://' + process.env.GAME + '/index.html');
  await reduced.locator('.slot-card [data-action="new"][data-slot="1"]').first().click();
  await reduced.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(reduced);
  await reduced.evaluate(STAGE);
  const still = await reduced.evaluate(() => {
    BattleScene.render({ type: 'attack', fromId: 'p0', toId: 'e0', dmg: 12, hp: 88, maxHp: 100, fx: 'heavy', skillId: 'ogre_smash', emphasis: 2 });
    const el = document.querySelector('#bu-e0 .bu-vfx');
    return {
      hidden: !el || getComputedStyle(el).display === 'none',
      num: document.querySelectorAll('#bu-e0 .fnum').length,
      moving: document.getElementById('scene').classList.contains('shake')
    };
  });
  ok(still.hidden, '低モーションでは絵を動かさない（CSS で非表示）');
  ok(still.num >= 1, `数字は出る（${still.num}）`);
  ok(!still.moving, '画面を揺らさない');
  await reduced.close();

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
