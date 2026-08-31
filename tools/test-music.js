// BGM（軍団が演奏する行進曲）の検証。ブラウザ不要。
// 見ているのは「UIの形」ではなく守りたい性質:
//   軍団の状態が descriptor に正しく翻訳されるか、
//   不満（未払い・低忠誠）が実際に演奏を痩せさせるか。
const fs = require('fs'), vm = require('vm');

let started = 0;
let byType = { triangle: 0 };
// hiss()（スネア・ハイハット・踏み込みのクリック等、ノイズ由来の中高域）が
// 実際に amp.gain へ書き込む値だけを拾う。voice()（オシレーター由来の音程）とは
// 作られる順序（createBufferSource → createGain）で見分ける。
// これが無いと「音は鳴っている」ことしか検証できず、hiss()内部の減衰量が
// 実質無音になるレベルまで沈んでいても気づけない（実際に踏んだバグ）。
let creatingHiss = false;
let hissPeaks = [];
class AudioParam {
  constructor(hiss) { this.value = 0; this.hiss = !!hiss; }
  setValueAtTime(v) { this.value = v; if (this.hiss) hissPeaks.push(v); }
  exponentialRampToValueAtTime(v) { this.value = v; if (this.hiss) hissPeaks.push(v); }
  setTargetAtTime(v) { this.value = v; }
}
class AudioNode {
  connect(n) { return n; }
  start() { started++; }
  stop() { if (this.onended) this.onended(); }
}
class GainNode extends AudioNode {
  constructor() { super(); this.gain = new AudioParam(creatingHiss); creatingHiss = false; }
}
class OscillatorNode extends AudioNode {
  constructor() { super(); this.frequency = new AudioParam(); this.detune = new AudioParam(); }
  start() { super.start(); byType[this.type] = (byType[this.type] || 0) + 1; }
}
class BufferSourceNode extends AudioNode {
  constructor() { super(); this.buffer = null; creatingHiss = true; }
}
class FilterNode extends AudioNode {
  constructor() { super(); this.frequency = new AudioParam(); this.type = 'lowpass'; }
}
class AudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'running'; }
  createGain() { return new GainNode(); }
  createOscillator() { return new OscillatorNode(); }
  createBufferSource() { return new BufferSourceNode(); }
  createBiquadFilter() { return new FilterNode(); }
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
}
class AudioElement {
  constructor(src = '') { this.src = src; this.volume = 1; this.playbackRate = 1; this.currentTime = 0; }
  load() {} cloneNode() { return new AudioElement(this.src); } addEventListener() {}
  play() { return Promise.resolve(); } pause() {}
}

const store = {};
const ctx = {
  console, Math,
  window: { AudioContext },
  Audio: AudioElement,
  setInterval: () => 1,
  clearInterval: () => {},
  localStorage: {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); }
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/ui/sound.js', 'utf8'), ctx, { filename: 'sound.js' });
vm.runInContext(fs.readFileSync('src/ui/music.js', 'utf8'), ctx, { filename: 'music.js' });
const Sound = vm.runInContext('Sound', ctx);
const Music = vm.runInContext('Music', ctx);

// ── テスト用の軍団を組み立てる ──────────────
// 実在のモンスターIDを対照群に使わない（増えた瞬間にテストが嘘になる）。
let uid = 0;
function unit(over = {}) {
  return Object.assign({
    uid: ++uid, race: 'テスト種', tags: [], rankId: 'soldier', loyalty: 80, unpaid: false
  }, over);
}
function army(units, extra = {}) {
  return Object.assign({ roster: units, activeUids: units.map(u => u.uid), alert: 0 }, extra);
}

function assert(cond, message) { if (!cond) throw new Error(message); }

// 1. 純関数であること（同じ入力なら同じ出力・状態を汚さない）
{
  const st = army([unit(), unit()]);
  const a = JSON.stringify(Music.describe(st, { scene: 'battle' }));
  const b = JSON.stringify(Music.describe(st, { scene: 'battle' }));
  assert(a === b, 'describe() が同じ入力で違う結果を返す');
  assert(st.roster.length === 2, 'describe() が状態を書き換えている');
}

