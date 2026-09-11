// 号令（戦闘中の個人への指示）・battle.js 側：節目の提案と、答えを受けた実行。
//   node tools/test-order-battle.js
// 止めるか・誰に命じるかを決めるのは run.js と描画側（別コミット）。ここは印を置く側と分岐だけを見る。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const Battle = vm.runInContext('Battle', ctx);
const TRAITS = vm.runInContext('TRAITS', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, traits, side, x) => Battle.makeUnit(Object.assign({
  uid: name, name, race: 'オーク', hp: 80, atk: 10, def: 3, spd: 5, traits, tags: [], loyalty: 80 }, x || {}), side);
const rations = () => ({ consumed: 3, need: 3, shortage: 0, emptied: false, bigEaterUids: [], cookUid: null, hungerUid: null, feastUid: null });

// 味方：怪力のオーク（号令できる）＋紙の前衛（倒れて節目を作る）。敵：硬い勇者（すぐには終わらない）。
const scene = (opts) => {
  const weak = mk('ヨワシ', [], 'player', { hp: 20, atk: 4, def: 0, spd: 9 });
  const orc = mk('ガロ', ['brute'], 'player', { hp: 300, atk: 12, def: 6, spd: 4 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 700, atk: 30, def: 4, spd: 7 });
  const foe2 = mk('従者', [], 'enemy', { race: '人間', hp: 200, atk: 8, def: 2, spd: 3 });
  return { weak, orc, foe, foe2, r: Battle.simulate([weak, orc], [foe, foe2], Object.assign({ rations: rations() }, opts || {})) };
};
const offersOf = r => r.timeline.filter(e => e.type === 'order_offer');

// 1. 既定（offerOrder 無し）では提案も実行も出ない＝sim・既存テストの戦闘は変わらない
{
  const { r } = scene({ seed: 11 });
  assert(offersOf(r).length === 0 && !r.orderOffer, '既定では order_offer が出ない');
  assert(!r.timeline.some(e => e.type === 'order_exec'), '既定では order_exec も出ない');
}

// 2. 同じ種で二度計算すると同じタイムラインになる（決定性）
{
  const a = scene({ seed: 42, offerOrder: true }).r, b = scene({ seed: 42, offerOrder: true }).r;
  const sig = r => r.timeline.map(e => `${e.type}:${e.dmg || ''}:${e.toId || e.unitId || ''}`).join('|');
  assert(sig(a) === sig(b), '同じ種＝同じタイムライン');
  const c = scene({ seed: 43, offerOrder: true }).r;
  assert(sig(a) !== sig(c), '違う種＝違うタイムライン');
}

// 3. 提案は1回だけ、節目（誰かが倒れたラウンド）の終わりに、候補つきで出る
{
  const { r, orc } = scene({ seed: 42, offerOrder: true });
  const offers = offersOf(r);
  assert(offers.length === 1, `order_offer はちょうど1回（${offers.length}）`);
  const offer = offers[0];
  assert(offer && r.orderOffer && r.orderOffer.index === r.timeline.indexOf(offer), 'result.orderOffer.index が提案の位置');
  assert(offer && offer.candidates.length === 1 && offer.candidates[0].unitId === orc.id
    && offer.candidates[0].skillId === 'brute' && offer.candidates[0].label === '怪力を必ず', '候補は怪力のガロだけ（紙の前衛は号令できない）');
  assert(offer && offer.answered === null, '答え無しの計算では answered が null');
  // 提案のラウンドは「このラウンドに誰かが倒れた」か「味方が半分を切った」
  const before = r.timeline.slice(0, r.orderOffer.index);
  const deathRound = before.filter(e => e.type === 'round_start').length;
  assert(deathRound === offer.round, '提案はラウンドの終わりに置かれる');
  const retreatSameRound = r.timeline.find(e => e.type === 'retreat_offer' && e.round === offer.round);
  assert(!retreatSameRound, '撤退の提案と同じラウンドには出さない');
}

