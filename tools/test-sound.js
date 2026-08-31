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
if (Sound.samples.size !== 12) throw new Error(`WAVを事前読込できない: ${Sound.samples.size}`);

for (const cue of ['click', 'confirm', 'hire', 'shuffle', 'dismiss', 'deploy', 'round', 'attack', 'magic', 'death',
  'revive', 'heal', 'guard', 'synergy', 'promotion', 'incident', 'final', 'win', 'lose', 'skip']) {
  Sound.cue(cue, { emphasis: 3, id: 'general_command' });
}
if (started < 20) throw new Error(`生成された音が少なすぎる: ${started}`);
if (samplePlays < 2) throw new Error(`WAV攻撃音が再生されない: ${samplePlays}`);

Sound.setVolume(0.35);
if (store.maou_volume !== '0.35') throw new Error('音量を保存できない');
const beforeMute = started;
Sound.setMuted(true);
Sound.cue('win');
if (started !== beforeMute) throw new Error('ミュート中に音を生成した');
if (store.maou_muted !== '1') throw new Error('ミュート設定を保存できない');

console.log('✓ 効果音20種・衝撃WAV12種・音量保存・ミュート');
