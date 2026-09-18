# チケット E：技と敵の行動の見た目（演出プリセット）（2026-09-12）

現状：戦闘の演出は「通常攻撃」のためのもの（近接の斬撃・遠隔の矢／石／魔法の弾、被弾の衝撃、まもる、蘇生、OVERKILL の5枚のスプライト）。
技17＋上位技8＋カタログ31＋敵の役14の行動は、**どれも通常攻撃と同じ見た目**か、字幕と数字だけ。
「振り下ろす」と「たたかう」が同じ絵では、選んだ手応えが返ってこない。

方針：技ごとに絵を描かない。**演出プリセット（fx）を10種前後**作り、技・行動の kind から引く。データに `fx` を書けば新しい技も自動で絵が付く。

## 0. 分担

| 誰 | 何 | 触るファイル |
|---|---|---|
| **Claude**（先） | エンジンのイベントに `skillId` と `fx` を載せる。kind → fx の既定表 | `src/core/battle.js`、`src/data/skills.js`（`fx` 欄）、`src/core/skill_effects.js`（カタログの既定 fx。中身は触らない） |
| **CodeX** | 演出スプライト10枚（image_gen）と CSS のプリセット定義 | `assets/battle/effects/*.webp`（新規10枚）、`src/battlefield.css`（`.bu-vfx.fx-*`、`.projectile-*` の追加）、`docs/BATTLE_FX_PRESETS.md`（新） |
| **Opus** | 描画側の配線：イベントの `fx` を読んでプリセットを再生。全体技の同時ヒット、味方対象、自分対象、召喚・拘束・魅惑・鼓舞の見せ方。余韻の統一 | `src/ui/battle_scene.js`、`src/styles.css`（色・字幕のクラス）、`tools/browser-tests/skill-fx.js`（新）、`run-all.sh` 登録 |

順序：Claude → CodeX と Opus は並行可（Opus はスプライトが無くても CSS のプレースホルダ色で配線できる。CodeX の絵が入れば差し替えるだけ）。

## 1. プリセット（fx）10種

| fx | 使う技・行動 | 絵（CodeX） | 動き（Opus） |
|---|---|---|---|
| `heavy` | 振り下ろす・薙ぎ払い・突進・ぶちかまし・敵の大技 | 太い衝撃の亀裂、白橙 | 溜め（windup を1.5倍）→ 一撃で画面が小さく揺れる。数字は `.big` |
| `slash_multi` | 二連打・血の雄叫び・集団戦法の追撃 | 斬撃2本の重ね | 短い間隔で2回、数字も2つ |
| `fire` | 火球・大火球・置き火・燃焼 | 炎の弾＋着弾の火花（`projectile-fire`） | 全体なら全員へ同時に着弾、燃焼は札の下に小さな炎を残す（次ラウンド頭まで） |
| `dark` | 死の脈動・死者の手・魂吸い・呪い・魅了 | 紫黒の波紋 | 全体は中央から広がる波紋、単体は相手の足元から立ち上がる |
| `holy` | 配り薬・回復・癒やし（敵の僧）・気付け | 淡い金の光の柱 | 対象の頭上から降りる。数字は緑 `+n` |
| `nature` | 粘りつく・腐敗の一噛み・鈍化・毒 | 緑の粘液／蔦 | 相手に巻き付いて残る（拘束中は札に小さく残す） |
| `wind` | 疾風・急降下・かく乱・回り込み・敵の弓 | 風の筋（`projectile-wind`） | 速い。使用者が一瞬消えて相手の前に現れる（急降下） |
| `aura` | 鬨の声・隊長の号令・鼓舞・狂乱・遺物の重み | 足元の光の輪、色は側で変える | 対象全員の足元に同時に輪、1ラウンド残る（`flags.buff` の間） |
| `shield` | 骨の壁・かばう・総員防壁・敵の盾役の守り | 半透明の盾の面 | かばった瞬間に盾役の前へ出る。守られている敵は狙い選び中に薄い盾 |
| `summon` | 臨時分身・呼び手・大召集・蘇生 | 既存 `revive.webp` を流用＋煙 | 現れる位置に煙 → 札が浮き上がる（既存の summon-rise） |

