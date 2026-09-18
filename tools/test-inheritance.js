// 継承：人は消えるが、残したものは消えない。
//   node tools/test-inheritance.js
// 離脱の4種（戦死・解雇・逃亡・引退）は全部 recordDeparture() を通る。遺物・縁の応募者・文化を見る。
const fs = require('fs'), vm = require('vm');
const files = [
  'src/data/traits.js', 'src/data/battle_happenings.js', 'src/data/monsters.js', 'src/data/bonds.js',
  'src/data/promotions.js', 'src/data/synergies.js', 'src/data/enemies.js',
  'src/data/missions.js', 'src/data/counterattack.js', 'src/data/departments.js', 'src/data/events.js', 'src/data/demon_kings.js',
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
const Game = vm.runInContext('Game', ctx);
const TRAITS = vm.runInContext('TRAITS', ctx);
const VETERAN_MOTIVES = vm.runInContext('VETERAN_MOTIVES', ctx);
let failed = 0;
const assert = (c, m) => { if (c) console.log(`✓ ${m}`); else { failed++; console.log(`✗ ${m}`); } };
const fix = (src) => vm.runInContext(src, ctx);
const resetRng = () => fix('U.rand = () => 0.5; U.chance = () => false; U.pick = arr => arr[0];');

const member = (uid, name, x) => Object.assign({
  uid, tplId: "orc", name, race: "オーク", job: "兵",
  hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [],
  department: "combat", injured: 0, relicIds: [] }, x || {});

let FIXED_MISSION = null;
function freshRun(roster, activeUids) {
  Game.newRun();
  const st = Game.state;
  if (st.openingPrototype) { st.openingPrototype = false; st.openingDefenseWon = true; st.expeditionUsedToday = false; st.applicants = []; st.hiresLeft = 0; }
  st.food = 60; st.gold = 300;
  st.roster = roster;
  st.activeUids = activeUids;
  Game.syncDepartments();
  if (st.phase !== "mission") Game.prepareMissions(true);
  Game.selectMission(0);
  // 作戦は毎回引き直される。同じ戦闘を二度作れるよう最初の1件で固定する。
  if (!FIXED_MISSION) FIXED_MISSION = JSON.parse(JSON.stringify(st.selectedMission));
  st.selectedMission = JSON.parse(JSON.stringify(FIXED_MISSION));
  return st;
}
// 紙の前衛が倒れ、硬い後衛が立ったまま残る（撤退の提案が出る戦闘）。
// **前衛に酒好きを付けないこと。** 遅刻して不在になると狙われず、倒れないので前提が崩れる。
const paperAndTank = () => [
  member(101, 'ヨワシ', { hp: 8, atk: 2, def: 0, spd: 9 }),
  member(102, 'カタブツ', { hp: 500, atk: 40, def: 20, spd: 4 }),
  member(103, 'ルスバン', { hp: 30, atk: 4, def: 2, spd: 2 })
];

resetRng();

// 1. 戦死 → departed に fallen。record が出撃数と一致し、army が入る
{
  const st = freshRun(paperAndTank(), [101, 102]);
  Game.deploy();
  const gone = st.departed.find(d => d.name === 'ヨワシ');
  assert(!!gone && gone.cause === 'fallen', '戦死 → cause が fallen');
  assert(!!gone && gone.record.battles === 1, `record.battles が出撃数と一致（${gone && gone.record.battles}）`);
  assert(!!gone && !!gone.army, `army（相手の軍）が入る（${gone && gone.army}）`);
  assert(!st.roster.some(m => m.uid === 101), '名簿からは消える');
  const alive = st.roster.find(m => m.uid === 102);
  assert(alive && alive.record.battles === 1, '生き残った者にもカウンタが付く');
}

// 2. 解雇 → fired
{
  const st = freshRun(paperAndTank(), [101, 102]);
  Game.fire(101);
  const gone = st.departed.find(d => d.name === 'ヨワシ');
  assert(!!gone && gone.cause === 'fired', '解雇 → cause が fired');
  assert(!!gone && gone.army === null, '解雇に相手の軍は無い');
}

// 3. 逃亡 → deserted
{
  const st = freshRun([member(201, 'ニゲル', { loyalty: 0 })], [201]);
  const notes = [];
  Game.processDepartures(notes);   // 一度目は荷物をまとめるだけ（2026-09-12 の猶予）
  Game.processDepartures(notes);   // 次の決着まで忠誠0のままなら去る
  const gone = st.departed.find(d => d.name === 'ニゲル');
  assert(!!gone && gone.cause === 'deserted', '逃亡 → cause が deserted');
  assert(!st.roster.some(m => m.uid === 201), '名簿から消える');
}

// 4. 引退：負傷が明ける前にもう一度担がれる
{
  const st = freshRun(paperAndTank(), [101, 102]);
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  const weak = st.roster.find(m => m.uid === 101);
  assert(!!weak && weak.injured === 1, '（前提）一度目は負傷して名簿に残る');
  assert(!st.departed.some(d => d.name === 'ヨワシ'), '一度目では引退しない');
  // 負傷を明けさせずにもう一度出す
  st.activeUids = [101, 102];
  Game.syncDepartments();
  Game.prepareMissions(true); Game.selectMission(0);
  st.selectedMission = JSON.parse(JSON.stringify(FIXED_MISSION));
  Game.deploy({ offerRetreat: true });
  Game.settleBattle('retreat');
  const gone = st.departed.find(d => d.name === 'ヨワシ');
  assert(!!gone && gone.cause === 'retired', '二度目に担がれたら cause が retired');
  assert(!st.roster.some(m => m.uid === 101), '引退した者は名簿から消える');
  assert(gone && gone.record.carried >= 2, `担がれた回数が残る（${gone && gone.record.carried}）`);
}

// 5. 遺物：目立った者だけが残す
{
  const st = freshRun(paperAndTank(), [101, 102]);
  const veteran = st.roster.find(m => m.uid === 101);
  veteran.traits = ['drunkard'];
  veteran.record = { battles: 4, wins: 4, downed: 1, carried: 0, late: 2, ate: 0 };
  Game.fire(101);
  const relic = (st.relics || [])[0];
  assert(!!relic, '4戦以上の者は遺物を残す');
  assert(!!relic && relic.traitId === 'drunkard', '宿るのは種族固有でない特性（酒好き）');
  assert(!!relic && relic.name === `ヨワシの${TRAITS.drunkard.relic}`, `名前は「{名}の{名詞}」（${relic && relic.name}）`);
  assert(!!relic && relic.holderUid === null, '誰も持っていなければ蔵にある');
  const gone = st.departed.find(d => d.name === 'ヨワシ');
  assert(!!gone && gone.relicId === relic.id, '履歴が遺物を指す');
}
{
  // 閾値は4戦（ランの戦闘数7〜13に対して6は遅く、序盤の離脱で蔵が一度も出なかった）
  const st = freshRun([member(301, '無名', { traits: ['drunkard'] })], [301]);
  st.roster[0].record = { battles: 3, wins: 1, downed: 0, carried: 0, late: 0, ate: 0 };
  Game.fire(301);
  assert((st.relics || []).length === 0, '兵卒で3戦の者は遺物を残さない');
  assert(st.departed.some(d => d.name === '無名'), 'それでも履歴は残る');
}
{
  // 種族固有の特性しか持たない者（オーガの固定特性のみ）
  const st = freshRun([member(302, '素朴', { tplId: 'ogre', race: 'オーガ' })], [302]);
  const tpls = vm.runInContext('MONSTER_TEMPLATES', ctx);
  const ogre = tpls.find(t => t.id === 'ogre');
  st.roster[0].traits = (ogre.fixedTraits || [ogre.fixedTrait]).filter(Boolean).slice();
  st.roster[0].record = { battles: 9, wins: 5, downed: 0, carried: 0, late: 0, ate: 0 };
  Game.fire(302);
  assert((st.relics || []).length === 0, '種族固有の特性しか無い者は遺物を残さない');
}

// 6. 遺物の受け渡し
{
  const st = freshRun([member(401, '継ぐ者'), member(402, '既に酒好き', { traits: ['drunkard'] })], [401]);
  st.relics = [{ id: 'relic_1', name: 'ガロの杯', traitId: 'drunkard',
    from: { name: 'ガロ', race: 'オーク', cause: 'fallen', army: '神殿騎士団', turn: 7 }, holderUid: null }];
  assert(Game.giveRelic('relic_1', 401) === true, '蔵の遺物を渡せる');
  const heir = st.roster.find(m => m.uid === 401);
  assert(heir.traits.includes('drunkard'), '渡された者に特性が移る');
  assert(heir.relicIds.includes('relic_1') && st.relics[0].holderUid === 401, '持ち主として記録される');
  Game.storeRelic('relic_1');
  assert(!heir.traits.includes('drunkard'), '蔵へ戻すと特性が外れる');
  assert(st.relics[0].holderUid === null && !heir.relicIds.length, '蔵に戻る');
  // 元から同じ特性を持つ者
  Game.giveRelic('relic_1', 402);
  const already = st.roster.find(m => m.uid === 402);
  assert(already.traits.filter(t => t === 'drunkard').length === 1, '元から持つ者に渡しても特性は二重にならない');
  Game.storeRelic('relic_1');
  assert(already.traits.includes('drunkard'), '元から持っていた特性は蔵へ戻しても外れない');
}
{
  // 持ち主が離脱したら蔵へ戻る
  const st = freshRun([member(403, '持ち主')], [403]);
  st.relics = [{ id: 'relic_1', name: 'ガロの杯', traitId: 'drunkard',
    from: { name: 'ガロ', race: 'オーク', cause: 'fallen', army: null, turn: 3 }, holderUid: null }];
  Game.giveRelic('relic_1', 403);
  Game.fire(403);
  assert(st.relics[0].holderUid === null, '持ち主が離脱したら遺物は蔵へ戻る');
}

// 7. 縁の応募者
{
  const st = freshRun([member(501, 'ガロ', { traits: ['drunkard'] })], [501]);
  st.roster[0].record = { battles: 8, wins: 5, downed: 1, carried: 0, late: 3, ate: 0 };
  Game.fire(501);
  const relic = st.relics[0];
  assert(!!relic, '（前提）遺物が蔵にある');
  fix('U.chance = () => true;');   // 同種族60%・遺物を持って来る50% を必ず引く
  Game.genApplicants();
  const bonded = st.applicants.filter(m => m.bond);
  assert(bonded.length === 1, `縁の応募者がちょうど1人（${bonded.length}）`);
  assert(bonded[0] && bonded[0].bond.name === 'ガロ', '故人の名を覚えている');
  assert(bonded[0] && /ガロ/.test(bonded[0].motive), `志望理由に故人の名が入る（${bonded[0] && bonded[0].motive}）`);
  assert(bonded[0] && bonded[0].bond.kind === 'rumor', '解雇された者の縁は rumor（噂）');
  assert(bonded[0] && bonded[0].relicId === relic.id, '蔵の遺物を持って来る');
  // 採用すると持ち主になる
  const index = st.applicants.indexOf(bonded[0]);
  st.hiresLeft = 1; st.gold = 300; st.phase = "recruit";   // hire() は面接中しか通らない
  assert(Game.hire(index) === true, '縁の者を採用できる');
  const hired = st.roster.find(m => m.name === bonded[0].name);
  assert(!!hired && st.relics[0].holderUid === hired.uid, '採用したら遺物の持ち主になる');
  assert(!!hired && hired.traits.includes('drunkard'), '持って来た遺物の特性が乗る');
  resetRng();
}
{
  // 縁の者は「離脱の次の面接」に1人だけ。次の回には出ない
  const st = freshRun([member(502, 'サル')], [502]);
  st.roster[0].record = { battles: 7, wins: 3, downed: 0, carried: 0, late: 0, ate: 0 };
  Game.fire(502);
  Game.genApplicants();
  assert(st.applicants.filter(m => m.bond).length === 1, '（前提）次の面接に縁の者が来る');
  Game.genApplicants();
  assert(st.applicants.filter(m => m.bond).length === 0, 'その次の面接には来ない（予約は消費される）');
}
{
  // legacyReturn（魔界史の帰還者）と同時でも両方いる。枠が違う
  const st = freshRun([member(503, 'ホマレ')], [503]);
  st.roster[0].record = { battles: 7, wins: 3, downed: 0, carried: 0, late: 0, ate: 0 };
  Game.fire(503);
  st.legacyReturn = { tplId: 'orc', name: '帰還者', job: '兵', generation: 1, merit: 30, rankId: 'soldier' };
  st.legacyOffered = false;
  Game.genApplicants();
  assert(st.applicants.some(m => m.legacy), '魔界史の帰還者がいる');
  assert(st.applicants.filter(m => m.bond).length === 1, '縁の者も別の枠にいる');
  assert(!st.applicants.some(m => m.legacy && m.bond), '同じ人物が両方になっていない');
}

// 8. 文化は表示のみ
{
  const st = freshRun([member(601, 'ダレカ')], [601]);
  st.retreatCount = 4; st.fallenTotal = 1;
  assert(Game.armyCulture() === '生きて帰るのが武勲', '撤退4・戦死1 →「生きて帰るのが武勲」');
  st.retreatCount = 1; st.fallenTotal = 4;
  assert(Game.armyCulture() === '仲間を置いて逃げない', '戦死4・撤退1 →「仲間を置いて逃げない」');
  st.retreatCount = 2; st.fallenTotal = 2;
  assert(Game.armyCulture() === null, '2・2 なら軍風は出ない');
  // 文化を変えても抽選は変わらない（数値・確率に効かせていない）
  const roll = () => { st.uidSeq = 900; Game.genApplicants();
    return st.applicants.map(m => `${m.tplId}:${m.hp}/${m.atk}/${m.def}/${m.spd}`).join('|'); };
  st.retreatCount = 9; st.fallenTotal = 0; const a = roll();
  st.retreatCount = 0; st.fallenTotal = 9; const b = roll();
  assert(a === b, '文化を変えても応募者の種族・能力が1ビットも変わらない');
}

// 9. 魔王軍レベルと敵の連動
{
  const st = freshRun([member(701, 'レベル')], [701]);
  st.conquest = 0; st.turn = 14;
  assert(Game.armyLevel() === 7, `ターン14でレベル7（ceil(14×0.5)）（${Game.armyLevel()}）`);
  assert(Game.armyLevel() === Game.campaignLevel(), 'armyLevel は campaignLevel の別名');
  st.conquest = 5; st.turn = 1;
  assert(Game.armyLevel() === 6, '征服が進んでいればそちらが効く');
  // 通常作戦の敵は**征服度**で引く（2026-09-10 敵の成長の作り替え。時間では強くならない）。
  // 時間の圧力は防衛戦（魔王軍レベル基準）が払う。詳細は test-enemy-growth.js。
  const types = vm.runInContext('MISSION_TYPES', ctx);
  const invade = types.find(t => t.id === 'invade');
  st.conquest = 0; st.turn = 16;
  const late = Game.buildMission(invade);
  st.conquest = 0; st.turn = 1;
  const early = Game.buildMission(invade);
  assert(late.baseStage === early.baseStage,
    `征服が同じならターンが進んでも通常作戦の敵の段階は同じ（${early.baseStage} / ${late.baseStage}）`);
}

// 10. 叩き上げ：終盤に来た低ティアは伸びが速い・歴戦の印
{
  const st = freshRun([member(750, 'ダレカ')], [750]);
  const power = m => m.hp + m.atk * 6 + m.def * 4 + m.spd * 2;
  const avg = (level, tplId) => {
    st.conquest = level - 1; st.turn = 1;
    let sum = 0;
    for (let i = 0; i < 300; i++) sum += power(Game.rollApplicant(tplId));
    return sum / 300;
  };
  // tier1（コボルト）はレベル5以上で伸びが速くなる。tier3（術師）は変わらない
  const koboldLow = avg(4, 'kobold'), koboldHigh = avg(8, 'kobold');
  const necroLow = avg(4, 'necromancer'), necroHigh = avg(8, 'necromancer');
  const koboldRatio = koboldHigh / koboldLow, necroRatio = necroHigh / necroLow;
  assert(koboldRatio > necroRatio,
    `Lv4→8 で低ティアのほうが伸びる（コボルト ×${koboldRatio.toFixed(2)} / 術師 ×${necroRatio.toFixed(2)}）`);
  st.conquest = 7; st.turn = 1;
  const late = Game.rollApplicant('kobold');
  assert(late.veteran === true, 'レベル8で来た低ティアに歴戦の印が付く');
  assert(typeof VETERAN_MOTIVES !== "undefined" && VETERAN_MOTIVES.includes(late.motive),
    `志望理由が叩き上げのプールから出る（${late.motive}）`);
  st.conquest = 0; st.turn = 1;
  const early = Game.rollApplicant('kobold');
  assert(!early.veteran, '序盤に来た低ティアには印が付かない（珍しくないので）');
  const highTier = (() => { st.conquest = 7; st.turn = 1; return Game.rollApplicant('necromancer'); })();
  assert(!highTier.veteran, '終盤でも高ティアには印が付かない');
}
// 11. 旧セーブ
{
  Game.newRun();
  const st = Game.state;
  st.roster = [{ uid: 801, tplId: 'orc', name: '旧人', race: 'オーク', job: '兵',
    hp: 20, atk: 4, def: 2, spd: 3, salary: 3, loyalty: 60, traits: [], tags: [] }];
  delete st.departed; delete st.relics; delete st.pendingBond;
  Game.migrateState();
  assert(Array.isArray(st.departed) && Array.isArray(st.relics), 'departed / relics が既定値で入る');
  const old = st.roster[0];
  assert(old.record && old.record.battles === 0, 'record 無しの名簿員に record が入る');
  assert(Array.isArray(old.relicIds), 'relicIds が入る');
  Game.memberRecord(old).battles += 1;
  assert(old.record.battles === 1, 'カウンタを進めても落ちない');
}

console.log(failed ? `\n${failed} 件失敗` : '\n全件通過');
process.exit(failed ? 1 : 0);
