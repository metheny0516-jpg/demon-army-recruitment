// 「詰め込みすぎて死んでいる要素」を実測で洗い出す。
//
// 何を数えるか: 特性・シナジー・ハプニング・事件・戦場不祥事・施設・作戦・給与方針・
//              魔王・実績・昇進・魔王命令が、実プレイ相当のランで何回発火したか。
// 使い方: node tools/audit-dead.js [ラン数]
//
// 発火0＝死んでいる。1〜数回＝出会えない。ここを見て「消す／条件を緩める／統合する」を決める。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
  'src/data/achievements.js', 'src/data/portraits.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js', 'src/core/kpi.js',
  'src/core/battle.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math: Object.create(Math), Date, JSON, localStorage: {
  getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
} };
vm.createContext(ctx);
for (const f of files) { try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); } catch (e) {} }
const Game = vm.runInContext('Game', ctx);
const Battle = vm.runInContext('Battle', ctx);
const get = n => { try { return vm.runInContext(n, ctx); } catch (e) { return null; } };
const TRAITS = get('TRAITS') || {}, SYNERGIES = get('SYNERGIES') || [], EVENTS = get('EVENTS') || [];
const HAPPENINGS = get('BATTLE_HAPPENINGS') || [], MISSION_TYPES = get('MISSION_TYPES') || [];
const DEMON_KINGS = get('DEMON_KINGS') || [], ACHIEVEMENTS = get('ACHIEVEMENTS') || [];
const PROMOTIONS = get('PROMOTIONS') || get('RANKS') || [], MONSTERS = get('MONSTER_TEMPLATES') || [];
const FACILITY_LEVELS = get('FACILITY_LEVELS') || [], BIG_FACILITIES = get('BIG_FACILITIES') || get('FACILITIES') || [];

const RUNS = Number(process.argv[2] || 40);
const count = {
  trait: {}, synergy: {}, event: {}, happening: {}, mission: {}, payroll: {}, king: {},
  facility: {}, command: {}, achievement: {}, rank: {}, race: {}, traitOwned: {}
};
const bump = (bag, key, n) => { bag[key] = (bag[key] || 0) + (n === undefined ? 1 : n); };

// 特性の「発火」は戦闘タイムラインから読む。notes（modDealt系）とtrait_triggerの両方を見る。
// 特性の発火は形がばらばら（trait_trigger / notes / 【名前】入りのテキスト / label）。
// 取りこぼすと「死んでいる」と誤判定するので、名前でも本文を走査する。
const traitByName = {};
for (const [id, t] of Object.entries(TRAITS)) if (t && t.name) traitByName[t.name] = id;
const scanTimeline = timeline => {
  for (const e of timeline || []) {
    if (e.traitId) bump(count.trait, e.traitId);
    if (Array.isArray(e.traits)) for (const t of e.traits) { if (traitByName[t]) bump(count.trait, traitByName[t]); }
    if (e.label && traitByName[e.label]) bump(count.trait, traitByName[e.label]);
    if (e.text) {
      for (const [name, id] of Object.entries(traitByName)) {
        if (e.text.includes('【' + name + '】') || e.text.includes(name + '】')) { bump(count.trait, id); }
        else if (e.text.includes('特性（') && e.text.includes(name)) bump(count.trait, id);
      }
    }
    if (e.type === 'incident' && e.id) bump(count.happening, e.id);
    if (e.type === 'synergy' && e.id) bump(count.synergy, e.id);
    if (e.type === 'facility_trigger' && e.facilityId) bump(count.facility, e.facilityId);
    if (e.type === 'command' && e.commandId) bump(count.command, e.commandId);
  }
};

