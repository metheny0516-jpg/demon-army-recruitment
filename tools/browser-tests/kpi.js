// KPI測定が実機の操作経路に繋がっていること（速度変更・スキップ・モルモ早送り・画面記録）。
// クリック操作の安定待ちに依存せず、実際の関数を呼んで LocalStorage の中身を読む。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  const result = await page.evaluate(() => {
    KPI.reset();
    Game.newRun();
    App.render();
    const afterRender = KPI.load().lastScreen;

    // 戦闘テンポの操作
    const player = { id: 'p0', tplId: 'goblin', name: 'ゴブ太', race: 'ゴブリン', icon: '👺', side: 'player', hp: 30, maxHp: 30 };
    const enemy = { id: 'e0', name: '衛兵', icon: '⚔️', side: 'enemy', hp: 40, maxHp: 40 };
    UI.set(BattleScene.shell({ stage: 1, baseStage: 1, missionKind: 'invade', region: '辺境', army: '王国軍' }));
    BattleScene.play([
      { type: 'battle_start', player: [player], enemy: [enemy] },
      { type: 'attack', fromId: 'p0', toId: 'e0', dmg: 5, hp: 35, maxHp: 40, emphasis: 1 },
      { type: 'result', victory: true }
    ]);
    BattleScene.cycleSpeed();
    BattleScene.cycleSpeed();
    BattleScene.skip();

    // モルモ報告：全文が出る前に送る＝報告スキップ、読み終えてから送るのは数えない
    MormoScene.show({ expression: 'report', text: '長い報告デス。'.repeat(20), kicker: 'test', title: 'モルモ' });
    const typing = MormoScene.typing;
    MormoScene.advance();          // 早送り（1回数える）
    const afterReveal = MormoScene.typing;
    MormoScene.advance();          // 読み終えてから閉じる（数えない）

    const data = KPI.load();
    return {
      afterRender, typing, afterReveal,
      totals: data.totals,
      current: KPI.current ? { speedChanges: KPI.current.speedChanges, logSkips: KPI.current.logSkips,
        reportSkips: KPI.current.reportSkips, buildAttempts: KPI.current.buildAttempts } : null,
      keys: Object.keys(localStorage).sort(),
      savedRun: JSON.parse(localStorage.getItem('maou_save') || '{}')
    };
  });

  if (!result.afterRender || result.afterRender.phase !== 'recruit') {
    errors.push('画面遷移で最後にいた画面が記録されない: ' + JSON.stringify(result.afterRender));
  }
  if (result.totals.speedChanges !== 2) errors.push('戦闘速度の変更が数えられない: ' + result.totals.speedChanges);
  if (result.totals.logSkips !== 1) errors.push('戦闘スキップが数えられない: ' + result.totals.logSkips);
  if (!result.typing) errors.push('モルモ報告がタイプ表示で始まっていない');
  if (result.afterReveal) errors.push('早送りで全文表示になっていない');
  if (result.totals.reportSkips !== 1) {
    errors.push('報告の早送りだけを数えていない（読了後の送りも数えている疑い）: ' + result.totals.reportSkips);
  }
  if (!result.current || result.current.speedChanges !== 2) errors.push('進行中ランのカウンタが増えていない');
  if (!result.keys.includes('maou_kpi')) errors.push('KPIが端末内へ保存されていない: ' + result.keys.join(','));
  if (result.keys.some(k => !['maou_save', 'maou_history', 'maou_kpi', 'maou_speed', 'maou_sound', 'maou_music'].includes(k))) {
    errors.push('想定外のLocalStorageキーがある: ' + result.keys.join(','));
  }
  for (const key of ['buildAttempts', 'formationChanges', 'speedChanges', 'kpi']) {
    if (key in result.savedRun) errors.push('ラン状態のセーブへKPIが混ざっている: ' + key);
  }

  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 速度変更・スキップ・報告早送り・画面記録が端末内に残る');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
