// 技のカタログ（まだ誰にも割り当てていない技・行動パターン）。形は src/data/skills.js の SKILLS と同じ。
// 誰がいつ使うかは後で決める（species は空のままでよい）。battle.js は SKILLS と SKILL_CATALOG の両方から id を引く。
const SKILL_CATALOG = {};

if (typeof module !== "undefined") module.exports = { SKILL_CATALOG };
