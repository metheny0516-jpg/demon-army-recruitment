// 勇者襲来 縦切り試作 v2 の世界ロジック。
//   node tools/test-hero-arrival.js
//
// 守っているのは「これを壊すと試作の意味が消える」ところだけ:
//   採用が判断であること／隠れた性質は働かせるまで分からないこと／
//   起きることが仕事と能力から作られること／相手の応答が相手側で決まること／
//   モルモが事実に無いことを言わないこと／本編に触れないこと。
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/synergies.js',
  'src/core/util.js', 'src/core/synergy.js', 'src/core/battle.js'
];
const ctx = { console, Math, Date, JSON };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const Battle = vm.runInContext('Battle', ctx);
const W = require(path.join(ROOT, 'src/prototype/hero_arrival_world.js'));

let failed = 0;
const assert = (cond, msg) => {
  if (cond) console.log(`✓ ${msg}`);
  else { failed++; console.log(`✗ ${msg}`); }
};
const fight = (p, e) => Battle.simulate(p.map(u => Battle.makeUnit(u, 'player')), e.map(u => Battle.makeUnit(u, 'enemy')));
const has = (w, verb, extra) => w.facts.some(f => f.verb === verb &&
  Object.entries(extra || {}).every(([k, v]) => f[k] === v));

// 面接を通さず名簿へ入れる（数値検証用の近道。遊びの経路ではない）
function seat(w, id, job) {
  const p = W.person(w, id);
  p.hired = true; p.assignment = job || 'guard';
  W.HIDDEN_TRAITS[p.hidden].apply(p);
  return p;
}
function worldWith(opts, seats) {
  const w = W.newWorld(Object.assign({ allApplicants: true }, opts));
  w.segment = 0;
  for (const [id, job] of seats || []) seat(w, id, job);
  return w;
}
const toArrival = w => { W.advance(w, fight); W.advance(w, fight); return W.advance(w, fight); };

// ── 1. 採用は判断である ──────────────────────
{
  const w = W.newWorld({ seed: 11 });
  assert(w.segment === -1, 'ランは面接から始まる');
  assert(w.interview.queue.length === W.APPLICANTS_PER_RUN, `毎ラン${W.APPLICANTS_PER_RUN}名が面接に来る`);
  const first = W.currentApplicant(w);
  assert(!!first && !!first.clue, '応募者には未確認の手掛かりが一文ある');
  // 一覧から選ぶのではなく、今その場にいる人にしか答えられない
  const other = w.interview.queue.find(id => id !== first.id);
  assert(W.hire(w, other, 'guard').reason === 'not_current', '順番が来ていない応募者は採用できない');
  W.pass(w, first.id);
  assert(W.currentApplicant(w).id !== first.id, '見送ると次の応募者へ進む');
  assert(W.hire(w, first.id, 'guard').reason === 'not_current', '見送った人はもう採用できない（戻れない）');
}
{
  // 予算は本当に足りなくなる。全員は採れない。
  const w = W.newWorld({ seed: 3 });
  let hired = 0;
  let p;
  while ((p = W.currentApplicant(w))) {
    if (W.canAfford(w, p) && W.hire(w, p.id, 'guard').ok) hired++;
    else W.pass(w, p.id);
  }
  assert(hired < W.APPLICANTS_PER_RUN, '全員は採用できない（予算か枠で必ず止まる）');
  assert(W.remainingBudget(w) >= 0, '予算が負にならない');
  assert(W.hiredPersons(w).length <= W.MAX_ROSTER, '名簿上限を超えない');
}
{
  // 応募者は毎ラン変わる。同じ顔ぶれの繰り返しにしない。
  const names = s => W.newWorld({ seed: s }).interview.queue.join(',');
  const sets = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(names));
  assert(sets.size >= 6, '毎ラン応募者の顔ぶれが変わる');
  const seen = {};
  for (let s = 1; s <= 200; s++) for (const id of W.newWorld({ seed: s }).interview.queue) seen[id] = (seen[id] || 0) + 1;
  const rates = W.APPLICANT_POOL.map(p => (seen[p.id] || 0) / 200);
  assert(Math.min(...rates) > 0.25, '特定の応募者だけが出ない偏りがない');
}

