// 立ち絵（履歴書の証明写真）を持つモンスターの一覧。
//
// 絵を追加する手順は2つだけ:
//   1. assets/monsters/{id}.png を置く（id は monsters.js の id と同じ）
//   2. この配列に id を足す
//
// ここに載っていない種族は絵文字で表示される。載せ忘れても壊れない。
// 逆に、載っているのにファイルが無い場合も自動的に絵文字へ落ちる。
//
// 画像の仕様: 768×1024（3:4）、80KB以下、顔は上から55%以内に収める
// （戦闘画面では上部を正方形に切り抜いて使うため）。
const PORTRAITS = [
  "goblin",
  "slime",
  "king_slime",
  "kobold",
  "orc",
  "skeleton",
  "zombie",
  "imp",
  "mage",
  "necromancer",
  "ogre",
];

// イベント吹き出し専用の全身表情差分。存在する差分だけを宣言し、
// 未制作・読込失敗時は通常の履歴書絵（さらに失敗すれば絵文字）へ戻す。
const EVENT_EXPRESSIONS = {
  goblin: ["surprise", "smirk", "tears"],
  slime: ["surprise", "smirk", "tears"],
  king_slime: ["surprise", "smirk", "tears"],
  kobold: ["surprise", "smirk", "tears"],
};
