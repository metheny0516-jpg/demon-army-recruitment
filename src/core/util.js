// 乱数などの小道具
const U = {
  // 乱数の入口は rand() ひとつ。pick / chance / randInt もここを通るので、
  // rand を差し替えれば（テストの固定値・戦闘の種）全部が揃って変わる。
  rand() { return Math.random(); },
  randInt(min, max) { return Math.floor(U.rand() * (max - min + 1)) + min; },
  pick(arr) { return arr[Math.floor(U.rand() * arr.length)]; },
  chance(p) { return U.rand() < p; },
  // 種から作る決定的な乱数（mulberry32）。同じ種で同じ戦闘を二度計算するために使う
  // （号令：途中まで同じ展開のまま、指示のあとだけ分岐させる）。
  seeded(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
};