// 4. 答えを渡して計算し直すと、提案までは一致し、次ラウンド冒頭で本人が真っ先に動き、技が必ず出る
{
  const base = scene({ seed: 42, offerOrder: true });
  const round = base.r.orderOffer.round;
  const again = scene({ seed: 42, offerOrder: true, orders: { [round]: base.orc.id } });
  const r2 = again.r;
  const key = e => `${e.type}:${e.dmg || ''}:${e.toId || e.unitId || ''}:${e.text || ''}`;
  const n = base.r.orderOffer.index;
  const prefixSame = base.r.timeline.slice(0, n).every((e, i) => key(e) === key(r2.timeline[i]));
  assert(prefixSame, '提案の手前まではタイムラインが一致する');
  const offer2 = offersOf(r2)[0];
  assert(offer2 && offer2.answered === base.orc.id && r2.timeline.indexOf(offer2) === n, '提案は同じ位置に、answered つきで出る');
  const exec = r2.timeline.find(e => e.type === 'order_exec');
  assert(exec && exec.unitId === base.orc.id && exec.skillId === 'brute' && TRAITS.brute.lines.order.includes(exec.quote),
    'order_exec が本人の台詞つきで出る');
  const execAt = r2.timeline.indexOf(exec);
  const nextRoundStart = r2.timeline.findIndex((e, i) => i > n && e.type === 'round_start');
  assert(nextRoundStart >= 0 && execAt > nextRoundStart, '実行は次ラウンドの冒頭');
  const firstAttack = r2.timeline.slice(execAt).find(e => e.type === 'attack');
  assert(firstAttack && firstAttack.fromId === base.orc.id, '号令を受けた者が真っ先に動く');
  assert(firstAttack && firstAttack.traits.includes('怪力') && firstAttack.traits.includes('号令'), '怪力が必ず出て、号令の印が付く');
  // 代償：その次の手番は動かない
  const winded = r2.timeline.slice(execAt).find(e => e.type === 'note' && e.winded && e.unitId === base.orc.id);
  assert(!!winded, '次の手番は息が上がって動かない');
  const roundAfter = r2.timeline.findIndex((e, i) => i > execAt && e.type === 'round_start');
  if (winded && roundAfter >= 0) {
    const windedAt = r2.timeline.indexOf(winded);
    const attacksBetween = r2.timeline.slice(roundAfter, windedAt).filter(e => e.type === 'attack' && e.fromId === base.orc.id);
    assert(windedAt > roundAfter && attacksBetween.length === 0, '息切れの手番では攻撃しない');
  }
  assert(offersOf(r2).length === 1, '答えたあとも提案は増えない（1戦闘1回）');
}

// 5. 倒れた者への号令は空振り（実行イベントは出ず、落ちない）
{
  const weak = mk('ヨワシ', ['brute'], 'player', { hp: 1, atk: 1, def: 0, spd: 9 });
  const tough = mk('カタブツ', [], 'player', { hp: 400, atk: 6, def: 8, spd: 4 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 600, atk: 30, def: 4, spd: 7 });
  const r = Battle.simulate([weak, tough], [foe], { rations: rations(), seed: 5, offerOrder: true, orders: { 1: 'p0', 2: 'p0', 3: 'p0' } });
  const execs = r.timeline.filter(e => e.type === 'order_exec');
  const deadBefore = ev => r.timeline.slice(0, r.timeline.indexOf(ev)).some(d => d.type === 'death' && d.unitId === 'p0');
  assert(execs.every(e => !deadBefore(e)), '倒れた者には order_exec が出ない');
  assert(r.timeline.some(e => e.type === 'result'), '倒れた者を指しても最後まで計算できる');
}

// 6. 候補の条件：傭兵・召喚物・不在は候補にならない。号令できる特性が無ければ提案自体が出ない
{
  const a = mk('傭兵', ['brute'], 'player', { hp: 300, atk: 12, def: 6, spd: 4 }); a.flags.mercenary = true;
  const weak = mk('ヨワシ', [], 'player', { hp: 20, atk: 4, def: 0, spd: 9 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 700, atk: 30, def: 4, spd: 7 });
  const r = Battle.simulate([weak, a], [foe], { rations: rations(), seed: 42, offerOrder: true });
  assert(offersOf(r).length === 0, '傭兵しか号令できる者がいなければ提案は出ない');
  const cands = Battle.orderCandidates([mk('A', ['brute'], 'player'), mk('B', ['fireball', 'brute'], 'player'), mk('C', ['bone'], 'player'), mk('D', ['gale'], 'player'), mk('E', ['brute'], 'player')].map((u, i) => (u.id = 'p' + i, u)));
  assert(cands.length === 3 && cands[1].skillId === 'fireball' && !cands.some(c => c.name === 'C'), '候補は最大3人、一人一技、受け身の特性は候補にならない');
}

