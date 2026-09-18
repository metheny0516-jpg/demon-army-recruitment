// 将軍への転身（docs/SPEC_GENERAL_2026-09-13.md）。
//   node tools/test-promotion.js
// 階級は「兵卒 → 将軍」の2段だけ。将軍は昇進ではなく転身（能力・気合上限・将軍技・二つ名）。
// 戦功の入り方そのものと「将軍の号令」シナジーは test-promotions.js（複数形）が見ている。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/skills.js', 'src/data/battle_happenings.js', 'src/data/monsters.js',
  'src/data/bonds.js', 'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js',
  'src/data/events.js', 'src/data/demon_kings.js',
  'src/core/util.js', 'src/core/storage.js', 'src/core/synergy.js',
  'src/core/battle.js', 'src/core/chain.js', 'src/core/run.js'
];
const store = {};
const ctx = { console, Math, Date, JSON, localStorage: {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; }
} };
vm.createContext(ctx);
for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
// epithets.js（CodeX 担当）はまだ無いことがある。あれば読む。
if (fs.existsSync('src/data/epithets.js')) vm.runInContext(fs.readFileSync('src/data/epithets.js', 'utf8'), ctx, { filename: 'epithets' });
const Game = vm.runInContext('Game', ctx);
const PROMOTION_RANKS = vm.runInContext('PROMOTION_RANKS', ctx);
const SKILLS = vm.runInContext('SKILLS', ctx);
const hasEpithets = vm.runInContext('typeof EPITHETS !== "undefined"', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
vm.runInContext('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];', ctx);

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 100, atk: 20, def: 5, spd: 6, salary: 3, loyalty: 60, traits: [], skills: [], tags: [],
  department: "combat", injured: 0, relicIds: [], merit: 0, rankId: "soldier", spirit: 1,
  record: { battles: 0, wins: 0, downed: 0, carried: 0, late: 0, ate: 0 } }, x || {});

// ── 1. 階級は2段だけ ──────────────────────────
{
  assert(PROMOTION_RANKS.length === 2, `階級は2件（${PROMOTION_RANKS.map(r => r.id).join(',')}）`);
  assert(PROMOTION_RANKS[0].id === 'soldier' && PROMOTION_RANKS[1].id === 'general', '兵卒と将軍');
  assert(PROMOTION_RANKS[1].threshold === 22, `将軍は戦功22（${PROMOTION_RANKS[1].threshold}）`);
  assert(!PROMOTION_RANKS.some(r => ['squad_leader', 'demon_lord'].includes(r.id)), '小隊長・魔将は無い');
  const m = member(101, 'ヘイソツ', { merit: 21 });
  assert(Game.rankOf(m).id === 'soldier' && Game.nextRank(m).id === 'general',
    `兵卒の次は将軍（${Game.nextRank(m).name}）`);
}

// ── 2. 転身の中身 ────────────────────────────
{
  Game.newRun();
  const st = Game.state;
  const m = member(102, 'ゴルド');
  st.roster = [m];
  const before = { hp: m.hp, atk: m.atk, def: m.def, loyalty: m.loyalty, salary: m.salary };
  const notes = [];
  Game.promote(m, PROMOTION_RANKS[1], notes);
  assert(m.rankId === 'general', '将軍になる');
  assert(m.hp === Math.round(before.hp * 1.4) && m.atk === Math.round(before.atk * 1.4),
    `HP・攻撃が×1.4（${before.hp}→${m.hp} / ${before.atk}→${m.atk}）`);
  assert(m.def === before.def + 2, `防御+2（${m.def}）`);
  assert(m.loyalty === before.loyalty + 15 && m.salary === before.salary + 2,
    `忠誠+15・給与+2（${m.loyalty} / ${m.salary}）`);
  assert(m.spiritMaxBonus === 1, `気合の上限+1（${m.spiritMaxBonus}）`);
  assert(m.spirit === Game.spiritRules().max + 1, `気合は満タン（${m.spirit}）`);
  assert(m.skills.includes('general_might'), `将軍技が入る（${m.skills.join(',')}）`);
  assert(!!SKILLS.general_might && SKILLS.general_might.cost === 2, '将軍技の定義があり気合2');
  assert(!!m.epithet, `二つ名が付く（${m.epithet}）`);
  assert(Game.displayName(m) === `${m.epithet}・ゴルド`, `表示名は「二つ名・名前」（${Game.displayName(m)}）`);
  assert(m.name === 'ゴルド', 'm.name は変えない（殿堂・記録が名前で照合する）');
  assert(notes.some(n => /転身/.test(n)), `notes は「昇進」ではなく「転身」（${notes[0]}）`);
  assert(st.generalsMade.length === 1 && st.generalsMade[0].uid === 102, '輩出した将軍に記録される');
  assert((st.lastPromotions[0] || {}).general === true, '決着画面へ「将軍」の印が渡る');
  // 種族技・上位技は残る
  const m2 = member(103, 'ワザモチ', { skills: ['orc_cleave'], traits: ['blood_howl'] });
  st.roster.push(m2);
  Game.promote(m2, PROMOTION_RANKS[1], []);
  assert(m2.skills.includes('orc_cleave') && m2.skills.includes('general_might') && m2.traits.includes('blood_howl'),
    `種族技・上位技はそのまま（${m2.skills.join(',')} / ${m2.traits.join(',')}）`);
}

