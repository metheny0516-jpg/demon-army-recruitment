// バランス検証用のヘッドレスシミュレータ（ブラウザ不要）
//   使い方: node tools/sim.js
// 複数の採用戦略でランを大量に回し、クリア率・敗北ステージ・シナジー出現数を出す。
// データを追加したら、まずこれを回して「どのビルドが成立しているか」を確認する。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/skills.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/bonds.js','src/data/promotions.js','src/data/synergies.js','src/data/enemies.js','src/data/missions.js','src/data/counterattack.js','src/data/departments.js','src/data/territories.js','src/data/enemy_captains.js',...(process.env.SIM_NO_TOWN ? [] : ['src/data/town.js']),'src/data/events.js','src/data/incidents.js','src/data/demon_kings.js',
               'src/core/util.js','src/core/storage.js','src/core/kpi.js','src/core/synergy.js','src/core/battle.js','src/core/chain.js','src/core/spotlight.js',...(process.env.SIM_NO_TOWN ? [] : ['src/core/town.js']),'src/core/territory.js','src/core/captains.js','src/core/traces.js','src/core/incidents.js','src/core/run.js'];
// SIM_NO_TOWN=1 で城下町（税）を読まない。再起の回帰テスト（test-chain-measure-retry）は全滅が起きる前提なので、税で楽になった後も同じ種で測れるようにする
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; }
}};
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
const Game = vm.runInContext('Game', ctx);
// 城下町（2026-09-13 の統合で、施設はここ1系統になった）。SIM_NO_TOWN のときは未定義。
const Town = vm.runInContext('typeof Town !== "undefined" ? Town : null', ctx);
const Incidents = vm.runInContext('Incidents', ctx);
const KPI = vm.runInContext('KPI', ctx);
const Synergy = vm.runInContext('Synergy', ctx);
const TRAITS = vm.runInContext('TRAITS', ctx);
// tier2の種族技（上位技）一覧。ベタ書きせず TRAITS から都度導出する
const tier2SkillIds = Object.keys(TRAITS).filter(id => TRAITS[id].skill && TRAITS[id].skill.tier === 2);
const power = m => m.hp + m.atk*3 + m.def*2 + m.spd;

