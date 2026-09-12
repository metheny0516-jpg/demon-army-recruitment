// 技の効き（kind）と敵の役割（role）の登録所。battle.js は kind / role を知らないとき、ここを見る。
// battle.js を触らずに技と行動パターンを増やすための口（2026-09-12）。
//
// SKILL_EFFECTS[kind] = {
//   resolve(ctx)     本人の手番で解決する（strike/aoe/heal 等と同じ扱い）
//   immediate(ctx)   指示の直後に効かせたい（かばう・鼓舞のような構え）。書けば本人の手番は「身構える」だけ
// }
// ENEMY_ROLES[role] = {
//   plan(ctx, nextRound)  次のラウンドの行動を返す { kind, targetId?, intent?, text? }。undefined なら既定の規則に任せる。
//                        intent は指示窓の予告（big/heal/aoe/guard か独自の文字列）。text は予告の一文。
//   run(ctx, plan)        手番で計画を実行。true を返せば通常攻撃はしない。undefined なら既定の kind 処理に任せる。
// }
//
// ctx: { unit, skill, cmd:{id,targetId}, allies, enemies, living, round, options（traces/relics/departed を含む）,
//        onField, timeline, U, rand, chance, pick, playerUnits, enemyUnits,
//        applyDamage(attacker, target, amount, kind, opts), act(unit, allies, enemies, round, opts) → dmg,
//        damage(target, mult, label) → dmg（通常攻撃の式で label 付き）, heal(target, ratio, label) → amount,
//        note(text, cls), emit(type, data), emitCausal(type, data, parent),
//        pickTarget(unit, living, round), pickEnemy(), lowestAlly(allies, except), moveBack(list, target),
//        gainBattleResource(unit, "gold", n, label, parent), gainSpirit(unit, n, reason),
//        summon(spec, parent)（spec: { name, race, tplId, maxHp, atk, def, spd, job }。本人の側に現れる） }
//
// 乱数は ctx.rand / ctx.chance / ctx.pick だけを使う（Math.random を直接呼ぶと同じ種で展開が変わる）。
// 新しい kind の技は src/data/skills.js の SKILLS か、カタログ src/data/skills_catalog.js に置く。
const SKILL_EFFECTS = {};
const ENEMY_ROLES = {};

if (typeof module !== "undefined") module.exports = { SKILL_EFFECTS, ENEMY_ROLES };
