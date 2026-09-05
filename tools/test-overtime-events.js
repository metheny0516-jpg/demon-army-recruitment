// 残業が軍団の外へ漏れ出す経路を検証する。
// 連鎖（戦闘中）→ 残業（勝利後の請求）→ 労務イベント（盤外の事件）が一本につながっているか。
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
const Game = vm.runInContext('Game', ctx);
const EVENTS = vm.runInContext('EVENTS', ctx);
const U = vm.runInContext('U', ctx);

let failed = 0;
const assert = (condition, message) => {
  console.log(`${condition ? "✓" : "✗"} ${message}`);
  if (!condition) failed++;
};
const event = id => EVENTS.find(e => e.id === id);
const option = (ev, label) => ev.options.find(o => o.label.includes(label));

// 軍団を用意して、全員を出撃状態にする
const army = n => {
  Game.newRun();
  const st = Game.state;
  while (st.roster.length < n) {
    if (st.phase === "recruit" && st.applicants.length) Game.hire(0);
    else break;
    if (st.phase !== "recruit") { st.phase = "recruit"; Game.genApplicants(); st.hiresLeft = 1; }
  }
  st.activeUids = st.roster.map(m => m.uid);
  st.gold = 60;
  return st;
};

// 1. 残業は個人へ積み上がり、控えには積まれない
{
  const st = army(3);
  const bench = st.roster[2];
  st.activeUids = st.roster.slice(0, 2).map(m => m.uid);
  Game.applyOvertime({ hours: 10, deepest: 7 }, []);
  assert(st.roster[0].overtimeHours === 10 && st.roster[1].overtimeHours === 10,
    "出撃者に残業時間が積み上がる");
  assert((bench.overtime || 0) === 0 && (bench.overtimeHours || 0) === 0,
    "控えには残業時間が積まれない");
  assert(st.overtimeTotal === 10, "軍団の累計残業も積み上がる");
}

// 2. 労基署は累計残業が積むまで来ない
{
  const st = army(2);
  const inspection = event("labor_inspection");
  st.overtimeTotal = 5;
  assert(!inspection.check(st), "累計残業が浅いうちは労基署は来ない");
  st.overtimeTotal = 14;
  assert(inspection.check(st), "累計残業12時間を超えると労基署が来る");
  const cast = inspection.cast(st);
  assert(!!cast && !!cast.actor, "いちばん残業した者を名指しできる");
}

// 3. 罰金を払うと累計はリセットされ、忠誠が戻る
{
  const st = army(3);
  st.overtimeTotal = 30;
  for (const m of st.roster) { m.overtimeHours = 10; m.loyalty = 50; }
  const fineBefore = Game.laborFine();
  const goldBefore = st.gold;
  option(event("labor_inspection"), "罰金").apply(st, Game.resolveCast(event("labor_inspection").cast(st)));
  assert(st.gold === goldBefore - fineBefore, `罰金${fineBefore}Gを支払う`);
  assert(st.overtimeTotal === 0 && st.roster.every(m => m.overtimeHours === 0), "累計・個人ともリセットされる");
  assert(st.roster.every(m => m.loyalty === 62), "是正したので全員の忠誠+12");
}

// 4. 帳簿の書き換えは罰金ゼロだが、次回が倍額になる
{
  const st = army(2);
  st.roster[0].job = "会計係（どんぶり勘定）";
  st.overtimeTotal = 30;
  const falsify = option(event("labor_inspection"), "帳簿");
  assert(falsify.check(st), "会計職がいれば帳簿を書き換えられる");
  falsify.apply(st, Game.resolveCast(event("labor_inspection").cast(st)));
  assert(st.overtimeTotal === 0 && st.laborRecordFalsified === true, "累計は消え、書き換えの記録が残る");
  st.overtimeTotal = 30;
  assert(Game.laborFine() === Math.min(24, 15) * 2, "書き換え後の罰金は倍額");
  // 罰金を払えば書き換えの記録も清算される
  st.gold = 60;
  option(event("labor_inspection"), "罰金").apply(st, Game.resolveCast(event("labor_inspection").cast(st)));
  assert(st.laborRecordFalsified === false, "罰金を払えば書き換えの記録は消える");
}

