// 行動で偏る小成長（docs/SPEC_GROWTH_BY_ACTION_2026-09-14.md）。
// 殴った者は攻撃と速さ、守った者は防御、殴られた者は HP。使わなかった数値は伸びない。
//   node tools/test-growth.js
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

const fresh = () => { Game.newRun(); const st = Game.state; st.roster = []; st.activeUids = []; return st; };
const member = (uid, name) => Object.assign(Game.rollApplicant('orc'),
  { uid, name, record: null, grown: {}, hp: 40, atk: 12, def: 6, spd: 5, base: { hp: 40, atk: 12, def: 6, spd: 5 } });
const row = (uid, acts, taken) => ({ uid, survived: true,
  actions: Object.assign({ attack: 0, guard: 0, skill: 0, eat: 0, cover: 0 }, acts), taken: taken || 0 });
// n 戦ぶん同じ行動を積む（1戦あたり各 +1 まで）
const fight = (st, contribution, times) => {
  for (let i = 0; i < (times || 1); i++) Game.tallyBattleRecords(contribution, true);
};

// ── 1. 何をしたかで、伸びる数値が分かれる ─────────────────────
{
  const st = fresh();
  const hitter = member(1, '殴り'), keeper = member(2, '守り'), target = member(3, '的'), eater = member(4, '食べ');
  st.roster = [hitter, keeper, target, eater];
  fight(st, [row(1, { attack: 3 }), row(2, { guard: 2 }), row(3, {}, 12), row(4, { eat: 1 })], 1);
  const grow = m => Game.memberRecord(m).grow;
  ok(grow(hitter).atk === 1 && grow(hitter).spd === 1 && grow(hitter).def === 0 && grow(hitter).hp === 0,
    `殴った者は攻撃と速さだけ（${JSON.stringify(grow(hitter))}）`);
  ok(grow(keeper).def === 1 && grow(keeper).atk === 0 && grow(keeper).spd === 0,
    `守った者は防御だけ（${JSON.stringify(grow(keeper))}）`);
  ok(grow(target).hp === 1 && grow(target).atk === 0,
    `殴られた者は HP（${JSON.stringify(grow(target))}）`);
  ok(grow(eater).atk === 0 && grow(eater).def === 0 && grow(eater).hp === 0 && grow(eater).spd === 0,
    `食べただけでは伸びない（${JSON.stringify(grow(eater))}）`);
}

// ── 2. かばうは防御、技はたたかうと同じ扱い ─────────────────
{
  const st = fresh();
  const cover = member(5, 'かばい'), caster = member(6, '術師');
  st.roster = [cover, caster];
  fight(st, [row(5, { cover: 1 }), row(6, { skill: 1 })], 1);
  ok(Game.memberRecord(cover).grow.def === 1, 'かばうは防御が伸びる');
  ok(Game.memberRecord(caster).grow.atk === 1 && Game.memberRecord(caster).grow.spd === 1,
    '技はたたかうと同じ扱い（攻撃と速さ）');
}

// ── 3. 1戦で各 +1 まで（何回殴っても1戦は1）──────────────────
{
  const st = fresh();
  const m = member(7, '連打');
  st.roster = [m];
  fight(st, [row(7, { attack: 9, guard: 4 }, 30)], 1);
  const grow = Game.memberRecord(m).grow;
  ok(grow.atk === 1 && grow.def === 1 && grow.hp === 1 && grow.spd === 1,
    `1戦で各 +1 まで（${JSON.stringify(grow)}）`);
}

// ── 4. 実際の数値が、使った分だけ伸びる ──────────────────────
{
  const st = fresh();
  const m = member(8, '前衛');
  st.roster = [m];
  const before = { hp: m.hp, atk: m.atk, def: m.def, spd: m.spd };
  fight(st, [row(8, { attack: 1 })], 12);          // 12戦ずっと殴り続けた
  const gained = Game.applyGrowth(m);
  const keys = gained.map(g => g.key).sort().join('・');
  ok(keys === 'atk・spd', `伸びたのは攻撃と速さだけ（${keys || 'なし'}）`);
  ok(m.hp === before.hp && m.def === before.def, `使わなかった HP と防御は動かない（${m.hp}／${m.def}）`);
  ok(m.atk > before.atk && m.spd > before.spd, `攻撃と速さは伸びる（${before.atk}→${m.atk}／${before.spd}→${m.spd}）`);
  ok(gained.every(g => g.uid === 8 && g.delta > 0 && g.name === '前衛'),
    `戻り値は {uid,name,key,delta}（${JSON.stringify(gained)}）`);
}

