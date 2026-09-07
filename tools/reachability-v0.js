// V0: 通常ランでの到達性を測る。
//   使い方: node tools/reachability-v0.js [ラン数]
//
// 固定編成（tools/vertical-v0.js）で成立しても、普通に遊んで届かなければ体験は無い。
// ここで数えるのは3つ。混ぜないこと（設計書 第10節）。
//   ① 提示: 面接に「採用一手で2人の接続が作れる合法な候補」が並んだか
//   ② 採用: その候補を実際に採ったか
//   ③ 発火: 戦闘で2人の接続が実際に起きたか
// 「小成功」は設計書 3.1〜3.3 の**2人の接続**に合わせる。1人で完結する発火は数えない。
// 金貨の人材間接続は名前の集合ではなく**親イベントをたどって**確認する。
// 乱数は seed 固定。事件の選択もこのツールの seed 付き乱数で行う（host の Math.random を使わない）。
// 試行ごとに localStorage を空にして保存状態を独立させる。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/departments.js','src/data/events.js','src/data/demon_kings.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/battle.js','src/core/chain.js','src/core/run.js'];
let rngState = 1;
function rnd() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const seededMath = Object.create(Math);
seededMath.random = rnd;
const store = {};
const ctx = { console, Math: seededMath, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
const KPI = vm.runInContext('KPI', ctx);
const Synergy = vm.runInContext('Synergy', ctx);
const Aptitude = vm.runInContext('Aptitude', ctx);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;
const has = (m, t) => (m.traits || []).includes(t);

// ── 「採用一手で2人の接続が作れるか」──────────────────
// links（能力どうしの接続語彙）と、種族数など links に出ない条件の両方を見る。
// 給与・食料・採用枠の範囲で実行できる候補だけを合法とする（設計書 5.2）。
function offerOf(candidate, st) {
  const roster = st.roster;
  let rows = 0, gained = [];
  try { rows = Synergy.connections(candidate, roster, []).length; } catch (e) { rows = 0; }
  try {
    const asUnits = list => list.map(m => ({ ...m, alive: true, traits: (m.traits||[]).slice(), tags: (m.tags||[]).slice(), mods: { dmgMult: 1, takenMult: 1 } }));
    const before = new Set(Synergy.active(asUnits(roster), { pool: asUnits(roster) }).map(s => s.id));
    const after = asUnits([...roster, candidate]);
    gained = Synergy.active(after, { pool: after }).map(s => s.id).filter(id => !before.has(id));
  } catch (e) { gained = []; }
  // links にも種族条件にも出ない食料系を、明示的に拾う。
  // 料理人と食欲のある出撃者は「2人でひとつ」だが、現行データはこれを接続として表現できない。
  let food = false;
  const eaters = roster.filter(m => Aptitude.of(m).appetite > 0);
  if (has(candidate, 'demon_cook') && eaters.length) food = true;
  if (Aptitude.of(candidate).appetite > 0 && roster.some(m => has(m, 'demon_cook'))) food = true;
  const legal = candidate.salary <= Math.max(0, st.gold);   // 採れる（採用枠の判定は呼び出し側）
  return { rows, gained: gained.length, food, legal, any: (rows > 0 || gained.length > 0 || food) && legal };
}

// ── 戦闘タイムラインから「2人の接続」を読む ──────────────
function twoPersonHits(result, rations) {
  const tl = result.timeline;
  const byId = new Map(tl.map(e => [e.eventId, e]));
  const goldGain = e => e.type === 'resource_gain' && e.resource === 'gold';
  const originGold = ev => {
    let cur = ev, guard = 0;
    while (cur && guard++ < 40) {
      if (goldGain(cur)) return cur;
      cur = cur.parentEventId ? byId.get(cur.parentEventId) : null;
    }
    return null;
  };
  // 略奪はどちらも2人の接続として数える（設計書 3.1 は《追い剥ぎコンビ》を入口と定義している）。
  //  入口 = ゴブリン2体で成立するコンビ（金貨→次の味方攻撃+25%）
  //  中盤以降 = 追撃の起点をたどり、金貨を取った人と追撃した人が別人であること
  const lootPair = tl.some(e => e.type === 'synergy_trigger' && e.synergyId === 'goblin_pair');
  const lootCross = tl.some(e => {
    if (!(e.type === 'trait_trigger' && e.traitId === 'greedy')) return false;
    const gold = originGold(e);
    return !!(gold && gold.sourceId && gold.sourceId !== e.sourceId);
  });
  const loot = lootPair || lootCross;
  // 食料: 糧食を消費し、料理人が発火し、強化される側が料理人以外にいること
  const cookFire = tl.find(e => e.type === 'trait_trigger' && e.traitId === 'demon_cook');
  const otherEater = tl.some(e => e.type === 'trait_trigger'
    && (e.traitId === 'big_eater' || e.traitId === 'glutton_feast')
    && (!cookFire || e.sourceId !== cookFire.sourceId));
  const food = !!(rations && rations.consumed > 0 && cookFire && otherEater);
  // 死霊: 蘇生や召喚が起きただけでは数えない。**復帰・召喚された者がその後に行動した**ことまで求める
  // （設計書 3.3「倒れ、蘇生し、その後もう一度働く」）。
  const actedAfter = (index, unitId) =>
    tl.slice(index + 1).some(e => (e.type === 'attack' || e.type === 'splash') && e.fromId === unitId);
  const death = tl.some((e, i) => e.type === 'revive' && e.traitId === 'necromancy'
      && e.sourceId && e.sourceId !== e.unitId && actedAfter(i, e.unitId))
    || tl.some((e, i) => e.type === 'summon' && e.unit && actedAfter(i, e.unit.id));
  return { loot, lootPair, lootCross, food, death };
}

// ── 配置 ────────────────────────────────────
function formUp(st, strat) {
  if (strat.departments === 'balanced' && st.roster.length >= 3) {
    for (const m of st.roster) Game.assignDepartment(m.uid, 'combat');
    const support = st.roster.slice().sort((a,b)=> power(a) - power(b));
    Game.assignDepartment(support[0].uid, 'life');
    Game.assignDepartment(support[1].uid, 'construction');
  }
  if (strat.kind === 'connect') {
    // 接続を狙う配置。戦闘に要らない者だけを部門へ回し、
    // 支援役（死霊術師・料理人）は必ず出撃させたうえで**後衛へ置く**。
    for (const m of st.roster) Game.assignDepartment(m.uid, 'combat');
    const spare = st.roster.filter(m => !has(m,'necromancy') && !has(m,'demon_cook'))
      .sort((a,b)=> power(a) - power(b));
    if (st.roster.length > Game.MAX_DEPLOY && spare[0]) Game.assignDepartment(spare[0].uid, 'life');
    if (st.roster.length > Game.MAX_DEPLOY + 1 && spare[1]) Game.assignDepartment(spare[1].uid, 'construction');
  }
  let pool = Game.departmentRoster('combat').slice();
  if (strat.kind === 'connect') {
    // 支援役を優先して枠へ入れ、残りを強い順で埋める
    const support = pool.filter(m => has(m,'necromancy') || has(m,'demon_cook') || has(m,'greedy'));
    const rest = pool.filter(m => !support.includes(m)).sort((a,b)=> power(b) - power(a));
    pool = [...support, ...rest].slice(0, Game.MAX_DEPLOY);
    // 並び順が配置。先頭が狙われるので、硬い者を前・支援役を後ろへ置く
    pool.sort((a, b) => {
      const backA = has(a,'necromancy') || has(a,'demon_cook') ? 1 : 0;
      const backB = has(b,'necromancy') || has(b,'demon_cook') ? 1 : 0;
      if (backA !== backB) return backA - backB;
      return b.hp - a.hp;
    });
  } else {
    pool = pool.sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY).sort((a,b)=> b.hp - a.hp);
  }
  st.activeUids = pool.map(m => m.uid);
  Game.setPayrollPolicy('regular');
}

