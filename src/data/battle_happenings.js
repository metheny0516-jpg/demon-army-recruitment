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

// F: 食料・特性・追加行動の組み合わせから起きる小さな失敗。
// 既存3件の抽選を優先。1体1戦1回・将軍による抑制はエンジン共通。
BATTLE_HAPPENINGS.push(
  {
    id: "hunger_taste", name: "非常食の品定め", kind: "skip", chance: 0.004,
    check(u) { return u.starved && u.traits.includes("hunger_demon"); },
    text(u) { return `${u.name}「飢えには慣れた。あの盾、食えるか？」 食べ方を考え込み、今回の攻撃を逃した！`; }
  },
  {
    id: "empty_lunch", name: "弁当箱の底", kind: "skip", chance: 0.004,
    check(u) { return u.starved && u.traits.includes("big_eater"); },
    text(u) { return `${u.name}「まだ一口くらい……」 空の弁当箱を探り、今回の攻撃に間に合わなかった！`; }
  },
  {
    id: "cook_forage", name: "戦場で献立変更", kind: "skip", chance: 0.004,
    check(u) { return u.starved && u.traits.includes("demon_cook"); },
    text(u) { return `${u.name}「食料不足なら現地調達です！」 足元の草の毒見に忙しく、今回の攻撃を休んだ！`; }
  },
  {
    id: "feast_belt", name: "宴の後のベルト", kind: "skip", chance: 0.004,
    check(u) { return u.feast && u.traits.includes("big_eater"); },
    text(u) { return `${u.name}「宴は最高だった。ベルトは限界だ」 腰を締め直し、今回の攻撃を休んだ！`; }
  },
  {
    id: "feast_receipt", name: "宴会費の精算", kind: "skip", chance: 0.004,
    check(u) { return u.feast && u.traits.includes("greedy"); },
    text(u) { return `${u.name}「宴会費は経費ですよね？」 領収書を数えていて、今回の攻撃を忘れた！`; }
  },
  {
    id: "chain_receipt", name: "追撃より小銭", kind: "skip", chance: 0.003, duringChain: true,
    check(u) { return u.chainDepth >= 3 && u.traits.includes("greedy"); },
    text(u) { return `${u.name}「追撃？ 先に今の金貨を数える！」 小銭に気を取られ、この一撃を取り逃した！`; }
  },
  {
    id: "chain_stagefright", name: "連鎖に出遅れ", kind: "skip", chance: 0.003, duringChain: true,
    check(u) { return u.chainDepth >= 3 && !u.traits.includes("greedy") && u.traits.includes("coward"); },
    text(u) { return `${u.name}「次、俺の番！？ 聞いてない！」 仲間の勢いに腰が引け、この一撃を取り逃した！`; }
  }
);