function chooseIndex(apps, roster, strat){
  // 「スライム統一＋魔法職1」：火球を撃つ者が1人だけ要る（増殖の元の起点）。
  // 1人確保できたら、あとは統一の規則に戻る。
  if (strat.caster1 && !roster.some(m => (m.tags || []).includes('caster'))) {
    const hit = apps.findIndex(m => m.tags.includes('caster'));
    if (hit >= 0) return hit;
  }
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

// 張り紙を待たない（docs/SPEC_FORCED_OMEN_2026-09-16.md §5）。
// 本体は決着の報告のあと presentPending() が走る＝**1戦ごと**に最大2件見せる。
// 日の終わりにまとめて見せると、その間に失効した札が「見せられなかった札」になり、
// 表示率が本体より低く出る。測定でも決着のたびに呼ぶ。
function showPending(st){
  for (let shown = 0; shown < 2 && (st.incidents?.pending || []).length; shown++)
    Incidents.markPresented(st, st.incidents.pending[0].id);
}

function runOnce(strat, stats){
  Game.newRun();
  const st = Game.state;
  let guard = 0;
  // 従来比較は第二幕の決着で止める。ゲーム本体はその後も継続する。
  while (st.phase !== 'gameover' && st.phase !== 'clear' && !st.act2Cleared && guard++ < 300) {
    if (strat.cards) {
      if (strat.cards === 'open') {
        if(st.incidents?.tail?.ready) Incidents.finishTail(Game, true);
        for(const id of Object.keys(st.incidents?.offered || {})) Incidents.open(Game,id,st.roster[0]?.uid);
      } else for(const [id,o] of Object.entries(st.incidents?.offered || {})) if(o.door==='B') Incidents.decline(Game,id);
    }
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
          // 軍が空になったら見送らない。安い兵を全員切った直後に高給の応募者が居ないと
          // 0体のまま出撃へ進み、deploy() が null を返してランがそこで終わる（記録が残らない）。
          // 「高給3体だけ」という意図は保ったまま、空のときだけ誰かを採って続行する。
          if (st.roster.length > 0
              && (st.roster.length >= 3 || !st.applicants.some(m => m.salary >= 5))) { Game.skipHire(); break; }
          // 高給が居ればその中で最も強い者。軍が空で高給が居ない回だけ通常の選び方へ落とす
          // （ここで採らないと0体のまま出撃してランが終わる）。
          const rich = st.applicants.map((m,i)=>[m,i]).filter(([m])=>m.salary>=5);
          const before = st.roster.length;
          Game.hire(rich.length
            ? rich.reduce((b,x)=> power(x[0])>power(b[0])?x:b)[1]
            : chooseIndex(st.applicants, st.roster, strat));
          // 採用が通らなかった（資金・枠）ならここで止める。continue だと無限ループになる
          if (st.roster.length === before) { Game.skipHire(); break; }
          continue;
        }
      }
      if (strat.kind === 'elite') {
        // 3体埋まっている、または高給の応募者がいない回は見送る（シナジーを壊さない）。
        // ただし**軍が空のときは見送らない**。初回の応募に高給が居ないと一人も採らずに
        // 出撃へ進み、deploy() が null を返してランがそこで終わる（記録が残らず、
        // 測定では「未完」として母集団から落ちる）。
        // 「高給3体だけ」という意図は保つ。空のときだけ下の通常経路へ落として誰かを採る
        // （chooseIndex は elite なら給与5G以上を優先し、居なければ最も強い者を選ぶ）。
        if (st.roster.length > 0
            && (st.roster.length >= 3 || !st.applicants.some(m => m.salary >= 5))) { Game.skipHire(); break; }
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
      // 出撃隊に入らない者は全員留守番（控えは無い）。「留守番2人」は弱い2人を出撃候補から外す
      let pool = st.roster.slice();
      if (strat.departments === 'balanced' && st.roster.length >= 3) {
        const support = st.roster.slice().sort((a,b)=> power(a) - power(b)).slice(0, 2).map(m => m.uid);
        pool = pool.filter(m => !support.includes(m.uid));
      }
      const best = pool.sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
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
      // 訓練（2026-09-13）：「進軍の前に訓練を1回」の戦略は、進軍を選ぶ手番の前に1回だけ稽古する。
      // 死なないので判断は単純でよい。回数は stats.trainings に数える。
      if (strat.train && kind === 'invade' && !st.trainedBeforeThisInvade
        && (!strat.trainMax || (st.simTrainings || 0) < strat.trainMax)
        && st.missionOffers.some(m => m.missionKind === 'train')) {
        kind = 'train';
        st.trainedBeforeThisInvade = true;
      } else if (kind !== 'train') {
        st.trainedBeforeThisInvade = false;
      }
      // 防衛戦（王国の反撃）は一択で来る。選ぶ余地は無いので、あればそれを受ける。
      const defendIndex = st.missionOffers.findIndex(m => m.missionKind === 'defend');
      // 地図の上の戦争（段階A）：候補3つからどれを落とすか。
      //   near     … 候補の先頭（近い順に落とす）
      //   portTown … 港と町を優先（効き目の大きい土地から取る）
      const takes = st.missionOffers
        .map((m, i) => ({ m, i }))
        .filter(x => x.m.territoryMode === 'take');
      let territoryIndex = -1;
      if (strat.territory && takes.length && defendIndex < 0 && kind !== 'train') {
        if (strat.territory === 'portTown') {
          const rich = takes.find(x => ['port', 'town'].includes(x.m.territoryKind));
          territoryIndex = (rich || takes[0]).i;
        } else territoryIndex = takes[0].i;
      }
      if (territoryIndex >= 0) Game.selectMission(territoryIndex);
      else if (defendIndex >= 0 && kind !== 'train') Game.selectMission(defendIndex);
      else {
        // 望んだ型が無いときの代わり（地図の候補では 'invade' が出ない決着がある）。
        // 席順で拾うと巡回ばかり選んで前に進まなくなるので、まず「落とす／従える」を探す。
        const index = st.missionOffers.findIndex(m => m.missionKind === kind);
        const take = st.missionOffers.findIndex(m => m.territoryMode === 'take');
        const fallback = take >= 0 ? take
          : st.missionOffers.findIndex(m => !['patrol', 'tribute', 'train'].includes(m.missionKind));
        Game.selectMission(index >= 0 ? index : fallback >= 0 ? fallback : Math.min(2, st.missionOffers.length - 1));
      }
      if (st.selectedMission && st.selectedMission.missionKind === 'train') { stats.trainings = (stats.trainings || 0) + 1; st.simTrainings = (st.simTrainings || 0) + 1; }
    }
    if (st.phase === 'formation') {
      // 出撃隊に入らない者は全員留守番（控えは無い）。「留守番2人」は弱い2人を出撃候補から外す
      let pool = st.roster.slice();
      if (strat.departments === 'balanced' && st.roster.length >= 3) {
        const support = st.roster.slice().sort((a,b)=> power(a) - power(b)).slice(0, 2).map(m => m.uid);
        pool = pool.filter(m => !support.includes(m.uid));
      }
      const best = pool.sort((a,b)=> power(b) - power(a)).slice(0, Game.MAX_DEPLOY);
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
      // 種族技（tier2）の発動回数をタイムラインから数える。乱数は消費しない、集計のみ
      // stats は他のハーネス（chain-v2-measure.js など）が自前で作って渡してくる。
      // その stats に skillTriggers は無いので、ここで作る（無ければ数えない、にしない）。
      if (out.result.timeline) {
        if (!stats.skillTriggers) stats.skillTriggers = {};
        for (const ev of out.result.timeline) {
          if (ev.type === 'trait_trigger' && ev.traitId && tier2SkillIds.includes(ev.traitId)) {
            stats.skillTriggers[ev.traitId] = (stats.skillTriggers[ev.traitId] || 0) + 1;
          }
        }
      }
      stats.incidents += (out.result.incidents || []).length;
      if (st.lastDepartmentReport && st.lastDepartmentReport.foodShortage) stats.foodShortages++;
      if (st.roster.some(m => m.unpaid)) stats.unpaid++;
      if (!out.result.victory) stats.lossStage[stageNow] = (stats.lossStage[stageNow]||0)+1;
      stats.battles++;
      showPending(st);
    }
    // 拠点接収：条件を満たしたら必ず使う（1ランに1度の建材の追い風）
    // 城下町：建てられるものがあれば建てる（施設は城下町の1系統になった。2026-09-13）。
    // 戦略ごとの好みだけ変える。安い順に見て、最初に建てられるものを1件。
    if (Town && st.phase === 'result') {
      const want = strat.kind === 'caster' ? ['grand_kitchen', 'market', 'tavern']
        : strat.kind === 'cheap' ? ['market', 'tavern', 'factory']
        : ['graveyard', 'market', 'smithy', 'hostel', 'tavern', 'lab', 'factory', 'grand_kitchen'];
      const order = want.concat(Town.facilities().map(f => f.id));
      for (const id of order) { if (Town.canBuild(Game, id).ok) { Town.build(Game, id); break; } }
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
  // 全滅と再建の観測（再建の仕様）。旧実装では wipeCount が無いので 0 になる。
  if (!stats.wipes) stats.wipes = 0;
  if (!stats.emptyEnds) stats.emptyEnds = 0;
  stats.wipes += st.wipeCount || 0;
  if (!st.roster.length) stats.emptyEnds++;
  // 王国の反撃の観測。旧実装ではどれも 0 になる。
  if (!stats.defense) stats.defense = { won: 0, lost: 0, ransack: 0, fall: 0, byConquest: 0, byDefense: 0 };
  const def = st.defenses || {};
  stats.defense.won += def.won || 0;
  stats.defense.lost += def.lost || 0;
  stats.defense.ransack += st.ransackCount || 0;
  // 将軍の輩出数（2026-09-13）。仕様2.1 の目安は「1ランに平均 1〜2 体」。
  // 0.5 未満なら閾値を 18 へ、3 以上なら 26 へ（この列がその判断材料）。
  if (!stats.generals) stats.generals = 0;
  stats.generals += (st.generalsMade || []).length;
  // 第二幕決着では endRun() を呼ばないため、魔界史を作らず測定用の要約だけ返す。
  let rec = st.record || {};
  if (!st.record && st.act2Cleared) {
    rec = {
      cleared: true, clearedBy: st.act2Cleared.by,
      battlesWon: st.battlesWon || 0, conquest: st.conquest || 0, alert: st.alert || 0,
      missionCounts: { ...(st.missionCounts || {}) }, payrollChoices: { ...(st.payrollChoices || {}) },
      maxChain: st.maxChain || 0, maxOverkill: st.maxOverkill || 0, chainDefVersion: st.chainDefVersion,
      mainRace: Object.entries(st.raceCounts || {}).sort((a,b) => b[1] - a[1])[0]?.[0] || 'なし',
      fallenTotal: st.fallenTotal || 0, battleIncidentTotal: st.battleIncidentTotal || 0,
      generalsMade: (st.generalsMade || []).slice(), retriesUsed: st.retriesUsed || 0,
      townLevels: Game.townLevelTotal(), townTop: Game.townTopLevel().lv, townTopId: Game.townTopLevel().id,
      discoveredSynergyIds: (st.discoveredSynergyIds || []).slice(),
      maxArmySize: Math.max(st.maxArmySize || 0, st.roster.length)
    };
    rec.buildName = Game.buildName(rec);
  }
  if (rec.cause === "城陥落") stats.defense.fall++;
  if (rec.cleared) {
    if (rec.clearedBy === "defense") stats.defense.byDefense++;
    else stats.defense.byConquest++;
  }
  // 敵将（段階B/D）：討った・雇った・最終戦の顔ぶれ。sim は提案に答えないので全部「討つ」。
  {
    const cap = st.captains || {};
    const list = Object.keys(cap);
    stats.capSlain = (stats.capSlain || 0) + list.filter(id => cap[id].status === 'slain').length;
    stats.capHired = (stats.capHired || 0) + list.filter(id => cap[id].status === 'hired').length;
    stats.capMixed = (stats.capMixed || 0) + ((st.lastHeroParty || []).length ? 1 : 0);
  }
  // 地図の上の戦争（段階A）：どこまで面を広げたか・巡回を何回まわしたか
  stats.splits = (stats.splits || 0) + (st.slimeSpawnCount || 0);   // 増殖の元（分裂した回数）
  stats.territory = (stats.territory || 0) + ((st.territory?.lands || []).length + (st.territory?.tribes || []).length);
  stats.patrols = (stats.patrols || 0) + (st.patrolCount || 0);
  stats.cards ||= {settles:0,offered:0,opened:0,natural:0,shown:0};
  stats.cards.shown ||= 0;
  for(const k of Object.keys(stats.cards)) stats.cards[k] += st.incidents?.stats?.[k] || 0;
  return rec;
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
  {name:'留守番2人', kind:'greedy', mission:'careful', departments:'balanced'},
  {name:'未払い搾取', kind:'greedy', mission:'careful', departments:'balanced', payroll:'exploit'},
  // 訓練（2026-09-13）：進軍の前に1回だけ稽古を挟む。使用率と破産率だけを見る。
  {name:'進軍の前に訓練を1回', kind:'greedy', train:true},
  // 現実の遊び方に近い形：序盤の3回だけ（種族技が開くまで）。無制限の上と見比べる。
  {name:'訓練は序盤3回だけ', kind:'greedy', train:true, trainMax:3},
  // 地図の上の戦争（docs/SPEC_TERRITORY_A_2026-09-15.md §2-5）
  // スライムの大筋②（docs/SPEC_SLIME_ARC_2_2026-09-16.md §2-4）。火球を撃つ者が1人いる編成。
  // 池の噂を**開いた**周回だけ分裂が起きる仕様なので、この戦略は札をめくる（cards:'open'）。
  {name:'スライム統一+魔法職1', kind:'race', race:'スライム', caster1:true, cards:'open'},
  {name:'近い順に落とす', kind:'greedy', territory:'near'},
  {name:'港と町を優先', kind:'greedy', territory:'portTown'},
];
const N = Number(process.argv[2] || 400);
// 連鎖測定器の既存15戦略は維持し、札の比較は通常のsim実行に追加する。
strategies.push({name:'札を全部めくる',kind:'greedy',cards:'open'}, {name:'全部無視',kind:'greedy',cards:'ignore'});
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
const skillTriggerTotals = {};
for (const s of strategies.filter(s=>!process.env.SIM_INCIDENTS_ONLY || s.cards)) {
  const stats = { generals:0, trainings:0, syn:{}, payroll:{}, unpaid:0, battles:0, lossStage:{}, retries:0, rerolls:0, events:0, incidents:0, foodShortages:0, maxArmy:0, paidHires:0, paidHireGold:0, skillTriggers:{} };
  const res = [];
  for (let i=0;i<N;i++) res.push(runOnce(s, stats));
  const avg = (res.reduce((a,r)=>a+(r.battlesWon||0),0)/N).toFixed(2);
  const clr = (res.filter(r=>r.cleared).length/N*100).toFixed(1)+'%';
  const facility = (res.reduce((a,r)=>a+(r.townLevels||0),0)/N).toFixed(2);
  const loss = Object.keys(stats.lossStage).sort((a,b)=>a-b).map(k=>`S${k}:${stats.lossStage[k]}`).join(' ');
  const syn = Object.entries(stats.syn).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' ');
  console.log(`\n■ ${s.name}  平均勝利 ${avg}戦  クリア率 ${clr}  最大軍団 ${stats.maxArmy}体  城下町Lv計 ${facility}  食料不足 ${stats.foodShortages}回  未払い発生 ${(stats.unpaid/stats.battles*100).toFixed(0)}%  戦場不祥事 ${stats.incidents}件  再起 ${stats.retries}回  求人 ${stats.rerolls}回  事件 ${stats.events}回  将軍 ${(stats.generals/N).toFixed(2)}体/ラン  訓練 ${((stats.trainings||0)/N).toFixed(2)}回/ラン  領土 ${((stats.territory||0)/N).toFixed(2)}／ラン  巡回 ${((stats.patrols||0)/N).toFixed(2)}回/ラン  敵将 討${((stats.capSlain||0)/N).toFixed(2)}／雇${((stats.capHired||0)/N).toFixed(2)}／最終戦が混成 ${stats.capMixed||0}ラン  分裂 ${((stats.splits||0)/N).toFixed(2)}回/ラン`);
  // 表示された札／出た札（§5）。1.0 未満なら 2-2 の上限か順序に穴がある。
  const shownRate = (stats.cards.shown/Math.max(1,stats.cards.offered)).toFixed(2);
  console.log(`  札: 提示 ${stats.cards.offered}／めくった ${stats.cards.opened}／自然発生 ${stats.cards.natural}／決着 ${stats.cards.settles}（波乱 ${(100*stats.cards.natural/Math.max(1,stats.cards.settles)).toFixed(2)}%）　表示された札／出た札 ${shownRate}`);
  const lv1Rate = (res.filter(r=>(r.townLevels||0) >= 1).length/N*100).toFixed(1);
  const lv3Rate = (res.filter(r=>(r.townTop||0) >= 3).length/N*100).toFixed(1);
  const nameCount = new Map();
  for (const r of res) if (r.buildName) nameCount.set(r.buildName, (nameCount.get(r.buildName) || 0) + 1);
  const topNames = [...nameCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([n, c]) => `${n}:${c}`).join(' / ');
  console.log(`  ビルド名: ${nameCount.size}種/${N}ラン　多い順 ${topNames || 'なし'}`);
  // どの施設が「その軍団の顔」になったか（一番高い施設）
  const facCount = {};
  for (const r of res) if (r.townTopId) facCount[r.townTopId] = (facCount[r.townTopId] || 0) + 1;
  console.log(`  全滅 ${stats.wipes || 0}回／名簿が空で終わったラン ${stats.emptyEnds || 0}`);
  {
    const d = stats.defense || { won: 0, lost: 0, ransack: 0, fall: 0, byConquest: 0, byDefense: 0 };
    const total = d.won + d.lost;
    console.log(`  防衛戦 ${total}回（勝ち ${d.won} 負け ${d.lost}${total ? `＝勝率 ${(d.won / total * 100).toFixed(0)}%` : ""}）`
      + `／荒らされた ${d.ransack}回／城陥落 ${d.fall}／クリア内訳 攻めた ${d.byConquest}・待った ${d.byDefense}`);
  }
  const facTop = Object.entries(facCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' ') || 'なし';
  console.log(`  城下町: 何か建てた ${lv1Rate}%（Lv3 到達 ${lv3Rate}%）／主役 ${facTop}`);
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
  for (const id of tier2SkillIds) {
    skillTriggerTotals[id] = (skillTriggerTotals[id] || 0) + (stats.skillTriggers[id] || 0);
  }
  KPI.reset();
}

console.log(`\n種族技の発動（全戦略・全ラン合計、0回=条件が厳しすぎる可能性）:`);
console.log('  ' + tier2SkillIds.map(id => `${TRAITS[id].name} ${skillTriggerTotals[id] || 0}`).join('　'));

if (kpiOut) {
  fs.writeFileSync(kpiOut, JSON.stringify(kpiDump, null, 2));
  console.log(`\nKPIを書き出した: ${kpiOut}（node tools/kpi-report.js ${kpiOut} で読む）`);
}
