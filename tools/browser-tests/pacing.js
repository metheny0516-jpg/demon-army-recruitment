// 尺の圧縮が「通常攻撃と無反応区間」だけに掛かり、事件は縮まないこと（実機・DOMあり）。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  const measured = await page.evaluate(() => {
    Game.newRun();
    localStorage.removeItem('maou_speed');
    const player = { id: 'p0', tplId: 'goblin', name: '古参のゴブ太', race: 'ゴブリン', icon: '👺', side: 'player', hp: 30, maxHp: 30 };
    const enemy = { id: 'e0', name: '衛兵', icon: '⚔️', side: 'enemy', hp: 900, maxHp: 900 };
    UI.set(BattleScene.shell({ stage: 3, baseStage: 3, missionKind: 'invade', region: '辺境', army: '王国軍' }));

    // 90発の通常攻撃＋縮めてはいけない事件を数個
    const long = [{ type: 'battle_start', player: [player], enemy: [enemy] }];
    for (let i = 0; i < 90; i++) {
      long.push({ type: 'attack', fromId: 'p0', toId: 'e0', dmg: 5, hp: 900 - i * 5, maxHp: 900, emphasis: 1, chainDepth: 1 });
    }
    const marks = {};
    marks.synergy = long.push({ type: 'synergy', id: 'goblin_horde', name: 'ゴブリンの群れ', desc: '数の暴力', emphasis: 3, firstDiscovery: true }) - 1;
    marks.overkill = long.push({ type: 'overkill', fromId: 'p0', toId: 'e0', excess: 400, percent: 400, rank: '粉砕', emphasis: 2 }) - 1;
    marks.death = long.push({ type: 'death', unitId: 'p0', permanent: true }) - 1;
    marks.attack = 1;
    long.push({ type: 'result', victory: true, reversal: true });

    BattleScene.play(long);
    const pacing = BattleScene.pacing;
    return {
      compressScale: pacing.compressScale,
      protectedScales: Object.keys(marks).filter(k => k !== 'attack').map(k => pacing.items[marks[k]].scale),
      attackScale: pacing.items[marks.attack].scale,
      shortScale: BattleScene.plan([
        { type: 'battle_start', player: [player], enemy: [enemy] },
        { type: 'attack', fromId: 'p0', toId: 'e0', dmg: 5, hp: 100, maxHp: 900, emphasis: 1, chainDepth: 1 },
        { type: 'result', victory: true }
      ]).compressScale
    };
  });

  if (!(measured.compressScale < 1)) errors.push('90発の長期戦が圧縮されていない');
  if (!(measured.compressScale >= 0.45)) errors.push('圧縮が下限より深い');
  if (!measured.protectedScales.every(s => s === 1)) errors.push('シナジー・OVERKILL・永久戦死が圧縮されている');
  if (!(measured.attackScale < 1)) errors.push('通常攻撃が圧縮されていない');
  if (measured.shortScale !== 1) errors.push('短い戦闘が圧縮されている');

  // 個別倍率で進行が壊れていないこと（x4で最後まで再生して結果ボタンが出る）
  await page.evaluate(() => { BattleScene.speed = 4; });
  await page.waitForFunction(() => document.getElementById('next-btn')
    && document.getElementById('next-btn').style.display === '', null, { timeout: 60000 })
    .catch(() => errors.push('最後まで再生できず結果ボタンが出ない'));
  if (!await page.locator('.scene-result').count()) errors.push('決着表示が出ていない');

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 事件は縮めず通常攻撃だけを圧縮する');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
