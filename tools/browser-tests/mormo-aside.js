// 戦闘中のモルモの一言（WORK_SPLIT の I）。
// 見たいのは「出ること」より「連発しないこと」と「いちばん珍しい場面が選ばれること」。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');

const shell = { stage: 3, baseStage: 3, missionKind: 'invade', region: '辺境', army: '王国軍' };

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');

  await page.evaluate(() => {
    Game.newRun();
    window.build = extras => {
      const player = { id: 'p0', tplId: 'goblin', name: 'ゴブ太', race: 'ゴブリン', icon: '👺', side: 'player', hp: 30, maxHp: 30 };
      const enemy = { id: 'e0', name: '衛兵', icon: '⚔️', side: 'enemy', hp: 400, maxHp: 400 };
      return [{ type: 'battle_start', player: [player], enemy: [enemy] },
        ...extras,
        { type: 'result', victory: true, emphasis: 3, text: '勝利', cls: 'result-win' }];
    };
  });

  const run = async extras => page.evaluate(async list => {
    UI.set(BattleScene.shell(window.shellData));
    BattleScene.play(build(list), () => {});
    const scene = BattleScene.mormoAside && BattleScene.mormoAside.scene;
    // 決着の手前まで一気に再生する（決着は stop() で一時演出を片付けるので、その前で数える）
    while (BattleScene.index < BattleScene.timeline.length
      && BattleScene.timeline[BattleScene.index].type !== 'result') {
      BattleScene.render(BattleScene.timeline[BattleScene.index++]);
    }
    return { scene, shown: document.querySelectorAll('.mormo-aside').length,
      text: (document.querySelector('.mormo-aside-bubble') || {}).textContent || '',
      left: BattleScene.mormoAside };
  }, extras);

  await page.evaluate(s => { window.shellData = s; }, shell);

  const deep = [];
  for (let d = 2; d <= 7; d++) deep.push({ type: 'trait_trigger', sourceId: 'p0', traitId: 'greedy', name: '強欲',
    chainId: 'c1', parentEventId: 'x' + (d - 1), eventId: 'x' + d, chainDepth: d, emphasis: 2 });

  const onlyChain = await run(deep);
  assert.equal(onlyChain.scene, 'chain', '5段以上の連鎖で一言が予約される');
  assert.equal(onlyChain.shown, 1, '深い段が何度続いても一言は1回だけ');
  assert.equal(onlyChain.left, null, '撃ったら予約が残らない');

  // 2) 初めて見るシナジーは連鎖より優先される
  const discovery = await run([
    { type: 'synergy', id: 'goblin_horde', name: 'ゴブリンの群れ', desc: '数の暴力', emphasis: 3, firstDiscovery: true },
    ...deep
  ]);
  assert.equal(discovery.scene, 'discovery', '初発見は連鎖より珍しいので優先される');
  assert.equal(discovery.shown, 1, '初発見でも一言は1回だけ');

  // 3) 全滅はすべてに優先し、決着表示と一緒に残る
  const wipe = await page.evaluate(async d => {
    UI.set(BattleScene.shell(window.shellData));
    const timeline = [build([])[0],
      { type: 'synergy', id: 'goblin_horde', name: 'ゴブリンの群れ', emphasis: 3, firstDiscovery: true },
      ...d,
      { type: 'result', victory: false, wipe: 'player', emphasis: 3, text: '魔王軍は全滅した……', cls: 'result-lose' }];
    BattleScene.play(timeline, () => {});
    const scene = BattleScene.mormoAside && BattleScene.mormoAside.scene;
    BattleScene.skip();
    return { scene, shown: document.querySelectorAll('.mormo-aside').length,
      withResult: !!document.querySelector('#scene .scene-result') };
  }, deep);
  assert.equal(wipe.scene, 'wipe', '全滅は初発見より優先される');
  assert.equal(wipe.shown, 1, '全滅でも一言は1回だけ');
  assert.ok(wipe.withResult, '全滅の一言は決着表示と一緒に残る');

  // 4) 何も起きない戦闘では黙っている
  const quiet = await run([{ type: 'attack', fromId: 'p0', toId: 'e0', dmg: 5, hp: 395, maxHp: 400, emphasis: 1, chainDepth: 1 }]);
  assert.ok(!quiet.scene, '普通の戦闘ではモルモは出てこない');
  assert.equal(quiet.shown, 0, '出番がないときは何も描かない');

  assert.deepEqual(errors, []);
  console.log('✓ モルモの一言: 連鎖5段・初発見・全滅の3場面、優先度、1戦闘1回、静かな戦闘では出ない');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
