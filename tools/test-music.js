// BGM（軍団が演奏する行進曲）の検証。ブラウザ不要。
// 見ているのは「UIの形」ではなく守りたい性質:
//   軍団の状態が descriptor に正しく翻訳されるか、
//   不満（未払い・低忠誠）が実際に演奏を痩せさせるか。
const fs = require('fs'), vm = require('vm');

let started = 0;
let mediaPlayed = 0;
let byType = { triangle: 0 };
// hiss()（スネア・ハイハット・踏み込みのクリック等、ノイズ由来の中高域）が
// 実際に amp.gain へ書き込む値だけを拾う。voice()（オシレーター由来の音程）とは
// 作られる順序（createBufferSource → createGain）で見分ける。
// これが無いと「音は鳴っている」ことしか検証できず、hiss()内部の減衰量が
// 実質無音になるレベルまで沈んでいても気づけない（実際に踏んだバグ）。
let creatingHiss = false;
let hissPeaks = [];
// 音程を持つ音（voice() の frequency）に実際にセットされた値も拾う。
// 「聞こえる帯域まで上げたか」を検証するのに使う（下の test 11）。
let toneFreqs = [];
class AudioParam {
  constructor(hiss, freq) { this.value = 0; this.hiss = !!hiss; this.freq = !!freq; }
  setValueAtTime(v) { this.value = v; if (this.hiss) hissPeaks.push(v); if (this.freq) toneFreqs.push(v); }
  exponentialRampToValueAtTime(v) { this.value = v; if (this.hiss) hissPeaks.push(v); if (this.freq) toneFreqs.push(v); }
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
  constructor() { super(); this.frequency = new AudioParam(false, true); this.detune = new AudioParam(); }
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
  createMediaElementSource() { return new AudioNode(); }
  createBiquadFilter() { return new FilterNode(); }
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
}
class AudioElement {
  constructor(src = '') { this.src = src; this.volume = 1; this.playbackRate = 1; this.currentTime = 0; this.paused = true; }
  load() {} cloneNode() { return new AudioElement(this.src); } addEventListener() {}
  play() { this.paused = false; mediaPlayed++; return Promise.resolve(); }
  pause() { this.paused = true; }
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
  assert(g('general') > g('soldier'), '将軍がいると号令ラッパが鳴る');
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


// 10. CC0 の実曲が主役として読み込まれ、効果音と同じ master へ繋がる。
//     合成レイヤーのピークだけを測っても、完成音源の実効音量は保証できない。
{
  Sound.muted = false;
  Music.desc = Music.describe(army([unit(), unit(), unit()]), { scene: 'battle' });
  Music.track = null;
  Music.trackNode = Music.trackGain = Music.trackTone = null;
  Music.trackFailed = false;
  const before = mediaPlayed;
  assert(Music.start(), '実曲BGMを開始できない');
  const battleTrack = Music.TRACKS.battle.url;
  assert(fs.existsSync(Music.TRACKS.campaign.url), `通常BGM素材が無い: ${Music.TRACKS.campaign.url}`);
  assert(fs.existsSync(battleTrack), `戦闘BGM素材が無い: ${battleTrack}`);
  assert(Music.TRACKS.campaign.url !== battleTrack, '通常進行と戦闘が同じBGM素材を使っている');
  assert(Music.track && Music.track.src === battleTrack, '戦闘用CC0実曲が再生要素へ設定されない');
  assert(Music.track.loop === true, '実曲がループ再生になっていない');
  assert(mediaPlayed > before, '実曲の play() が呼ばれない');
  assert(Music.trackGain && Music.trackTone, '実曲が Sound.master へ接続されない');
  const effective = Music.trackLevel() * Sound.volume;
  assert(effective >= .45, `実曲BGMの実効レベルが小さすぎる: ${effective.toFixed(3)}`);
  assert(Music.trackLevel() > Music.MIX * 3, '合成レイヤーが実曲より前へ出ている');

  const paidLevel = Music.trackLevel();
  Music.desc = Music.describe(army([unit({ unpaid: true, loyalty: 5 })]), { scene: 'battle' });
  assert(Music.trackLevel() < paidLevel, '未払いでも実曲の演奏が痩せない');
  assert(Music.trackRate() >= .86 && Music.trackRate() <= 1.1, '実曲を音質が崩れる速度まで変えている');
  Music.suspend();
}

// 11. 場面に応じて音源そのものが切り替わり、通常進行へ戻せる。
{
  Sound.muted = false;
  Music.apply(Music.describe(army([unit()]), { scene: 'recruit' }));
  assert(Music.track.src === Music.TRACKS.campaign.url, '採用画面で通常BGMへ戻らない');
  Music.apply(Music.describe(army([unit()]), { scene: 'battle' }));
  assert(Music.track.src === Music.TRACKS.battle.url, '戦闘開始時に戦闘BGMへ切り替わらない');
  assert(Music.track.currentTime === 0, '戦闘BGMが曲頭から始まらない');
  Music.suspend();
}

// 12. 軍団差を伝える合成アクセントも、実曲の後ろで消えきらないかを測る。
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
  // 実曲が音楽の芯を担うので、アクセントは効果音より控えめでよい。
  // ただし修正前の0.0018程度まで沈むと編成差が消えるため、下限だけ守る。
  assert(loudest >= 0.005, `BGMの編成アクセントが小さすぎる: ${loudest.toFixed(4)}`);
}


// 13. 低音が「聞こえない帯域」に閉じ込められていないかを測る。
//     旧実装は足音・行進ベースの基音が32〜110Hz中心で、スマホの小型スピーカーは
//     この帯域をほぼ再生できない。音量を上げても解決しない（実際にオーナーの
//     実機で確認済み）。基音を実際に再生される帯域まで上げ、オクターブ上の
//     倍音を重ねているか（欠落基音の錯覚で低さを伝える設計になっているか）を見る。
{
  Sound.muted = false;
  // 将軍・アンデッド・術者は含めない編成にする。号令ラッパ等は元から音域が高く、
  // 混ざると「足音・行進ベースの音域」を正しく測れなくなるため。
  Music.desc = Music.describe(army([unit(), unit(), unit(), unit(), unit()]), { scene: 'battle' });
  let seed = 42;
  Music.rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  toneFreqs = [];
  assert(Music.start(), 'BGMを開始できない');
  for (let bar = 0; bar < 8; bar++) {
    for (let step = 0; step < 16; step++) Music.scheduleStep(step, bar * 2 + step * 0.1);
  }
  Music.suspend();
  assert(toneFreqs.length > 0, '音程を持つ音が1回も鳴っていない');
  // スマホの小型スピーカーが実用上再生できる下限のおおよその目安。
  const audibleFloor = 130;
  const highest = Math.max(...toneFreqs);
  assert(highest > audibleFloor,
    `足音・行進ベースが${audibleFloor}Hz未満に閉じ込められている（最高でも${highest.toFixed(1)}Hz）`);
}

console.log('✓ BGM: 頭数・昇進・種族・未払い・忠誠・警戒度が演奏へ接続、サボりが効く');