// 2. 出撃隊の頭数がそのままベースの音数になる
{
  const one = Music.describe(army([unit()]), { scene: 'battle' });
  const five = Music.describe(army([unit(), unit(), unit(), unit(), unit()]), { scene: 'battle' });
  assert(one.layers.bass.density < five.layers.bass.density, '頭数がベースの厚みに反映されない');
  const audible = d => Music.BASS_PATTERN.filter(n => d.layers.bass.density >= n.p).length;
  assert(audible(one) < audible(five), '頭数を増やしてもベースの音数が増えない');
  assert(audible(one) >= 1, '1体でも行進のベースは鳴るべき');
}

// 3. 昇進が耳で分かる（将軍 > 魔将 > 兵卒）
{
  const g = s => Music.describe(army([unit({ rankId: s })]), { scene: 'battle' }).layers.brass.gain;
  assert(g('soldier') === 0, '兵卒だけで号令ラッパが鳴っている');
  assert(g('demon_lord') > 0, '魔将で号令ラッパが鳴らない');
  assert(g('general') > g('demon_lord'), '将軍が魔将より目立たない');
}

// 4. 種族タグがそれぞれのレイヤーへ接続している
{
  const plain = Music.describe(army([unit(), unit(), unit()]), { scene: 'battle' });
  assert(plain.layers.choir.gain === 0 && plain.layers.bells.gain === 0 && plain.layers.slime.gain === 0,
    'タグ無しの軍団で専用レイヤーが鳴っている');

  const undead = Music.describe(army([unit({ tags: ['undead'] }), unit({ tags: ['undead'] }), unit({ tags: ['undead'] })]), { scene: 'battle' });
  assert(undead.layers.choir.gain > 0, 'アンデッドでコーラスが鳴らない');

  const casters = Music.describe(army([unit({ tags: ['caster'] }), unit({ tags: ['caster'] })]), { scene: 'battle' });
  assert(casters.layers.bells.gain > 0, '術者で鈴が鳴らない');

  const slimes = Music.describe(army([unit({ race: 'テストスライム' })]), { scene: 'battle' });
  assert(slimes.layers.slime.gain > 0, 'スライムで裏拍が鳴らない');
}

// 5. 未払いと低忠誠が不満になり、行進が鈍る
{
  const happy = Music.describe(army([unit(), unit()]), { scene: 'battle' });
  const unpaid = Music.describe(army([unit({ unpaid: true }), unit({ unpaid: true })]), { scene: 'battle' });
  const sullen = Music.describe(army([unit({ loyalty: 10 }), unit({ loyalty: 10 })]), { scene: 'battle' });
  assert(happy.unrest === 0, '満足した軍団に不満が出ている');
  assert(unpaid.unrest > 0, '未払いが不満にならない');
  assert(sullen.unrest > 0, '低忠誠が不満にならない');
  assert(unpaid.bpm < happy.bpm, '不満があっても行進のテンポが落ちない');
}

// 6. 警戒度が上がると行軍が急く
{
  const calm = Music.describe(army([unit()], { alert: 0 }), { scene: 'mission' });
  const hunted = Music.describe(army([unit()], { alert: 10 }), { scene: 'mission' });
  assert(hunted.bpm > calm.bpm, '警戒度でテンポが上がらない');
  assert(hunted.layers.drum.gain > calm.layers.drum.gain, '警戒度で足音が強まらない');
}

// 7. 場面が変わればテンポが変わる／未知の場面でも落ちない
{
  const battle = Music.describe(army([unit()]), { scene: 'battle' });
  const recruit = Music.describe(army([unit()]), { scene: 'recruit' });
  assert(battle.bpm > recruit.bpm, '戦闘のほうが遅い');
  const unknown = Music.describe(army([unit()]), { scene: 'まだ無い画面' });
  assert(unknown.scene === 'recruit', '未知の場面名で既定へ落ちない');
  assert(Music.describe(null, { scene: 'title' }).head === 0, '状態なしで describe() が壊れる');
}

