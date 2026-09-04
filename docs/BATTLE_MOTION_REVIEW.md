# 2D戦場・第1段階（2026-09-04）

## 狙いと境界

オーナー提供の「2Dバトル演出の実装イメージ」を方向性とする。
履歴書写真を動かす方式から、左右に向き合う全身キャラへ移行。
設計原則15節のゲートでは、主に5・7・10（再戦したくなる結果の理解、映像での魅力、連鎖への期待）を支える。
新しい戦闘ルール・操作・数値バランスは追加しない。タイムラインを描画する既存契約を維持する。

## 実装

- ゴブリン：待機／溜め／振り抜き／戻り／被弾／戦死の6ポーズ。全身を新規制作。
- 剣士：剣アイコンの敵だけ共通の全身絵へ。弓・魔法・騎兵等には流用しない。
- 名前とHPは定位置。体だけが対象へ踏み込み、被弾側が後退する。
- 通常攻撃（emphasis 1）は620ms枠、動作546ms。20%まで溜め、38%で接触、48%まで打ち込みを保持し、残りで戻る。
- HP・数字・効果音は接触時に同期。単純な攻撃で全画面軌道を重ねない。
- 重要な事件の尺を保護する既存のplanは変更しない。x2/x4・通常区間圧縮には表示側で追従する。
- skip/stopは進行中の命中のHPだけ確定してからタイマーとWeb Animationsを破棄。
- prefers-reduced-motionでは踏み込み／反動を無効化し、HPを即時反映。
- 画像スキルのフォールバック契約を維持。履歴書写真は変更なし。
- 背景は低コントラストの石造回廊。全地域で使う仮の共通戦場であり、実際の地名を変えない。

## 再現と確認

`battle-preview.html` を直接開く。固定の試写シナリオであり、戦闘シミュレーションや強さの見本ではない。
本編のStorage・KPI・Game.newRunを読み込まず、セーブを変更しない。1対1／5対5／速度／スキップを比較できる。

自動確認：`tools/browser-tests/battlefield.js`、`effects.js`、`vfx-lifecycle.js`、`scene.js`、`pacing.js`。
`CHROME`にChrome実行ファイル、`GAME`にリポジトリ絶対パス、`SP`に画像出力先を指定。
静止画だけでなく、命中前後のHP、動作終了、途中中断、低モーション、人数と画面幅の境界を検査する。

## レビューと残課題

初回レビューで修正したもの：左右の高さずれ、少人数時のキャラが小さすぎる点、文字と体が一緒に動く問題、
絵文字の剣士、攻撃前にHPが減る問題、倍速で字幕が途中消失する問題。

まだ完成品質とみなさない点：

1. ゴブリンは6キーポーズ＋位置補間であり、連続した手描きフルアニメーションではない。剣の円弧の中割りは未制作。
2. 剣士は1枚＋体の移動／反動のみ。ゴブリン以外の味方も写真または絵文字が残る。
3. 5対5は可読性を優先した千鳥の縦配置。画面奥行き・前衛らしい隊列表現は次の改善対象。
4. 弓・投石・魔法の飛翔体は追加済み（下記）。遠隔役のキャラ絵は写真／絵文字が残っている。
5. 速度変更は既に始まった動作を巻き戻さず、次の動作から反映する。
6. 人間の「興味を持つ」「スキップせず見たい」は自動テストでは保証できない。
   次の試遊では初見の人に10秒見せ、誰が誰へ攻撃したかを説明できるか、x1でスキップするかを確認する。

次はまずこの見本の試遊を受けて中割り・接触の間を調整する。全種族への量産を先行させない。

## 第2段階：遠隔攻撃（2026-09-04）

弓・投石・魔法を近接と区別し、構え→飛翔→命中に変更。キャラの移動は6px以内。
敵の🏹は矢、🪨は石、✨/📖と味方mage/necromancer/impは魔法弾。
これは表示の明示マッピングであり、ダメージ属性や射程のルールを追加しない。不明な役は近接のまま。
飛翔体はCSSで描画し、新規ラスター画像を生成しない。画像スキルの既存フォールバック契約は維持。
通常の620ms枠を増やさず、動作枠546msの62%で命中（近接は38%）。
到達後にHP・音・数字を反映し、遠隔では斬撃画像を出さない。
矢／魔法は直線、石は短い折れ線の弧で飛び、全て対象の位置へ向ける。
低モーションでは飛翔せず即時反映。スキップ中の弾や遅延命中は残さない。
`battle-preview.html` に「弓と魔法を確認」を追加。
`ranged.js` で3種×x1/x2/x4、圧縮0.45、敵から左向き／味方から右向き、命中前HP維持、
スキップ、低モーションを検査。390pxと1280pxの飛翔中スクリーンショットも確認する。

## 画像生成と保存

内蔵image_genを使用（GeminiやCLI/APIは使用していない）。履歴書の画風・構図を固定する規則は、
オーナーの明示指定に従って戦闘絵では外し、太い輪郭と抑えた色の方向性だけを残した。

原画と最終ファイル：

- `assets/battle/units/goblin/motion-source.png` → 同ディレクトリの6 WebP
- `assets/battle/units/swordsman/idle-source.png` → `idle.webp`
- `assets/battle/backdrops/hall-source.png` → `hall.webp`

再生成：`python scripts/prepare_goblin_motion.py assets/battle/units/goblin/motion-source.png --swordsman assets/battle/units/swordsman/idle-source.png --background assets/battle/backdrops/hall-source.png`
全ポーズを共通倍率で切り出し足元を統一する。古いportrait用の自動フィット処理には通さない。

### 生成プロンプト（最終仕様）

Goblin: Production 2D RPG sprite sheet, 1536x1024, 3 columns by 2 rows. Same olive goblin, oversized battered helmet, red scarf, patched tunic, crude short sword. Thick ink, matte muted cel shading, 1990s Japanese RPG. All facing right, same scale. Idle, crouched windup, lunging followthrough, recovery, hurt recoil, fallen. Full bodies and weapons, no text, no UI, transparent background. Background-extraction edit: remove all backdrop, preserve the exact six characters, positions, sizes and colors, actual alpha.

Swordsman: Production transparent 2D RPG full-body apprentice swordsman facing right. Oversized iron helmet, blue scarf and padded tunic, boots, small round wooden buckler, short iron sword. Nervous determined rookie, squat readable proportions, thick uneven ink, muted matte cel shading. Bent-knee ready stance, no scenery, no UI, no text, transparent alpha.

Hall: Wide 1536x1024 empty 2D RPG dungeon guard hall, grey-violet stone arches, recessed wooden door, two small warm torches at edges, broad flagstone floor. Side-view stage, subdued hand-painted 1990s RPG, low contrast and clear fighting space, no characters, weapons, UI or text.
