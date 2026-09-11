// 撤退の提案：味方が初めて倒れたラウンドの終わりに、一度だけ「退けます」を出す。
//   node tools/test-retreat-battle.js
// battle.js は印を置くだけ。止めるか続けるかを決めるのは run.js と描画側（別コミット）。
const fs = require('fs'), vm = require('vm');
const files = ['src/data/traits.js','src/data/battle_happenings.js','src/data/monsters.js','src/data/promotions.js',
  'src/data/synergies.js','src/data/enemies.js','src/core/util.js','src/core/synergy.js','src/core/battle.js'];
const ctx = { console, Math: Object.create(Math) };
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
// 乱数を固定して決定的にする（U.chance(0.5) の行動順も含めて毎回同じ戦闘になる）
vm.runInContext('U.chance = p => false; U.pick = arr => arr[0]; U.rand = () => 0.5;', ctx);
const Battle = vm.runInContext('Battle', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const mk = (name, traits, side, x) => Battle.makeUnit(Object.assign({
  uid: name, name, race: 'オーク', hp: 80, atk: 10, def: 3, spd: 5, traits, tags: [], loyalty: 80 }, x || {}), side);
const rations = (extra) => Object.assign({ consumed: 3, need: 3, shortage: 0, emptied: false,
  bigEaterUids: [], cookUid: null, hungerUid: null, feastUid: null }, extra || {});

// 味方2人（片方は紙、片方は硬い）・敵1人（HP高め・そこそこ強い）
// → 紙のほうが途中で倒れ、硬いほうは立っている、という状況を作る。
const scene = (opts) => {
  const weak = mk('ヨワシ', [], 'player', { hp: 30, atk: 6, def: 0, spd: 9 });
  const tough = mk('カタブツ', [], 'player', { hp: 400, atk: 6, def: 8, spd: 4 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 900, atk: 34, def: 4, spd: 7 });
  return { weak, tough, foe, r: Battle.simulate([weak, tough], [foe], Object.assign({ rations: rations() }, opts || {})) };
};

// 1. 提案がちょうど1回、正しい中身で出る
{
  const { weak, tough, foe, r } = scene();
  const offers = r.timeline.filter(e => e.type === 'retreat_offer');
  assert(offers.length === 1, `提案はちょうど1回（実際 ${offers.length}）`);
  const o = offers[0];
  assert(!!o && o.downed.some(u => u.id === weak.id), '倒れた者が downed に入る');
  assert(!!o && o.downed.every(u => u.id !== tough.id), '立っている者は downed に入らない');
  assert(!!o && o.standing.some(u => u.id === tough.id), '立っている者が standing に入る');
  assert(!!o && o.enemies.some(u => u.id === foe.id), '立っている敵が enemies に入る');
  assert(!!o && /退けます/.test(o.text) && new RegExp(weak.name).test(o.text), 'モルモの一言に倒れた者の名前と「退けます」');
  assert(!!o && o.emphasis === 3 && o.cls === 'mormo', '重要度3・モルモの一言として出る');
  assert(!!r.retreatOffer && r.timeline[r.retreatOffer.index] === o, 'result.retreatOffer.index が timeline 内の位置を指す');
  assert(!!r.retreatOffer && r.retreatOffer.round === o.round, 'round が一致する');
}

// 2. 提案時点の contribution：倒れた者は担いで帰る（生存＋負傷）
{
  const { weak, tough, r } = scene();
  const rows = r.retreatOffer.contribution;
  const w = rows.find(x => x.uid === 'ヨワシ'), t = rows.find(x => x.uid === 'カタブツ');
  assert(!!w && w.survived === true && w.injured === true, '倒れていた者は survived: true / injured: true');
  assert(!!t && t.survived === true && !t.injured, '立っていた者は survived: true で injured は無い');
  assert(rows.every(x => x.id !== undefined && x.name), 'contribution は既存と同じ形（id・name がある）');
}

// 3. 続行の結末（result.contribution）は今までどおり：倒れたまま終われば戦死
{
  const { r } = scene();
  const w = r.contribution.find(x => x.uid === 'ヨワシ');
  assert(!!w && w.survived === false, '続行して倒れたまま終われば survived: false（提案は結末を変えない）');
  assert(w.injured === undefined, '続行の contribution に injured は付かない');
}

// 4. 誰も倒れずに勝つ戦闘では提案しない
{
  const hero = mk('無双', [], 'player', { hp: 400, atk: 90, def: 20, spd: 20 });
  const foe = mk('かかし', [], 'enemy', { race: '人間', hp: 30, atk: 1, def: 0, spd: 1 });
  const r = Battle.simulate([hero], [foe], { rations: rations() });
  assert(r.victory === true, '（前提）勝っている');
  assert(!r.timeline.some(e => e.type === 'retreat_offer'), '誰も倒れなければ提案は出ない');
  assert(r.retreatOffer === null, 'retreatOffer は null');
}

// 5. 全滅する戦闘では提案しない（「退けば良かった」は無い）
{
  const a = mk('ヨワシ', [], 'player', { hp: 12, atk: 1, def: 0, spd: 1 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 900, atk: 200, def: 20, spd: 30 });
  const r = Battle.simulate([a], [foe], { rations: rations() });
  assert(r.victory === false, '（前提）負けている');
  assert(!r.timeline.some(e => e.type === 'retreat_offer'), '立っている軍団員が居なくなる（全滅）なら提案は出ない');
}

// 6. 遅刻で不在の者は「立っている」に数えない（alive ではなく onField）
{
  const weak = mk('ヨワシ', [], 'player', { hp: 30, atk: 6, def: 0, spd: 9 });
  const late = mk('ガロ', ['drunkard'], 'player', { hp: 400, atk: 6, def: 8, spd: 4 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 900, atk: 34, def: 4, spd: 7 });
  const r = Battle.simulate([weak, late], [foe], { rations: rations() });
  const start = r.timeline.find(e => e.type === 'battle_start');
  assert(start.absent.some(u => u.id === late.id), '（前提）酒好きは開戦時に不在');
  const first = r.timeline.find(e => e.type === 'retreat_offer');
  const deathRound = (() => {
    let round = 0;
    for (const e of r.timeline) {
      if (e.type === 'round_start') round = e.round;
      if (e.type === 'death' && e.unitId === weak.id) return round;
    }
    return null;
  })();
  assert(!first || first.round > deathRound || !first.standing.some(u => u.id === late.id),
    '不在の者だけが残っているラウンドでは提案しない（到着後なら提案してよい）');
}

// 7. 蘇生でラウンド終了時に立っていれば、そのラウンドでは提案しない
{
  vm.runInContext('U.rand = () => 0.1;', ctx);   // 《執念》の25%を必ず引く
  const tenacious = mk('シブトイ', ['tenacity'], 'player', { hp: 30, atk: 6, def: 0, spd: 9 });
  const tough = mk('カタブツ', [], 'player', { hp: 400, atk: 6, def: 8, spd: 4 });
  const foe = mk('勇者', [], 'enemy', { race: '人間', hp: 900, atk: 34, def: 4, spd: 7 });
  const r = Battle.simulate([tenacious, tough], [foe], { rations: rations() });
  let round = 0, reviveRound = null;
  for (const e of r.timeline) {
    if (e.type === 'round_start') round = e.round;
    if (e.type === 'revive' && e.unitId === tenacious.id && reviveRound === null) reviveRound = round;
  }
  const offer = r.timeline.find(e => e.type === 'retreat_offer');
  assert(reviveRound !== null, '（前提）《執念》で一度立ち上がっている');
  assert(!offer || offer.round !== reviveRound, '立ち上がったラウンドでは提案しない');
  vm.runInContext('U.rand = () => 0.5;', ctx);
}

// 8. 提案の抑止（開幕の防衛戦などで使う）
{
  const { r } = scene({ noRetreatOffer: true });
  assert(!r.timeline.some(e => e.type === 'retreat_offer'), 'noRetreatOffer なら提案イベントを出さない');
  assert(r.retreatOffer === null, 'noRetreatOffer なら retreatOffer は null');
}

// 9. 乱数を新たに消費していない：提案あり／なしで attack の列が完全に一致する
{
  const a = scene(), b = scene({ noRetreatOffer: true });
  const fingerprint = r => r.timeline.filter(e => e.type === 'attack')
    .map(e => `${e.fromId}>${e.toId}:${e.dmg}:${e.hp}`).join('|');
  assert(!!a.r.retreatOffer && !b.r.retreatOffer, '（前提）片方だけ提案が出ている');
  assert(fingerprint(a.r) === fingerprint(b.r), '提案の有無で attack 列が1ビットも変わらない');
  assert(a.r.victory === b.r.victory && JSON.stringify(a.r.contribution) === JSON.stringify(b.r.contribution),
    '勝敗と contribution も変わらない');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
