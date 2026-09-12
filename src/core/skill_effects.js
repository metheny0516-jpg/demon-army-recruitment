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

// 共通処理は対象の選択と既存APIへの接続だけ。継続効果の独自フックは作らない。
const CatalogEffects = {
  ally(c, exceptSelf = false) {
    return c.allies.find(a => a.id === c.cmd.targetId && c.onField(a) && (!exceptSelf || a !== c.unit))
      || c.lowestAlly(c.allies, exceptSelf ? c.unit : null);
  },
  say(c, text) {
    c.emit("note", { unitId: c.unit.id, text: [...text].slice(0, 28).join(""), cls: "trait" });
  },
  recoil(c, amount) {
    if (c.onField(c.unit) && amount > 0) c.applyDamage(c.unit, c.unit, amount, "splash", { label: "反動", incident: true });
  },
  minion(c) {
    const u = c.unit;
    return c.summon({ name: `${u.name}の分身`, race: u.race, tplId: u.tplId,
      maxHp: Math.max(1, Math.round(u.maxHp * 0.3)), atk: Math.max(1, Math.round(u.atk * 0.5)),
      def: 0, spd: u.spd, job: "臨時の手下" });
  }
};

Object.assign(SKILL_EFFECTS, {
  drain: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    // オーバーキルで過剰回復しない。heal は最大HP比を取る。
    const hp = t.hp, dealt = c.damage(t, 1, c.skill.name);
    if (c.onField(c.unit)) c.heal(c.unit, Math.max(0, Math.floor(Math.min(hp, dealt) * 0.3) - 1e-9) / c.unit.maxHp, c.skill.name);
  } },
  pierce: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    const raw = c.unit.atk * (0.9 + c.rand() * 0.2) * (c.unit.mods.dmgMult || 1);
    c.applyDamage(c.unit, t, Math.max(1, Math.round(raw)), "attack", { label: c.skill.name });
  } },
  double: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    for (let i = 0; i < 2 && c.onField(t) && c.onField(c.unit); i++) c.damage(t, 0.7, c.skill.name);
  } },
  execute: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    if (t.hp <= t.maxHp * 0.3) c.damage(t, 3, c.skill.name);
    else {
      CatalogEffects.say(c, "まだ早い！ 反撃を受けた");
      c.act(t, c.enemies, c.allies, c.round, { target: c.unit, label: "反撃", isExtra: true });
    }
  } },
  quake: { resolve(c) {
    for (const t of c.enemies.filter(c.onField).sort((a, b) => a.spd - b.spd)) {
      if (!c.onField(c.unit)) break;
      if (c.onField(t)) c.damage(t, 0.5, c.skill.name);
    }
    const rear = c.allies.filter(c.onField).slice(-1)[0];
    if (rear) c.applyDamage(c.unit, rear, Math.max(1, Math.round(rear.maxHp * 0.1)), "splash", { label: "地響きの巻き添え", incident: true });
  } },
  mend_all: { resolve(c) {
    for (const a of c.allies.filter(c.onField)) c.heal(a, 0.15, c.skill.name);
  } },
  sacrifice: { resolve(c) {
    const t = CatalogEffects.ally(c, true); if (!t) return;
    const amount = Math.min(c.unit.hp - 1, Math.floor(c.unit.hp / 2), t.maxHp - t.hp);
    if (amount <= 0) return;
    c.unit.hp -= amount;
    c.emit("note", { unitId: c.unit.id, text: `HP${amount}を分けた`, hp: c.unit.hp, maxHp: c.unit.maxHp, cls: "trait" });
    c.heal(t, (amount - 1e-9) / t.maxHp, c.skill.name);
  } },
  wall_all: { immediate(c) {
    for (const a of c.allies.filter(c.onField)) a.flags.guarding = true;
    CatalogEffects.say(c, "全員で壁を作った");
  } },
  gamble: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    if (c.chance(0.5)) c.damage(t, 3, c.skill.name);
    else { CatalogEffects.say(c, "裏目だ！ 自分に跳ね返った"); CatalogEffects.recoil(c, c.unit.atk); }
  } },
  rally_fallen: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    const n = c.allies.filter(a => !a.alive && !a.flags.summoned).length;
    c.damage(t, n ? 1 + n * 0.5 : 0.5, c.skill.name);
  } },
  summon_minion: { resolve(c) {
    if (c.unit.flags.summon_minion_used) { CatalogEffects.say(c, "分身はもう呼べない"); return; }
    c.unit.flags.summon_minion_used = true;
    CatalogEffects.minion(c);
  } },
  disarm: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    t.atk = Math.max(1, t.atk - 3);
    CatalogEffects.say(c, "武器をはじいた。攻撃力が3低下");
  } },
  cleanse: { immediate(c) {
    const t = CatalogEffects.ally(c); if (!t) return;
    for (const key of ["stunned", "charmed", "burn"]) delete t.flags[key];
    CatalogEffects.say(c, "気付けで足止め・魅了・燃焼を解除");
  } },
  rescue: { immediate(c) {
    const t = CatalogEffects.ally(c, true); if (!t) return;
    c.moveBack(c.allies, t);
    c.unit.flags.covering = t.id; c.unit.flags.coverRatio = 0.6;
    CatalogEffects.say(c, "仲間を後ろへ。身代わりを引き受けた");
  } },
  burn_touch: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    c.damage(t, 0.5, c.skill.name);
    if (c.onField(t)) t.flags.burn = { at: c.round + 1, source: c.unit, parentEvent: null };
  } },
  shatter_guard: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    t.flags.guarding = false;
    c.damage(t, 0.8, c.skill.name);
    CatalogEffects.say(c, "守りの構えを崩した");
  } },
  spirit_gift: { resolve(c) {
    const t = CatalogEffects.ally(c, true); if (t) c.gainSpirit(t, 1, c.skill.name);
  } },
  finishing_loot: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    c.damage(t, 0.8, c.skill.name);
    if (!t.alive) c.gainBattleResource(c.unit, "gold", 1, c.skill.name, null);
  } },
  flank: { resolve(c) {
    const t = c.enemies.filter(c.onField).slice(-1)[0]; if (!t) return;
    c.damage(t, 1.2, c.skill.name);
    if (c.onField(c.unit)) c.moveBack(c.allies, c.unit);
  } },
  siphon_guard: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    delete t.flags.buff;
    c.unit.flags.guarding = true;
    CatalogEffects.say(c, "敵の鼓舞を消し、守りに転じた");
  } }
});

