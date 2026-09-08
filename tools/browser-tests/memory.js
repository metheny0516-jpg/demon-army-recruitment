// 魔界史へ残った出来事1件の表示（R3/U3）。
//
// 守りたい性質:
//   1. 終了画面と魔界史の両方で、名前入りの出来事として読めること
//   2. 戦果の1文と同じ言い方であること（同じ事実の言い方を増やさない）
//   3. memory の無い記録（この機能より前の魔界史）では何も出さないこと
//   4. 統計の行を増やしていないこと（第11節・数字を並べるほど数字のゲームに寄る）
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

const memory = {
  kind: 'loot_relay', origin: { name: 'グルグ' }, originAbility: '追い剥ぎ',
  actor: { name: 'ボル' }, ability: { name: '強欲' }, target: { name: '衛兵' },
  sameActor: false, numbers: { dmg: 44, actions: 1, killed: true },
  turn: 6, army: '王国巡回隊', region: '辺境', victory: true
};
const baseRecord = (extra) => ({
  gen: 1, demonKingName: '若き魔王', cleared: false, battlesWon: 6, conquest: 2, alert: 4,
  reignYears: 27, maxPower: 120, maxChain: 4, maxOverkill: 180, chainDefVersion: 2,
  mainRace: 'ゴブリン', region: '辺境', cause: '王国巡回隊に敗北', retriesUsed: 0,
  fallenTotal: 2, fallenRoll: [], generalsMade: [], battleIncidentTotal: 3,
  facilityLevel: 1, activeFacilityId: null, finalResources: { food: 1, materials: 0 },
  departmentCounts: {}, finalRoster: [], recruitedTplIds: [], discoveredSynergyIds: [],
  hallOfFame: null, maxArmySize: 6, seizeUsed: false, date: '2026-09-08',
  buildName: '過剰殺戮のゴブリン軍団', missionCounts: {}, payrollChoices: {}, ...extra
});

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await autoDismissMormo(page);
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');

  console.log('▼ 終了画面（廃業届）');
  let r = await page.evaluate(record => {
    Game.state.chosenLessonId = null;
    UI.gameover(record, [record]);
    const el = document.querySelector('.memory-line');
    return { text: el ? el.innerText.replace(/\n/g, ' ') : null,
             rows: document.querySelectorAll('.history-item dt').length };
  }, baseRecord({ memory }));
  console.log('    ' + r.text);
  ok(/グルグ/.test(r.text) && /ボル/.test(r.text), '関わった2人の名前が残る');
  ok(/衛兵/.test(r.text) && /撃破/.test(r.text), '何が起きたかまで読める');
  ok(/第6戦/.test(r.text) && /王国巡回隊/.test(r.text), 'いつ・誰との戦いかが添えてある');
  const rowsWith = r.rows;

  console.log('▼ memory の無い記録（この機能より前の魔界史）');
  r = await page.evaluate(record => {
    UI.gameover(record, [record]);
    return { text: (document.querySelector('.memory-line') || {}).innerText || null,
             rows: document.querySelectorAll('.history-item dt').length };
  }, baseRecord({}));
  ok(r.text === null, '記憶が無ければ1行ごと出さない（推測で書かない）');
  ok(r.rows === rowsWith, '統計の行数は記憶の有無で変わらない（数字を増やしていない）');

  console.log('▼ 魔界史の一覧');
  r = await page.evaluate(record => {
    localStorage.setItem('maou_history', JSON.stringify([record, { ...record, gen: 2, memory: null }]));
    UI.history(Storage.loadHistory());
    const lines = [...document.querySelectorAll('.history-item .memory-line')].map(e => e.innerText.replace(/\n/g, ' '));
    return { lines, items: document.querySelectorAll('.history-item').length };
  }, baseRecord({ memory }));
  ok(r.lines.length === 1, '記憶のある代にだけ1行出る（2代のうち1件）');
  ok(/グルグ/.test(r.lines[0]), '一覧でも名前で読める');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/memory-390.png', fullPage: true });

  console.log('▼ 戦果の1文と同じ言い方');
  const same = await page.evaluate(memory => {
    const battleText = UI.spotlightText({ ...memory });
    const historyHtml = UI.memoryLine({ memory });
    return { battleText, includes: historyHtml.includes(battleText) };
  }, memory);
  ok(same.includes, '魔界史の1行は戦果と同じ組み立てを通っている（言い方を二重管理しない）');

  console.log(errs.length ? '✗ ' + errs.join('\n✗ ') : '✓ 魔界史の記憶：終了画面と一覧・統計を増やさない・言い方は1か所');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
