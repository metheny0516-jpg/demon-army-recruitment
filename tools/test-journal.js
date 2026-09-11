// モルモの日誌：痕跡をランへ接続し、人物名を保ったまま日ごとに読めること。
//   node tools/test-journal.js
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js', 'src/data/mormo_lines.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js',
  'src/core/chain.js', 'src/core/spotlight.js', 'src/core/traces.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Game = vm.runInContext('Game', ctx);
const Traces = vm.runInContext('Traces', ctx);
let failed = 0, passed = 0;
const assert = (condition, message) => {
  if (condition) { passed++; console.log(`✓ ${message}`); }
  else { failed++; console.log(`✗ ${message}`); }
};

Game.newRun();
let st = Game.state;
assert(Array.isArray(st.traces) && st.traces.length === 0, '新しいランは空の日誌を持つ');

// 採用は実際の操作経路を通す。
const recruit = st.applicants[0];
st.hiresLeft = Math.max(1, st.hiresLeft);
assert(Game.hire(0) === true, '応募者を採用できる');
let trace = st.traces.find(t => t.kind === 'hired' && t.subject === recruit.uid);
assert(!!trace && trace.data.day === st.day && trace.data.lore === !!recruit.loreSkill,
  '採用の痕跡に uid・日・伝承の有無が入る');

// 永久離脱4種は共通の本体経路を通り、去った者の名前も日誌から引ける。
for (const cause of ['fallen', 'fired', 'deserted', 'retired']) {
  const uid = 800 + st.departed.length;
  const monster = { uid, tplId: 'orc', name: `${cause}殿`, race: 'オーク', job: '兵', hp: 10, atk: 3,
    def: 1, spd: 2, salary: 1, loyalty: 50, traits: [], tags: [], relicIds: [], record: {} };
  st.roster.push(monster);
  Game.recordDeparture(monster, cause, cause === 'fallen' ? { army: '王国軍' } : {});
  trace = st.traces.find(t => t.kind === cause && t.subject === uid);
  assert(!!trace && (cause !== 'fallen' || trace.data.army === '王国軍'), `${cause} を離脱経路で記録する`);
}

// 戦闘決着で使う種類の形。配列を入れず、担ぎ名は文字列として保持する。
const combat = [
  { kind: 'retreated', subject: null, data: { army: '騎士団', carried: 'ガロ、ボグマ' } },
  { kind: 'carried', subject: recruit.uid, data: { army: '騎士団' } },
  { kind: 'downed', subject: recruit.uid, data: { round: 3 } },
  { kind: 'late', subject: recruit.uid, data: { rounds: 2, cause: '寝坊' } },
  { kind: 'ate', subject: recruit.uid, data: {} },
  { kind: 'ordered', subject: recruit.uid, data: { skill: 'ぶちかまし', round: 2 } },
  { kind: 'defended', subject: null, data: { army: '討伐隊' } },
  { kind: 'ransacked', subject: null, data: { army: '討伐隊' } }
];
for (const item of combat) {
  const made = Traces.record(st.traces, { ...item, object: null, day: st.day, turn: st.turn });
  assert(!!made && made.kind === item.kind, `${item.kind} の契約形を受理する`);
}

// 昇進は本体経路から積む。
const notes = [];
Game.promote(recruit, { id: 'captain', name: '隊長', boost: {}, message: '任せた。' }, notes);
trace = st.traces.find(t => t.kind === 'promoted' && t.subject === recruit.uid);
assert(!!trace && trace.data.rank === '隊長', '昇進の痕跡に uid・階級名が入る');

// 別の日を作り、新しい日が先になること・名簿と去った者の双方を名前解決することを見る。
st.day += 1; st.turn += 1;
Traces.record(st.traces, { kind: 'hired', subject: recruit.uid, object: null,
  data: { day: st.day, lore: false }, day: st.day, turn: st.turn });
const journal = Game.journal();
assert(journal.length >= 2 && journal[0].day === st.day && journal[1].day < journal[0].day,
  '日誌は日ごとにまとまり、新しい日から並ぶ');
const allText = journal.flatMap(group => group.lines.map(line => line.text)).join('\n');
assert(allText.includes(recruit.name), '在籍者の名前を日誌で引ける');
assert(allText.includes('fallen殿'), '去った者の名前を日誌で引ける');
assert(!/[0-9０-９]/.test(allText), 'モルモの日誌本文に数字を出さない');
assert(Game.journal(2).reduce((sum, group) => sum + group.lines.length, 0) === 2, '表示件数 limit を守る');

// 旧セーブ移行。
delete st.traces;
Game.migrateState();
assert(Array.isArray(st.traces) && st.traces.length === 0, 'traces の無い旧セーブを空配列へ移行する');

// 器の保護契約は接続後も変わらない。
for (let i = 0; i < 405; i++) Traces.record(st.traces, { kind: 'hired', subject: i + 1, data: {}, day: 1, turn: 1 });
Traces.record(st.traces, { kind: 'fallen', subject: 9991, data: { army: '王国軍' }, day: 1, turn: 1 });
Traces.record(st.traces, { kind: 'retreated', subject: null, data: { army: '王国軍', carried: '' }, day: 1, turn: 1 });
for (let i = 0; i < 10; i++) Traces.record(st.traces, { kind: 'hired', subject: 9100 + i, data: {}, day: 1, turn: 1 });
assert(st.traces.length === 400, '痕跡は400件を超えない');
assert(st.traces.some(t => t.kind === 'fallen') && st.traces.some(t => t.kind === 'retreated'),
  '上限を超えても戦死・撤退を保護する');

console.log(`\n${passed} 件通過、${failed} 件失敗`);
process.exit(failed ? 1 : 0);