function runOnce(strat, acc) {
  for (const k of Object.keys(store)) delete store[k];   // 試行間で保存状態を独立させる
  Game.newRun();
  const st = Game.state;
  let guard = 0, interviews = 0, battles = 0, sawOffer = false, wantedOffer = false, hiredOfferThisRun = false;
  const first = { loot: 0, food: 0, death: 0, any: 0 };
  while (st.phase !== 'gameover' && st.phase !== 'clear' && guard++ < 300) {
    if (st.phase === 'recruit' && st.applicants.length) {
      interviews++;
      if (interviews <= 3) {
        const offers = st.applicants.map(m => offerOf(m, st));
        const iv = acc.interview[interviews - 1];
        iv.total++;
        iv.links += offers.filter(o => o.rows > 0 && o.legal).length;
        iv.syn += offers.filter(o => o.gained > 0 && o.legal).length;
        iv.food += offers.filter(o => o.food && o.legal).length;
        iv.any += offers.filter(o => o.any).length;
        if (offers.some(o => o.any)) { iv.withOffer++; sawOffer = true; }
      }
    }
    while (st.phase === 'recruit' && st.applicants.length) {
      if (st.hiresLeft <= 0) { Game.skipHire(); break; }
      let idx = -1;
      if (strat.kind === 'connect') {
        // 接続を作れる候補を優先し、無ければ強い方
        const scored = st.applicants.map((m, i) => ({ i, o: offerOf(m, st), p: power(m) }));
        const linked = scored.filter(x => x.o.any);
        idx = (linked.length ? linked.reduce((b,x)=> x.p > b.p ? x : b) : scored.reduce((b,x)=> x.p > b.p ? x : b)).i;
        wantedOffer = linked.some(x => x.i === idx);
      } else {
        idx = st.applicants.reduce((b,m,i)=> power(m) > power(st.applicants[b]) ? i : b, 0);
      }
      if (!Game.canHire()) {
        const weakest = st.roster.reduce((b,m)=> power(m) < power(b) ? m : b, st.roster[0]);
        if (power(st.applicants[idx]) > power(weakest) * 1.1) Game.fire(weakest.uid);
        else { Game.skipHire(); break; }
      }
      const rosterBefore = st.roster.length;
      const picked = st.applicants[idx];
      Game.hire(idx);
      // 採ろうとしただけでなく、実際に軍団へ入ったところまでを「採用成功」と数える
      if (wantedOffer && interviews <= 3
        && st.roster.length > rosterBefore && st.roster.some(m => m.uid === picked.uid)) {
        acc.hiredWithOffer++;
        hiredOfferThisRun = true;
      }
      wantedOffer = false;
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') { formUp(st, strat); Game.prepareOpeningBattle('invade'); }
    if (st.phase === 'mission') {
      const index = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(index >= 0 ? index : 2);
    }
    if (st.phase === 'formation') {
      formUp(st, strat);
      const out = Game.deploy();
      if (!out) break;
      battles++;
      const hit = twoPersonHits(out.result, (st.lastBattle && st.lastBattle.battleRations) || null);
      for (const k of ['loot','food','death']) if (hit[k] && !first[k]) first[k] = battles;
      if ((hit.loot || hit.food || hit.death) && !first.any) first.any = battles;
    }
    if (Game.canSeizeStronghold()) Game.seizeStronghold();
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'facility') Game.chooseFacility(strat.facility || 'extortion_ledger');
    if (st.phase === 'event') {
      if (st.pendingEvent) {
        const opts = Game.eventOptions();
        if (opts.length) Game.chooseEvent(opts[Math.floor(rnd() * opts.length)].i);   // 事件の選択も seed 固定
      }
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') { if (Game.canRetry()) Game.retry(); else Game.concede(); }
  }
  acc.battles.push(battles);
  for (const k of ['loot','food','death','any']) {
    if (first[k]) { acc.first[k].push(first[k]); if (first[k] <= 3) acc.within3[k]++; }
  }
  if (sawOffer) acc.runsWithOffer++;
  if (hiredOfferThisRun) acc.runsWithHire++;
  acc.runs++;
  KPI.reset();
}

const N = Number(process.argv[2] || 60);
const strategies = [
  { name: '最強優先（能力値だけで採る）', facility: 'extortion_ledger' },
  { name: '三部門均衡（部門へも配属する）', departments: 'balanced', facility: 'grand_kitchen' },
  { name: '接続狙い（繋がる候補を採り、支援役を後衛へ置く）', kind: 'connect', facility: 'graveyard' }
];
for (const s of strategies) {
  const acc = { runs: 0, runsWithOffer: 0, runsWithHire: 0, battles: [], hiredWithOffer: 0,
    first: { loot: [], food: [], death: [], any: [] },
    within3: { loot: 0, food: 0, death: 0, any: 0 },
    interview: [0,1,2].map(() => ({ total: 0, links: 0, syn: 0, food: 0, any: 0, withOffer: 0 })) };
  for (let i = 0; i < N; i++) { rngState = 5000 + i; runOnce(s, acc); }
  const mean = a => a.length ? (a.reduce((x,y)=>x+y,0)/a.length).toFixed(2) : '—';
  console.log(`\n■ ${s.name}（${acc.runs}ラン・平均 ${mean(acc.battles)}戦）`);
  console.log(`  【発火】いずれかの系統で2人の接続が成立: 到達 ${(acc.first.any.length/acc.runs*100).toFixed(0)}%のラン　初回 平均 ${mean(acc.first.any)}戦目　**最初の3戦以内 ${(acc.within3.any/acc.runs*100).toFixed(0)}%**`);
  for (const [k, label] of [['loot','略奪（コンビ成立 or 別人の金貨に追撃）'],['food','食料（料理人＋別の食べ手・暫定判定）'],['death','死霊（他者蘇生/召喚された者が行動）']]) {
    console.log(`    ${label}: 到達 ${(acc.first[k].length/acc.runs*100).toFixed(0)}%　初回 平均 ${mean(acc.first[k])}戦目　3戦以内 ${(acc.within3[k]/acc.runs*100).toFixed(0)}%`);
  }
  console.log(`  【提示】最初の3面接のどこかに合法な接続候補が1人以上いたラン: ${(acc.runsWithOffer/acc.runs*100).toFixed(0)}%`);
  acc.interview.forEach((iv, i) => {
    if (!iv.total) return;
    console.log(`  【提示】${i+1}回目の面接: 合法な接続候補 平均 ${(iv.any/iv.total).toFixed(2)}人（links ${(iv.links/iv.total).toFixed(2)} / 種族等 ${(iv.syn/iv.total).toFixed(2)} / 食料 ${(iv.food/iv.total).toFixed(2)}）　1人以上いた面接 ${(iv.withOffer/iv.total*100).toFixed(0)}%`);
  });
  if (s.kind === 'connect') console.log(`  【採用】最初の3面接で接続候補を実際に採用できた: ${acc.runsWithHire}%のラン（採用回数 合計 ${acc.hiredWithOffer}回／${acc.runs}ラン）`);
}
