// バランス検証用のヘッドレスシミュレータ（ブラウザ不要）
//   使い方: node tools/sim.js
// 複数の採用戦略でランを大量に回し、クリア率・敗北ステージ・シナジー出現数を出す。
// データを追加したら、まずこれを回して「どのビルドが成立しているか」を確認する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/departments.js','src/data/events.js','src/data/demon_kings.js',
               'src/core/util.js','src/core/storage.js','src/core/synergy.js','src/core/battle.js','src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
const Synergy = vm.runInContext('Synergy', ctx);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;

function chooseIndex(apps, roster, strat){
  if (strat.kind === 'race') {
    const hit = apps.findIndex(m => m.race === strat.race);
    if (hit >= 0) return hit;
  }
  if (strat.kind === 'cheap') return apps.reduce((b,m,i)=> m.salary < apps[b].salary ? i : b, 0);
  if (strat.kind === 'caster') {
    const hit = apps.findIndex(m => m.tags.includes('caster'));
    if (hit >= 0) return hit;
  }
  if (strat.kind === 'elite') {
    const rich = apps.map((m,i)=>[m,i]).filter(([m])=> m.salary >= 5);
    if (rich.length) return rich.reduce((b,x)=> power(x[0])>power(b[0])?x:b)[1];
  }
  return apps.reduce((b,m,i)=> power(m) > power(apps[b]) ? i : b, 0);
}

function runOnce(strat, stats){
  Game.newRun();
  const st = Game.state;
  let guard = 0;
  while (st.phase !== 'gameover' && st.phase !== 'clear' && guard++ < 300) {
    stats.maxArmy = Math.max(stats.maxArmy, st.roster.length);
    // 採用フェーズ: 枠がある限り採用する
    while (st.phase === 'recruit' && st.applicants.length) {
      // 種族狙いの戦略は、目当てが居らず金に余裕があれば求人を出し直す
      if (strat.reroll && strat.kind === 'race'
          && !st.applicants.some(m => m.race === strat.race)
          && Game.canReroll()
          && st.gold - Game.rerollCost() >= strat.keepGold) {
        Game.reroll(); stats.rerolls++;
        continue;
      }
      if (strat.kind === 'pivot') {
        // ステージ4以降、安い兵を解雇して少数精鋭に切り替える
        if (st.stage >= 4) {
          for (const m of st.roster.filter(m => m.salary < 5)) Game.fire(m.uid);
          while (st.roster.length > 3) {
            const worst = st.roster.reduce((b,m)=> power(m) < power(b) ? m : b, st.roster[0]);
            Game.fire(worst.uid);
          }
          if (st.roster.length >= 3 || !st.applicants.some(m => m.salary >= 5)) { Game.skipHire(); break; }
          Game.hire(st.applicants.map((m,i)=>[m,i]).filter(([m])=>m.salary>=5)
                    .reduce((b,x)=> power(x[0])>power(b[0])?x:b)[1]);
          continue;
        }
      }
      if (strat.kind === 'elite') {
        // 3体埋まっている、または高給の応募者がいない回は見送る（シナジーを壊さない）
        if (st.roster.length >= 3 || !st.applicants.some(m => m.salary >= 5)) { Game.skipHire(); break; }
      }
      if (!Game.canHire()) {
        const idx = chooseIndex(st.applicants, st.roster, strat);
        const weakest = st.roster.reduce((b,m)=> power(m) < power(b) ? m : b, st.roster[0]);
        if (power(st.applicants[idx]) > power(weakest) * 1.1) Game.fire(weakest.uid);
        else { Game.skipHire(); break; }
      }
      Game.hire(chooseIndex(st.applicants, st.roster, strat));
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      if (strat.departments === 'balanced' && st.roster.length >= 3) {
        for (const m of st.roster) Game.assignDepartment(m.uid, 'combat');
        const support = st.roster.slice().sort((a,b)=> power(a) - power(b));
        Game.assignDepartment(support[0].uid, 'life');
        Game.assignDepartment(support[1].uid, 'construction');
      }
      const best = Game.departmentRoster('combat').slice().sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      best.sort((a,b)=> b.hp - a.hp);
      st.activeUids = best.map(m => m.uid);
      Game.setPayrollPolicy('regular');
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day);
      else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      let kind = 'invade';
      const salary = Game.salaryTotal();
      if (strat.mission === 'raid' && (st.missionCounts.raid || 0) < 4) kind = 'raid';
      if (strat.mission === 'careful') {
        const lowLoyalty = st.roster.some(m => m.loyalty < 45);
        if (lowLoyalty && (st.missionCounts.suppress || 0) < 2) kind = 'suppress';
        else if (st.gold < salary + 5 && (st.missionCounts.raid || 0) < 4) kind = 'raid';
      }
      const index = st.missionOffers.findIndex(m => m.missionKind === kind);
      Game.selectMission(index >= 0 ? index : 2);
    }
    if (st.phase === 'formation') {
      if (strat.departments === 'balanced' && st.roster.length >= 3) {
        for (const m of st.roster) Game.assignDepartment(m.uid, 'combat');
        const support = st.roster.slice().sort((a,b)=> power(a) - power(b));
        Game.assignDepartment(support[0].uid, 'life');
        Game.assignDepartment(support[1].uid, 'construction');
      }
      const best = Game.departmentRoster('combat').slice().sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
      best.sort((a,b)=> b.hp - a.hp);                // 強い5体を選び、HP高い順に前へ
      st.activeUids = best.map(m => m.uid);
      let payroll = 'regular';
      if (strat.payroll === 'exploit') {
        const avgLoyalty = st.roster.length
          ? st.roster.reduce((sum,m)=>sum + m.loyalty, 0) / st.roster.length : 100;
        const hasRage = Game.activeRoster().some(m => m.traits.includes('rage_unpaid'));
        if (hasRage && avgLoyalty >= 55) payroll = 'withhold';
        else if (avgLoyalty < 45 && Game.payrollQuote('advance').affordable) payroll = 'advance';
      }
      Game.setPayrollPolicy(payroll);
      stats.payroll[payroll] = (stats.payroll[payroll] || 0) + 1;
      for (const s of Synergy.active(Game.activeRoster())) stats.syn[s.name] = (stats.syn[s.name]||0)+1;
      const stageNow = st.stage;
      const out = Game.deploy();
      if (!out) break;
      stats.incidents += (out.result.incidents || []).length;
      if (st.lastDepartmentReport && st.lastDepartmentReport.foodShortage) stats.foodShortages++;
      if (st.roster.some(m => m.unpaid)) stats.unpaid++;
      if (!out.result.victory) stats.lossStage[stageNow] = (stats.lossStage[stageNow]||0)+1;
      stats.battles++;
    }
    if (st.phase === 'result') Game.afterResult();
    // ハプニングは無作為に選ぶ（人間の判断は再現できないため）
    if (st.phase === 'event') {
      if (st.pendingEvent) {
        const opts = Game.eventOptions();
        if (opts.length) { Game.chooseEvent(opts[Math.floor(Math.random()*opts.length)].i); stats.events++; }
      }
      Game.nextRecruit();
    }
    // 敗北したが再起できる状態。実プレイヤー同様、権利があれば必ず使う。
    if (st.phase === 'defeat') {
      if (Game.canRetry()) { Game.retry(); stats.retries++; }
      else Game.concede();
    }
  }
  return st.record || {};
}

