// モルモが spotlight の事実に反応する（D1・設計書6.3）。
//
// 守りたい性質:
//   1. 名前を貼るだけでなく、起きた行動そのものに反応すること
//   2. 起きる前にしゃべらないこと（根拠が全部出てから出る）
//   3. 1戦闘に1回だけ、全滅が最優先という既存の制約を壊さないこと
//   4. 起点と反応が同じ人の回は「AがBを動かした」と言わないこと
//   5. spotlight が無い戦闘では従来の台詞のままであること
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const errs = [];
const ok = (c, m) => { if (!c) errs.push(m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };

const relayTimeline = () => ([
  { type: 'battle_start', eventId: 'e0',
    player: [{ id: 'p0', name: 'グルグ' }, { id: 'p1', name: 'ボル' }], enemy: [{ id: 'x0', name: '衛兵' }] },
  { type: 'attack', eventId: 'ea', fromId: 'p0', toId: 'x0', dmg: 3 },
  { type: 'resource_gain', eventId: 'e1', chainId: 'e1', sourceId: 'p0', resource: 'gold', amount: 1, label: '追い剥ぎ' },
  { type: 'trait_trigger', eventId: 'e2', parentEventId: 'e1', sourceId: 'p1', traitId: 'greedy', name: '強欲' },
  { type: 'attack', eventId: 'e3', parentEventId: 'e2', fromId: 'p1', toId: 'x0', dmg: 44, dead: true },
  // 実測では着地のあとに4件以上残る戦闘が99%。決着の片付けで即消えない実戦の形に合わせる
  { type: 'round_start', eventId: 'er', round: 2 },
  { type: 'attack', eventId: 'e5', fromId: 'p0', toId: 'x0', dmg: 2 },
  { type: 'attack', eventId: 'e6', fromId: 'p1', toId: 'x0', dmg: 2 },
  { type: 'attack', eventId: 'e7', fromId: 'p0', toId: 'x0', dmg: 2 },
  { type: 'result', eventId: 'e4', victory: true }
]);

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + process.env.GAME + '/battle-preview.html');

  console.log('▼ 略奪 → 追撃に反応する');
  const picked = await page.evaluate(tl => {
    const plan = BattleScene.pickMormoAside(tl);
    return plan && { scene: plan.scene, atId: plan.at.eventId, kind: plan.spotlight && plan.spotlight.kind };
  }, relayTimeline());
  ok(picked && picked.scene === 'spotlight', 'spotlight の場面が選ばれる');
  ok(picked.kind === 'loot_relay', '反応する事実は略奪の連鎖');
  ok(picked.atId === 'e3', '出るのは根拠の最後（追撃が当たった瞬間）。起きる前にしゃべらない');

  const said = await page.evaluate(() => MormoScene.spotlightLine({
    kind: 'loot_relay', origin: { id: 'p0', name: 'グルグ' }, actor: { id: 'p1', name: 'ボル' },
    target: { id: 'x0', name: '衛兵' }, sameActor: false, numbers: {}, evidence: [] }));
  console.log('    ' + said.text);
  ok(/グルグ/.test(said.text) && /ボル/.test(said.text), '起点と反応した人の両方を呼ぶ');
  ok(/殿/.test(said.text), 'モルモの口調（○○殿）で話す');
  ok(!/\{/.test(said.text), '差し込みが残っていない');

  console.log('▼ 起きたことしか言わない');
  ok(!/勝|敗|滅|死/.test(said.text), '戦闘結果や死の話をしない');

  console.log('▼ 3種それぞれに別の反応がある');
  const kinds = await page.evaluate(() => ['loot_relay', 'meal_boost', 'revive_return'].map(kind =>
    MormoScene.spotlightLine({ kind, origin: { name: 'ミミ' }, actor: { name: 'ドン' },
      target: { name: '騎士' }, sameActor: false, numbers: {}, evidence: [] }).text));
  kinds.forEach(t => console.log('    ' + t));
  ok(new Set(kinds).size === 3, '3種が同じ台詞にならない（汎用文に名前を貼っただけにしない）');
  ok(kinds.every(t => /ミミ/.test(t) && /ドン/.test(t)), 'どの種類でも2人を呼ぶ');

  console.log('▼ 言えない回は言わない');
  const same = await page.evaluate(() => MormoScene.spotlightLine({
    kind: 'loot_relay', origin: { id: 'p0', name: 'グルグ' }, actor: { id: 'p0', name: 'グルグ' },
    target: null, sameActor: true, numbers: {}, evidence: [] }));
  ok(same === null, '起点と反応が同じ人なら「AがBを動かした」と言わない');

  console.log('▼ 既存の制約を壊さない');
  const wipe = await page.evaluate(tl => {
    tl[tl.length - 1] = { type: 'result', eventId: 'e4', victory: false, wipe: 'player' };
    return BattleScene.pickMormoAside(tl).scene;
  }, relayTimeline());
  ok(wipe === 'wipe', '全滅は spotlight より優先される');
  const discovery = await page.evaluate(tl => {
    tl.splice(1, 0, { type: 'synergy', eventId: 'es', id: 'goblin_pair', name: '追い剥ぎコンビ', firstDiscovery: true });
    return BattleScene.pickMormoAside(tl).scene;
  }, relayTimeline());
  ok(discovery === 'discovery', '初めての接続は spotlight より優先される（設計書6.1の順）');
  const plain = await page.evaluate(() => BattleScene.pickMormoAside([
    { type: 'battle_start', eventId: 'e0', player: [{ id: 'p0', name: 'オグ' }], enemy: [{ id: 'x0', name: '衛兵' }] },
    { type: 'attack', eventId: 'e1', fromId: 'p0', toId: 'x0', dmg: 5 },
    { type: 'result', eventId: 'e2', victory: true }
  ]));
  ok(plain === null, '何も繋がらなかった戦闘では一言そのものが出ない');
  // 実測で spotlight は79%の戦闘で成立する。全部しゃべらせると一言が事件でなくなるので、
  // 撃破まで届いた回だけに絞ってある（従来36% → 48%）。
  const notLanded = await page.evaluate(tl => {
    tl[4] = { ...tl[4], dead: false };
    const plan = BattleScene.pickMormoAside(tl);
    return plan && plan.scene;
  }, relayTimeline());
  ok(notLanded !== 'spotlight', '撃破まで届かなかった接続では、モルモは口を出さない（毎戦のナレーションにしない）');

  console.log('▼ 実際に画面へ出て、1戦闘に1回で終わる');
  await page.evaluate(tl => {
    UI.set(BattleScene.shell({ stage: 1, army: '王国軍', region: '辺境' }));
    BattleScene.speed = 4;
    BattleScene.play(tl);
  }, relayTimeline());
  await page.waitForSelector('.mormo-aside', { timeout: 15000 });
  const box = await page.locator('.mormo-aside-bubble').innerText();
  console.log('    ' + box.replace(/\n/g, ' '));
  ok(/グルグ/.test(box) && /ボル/.test(box), '戦場の隅に、名前入りの一言が実際に出る');
  ok(await page.evaluate(() => BattleScene.mormoAside) === null, '撃ったら予約は消える（1戦闘に1回）');
  await page.screenshot({ path: (process.env.SP || '.screenshots') + '/mormo-spotlight-390.png' });
  await page.waitForTimeout(600);
  ok(await page.locator('.mormo-aside').count() <= 1, '同じ戦闘で二度出さない');

  console.log(errs.length ? '✗ ' + errs.join('\n✗ ') : '✓ モルモが spotlight に反応する：行動に反応・起きてから・優先順・言えない回は黙る');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
