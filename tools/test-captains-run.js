// 敵将の配線（docs/SPEC_CAPTAINS_BD_2026-09-15.md §2）：
// 部族の首領が守備に乗る／「⚠ ○○がいる」札が3決着に1回／雇うと名簿に増える／討つと首級／
// 都の隊列が討たなかった者で埋まる。
//   node tools/test-captains-run.js
const fs = require('fs'), vm = require('vm');
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
} };
vm.createContext(ctx);
const files = [...fs.readFileSync('index.html', 'utf8').matchAll(/src="(src\/(?:data|core)\/[^" ]+\.js)"/g)].map(m => m[1]);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Game = vm.runInContext('Game', ctx), Territory = vm.runInContext('Territory', ctx),
  Captains = vm.runInContext('Captains', ctx), CAPTAINS = vm.runInContext('ENEMY_CAPTAINS', ctx);
let failed = 0;
const ok = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const fresh = () => { Game.newRun(); const st = Game.state; st.phase = 'mission'; st.alert = 0; return st; };
const offerFor = (st, id) => (Game.prepareMissions(true) || []).find(m => m.territoryId === id);

// ── 1. 部族の首領は、その部族圏の守備に必ず乗る ──────────────
{
  const st = fresh();
  Territory.take(st, 't01');           // 骨の谷（t03・首領＝墓守）を候補へ
  const card = offerFor(st, 't03');
  ok(!!card, '骨の谷の札が出る');
  ok(card.captainIds.includes('gravekeeper') && card.units[0].name === '墓守',
    `首領が隊列の先頭に乗る（${card.units[0].name}）`);
  ok(card.units[0].captain.offer === 'hire', '墓守は「雇う」の提案を持つ');
  // 贈って従えることはできない（首領がいる部族）
  ok(Territory.tributeCost('t03') === null, '首領がいる部族には贈れない');
  // 討った首領は二度と出ない
  Captains.mark(st, 'gravekeeper', 'slain');
  const again = offerFor(st, 't03');
  ok(again && !(again.captainIds || []).includes('gravekeeper'), '討った首領は二度と出ない');
}

// ── 2. 「⚠ ○○がいる」札は3決着に1回 ─────────────────────
{
  const st = fresh();
  const seen = [];
  for (let settles = 0; settles < 6; settles++) {
    st.settles = settles;
    st.captains = {};
    const offers = Game.prepareMissions(true);
    seen.push(offers.some(m => m.captainCard));
  }
  ok(seen.filter(Boolean).length === 2, `6決着のうち2回だけ札が出る（${seen.map(x => x ? '有' : '-').join('')}）`);
  st.settles = 2; st.captains = {};
  const card = (Game.prepareMissions(true) || []).find(m => m.captainCard);
  ok(card && /⚠/.test(card.missionTitle), `札の頭に警告が出る（${card && card.missionTitle}）`);
  const rules = Captains.rules();
  ok(card && card.reward > 0, `首級ぶんの報酬が乗る（${card && card.reward}G・${rules.bountyMult}倍）`);
}

// ── 3. 雇うと名簿に増える ─────────────────────────────
{
  const st = fresh();
  const before = st.roster.length;
  const hire = CAPTAINS.zagan.hire;
  const notes = [];
  Game.settleCaptains({ captainIds: ['zagan'], reward: 20 },
    { victory: true, spared: [{ id: 'zagan', unitId: 'e0', name: '自称将軍ザガン', kind: 'hire' }], timeline: [] }, notes);
  const joined = st.roster[st.roster.length - 1];
  ok(st.roster.length === before + 1, `名簿が1人増える（${before} → ${st.roster.length}）`);
  ok(joined.name === 'ザガン' && joined.loyalty === hire.loyalty && joined.job === hire.job,
    `敵将の名前・忠誠・職で入る（${joined.name}／忠誠${joined.loyalty}／${joined.job}）`);
  ok((joined.traits || []).includes(hire.trait), `癖も引き継ぐ（${(joined.traits || []).join('・')}）`);
  ok(Captains.state(st, 'zagan').status === 'hired', '名簿の状態は hired');
  ok(notes.some(n => /加わった/.test(n)), '決着の報告に一行残る');
}

// ── 4. 討つと首級（報酬と名声） ──────────────────────────
{
  const st = fresh();
  st.gold = 100;
  const notes = [];
  const mission = { captainIds: ['polka'], reward: 20 };
  const result = { victory: true, spared: [],
    timeline: [{ type: 'attack', dead: true, toCaptain: 'polka' }] };
  Game.settleCaptains(mission, result, notes);
  const rules = Captains.rules();
  ok(Captains.state(st, 'polka').status === 'slain', '討った敵将は slain');
  ok(st.gold === 100 + Math.max(1, Math.round(20 * (rules.bountyMult - 1))), `首級の金が入る（${st.gold}）`);
  ok((st.fame || 0) === rules.fame, `名声が上がる（${st.fame}）`);
  // 討たずに終われば alive（逃げた）。金は動かない
  const gold = st.gold;
  Game.settleCaptains({ captainIds: ['gareth'], reward: 20 }, { victory: true, spared: [], timeline: [] }, notes);
  ok(Captains.state(st, 'gareth').status === 'alive' && st.gold === gold, '討ち損ねた者は生きて去る（金は入らない）');
}

// ── 5. 都の隊列は「討たなかった者」で埋まる ────────────────
{
  const st = fresh();
  st.territory = { lands: ['h01', 'h02', 'h03', 'h04', 'h05', 'h06', 'h07', 'h08', 'h09', 'h10', 'h11'], tribes: [] };
  st.conquest = Territory.conquestOf(st);
  const capital = offerFor(st, 'h12');
  ok(!!capital && /勇者アレン/.test(capital.units[0].name), `都の守備は勇者アレンが率いる（${capital && capital.units[0].name}）`);
  ok(capital.units.some(u => u.captain && u.captain.id === 'polka'),
    `討たなかった者が隣に立つ（${capital.units.map(u => u.name).join('・')}）`);
  ok(!capital.units[0].awakenAt, 'ガレスを討っていなければ覚醒の閾値は既定のまま');

  // ガレスを討っていれば覚醒が早く、討った者は最終戦に出ない
  const st2 = fresh();
  st2.territory = { lands: ['h01', 'h02', 'h03', 'h04', 'h05', 'h06', 'h07', 'h08', 'h09', 'h10', 'h11'], tribes: [] };
  st2.conquest = Territory.conquestOf(st2);
  Captains.mark(st2, 'gareth', 'slain');
  Captains.mark(st2, 'polka', 'slain');
  const capital2 = offerFor(st2, 'h12');
  ok(capital2.units[0].awakenAt === 0.7, `師を失った勇者は早く覚醒する（${capital2.units[0].awakenAt}）`);
  ok(!capital2.units.some(u => u.captain && u.captain.id === 'polka'), '討った者は最終戦に出ない');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全通過');
process.exit(failed ? 1 : 0);