const power = m => m.hp + m.atk * 3 + m.def * 2 + m.spd;
const strategies = ['greedy', 'balanced', 'cheap', 'chain'];
for (let run = 0; run < RUNS; run++) {
  const strat = strategies[run % strategies.length];
  const king = DEMON_KINGS[run % Math.max(1, DEMON_KINGS.length)];
  Game.newRun(king && king.id);
  bump(count.king, (king && king.id) || 'standard');
  const st = Game.state;
  let guard = 0;
  while (guard++ < 300 && st.phase !== 'gameover' && st.phase !== 'clear') {
    while (st.phase === 'recruit' && st.applicants.length && st.hiresLeft > 0) {
      let idx = 0;
      if (strat === 'cheap') idx = st.applicants.reduce((b, m, i) => m.salary < st.applicants[b].salary ? i : b, 0);
      else if (strat === 'chain') {
        const CH = ['relay_kick', 'escalate', 'chain_toll', 'deep_dread', 'chain_massacre', 'greedy'];
        const sc = m => (m.traits || []).filter(t => CH.includes(t)).length;
        idx = st.applicants.reduce((b, m, i) => sc(m) > sc(st.applicants[b]) ? i : b, 0);
      } else idx = st.applicants.reduce((b, m, i) => power(m) > power(st.applicants[b]) ? i : b, 0);
      const hired = st.applicants[idx];
      if (hired) { bump(count.race, hired.race); for (const t of hired.traits || []) bump(count.traitOwned, t); }
      Game.hire(idx);
    }
    if (st.phase === 'recruit') Game.skipHire();
    if (st.phase === 'preparation') {
      st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
      Game.setPayrollPolicy('regular');
      if (st.day < Game.OPENING_DAYS) Game.advanceDay(st.day); else Game.prepareOpeningBattle('invade');
    }
    if (st.phase === 'mission') {
      const kinds = ['invade', 'raid', 'suppress'];
      const want = kinds[(run + st.turn) % 3];
      const i = st.missionOffers.findIndex(m => m.missionKind === want);
      Game.selectMission(i >= 0 ? i : 0);
      bump(count.mission, (st.selectedMission || {}).missionKind || want);
    }
    if (st.phase === 'formation') {
      if (strat === 'balanced' && st.roster.length >= 3) {
        for (const m of st.roster) Game.assignDepartment(m.uid, 'combat');
        const sup = st.roster.slice().sort((a, b) => power(a) - power(b));
        Game.assignDepartment(sup[0].uid, 'life');
        Game.assignDepartment(sup[1].uid, 'construction');
      }
      st.activeUids = Game.departmentRoster('combat').slice(0, Game.MAX_DEPLOY).map(m => m.uid);
      const policies = ['regular', 'regular', 'withhold', 'advance'];
      const pol = policies[(run + st.turn) % policies.length];
      if (Game.setPayrollPolicy(pol)) bump(count.payroll, pol);
      let out = Game.deploy();
      if (!out) break;
      if (out.paused) {
        const cmds = Battle.COMMANDS.map(c => c.id).concat([null]);
        let pick = cmds[(run + st.turn) % cmds.length];
        if (pick && !Game.commandAffordable(pick)) pick = null;
        out = Game.issueCommand(pick);
        if (!out) break;
      }
      scanTimeline(out.result.timeline);
      for (const n of out.result.activeSynergies || []) bump(count.synergy, '(name)' + n);
      for (const m of st.roster) if (m.rankId) bump(count.rank, m.rankId);
    }
    if (st.phase === 'facility') {
      const opts = (Game.facilityChoices && Game.facilityChoices()) || [];
      if (opts.length) { bump(count.facility, '(選択)' + opts[run % opts.length].id); Game.chooseFacility(opts[run % opts.length].id); }
      else break;
    }
    if (st.phase === 'result') Game.afterResult ? Game.afterResult() : Game.nextRecruit();
    if (st.phase === 'event') {
      if (st.pendingEvent) bump(count.event, st.pendingEvent.id);
      const o = Game.eventOptions();
      if (o.length) Game.chooseEvent(o[(run + guard) % o.length].i);
      Game.nextRecruit();
    }
    if (st.phase === 'defeat') { if (Game.canRetry && Game.canRetry()) Game.retry(); else break; }
  }
  for (const a of (st.record && st.record.achievements) || []) bump(count.achievement, a.id || a);
};

const report = (title, all, bag, describe) => {
  console.log(`\n■ ${title}`);
  const rows = all.map(id => [id, bag[id] || 0]).sort((a, b) => a[1] - b[1]);
  for (const [id, n] of rows) {
    const mark = n === 0 ? '☠ 死' : n <= RUNS * 0.15 ? '△ 希少' : '  ';
    console.log(`  ${mark} ${String(n).padStart(5)}  ${id}${describe ? '  ' + (describe(id) || '') : ''}`);
  }
};

console.log(`=== ${RUNS}ラン（4戦略×3魔王を巡回）で数えた発火回数 ===`);
report('特性（戦闘で実際に効いた回数）', Object.keys(TRAITS), count.trait,
  id => `${TRAITS[id].name}（採用時に所持 ${count.traitOwned[id] || 0}）`);
report('シナジー', SYNERGIES.map(s => s.id),
  Object.fromEntries(SYNERGIES.map(s => [s.id, (count.synergy[s.id] || 0) + (count.synergy['(name)' + s.name] || 0)])),
  id => (SYNERGIES.find(s => s.id === id) || {}).name);
report('ハプニング（城内事件）', EVENTS.map(e => e.id), count.event,
  id => (EVENTS.find(e => e.id === id) || {}).title);
report('戦場の不祥事', HAPPENINGS.map(h => h.id), count.happening,
  id => (HAPPENINGS.find(h => h.id === id) || {}).name);
report('魔王命令', Battle.COMMANDS.map(c => c.id), count.command,
  id => (Battle.commandById(id) || {}).name);
report('作戦', MISSION_TYPES.map(m => m.id), count.mission);
report('給与方針', ['regular', 'withhold', 'advance'], count.payroll);
report('階級', PROMOTIONS.map(p => p.id || p), count.rank);
report('実績', ACHIEVEMENTS.map(a => a.id), count.achievement,
  id => (ACHIEVEMENTS.find(a => a.id === id) || {}).name);
report('種族（採用された回数）', MONSTERS.map(m => m.id),
  Object.fromEntries(MONSTERS.map(m => [m.id, count.race[m.race] || 0])), id => id);
console.log('\n■ 施設の発火/選択');
for (const [k, v] of Object.entries(count.facility).sort((a, b) => a[1] - b[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