const strategies = [
  {name:'最強優先', kind:'greedy'},
  {name:'ゴブリン統一', kind:'race', race:'ゴブリン'},
  {name:'ゴブリン統一+求人', kind:'race', race:'ゴブリン', reroll:true, keepGold:6},
  {name:'スライム統一', kind:'race', race:'スライム'},
  {name:'骸骨寄せ+求人', kind:'race', race:'骸骨兵', reroll:true, keepGold:6},
  {name:'骸骨寄せ', kind:'race', race:'骸骨兵'},
  {name:'安月給', kind:'cheap'},
  {name:'魔法職寄せ', kind:'caster'},
  {name:'精鋭3体', kind:'elite'},
  {name:'中盤で精鋭に転換', kind:'pivot'},
  {name:'略奪4回→侵攻', kind:'greedy', mission:'raid'},
  {name:'慎重経営', kind:'greedy', mission:'careful'},
  {name:'三部門均衡', kind:'greedy', mission:'careful', departments:'balanced'},
  {name:'未払い搾取', kind:'greedy', mission:'careful', departments:'balanced', payroll:'exploit'},
];
const N = Number(process.argv[2] || 400);
for (const s of strategies) {
  const stats = { syn:{}, payroll:{}, unpaid:0, battles:0, lossStage:{}, retries:0, rerolls:0, events:0, incidents:0, foodShortages:0, maxArmy:0 };
  const res = [];
  for (let i=0;i<N;i++) res.push(runOnce(s, stats));
  const avg = (res.reduce((a,r)=>a+(r.battlesWon||0),0)/N).toFixed(2);
  const clr = (res.filter(r=>r.cleared).length/N*100).toFixed(1)+'%';
  const facility = (res.reduce((a,r)=>a+(r.facilityLevel||0),0)/N).toFixed(2);
  const loss = Object.keys(stats.lossStage).sort((a,b)=>a-b).map(k=>`S${k}:${stats.lossStage[k]}`).join(' ');
  const syn = Object.entries(stats.syn).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' ');
  console.log(`\n■ ${s.name}  平均勝利 ${avg}戦  クリア率 ${clr}  最大軍団 ${stats.maxArmy}体  平均施設Lv ${facility}  食料不足 ${stats.foodShortages}回  未払い発生 ${(stats.unpaid/stats.battles*100).toFixed(0)}%  戦場不祥事 ${stats.incidents}件  再起 ${stats.retries}回  求人 ${stats.rerolls}回  事件 ${stats.events}回`);
  console.log(`  敗北ステージ: ${loss}`);
  console.log(`  シナジー出現: ${syn || 'なし'}`);
  console.log(`  給与方針: ${Object.entries(stats.payroll).map(([k,v])=>`${k}:${v}`).join(' ')}`);
}
