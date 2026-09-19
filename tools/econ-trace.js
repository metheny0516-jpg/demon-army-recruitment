// 経済トレース: 戦闘ごとの 報酬／略奪／給与／純増 と所持金の推移を測る（ブラウザ不要）
//   使い方: node tools/econ-trace.js [ラン数=50] [戦略=greedy|careful|raid]
// sim.js と同じ固定ロジックで回すので「人間の判断の実測」ではなく、
// 「給与と報酬の比がどう動くか」を見るためのもの。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/bonds.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/counterattack.js','src/data/departments.js','src/data/town.js','src/data/events.js','src/data/incidents.js','src/data/demon_kings.js','src/data/territories.js','src/data/enemy_captains.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/skill_effects.js','src/core/battle.js','src/core/chain.js','src/core/spotlight.js','src/core/town.js','src/core/traces.js','src/core/incidents.js','src/core/territory.js','src/core/captains.js','src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } } };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
// Town は vm の中にしか居ない。取り出しておかないと `typeof Town === 'undefined'` になり、
// 城下町の建設も前借りも**黙って空振りする**（2026-09-19 に踏んだ）。
const Town = vm.runInContext('Town', ctx);
// 実験用の上書き（数値は data を触らずに env で）：ECON_REWARD_MULT1（第一幕の進軍報酬）、ECON_REWARD_MULT2（第二幕）、
// ECON_DEFEND_MULT（防衛勝利の報酬倍率）、ECON_WAGE_RATE（留守番の手当率）
vm.runInContext(`(() => {
  const m1 = Number(${JSON.stringify(process.env.ECON_REWARD_MULT1 || '')}) || 0, m2 = Number(${JSON.stringify(process.env.ECON_REWARD_MULT2 || '')}) || 0;
  if (m1) for (const s of ENEMY_STAGES) s.reward = Math.round(s.reward * m1);
  if (m2 && typeof ENEMY_STAGES_ACT2 !== 'undefined') for (const s of ENEMY_STAGES_ACT2) s.reward = Math.round(s.reward * m2);
  const d = ${JSON.stringify(process.env.ECON_DEFEND_MULT || '')}; if (d !== '') { const t = MISSION_TYPES.defend; if (t) t.rewardMult = Number(d); }
  const w = ${JSON.stringify(process.env.ECON_WAGE_RATE || '')}; if (w !== '') DEPARTMENTS.home.wageRate = Number(w);
})()`, ctx);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;
const N = Number(process.argv[2] || 50);
const mode = process.argv[3] || 'careful';
// 前借りの方針（docs/SPEC_BANK_ADVANCE_2026-09-19.md §6）。
//   none  借りない（基準線）
//   small 契約が空くたびに小口を借りる（「毎回借りる」が常に最善になっていないかを見る）
//   large 戦功25の担保が立つようになったら大口を1回だけ借りる（分散の大きい賭け）
// 担保は「いちばん弱い、条件を満たす者」を出す（人間がやりそうな出し方。強い者を賭けるのは別の話）。
const ADVANCE = process.env.ECON_ADVANCE || 'none';
const advStat = { borrowed: 0, repaid: 0, seized: 0, collectorLost: 0 };

