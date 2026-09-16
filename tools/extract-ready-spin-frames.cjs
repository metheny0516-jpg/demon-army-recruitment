#!/usr/bin/env node
// Approved 3-species motion prototype -> transparent, game-ready frames.
// Keep this extraction in sync with motion-source/.../animation.js.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
let canvas;
try { canvas = require(process.env.CANVAS_MODULE || "@napi-rs/canvas"); }
catch (_) { canvas = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas"); }
const { createCanvas, Image } = canvas;

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("usage: node tools/extract-ready-spin-frames.cjs <prototype-dir>");
const root = path.resolve(__dirname, "..");

function asset(file, names) {
  const scope = { window: {} };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(sourceDir, file), "utf8"), scope);
  return names.map(name => scope.window[name]).find(Boolean);
}

function chroma(ctx, width, height) {
  const im = ctx.getImageData(0, 0, width, height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if ((r < 12 && g < 12 && b < 12) || (r > 130 && b > 100 && Math.min(r, b) - g > 65)) d[i + 3] = 0;
  }
  ctx.putImageData(im, 0, 0);
}

function keepLargest(ctx, width, height) {
  const im = ctx.getImageData(0, 0, width, height), d = im.data;
  const seen = new Uint8Array(width * height);
  let largest = [];
  for (let p = 0; p < seen.length; p++) {
    if (seen[p] || !d[p * 4 + 3]) continue;
    const stack = [p], part = [];
    seen[p] = 1;
    while (stack.length) {
      const k = stack.pop(); part.push(k); const x = k % width;
      for (const n of [x ? k - 1 : -1, x < width - 1 ? k + 1 : -1, k - width, k + width]) {
        if (n >= 0 && n < seen.length && !seen[n] && d[n * 4 + 3]) { seen[n] = 1; stack.push(n); }
      }
    }
    if (part.length > largest.length) largest = part;
  }
  const keep = new Uint8Array(seen.length);
  for (const p of largest) keep[p] = 1;
  for (let p = 0; p < keep.length; p++) if (!keep[p]) d[p * 4 + 3] = 0;
  ctx.putImageData(im, 0, 0);
}

function bounds(canvas) {
  const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, maxX = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (d[(y * canvas.width + x) * 4 + 3]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); bottom = y; }
  }
  if (bottom < 0) throw new Error("empty extracted frame");
  return { anchor: (minX + maxX) / 2, foot: bottom };
}

async function extract(id, file, globals, goblin) {
  const image = new Image();
  image.src = asset(file, globals);
  await image.decode();
  const source = createCanvas(image.width, image.height), sourceCtx = source.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0); chroma(sourceCtx, image.width, image.height);
  const cell = Math.floor(image.width / 3);
  const outDir = path.join(root, "assets/battle/units", id, "ready-spin");
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < 9; i++) {
    let raw;
    if (goblin) {
      const extra = i === 8 ? 20 : 0, width = Math.min(cell + 38, image.width - (i % 3) * cell), height = i === 5 ? cell - 22 : cell + extra;
      raw = createCanvas(460, 440);
      raw.getContext("2d", { willReadFrequently: true }).drawImage(source, (i % 3) * cell, Math.floor(i / 3) * cell - extra, width, height, 0, 0, width, height);
      keepLargest(raw.getContext("2d", { willReadFrequently: true }), raw.width, raw.height);
    } else {
      const lift = id === "slime" && i === 8 ? 78 : 0;
      raw = createCanvas(cell, cell + lift);
      raw.getContext("2d", { willReadFrequently: true }).drawImage(source, (i % 3) * cell, Math.floor(i / 3) * cell - lift, cell, cell + lift, 0, 0, cell, cell + lift);
    }
    const b = bounds(raw), frame = createCanvas(512, 512);
    frame.getContext("2d").drawImage(raw, Math.round(256 - b.anchor), Math.round(480 - b.foot));
    fs.writeFileSync(path.join(outDir, `${i}.webp`), await frame.encode("webp", 90));
  }
}

(async () => {
  await extract("goblin", "goblin-assets.js", ["GOBLIN_ATLAS"], true);
  await extract("slime", "slime-assets.js", ["SLIME_ATLAS"], false);
  await extract("zombie", "zombie-assets.js", ["ZOMBIE_ATLAS"], false);
})().catch(error => { console.error(error); process.exitCode = 1; });
