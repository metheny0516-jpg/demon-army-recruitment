// Existing CC0 recordings only: trim silence and match peaks. No synthesized layers.
const fs = require('fs');
const path = require('path');
const groups = {
  slash: ['starninjas-sword', [1, 4, 7]],
  blunt: ['antum-thwack', [1, 3, 10]],
  pierce: ['antum-thwack', [2, 4, 6]],
  guard: ['starninjas-clash', [1, 4, 7]],
};
const outDir = 'assets/sfx/recorded';
fs.mkdirSync(outDir, { recursive: true });
const manifest = {};
for (const [role, [pack, numbers]] of Object.entries(groups)) {
  manifest[role] = numbers.map((n, i) => {
    const source = `candidate-${pack}-${String(n).padStart(2, '0')}.wav`;
    const wav = fs.readFileSync(path.join('assets/sfx/candidates', source));
    let fmt, pcm;
    for (let p = 12; p + 8 <= wav.length;) {
      const size = wav.readUInt32LE(p + 4), name = wav.toString('ascii', p, p + 4);
      if (name === 'fmt ') fmt = wav.subarray(p + 8, p + 8 + size);
      if (name === 'data') pcm = wav.subarray(p + 8, p + 8 + size);
      p += 8 + size + (size % 2);
    }
    if (!fmt || !pcm || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 1 || fmt.readUInt16LE(14) !== 16) throw Error(source);
    const rate = fmt.readUInt32LE(4), samples = [];
    for (let p = 0; p < pcm.length; p += 2) samples.push(pcm.readInt16LE(p) / 32768);
    const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    let first = samples.findIndex(x => Math.abs(x) > peak * .012), last = samples.length - 1;
    while (last > first && Math.abs(samples[last]) < peak * .006) last--;
    first = Math.max(0, first - Math.round(rate * .002));
    last = Math.min(samples.length - 1, last + Math.round(rate * .012));
    const data = Buffer.alloc((last - first + 1) * 2);
    for (let i = first; i <= last; i++) {
      const fade = Math.min(1, (i - first) / (rate * .001), (last - i) / (rate * .008));
      data.writeInt16LE(Math.round(samples[i] * .85 / peak * fade * 32767), (i - first) * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); fmt.copy(header, 20, 0, 16); header.write('data', 36); header.writeUInt32LE(data.length, 40);
    const file = `${role}-${'abc'[i]}.wav`;
    fs.writeFileSync(path.join(outDir, file), Buffer.concat([header, data]));
    return { file, source, seconds: +(data.length / 2 / rate).toFixed(3) };
  });
}
fs.writeFileSync(path.join(outDir, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
