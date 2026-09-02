// 戦果画面で「今回どれだけ壊れたか」「何から何へ連鎖したか」「火力以外で誰が働いたか」が読めること。
// クリック操作に依存せず、実画面（UI.result / UI.defeat）を直接描いて中身を読む。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');

  const setup = victory => page.evaluate(win => {
    Game.newRun();
    const st = Game.state;
    const roster = st.roster.slice(0, 2);
    st.lastBattle = {
      victory: win, army: '王国騎士団', region: '辺境', notes: ['勝利報酬 10G を獲得'],
      synergies: [], incidents: [], summonCount: 1,
      chainSummary: {
        maxChain: 4, chainCount: 2, eventCount: 6, chains: [],
        deepest: { chainId: 'a1', depth: 4, steps: [
          { eventId: 'a1', type: 'attack', depth: 1, label: '攻撃' },
          { eventId: 'g1', type: 'resource_gain', depth: 2, label: '追い剥ぎ +1G' },
          { eventId: 't1', type: 'trait_trigger', depth: 3, label: '強欲' },
          { eventId: 'a2', type: 'attack', depth: 4, label: '追加攻撃' }
        ] }
      },
      overkillSummary: { count: 2, totalExcess: 40, maxExcess: 30, maxPercent: 180, rank: '蹂躙' },
      contribution: [
        { id: 'p0', uid: roster[0] && roster[0].uid, name: '追い剥ぎゴブ', race: 'ゴブリン', dealt: 30, taken: 5,
          kills: 2, maxOverkill: 180, survived: true, died: false,
          resources: { gold: 3 }, traitTriggers: 4, revivesGiven: 0, selfRevives: 0, healed: 0 },
        { id: 'p1', uid: roster[1] && roster[1].uid, name: '死霊術師', race: '死霊術師', dealt: 4, taken: 12,
          kills: 0, maxOverkill: 0, survived: true, died: true,
          resources: { soul: 1 }, traitTriggers: 2, revivesGiven: 1, selfRevives: 0, healed: 6 }
      ]
    };
    st.lastPayrollReport = { policyId: 'regular', paid: 4, base: 4, loyaltyDelta: 0 };
    st.checkpoint = { gold: st.gold };
    if (win) UI.result(); else UI.defeat();
    return document.body.innerText;
  }, victory);

  const winText = await setup(true);
  if (!await page.locator('.breakthrough-panel').count()) errors.push('勝利画面に「今回の壊れ方」パネルが無い');
  if (!winText.includes('最大CHAIN') || !winText.includes('4')) errors.push('最大CHAINが読めない');
  if (!winText.includes('最大OVERKILL') || !winText.includes('180%')) errors.push('最大OVERKILLが読めない');
  const steps = await page.locator('.chain-step').allInnerTexts();
  if (steps.join(' → ') !== '攻撃 → 追い剥ぎ +1G → 強欲 → 追加攻撃') {
    errors.push('代表CHAIN経路が読めない: ' + steps.join(' → '));
  }
  const headings = await page.locator('.panel h3').allInnerTexts();
  if (headings.filter(h => h.includes('OVERKILL')).length !== 0) errors.push('OVERKILLパネルが重複して残っている');
  if (headings.some(h => h.includes('召喚'))) errors.push('召喚が主要記録として横並びに残っている');

  const badges = await page.locator('.contrib-badge').allInnerTexts();
  for (const want of ['💰+3G', '⚙4発火', '✨1蘇生', '魂+1']) {
    if (!badges.some(b => b.includes(want))) errors.push('非ダメージバッジが読めない: ' + want);
  }
  const rows = await page.locator('.contrib-row').count();
  if (rows !== 2) errors.push('個人貢献の行数が合わない: ' + rows);
  const perRow = await page.evaluate(() => Array.from(document.querySelectorAll('.contrib-row'))
    .map(r => r.querySelectorAll('.contrib-badge').length));
  if (perRow.some(n => n > 6)) errors.push('1行のバッジが多すぎる: ' + perRow.join(','));

  // 敗北画面でも同じ表示契約
  const loseText = await setup(false);
  if (!await page.locator('.breakthrough-panel').count()) errors.push('敗北画面に「今回の壊れ方」パネルが無い');
  if (!loseText.includes('最大CHAIN')) errors.push('敗北画面で最大CHAINが読めない');

  await setup(true);
  await page.screenshot({ path: (process.env.SP || '.') + '/report-chain.png', fullPage: true });

  // 因果情報の無い旧セーブでも落ちず、経路だけが消える
  const oldText = await page.evaluate(() => {
    const b = Game.state.lastBattle;
    b.chainSummary = { maxChain: 1, chainCount: 1, eventCount: 1, chains: [] };
    UI.result();
    return document.body.innerText;
  });
  if (!oldText.includes('最大CHAIN')) errors.push('旧データで壊れ方パネルが消えてしまう');
  if (await page.locator('.chain-step').count()) errors.push('旧データなのに経路が出ている');

  await page.screenshot({ path: (process.env.SP || '.') + '/report-panel.png', fullPage: true });
  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 主要記録2つ・代表CHAIN経路・非ダメージバッジ');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
