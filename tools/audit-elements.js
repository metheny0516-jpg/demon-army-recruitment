// 使い捨ての監査スクリプト（2026-09-15）。各要素が実際にどれだけ「起きているか」を数える。
//   node tools/audit-elements.js 30
// sim.js と同じ読み込み。戦略は「最強優先」（人間の素直な遊び方に一番近い）と「魔法職寄せ」「ゴブリン統一」。
// 数値は変えない。判断材料だけ。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/bonds.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/counterattack.js','src/data/departments.js','src/data/town.js','src/data/events.js','src/data/incidents.js','src/data/demon_kings.js',
  'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/battle.js','src/core/chain.js','src/core/spotlight.js','src/core/town.js','src/core/traces.js','src/core/incidents.js','src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } } };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx), Town = vm.runInContext('Town', ctx), Synergy = vm.runInContext('Synergy', ctx);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;
const N = Number(process.argv[2] || 30);

function pick(apps, strat){
  if (strat.race) { const i = apps.findIndex(m => m.race === strat.race); if (i >= 0) return i; }
  if (strat.caster) { const i = apps.findIndex(m => m.tags.includes('caster')); if (i >= 0) return i; }
  return apps.reduce((b,m,i)=> power(m) > power(apps[b]) ? i : b, 0);
}
const inc = (o,k,n=1) => { o[k] = (o[k]||0) + n; };