// ── 2. 隠れた性質は、働かせるまで分からない ──
{
  const w = worldWith({ seed: 7 }, []);
  const gudo = W.person(w, 'gudo');
  assert(gudo.hidden === 'brewer' && !gudo.abilities.includes('brew_ale'),
    '採用前は隠れた能力を持っていない');
  seat(w, 'gudo', 'tavern');
  assert(gudo.abilities.includes('brew_ale'), '採用した時点で隠れた性質は効き始める');
  assert(!gudo.revealed, 'ただし判明はしていない');
  const shown = W.shownStats(gudo);
  assert(shown.hp === gudo.declared.hp, '判明するまで画面に出るのは申告値');
  const r1 = W.advance(w, fight);
  assert(gudo.revealed, '店で仕込んだ時点で判明する');
  assert(has(w, 'reveal', { actor: 'gudo', trait: 'brewer' }), '判明が台帳に残る');
  assert(r1.lines.some(l => l.revealed), '報告に答え合わせが出る');
}
{
  // 体の性質は戦って初めて分かる。店に置いても分からない。
  const w = worldWith({ seed: 7 }, [['neru', 'tavern']]);
  const neru = W.person(w, 'neru');
  assert(neru.hidden === 'tough', 'ネルには隠れた性質がある');
  W.advance(w, fight);
  assert(!neru.revealed, '戦っていないので体の性質は判明しない');
  const declared = W.shownStats(neru);
  assert(declared.def === neru.declared.def, '判明するまで防御力も申告値のまま');
  toArrival(w);
  W.resolveInterception(w, ['neru'], fight);
  assert(neru.revealed, '戦いに出せば判明する');
  assert(W.shownStats(neru).def > neru.declared.def, '判明後は実際の値が出る');
}
{
  // 手掛かりが外れの側に転ぶこともある
  const w = worldWith({ seed: 7 }, [['dord', 'guard']]);
  const dord = W.person(w, 'dord');
  assert(dord.hidden === 'frail', 'ドルドの隠れた性質は不利なもの');
  assert(W.statsOf(dord).hp < dord.declared.hp, '採ってみると申告より保たない');
  assert(W.shownStats(dord).hp === dord.declared.hp, '戦うまでは申告値しか見えない');
}
{
  // 採らなかった人の中身は明かさない（総当たりで確定させない）
  const w = W.newWorld({ seed: 5 });
  const p = W.currentApplicant(w);
  W.pass(w, p.id);
  const rec = { passed: w.facts.filter(f => f.verb === 'pass').map(f => f.target) };
  assert(rec.passed.includes(p.id) && !p.revealed, '見送った人の隠れた性質は判明しないまま');
}

// ── 3. 起きることは仕事と能力から作られる ──
{
  const w = worldWith({ seed: 5 }, [['mog', 'tavern']]);
  toArrival(w);
  assert(has(w, 'produce', { actor: 'mog' }), '酒造の能力がある者を店に置くと酒ができる');
}
{
  const w = worldWith({ seed: 5 }, [['mog', 'guard']]);
  toArrival(w);
  assert(!has(w, 'produce'), '同じモグでも店以外に置けば酒はできない（人物ではなく仕事が条件）');
}
{
  const w = worldWith({ seed: 5 }, [['pipi', 'tavern']]);
  toArrival(w);
  assert(!has(w, 'produce'), '酒造の能力が無い者を店に置いても酒はできない');
  assert(has(w, 'shop', { actor: 'pipi' }), 'その場合も普通に店を開けた勤務結果は残る');
}
{
  const w = worldWith({ seed: 5 }, [['mog', 'tavern']]);
  W.setServePolicy(w, 'mog', false);
  toArrival(w);
  assert(has(w, 'produce') && !has(w, 'offer'), '「販売のみ」なら作るが振る舞わない');
  assert(!has(w, 'consume'), '禁止した回に裏で飲ませたりしない');
}
{
  const w = worldWith({ seed: 5 }, [['rize', 'guard']]);
  W.advance(w, fight);
  const seg2 = W.advance(w, fight);
  assert(seg2.lines.some(l => /誰も客に会わなかった/.test(l.text)), '城下に誰も置かなければ客と接触しない');
}

