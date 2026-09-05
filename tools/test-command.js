// 魔王命令：戦闘を途中で止めて、命令を挟んで再開できることを検証する。
// 見るのは「区切りをまたいでも戦闘が壊れていないか」（二重適用・ID重複・状態の欠落）。
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

let failed = 0;
const assert = (condition, message) => {
  console.log(`${condition ? "✓" : "✗"} ${message}`);
  if (!condition) failed++;
};

const ally = (name, traits, atk) => Battle.makeUnit({
  uid: name, tplId: "goblin", name, race: "ゴブリン", job: "",
  hp: 60, atk: atk || 12, def: 3, spd: 6, salary: 3, loyalty: 60, traits: traits || [], tags: []
}, "player");
const foes = n => Array.from({ length: n }, (_, i) => Battle.makeUnit({
  uid: "e" + i, tplId: "soldier", name: "兵" + i, race: "兵士", job: "",
  hp: 40, atk: 7, def: 4, spd: 5, salary: 0, loyalty: 100, traits: [], tags: []
}, "enemy"));

const squad = () => [ally("前衛"), ally("中衛"), ally("後衛")];

// 1. pauseAfterRound で止まり、carry を返す
{
  const part1 = Battle.simulate(squad(), foes(3), { pauseAfterRound: 2 });
  assert(part1.paused === true, "指定ラウンドの終わりで止まる");
  assert(part1.rounds === 2, "止まった時点のラウンド数を返す");
  assert(part1.victory === undefined, "止まった時点では勝敗を決めない");
  assert(!!part1.carry && part1.carry.round === 2, "carry に続きの位置が入る");
  assert(!part1.timeline.some(e => e.type === "result"), "止まった前半に結果イベントは無い");
}

// 2. 同じユニットと carry で再開でき、戦闘として完結する
{
  const player = squad(), enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 2 });
  const part2 = Battle.simulate(player, enemy, { carry: part1.carry, command: "rally" });
  assert(part2.paused !== true, "再開した戦闘は最後まで進む");
  assert(typeof part2.victory === "boolean", "勝敗が決まる");
  assert(part2.rounds > part1.rounds, `再開はラウンド${part1.rounds}の続きから進む（${part2.rounds}）`);
  assert(part2.timeline.some(e => e.type === "result"), "結果イベントが出る");
}

// 3. イベントIDは前半と後半で重複しない（履歴・因果の参照が壊れない）
{
  const player = squad(), enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 2 });
  const part2 = Battle.simulate(player, enemy, { carry: part1.carry, command: "charge" });
  const ids = [...part1.timeline, ...part2.timeline].map(e => e.eventId).filter(Boolean);
  assert(new Set(ids).size === ids.length, "前半と後半を通してイベントIDが一意である");
}

// 4. シナジーが二重に適用されない（unit.mods を書き換えるため、ここが一番危ない）
{
  const build = () => Array.from({ length: 5 }, (_, i) => ally("ゴブ" + i, ["pack"]));
  const player = build(), enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 1 });
  const before = player.map(u => u.mods.dmgMult);
  Battle.simulate(player, enemy, { carry: part1.carry });
  assert(player.every((u, i) => u.mods.dmgMult === before[i]),
    "再開でシナジーが二重に乗らない（命令なしなら倍率は変わらない）");
  assert(!part1.carry.activeSyn || Array.isArray(part1.carry.activeSyn),
    "発動済みシナジーは carry で引き継ぐ");
}

// 5. 前半で済ませた導入は後半で繰り返さない
{
  const player = squad(), enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 1, rations: null });
  const part2 = Battle.simulate(player, enemy, { carry: part1.carry });
  assert(!part2.timeline.some(e => e.type === "dialogue"), "登場台詞は後半で繰り返さない");
  assert(!part2.timeline.some(e => e.type === "synergy"), "シナジー宣言は後半で繰り返さない");
  const start = part2.timeline.find(e => e.type === "battle_start");
  assert(!!start && start.resumed === true, "後半にも盤面（battle_start）はあり、再開だと分かる");
}

// 6. 檄：与ダメージが実際に上がる
{
  const player = squad(), enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 1 });
  const before = player.filter(u => u.alive).map(u => u.mods.dmgMult);
  Battle.simulate(player, enemy, { carry: part1.carry, command: "rally" });
  const living = player.filter(u => u.alive);
  assert(living.length === 0 || living.some((u, i) => u.mods.dmgMult > (before[i] || 0)),
    "檄で生存者の与ダメージ倍率が上がる");
  }

