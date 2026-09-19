const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html?nostory=1');
  await page.click('[data-action="new"]');
  await page.evaluate(() => { Game.state.gold = 30; App.render(); });
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  if (await page.evaluate(() => Game.state.phase) !== 'recruit') throw new Error('無料枠終了で面接が自動終了した');
  const first = await page.locator('[data-action="hire"]').first().innerText();
  if (!first.includes('紹介料 4G') || !first.includes('給与')) throw new Error('紹介料と給与を区別していない');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  const second = await page.locator('[data-action="hire"]').first().innerText();
  if (!second.includes('紹介料 8G')) throw new Error('追加紹介料が倍増しない');
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  if (!await page.locator('[data-action="skip"]').count()) throw new Error('再開後に面接終了操作がない');
  await page.locator('[data-action="skip"]').click();
  if (await page.evaluate(() => Game.state.phase) !== 'mission') throw new Error('明示終了で作戦会議へ進まない');

  // U1: 応募者の能力→接続1件→代償の順で読み、必要操作と起点/反応を区別できる。
  await page.evaluate(() => {
    const [looter, greedy] = Game.state.roster;
    looter.name = 'グルグ'; looter.race = 'ゴブリン'; looter.traits = ['pickpocket']; looter.tags = [];
    greedy.name = 'ボル'; greedy.race = 'インプ'; greedy.traits = ['greedy']; greedy.tags = ['caster'];
    Game.state.roster = [looter];
    Game.state.activeUids = [looter.uid];
    Game.state.applicants = [greedy];
    Game.state.phase = 'recruit';
    UI.recruit();
  });
  // 接続は履歴書から人物の詳細へ移した（docs/SPEC_RESUME_CARD_2026-09-18.md §A-2）。
  // 読む順（能力→接続→代償）は詳細の中で保つ。履歴書には手掛かり（特性名）だけが残る。
  await page.evaluate(() => UI.memberDetail(null, 0));
  await page.waitForSelector('.member-detail');
  const cardText = await page.locator('.member-detail').first().innerText();
  if (!cardText.includes('起点\nグルグの《追い剥ぎ》') || !cardText.includes('反応\nボルの《強欲》')) {
    throw new Error('採用接続で起点と反応者を区別していない');
  }
  if (!cardText.includes('1Gを略奪予約') || !cardText.includes('必要：採用・出撃')) {
    throw new Error('略奪予約と採用・出撃条件が読めない');
  }
  const order = await page.locator('.member-detail').first().evaluate(detail => {
    const at = sel => { const el = detail.querySelector(sel); return el ? [...detail.querySelectorAll('*')].indexOf(el) : -1; };
    return { trait: at('.trait'), link: at('.applicant-links'), cost: at('.hire-food') };
  });
  if (!(order.trait < order.link && order.link < order.cost)) throw new Error('能力→接続→代償の情報順になっていない');
  await page.evaluate(() => { Game.state.phase = 'recruit'; UI.recruit(); });

  // U1: 種族に限定せず、《死霊術》を持つ本人の生存条件と最前列警告を既存欄へ出す。
  await page.evaluate(() => {
    const unit = Game.state.roster[0];
    unit.name = 'ネル'; unit.traits = ['necromancy'];
    Game.state.activeUids = [unit.uid];
    Game.state.phase = 'formation';
    UI.formation();
  });
  await page.locator('[data-action="castle"]').first().click();
  await page.locator('[data-action="castletab"][data-tab="advisor"]').click();
  const deathText = await page.locator('text=💀 死亡反応').locator('..').innerText();
  if (!deathText.includes('本人が生存してラウンド終了') || !deathText.includes('ネルは最前列')) {
    throw new Error('死霊術本人の生存条件と最前列警告が読めない');
  }
  // ── 履歴書はスマホ1画面（docs/SPEC_RESUME_CARD_2026-09-18.md §A-4）──
  // 攻略のヒント（食料・接続・技・特性の説明）は履歴書から外し、人物の詳細に残す。
  await page.evaluate(() => { Game.newRun(); App.render(); });
  await page.waitForSelector('.applicant-member');
  const resume = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.applicant-member')];
    return cards.map((c, i) => ({
      i,
      height: Math.round(c.getBoundingClientRect().height),
      // §A-3 の構造（めくり演出が前提にする契約）
      index: c.querySelector('.card.resume') ? c.querySelector('.card.resume').dataset.resumeIndex : null,
      parts: ['resume-head', 'resume-stats', 'resume-terms', 'resume-person'].filter(k => c.querySelector('.' + k)),
      buttonOutside: !!c.querySelector(':scope > button[data-action="hire"]'),
      // ネタバレ要素
      food: c.querySelectorAll('.hire-food').length,
      links: c.querySelectorAll('.applicant-links').length,
      skillHint: /戦で技/.test(c.textContent),
      traitDesc: c.querySelectorAll('.trait').length,
      merit: /戦功/.test(c.textContent),
      spirit: /気合/.test(c.textContent)
    }));
  });
  for (const r of resume) {
    if (r.height > 560) throw new Error(`履歴書が1画面に収まらない（${r.height}px、${r.i + 1}枚目）`);
    if (String(r.index) !== String(r.i)) throw new Error(`data-resume-index が添字と合わない（${r.index}）`);
    if (r.parts.length !== 4) throw new Error(`札の区画が足りない（${r.parts.join('、')}）`);
    if (!r.buttonOutside) throw new Error('採用ボタンが札の外に無い（めくりが札だけを裏返せない）');
    if (r.food) throw new Error('履歴書に食料消費が出ている');
    if (r.links) throw new Error('履歴書に軍団との接続が出ている');
    if (r.skillHint) throw new Error('履歴書に覚える技が出ている');
    if (r.traitDesc) throw new Error('履歴書に特性の説明文が出ている');
    if (r.merit || r.spirit) throw new Error('履歴書に戦功／気合が出ている');
  }

  // 人物の詳細には今までどおり残っている（ヒントを消したのではなく、履歴書から外しただけ）。
  // 応募者の引きに左右されないよう、特性を持つ応募者を1人立ててから開く。
  await page.evaluate(() => {
    const m = Game.state.applicants[0];
    m.traits = ['pickpocket'];
    Game.state.phase = 'recruit';
    UI.recruit();
    UI.memberDetail(null, 0);
  });
  await page.waitForTimeout(150);
  const detail = await page.evaluate(() => {
    const d = document.querySelector('.member-detail');
    return d ? { traitDesc: d.querySelectorAll('.trait').length, text: d.innerText } : null;
  });
  if (!detail) throw new Error('人物の詳細が開かない');
  if (!detail.traitDesc) throw new Error('詳細に特性の説明が無い');
  if (!/接続|つながる|今の軍団/.test(detail.text) && !/戦で技/.test(detail.text)) {
    throw new Error('詳細から接続・技のヒントまで消えている');
  }

  // PC（1128px）では今までどおり2列のまま
  await page.setViewportSize({ width: 1128, height: 1000 });
  await page.evaluate(() => { Game.newRun(); App.render(); });
  await page.waitForSelector('.applicant-member');
  const columns = await page.evaluate(() => {
    const tops = [...document.querySelectorAll('.applicant-member')].map(c => Math.round(c.getBoundingClientRect().top));
    return new Set(tops).size;
  });
  const count = await page.evaluate(() => document.querySelectorAll('.applicant-member').length);
  if (count > 1 && columns >= count) throw new Error(`1128px で1列に落ちている（${count}枚が${columns}段）`);
  await page.setViewportSize({ width: 390, height: 844 });

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('✓ 面接継続・追加紹介・U1情報順/接続条件・死霊術の生存条件'
    + `・履歴書1画面（最大 ${Math.max(...resume.map(r => r.height))}px・ネタバレ無し・PCは2列）`);
  await browser.close();
})().catch(e => { console.error('✗', e.message); process.exit(1); });
