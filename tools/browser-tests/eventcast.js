// イベント本文の立ち絵＋吹き出し分割（WORK_SPLIT の G）。
// events.js の契約は変えず、本文の「」を話者へ割り当てる。
// いちばん怖いのは**取り違え**なので、割り当ての規則を直接確かめる。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo } = require('./helpers.js');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await autoDismissMormo(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await page.locator('[data-action="hire"]:not([disabled])').first().click();

  // 1) 実イベントが立ち絵と吹き出しで出る
  const shown = await page.evaluate(() => {
    const st = Game.state;
    st.gold = 30; st.stage = 4;
    st.roster.forEach(m => { m.loyalty = 55; });
    const ev = EVENTS.find(e => e.id === 'headhunted');
    const cast = ev.cast(st);
    st.pendingEvent = { id: ev.id, cast, text: ev.text(st, Game.resolveCast(cast)) };
    st.phase = 'event';
    UI.event();
    const actor = Game.resolveCast(cast).actor;
    return { actor: actor.name,
      cast: document.querySelectorAll('.event-cast-card').length,
      faces: document.querySelectorAll('.event-say .avatar, .event-say .mormo-face').length,
      speakers: [...document.querySelectorAll('.event-bubble b')].map(e => e.textContent),
      lines: [...document.querySelectorAll('.event-line')].map(e => e.textContent) };
  });
  assert.equal(shown.cast, 1, 'cast にいる者が登場人物として並ぶ');
  assert.equal(shown.faces, 1, '台詞には立ち絵が付く');
  assert.deepEqual(shown.speakers, [shown.actor], '名乗らない台詞も、登場人物が1人なら本人のものになる');
  assert.ok(shown.lines.length >= 1 && shown.lines.every(l => !l.includes('「')),
    '地の文には台詞が残らない（二重に出さない）');

  // 2) 割り当ての規則
  const rules = await page.evaluate(() => {
    const a = { name: 'ゴブ太', race: 'ゴブリン', tplId: 'goblin', loyalty: 40 };
    const b = { name: 'ボル', race: 'オーガ', tplId: 'ogre', loyalty: 60 };
    const two = { actor: a, other: b };
    const say = script => script.filter(x => x.say).map(x => [x.say.name, x.body]);
    return {
      // 同じ行に2人いても、台詞の直前にいる方が話者
      nearest: say(UI.eventScript('ゴブ太が言い返す前に、ボルが「うるさい」と吠えた。', two)),
      // 名前が無い次の台詞は、直前の話者が続けて話す
      carry: say(UI.eventScript('ボルが吠えた。「うるさい」\n「二度は言わん」', two)),
      // モルモは登場人物でなくても話者になれる
      mormo: say(UI.eventScript('モルモが割って入る。「け、経費デス！」', two)),
      // 誰にも割り当てられない台詞は地の文のまま（嘘の話者を作らない）
      orphan: UI.eventScript('食堂に「払え」の張り紙があった。', two).map(x => [x.say && x.say.name, x.body])
    };
  });

  const expressions = await page.evaluate(() => ({
    surprise: UI.eventExpressionFor('えっ、まさか！？'),
    smirk: UI.eventExpressionFor('へへ、報酬はいただきだ。'),
    tears: UI.eventExpressionFor('ごめん、もう辞めたい。'),
    plain: UI.eventExpressionFor('了解した。'),
    goblin: UI.eventFaceHtml({ tplId: 'goblin', race: 'ゴブリン' }, 'surprise'),
    slime: UI.eventFaceHtml({ tplId: 'slime', race: 'スライム' }, 'tears'),
    kingSlime: UI.eventFaceHtml({ tplId: 'king_slime', race: 'キングスライム' }, 'smirk'),
    kobold: UI.eventFaceHtml({ tplId: 'kobold', race: 'コボルト' }, 'surprise'),
    fallback: UI.eventFaceHtml({ tplId: 'orc', race: 'オーク' }, 'surprise')
  }));
  assert.deepEqual([expressions.surprise, expressions.smirk, expressions.tears, expressions.plain],
    ['surprise', 'smirk', 'tears', null], '台詞の感情語から表情を選ぶ');
  assert.match(expressions.goblin, /events\/goblin\/surprise\.webp/, '制作済み差分を使う');
  assert.match(expressions.slime, /events\/slime\/tears\.webp/, '顔のないスライムにも制作済み差分を使う');
  assert.match(expressions.kingSlime, /events\/king_slime\/smirk\.webp/, '合体後のIDでも制作済み差分を使う');
  assert.match(expressions.kobold, /events\/kobold\/surprise\.webp/, 'コボルトの制作済み差分を使う');
  assert.doesNotMatch(expressions.fallback, /event-expression/, '未制作種族は通常絵へ戻す');
  const loaded = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.innerHTML = UI.eventFaceHtml({ tplId: 'goblin', race: 'ゴブリン' }, 'tears');
    document.body.appendChild(host);
    const img = host.querySelector('img');
    await new Promise(resolve => img.complete ? resolve() : img.addEventListener('load', resolve, { once: true }));
    return { width: img.naturalWidth, height: img.naturalHeight };
  });
  assert.deepEqual(loaded, { width: 512, height: 512 }, '表情差分の実ファイルを透過正方形で読める');
  assert.deepEqual(rules.nearest, [['ボル', 'うるさい']], '台詞の直前に名前がある方が話者');
  assert.deepEqual(rules.carry, [['ボル', 'うるさい'], ['ボル', '二度は言わん']], '名乗らない続きは直前の話者');
  assert.deepEqual(rules.mormo, [['モルモ', 'け、経費デス！']], 'モルモも話者になれる');
  assert.deepEqual(rules.orphan, [[null, '食堂に「払え」の張り紙があった。']],
    '誰の台詞か決められないときは地の文のまま残す');

  // 3) 結果画面でも当事者が残る
  const after = await page.evaluate(() => {
    // 慰留金（0番）は結果が確定する。1番は50%で当人が消え、立ち絵も消えてしまう
    Game.chooseEvent(0);
    UI.event();
    return { cast: document.querySelectorAll('.event-cast-card').length,
      outcome: !!Game.state.eventOutcome, kept: !!Game.state.eventCast };
  });
  assert.ok(after.outcome, '選択の結果が出る');
  assert.ok(after.kept, '結果画面のために当事者の uid が残る');
  assert.equal(after.cast, 1, 'その後の画面にも当事者の立ち絵が出る');

  assert.deepEqual(errors, []);
  console.log('✓ イベント: 登場人物の立ち絵・台詞の吹き出し・話者の割り当て規則・結果画面まで残る');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