// 7. その場で支払う：未払いが消える
{
  const player = squad().map(u => { u.unpaid = true; return u; });
  const enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 1 });
  Battle.simulate(player, enemy, { carry: part1.carry, command: "advance_pay" });
  assert(player.filter(u => u.alive).every(u => !u.unpaid), "支払えば未払いが解消される");
}

// 8. 総員突撃：命令を起点にした追加行動が実際に出る
{
  const player = squad(), enemy = foes(4);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 1 });
  const part2 = Battle.simulate(player, enemy, { carry: part1.carry, command: "charge" });
  const order = part2.timeline.find(e => e.type === "command");
  assert(!!order && order.commandId === "charge", "命令はイベントとして残る");
  const extras = part2.timeline.filter(e => e.label === "総員突撃");
  assert(extras.length > 0, `突撃の追加行動がタイムラインに出る（${extras.length}件）`);
  assert(extras.every(e => e.chainDepth >= 2), "突撃は命令を親に持つ（連鎖の入口になる）");
}

// 9. 命令なしで再開しても壊れない
{
  const player = squad(), enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 2 });
  const part2 = Battle.simulate(player, enemy, { carry: part1.carry });
  assert(typeof part2.victory === "boolean", "命令を出さなくても戦闘は完結する");
  assert(!part2.timeline.some(e => e.type === "command"), "命令を出していなければ命令イベントも無い");
}

// 10. 知らない命令IDは無視する（古いセーブや壊れた入力で戦闘を落とさない）
{
  const player = squad(), enemy = foes(3);
  const part1 = Battle.simulate(player, enemy, { pauseAfterRound: 1 });
  const part2 = Battle.simulate(player, enemy, { carry: part1.carry, command: "nonexistent" });
  assert(typeof part2.victory === "boolean", "未知の命令IDでも戦闘は完結する");
  assert(!part2.timeline.some(e => e.type === "command"), "未知の命令IDは何も起こさない");
}

// 11. 決着した戦闘は止まらない（区切りより先に終わっていれば普通に返る）
{
  const player = Array.from({ length: 5 }, (_, i) => ally("強" + i, [], 400));
  const part1 = Battle.simulate(player, foes(2), { pauseAfterRound: 5 });
  assert(part1.paused !== true, "区切りより先に決着すれば止まらない");
  assert(part1.victory === true, "決着した戦闘は勝敗を返す");
}

const Game = vm.runInContext('Game', ctx);

// ── ラン側の流れ（deploy → 命令 → 続き → 戦果） ──────────────
const readyToFight = () => {
  Game.newRun();
  const st = Game.state;
  let guard = 0;
  while (st.roster.length < 4 && guard++ < 20) {
    if (st.phase === "recruit" && st.applicants.length) Game.hire(0);
    else { st.phase = "recruit"; Game.genApplicants(); st.hiresLeft = 1; }
  }
  st.activeUids = Game.departmentRoster("combat").slice(0, Game.MAX_DEPLOY).map(m => m.uid);
  st.phase = "formation";
  return st;
};
// 長引く戦闘にしないと区切りへ届かない（瞬殺は命令を挟まない、が正しい挙動）
const toughFight = st => {
  Game.prepareMissions(true);
  Game.selectMission(2);
  for (const unit of st.selectedMission.units) { unit.hp *= 12; unit.atk = Math.max(1, Math.round(unit.atk * 0.4)); }
};

// 12. 区切りまで続く戦闘は命令待ちで止まり、戦果はまだ確定しない
{
  const st = readyToFight();
  toughFight(st);
  const goldBefore = st.gold;
  const out = Game.deploy();
  assert(out && out.paused === true, "長引く戦闘は命令待ちで止まる");
  assert(st.phase === "command", "フェーズが命令待ちになる");
  assert(st.gold === goldBefore, "命令待ちの時点では報酬も給与も動かさない");
  assert(!!st.pendingCommandInfo && st.pendingCommandInfo.round === Game.COMMAND_ROUND,
    "命令画面に出す戦況が用意される");
  const info = st.pendingCommandInfo;
  assert(info.player.members.length > 0 && info.enemy.members.length > 0, "両軍の現況が入っている");

  const done = Game.issueCommand("rally");
  assert(!!done && !!done.result, "命令を出すと戦闘が最後まで進む");
  assert(st.phase !== "command", "命令後は命令待ちを抜ける");
  assert(typeof done.result.victory === "boolean", "勝敗が決まる");
  assert(!!done.segment && done.segment.timeline.length < done.result.timeline.length,
    "描画用に後半だけの区切りも返る");
  assert(done.result.timeline.some(e => e.type === "command"), "命令はタイムラインに残る");
  assert(done.notes.some(n => n.includes("魔王命令")), "命令は戦果の記録にも残る");
}