function runOnce(strat, A){
  Game.newRun(); const st = Game.state; let guard = 0;
  const seenSyn = new Set();
  while (st.phase !== 'gameover' && st.phase !== 'clear' && guard++ < 300) {
    while (st.phase === 'recruit' && st.applicants.length) {
      if (st.hiresLeft <= 0) { Game.skipHire(); break; }
      // 指名求人・傭兵・宴・合体の「使えた場面」を数える（使うかどうかは戦略で分ける）
      if (Game.briefUnlocked && Game.briefUnlocked()) inc(A, 'brief_available_phase');
            if (strat.feast && Game.feastQuote().affordable) { Game.holdFeast(); inc(A, 'feast_held'); }
      { const bid = vm.runInContext('RECRUIT_BRIEFS[0].id', ctx); if (Game.canPostBrief(bid)) inc(A,'brief_affordable_phase'); if (strat.brief && Game.canPostBrief(bid)) { Game.postBrief(bid); inc(A, 'brief_posted'); } }
      if (!Game.canHire()) { Game.skipHire(); break; }
      const before = st.roster.length; Game.hire(pick(st.applicants, strat)); if (st.roster.length === before) { Game.skipHire(); break; }
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      const best = st.roster.slice().sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY); best.sort((a,b)=> b.hp - a.hp);
      st.activeUids = best.map(m => m.uid); Game.setPayrollPolicy('regular');
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day); else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      const d = st.missionOffers.findIndex(m => m.missionKind === 'defend');
      const i = st.missionOffers.findIndex(m => m.missionKind === 'invade');
      Game.selectMission(d >= 0 ? d : (i >= 0 ? i : 0));
      inc(A, 'mission_'+(st.selectedMission?.missionKind||'?'));
    }
    if (st.phase === 'formation') {
      const best = st.roster.slice().sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY); best.sort((a,b)=> b.hp - a.hp);
      st.activeUids = best.map(m => m.uid); Game.setPayrollPolicy('regular');
      if (Game.kingSlimePreview && Game.kingSlimePreview()) inc(A, 'kingslime_possible');
      if (Game.canHireMercenary(0)) inc(A, 'merc_affordable_phase');
      if (strat.merc && Game.canHireMercenary(0)) { Game.hireMercenary(0); inc(A, 'merc_hired'); }
      // 発火条件は軍団全体（synergyPool）で数える。出撃隊だけで数えると《魔王軍完成》や《魔法結社》が消える（2026-09-16 に一度誤判定した）
      const syn = Synergy.active(Game.activeRoster(), { pool: Game.synergyPool() }).filter(s => s.type !== 'merge');
      inc(A, 'syn_battles_'+Math.min(3, syn.length));
      for (const s of syn) { seenSyn.add(s.name); inc(A, 'synname_'+s.name); }
      const out = Game.deploy(); if (!out) break;
      const r = out.result, tl = r.timeline || [];
      inc(A, 'battles');
      if (!r.victory) inc(A, 'losses');
      const mom = Math.max(0, ...tl.filter(e => e.type==='momentum').map(e => e.total||0));
      inc(A, 'momentum_max_'+(mom>=120?'120':mom>=80?'80':mom>=40?'40':mom>0?'lt40':'0'));
      const ok = tl.filter(e => e.type==='overkill');
      inc(A, 'overkill_events', ok.length); if (ok.some(e => e.rank && e.rank.emphasis >= 2)) inc(A, 'overkill_big_battles');
      const cm = r.chainSummary?.maxChain || 0; inc(A, 'chain_max_'+(cm>=5?'5+':cm));
      inc(A, 'happenings', (r.incidents||[]).length);
      if (r.retreatOffer) inc(A, 'retreat_offered');
      if ((r.orderOffers||[]).length || r.orderOffer) inc(A, 'order_offered');
      inc(A, 'trait_triggers', tl.filter(e => e.type==='trait_trigger').length);
      inc(A, 'skill_calls', tl.filter(e => e.type==='skill_call').length);
      inc(A, 'facility_triggers', tl.filter(e => e.type==='facility_trigger').length);
      inc(A, 'eat', r.rationsEaten||0); if ((r.sparked||[]).length) inc(A, 'sparked');
      if (tl.some(e => e.type==='result' && e.reversal)) inc(A, 'reversal');
      if (r.nearMiss && (r.nearMiss.count||r.nearMiss.units?.length||r.nearMiss.closest)) inc(A, 'nearmiss');
      if ((r.deathChains||[]).length) inc(A, 'death_chains');
      if (r.summonCount) inc(A, 'summons');
      inc(A, 'spirit_gained', Object.values(r.spiritGained||{}).reduce((a,b)=>a+b,0));
      if (st.lastDepartmentReport?.foodShortage) inc(A, 'food_shortage');
    }
    if (Game.canSeizeStronghold()) { Game.seizeStronghold(); inc(A, 'seize'); }
    if (st.phase === 'result') { for (const f of Town.facilities()) { if (Town.canBuild(Game, f.id).ok) { Town.build(Game, f.id); break; } } Game.afterResult(); }
    if (st.phase === 'event') { if (st.pendingEvent) { const o = Game.eventOptions(); if (o.length) { Game.chooseEvent(o[Math.floor(Math.random()*o.length)].i); inc(A, 'events'); } } Game.nextRecruit(); }
    if (st.phase === 'defeat') { if (Game.canRetry()) { Game.retry(); inc(A, 'retry'); } else Game.concede(); }
    if (st.debts?.length) inc(A, 'debt_pending_turns');
    if (st.pendingBond) inc(A, 'bond_pending');
  }
  inc(A, 'runs'); if (st.record?.cleared) inc(A, 'cleared');
  inc(A, 'syn_kinds_total', seenSyn.size);
  inc(A, 'generals', (st.generalsMade||[]).length);
  inc(A, 'promoted', st.roster.filter(m => m.rankId && m.rankId !== 'recruit' && Game.rankOf(m) !== vm.runInContext('PROMOTION_RANKS[0]', ctx)).length);
  inc(A, 'debts_total', (st.debtHistory||[]).length);
  if (st.hallOfFame?.length || (Game.hallOfFameMember && Game.hallOfFameMember())) inc(A, 'hof_runs');
  inc(A, 'lessons_offered', (Game.lessonOffers ? (Game.lessonOffers(st.record)||[]).length : 0));
  inc(A, 'traces_kinds', new Set((Array.isArray(st.traces)?st.traces:[]).map(t=>t.kind)).size);
  inc(A, 'town_levels', Game.townLevelTotal ? Game.townLevelTotal() : 0);
  inc(A, 'territory_conq', st.conquest||0);
}
const strategies = [
  {name:'最強優先'}, {name:'魔法職寄せ', caster:true}, {name:'ゴブリン統一', race:'ゴブリン'},
  {name:'最強優先+傭兵・宴・指名求人を使う', merc:true, feast:true, brief:true},
];
for (const s of strategies) {
  const A = {}; for (let i=0;i<N;i++) runOnce(s, A);
  const b = A.battles || 1;
  console.log(`\n■ ${s.name}（${N}ラン、${A.battles}戦、クリア ${A.cleared||0}）`);
  const per = k => ((A[k]||0)/b*100).toFixed(0)+'%';
  console.log(`  戦意 最大: 0=${per('momentum_max_0')} <40=${per('momentum_max_lt40')} 40+=${per('momentum_max_40')} 80+=${per('momentum_max_80')} 120(上限)=${per('momentum_max_120')}`);
  console.log(`  最大CHAIN: ${[0,1,2,3,4,'5+'].map(k=>k+'='+per('chain_max_'+k)).join(' ')}`);
  console.log(`  OVERKILL: ${((A.overkill_events||0)/b).toFixed(2)}回/戦、蹂躙以上が出た戦 ${per('overkill_big_battles')}`);
  console.log(`  シナジー数/戦: 0=${per('syn_battles_0')} 1=${per('syn_battles_1')} 2=${per('syn_battles_2')} 3+=${per('syn_battles_3')}　種類 ${((A.syn_kinds_total||0)/N).toFixed(1)}/ラン`);
  console.log(`  シナジー名: ${Object.keys(A).filter(k=>k.startsWith('synname_')).sort((a,b)=>A[b]-A[a]).map(k=>k.slice(8)+':'+A[k]).join(' ')}`);
  console.log(`  戦場不祥事 ${((A.happenings||0)/b).toFixed(2)}/戦、逆転 ${per('reversal')}、ニアミス ${per('nearmiss')}、死の連鎖 ${per('death_chains')}、召喚 ${per('summons')}`);
  console.log(`  撤退の提案 ${per('retreat_offered')}、号令の節目 ${per('order_offered')}、種族技 ${((A.trait_triggers||0)/b).toFixed(2)}/戦、技の台詞 ${((A.skill_calls||0)/b).toFixed(2)}/戦、施設発火 ${((A.facility_triggers||0)/b).toFixed(2)}/戦`);
  console.log(`  食べる ${((A.eat||0)/b).toFixed(2)}/戦、火の粉 ${per('sparked')}、食料不足 ${per('food_shortage')}、気合 ${((A.spirit_gained||0)/N).toFixed(1)}/ラン`);
  console.log(`  傭兵: 雇える場面 ${A.merc_affordable_phase||0}回 雇った ${A.merc_hired||0}　宴 ${A.feast_held||0}　指名求人: 解禁場面 ${A.brief_available_phase||0} 出せた ${A.brief_affordable_phase||0} 出した ${A.brief_posted||0}　合体可 ${A.kingslime_possible||0}`);
  console.log(`  事件 ${((A.events||0)/N).toFixed(1)}/ラン、ツケ持ち手番 ${A.debt_pending_turns||0}、縁故 ${A.bond_pending||0}、再起 ${A.retry||0}、接収 ${A.seize||0}、将軍 ${((A.generals||0)/N).toFixed(2)}/ラン、昇進者 ${((A.promoted||0)/N).toFixed(1)}/ラン`);
  console.log(`  作戦: ${Object.keys(A).filter(k=>k.startsWith('mission_')).map(k=>k.slice(8)+'='+A[k]).join(' ')}　城下町Lv計 ${((A.town_levels||0)/N).toFixed(1)}　痕跡種類 ${((A.traces_kinds||0)/N).toFixed(1)}`);
}