// 7. 種族技の条件を号令が飛ばす（大火球は偶数ラウンドでも出る）。奇数ラウンド末の提案が出る種を探す
{
  const build = () => ({
    p: [mk('ヨワシ', [], 'player', { hp: 20, atk: 4, def: 0, spd: 9 }), mk('ミラ', ['great_fireball'], 'player', { race: '魔族', hp: 300, atk: 14, def: 4, spd: 6 })],
    e: [mk('兵A', [], 'enemy', { race: '人間', hp: 400, atk: 20, def: 2, spd: 7 }), mk('兵B', [], 'enemy', { race: '人間', hp: 400, atk: 8, def: 2, spd: 3 }), mk('兵C', [], 'enemy', { race: '人間', hp: 400, atk: 8, def: 2, spd: 2 })]
  });
  let found = null;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const s = build();
    const r = Battle.simulate(s.p, s.e, { rations: rations(), seed, offerOrder: true });
    if (r.orderOffer && r.orderOffer.round % 2 === 1 && r.orderOffer.candidates.some(c => c.unitId === 'p1')) found = { seed, round: r.orderOffer.round };
  }
  assert(!!found, '奇数ラウンド末に提案が出る種が見つかる');
  if (found) {
    const s = build();
    const r = Battle.simulate(s.p, s.e, { rations: rations(), seed: found.seed, offerOrder: true, orders: { [found.round]: 'p1' } });
    const exec = r.timeline.find(e => e.type === 'order_exec');
    const fired = exec && r.timeline.slice(r.timeline.indexOf(exec)).find(e => e.type === 'trait_trigger' && e.traitId === 'great_fireball');
    assert(!!fired, '偶数ラウンドでも号令なら大火球が出る');
  }
}

// 9. 気合：技の cost に足りない者は候補に出ず unready に回る。null は制限なし。全員足りなければ提案なし
{
  const a = mk('A', ['great_fireball'], 'player', { spirit: 1 });   // cost 3 に足りない
  const b = mk('B', ['brute'], 'player', { spirit: 1 });            // cost 1
  const c = mk('C', ['brute'], 'player');                          // spirit 無し＝制限なし
  const r = Battle.orderRoster([a, b, c].map((u, i) => (u.id = 'p' + i, u)));
  assert(r.ready.length === 2 && r.ready[0].name === 'B' && r.ready[1].name === 'C', '足りる者と制限なしの者が候補');
  assert(r.unready.length === 1 && r.unready[0].name === 'A' && r.unready[0].cost === 3 && r.unready[0].spirit === 1, '足りない者は unready');
  assert(r.ready[0].cost === 1 && r.ready[0].spirit === 1, '候補に cost と spirit が載る');
  const weak = mk('ヨワシ', [], 'player', { hp: 20, atk: 4, def: 0, spd: 9 });
  const orc = mk('ガロ', ['brute'], 'player', { hp: 300, atk: 12, def: 6, spd: 4, spirit: 0 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 700, atk: 30, def: 4, spd: 7 });
  const foe2 = mk('従者', [], 'enemy', { race: '人間', hp: 200, atk: 8, def: 2, spd: 3 });
  const rr = Battle.simulate([weak, orc], [foe, foe2], { rations: rations(), seed: 42, offerOrder: true });
  assert(offersOf(rr).length === 0, '号令できる者が全員気合不足なら提案は出ない');
  const costs = Object.keys(TRAITS).filter(id => TRAITS[id].order).map(id => TRAITS[id].order.cost);
  assert(costs.every(c => Number.isInteger(c) && c >= 1 && c <= 3), 'cost は 1〜3 の整数');
}