// ── 3. 二重に転身しても能力は二度掛からない ──────────
{
  Game.newRun();
  const m = member(104, 'フタタビ');
  Game.state.roster = [m];
  Game.promote(m, PROMOTION_RANKS[1], []);
  const after = { hp: m.hp, atk: m.atk, skills: m.skills.length };
  Game.transformToGeneral(m);          // 付け直し（旧セーブの移行が通る道）
  assert(m.hp === after.hp && m.atk === after.atk, `付け直しで能力は動かない（${m.hp}/${m.atk}）`);
  assert(m.skills.length === after.skills, `将軍技が二重に入らない（${m.skills.join(',')}）`);
  assert(Game.state.generalsMade.filter(g => g.uid === 104).length === 1, '輩出記録も二重にならない');
}

// ── 4. 戦功22で決着から転身する ─────────────────
{
  Game.newRun();
  const st = Game.state;
  const m = member(105, 'センコウ', { merit: 20 });
  st.roster = [m];
  const contribution = [{ uid: 105, name: 'センコウ', dealt: 50, taken: 5, kills: 1, survived: true }];
  Game.awardMerit(contribution, []);
  assert(m.merit >= 22 && m.rankId === 'general', `戦功22で将軍へ（${m.merit} / ${m.rankId}）`);
}

// ── 5. 旧セーブ ───────────────────────────
{
  Game.newRun();
  const st = Game.state;
  const major = member(201, 'マショウ', { rankId: 'demon_lord', merit: 12, hp: 130, atk: 26 });
  const squad = member(202, 'ショウタイ', { rankId: 'squad_leader', merit: 6 });
  const old = member(203, 'キュウショウグン', { rankId: 'general', merit: 30, hp: 140, atk: 28 });
  delete old.epithet; delete old.spiritMaxBonus; old.skills = [];
  st.roster = [major, squad, old];
  st.departed = [{ name: 'ムカシ', formerRankId: 'demon_lord' }];
  const kept = { hp: major.hp, atk: major.atk, oldHp: old.hp, oldAtk: old.atk };
  Game.migrateState();
  assert(major.rankId === 'soldier' && squad.rankId === 'soldier', '廃止した階級は兵卒へ戻る');
  assert(major.hp === kept.hp && major.atk === kept.atk, `能力は巻き戻さない（${major.hp}/${major.atk}）`);
  assert(major.merit === 12, `戦功はそのまま（${major.merit}。22に届けば次の決着で将軍）`);
  assert(old.rankId === 'general', '既に将軍だった者は将軍のまま');
  assert(!!old.epithet && old.skills.includes('general_might') && old.spiritMaxBonus === 1,
    `将軍の旧セーブに転身の中身が付く（${old.epithet} / ${old.skills.join(',')} / +${old.spiritMaxBonus}）`);
  assert(old.hp === kept.oldHp && old.atk === kept.oldAtk,
    `付け直しでも HP・攻撃は再度掛からない（${old.hp}/${old.atk}）`);
  assert(st.departed[0].formerRankId === 'soldier', '殿堂の廃止階級も兵卒へ丸める');
  assert(st.roster.every(x => typeof x.spiritMaxBonus === 'number'), '全員に spiritMaxBonus が入る');
}

// ── 6. 二つ名の出どころ ────────────────────────
{
  const m = member(301, 'ダレカ');
  const e = Game.epithetFor(m);
  assert(!!e, `二つ名を引ける（${e}${hasEpithets ? '' : '：epithets.js がまだ無いので仮の名'}）`);
  if (hasEpithets) {
    const EPITHETS = vm.runInContext('EPITHETS', ctx);
    assert((EPITHETS[m.race] === e || EPITHETS[m.tplId] === e), `種族ごとの二つ名（オーク → ${e}）`);
  }
  assert(Game.displayName(member(302, 'ヘイ')) === 'ヘイ', '兵卒に二つ名は付かない');
  assert(Game.isGeneral(member(303, 'X', { rankId: 'general' })) && !Game.isGeneral(member(304, 'Y')),
    'isGeneral の判定');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
