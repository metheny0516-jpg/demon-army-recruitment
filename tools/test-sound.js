const fs = require('fs'), vm = require('vm');

for (const family of ['basun', 'gachan', 'zushi', 'zuba']) {
  for (const variant of ['a', 'b', 'c']) {
    const file = `assets/sfx/${family}-${variant}.wav`;
    const wav = fs.readFileSync(file);
    if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error(`WAVヘッダが不正: ${file}`);
    }
    if (wav.readUInt32LE(24) !== 44100 || wav.readUInt16LE(34) !== 16) {
      throw new Error(`WAV形式が不正: ${file}`);
    }
  }
}

let started = 0;
let samplePlays = 0;
class AudioParam {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}
class AudioNode {
  connect(node) { return node; }
  start() { started++; }
  stop() { if (this.onended) this.onended(); }
}
class GainNode extends AudioNode { constructor() { super(); this.gain = new AudioParam(); } }
class OscillatorNode extends AudioNode {
  constructor() { super(); this.frequency = new AudioParam(); this.detune = new AudioParam(); }
}
class BufferSourceNode extends AudioNode { constructor() { super(); this.buffer = null; } }
class FilterNode extends AudioNode {
  constructor() { super(); this.frequency = new AudioParam(); this.type = 'lowpass'; }
}
class AudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.state = 'running'; }
  createGain() { return new GainNode(); }
  createOscillator() { return new OscillatorNode(); }
  createBufferSource() { return new BufferSourceNode(); }
  createBiquadFilter() { return new FilterNode(); }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  resume() { return Promise.resolve(); }
}
class AudioElement {
  constructor(src = '') { this.src = src; this.volume = 1; this.playbackRate = 1; this.currentTime = 0; }
  load() {}
  cloneNode() { return new AudioElement(this.src); }
  addEventListener() {}
  play() { samplePlays++; return Promise.resolve(); }
  pause() {}
}

const store = {};
const ctx = {
  console, Math,
  window: { AudioContext },
  Audio: AudioElement,
  // 重ねて鳴らす見せ場の音がタイマーを使う。ブラウザと同じく即時実行で代用する。
  setTimeout: fn => { fn(); return 0; },
  clearTimeout: () => {},
  localStorage: {
    getItem: key => key in store ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); }
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/ui/sound.js', 'utf8'), ctx, { filename: 'sound.js' });
const Sound = vm.runInContext('Sound', ctx);

Sound.load();
if (Sound.volume !== 0.55) throw new Error(`初期音量が不正: ${Sound.volume}`);
if (!Sound.unlock() || !Sound.ctx || !Sound.master) throw new Error('AudioContextを初期化できない');
if (Sound.samples.size !== 14) throw new Error(`WAVを事前読込できない: ${Sound.samples.size}`);
for (const url of Sound.samples.keys()) {
  if (!fs.existsSync(url)) throw new Error(`実録素材が見つからない: ${url}`);
}
for (const tplId of ['swordsman', 'ogre', 'archer', 'shield']) {
  Sound.stopAll();
  Sound.battle({ type: 'attack' }, { tplId, speed: 4 });
  const audio = [...Sound.media][0];
  if (!Sound.PHYSICAL_SAMPLES.includes(audio.src)) throw new Error(`攻撃音の割当違い: ${tplId}`);
  if (audio.playbackRate > 1) throw new Error('倍速で攻撃音が軽くなる');
}
Sound.stopAll();
const magicBefore = samplePlays;
Sound.battle({ type: 'attack' }, { attackKind: 'magic' });
if (samplePlays !== magicBefore) throw new Error('魔法で打撃音が鳴る');
Sound.physicalSeq = 0;
for (const expected of [...Sound.PHYSICAL_SAMPLES, ...Sound.PHYSICAL_SAMPLES]) {
  Sound.stopAll(); Sound.cue('attack');
  if ([...Sound.media][0].src !== expected) throw new Error('8・9の交互再生が崩れた');
}
for (let i = 0; i < 12; i++) Sound.cue('attack');
if (Sound.media.size > 4) throw new Error('同時発音数が無制限');