// 5. 労務顧問は忠誠低下を半分にし、顧問料を取り、払えなければ去る
{
  const st = army(2);
  st.overtimeTotal = 30;
  option(event("labor_inspection"), "労務顧問").apply(st, Game.resolveCast(event("labor_inspection").cast(st)));
  assert(st.laborAdvisor === true, "監督官を引き抜いて労務顧問にできる");

  for (const m of st.roster) m.loyalty = 80;
  st.gold = 20;
  const withAdvisor = Game.applyOvertime({ hours: 12, deepest: 8 }, []);
  assert(withAdvisor.loyalty === -3, `顧問がいると忠誠低下は半分（12h → ${withAdvisor.loyalty}）`);
  assert(st.gold === 20 - Game.LABOR_ADVISOR_FEE, "残業した戦いには顧問料がかかる");

  st.gold = 0;
  Game.applyOvertime({ hours: 12, deepest: 8 }, []);
  assert(st.laborAdvisor === false, "顧問料を払えなければ労務顧問は去る");
  const after = Game.applyOvertime({ hours: 12, deepest: 8 }, []);
  assert(after.loyalty === -6, "顧問が去れば忠誠低下は元の額へ戻る");
}

// 6. 過労は個人の残業時間で起きる（軍団の累計ではない）
{
  const st = army(3);
  const karoshi = event("karoshi");
  assert(!karoshi.check(st), "残業していなければ過労は起きない");
  st.roster[1].overtimeHours = 20;
  assert(karoshi.check(st), "個人の残業が15時間を超えると過労が起きる");
  assert(Game.resolveCast(karoshi.cast(st)).actor.uid === st.roster[1].uid,
    "いちばん働かされた者が倒れる");
}

// 7. 休ませる選択はその者を軍団に残し、次の戦いから外す
{
  const st = army(3);
  const victim = st.roster[1];
  victim.overtimeHours = 40;
  const rosterBefore = st.roster.length;
  option(event("karoshi"), "休ませる").apply(st, Game.resolveCast(event("karoshi").cast(st)));
  assert(st.roster.length === rosterBefore, "休ませた者は軍団を去らない");
  assert(victim.overtimeHours === 0 && victim.restingTurns === 1, "残業は0に戻り、休養が1戦入る");
  assert(!st.activeUids.includes(victim.uid), "休養中は出撃隊から外れる");
  Game.assignDepartment(victim.uid, "combat");
  Game.migrateState();
  assert(!st.activeUids.includes(victim.uid), "戦闘部門へ戻しても、休養が明けるまで出撃隊に入らない");
}

// 8. 弔いと労災はどちらも軍団から失われ、欠員として次の採用へつながる
for (const label of ["手厚く弔う", "労災"]) {
  const st = army(3);
  const victim = st.roster[1];
  victim.overtimeHours = 40;
  st.pendingVacancies = 0;
  const before = st.roster.length;
  option(event("karoshi"), label).apply(st, Game.resolveCast(event("karoshi").cast(st)));
  assert(st.roster.length === before - 1 && !st.roster.includes(victim), `「${label}」で軍団から失われる`);
  assert(st.pendingVacancies === 1, `「${label}」は欠員として次の採用へつながる`);
  assert((st.fallenRoll || []).some(f => f.name === victim.name), `「${label}」は戦没者名簿に載る`);
}

// 9. 残業自慢は2人以上いて、誰かが働かされているときだけ
{
  const st = army(2);
  const brag = event("overtime_bragging");
  assert(!brag.check(st), "残業がなければ自慢は起きない");
  st.roster[0].overtimeHours = 10;
  assert(brag.check(st), "残業が積んだ者がいれば自慢が起きる");
  const declare = option(brag, "残業を減らす");
  declare.apply(st, Game.resolveCast(brag.cast(st)));
  assert(st.roster[0].overtimeHours === 4, "宣言すると全員の残業記録が6時間減る");
}

// 10. すべての労務イベントは、選択肢のどれかを必ず選べる（詰まない）
for (const id of ["labor_inspection", "karoshi", "overtime_bragging"]) {
  const st = army(3);
  st.gold = 0;
  st.overtimeTotal = 40;
  for (const m of st.roster) m.overtimeHours = 40;
  const ev = event(id);
  const cast = Game.resolveCast(ev.cast(st));
  const usable = ev.options.filter(o => !o.check || o.check(st, cast));
  assert(usable.length >= 1, `${ev.title}は所持金0でも選べる選択肢がある`);
}

console.log(failed ? `\n${failed}件失敗` : "\n残業イベントテスト完了");
process.exit(failed ? 1 : 0);
