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
  ok(/池の噂/.test(st.lastSlimeSplit.why) && /ぷに/.test(st.lastSlimeSplit.why),
    `「なぜ」欄の1行（${st.lastSlimeSplit.why}）`);
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

console.log(failed ? `\n${failed} 件失敗` : '\n全通過');
process.exit(failed ? 1 : 0);