for (const cue of ['click', 'confirm', 'hire', 'shuffle', 'dismiss', 'deploy', 'round', 'attack', 'magic', 'death',
  'revive', 'heal', 'guard', 'synergy', 'promotion', 'incident', 'final', 'win', 'lose', 'skip', 'mormo']) {
  Sound.cue(cue, { emphasis: 3, id: 'general_command' });
}
if (started < 20) throw new Error(`生成された音が少なすぎる: ${started}`);
if (samplePlays < 2) throw new Error(`WAV攻撃音が再生されない: ${samplePlays}`);

// 見せ場（OVERKILL・伝播）に音が付いていること。段が深いほど強く・重ねて鳴る。
// 新しい合成音は作らず、オーナー選定済みの打撃原音を使う契約もここで縛る。
{
  const seen = [];
  const realPlay = Sound.playSample.bind(Sound);
  Sound.playSample = (family, data) => { seen.push({ family, boost: (data && data.boost) || 1 }); return realPlay(family, data); };
  Sound.muted = false;

  Sound.battle({ type: 'overkill', percent: 40, emphasis: 1 }, {});
  const small = seen.length;
  if (small < 1) throw new Error('小さなOVERKILLにも音が要る');

  seen.length = 0;
  Sound.battle({ type: 'overkill', percent: 320, emphasis: 3 }, {});
  if (seen.length <= small) throw new Error('大きなOVERKILLで音が重ならない');
  if (!seen.every(x => x.family === 'physical')) throw new Error('見せ場の音は選定済みの打撃原音を使うこと');
  const loud = Math.max(...seen.map(x => x.boost));

  seen.length = 0;
  Sound.battle({ type: 'trait_trigger', traitId: 'overload', chainDepth: 5 }, {});
  if (!seen.length) throw new Error('伝播に音が付いていない');
  const deep = Math.max(...seen.map(x => x.boost));

  seen.length = 0;
  Sound.battle({ type: 'trait_trigger', traitId: 'overload', chainDepth: 2 }, {});
  const shallow = Math.max(...seen.map(x => x.boost));
  if (!(deep > shallow)) throw new Error(`連鎖が深いほど強く鳴らない: 浅${shallow} 深${deep}`);
  if (!(loud > 1)) throw new Error('大きなOVERKILLで音量が上がらない');

  seen.length = 0;
  Sound.battle({ type: 'trait_trigger', traitId: 'pickpocket' }, {});
  if (seen.length) throw new Error('伝播以外の特性で打撃音を鳴らさない');

  Sound.playSample = realPlay;
}

// 勝利曲は倍速にしても最後の和音まで同じ長さで鳴る。
{
  const original = Sound.tone;
  const notes = [];
  Sound.tone = (freq, duration, options = {}) => notes.push({ freq, duration, delay: options.delay || 0 });
  Sound.cue('win', {speed: 1});
  const normal = JSON.stringify(notes);
  const end = Math.max(...notes.map(n => n.duration + n.delay));
  notes.length = 0;
  Sound.cue('win', {speed: 4});
  if (JSON.stringify(notes) !== normal || end < 3 || end > 3.5) throw new Error('勝利曲の長さが不正');
  Sound.tone = original;
}
Sound.setVolume(0.35);
if (store.maou_volume !== '0.35') throw new Error('音量を保存できない');
const beforeMute = started;
Sound.setMuted(true);
Sound.cue('win');
if (started !== beforeMute) throw new Error('ミュート中に音を生成した');
if (store.maou_muted !== '1') throw new Error('ミュート設定を保存できない');

console.log('✓ 効果音21種・衝撃WAV12種・モルモ発話音・音量保存・ミュート・見せ場の打撃音（段で強くなる）');
