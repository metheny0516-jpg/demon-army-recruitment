// 忠誠・給与から起きる戦闘中ハプニング。1体につき1戦闘1回まで。
const BATTLE_HAPPENINGS = [
  {
    id: "mutiny", name: "今ここで下剋上", kind: "friendly_fire", chance: 0.08,
    check(unit) { return !unit.unpaid && unit.loyalty < 25; },
    text(unit, target) { return `${unit.name}「勇者より先に、気に入らない奴をやる！」 ${target.name}へ襲いかかった！`; }
  },
  {
    id: "strike", name: "戦場ストライキ", kind: "skip", chance: 0.18,
    check(unit) { return unit.unpaid; },
    text(unit) { return `${unit.name}「給料が出るまで剣も出ません」 戦場の真ん中で座り込んだ！`; }
  },
  {
    id: "loaf", name: "露骨なサボり", kind: "skip", chance: 0.10,
    check(unit) { return unit.loyalty < 45; },
    text(unit) { return `${unit.name} は魔王が見ていないと思い、死んだふりをしている！`; }
  }
];
