// オリジナル戦闘効果音を決定的DSPで生成する。外部音源・学習済み素材は使わない。
//   node tools/generate-sfx.js
const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = path.join('assets', 'sfx');
fs.mkdirSync(OUT, { recursive: true });

function rngFor(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const make = seconds => new Float64Array(Math.ceil(seconds * SR));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function add(dst, src, gain = 1, offsetSeconds = 0) {
  const offset = Math.floor(offsetSeconds * SR);
  for (let i = 0; i < src.length && i + offset < dst.length; i++) dst[i + offset] += src[i] * gain;
}

function envelope(t, attack, decay, shape = 1) {
  const rise = attack <= 0 ? 1 : Math.min(1, t / attack);
  return Math.pow(rise, .55) * Math.exp(-Math.pow(Math.max(0, t - attack) / decay, shape));
}

function noiseLayer(seconds, rng, opts = {}) {
  let data = make(seconds);
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  if (opts.lowpass) data = lowpass(data, opts.lowpass);
  if (opts.highpass) data = highpass(data, opts.highpass);
  if (opts.crush) data = bitCrush(data, opts.crush, opts.bits || 10);
  const attack = opts.attack || .0004;
  const decay = opts.decay || seconds / 3;
  for (let i = 0; i < data.length; i++) data[i] *= envelope(i / SR, attack, decay, opts.shape || 1);
  return data;
}

function lowpass(input, cutoff) {
  const out = new Float64Array(input.length);
  const a = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
  let y = 0;
  for (let i = 0; i < input.length; i++) { y += a * (input[i] - y); out[i] = y; }
  return out;
}

function highpass(input, cutoff) {
  const low = lowpass(input, cutoff);
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] - low[i];
  return out;
}

function bitCrush(input, hold, bits) {
  const out = new Float64Array(input.length);
  const steps = 2 ** bits;
  let value = 0;
  for (let i = 0; i < input.length; i++) {
    if (i % hold === 0) value = Math.round(input[i] * steps) / steps;
    out[i] = value;
  }
  return out;
}

function modeBank(dst, modes, rng, offset = 0) {
  const start = Math.floor(offset * SR);
  for (const mode of modes) {
    let phase = rng() * Math.PI * 2;
    const freq = mode.freq * (1 + (rng() - .5) * (mode.jitter || .012));
    for (let i = start; i < dst.length; i++) {
      const t = (i - start) / SR;
      const env = envelope(t, mode.attack || .0005, mode.decay, mode.shape || 1);
      phase += 2 * Math.PI * freq / SR;
      dst[i] += Math.sin(phase) * env * mode.amp;
    }
  }
}

function pitchBody(dst, startFreq, endFreq, decay, amp, offset = 0, type = 'sine') {
  const start = Math.floor(offset * SR);
  let phase = 0;
  for (let i = start; i < dst.length; i++) {
    const t = (i - start) / SR;
    const p = 1 - Math.exp(-t / Math.max(.008, decay * .28));
    const freq = startFreq * Math.pow(endFreq / startFreq, clamp(p, 0, 1));
    phase += 2 * Math.PI * freq / SR;
    const wave = type === 'triangle' ? 2 / Math.PI * Math.asin(Math.sin(phase)) : Math.sin(phase);
    dst[i] += wave * envelope(t, .0015, decay, 1.1) * amp;
  }
}

function sweptNoise(seconds, rng, fromFreq, toFreq, decay) {
  const out = make(seconds);
  let low = 0, band = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const p = clamp(t / Math.max(.01, seconds * .72), 0, 1);
    const center = fromFreq * Math.pow(toFreq / fromFreq, p);
    const f = 2 * Math.sin(Math.PI * Math.min(center, SR * .22) / SR);
    const input = rng() * 2 - 1;
    low += f * band;
    const high = input - low - .55 * band;
    band += f * high;
    out[i] = band * envelope(t, .0002, decay, .9);
  }
  return out;
}

function reflections(buffer, taps) {
  const dry = buffer.slice();
  for (const [delay, gain] of taps) add(buffer, dry, gain, delay);
}

function finish(buffer, targetRms = .18, drive = 1.7, cutoff = 13500) {
  // DC・超低域を除き、非線形飽和で各層をひとつの音へ接着する。
  let data = highpass(buffer, 24);
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i] * drive);
  // 非線形処理で生じる不要な超高域を落とす。二段で12dB/oct相当。
  data = lowpass(lowpass(data, cutoff), cutoff);
  const tail = Math.min(data.length, Math.floor(.035 * SR));
  for (let i = 0; i < tail; i++) data[data.length - 1 - i] *= i / tail;
  let sum = 0;
  for (const x of data) sum += x * x;
  const rms = Math.sqrt(sum / data.length) || 1;
  const gain = Math.min(2.8, targetRms / rms);
  let peak = 0;
  for (let i = 0; i < data.length; i++) { data[i] *= gain; peak = Math.max(peak, Math.abs(data[i])); }
  if (peak > .96) for (let i = 0; i < data.length; i++) data[i] *= .96 / peak;
  return data;
}

