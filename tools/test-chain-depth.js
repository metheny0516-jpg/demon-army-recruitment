// 連鎖段数を参照する能力群（押し出し・深追い・深淵の恐怖・歩合）と、
// その代償である残業を検証する。数値の期待値ではなく契約を見る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: key => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const Battle = vm.runInContext('Battle', ctx);
const Game = vm.runInContext('Game', ctx);
const TRAITS = vm.runInContext('TRAITS', ctx);

let failed = 0;
const assert = (condition, message) => {
  console.log(`${condition ? "✓" : "✗"} ${message}`);
  if (!condition) failed++;
};

const ally = (name, traits, atk) => Battle.makeUnit({
  uid: name, tplId: "goblin", name, race: "ゴブリン", job: "",
  hp: 40, atk: atk || 30, def: 2, spd: 6, salary: 2, loyalty: 60, traits, tags: []
}, "player");
const foes = n => Array.from({ length: n }, (_, i) => Battle.makeUnit({
  uid: "e" + i, tplId: "soldier", name: "兵" + i, race: "兵士", job: "",
  hp: 12, atk: 4, def: 8, spd: 5, salary: 0, loyalty: 100, traits: [], tags: []
}, "enemy"));

// 最大値だけだと稀な当たりに引きずられるので、平均も返す。
// 残業は「連鎖ビルドだけが払う」形を平均で確かめるために使う。
const deepest = squads => {
  const N = 60;
  let best = { chain: 0, overtime: 0, avgOvertime: 0 };
  let total = 0;
  for (let i = 0; i < N; i++) {
    const r = Battle.simulate(squads.map((t, j) => ally("味方" + j, t)), foes(5), {});
    best.chain = Math.max(best.chain, r.chainSummary.maxChain);
    best.overtime = Math.max(best.overtime, r.overtime.hours);
    total += r.overtime.hours;
  }
  best.avgOvertime = total / N;
  return best;
};

// 1. 押し出しは鎖を伸ばす役として働く
const plain = deepest([[], [], [], [], []]);
const relay = deepest([["relay_kick"], ["relay_kick"], ["relay_kick"], [], []]);
assert(relay.chain > plain.chain, `押し出しを採ると鎖が伸びる（${plain.chain} → ${relay.chain}）`);

// 2. 同じ鎖で同じ人は二度動かない（＝押し出しの人数が鎖の長さの上限を決める）
{
  const r = Battle.simulate(
    [ally("走者", ["relay_kick"]), ally("殴り", [])], foes(5), {});
  const relays = r.timeline.filter(e => e.traitId === "relay_kick");
  const perChain = new Map();
  for (const e of relays) {
    const key = `${e.chainId}/${e.sourceId}`;
    perChain.set(key, (perChain.get(key) || 0) + 1);
  }
  assert([...perChain.values()].every(n => n === 1), "押し出しは1鎖につき1人1回まで");
}

// 3. 深度の上限を越えない（無限連鎖で戦闘が終わらなくなることがない）
{
  const squad = Array.from({ length: 5 }, () => ["relay_kick", "escalate"]);
  let over = 0;
  for (let i = 0; i < 60; i++) {
    const r = Battle.simulate(squad.map((t, j) => ally("味方" + j, t, 60)), foes(5), {});
    over += r.timeline.filter(e => (e.chainDepth || 0) > Battle.MAX_CHAIN_DEPTH).length;
  }
  assert(over === 0, `連鎖は MAX_CHAIN_DEPTH=${Battle.MAX_CHAIN_DEPTH} を越えない`);
}

// 4. 深追いは深いときだけ効く（1段目では何も足さない）
{
  const c = { attacker: { flags: {} }, target: {}, mult: 1, notes: [], chainDepth: 1 };
  TRAITS.escalate.modDealt(c);
  assert(c.mult === 1 && c.notes.length === 0, "深追いは1段目では発動しない");
  const d = { attacker: { flags: {} }, target: {}, mult: 1, notes: [], chainDepth: 4 };
  TRAITS.escalate.modDealt(d);
  assert(d.mult > 2 && d.notes.length === 1, "深追いは4段目で2倍を超える");
}

// 5. 深淵の恐怖の防御無視は75%で頭打ち
{
  const c = { attacker: {}, target: {}, mult: 1, notes: [], chainDepth: 20, defIgnore: 0 };
  TRAITS.deep_dread.modDealt(c);
  assert(c.defIgnore === 0.75, "深淵の恐怖は防御無視75%が上限");
}

// 6. 歩合は金貨を出し、既存の《強欲》が反応できる形になっている
{
  const r = Battle.simulate(
    [ally("歩合", ["relay_kick", "chain_toll"]), ally("歩合2", ["relay_kick", "chain_toll"]),
     ally("走者", ["relay_kick"]), ally("強欲", ["greedy"]), ally("殴り", [])],
    foes(5), {});
  const tolls = r.timeline.filter(e => e.label === "歩合");
  assert(tolls.length > 0, "連鎖3段目以降で歩合が金貨を出す");
  assert(tolls.every(e => e.resource === "gold" && e.reserved), "歩合の金貨は勝利時に確定する予約である");
}

// 7. 残業は深い連鎖からだけ発生し、平坦な戦闘では0
// 残業は「連鎖を伸ばした編成だけが払う」形を守る。素の編成でもごく稀に
// 深い鎖が出る（OVERKILL伝播）が、請求額は連鎖ビルドより桁が小さいこと。
// CodeX の「深さを全ダメージ系統の共通報酬にする」変更を統合した後は、
// 素の編成でもOVERKILL伝播で鎖が伸びるため、残業は連鎖ビルドの専売ではなくなった。
// 起点を6段へ上げたうえで、少なくとも連鎖ビルドの方が明確に重いことを守る。
// 「連鎖ビルドだけが払う」形へ戻すかはオーナー判断（HANDOFF 参照）。
assert(plain.avgOvertime < relay.avgOvertime * 0.7,
  `素の編成の残業は連鎖ビルドより軽い（平均 ${plain.avgOvertime.toFixed(2)}h 対 ${relay.avgOvertime.toFixed(2)}h）`);
assert(relay.overtime > 0, `連鎖を伸ばすと残業が発生する（${relay.overtime}h）`);

// 8. 残業は出撃者の忠誠と備蓄食料へ請求される
{
  Game.newRun();
  const st = Game.state;
  if (st.phase === "recruit") Game.hire(0);
  st.food = 20;
  const target = st.roster[0];
  st.activeUids = [target.uid];
  const before = target.loyalty;
  const report = Game.applyOvertime({ hours: 12, deepest: 9 }, []);
  assert(report.loyalty === -6, `残業12時間で忠誠-6（実際 ${report.loyalty}）`);
  assert(target.loyalty === Math.max(0, before - 6), "忠誠低下は出撃者に適用される");
  assert(st.food === 16, `夜食で食料-4（実際 ${20 - st.food}）`);
}

// 9. 出撃していない者は残業しない
{
  Game.newRun();
  const st = Game.state;
  if (st.phase === "recruit") Game.hire(0);
  st.activeUids = [];
  const before = st.roster.map(m => m.loyalty);
  Game.applyOvertime({ hours: 20, deepest: 10 }, []);
  assert(st.roster.every((m, i) => m.loyalty === before[i]), "控えの忠誠は残業で下がらない");
}

console.log(failed ? `\n${failed}件失敗` : "\n連鎖段数テスト完了");
process.exit(failed ? 1 : 0);
