// 増殖の元の配線（docs/SPEC_SLIME_ARC_2_2026-09-16.md §2）：
// 条件が揃うと options が渡る／揃わないと渡らない／分身が1体だけ名簿に残る／痕跡と一言が残る／
// 名簿が満杯なら次の面接へ並ぶ。
//   node tools/test-slime-run.js
const fs = require('fs'), vm = require('vm');
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
} };
vm.createContext(ctx);
const files = [...fs.readFileSync('index.html', 'utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)].map(m => m[1]);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Game = vm.runInContext('Game', ctx);
let failed = 0;
const ok = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };

// スライム1体と魔法使い1体の軍団。痕跡は呼び手が足す。
const setup = ({ pond = true, spark = true, deployed = true } = {}) => {
  Game.newRun();
  const st = Game.state;
  const slime = Object.assign(Game.rollApplicant('slime'), { uid: 501, name: 'ぷに' });
  const mage = Object.assign(Game.rollApplicant('mage'), { uid: 502, name: 'ミラ' });
  st.roster = [slime, mage];
  st.activeUids = deployed ? [501, 502] : [502];
  st.traces = [];
  if (pond) Game.trace('incident', 501, null, { id: 'slime_pond', text: '池を調べた' });
  if (spark) Game.trace('sparked', 501, 502, { skill: '火球' });
  return { st, slime, mage };
};

// ── 1. 条件（痕跡2＋状態1）─────────────────────────────
{
  setup({});
  ok(JSON.stringify(Game.slimeSplitOption()) === '{"enabled":true}',
    `揃えば options が渡る（${JSON.stringify(Game.slimeSplitOption())}）`);

  setup({ pond: false });
  ok(Game.slimeSplitOption() === null, '池の噂を開いていない周回では起きない');

  setup({ spark: false });
  ok(Game.slimeSplitOption() === null, '火の粉を浴びた痕跡が無ければ起きない');

  setup({ deployed: false });
  ok(Game.slimeSplitOption() === null, '出撃隊にスライムがいなければ起きない');

  // ③で「間引く」を選んだ後は、痕跡が揃っていても起きない
  const culled = setup({});
  culled.st.slimeCulled = true;
  ok(Game.slimeSplitOption() === null, '間引いたあとは二度と起きない');

  // 火の粉を浴びたのがスライム以外なら起きない
  const other = setup({ spark: false });
  Game.trace('sparked', 502, 502, { skill: '火球' });
  ok(Game.slimeSplitOption() === null, '火の粉を浴びたのがスライムでなければ起きない');
}

// ── 2. 決着：名簿に残るのは1体だけ ──────────────────────
{
  const { st, slime, mage } = setup({});
  const before = st.roster.length;
  Game.applySpiritChanges({ sparked: [], slimeSplit: [{ uid: 501, byUid: 502, skillId: 'mage_fireball', count: 3 }] }, null);
  ok(st.roster.length === before + 1, `3体に分かれても名簿は1体だけ増える（${before} → ${st.roster.length}）`);
  const clone = st.roster[st.roster.length - 1];
  ok(clone.name === 'ぷにの分身' && clone.origin === 'split', `名前と出自（${clone.name}／${clone.origin}）`);
  ok(clone.salary === 1 && clone.loyalty === 50, `給与1・忠誠50（${clone.salary}／${clone.loyalty}）`);
  ok(clone.race === 'スライム', `種族はスライム（${clone.race}）`);
  ok(Game.memberRecord(clone) && Game.baseOf(clone), '名簿の器（記録と基礎値）も用意される');

  const trace = (st.traces || []).find(t => t.data && t.data.id === 'slime_spawn');
  ok(!!trace && trace.subject === 501 && trace.object === 502,
    `痕跡が残り、分裂した者と撃った者を名指しする（${trace && JSON.stringify(trace.data)}）`);
  ok(/3体/.test(trace.data.text), '何体に分かれたかが痕跡に残る');
  ok(mage.faceLine === 'もう火球は撃たん', `撃った者の一言（${mage.faceLine}）`);
  const why = ((st.lastSlimeSplit || {}).rows || [])[0] || {};
  ok(/池の噂/.test(why.why || '') && /ぷに/.test(why.why || '') && why.joined === true,
    `「なぜ」欄の1行（${why.why}）`);
  ok(st.slimeSpawnCount === 1, `③の条件用に回数を数える（${st.slimeSpawnCount}）`);

  // 既に一言を持っている者は上書きしない
  mage.faceLine = '……';
  Game.applySpiritChanges({ sparked: [], slimeSplit: [{ uid: 501, byUid: 502, skillId: 'mage_fireball', count: 2 }] }, null);
  ok(mage.faceLine === '……', '既に何か言っている者の一言は上書きしない');
  // 何も起きなかった決着では「なぜ」欄を出し続けない
  Game.applySpiritChanges({ sparked: [], slimeSplit: [] }, null);
  ok(!st.lastSlimeSplit, '分裂が無い決着では「なぜ」欄を出さない');
}

// ── 3. 名簿が満杯なら次の面接へ並ぶ（押し出さない）──────────
{
  const { st } = setup({});
  while (st.roster.length < Game.maxArmy()) {
    st.roster.push(Object.assign(Game.rollApplicant('goblin'), { uid: 600 + st.roster.length }));
  }
  const full = st.roster.length;
  st.incidentApplicants = [];
  Game.applySpiritChanges({ sparked: [], slimeSplit: [{ uid: 501, byUid: 502, skillId: 'mage_fireball', count: 2 }] }, null);
  ok(st.roster.length === full, `満杯の名簿は押し出されない（${full} → ${st.roster.length}）`);
  const waiting = (st.incidentApplicants || [])[0];
  ok(waiting && waiting.name === 'ぷにの分身' && waiting.origin === 'split',
    `次の面接に分身が並ぶ（${waiting && waiting.name}）`);
}

// ── 4. 複数の親が分裂した決着（途中で満員になる場合も）──────────────
{
  const { st } = setup({});
  const slime2 = Object.assign(Game.rollApplicant('slime'), { uid: 503, name: 'もち' });
  st.roster.push(slime2);
  st.activeUids = [501, 502, 503];
  const before = st.roster.length;
  Game.applySpiritChanges({ sparked: [], slimeSplit: [
    { uid: 501, byUid: 502, skillId: 'mage_fireball', count: 2 },
    { uid: 503, byUid: 502, skillId: 'mage_fireball', count: 1 }
  ] }, null);
  ok(st.roster.length === before + 2, `二人が分裂すれば二人ぶん加わる（${before} → ${st.roster.length}）`);
  const rows = (st.lastSlimeSplit || {}).rows || [];
  ok(rows.length === 2, `「なぜ」欄は親ごとに残る（${rows.length}行）`);
  ok(rows.map(r => r.name).join('・') === 'ぷに・もち', `どちらの親も名指しされる（${rows.map(r => r.name).join('・')}）`);
  ok(rows.every(r => r.joined === true), '空きがあれば両方とも「名簿に加わった」');
  const traces = (st.traces || []).filter(t => t.data && t.data.id === 'slime_spawn');
  ok(traces.length === 2 && traces.every(t => t.data.joined === true), `痕跡にも加入先が残る（${traces.length}件）`);

  // 途中で満員になる：1体目は加わり、2体目は面接待ちになる
  const fresh = setup({});
  const st2 = fresh.st;
  const other = Object.assign(Game.rollApplicant('slime'), { uid: 504, name: 'こな' });
  st2.roster.push(other);
  st2.activeUids = [501, 502, 504];
  while (st2.roster.length < Game.maxArmy() - 1) {
    st2.roster.push(Object.assign(Game.rollApplicant('goblin'), { uid: 700 + st2.roster.length }));
  }
  const full = st2.roster.length;   // あと1人だけ入る
  st2.incidentApplicants = [];
  Game.applySpiritChanges({ sparked: [], slimeSplit: [
    { uid: 501, byUid: 502, skillId: 'mage_fireball', count: 2 },
    { uid: 504, byUid: 502, skillId: 'mage_fireball', count: 2 }
  ] }, null);
  ok(st2.roster.length === full + 1, `満員になった時点で加入は止まる（${full} → ${st2.roster.length}／上限 ${Game.maxArmy()}）`);
  const rows2 = (st2.lastSlimeSplit || {}).rows || [];
  ok(rows2.length === 2 && rows2[0].joined === true && rows2[1].joined === false,
    `1体目は加入、2体目は面接待ちと書き分ける（${rows2.map(r => r.joined).join('／')}）`);
  ok((st2.incidentApplicants || []).length === 1 && st2.incidentApplicants[0].name === 'こなの分身',
    `あぶれた分身は次の面接へ（${(st2.incidentApplicants || []).map(m => m.name).join('・')}）`);
  const traces2 = (st2.traces || []).filter(t => t.data && t.data.id === 'slime_spawn');
  ok(traces2.length === 2 && traces2[1].data.joined === false && /面接/.test(traces2[1].data.text),
    `痕跡も面接待ちと書く（${traces2[1] && traces2[1].data.text}）`);
}

// ── 5. 結合：Game.deploy({manual}) の条件判定 → 実戦 → 決着まで通す ──────
// Battle へ直接 options を渡さず、**run.js が条件を判定して渡す経路**で確かめる。
// 乱数は種で固定する（U.seeded）。種は「分裂が起きる目」を探して1つ選んである。
{
  const U = vm.runInContext('U', ctx);
  // 分裂が起きる目として選んだ種。エンジンの乱数の使い方が変われば選び直して記録し直すこと。
  const SEED_WITH_SPLIT = 4;
  const battleWith = (opts = {}) => {
    Game.newRun();
    const st = Game.state;
    const slime = Object.assign(Game.rollApplicant('slime'), { uid: 501, name: 'ぷに', hp: 300, maxHp: 300, def: 8, spd: 3, skills: [] });
    const mage = Object.assign(Game.rollApplicant('mage'), { uid: 502, name: 'ミラ', hp: 120, atk: 14, def: 5, spd: 9, spirit: 9, skills: ['mage_fireball'] });
    st.roster = [slime, mage];
    st.activeUids = opts.deployed === false ? [502] : [501, 502];
    st.traces = [];
    if (opts.pond !== false) Game.trace('incident', 501, null, { id: 'slime_pond', text: '池を調べた' });
    if (opts.spark !== false) Game.trace('sparked', 501, 502, { skill: '火球' });
    st.phase = 'formation';
    st.gold = 80; st.food = 40;
    const out = Game.deploy({ manual: true });
    return { st, out, slime, mage };
  };
  // 条件が揃っていれば options が渡り、揃っていなければ渡らない（deploy の中の判定）
  const armed = battleWith({});
  ok(!!(armed.out && armed.out.handle), '（前提）コマンドバトルが始まる');
  const unarmed = battleWith({ pond: false });
  ok(Game.slimeSplitOption() === null, '池の噂が無ければ deploy でも options は渡らない');

  // 実戦：火球を撃ち続ける。**固定の種**で分裂が起きる目を選んである（同じ種なら毎回同じ戦闘）。
  // 万一エンジン側の乱数の使い方が変わって種 3 で起きなくなったときのために、後ろの種も試す。
  // 固定の種で落ちたら「保証している目が動いた」ということなので、種を選び直して記録し直すこと。
  const SEEDS = [SEED_WITH_SPLIT, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  let done = null;
  for (const seed of SEEDS) {
    if (done) break;
    // **deploy より前に固定する。** deploy({manual}) は自分で種を引いて Battle.start へ渡すので、
    // 戦闘の乱数はその種で決まる。ここを固定しないと毎回違う戦闘になる（差し戻しで直した点）。
    const origRand = U.rand;
    U.rand = U.seeded(seed);
    const run = battleWith({});
    const handle = run.out.handle;
    let step = handle.next({}), guard = 0;
    while (step && step.type === 'commands' && guard++ < 40) {
      const cmds = {};
      for (const a of step.allies) cmds[a.id] = a.name === 'ミラ' ? { cmd: 'skill', skill: 'mage_fireball' } : { cmd: 'attack' };
      step = handle.next(cmds);
    }
    U.rand = origRand;
    const result = (step && step.result) || handle.result || null;
    if (result && (result.slimeSplit || []).length) done = { seed, result, ...run };
  }
  ok(!!done, `run.js が渡した options で、実戦でも分裂が起きる（種 ${done && done.seed}）`);
  ok(done && done.seed === SEED_WITH_SPLIT, `固定した種 ${SEED_WITH_SPLIT} で再現する（実際に使った種 ${done && done.seed}）`);
  if (done) {
    const st = done.st;
    const before = st.roster.length;
    Game.finishManualBattle(done.result);
    ok(st.roster.length === before + 1, `決着まで通すと名簿に1体だけ加わる（${before} → ${st.roster.length}）`);
    ok(st.roster[st.roster.length - 1].name === 'ぷにの分身', `名前（${st.roster[st.roster.length - 1].name}）`);
    ok((st.traces || []).some(t => t.data && t.data.id === 'slime_spawn'), '痕跡が残る');
    ok(done.mage.faceLine === 'もう火球は撃たん', `撃った者の一言（${done.mage.faceLine}）`);
    ok(((st.lastSlimeSplit || {}).rows || []).length === 1, '「なぜ」欄も1行だけ残る');

    // 決着を二度呼んでも分身は増えない（pending.spiritApplied の番人）
    const after = st.roster.length;
    Game.applySpiritChanges(done.result, { spiritApplied: true });
    ok(st.roster.length === after, `決着を二度通しても増えない（${after} → ${st.roster.length}）`);
  }
}

console.log(failed ? `\n${failed} 件失敗` : '\n全通過');
process.exit(failed ? 1 : 0);
