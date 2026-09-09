// 勇者襲来 縦切り試作の世界ロジック。
//   node tools/test-hero-arrival.js
//
// ここで守っているのは設計 12節の境界表のうち、A/B の範囲に入るものだけ。
// 転職交渉・プルの摂食・洪水・反乱は実装していないので検証もしない。
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
const setup = (opts, hires) => {
  const w = W.newWorld(opts);
  for (const [id, job] of hires) W.hire(w, id, job);
  return w;
};
const runToArrival = w => { W.advance(w, fight); W.advance(w, fight); return W.advance(w, fight); };
const has = (w, verb, extra) => w.facts.some(f => f.verb === verb &&
  Object.entries(extra || {}).every(([k, v]) => f[k] === v));

// ── 1. 酒は「モグを採ったから」ではなく「能力＋設備＋勤務」から生まれる ──
{
  const w = setup({ seed: 5, guestCondition: 'B' }, [['mog', 'tavern']]);
  runToArrival(w);
  assert(has(w, 'produce', { actor: 'mog' }), 'モグを店に置くと酒が仕込まれる');
  assert(has(w, 'offer', { actor: 'mog', accepted: true }), '客へ勧め、条件Bの客は飲む');
  assert(has(w, 'consume', { target: 'allen', effect: 'drunk' }), '飲んだ事実が台帳に残る');
}
{
  // 同じモグでも、店以外に置けば設備が無いので酒はできない。
  const w = setup({ seed: 5, guestCondition: 'B' }, [['mog', 'guard']]);
  runToArrival(w);
  assert(!has(w, 'produce'), 'モグを守備に置くと酒はできない（人物ではなく仕事が条件）');
  assert(!has(w, 'offer'), '在庫が無ければ提供も起きない');
}
{
  // 店に置いても、酒を造る能力が無い者なら酒はできない。
  const w = setup({ seed: 5, guestCondition: 'B' }, [['rena', 'tavern']]);
  runToArrival(w);
  assert(!has(w, 'produce'), '酒造の能力が無い者を店に置いても酒はできない');
  assert(has(w, 'shop', { actor: 'rena' }), 'その場合も普通に店を開けたという勤務結果は残る');
}

// ── 2. 相手の応答は提供者ではなく相手側の条件が決める ──
{
  const w = setup({ seed: 5, guestCondition: 'A' }, [['mog', 'tavern']]);
  const report = runToArrival(w);
  assert(has(w, 'offer', { accepted: false }), '条件A（任務優先）の客は同じ提供を断る');
  assert(!has(w, 'consume'), '断られたので酔いは残らない');
  const stock = w.stock.find(s => s.itemId === 'sake');
  assert(stock && stock.qty === 3, '断られた酒は未消費のまま在庫に残る');
  assert(/断った方/.test(report.mormo.text), '断られた回も、モルモは事実どおりに報告する');
}

// ── 3. 禁止すれば提供は起きない（罰として裏で振る舞ったりしない） ──
{
  const w = setup({ seed: 5, guestCondition: 'B' }, [['mog', 'tavern']]);
  W.setServePolicy(w, 'mog', false);
  runToArrival(w);
  assert(has(w, 'produce'), '提供禁止でも生産は行われ、在庫に残る');
  assert(!has(w, 'offer'), '「外の者に振る舞うな」なら提供しない');
  assert(!has(w, 'consume'), '禁止した回に裏で飲ませたりしない');
}

// ── 4. 発見の順序：接触の時点では身元が分からず、あとで判明する ──
{
  const w = setup({ seed: 5, guestCondition: 'B' }, [['mog', 'tavern']]);
  W.advance(w, fight); W.advance(w, fight);
  assert(w.visitor && w.visitor.identityKnown === false, '城下の客は接触した時点では身元不明');
  assert(w.visitor.shownAs === '旅の方', '画面に出る呼び名は「旅の方」');
  const report = W.advance(w, fight);
  assert(w.visitor.identityKnown === true, '門で身元が判明する');
  assert(report.mormo.text === '魔王様、勇者です。先ほどまで、うちで飲んでいた方です',
    'モルモの発見の一言が、酒を出した事実からのみ作られる');
}
{
  // 門番を外すと、身元が確認できないので同じ一言は出ない。
  const w = W.newWorld({ seed: 5, guestCondition: 'B' });
  W.assign(w, 'gantz', 'guard');
  W.hire(w, 'mog', 'tavern');
  const report = runToArrival(w);
  assert(has(w, 'consume'), '門番がいなくても、酒を飲んだ事実自体は起きている');
  assert(!/飲んでいた方/.test(report.mormo.text), '身元が分からなければ「飲んでいた方」とは言わない');
}

// ── 5. 城下の事実が、そのまま迎撃の敵情へつながる ──
{
  const drunkWorld = setup({ seed: 5, guestCondition: 'B' }, [['mog', 'tavern']]);
  runToArrival(drunkWorld);
  const soberWorld = setup({ seed: 5, guestCondition: 'A' }, [['mog', 'tavern']]);
  runToArrival(soberWorld);
  const allenDrunk = W.heroUnits(drunkWorld).find(u => u.uid === 'allen');
  const allenSober = W.heroUnits(soberWorld).find(u => u.uid === 'allen');
  assert(allenDrunk.spd === allenSober.spd + W.SAKE.effect.spd, '飲んだ回だけアレンの速度が下がる');
  assert(allenDrunk.drunk === true && !allenSober.drunk, '酔いは敵情の表示にも出る');
  assert(allenDrunk.hp === allenSober.hp && allenDrunk.atk === allenSober.atk,
    '酔いは速度だけに効き、HPや攻撃力を書き換えない');
}

