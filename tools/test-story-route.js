// 正規筋の実配線。全data/coreを本番indexから読み、実戦闘・決着・セーブを通す。
// 強い試験軍団は到達性確認用。勝率・バランス検証ではない。
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const [, file] of fs.readFileSync('index.html', 'utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}
const { Game, Story, Territory, U, Storage, steps } = vm.runInContext('({Game,Story,Territory,U,Storage,steps:STORY_ROUTE})', ctx);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
function fresh(seed = 10) {
  U.rand = U.seeded(seed); Story.enabled = true; Game.newRun();
  const st = Game.state;
  while (st.phase === 'story') Game.storyDone();
  st.story.flags.rescueResolved = true;
  st.story.seen.push('rescue_call', 'map_opens');
  st.gold = 100000; st.food = 10000; st.alert = 0;
  const unit = Game.rollApplicant('orc');
  Object.assign(unit, { name: '試験の古参', hp: 10000, atk: 2000, def: 1000, spd: 100, salary: 0, loyalty: 100, traits: [], skills: [], department: 'military' });
  Game.baseOf(unit); Game.memberRecord(unit); st.roster.push(unit); st.activeUids = [unit.uid];
  st.phase = 'mission'; st.missionOffers = [];
  return st;
}
function drain(st) {
  const ids = [];
  let guard = 0;
  while (st.phase === 'story' && guard++ < 30) { ids.push(Story.currentBeat(st).id); Game.storyDone(); }
  assert.ok(guard < 30, 'story queue must terminate');
  return ids;
}
function fight(st, index) {
  assert.ok(Game.selectMission(index));
  const out = Game.deploy(); assert.ok(out);
  assert.ok(st.lastBattle.victory, 'fixture army should win');
  if (st.phase === 'result') Game.afterResult();
  return { out, ids: drain(st) };
}
function offers(st) {
  // 所持資源と反撃の抑制はテスト用。戦闘と決着は本物を使う。
  st.gold = 100000; st.food = 10000; st.alert = 0; st.counterattack = null;
  return Game.prepareMissions(true);
}

test('地図の隣接を守って鉱山まで案内し、通常の選択肢も残す', () => {
  const st = fresh();
  const p = Story.routeWaypoint(st, 't06');
  assert.equal(p.id, 't02');
  const list = offers(st);
  assert.ok(list.some(m => m.territoryId === p.id && m.territoryMode === 'take'));
  assert.ok(list.some(m => m.missionKind === 'train'));
  assert.ok(list.some(m => m.territoryId === 'h01'));
  assert.ok(list.filter(m => m.territoryMode === 'take').every(m => Territory.frontier(st).some(p => p.id === m.territoryId)));
  const held = JSON.stringify(st.missionOffers); Game.prepareMissions();
  assert.equal(JSON.stringify(st.missionOffers), held, '再表示だけで再抽選しない');
});

test('防衛予約は正規ルートより優先、訓練でも達成しない', () => {
  const st = fresh(); st.counterattack = { pending: true, kind: 'normal' };
  const list = Game.prepareMissions(true);
  assert.ok(list.some(m => m.missionKind === 'defend'));
  assert.ok(!list.some(m => m.storyRoute));
  assert.match(Story.routeObjective(st).hint, /まず迫る敵/);
  Story.routeSettled(st, { storyRoute: 'mine', training: true }, true);
  assert.ok(!st.story.route.completed.mine);
});

test('前哨勝利では領土・物語が進まず、本戦で初めて進む', () => {
  const st = fresh();
  for (const id of ['t06', 'h01', 'h02', 'h04']) Territory.take(st, id);
  let list = offers(st), i = list.findIndex(m => m.storyRoute === 'checkpoint');
  assert.ok(i >= 0); assert.equal(list[i].missionPhase, 'outpost');
  fight(st, i);
  assert.ok(!Territory.has(st, 'h06')); assert.ok(!st.story.route.completed.checkpoint);
  assert.ok(st.outpost?.cleared && st.outpost.place === 'h06');
  list = offers(st); i = list.findIndex(m => m.storyRoute === 'checkpoint');
  assert.equal(list[i].missionPhase, 'main');
  const played = fight(st, i);
  assert.ok(Territory.has(st, 'h06'));
  assert.ok(st.story.route.completed.checkpoint);
  assert.ok(played.ids.includes('route_checkpoint_post'));
  assert.ok(st.lastBattle.story.pre.some(s => s.id === 'route_checkpoint_pre'));
  const count = Story.count(st, 'route_completed');
  Story.routeSettled(st, { storyRoute: 'checkpoint', territoryId: 'h06', territoryMode: 'take', missionPhase: 'main' }, true);
  assert.equal(Story.count(st, 'route_completed'), count);
});

test('敗北・撤退・略奪を鉱山解放と記録しない', () => {
  const st = fresh();
  const mission = { storyRoute: 'mine', territoryId: 't06', territoryMode: 'take', missionPhase: 'main' };
  Story.routeSettled(st, mission, false);
  Story.routeSettled(st, { ...mission, territoryMode: 'raid' }, true);
  Story.routeSettled(st, { ...mission, missionPhase: 'outpost' }, true);
  assert.ok(!st.story.route.completed.mine); assert.equal(st.story.route.pending.length, 0);
});

test('贈って鉱山を得た場合、武力解放したとの台詞を作らない', () => {
  const st = fresh(); Territory.take(st, 't04');
  const list = offers(st), i = list.findIndex(m => m.missionKind === 'tribute' && m.territoryId === 't06');
  assert.ok(i >= 0); assert.ok(Game.selectMission(i));
  assert.ok(Territory.has(st, 't06')); assert.equal(Story.routeStep(st).id, 'checkpoint');
  Story.queueBeats(st, 'before_mission');
  assert.ok(!st.story.queue.some(s => s.id === 'route_mine_post'));
  assert.ok(!st.story.route.completed.mine);
});

test('通常の鎮圧では報復隊の物語は解決しない', () => {
  const st = fresh(); for (const id of ['t06', 'h06', 'h09']) Territory.take(st, id);
  const list = offers(st), i = list.findIndex(m => m.storyRoute === 'revolt');
  assert.ok(i >= 0);
  assert.equal(list[i].territoryId, undefined);
  Story.routeSettled(st, { missionKind: 'suppress' }, true);
  assert.ok(!st.story.route.completed.revolt);
  const before = JSON.stringify(st.territory);
  fight(st, i);
  assert.ok(st.story.route.completed.revolt);
  assert.equal(JSON.stringify(st.territory), before);
});

test('途中セーブは未読決着を保存し、ロード後に一度だけ読む', () => {
  let st = fresh(); Territory.take(st, 't06');
  Story.routeSettled(st, { storyRoute: 'mine', territoryId: 't06', territoryMode: 'take', missionPhase: 'main' }, true);
  Game.save(); assert.ok(Game.load()); st = Game.state;
  assert.equal(st.story.route.pending.length, 1);
  Story.queueBeats(st, 'after_battle');
  assert.equal(st.story.queue.filter(s => s.id === 'route_mine_post').length, 1);
  Story.queueBeats(st, 'after_battle');
  assert.equal(st.story.queue.filter(s => s.id === 'route_mine_post').length, 1);
  assert.equal(st.story.route.pending.length, 0);
});

test('旧セーブの領土は尊重し、未攻略や過去の戦闘を捏造しない', () => {
  const st = fresh(); delete st.story.route;
  Territory.take(st, 't06'); Territory.take(st, 'h06');
  Story.queueBeats(st, 'after_battle');
  assert.ok(!st.story.queue.some(s => /route_(mine|checkpoint)_post/.test(s.id)));
  assert.equal(Story.routeStep(st).id, 'temple');
  assert.ok(!st.story.queue.some(s => s.id === 'ch4_open'));
});

test('王都未攻略の勇者撃退は城の結末。征服度が低くても表示する', () => {
  const st = fresh(); st.conquest = 0;
  Game.beginAct(2, 'defense', []);
  Story.queueBeats(st, 'after_battle');
  assert.equal(st.story.queue[0].id, 'route_defense_ending');
  assert.match(st.story.queue[0].text, /王都はまだ/);
  assert.ok(!st.story.queue.some(s => s.id === 'route_capital_ending'));
  assert.equal(Story.routeObjective(st), null);
  st.story.queue = []; Story.queueBeats(st, 'after_battle'); assert.equal(st.story.queue.length, 0);
});

test('正規経路を実戦闘とGame.afterResultで第一幕の結末まで通す', () => {
  const st = fresh(21), seen = new Set(); let battles = 0;
  while (st.act === 1 && battles < 45) {
    const step = Story.routeStep(st); assert.ok(step, 'route objective exists');
    const list = offers(st);
    const wp = step.place ? Story.routeWaypoint(st, step.place) : null;
    const i = step.place ? list.findIndex(m => m.territoryId === wp?.id && m.territoryMode === 'take')
      : list.findIndex(m => m.storyRoute === step.id);
    assert.ok(i >= 0, 'objective offer exists: ' + step.id);
    const result = fight(st, i); result.ids.forEach(id => seen.add(id)); battles++;
    assert.notEqual(st.phase, 'gameover');
    // イベント等は次の作戦準備で省略する。ブラウザでの会話・事件操作はOpusの担当。
  }
  assert.equal(st.act, 2); assert.ok(Territory.has(st, 'h12'));
  for (const id of ['mine', 'checkpoint', 'temple', 'revolt', 'fort', 'town']) {
    assert.ok(st.story.route.completed[id], id + ' completed');
    assert.ok(seen.has('route_' + id + '_post'), id + ' post shown');
  }
  assert.ok(seen.has('route_capital_ending'));
  const order = [...seen];
  assert.ok(order.indexOf('route_fort_post') < order.indexOf('route_town_post'), '町の帰還報告は砦の決着後');
  assert.ok(st.story.seen.includes('finale'));
  assert.ok(!st.lastBattle.notes.join('\n').includes('王は隣国へ逃げ'));
  Game.save(); assert.ok(Game.load()); assert.equal(Game.state.act, 2);
  assert.ok(Game.state.story.seen.includes('finale'));
  console.log('  実戦闘 ' + battles + '決着で第一幕→第二幕。強化した試験軍団による到達検証。');
});

test('手動戦闘の撤退は未達成、再出撃の勝利は一度だけ記録', () => {
  const st = fresh(); Territory.take(st, 't04');
  let list = offers(st), i = list.findIndex(m => m.storyRoute === 'mine');
  assert.ok(Game.selectMission(i));
  let out = Game.deploy({ manual: true });
  assert.ok(out.story.pre.some(s => s.id === 'route_mine_pre'));
  let pending = st.pendingBattle;
  let retreatStep = out.handle.next({}), retreatGuard = 0;
  while (retreatStep?.type === 'commands' && retreatGuard++ < 40) {
    const commands = {}; for (const a of retreatStep.allies) commands[a.id] = {cmd:'attack'};
    retreatStep = out.handle.next(commands);
  }
  const retreatResult = retreatStep?.result || out.handle.result;
  retreatResult.retreated = true; Game.finishManualBattle(retreatResult);
  assert.ok(!st.story.route.completed.mine); assert.ok(!Territory.has(st, 't06'));
  list = offers(st); i = list.findIndex(m => m.storyRoute === 'mine');
  assert.ok(Game.selectMission(i)); out = Game.deploy({ manual: true }); pending = st.pendingBattle;
  let step = out.handle.next({}), guard = 0;
  while (step?.type === 'commands' && guard++ < 40) {
    const commands = {}; for (const a of step.allies) commands[a.id] = {cmd:'attack'};
    step = out.handle.next(commands);
  }
  const result = step?.result || out.handle.result; assert.ok(result.victory);
  Game.finishManualBattle(result);
  assert.ok(st.story.route.completed.mine);
  const count = Story.count(st, 'route_completed'), gold = st.gold;
  Game.finishManualBattle(result); Game.settleContinue(pending);
  assert.equal(st.gold, gold); assert.equal(Story.count(st, 'route_completed'), count);
});

test('旧セーブの未読章場面はロードで除去、未読結末は実際の着地へ置換', () => {
  let st = fresh(); delete st.story.route;
  st.story.queue = [{ id:'ch2_open',chapter:2,text:'旧鉱山' }];
  st.phase = 'story'; st.story.next = 'afterResult'; Game.save(); Game.load(); st = Game.state;
  assert.equal(st.story.queue.length, 0); Game.storyDone();
  assert.equal(Story.currentBeat(st).id, 'route_mine_intro');
  st = fresh(); delete st.story.route; st.act = 2;
  st.actHistory = [{act:1,by:'defense',turn:5}];
  st.story.seen.push('finale'); st.story.queue = [{id:'finale',chapter:8,text:'旧王都'}];
  st.phase = 'story'; st.story.next = 'afterResult'; Game.save(); Game.load(); st = Game.state;
  Game.storyDone(); assert.equal(Story.currentBeat(st).id, 'route_defense_ending');
});

for (const decision of ['continue', 'advance']) test('実際の勇者撃退から保存復元し方針を選ぶ: ' + decision, () => {
  let st = fresh(32);
  st.counterattack = { pending: true, kind: 'hero' };
  const list = Game.prepareMissions(true);
  assert.ok(Game.selectMission(list.findIndex(m => m.missionKind === 'defend')));
  assert.ok(Game.deploy()); assert.ok(st.lastBattle.victory);
  assert.equal(st.act, 1); assert.ok(st.heroCame);
  Game.afterResult();
  let guard = 0;
  while (Story.currentBeat(st)?.id !== 'route_defense_choice' && guard++ < 20) Game.storyDone();
  assert.ok(guard < 20); assert.equal(Story.currentBeat(st).choices.length, 2);
  Game.storyDone(); assert.equal(Story.currentBeat(st).id, 'route_defense_choice');
  assert.equal(Game.storyChoose('invalid'), false);
  Game.save(); assert.ok(Game.load()); st = Game.state;
  assert.equal(Story.currentBeat(st).id, 'route_defense_choice');
  assert.ok(Game.storyChoose(decision));
  assert.equal(Game.storyChoose(decision), false, '二重選択は無効');
  if (decision === 'continue') {
    assert.equal(st.act, 1); assert.ok(st.heroCame);
    assert.equal(st.story.route.defenseDecision, 'continue');
    drain(st); const next = Game.prepareMissions(true);
    assert.ok(next.some(m => m.territoryMode === 'take'));
    assert.ok(!st.actHistory?.some(a => a.act === 1));
  } else {
    assert.equal(st.act, 2);
    assert.equal(st.actHistory.find(a => a.act === 1).by, 'defense');
    assert.ok(drain(st).includes('route_defense_ending'));
  }
});

test('無効時は新しい物語・目標・作戦を足さない', () => {
  const st = fresh(); Story.enabled = false;
  assert.equal(Story.routeObjective(st), null);
  assert.equal(Story.routePre(st, { storyRoute: 'mine' }).length, 0);
  const list = Game.prepareMissions(true); assert.ok(list.every(m => !m.storyRoute));
  assert.equal(Story.queueBeats(st, 'after_battle'), false);
});
console.log(`\n${passed} route tests passed`);
