// 将軍への転身（docs/SPEC_GENERAL_2026-09-13.md 2.2・2.6）：
// 名簿に二つ名と紫の縁／戦場の札にも／指示窓に将軍技「魔王の力」／転身のカットイン。
//   node tools/browser-tests/general.js
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

// 将軍1体と兵卒1体の軍団を作る（転身は Game.promote を通す＝本番と同じ道）
const SETUP = () => {
  const mk = (uid, name, x) => Object.assign({
    uid, tplId: 'orc', name, race: 'オーク', job: '兵', hp: 200, atk: 20, def: 6, spd: 5,
    salary: 3, loyalty: 60, traits: [], skills: [], tags: [], quote: '', unpaid: false, injured: 0,
    merit: 0, rankId: 'soldier', spirit: 1, base: { hp: 200, atk: 20, def: 6 }, grown: { hp: 0, atk: 0, def: 0 },
    record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 }
  }, x);
  Game.state.roster = [mk(901, 'ゴルド'), mk(902, 'ヘイソツ')];
  Game.state.activeUids = [901, 902];
  Game.state.gold = 200; Game.state.food = 60;
  const general = Game.state.roster[0];
  const rank = PROMOTION_RANKS.find(r => r.id === 'general');
  Game.promote(general, rank, []);
  Game.state.phase = 'formation';
  App.render();
  BattleScene.speed = 4;
  return { name: general.name, display: Game.displayName(general), epithet: general.epithet, spirit: general.spirit };
};

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await autoDismissMormo(page);
  await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.slot-card [data-action="new"][data-slot="1"]').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 転身：二つ名が付き、気合が満タンになる');
  const info = await page.evaluate(SETUP);
  ok(!!info.epithet, `二つ名が付く（${info.epithet}）`);
  ok(info.display === `${info.epithet}・${info.name}`, `表示名は「二つ名・名前」（${info.display}）`);
  ok(info.spirit === 4, `気合が満タン（上限+1の ${info.spirit}）`);

  console.log('\n▼ 名簿：二つ名と紫の縁');
  const roster = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.member-row')];
    const general = rows.find(r => r.classList.contains('rank-general'));
    return {
      shown: general ? general.querySelector('.member-row-main b').textContent.trim() : '',
      rank: general ? general.querySelector('.member-row-main small').textContent.trim() : '',
      glow: general ? getComputedStyle(general).boxShadow : 'none',
      plain: rows.filter(r => !r.classList.contains('rank-general')).length
    };
  });
  ok(/・ゴルド/.test(roster.shown), `名簿の行に二つ名（${roster.shown}）`);
  ok(/将軍/.test(roster.rank), `階級は将軍（${roster.rank}）`);
  ok(/190, 130, 255|rgb\(190/.test(roster.glow), `行に紫の縁が出る（${roster.glow.slice(0, 46)}）`);
  ok(roster.plain >= 1, '兵卒の行はそのまま');
  // 決着画面の札（.card）にも縁とバッジ
  const card = await page.evaluate(() => {
    Game.state.lastBattle = { victory: true, army: 'テスト軍', region: '', reward: 1, lootGold: 0,
      notes: [], synergies: [], incidents: [], contribution: [], logLength: 0 };
    Game.state.lastPayrollReport = { policyId: 'regular', paid: 0, base: 0, loyaltyDelta: 0 };
    Game.state.phase = 'result'; App.render();
    const cards = [...document.querySelectorAll('.card')];
    const g = cards.find(c => c.querySelector('.rank-general'));
    return { name: g ? g.querySelector('.card-name').textContent.trim() : '',
      badge: g ? g.querySelector('.rank-badge').textContent.trim() : '',
      glow: g ? getComputedStyle(g).boxShadow : 'none' };
  });
  ok(/・ゴルド/.test(card.name) && card.badge === '将軍', `決着の札にも二つ名と階級（${card.name} / ${card.badge}）`);
  ok(/190, 130, 255|rgb\(190/.test(card.glow), `決着の札にも紫の縁（${card.glow.slice(0, 46)}）`);
  await page.evaluate(() => { Game.state.phase = 'formation'; App.render(); });
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/general-roster-390.png', fullPage: true });

  console.log('\n▼ 人物詳細：二つ名が見出しに');
  await page.evaluate(() => document.querySelector('[data-action="member"][data-uid="901"]').click());
  await page.waitForTimeout(150);
  const detail = await page.evaluate(() => {
    const d = document.querySelector('.member-detail');
    return { head: d.querySelector('h2').textContent.trim(), text: d.innerText };
  });
  ok(/・ゴルド/.test(detail.head), `詳細の見出しに二つ名（${detail.head}）`);

  await page.evaluate(() => document.querySelector('[data-action="closemember"]').click());

  console.log('\n▼ 戦場：札の縁と、指示窓の将軍技');
  await page.click('[data-action="deploy"]');
  await page.waitForSelector('#command-panel:not([hidden])', { timeout: 20000 });
  const field = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#band-player .bu')];
    const general = cards.find(c => c.classList.contains('rank-general'));
    return {
      found: !!general,
      name: general ? general.querySelector('.bu-name').textContent.trim() : '',
      others: cards.filter(c => !c.classList.contains('rank-general')).length
    };
  });
  ok(field.found, '戦場の札に将軍の印');
  ok(/・ゴルド/.test(field.name), `戦場の札にも二つ名（${field.name}）`);
  ok(field.others >= 1, '兵卒の札は普通のまま');
  const win = await page.evaluate(() => {
    // 将軍（p0）の窓を開く
    const seq = BattleScene.cmdSeq;
    const at = BattleScene.manual.prompt.allies.findIndex(a => /ゴルド/.test(a.name));
    if (at >= 0) { seq.idx = at; seq.mode = 'menu'; BattleScene.renderCommandPanel(BattleScene.manual.prompt); }
    const btn = document.querySelector('.cmd-btn[data-skill="general_might"]');
    const ally = BattleScene.manual.prompt.allies[at >= 0 ? at : 0];
    return {
      text: btn ? btn.innerText.replace(/\n/g, ' ').trim() : '',
      disabled: btn ? btn.disabled : null,
      spirit: (document.querySelector('.cmd-spirit') || {}).innerText || '',
      spiritMax: ally.spiritMax, cost: (ally.skills.find(s => s.id === 'general_might') || {}).cost
    };
  });
  // 指示窓は技の**正式名**を出す。「力を示せ」は魔王の号令の言い方で、
  // それだけだと何の技か覚えられない（2026-09-18 オーナー指摘）。
  ok(/魔王の力/.test(win.text), `指示窓に将軍技「魔王の力」（${win.text}）`);
  ok(win.cost === 2 && win.disabled === false, `気合2で押せる（cost=${win.cost}）`);
  ok(win.spiritMax === 4, `気合の上限が4（${win.spiritMax}）`);
  ok(/●●●●/.test(win.spirit), `窓の気合表示も4つ（${win.spirit}）`);
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/general-window-390.png' });
  // 撃てること（敵全体に当たり、味方の気合が増える）
  await page.evaluate(() => document.querySelector('.cmd-btn[data-skill="general_might"]').click());
  await page.evaluate(() => { const p = document.querySelector('[data-pick=""]'); if (p) p.click(); });
  await page.evaluate(async () => {
    for (let i = 0; i < 20 && !document.getElementById('command-panel').hidden; i++) {
      const pick = document.querySelector('[data-pick=""]');
      if (pick) { pick.click(); continue; }
      const atk = document.querySelector('.cmd-btn[data-cmd="attack"]');
      if (atk) atk.click();
      await new Promise(r => setTimeout(r, 50));
    }
  });
  await page.evaluate(() => BattleScene.skip());
  await page.waitForFunction(() => BattleScene.finished === true, null, { timeout: 60000 });
  const fired = await page.evaluate(() => ({
    exec: BattleScene.timeline.filter(e => e.type === 'order_exec' && e.skillId === 'general_might').length,
    hits: BattleScene.timeline.filter(e => e.skillId === 'general_might' && e.type === 'attack').length,
    gained: Object.keys((BattleScene.manual.result || {}).spiritGained || {}).length
  }));
  ok(fired.exec === 1, `将軍技が1回出た（${fired.exec}）`);
  ok(fired.hits >= 1, `敵に当たった（${fired.hits}件）`);

  console.log('\n▼ 転身のカットイン（決着画面）');
  await page.evaluate(() => {
    Game.state.lastPromotions = [{ uid: 903, name: 'ゴルド', rankId: 'general', rankName: '将軍',
      message: '魔王から濃密な魔力を授かり、軍を率いる存在へ転身した', epithet: '鉄壁', displayName: '鉄壁・ゴルド', general: true }];
    Game.state.phase = 'result';
    App.render();
  });
  await page.waitForTimeout(300);
  const cutin = await page.evaluate(() => {
    const box = document.getElementById('general-cutin');
    return {
      shown: !!box && box.classList.contains('show'),
      name: box ? box.querySelector('.gc-name').textContent.trim() : '',
      panel: (document.querySelector('.promotion-panel') || {}).innerText || ''
    };
  });
  ok(cutin.shown, 'カットインが出る');
  ok(cutin.name === '鉄壁・ゴルド', `二つ名が浮かぶ（${cutin.name}）`);
  ok(/転身/.test(cutin.panel) && /魔王の力/.test(cutin.panel), `人事欄も転身として出る（${cutin.panel.replace(/\n/g, ' ').slice(0, 70)}）`);
  ok(/宰相モルモ/.test(cutin.panel), 'モルモの一言が出る');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/general-cutin-390.png' });
  // タップで飛ばせる
  await page.evaluate(() => document.getElementById('general-cutin').click());
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('general-cutin')), 'タップで飛ばせる');

  ok(errs.length === 0, `ページエラーなし${errs.length ? '：' + errs[0] : ''}`);
  await b.close();
  console.log(process.exitCode ? '失敗あり' : '全通過');
})().catch(e => { console.error('✗', e.message); process.exit(1); });
