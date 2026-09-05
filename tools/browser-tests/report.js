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
      facility: { level: 3, name: '魔王城作業区', works: 3, activeId: 'graveyard', activeName: '墓地' },
      facilitySummary: { rescuedFromWipe: true, facilities: [
        { facilityId: 'graveyard', name: '墓地', count: 1, summons: 1, amount: 0, rescued: true }
      ] },
      deathChains: [
        { unitId: 'p1', name: '死霊術師', deaths: 1, permanentDeath: false,
          steps: ['致死を耐えた', '戦死', '死霊術で蘇生（全快）', '骸骨従者を召喚'] }
      ],
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
  if (!await page.locator('.breakthrough-panel').count()) errors.push('勝利画面に「今回の大暴れ」パネルが無い');
  if (!winText.includes('最大CHAIN') || !winText.includes('4')) errors.push('最大CHAINが読めない');
  if (!winText.includes('最大OVERKILL') || !winText.includes('180%')) errors.push('最大OVERKILLが読めない');
  if (!winText.includes('今回の大暴れ')) errors.push('パネル見出しが読めない');
  if (!winText.includes('いちばん長くつながった連鎖')) errors.push('CHAINと経路の関係を説明する行が無い');
  const steps = await page.locator(".breakthrough-panel .chain-step").allInnerTexts();
  if (steps.join(' → ') !== '攻撃 → 追い剥ぎ +1G → 強欲 → 追加攻撃') {
    errors.push('代表CHAIN経路が読めない: ' + steps.join(' → '));
  }
  // 2倍速で見えなかった「誰が戻したか」が、戦果で一目で読めること
  if (!await page.locator('.facility-panel').count()) errors.push('勝利画面に「施設と死者の働き」パネルが無い');
  for (const want of ['施設Lv.3', '3 回まで働く', '墓地', '骸骨従者1体', '全滅回避']) {
    if (!winText.includes(want)) errors.push('施設の働きが読めない: ' + want);
  }
  const deathSteps = await page.locator('.facility-panel .death-chain .chain-step').allInnerTexts();
  if (deathSteps.join(' → ') !== '致死を耐えた → 戦死 → 死霊術で蘇生（全快） → 骸骨従者を召喚') {
    errors.push('死者の連鎖が読めない: ' + deathSteps.join(' → '));
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

  // バッジが増えても名前が読めること（守りたい性質は「誰が働いたか分かる」こと）。
  // 以前はバッジと名前が同じ行を取り合い、働いた者ほど名前が消えていた（幅1pxまで潰れていた）。
  const nameFit = await page.evaluate(() => {
    const rows = [
      { id: 'x0', name: '古参のゴブ太', race: 'ゴブリン', dealt: 120, taken: 20, kills: 3, maxOverkill: 420,
        survived: true, died: false, resources: { gold: 5, soul: 1 }, traitTriggers: 6, revivesGiven: 1,
        selfRevives: 0, healed: 0, voice: 'やってやったぜ！' },
      { id: 'x1', name: 'スライムのぬる子', race: 'スライム', dealt: 8, taken: 90, kills: 0, maxOverkill: 0,
        survived: false, died: true, resources: { gold: -2 }, traitTriggers: 1, revivesGiven: 0,
        selfRevives: 1, healed: 4 },
      { id: 'x2', name: 'ホネオ', race: '骸骨兵', dealt: 0, taken: 0, kills: 0, maxOverkill: 0,
        survived: true, died: false, resources: {}, traitTriggers: 0, revivesGiven: 0, selfRevives: 0, healed: 0 }
    ];
    UI.set(UI.contributionPanel(rows));
    return Array.from(document.querySelectorAll('.contrib-row')).map(row => {
      const name = row.querySelector('.contrib-name');
      const bar = row.querySelector('.contrib-bar');
      return {
        text: name.textContent,
        clipped: name.scrollWidth > name.clientWidth + 1,
        badges: row.querySelectorAll('.contrib-badge').length,
        barWidth: Math.round(bar.getBoundingClientRect().width)
      };
    });
  });
  for (const row of nameFit) {
    if (row.clipped) errors.push(`バッジ${row.badges}個で名前が省略される: ${row.text}`);
  }
  if (nameFit[0].badges < 4) errors.push('バッジが増える行を作れていない: ' + nameFit[0].badges);
  if (nameFit.some(row => row.barWidth < 200)) {
    errors.push('貢献バーが細くなっている: ' + nameFit.map(r => r.barWidth).join(','));
  }

  // 敗北画面でも同じ表示契約
  const loseText = await setup(false);
  if (!await page.locator('.breakthrough-panel').count()) errors.push('敗北画面に「今回の大暴れ」パネルが無い');
  if (!loseText.includes('最大CHAIN')) errors.push('敗北画面で最大CHAINが読めない');
  if (!await page.locator('.facility-panel').count()) errors.push('敗北画面に「施設と死者の働き」パネルが無い');

  await setup(true);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/report-chain.png', fullPage: true });

  // 因果情報の無い旧セーブでも落ちず、経路だけが消える
  const oldText = await page.evaluate(() => {
    const b = Game.state.lastBattle;
    b.chainSummary = { maxChain: 1, chainCount: 1, eventCount: 1, chains: [] };
    delete b.facility; delete b.facilitySummary; delete b.deathChains;
    UI.result();
    return document.body.innerText;
  });
  if (!oldText.includes('最大CHAIN')) errors.push('旧データで大暴れパネルが消えてしまう');
  if (await page.locator(".breakthrough-panel .chain-step").count()) errors.push("旧データなのに経路が出ている");
  if (await page.locator('.facility-panel').count()) errors.push('施設要約の無い旧データなのに施設パネルが出ている');

  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/report-panel.png', fullPage: true });
  console.log(errors.length ? '✗ ' + errors.join('\n✗ ') : '✓ 主要記録2つ・代表CHAIN経路・非ダメージバッジ');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