// 8. 不満は「サボり」として実際に音を減らす（描画側まで通っているか）
function bars(state, count) {
  Music.desc = Music.describe(state, { scene: 'battle' });
  let seed = 12345;
  Music.rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  assert(Music.start(), 'BGMを開始できない');
  const before = started;
  const beforeTriangle = byType.triangle || 0;
  for (let bar = 0; bar < count; bar++) {
    for (let step = 0; step < 16; step++) Music.scheduleStep(step, bar * 2 + step * 0.1);
  }
  Music.suspend();
  return { total: started - before, triangle: byType.triangle - beforeTriangle };
}
{
  Sound.muted = false;
  const full = [unit(), unit(), unit(), unit(), unit({ rankId: 'general', tags: ['undead'] })];
  const paid = bars(army(full), 40).total;
  const striking = bars(army(full.map(u => Object.assign({}, u, { unpaid: true, loyalty: 5 }))), 40).total;
  assert(paid > 0, '演奏がまったく鳴っていない');
  assert(striking < paid * 0.85, `未払いでも演奏が痩せない: ${striking} / ${paid}`);
  assert(striking > 0, '未払いで演奏が完全に止まっている（行軍は続くべき）');

  // 行進ベースだけが主役の編成でも痩せること。
  // 号令ラッパやコーラスのサボりに隠れて、ベースのサボりが死んでいないか見る。
  const plain = [unit(), unit(), unit(), unit(), unit()];
  // 術者がいない編成では鈴が鳴らないので、triangle 波＝行進ベースだけを数えられる。
  const plainPaid = bars(army(plain), 40).triangle;
  const plainStriking = bars(army(plain.map(u => Object.assign({}, u, { unpaid: true, loyalty: 5 }))), 40).triangle;
  assert(plainPaid > 0, '行進ベースが鳴っていない');
  assert(plainStriking < plainPaid * 0.8,
    `行進ベースがサボらない: ${plainStriking} / ${plainPaid}`);
}

// 9. BGMだけを切れる／効果音がミュートなら鳴らない
{
  Music.setEnabled(false);
  assert(store.maou_bgm === '0', 'BGMのオンオフを保存できない');
  Music.desc = Music.describe(army([unit()]), { scene: 'battle' });
  assert(Music.start() === false, 'BGMオフでも再生を始めてしまう');
  Music.setEnabled(true);
  Sound.muted = true;
  assert(Music.start() === false, '効果音ミュート中にBGMが鳴る');
  Sound.muted = false;
}


// 10. 実際に「聞こえる音量か」を測る。
//     オシレーターが started() したかだけを見るテスト（1〜9）は、内部の減衰計算で
//     音量が実質ゼロまで沈んでいても検出できない。実際にこのバグを踏んだ:
//     hiss() 内部に二重の減衰があり、スネア・ハイハットが効果音の1/10未満まで
//     沈んでいた。実プレイでは「BGMが鳴らない」のと区別がつかなかった。
{
  Sound.muted = false;
  Music.desc = Music.describe(army([unit(), unit(), unit()]), { scene: 'battle' });
  let seed = 777;
  Music.rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  hissPeaks = [];
  assert(Music.start(), 'BGMを開始できない');
  for (let bar = 0; bar < 8; bar++) {
    for (let step = 0; step < 16; step++) Music.scheduleStep(step, bar * 2 + step * 0.1);
  }
  Music.suspend();
  assert(hissPeaks.length > 0, 'スネア・ハイハット系のノイズ音が1回も鳴っていない');
  const masterVolume = 0.55; // Sound の初期音量
  const loudest = Math.max(...hissPeaks) * Music.out.gain.value * masterVolume;
  // 効果音1発の実効音量はおおむね 0.015〜0.03（tone/noiseのgainにSound.masterを掛けた値）。
  // BGMは常時鳴る下敷きなので効果音より控えめでよいが、これを大きく下回ると
  // 実プレイでは「鳴っていない」のと区別がつかない（修正前は0.0018程度だった）。
  assert(loudest >= 0.008, `BGMのノイズ系（スネア・ハイハット等）の実効音量が小さすぎる: ${loudest.toFixed(4)}`);
}

console.log('✓ BGM: 頭数・昇進・種族・未払い・忠誠・警戒度が演奏へ接続、サボりが効く');
