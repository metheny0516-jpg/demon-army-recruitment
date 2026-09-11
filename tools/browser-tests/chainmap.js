// 編成画面の「連鎖の見取り図」（略奪連鎖の試作）。
// 見るのは表示の形ではなく、守りたい性質:
//   起点と反応が編成から出ること／回り続けるかを言い切ること／
//   手持ちに無い能力を勧めないこと／編成を変えると答えも変わること。
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { autoDismissMormo, enterMissionPhase } = require('./helpers.js');
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

const goblin = (uid, name) => ({ uid, tplId: 'goblin', name, race: 'ゴブリン', job: '', hp: 30, atk: 10, def: 2, spd: 8,
  salary: 2, loyalty: 70, traits: ['pickpocket'], tags: [], quote: '', unpaid: false });
const kobold = (uid, name) => ({ uid, tplId: 'kobold', name, race: 'コボルト', job: '', hp: 28, atk: 9, def: 2, spd: 9,
  salary: 2, loyalty: 70, traits: ['greedy'], tags: [], quote: '', unpaid: false });
const ogre = (uid, name) => ({ uid, tplId: 'ogre', name, race: 'オーガ', job: '', hp: 60, atk: 14, def: 6, spd: 4,
  salary: 5, loyalty: 70, traits: [], tags: [], quote: '', unpaid: false });

async function formationWith(page, roster, deployed) {
  await page.evaluate(([roster, deployed]) => {
    Game.state.roster = roster;
    Game.state.activeUids = deployed;
    Game.state.gold = 50;
    Game.state.phase = 'formation';
    App.render();
  }, [roster, deployed]);
  await page.waitForTimeout(60);
  await page.locator('[data-action="castle"]').first().click();
  await page.locator('[data-action="castletab"][data-tab="advisor"]').click();
}
const panelText = page => page.locator('.chain-map').innerText();

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await autoDismissMormo(page);
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + process.env.GAME + '/index.html');
  await page.click('[data-action="new"]');
  await page.locator('[data-action="hire"]:not([disabled])').first().click();
  await enterMissionPhase(page);

  console.log('▼ 略奪と関係ない編成には出さない（表示量を増やさない）');
  await formationWith(page, [ogre(1, 'オグ'), ogre(2, 'ドス')], [1, 2]);
  ok(await page.locator('.chain-map').count() === 0, 'ゴブリンも金貨の駒も居ない編成では見取り図ごと出ない');

  console.log('▼ 起点だけの編成');
  await formationWith(page, [goblin(1, 'ゴブ太'), ogre(2, 'オグ')], [1, 2]);
  let text = await panelText(page);
  ok(text.includes('追い剥ぎ') && text.includes('ゴブ太'), '起点に《追い剥ぎ》と持ち主の名前が出る');
  ok(text.includes('初めてダメージ'), '発火条件が読める');
  ok(text.includes('反応する者がいない'), '反応が居ないことをはっきり言う');

  console.log('▼ 控えの駒で繋がることだけを勧める');
  await formationWith(page, [goblin(1, 'ゴブ太'), ogre(2, 'オグ'), kobold(3, 'コボ助')], [1, 2]);
  text = await panelText(page);
  ok(text.includes('いまの手持ちで繋がるもの'), '手持ちで埋まる欠けがあるときだけ案が出る');
  ok(text.includes('コボ助'), '控えの誰を動かせばよいかを名指しする');

  console.log('▼ 起点と反応がつながった編成');
  await formationWith(page, [goblin(1, 'ゴブ太'), kobold(3, 'コボ助')], [1, 3]);
  text = await panelText(page);
  ok(text.includes('強欲') && text.includes('追加攻撃'), '反応と、その反応が次に出す信号が出る');
  ok(text.includes('まだ回り続けはしない'), '一度きりの起点だけなら、回り続けないと正しく言う');

  console.log('▼ 何度も回る編成');
  const horde = [goblin(1, 'ゴブ太'), goblin(2, 'ゴブ次'), goblin(4, 'ゴブ三'), goblin(5, 'ゴブ四'), kobold(3, 'コボ助')];
  await formationWith(page, horde, [1, 2, 4, 3]);
  text = await panelText(page);
  ok(text.includes('ゴブリン軍団'), '繰り返し撃てる起点としてシナジーが並ぶ');
  ok(text.includes('回り続ける形になっている'), '回り続けると言い切る');
  ok(text.includes('追い剥ぎコンビ'), '成立している反応側のシナジーも並ぶ');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/chain-map-390.png', fullPage: true });

  console.log('▼ 表示量');
  const lines = (await panelText(page)).split('\n').filter(l => l.trim()).length;
  ok(lines <= 20, `見取り図は ${lines} 行（20行以内に収める。読ませる量を増やしすぎない）`);

  console.log(errs.length ? '✗ ' + errs.join('\n✗ ') : '✓ 連鎖の見取り図：起点・反応・再発火・手持ちだけの案（390px）');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
