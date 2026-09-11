// 痕跡の器：本体に接続する前に、保存可能な小さな事実の契約を固定する。
//   node tools/test-traces.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { console, Math: Object.create(Math), Set, Object, Array, Number, String };
vm.createContext(ctx);
for (const f of ['src/core/util.js', 'src/core/traces.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
const Traces = vm.runInContext('Traces', ctx);
const TRACE_KINDS = vm.runInContext('TRACE_KINDS', ctx);
let failed = 0;
const check = (fn, message) => {
  try { fn(); console.log(`✓ ${message}`); }
  catch (err) { failed++; console.log(`✗ ${message}: ${err.message}`); }
};
const trace = (kind, subject, object = null, data = {}) => ({ day: 4, turn: 3, kind, subject, object, data });

const list = [];
const first = Traces.record(list, trace('late', 17, null, { rounds: 2, cause: 'drunkard' }));
const second = Traces.record(list, trace('ate', 17, '騎士', {}));
const third = Traces.record(list, trace('fermented', 23, 17, {}));
check(() => { assert.equal(first.seq, 1); assert.equal(second.seq, 2); assert.strictEqual(list[0], first); }, 'record は1から seq を振り、追加した trace を返す');

for (const [bad, message] of [
  [trace('unknown', 17), '未登録 kind'],
  [trace('late', 17, null, { callback() {} }), '関数入り data'],
  [trace('late', 17, null, { nested: { rounds: 2 } }), '二段ネスト data'],
  [trace('late', '17'), '文字列 subject']
]) {
  check(() => { const before = list.length; assert.equal(Traces.record(list, bad), null); assert.equal(list.length, before); }, `${message} は例外なく拒否する`);
}
check(() => assert.equal(Traces.record(undefined, trace('late', 17)), null), 'undefined の list は例外なく拒否する');

check(() => assert.deepEqual(Traces.query(list, { kind: 'late', subject: 17 }).map(t => t.seq), [1]), 'query は kind と subject の AND を取る');
check(() => assert.deepEqual(Traces.query(list, { subject: 23, object: 17, kinds: ['fermented'], since: 2 }).map(t => t.seq), [3]), 'query は object を含む複合 AND を取る');
check(() => assert.deepEqual(Traces.query(list, { kinds: ['late', 'fermented'] }).map(t => t.seq), [3, 1]), 'query は kinds と新しい順を扱う');
check(() => assert.deepEqual(Traces.query(list, { since: 1 }).map(t => t.seq), [3, 2]), 'query は since より新しいものを返す');
check(() => assert.equal(Traces.count(list, { subject: 17 }), 2), 'count は query の件数を返す');
check(() => assert.equal(Traces.last(list, { subject: 17 }).seq, 2), 'last は最新1件を返す');
check(() => assert.deepEqual(Traces.forUnit(list, 17).map(t => t.seq), [3, 2, 1]), 'forUnit は object 側の uid も拾う');
check(() => assert.deepEqual(Traces.summary(list, 17), { late: 1, ate: 1 }), 'summary は subject 側だけを kind ごとに数える');

check(() => assert.equal(Traces.describe(first, uid => uid === 17 ? 'ガロ' : undefined), 'ガロが遅れて着いた（2ラウンド）'), 'describe は subject と data を埋める');
check(() => assert.equal(Traces.describe(second, () => undefined), '誰かが騎士の携行食を食べた'), 'describe は引けない uid を「誰か」にする');

const crowded = [];
for (let i = 0; i < 420; i++) Traces.record(crowded, trace('late', i, null, { rounds: 1 }));
for (let i = 0; i < 5; i++) Traces.record(crowded, trace('fallen', 1000 + i, null, { army: '第1軍' }));
for (let i = 0; i < 5; i++) Traces.record(crowded, trace('retreated', null, null, { carried: [i], army: '第1軍' }));
Traces.prune(crowded, 400);
check(() => {
  assert.equal(crowded.length, 400);
  assert.equal(crowded.filter(t => t.kind === 'fallen').length, 5);
  assert.equal(crowded.filter(t => t.kind === 'retreated').length, 5);
  assert.equal(crowded.some(t => t.seq === 1), false);
}, 'prune は古い通常痕跡を落とし、fallen と retreated を残す');

check(() => {
  assert.ok(Object.keys(TRACE_KINDS).length <= Traces.MAX_KINDS);
  assert.ok(Object.values(TRACE_KINDS).every(kind => kind.label && kind.template));
}, '登録 kind は上限以下で label と template を持つ');
check(() => assert.deepEqual(JSON.parse(JSON.stringify(list)), list), '痕跡は JSON 往復で変わらない');

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
