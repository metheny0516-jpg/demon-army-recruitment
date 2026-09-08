// 戦果の1文（U2）。「よく分からないけどつながった」を戦果まで持ち越さないための1行。
//
// 守りたい性質:
//   1. 3種それぞれが、関わった2人の名前と結果まで読める文になること
//   2. 証拠が無い戦果では**何も出さない**こと（反実仮想を書かない）
//   3. 撃破していない回に「撃破した」と書かないこと
//   4. パネルを増やさず、既存の2記録（最大CHAIN・最大OVERKILL）を押しのけないこと
//   5. 390pxで読めること
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 戦果画面を、任意の lastBattle で描かせる
async function showResult(page, spotlight) {
  return page.evaluate(spotlight => {
    Game.state.lastBattle = {
      victory: true, army: '王国巡回隊', region: '辺境', reward: 10, lootGold: 2,
      notes: ['勝利報酬 10G を獲得'], synergies: ['追い剥ぎコンビ'], incidents: [],
      contribution: [], chainSummary: { maxChain: 3, deepest: null },
      overkillSummary: { maxPercent: 120, count: 2, totalExcess: 40, rank: '蹂躙' },
      momentumPeak: 1.4, summonCount: 0, deathChains: [],
      facility: { level: 0, name: '空き部屋', works: 0 },
      facilitySummary: { facilities: [] },
      spotlight
    };
    Game.state.phase = 'result';
    App.render();
    const el = document.querySelector('.spotlight-line');
    return { text: el ? el.innerText.replace(/\n/g, ' ') : null,
             panels: document.querySelectorAll('.breakthrough-panel').length,
             records: document.querySelectorAll('.breakthrough-records > div').length };
  }, spotlight);
}

const relay = {
  defVersion: 1, candidateCount: 1, kind: 'loot_relay',
  origin: { id: 'p0', name: 'グルグ' }, originAbility: '追い剥ぎ',
  actor: { id: 'p1', name: 'ボル' }, ability: { id: 'greedy', name: '強欲' },
  target: { id: 'x0', name: '衛兵' }, sameActor: false,
  numbers: { gold: 1, dmg: 44, actions: 1, killed: true }, evidence: ['e1', 'e2', 'e3']
};

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await autoDismissMormo(page);
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');

  console.log('▼ 略奪 → 追撃');
  let r = await showResult(page, relay);
  console.log('    ' + r.text);
  ok(/グルグ/.test(r.text) && /ボル/.test(r.text), '関わった2人の名前が出る');
  ok(/追い剥ぎ/.test(r.text) && /追撃/.test(r.text), '何を受けて何をしたかが読める');
  ok(/衛兵/.test(r.text) && /撃破/.test(r.text), '結果（誰を倒したか）まで書く');
  ok(r.panels === 1 && r.records === 2, 'パネルを増やさず、2記録も押しのけない');

  console.log('▼ 撃破していない回');
  r = await showResult(page, { ...relay, target: { id: 'x0', name: '衛兵' },
    numbers: { gold: 1, dmg: 12, actions: 1, killed: false } });
  console.log('    ' + r.text);
  ok(!/撃破/.test(r.text), '撃破していない回に「撃破した」と書かない');
  ok(/12/.test(r.text), '代わりに実際のダメージを書く');

  console.log('▼ 料理 → 強化 → 撃破');
  r = await showResult(page, {
    defVersion: 1, candidateCount: 1, kind: 'meal_boost',
    origin: { id: 'p0', name: 'ミミ' }, originAbility: '魔界料理人',
    actor: { id: 'p1', name: 'ドン' }, ability: null,
    target: { id: 'x0', name: '騎士' }, sameActor: false,
    numbers: { percent: 24, dmg: 65, actions: 1, killed: true }, evidence: ['e1', 'e2'] });
  console.log('    ' + r.text);
  ok(/ミミ/.test(r.text) && /ドン/.test(r.text) && /24/.test(r.text), '料理人・強化された人・効果量が出る');
  ok(/騎士/.test(r.text) && /撃破/.test(r.text), '着地の撃破まで書く');

  console.log('▼ 蘇生 → 復帰後の行動');
  r = await showResult(page, {
    defVersion: 1, candidateCount: 1, kind: 'revive_return',
    origin: { id: 'p0', name: 'ネル' }, originAbility: '死霊術',
    actor: { id: 'p1', name: 'ガロ' }, ability: { id: 'necromancy', name: null },
    target: null, sameActor: false,
    numbers: { actions: 2, dmg: 15, killed: false }, evidence: ['e1', 'e2', 'e3'] });
  console.log('    ' + r.text);
  ok(/ネル/.test(r.text) && /ガロ/.test(r.text) && /蘇生/.test(r.text), '蘇生した人と復帰した人が出る');
  ok(/2回/.test(r.text), '復帰後に何回動いたかを書く');
  ok(!/撃破/.test(r.text), '撃破していないので撃破とは書かない');

  console.log('▼ 証拠が無い戦果');
  r = await showResult(page, null);
  ok(r.text === null, 'spotlight が無ければ1文ごと出さない（推測で書かない）');
  ok(r.panels === 1 && r.records === 2, '1文が無くても戦果パネルは従来どおり');

  console.log('▼ 今回動かした人が働いた回');
  r = await showResult(page, { ...relay, changedActor: true });
  console.log('    ' + r.text);
  ok(/今回動かした人/.test(r.text), '見出しが変わり、自分の操作が効いたことが分かる');
  ok(!/勝っ|勝利したから|おかげで勝/.test(r.text), '「変えたから勝った」とは書かない（反実仮想を断言しない）');
  ok(await page.locator('.spotlight-line.changed').count() === 1, '印が付く');
  r = await showResult(page, { ...relay, changedActor: false });
  ok(/この戦いの一手/.test(r.text) && !/今回動かした人/.test(r.text), '動かしていない回は従来の見出し');

  console.log('▼ 表示量');
  r = await showResult(page, relay);
  ok(r.text.length <= 70, `1文は ${r.text.length} 文字（70文字以内に収める）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/spotlight-390.png', fullPage: true });

  console.log(errs.length ? '✗ ' + errs.join('\n✗ ') : '✓ 戦果の1文：3種の因果・証拠が無ければ出さない・パネルを増やさない（390px）');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