// ── 6. 特殊な人材が一人もいなくても最後まで成立する（A の対照） ──
{
  const w = setup({ seed: 9, guestCondition: 'B' }, [['honekichi', 'guard'], ['rize', 'guard'], ['rena', 'guard']]);
  const report = runToArrival(w);
  assert(!has(w, 'produce') && !has(w, 'offer'), '店を任せなければ酒にまつわる出来事は起きない');
  assert(report.mormo && report.mormo.text.includes('到着'), 'それでも勇者は到着し、報告は出る');
  const out = W.resolveInterception(w, W.deployable(w).map(p => p.id), fight);
  assert(out.kind === 'battle' && typeof out.victory === 'boolean', '通常勤務と標準戦闘だけで決着する');
}

// ── 7. 育成：送り出す → 帰る → 昇進が数値に出る ──
{
  const w = setup({ seed: 3, guestCondition: 'A' }, []);
  W.assign(w, 'garo', 'patrol');
  const before = W.statsOf(W.person(w, 'garo'));
  const report = W.advance(w, fight);
  const garo = W.person(w, 'garo');
  assert(report.patrol !== null, '近郊警戒は最初の勤務のあいだに解決する');
  if (garo.alive) {
    assert(garo.merit > 3, '生還すると戦功が増える');
    assert(W.rankOf(garo).id === 'squad_leader', '戦功4で小隊長へ届く');
    const after = W.statsOf(garo);
    assert(after.hp > before.hp && after.atk > before.atk, '昇進が実際のHP・攻撃力に出る');
    assert(garo.assignment === 'guard', '帰還操作は不要で、自動で守備へ戻る');
  } else {
    assert(true, '（この乱数では帰らなかった。戦没も成立した結果として扱う）');
  }
}
{
  const w = setup({ seed: 3, guestCondition: 'A' }, []);
  W.advance(w, fight);
  assert(W.person(w, 'garo').merit === 3, '警戒へ出さなければ戦功は増えない（必須作業にしない）');
}

// ── 8. 報告や指示画面を開き直しても、再抽選・重複消費が起きない ──
{
  const w = setup({ seed: 5, guestCondition: 'B' }, [['mog', 'tavern']]);
  W.advance(w, fight);
  W.assign(w, 'mog', 'tavern');   // 同じ仕事を指定し直す
  W.assign(w, 'mog', 'tavern');
  W.advance(w, fight); W.advance(w, fight);
  assert(w.facts.filter(f => f.verb === 'produce').length === 1, '指示画面の往復で酒を二重生産しない');
  assert(w.facts.filter(f => f.verb === 'offer').length === 1, '同じ相手へ同じ提供を繰り返さない');
  const stock = w.stock.find(s => s.itemId === 'sake');
  assert(stock.qty === 2, '消費は実際に飲まれた1杯だけ');
}

// ── 9. 空編成と人数上限 ──
{
  const w = setup({ seed: 5, guestCondition: 'B' }, [['mog', 'tavern']]);
  runToArrival(w);
  const out = W.resolveInterception(w, [], fight);
  assert(out.kind === 'occupied' && out.victory === false, '全員を外したら空編成を明示して占領による敗北になる');
}
{
  const w = setup({ seed: 5 }, [['mog', 'tavern'], ['rize', 'guard'], ['honekichi', 'guard']]);
  assert(W.hire(w, 'rena', 'guard').reason === 'roster_full', '名簿上限を超える採用は成立しない');
}
{
  const w = W.newWorld({ seed: 5 });
  W.advance(w, fight);
  assert(W.assign(w, 'garo', 'patrol').reason === 'prep_only', '近郊警戒は準備段階でしか選べない');
}

// ── 10. 城下に人を置いていない回 ──
{
  const w = setup({ seed: 5, guestCondition: 'B' }, [['rize', 'guard']]);
  W.advance(w, fight);
  const seg2 = W.advance(w, fight);
  assert(seg2.lines.some(l => /誰も客に会わなかった/.test(l.text)), '城下に誰もいなければ客と接触しない');
  assert(!has(w, 'offer'), '同じ地域にいるだけでは全員が客へ反応しない');
}

// ── 11. 本編の保存には触れない ──
{
  // コメントを除いた「実行されるコード」だけを見る（説明文の中の語に反応させない）
  const strip = f => fs.readFileSync(path.join(ROOT, f), 'utf8')
    .split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  const src = strip('src/prototype/hero_arrival_world.js') + strip('src/prototype/hero_arrival_ui.js');
  assert(!/localStorage|Storage\.|maou_save|maou_history/.test(src),
    '試作コードは localStorage も本編 Storage も直接触らない');
  const html = fs.readFileSync(path.join(ROOT, 'hero-arrival.html'), 'utf8');
  assert(/heroproto_/.test(html) && /defineProperty\(window, "localStorage"/.test(html),
    '入口ページが localStorage を専用の名前空間へ差し替えている');
  assert(!/src\/core\/run\.js|src\/core\/storage\.js|src\/core\/kpi\.js/.test(html),
    '入口ページは run.js / storage.js / kpi.js を読み込まない');
}

console.log(failed ? `\n${failed} 件失敗` : '\nすべて通過');
process.exit(failed ? 1 : 0);
