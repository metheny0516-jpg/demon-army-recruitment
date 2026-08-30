// 乱数などの小道具
const U = {
  rand() { return Math.random(); },
  randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  chance(p) { return Math.random() < p; },
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
};
