// バランス検証用のヘッドレスシミュレータ（ブラウザ不要）
//   使い方: node tools/sim.js
// 複数の採用戦略でランを大量に回し、クリア率・敗北ステージ・シナジー出現数を出す。
// データを追加したら、まずこれを回して「どのビルドが成立しているか」を確認する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/departments.js','src/data/events.js','src/data/demon_kings.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/battle.js','src/core/chain.js','src/core/run.js'];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
const KPI = vm.runInContext('KPI', ctx);
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
      // 基準戦略は従来どおり無料枠だけを使う。追加紹介の戦略は別途比較して足す。
      if (st.hiresLeft <= 0) {
        const target = strat.paidHire && strat.kind === 'race'
          && st.applicants.some(m => m.race === strat.race);
        if (!target || st.gold - Game.hireCost() < (strat.keepGold || 0)) { Game.skipHire(); break; }
      }
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
      const hireCost = Game.hireCost();
      Game.hire(chooseIndex(st.applicants, st.roster, strat));
      if (hireCost > 0) { stats.paidHires++; stats.paidHireGold += hireCost; }
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
    // 拠点接収：施設ゼロのまま条件を満たしたら必ず使う（入口が到達率をどれだけ動かすかを測る）
    if (Game.canSeizeStronghold()) { Game.seizeStronghold(); stats.seizes++; }
    if (st.phase === 'result') Game.afterResult();
    if (st.phase === 'facility') {
      const id = strat.kind === 'cheap' || strat.kind === 'race' && strat.race === 'ゴブリン'
        ? 'extortion_ledger'
        : strat.kind === 'caster' ? 'grand_kitchen' : 'graveyard';
      Game.chooseFacility(id);
    }
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
  {name:'ゴブリン統一+追加採用', kind:'race', race:'ゴブリン', paidHire:true, keepGold:6},
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
// KPIの書き出し先（任意）: node tools/sim.js 30 --kpi /tmp/kpi.json
// 実機のプレイではないので数値そのものは参考値だが、KPI→レポートの経路を
// 人間の試遊を待たずに通せる。試遊で集めた本物の export とは混ぜないこと。
const kpiOut = (() => {
  const at = process.argv.indexOf('--kpi');
  return at >= 0 ? process.argv[at + 1] : null;
})();
// 旧仕様（施設Lv.＝全員のHP・防御補正）は2026-09-03に撤去した。
// 比較フラグは run.js が hpMult を読まなくなり復元できないため削除した。
// 撤去前後の数値は HANDOFF 0節の表に残してある。
const kpiDump = { version: 1, runs: [], totals: {}, lastRunEndedAt: 0, lastScreen: null };
for (const s of strategies) {
  const stats = { syn:{}, payroll:{}, unpaid:0, battles:0, lossStage:{}, retries:0, rerolls:0, events:0, incidents:0, foodShortages:0, maxArmy:0, paidHires:0, paidHireGold:0, seizes:0 };
  const res = [];
  for (let i=0;i<N;i++) res.push(runOnce(s, stats));
  const avg = (res.reduce((a,r)=>a+(r.battlesWon||0),0)/N).toFixed(2);
  const clr = (res.filter(r=>r.cleared).length/N*100).toFixed(1)+'%';
  const facility = (res.reduce((a,r)=>a+(r.facilityLevel||0),0)/N).toFixed(2);
  const loss = Object.keys(stats.lossStage).sort((a,b)=>a-b).map(k=>`S${k}:${stats.lossStage[k]}`).join(' ');
  const syn = Object.entries(stats.syn).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' ');
  console.log(`\n■ ${s.name}  平均勝利 ${avg}戦  クリア率 ${clr}  最大軍団 ${stats.maxArmy}体  平均施設Lv ${facility}  食料不足 ${stats.foodShortages}回  未払い発生 ${(stats.unpaid/stats.battles*100).toFixed(0)}%  戦場不祥事 ${stats.incidents}件  再起 ${stats.retries}回  求人 ${stats.rerolls}回  事件 ${stats.events}回`);
  const lv1Rate = (res.filter(r=>(r.facilityLevel||0) >= 1).length/N*100).toFixed(1);
  const lv3Rate = (res.filter(r=>(r.facilityLevel||0) >= 3).length/N*100).toFixed(1);
  const nameCount = new Map();
  for (const r of res) if (r.buildName) nameCount.set(r.buildName, (nameCount.get(r.buildName) || 0) + 1);
  const topNames = [...nameCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([n, c]) => `${n}:${c}`).join(' / ');
  console.log(`  ビルド名: ${nameCount.size}種/${N}ラン　多い順 ${topNames || 'なし'}`);
  const facCount = { extortion_ledger: 0, grand_kitchen: 0, graveyard: 0 };
  for (const r of res) if (r.activeFacilityId in facCount) facCount[r.activeFacilityId]++;
  console.log(`  施設到達: Lv1以上 ${lv1Rate}%（Lv3 ${lv3Rate}%）／選択 恐喝帳簿:${facCount.extortion_ledger} 巨大厨房:${facCount.grand_kitchen} 墓地:${facCount.graveyard}／拠点接収 ${stats.seizes}回`);
  console.log(`  敗北ステージ: ${loss}`);
  console.log(`  シナジー出現: ${syn || 'なし'}`);
  console.log(`  給与方針: ${Object.entries(stats.payroll).map(([k,v])=>`${k}:${v}`).join(' ')}`);
  if (s.paidHire) console.log(`  追加採用: ${stats.paidHires}人／紹介料 ${stats.paidHireGold}G（${N}ラン合計）`);
  // 「1ランで仮説を何回試せたか」。同じ編成の連戦は試行に数えない（設計憲法 第14節）
  const kpiData = KPI.load();
  const kpiRuns = kpiData.runs;
  if (kpiRuns.length) {
    const mean = key => (kpiRuns.reduce((sum, r) => sum + (r[key] || 0), 0) / kpiRuns.length).toFixed(1);
    console.log(`  ビルド試行: 平均 ${mean('buildAttempts')}回/ラン（戦闘 ${mean('battles')}回）`);
    // 種族統一ボーナスではなく「異なる条件がどれだけ繋がったか」。
    // 深さ（最大CHAIN）より、1本の連鎖がまたいだ能力の種類数を見る
    const kinds = (kpiRuns.reduce((sum, r) => sum + Object.keys(r.triggerKinds || {}).length, 0)
      / kpiRuns.length).toFixed(1);
    console.log(`  シナジー接続: トリガー種類 平均 ${kinds}種/ラン　最大CHAIN 平均 ${
      mean('chainMax')}　代表CHAINの能力数 平均 ${mean('chainAbilityMax')}`);
    if (kpiOut) {
      for (const run of kpiRuns) kpiDump.runs.push({ ...run, strategy: s.name });
      kpiDump.lastScreen = kpiData.lastScreen;
      kpiDump.lastRunEndedAt = kpiData.lastRunEndedAt;
      for (const [key, value] of Object.entries(kpiData.totals || {})) {
        kpiDump.totals[key] = (kpiDump.totals[key] || 0) + value;
      }
    }
  }
  KPI.reset();
}

if (kpiOut) {
  fs.writeFileSync(kpiOut, JSON.stringify(kpiDump, null, 2));
  console.log(`\nKPIを書き出した: ${kpiOut}（node tools/kpi-report.js ${kpiOut} で読む）`);
}