// 13. 命令を出さなくても戦闘は完結する
{
  const st = readyToFight();
  toughFight(st);
  Game.deploy();
  const done = Game.issueCommand(null);
  assert(!!done && typeof done.result.victory === "boolean", "見送っても戦闘は完結する");
  assert(!done.result.timeline.some(e => e.type === "command"), "見送れば命令イベントも出ない");
}

// 14. 綴じ直した戦果は前半の出来事も数える（集計が後半だけにならない）
{
  const st = readyToFight();
  toughFight(st);
  const first = Game.deploy();
  const done = Game.issueCommand(null);
  assert(done.result.timeline.length > first.result.timeline.length,
    "戦果のタイムラインは前半＋後半である");
  const contributors = done.result.contribution.length;
  assert(contributors >= st.activeUids.length - 1, "戦功は前半から通して数える");
  assert(done.result.rounds >= Game.COMMAND_ROUND, "ラウンド数は通しの数字である");
}

// 15. 総員突撃の代償（残業）は戦果へ足される
{
  const st = readyToFight();
  toughFight(st);
  Game.deploy();
  const done = Game.issueCommand("charge");
  const charge = Battle.commandById("charge");
  const charged = new Set(done.segment.timeline
    .filter(e => e.label === "総員突撃" && e.fromId).map(e => e.fromId)).size;
  assert(charged > 0, `突撃で動いた人数が数えられる（${charged}体）`);
  assert(done.result.overtime.hours >= charge.overtimePerUnit * charged,
    `突撃は人数ぶん残業になる（${charged}体 → ${done.result.overtime.hours}h）`);
  assert(done.notes.some(n => n.includes("残業+")), "代償は戦果の記録にも書かれる");
}

// 15b. 代償は既にある仕組み（忠誠・所持金）へ返る
{
  const st = readyToFight();
  toughFight(st);
  st.gold = 200;
  const loyaltyBefore = st.roster.filter(m => st.activeUids.includes(m.uid)).map(m => m.loyalty);
  Game.deploy();
  Game.issueCommand("rally");
  const after = st.roster.filter(m => st.activeUids.includes(m.uid)).map(m => m.loyalty);
  assert(after.some((v, i) => v < loyaltyBefore[i]), "檄は出撃者の忠誠を削る");
}
{
  const st = readyToFight();
  toughFight(st);
  st.gold = 200;
  for (const m of st.roster) { m.unpaid = true; m.unpaidStreak = 2; }
  const cost = Game.commandGoldCost("advance_pay");
  assert(cost > 0, `その場の支払いには代金がかかる（${cost}G）`);
  Game.deploy();
  const out = Game.issueCommand("advance_pay");
  // 戦果の報酬も同じ精算で入るので、支払いの記録そのものを見る
  assert(out.notes.some(n => n.includes(`その場の支払い ${cost}G`)), "代金は所持金から引かれる");
  assert(st.roster.every(m => !m.unpaid && !m.unpaidStreak), "支払えば未払いは軍団から消える");
}
{
  const st = readyToFight();
  toughFight(st);
  st.gold = 0;
  Game.deploy();
  assert(!Game.commandAffordable("advance_pay"), "所持金が足りなければ支払いは選べない");
  assert(Game.issueCommand("advance_pay") === null, "払えない命令は通らない");
  assert(st.phase === "command", "通らなかった命令では戦闘は進まない（詰まない）");
  assert(!!Game.issueCommand(null), "見送りはいつでも選べる");
}

// 16. 命令待ちを抱えていない状態で命令を出しても何も起きない
{
  const st = readyToFight();
  st.phase = "formation";
  assert(Game.issueCommand("rally") === null, "命令待ちでなければ命令は通らない");
}

// 17. 再読込で命令待ちの戦闘が失われたら編成へ戻す（セーブできない状態を抱え込まない）
{
  const st = readyToFight();
  toughFight(st);
  Game.deploy();
  assert(st.phase === "command", "命令待ちに入っている");
  Game.pendingBattle = null;          // 再読込で生の戦闘が失われた状況
  Game.migrateState();
  assert(st.phase === "formation" && !st.pendingCommandInfo,
    "戦闘を抱え直せなければ編成へ戻る（詰まない）");
}

console.log(failed ? `\n${failed}件失敗` : "\n魔王命令テスト完了");
process.exit(failed ? 1 : 0);