// ── 4. 相手の応答は相手側の条件が決める ──
{
  const duty = W.GUEST_CONDITIONS.find(c => c.id === 'duty');
  const rest = W.GUEST_CONDITIONS.find(c => c.id === 'rest');
  const loose = W.GUEST_CONDITIONS.find(c => c.id === 'loose');
  const run = (cond, brewer) => {
    const w = worldWith({ seed: 5 }, [[brewer, 'tavern']]);
    w.condition = cond;
    toArrival(w);
    return has(w, 'consume');
  };
  assert(run(duty, 'mog') === false, '任務優先の相手は軽い酒も断る');
  assert(run(rest, 'mog') === true, '休憩中の相手は軽い酒なら飲む');
  assert(run(rest, 'duba') === false, '同じ休憩中でも、強い酒は警戒して断る');
  assert(run(loose, 'duba') === true, '気が緩んでいる相手なら強い酒も飲む');
}
{
  // 提供者が誰かでは結果が変わらない
  const rest = W.GUEST_CONDITIONS.find(c => c.id === 'rest');
  const a = worldWith({ seed: 5 }, [['mog', 'tavern']]); a.condition = rest; toArrival(a);
  const b = worldWith({ seed: 5 }, [['gudo', 'tavern']]); b.condition = rest; toArrival(b);
  assert(has(a, 'consume') && has(b, 'consume'), '別人が出しても、同じ酒と同じ相手なら同じ結果');
}
{
  // プレイヤーは相手の条件を事前に知れない
  const w = W.newWorld({ seed: 5 });
  assert(!('guestCondition' in (w.interview || {})), '面接画面に相手の条件は載らない');
  const kinds = new Set();
  for (let s = 1; s <= 120; s++) kinds.add(W.newWorld({ seed: s }).condition.id);
  assert(kinds.size === W.GUEST_CONDITIONS.length, '相手の条件は毎ラン抽選され、どれも出る');
}

// ── 5. 発見の順序と、モルモが言えること ──
{
  const rest = W.GUEST_CONDITIONS.find(c => c.id === 'rest');
  const w = worldWith({ seed: 5 }, [['mog', 'tavern']]);
  w.condition = rest;
  W.advance(w, fight); W.advance(w, fight);
  assert(w.visitor.identityKnown === false && w.visitor.shownAs === '旅の方',
    '接触した時点では身元不明で、画面には「旅の方」としか出ない');
  const seg2 = w.reports[1];
  assert(!/勇者|アレン/.test(JSON.stringify(seg2)), 'この時点の報告に「勇者」「アレン」は出ない');
  const arrival = W.advance(w, fight);
  assert(arrival.mormo.text === '魔王様、勇者です。先ほどまで、うちで飲んでいた方です',
    'あとから判明し、モルモが発見を伝える');
}
{
  // 事実が無ければ言わない
  const w = worldWith({ seed: 5 }, [['rize', 'guard']]);
  const arrival = toArrival(w);
  assert(!/飲んでいた方/.test(arrival.mormo.text), '酒を出していなければ、その話はしない');
}
{
  // 身元を確認できなければ結び付けられない
  const rest = W.GUEST_CONDITIONS.find(c => c.id === 'rest');
  const w = worldWith({ seed: 5 }, [['mog', 'tavern']]);
  w.condition = rest;
  W.assign(w, 'gantz', 'guard');       // 門番を外す
  const arrival = toArrival(w);
  assert(has(w, 'consume'), '門番がいなくても、飲んだ事実自体は起きている');
  assert(!/飲んでいた方/.test(arrival.mormo.text), '身元が分からなければ結び付けて報告しない');
}