// ── 5. 上限12戦。それ以上は伸びない ────────────────────────
{
  const st = fresh();
  const m = member(9, '古参');
  st.roster = [m];
  fight(st, [row(9, { attack: 1 })], 12);
  Game.applyGrowth(m);
  const atk12 = m.atk;
  fight(st, [row(9, { attack: 1 })], 8);
  ok(Game.applyGrowth(m).length === 0 && m.atk === atk12, `12戦で頭打ち（${atk12}）`);
}

// ── 6. 決着の控え（st.lastGrowth）に伸びた分だけが入る ─────────
{
  const st = fresh();
  const m = member(10, '読み上げ');
  st.roster = [m];
  fight(st, [row(10, { attack: 1 })], 12);
  Game.trainSurvivors([row(10, { attack: 1 })], []);
  ok(Array.isArray(st.lastGrowth) && st.lastGrowth.length > 0, `伸びた分が控えに入る（${JSON.stringify(st.lastGrowth)}）`);
  ok(st.lastGrowth.every(g => g.delta > 0), '0 は控えない');
  Game.trainSurvivors([row(10, { attack: 1 })], []);
  ok(st.lastGrowth.length === 0, '次の決着では控えが空になる（前回の分を出し続けない）');
}

// ── 7. 旧セーブ：戦闘数を3つに写し、数値は1も動かさない ──────────
{
  const st = fresh();
  const m = member(11, '旧セーブ');
  st.roster = [m];
  // 旧仕様どおり8戦ぶん育った状態を作り、grow を消す（＝旧セーブ）
  const rules = Game.skillRules(), base = Game.baseOf(m);
  m.record = { battles: 8, wins: 4, downed: 0, carried: 0, late: 0, ate: 0 };
  m.grown = {};
  for (const key of ['hp', 'atk', 'def']) {
    const target = Math.round((base[key] || 0) * rules.growthPerBattle * 8);
    m.grown[key] = target; m[key] += target;
  }
  const before = JSON.stringify({ hp: m.hp, atk: m.atk, def: m.def, spd: m.spd });
  Game.migrateState();
  const grow = Game.memberRecord(m).grow;
  ok(grow.hp === 8 && grow.atk === 8 && grow.def === 8 && grow.spd === 0,
    `戦闘数を3つに写す（速さは0から。${JSON.stringify(grow)}）`);
  const gained = Game.applyGrowth(m);
  ok(gained.length === 0, `移行だけでは何も伸びない（${JSON.stringify(gained)}）`);
  ok(JSON.stringify({ hp: m.hp, atk: m.atk, def: m.def, spd: m.spd }) === before,
    `移行で数値が1も動かない（${before}）`);
}

// ── 8. 手番の記録が空の戦果（撤退の提案）でも、与ダメージから「殴った」を読む ──
{
  const st = fresh();
  const m = member(14, '退き際'), quiet = member(15, '無為');
  st.roster = [m, quiet];
  // battle.js の撤退の提案は actions を全部 0 のまま返す（2026-09-14 時点）
  const empty = { attack: 0, guard: 0, skill: 0, eat: 0, cover: 0 };
  Game.tallyBattleRecords([
    { uid: 14, survived: true, actions: { ...empty }, dealt: 37, taken: 0 },
    { uid: 15, survived: true, actions: { ...empty }, dealt: 0, taken: 0 }
  ], false);
  ok(Game.memberRecord(m).grow.atk === 1 && Game.memberRecord(m).grow.spd === 1,
    `与ダメージがあれば殴ったと数える（${JSON.stringify(Game.memberRecord(m).grow)}）`);
  ok(Game.memberRecord(m).grow.def === 0, '守りは数字に残らないので数えない（でっち上げない）');
  ok(Game.memberRecord(quiet).grow.atk === 0,
    `何もしていない者は伸びない（${JSON.stringify(Game.memberRecord(quiet).grow)}）`);
}

// ── 9. 傭兵と戦死者は育たない ──────────────────────────────
{
  const st = fresh();
  const merc = Object.assign(member(12, '傭兵'), { mercenary: true });
  const fallen = member(13, '戦死');
  st.roster = [merc, fallen];
  Game.tallyBattleRecords([{ uid: 12, mercenary: true, actions: { attack: 3 }, taken: 5 },
    Object.assign(row(13, { attack: 3 }, 5), { survived: false })], true);
  ok((merc.record || {}).grow === undefined || Game.memberRecord(merc).grow.atk === 0, '傭兵は数えない');
  st.lastGrowth = [];
  Game.trainSurvivors([Object.assign(row(13, { attack: 3 }), { survived: false })], []);
  ok(st.lastGrowth.length === 0, 'この戦いで戦死した者は育たない');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
