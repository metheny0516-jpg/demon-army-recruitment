// CHAIN V2の構造化stepを、戦闘中・スキップ・戦果で同じ文言へ変換する。
// raw timelineのtextは表示契約ではないため参照しない。
const ChainViewUI = {
  stepLabel(step) {
    const effect = step && step.effect || {};
    const ability = (step && step.declaredBy && step.declaredBy.abilityName)
      || (step && step.abilityName) || "";
    const unit = effect.resource === "gold" ? "G"
      : effect.resource === "soul" ? "魂" : (effect.resource || "");
    let action;
    if (effect.type === "attack" || effect.type === "splash") action = effect.label || "攻撃";
    else if (effect.type === "resource_gain") action = `${effect.label || ability || "獲得"}${effect.amount != null ? ` +${effect.amount}${unit}` : ""}`;
    else if (effect.type === "resource_forfeit") action = `${effect.label || ability || "没収"}${effect.amount != null ? ` -${effect.amount}${unit}` : ""}`;
    else if (effect.type === "resource_consume") action = `${effect.label || ability || "消費"}${effect.amount != null ? ` ${effect.amount}${unit}` : ""}`;
    else if (effect.type === "summon") action = `${effect.summonedName || effect.targetName || "援軍"}を召喚`;
    else if (effect.type === "revive") action = `${effect.targetName || "味方"}を蘇生`;
    else if (effect.type === "heal") action = `${effect.targetName || "味方"}を回復`;
    else if (effect.type === "momentum") action = "戦意上昇";
    else if (effect.type === "survive") action = `${effect.targetName || "味方"}が生存`;
    else if (effect.type === "incident") action = effect.label || ability || "行動中止";
    else action = effect.label || ability || effect.type || "反応";
    return step && step.declaredBy && ability ? `《${ability}》による${action}`
      : (ability && !action.includes(ability) ? `《${ability}》 ${action}` : action);
  }
};

if (typeof module !== "undefined") module.exports = { ChainViewUI };