// ── 6. 城下の事実が、そのまま敵情へつながる ──
{
  const rest = W.GUEST_CONDITIONS.find(c => c.id === 'rest');
  const loose = W.GUEST_CONDITIONS.find(c => c.id === 'loose');
  const sober = worldWith({ seed: 5 }, [['mog', 'tavern']]);
  sober.condition = W.GUEST_CONDITIONS.find(c => c.id === 'duty'); toArrival(sober);
  const ale = worldWith({ seed: 5 }, [['mog', 'tavern']]); ale.condition = rest; toArrival(ale);
  const spirit = worldWith({ seed: 5 }, [['duba', 'tavern']]); spirit.condition = loose; toArrival(spirit);
  const a0 = W.heroUnits(sober).find(u => u.uid === 'allen');
  const a1 = W.heroUnits(ale).find(u => u.uid === 'allen');
  const a2 = W.heroUnits(spirit).find(u => u.uid === 'allen');
  assert(a1.spd === a0.spd + W.DRINKS.ale.effect.spd, '新酒が通った回はその分だけ速度が落ちる');
  assert(a2.spd === a0.spd + W.DRINKS.spirit.effect.spd, '蒸留酒が通った回はもっと落ちる');
  assert(a1.hp === a0.hp && a1.atk === a0.atk, '酔いは速度だけに効き、HPや攻撃力を書き換えない');
  assert(!a0.drunk && !!a1.drunk, '酔いは敵情の表示にも出る');
}

// ── 7. 育成と、その代償 ──
{
  let survived = 0, promoted = 0, died = 0;
  for (let i = 0; i < 120; i++) {
    const w = worldWith({ seed: i + 1 }, []);
    W.assign(w, 'garo', 'patrol');
    W.advance(w, fight);
    const garo = W.person(w, 'garo');
    if (!garo.alive) { died++; continue; }
    survived++;
    if (W.rankOf(garo).id === 'squad_leader') promoted++;
  }
  assert(survived > 0 && died > 0, '近郊警戒は本物の博打（帰る回も、帰らない回もある）');
  assert(promoted === survived, '生きて帰れば昇進する');
  const w = worldWith({ seed: 3 }, []);
  W.advance(w, fight);
  assert(W.person(w, 'garo').merit === 3, '出さなければ戦功は増えない（必須作業にしない）');
}

// ── 8. 空編成と、指示の往復 ──
{
  const w = worldWith({ seed: 5 }, [['mog', 'tavern']]);
  toArrival(w);
  const out = W.resolveInterception(w, [], fight);
  assert(out.kind === 'occupied' && !out.victory, '全員を外したら空編成を明示して占領による敗北になる');
}
{
  const rest = W.GUEST_CONDITIONS.find(c => c.id === 'rest');
  const w = worldWith({ seed: 5 }, [['mog', 'tavern']]);
  w.condition = rest;
  W.advance(w, fight);
  W.assign(w, 'mog', 'tavern'); W.assign(w, 'mog', 'tavern');
  W.advance(w, fight); W.advance(w, fight);
  assert(w.facts.filter(f => f.verb === 'produce').length === 1, '指示の往復で二重生産しない');
  assert(w.facts.filter(f => f.verb === 'offer').length === 1, '同じ相手へ同じ提供を繰り返さない');
  assert(w.stock[0].qty === W.DRINKS.ale.servings - 1, '消費は実際に飲まれた1杯だけ');
}

// ── 9. 本編に触れない ──
{
  const strip = f => fs.readFileSync(path.join(ROOT, f), 'utf8')
    .split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  assert(!/localStorage|Storage\.|maou_save|maou_history/.test(strip('src/prototype/hero_arrival_world.js')),
    '世界ロジックは保存に一切触れない');
  const ui = strip('src/prototype/hero_arrival_ui.js');
  // 画面は localStorage を使う（ラン記録）。ただし本編の鍵にも本編の Storage モジュールにも触らない。
  // 入口ページが localStorage 自体を heroproto_ 名前空間へ差し替えているので、行き先は分離される。
  assert(!/maou_save|maou_history|maou_kpi/.test(ui), '画面は本編の保存鍵を使わない');
  assert(!/(?<!local)\bStorage\./.test(ui), '画面は本編の Storage モジュールを呼ばない');
  assert(/hero_arrival_runs/.test(ui), 'ラン記録は試作専用の鍵だけを使う');
  const html = fs.readFileSync(path.join(ROOT, 'hero-arrival.html'), 'utf8');
  assert(/heroproto_/.test(html) && /defineProperty\(window, "localStorage"/.test(html),
    '入口ページが localStorage を専用の名前空間へ差し替えている');
  assert(!/src\/core\/run\.js|src\/core\/storage\.js|src\/core\/kpi\.js/.test(html),
    '入口ページは run.js / storage.js / kpi.js を読み込まない');
}

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