既存の `slash`（近接通常）、`impact`（被弾）、`guard`（まもる）、`revive`、`overkill` はそのまま。`charm`（魅惑）は `dark` に「♥」の数字を添える。`stun` は `nature` に「✦」。

## 2. データの形（Claude）

```js
// src/data/skills.js の各技に fx を書く（省略時は kind から既定表で引く）
ogre_smash: { ..., fx: "heavy" },
mage_fireball: { ..., fx: "fire" },
// kind → fx の既定
FX_BY_KIND = { strike: "slash", aoe: "dark", heal: "holy", rest: "holy", buff: "aura", debuff: "nature", cover: "shield",
  stun: "nature", charm: "dark", push: "heavy", revive: "summon", random: "dark", steal: "wind", scatter: "wind", trait: "heavy" }
```

エンジンは技で出る全イベント（`attack`／`splash`／`heal`／`revive`／`summon`／`note`／`cover`／`order_exec`）に
`skillId` と `fx` を載せる（`applyDamage` の opts に `fx` を通す。既存の通常攻撃は `fx` 無し＝今までどおり）。
敵の役の行動（`runEnemyPlan`）も同じ：癒やし＝`holy`、全体＝`fire`（術士）、号令＝`aura`、盾＝`shield`、大技＝`heavy`。

## 3. 描画（Opus）

- `fx` があればプリセットの動きを使う。無ければ今までどおり（近接／遠隔の既定）。
- 全体技：対象全員へ**同時**に着弾（今は1体ずつ順に出るので3体だと長い）。数字も同時。総尺は単体の1.6倍まで。
- 味方対象（回復・かばう・鼓舞）：使用者が前へ出ず、対象の側で光る。使用者の札は `acting` だけ。
- 自分対象（休む・狂乱）：その場で光る。
- 拘束・燃焼・鼓舞は**残る印**を札に付け、解けたら消す（`note` の `stunned`、`flags.burn`、`buff.until` に対応するイベントが無いものは、次のラウンド頭で消す）。
- 字幕：技名を最初に一枚（`order_exec` は既存）、着弾の数字は `fnum`。余韻（1.5秒、次の字幕まで残す）は 2026-09-12 に入れたものを守る。
- 低モーション設定（`prefers-reduced-motion`）では全部を静止画1枚＋数字にする（既存の規則）。
- `tools/browser-tests/skill-fx.js`：`fx` ごとに1回再生して、期待するクラスと数字が出る／尺が上限内／スキップで残骸なし。

## 4. 絵の仕様（CodeX）

- 既存と同じ：512×512、透過 WebP、80KB 以下、1枚1プリセット（`assets/battle/effects/<fx>.webp`）。`projectile-fire`／`projectile-wind` は 128×128 の弾。
- 画風は既存 `slash.webp`／`impact.webp` に合わせる（太いインク、くすんだマット、90年代ベスティアリ）。
- CSS：`.bu-vfx.fx-<name>` に背景画像と基本の拡縮、`.projectile-<name>` に弾。動きの keyframes は Opus 側（重複しないよう CodeX は画像と静的な見え方だけ）。
- `docs/BATTLE_FX_PRESETS.md`：10枚の一覧と、生成プロンプト（再生成できるように）。

## 5. 貼り付け用

CodeX：
```
docs/TICKET_SKILL_FX_2026-09-12.md の CodeX の欄（1節の表の「絵」列と4節）を実装して。ブランチは codex/skill-fx（claude/hero-arrival-tavern-prototype-uy2toh から切る）。
触るのは assets/battle/effects/ の新規10枚＋弾2枚、src/battlefield.css の .bu-vfx.fx-* / .projectile-* の追加、docs/BATTLE_FX_PRESETS.md だけ。battle_scene.js は触らない。1コミット。
```
Opus：
```
docs/TICKET_SKILL_FX_2026-09-12.md の Opus の欄（1節の表の「動き」列と3節）を実装して。作業ブランチ claude/hero-arrival-tavern-prototype-uy2toh から切って同じブランチへ push。
Claude のエンジン側（イベントの fx）が入ってから着手。スプライトが無い fx は CSS の単色プレースホルダで配線し、CodeX の絵が入ったら差し替わるようクラス名だけ合わせる。
battle.js は触らない。コミットは (a) 配線と全体技の同時着弾、(b) 残る印と味方対象、(c) テスト、の3つ。ブラウザテストは直列。
```