// 10. 上位技の自動発動は1戦闘1回。2回目以降は号令でだけ出る
{
  const build = (spirit) => ({
    p: [mk('タンク', [], 'player', { hp: 900, atk: 3, def: 10, spd: 2 }), mk('ミラ', ['great_fireball'], 'player', { race: '魔族', hp: 400, atk: 6, def: 4, spd: 6, spirit })],
    e: [mk('兵A', [], 'enemy', { race: '人間', hp: 600, atk: 6, def: 2, spd: 7 }), mk('兵B', [], 'enemy', { race: '人間', hp: 600, atk: 6, def: 2, spd: 3 })]
  });
  const s1 = build();
  const r1 = Battle.simulate(s1.p, s1.e, { rations: rations(), seed: 3 });
  const fires = r => r.timeline.filter(e => e.type === 'trait_trigger' && e.traitId === 'great_fireball').length;
  assert(r1.rounds >= 5, `（前提）長い戦闘（${r1.rounds}ラウンド）`);
  assert(fires(r1) === 1, `号令なしでは大火球は1戦闘1回（${fires(r1)}）`);
  // 節目は「誰かが倒れた／味方が半分以下」で来る。前衛を紙にして半分を切らせる
  const build2 = (spirit) => ({
    p: [mk('カミ', [], 'player', { hp: 40, atk: 3, def: 0, spd: 2 }), mk('ミラ', ['great_fireball'], 'player', { race: '魔族', hp: 400, atk: 6, def: 4, spd: 6, spirit })],
    e: [mk('兵A', [], 'enemy', { race: '人間', hp: 600, atk: 6, def: 2, spd: 7 }), mk('兵B', [], 'enemy', { race: '人間', hp: 600, atk: 6, def: 2, spd: 3 })]
  });
  let found = null;
  for (let seed = 1; seed < 80 && !found; seed++) {
    const s = build2(3);
    const r = Battle.simulate(s.p, s.e, { rations: rations(), seed, offerOrder: true });
    if (r.orderOffer && r.orderOffer.candidates.some(c => c.unitId === 'p1')) found = { seed, round: r.orderOffer.round };
  }
  assert(!!found, '（前提）ミラに号令できる節目が出る');
  if (found) {
    const s = build2(3);
    const r = Battle.simulate(s.p, s.e, { rations: rations(), seed: found.seed, offerOrder: true, orders: { [found.round]: 'p1' } });
    const exec = r.timeline.find(e => e.type === 'order_exec');
    const after = exec ? r.timeline.slice(r.timeline.indexOf(exec)).filter(e => e.type === 'trait_trigger' && e.traitId === 'great_fireball').length : 0;
    assert(after >= 1, `号令なら自動の1回を使い切った後でも出る（号令後 ${after} 回）`);
  }
  assert(['great_fireball', 'ogre_charge', 'blood_howl', 'goblin_tactics'].every(id => TRAITS[id].autoLimit === 1), '大火球・ぶちかまし・血の雄叫び・集団戦法に autoLimit 1');
}

// 11. お披露目：debutSkill が無い名簿（null）では上位技は号令でだけ出る。覚えた直後（debutSkill=技）なら1回出る
{
  const build = (debut) => ({
    p: [mk('タンク', [], 'player', { hp: 900, atk: 3, def: 10, spd: 2 }), mk('ミラ', ['great_fireball'], 'player', { race: '魔族', hp: 400, atk: 6, def: 4, spd: 6, spirit: 3, debutSkill: debut })],
    e: [mk('兵A', [], 'enemy', { race: '人間', hp: 600, atk: 6, def: 2, spd: 7 }), mk('兵B', [], 'enemy', { race: '人間', hp: 600, atk: 6, def: 2, spd: 3 })]
  });
  const fires = r => r.timeline.filter(e => e.type === 'trait_trigger' && e.traitId === 'great_fireball').length;
  const a = build(null); const ra = Battle.simulate(a.p, a.e, { rations: rations(), seed: 3 });
  assert(fires(ra) === 0, `お披露目が済んだ者は号令なしでは出ない（${fires(ra)}）`);
  const b = build('great_fireball'); const rb = Battle.simulate(b.p, b.e, { rations: rations(), seed: 3 });
  assert(fires(rb) === 1, `覚えた直後の戦いでは一度だけ出る（${fires(rb)}）`);
}

// 8. 台詞と定義の形：order を持つ特性は lines.order を3本以上、28文字以内、数字なし
{
  const ids = Object.keys(TRAITS).filter(id => TRAITS[id].order);
  const bad = ids.filter(id => {
    const lines = (TRAITS[id].lines || {}).order || [];
    return lines.length < 3 || lines.some(l => l.length > 28 || /\d/.test(l)) || !TRAITS[id].order.label;
  });
  assert(ids.length >= 9 && bad.length === 0, `号令できる特性 ${ids.length} 種、台詞・見出しの形が揃っている${bad.length ? '：' + bad.join(',') : ''}`);
}

console.log(failed ? `\n${failed} 件失敗` : '\n全通過');
process.exit(failed ? 1 : 0);