function basun(variant) {
  const rng = rngFor(1100 + variant);
  const out = make(.34 + variant * .008);
  add(out, noiseLayer(.055, rng, { highpass: 320, lowpass: 7800, decay: .012, crush: 2, bits: 11 }), .72);
  add(out, noiseLayer(.22, rng, { lowpass: 1100, decay: .075, crush: 2, bits: 10 }), .34, .003);
  pitchBody(out, 205 + variant * 7, 52 + variant * 2, .115, .72, .003);
  modeBank(out, [
    { freq: 265, amp: .34, decay: .075 }, { freq: 438, amp: .2, decay: .058 },
    { freq: 710, amp: .1, decay: .038 }
  ], rng, .002);
  add(out, noiseLayer(.035, rng, { highpass: 900, lowpass: 5000, decay: .009 }), .24, .014 + variant * .001);
  reflections(out, [[.021, .12], [.043, .055]]);
  return finish(out, .19, 1.85, 11000);
}

function gachan(variant) {
  const rng = rngFor(2200 + variant);
  const out = make(.58 + variant * .018);
  add(out, noiseLayer(.05, rng, { highpass: 1200, lowpass: 12000, decay: .011, crush: 2, bits: 10 }), .72);
  pitchBody(out, 150, 82, .11, .26, .001, 'triangle');
  const ratios = [1, 1.51, 2.12, 2.93, 4.06, 5.61, 7.04];
  const base = 390 + variant * 17;
  modeBank(out, ratios.map((ratio, i) => ({
    freq: base * ratio, amp: .34 / (1 + i * .43), decay: .19 + (i % 3) * .075,
    shape: .82, jitter: .025
  })), rng);
  for (let hit = 0; hit < 2; hit++) {
    const offset = .052 + hit * (.055 + variant * .003);
    add(out, noiseLayer(.03, rng, { highpass: 1700, lowpass: 11000, decay: .007 }), .26, offset);
    modeBank(out, [
      { freq: base * (2.4 + hit * .7), amp: .13, decay: .09, jitter: .04 },
      { freq: base * (4.7 + hit), amp: .08, decay: .13, jitter: .04 }
    ], rng, offset);
  }
  reflections(out, [[.031, .075], [.071, .035]]);
  return finish(out, .145, 1.55, 15000);
}

function zushi(variant) {
  const rng = rngFor(3300 + variant);
  const out = make(.5 + variant * .014);
  add(out, noiseLayer(.04, rng, { highpass: 500, lowpass: 6500, decay: .009, crush: 3, bits: 9 }), 1.08);
  // 鋭い接触の直後、6ms遅れて低域の重量が来る。
  pitchBody(out, 128 + variant * 5, 34 + variant, .23, .58, .006);
  add(out, noiseLayer(.31, rng, { lowpass: 620, decay: .09, crush: 3, bits: 9 }), .32, .006);
  modeBank(out, [
    { freq: 146 + variant * 3, amp: .27, decay: .24, shape: .88 },
    { freq: 219 + variant * 5, amp: .16, decay: .17 },
    { freq: 326 + variant * 8, amp: .09, decay: .105 }
  ], rng, .006);
  add(out, noiseLayer(.026, rng, { highpass: 900, lowpass: 5000, decay: .006 }), .22, .024);
  reflections(out, [[.029, .16], [.061, .075], [.103, .035]]);
  return finish(out, .145, 1.72, 9000);
}

function zuba(variant) {
  const rng = rngFor(4400 + variant);
  const out = make(.29 + variant * .009);
  add(out, sweptNoise(.17, rng, 7600 - variant * 350, 620 + variant * 45, .052), .78);
  add(out, noiseLayer(.028, rng, { highpass: 2300, lowpass: 12500, decay: .006, crush: 2, bits: 11 }), .34);
  pitchBody(out, 2600 - variant * 80, 175 + variant * 9, .075, .24, .001, 'triangle');
  pitchBody(out, 245, 88, .095, .38, .018);
  modeBank(out, [
    { freq: 930 + variant * 31, amp: .13, decay: .055 },
    { freq: 1570 + variant * 43, amp: .08, decay: .042 }
  ], rng, .008);
  add(out, noiseLayer(.06, rng, { highpass: 700, lowpass: 4200, decay: .014 }), .2, .045);
  reflections(out, [[.017, .08], [.038, .035]]);
  return finish(out, .16, 1.65, 16000);
}

function wavBytes(samples) {
  const dataSize = samples.length * 2;
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataSize, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.round(clamp(samples[i], -1, 1) * 32767), 44 + i * 2);
  return out;
}

const families = { basun, gachan, zushi, zuba };
for (const [name, build] of Object.entries(families)) {
  for (let variant = 0; variant < 3; variant++) {
    const samples = build(variant);
    const suffix = String.fromCharCode(97 + variant);
    const file = path.join(OUT, `${name}-${suffix}.wav`);
    fs.writeFileSync(file, wavBytes(samples));
    let sum = 0, peak = 0;
    for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
    const rms = Math.sqrt(sum / samples.length);
    console.log(`${file}  ${(samples.length / SR).toFixed(3)}s  peak ${peak.toFixed(3)}  rms ${rms.toFixed(3)}`);
  }
}