const rows = []; // {battle, kind, gold0, reward, loot, salary, gold1, roster, home}
const spends = { hire: 0, reroll: 0, merc: 0, event: 0 };
let endGold = [], endBattles = [], endTown = [];
// 借りる（契約が空いていて、信用があって、担保に立てる者が居るときだけ）
const tryBorrow = (st, id) => {
  if (typeof Town === 'undefined' || ADVANCE === 'none') return;
  if (Town.advance(st) || Town.init(st).credit === false) return;
  const spec = Town.advanceOf(id); if (!spec) return;
  const pick = (st.roster || []).filter(m => (m.merit || 0) >= spec.merit)
    .sort((a, b) => power(a) - power(b))[0];
  if (!pick) return;
  if (Town.borrow(Game, id, pick.uid)) advStat.borrowed += 1;
};
// 期限切れの2択。ここでは常に「連れて行かせる」＝踏み倒す側に倒す。
// 取り立て人の防衛戦は勝率が読めず、測りたい「所持金の伸び」が戦闘の引きに埋もれるため。
// ＝この3本が見ているのは「踏み倒しまで込みで、借りたほうが得か」。
const settleAdvancePrompt = (st) => {
  if (!st.advancePrompt) return;
  if (st.advancePrompt.kind === 'reassign') {
    const next = (st.roster || [])[0];
    if (next && Game.advanceAssign(next.uid)) return;
  }
  if (Game.advanceHandOver()) advStat.seized += 1;
  st.advancePrompt = null;
};
for (let r = 0; r < N; r++) {
  Game.newRun();
  const st = Game.state;
  let guard = 0, battles = 0;
  while (st.phase !== 'gameover' && st.phase !== 'clear' && !st.act2Cleared && guard++ < 300) {
    while (st.phase === 'recruit' && st.applicants.length) {
      if (st.hiresLeft <= 0) { Game.skipHire(); break; }
      if (!Game.canHire()) { Game.skipHire(); break; }
      Game.hire(st.applicants.reduce((b,m,i)=> power(m) > power(st.applicants[b]) ? i : b, 0));
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      const best = st.roster.slice().sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day); else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      let kind = 'invade';
      const salary = Game.salaryTotal();
      if (mode === 'raid' && (st.missionCounts.raid || 0) < 4) kind = 'raid';
      if (mode === 'careful') {
        if (st.roster.some(m => m.loyalty < 45) && (st.missionCounts.suppress || 0) < 2) kind = 'suppress';
        else if (st.gold < salary + 5 && (st.missionCounts.raid || 0) < 4) kind = 'raid';
      }
      const d = st.missionOffers.findIndex(m => m.missionKind === 'defend');
      if (d >= 0) Game.selectMission(d);
      else {
        // 地図の候補（段階A）：望んだ型が無ければ「落とす／従える」から探す（sim.js 40fea64 と同じ）
        let i = st.missionOffers.findIndex(m => m.missionKind === kind);
        if (i < 0) i = st.missionOffers.findIndex(m => m.territoryMode === 'take');
        if (i < 0) i = st.missionOffers.findIndex(m => m.missionKind === 'invade' || m.missionKind === 'suppress');
        Game.selectMission(i >= 0 ? i : 0);
      }
    }
    if (st.phase === 'formation') {
      let pool = st.roster.slice();
      if (st.roster.length >= 3) { const sup = st.roster.slice().sort((a,b)=> power(a)-power(b)).slice(0,2).map(m=>m.uid); pool = pool.filter(m => !sup.includes(m.uid)); }
      const best = pool.sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      const gold0 = st.gold, salary = Game.salaryTotal(), roster = st.roster.length;
      const mission = Game.currentMission ? Game.currentMission() : st.selectedMission;
      const out = Game.deploy();
      if (!out) break;
      battles++;
      const rep = st.lastPayrollReport || {};
      rows.push({ battle: battles, kind: (mission && mission.missionKind) || '?', victory: out.result.victory,
        gold0, reward: out.result.victory ? (mission ? mission.reward : 0) : 0, salary, paid: rep.paid ?? null, gold1: st.gold, roster, home: roster - st.activeUids.length,
        tax: (st.town && Array.isArray(st.town.ledger) && st.town.ledger.length) ? (st.town.ledger[st.town.ledger.length - 1].tax || 0) : 0 });
    }
    if (st.phase === 'result') settleAdvancePrompt(st);
    // 前借り。建てる前に借りる（借りた金で建てられるかを見るため）。
    if (st.phase === 'result' && ADVANCE === 'small') tryBorrow(st, 'small');
    if (st.phase === 'result' && ADVANCE === 'large') tryBorrow(st, 'large');
    // 城下町：建てられるものがあれば市場から順に建てる（税収の乗数。sim と同じ「安い順に1件」ではなく市場優先）
    if (typeof Town !== 'undefined' && st.phase === 'result') {
      for (const id of ['market', 'tavern', 'smithy', 'graveyard', 'hostel', 'lab', 'factory', 'grand_kitchen']) { if (Town.canBuild(Game, id).ok) { Town.build(Game, id); break; } }
    }
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'event') {
      if (st.pendingEvent) { const o = Game.eventOptions(); if (o.length) Game.chooseEvent(o[Math.floor(Math.random()*o.length)].i); }
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') { if (Game.canRetry()) Game.retry(); else Game.concede(); }
  }
  endGold.push(st.gold); endBattles.push(battles);
  endTown.push(typeof Game.townLevelTotal === 'function' ? Game.townLevelTotal() : 0);
  if (typeof Town !== 'undefined') {
    const rec = (st.town && st.town.advanceRecord) || {};
    advStat.repaid += rec.repaid || 0;
  }
}
const by = new Map();
for (const r of rows) { if (!by.has(r.battle)) by.set(r.battle, []); by.get(r.battle).push(r); }
const avg = (a, f) => a.length ? a.reduce((s,x)=>s+f(x),0)/a.length : 0;
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const sd = a => { const m = avg(a, x => x); return a.length ? Math.sqrt(avg(a, x => (x - m) * (x - m))) : 0; };
console.log(`■ 戦略 ${mode}  前借り ${ADVANCE}  ${N}ラン  平均戦闘数 ${avg(endBattles,x=>x).toFixed(1)}`);
console.log(`  終了時所持金 平均 ${avg(endGold,x=>x).toFixed(1)}G（中央 ${med(endGold)}G・ばらつき ${sd(endGold).toFixed(1)}）`
  + `  城下町Lv計 平均 ${avg(endTown,x=>x).toFixed(2)}`
  + (ADVANCE === 'none' ? '' : `  借りた ${advStat.borrowed} 回／返した ${advStat.repaid} 回／連れて行かれた ${advStat.seized} 人`));