// 痕跡は人物uidで照合する。戦場の一時idや同名人物から履歴を推測しない。
Object.assign(SKILL_EFFECTS, {
  mourning: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    const dead = (c.options.departed || []).find(d => d.cause === "fallen" && d.race && d.race === c.unit.race);
    if (dead) CatalogEffects.say(c, `${[...(dead.name || "仲間")].slice(0, 23).join("")}の仇！`);
    c.damage(t, dead ? 1.5 : 1, c.skill.name);
  } },
  carried_debt: { immediate(c) {
    // 現行run.jsのcarriedはobject=null。担ぎ手が未記録なら恩人を捏造しない。
    const traces = c.options.traces || [];
    const trace = c.unit.uid && [...traces].reverse().find(t => t.kind === "carried" && t.subject === c.unit.uid
      && t.object && c.allies.some(a => a.uid === t.object && a !== c.unit && c.onField(a)));
    const carrier = trace && c.allies.find(a => a.uid === trace.object && a !== c.unit && c.onField(a));
    if (!carrier) { CatalogEffects.say(c, "担ぎ手の記録がないか、ここにいない"); return; }
    c.unit.flags.covering = carrier.id; c.unit.flags.coverRatio = 0.6;
    CatalogEffects.say(c, "あの時の恩を返す。今度は私が守る");
  } },
  veteran: { resolve(c) {
    const t = c.pickEnemy(); if (!t) return;
    const count = c.unit.uid ? (c.options.traces || []).filter(t => t.kind === "downed" && t.subject === c.unit.uid).length : 0;
    c.damage(t, 1 + Math.min(5, count) * 0.1, c.skill.name);
  } },
  relic_weight: { immediate(c) {
    const count = (c.options.relics || []).length;
    if (!count) { CatalogEffects.say(c, "まだ預かる遺物はない"); return; }
    for (const a of c.allies.filter(c.onField)) {
      const mult = 1 + count * 0.05;
      // 強い鼓舞を弱いもので上書きしない。期限を延長せず、今Rだけ置き換える。
      if (!a.flags.buff || a.flags.buff.until < c.round || a.flags.buff.mult < mult)
        a.flags.buff = { mult, until: c.round, name: c.skill.name };
    }
    CatalogEffects.say(c, "預かった遺物が背を押す");
  } },
  carried_resolve: { immediate(c) {
    const carried = c.unit.uid && (c.options.traces || []).some(t => t.kind === "carried" && t.subject === c.unit.uid);
    const t = CatalogEffects.ally(c, true);
    if (!carried || !t) { CatalogEffects.say(c, "担がれた記憶か、守る仲間がない"); return; }
    // 担ぎ手は未記録でも、自分が担がれた事実は確定している。
    c.unit.flags.covering = t.id; c.unit.flags.coverRatio = 0.4;
    CatalogEffects.say(c, "担がれる痛みは知っている。後ろへ");
  } }
});