console.log('戦闘# 件数  出撃前G  報酬   給与   純増(勝)  勝率  軍団/留守  作戦内訳');
for (const [b, list] of [...by.entries()].sort((a,b)=>a[0]-b[0])) {
  if (b > 20) break;
  const wins = list.filter(r => r.victory);
  const kinds = {}; for (const r of list) kinds[r.kind] = (kinds[r.kind]||0)+1;
  console.log(`${String(b).padStart(4)}  ${String(list.length).padStart(3)}  ${avg(list,r=>r.gold0).toFixed(1).padStart(6)}  ${avg(wins,r=>r.reward).toFixed(1).padStart(5)}  ${avg(list,r=>r.salary).toFixed(1).padStart(5)}  ${avg(wins,r=>r.gold1-r.gold0).toFixed(1).padStart(7)}  ${(wins.length/list.length*100).toFixed(0).padStart(3)}%  ${avg(list,r=>r.roster).toFixed(1)}/${avg(list,r=>r.home).toFixed(1)}  ${Object.entries(kinds).map(([k,v])=>k+':'+v).join(' ')}`);
}
const inv = rows.filter(r => r.kind === 'invade' && r.victory);
console.log(`税収（決着ごと、記録があれば）平均 ${avg(rows.filter(r=>r.tax),r=>r.tax).toFixed(1)}G  記録あり ${rows.filter(r=>r.tax).length}/${rows.length}`);
console.log(`侵攻勝利 ${inv.length}件: 報酬平均 ${avg(inv,r=>r.reward).toFixed(1)}  給与平均 ${avg(inv,r=>r.salary).toFixed(1)}  報酬<給与 の割合 ${(inv.filter(r=>r.reward<r.salary).length/inv.length*100).toFixed(0)}%`);
const raid = rows.filter(r => r.kind === 'raid' && r.victory);
console.log(`略奪勝利 ${raid.length}件: 報酬平均 ${avg(raid,r=>r.reward).toFixed(1)}  給与平均 ${avg(raid,r=>r.salary).toFixed(1)}  純増平均 ${avg(raid,r=>r.gold1-r.gold0).toFixed(1)}`);
