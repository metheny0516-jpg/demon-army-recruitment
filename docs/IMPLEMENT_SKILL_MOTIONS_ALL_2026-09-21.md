# 技モーション全31技：実装とOpus検証指示

基点：本線 `fe89ca0`。作業枝：`codex/skill-motions-complete`。
第1弾の5技を保持し、残り26技を追加。本線への統合・配信はブラウザ検証後。
ハプニング試作・ストーリー変更を含まない。

## 実装範囲

通常攻撃は24pxの小前進。既存コマと移動・CSS図形を組み合わせる。新規画像・音源は追加せず、既存の戦闘音を維持する。

|技ID|移動・効果|
|---|---|
|ogre_smash|小上昇から急下降、青い縦線|
|mino_rush|直線加速、扁平な衝撃環|
|knight_ittou|その場で暗転、横一線|
|mage_fireball|小さな詠唱、火球と対象ごとの炎|
|succubus_charm|接近と後退、牙、実回復時の吸収線|
|orc_cleave|小踏み込み、横薙ぎの弧|
|imp_rob|低い往復、残像と小さな切り傷|
|goblin_warcry|小跳ね、味方の応援環|
|slime_cling|潰れて伸びて接近、粘着輪|
|skeleton_wall|前進して構える、骨色の盾|
|zombie_bite|二段階のよろめく接近、毒色の飛沫|
|kobold_feint|その場付近のジグザグ、残像|
|necro_hand|小さな上下動、蘇生対象の手形|
|troll_rest|前進して構える、石色の輪|
|lich_pulse|浮遊、紫の波紋|
|mimic_box|二度跳ねて間を置く、実際の結果に応じ炎・回復・硬貨|
|harpy_dive|上昇から斜め急降下、斜線と残像|
|knight_iai|静止から高速接近、細い横線|
|mandragora_mend|小さな詠唱、回復対象の緑の環|
|king_wave|潰れて前進、水色の大波|
|succubus_dark_heal|小さな詠唱、赤紫の回復環|
|mandragora_wake|小跳ね、解除対象の声の環|
|king_slime_wrap|小前進、回復対象の膜|
|rampage|直線突進、亀裂と残像|
|death_pulse|静止と暗転、闇の波|
|ogre_charge|突進、扇状の衝撃|
|great_fireball|長めの詠唱、大きな火芯|
|blood_howl|踏み込み、赤い斬線|
|goblin_tactics|回り込む往復、小さな斬線|
|gale|相手の前から横断、残像|
|general_might|前進して号令、暗転と金色の波|

各軌道は原点へ戻る。残像は絵だけの装飾であり、戦闘員や操作要素を複製しない。
支援技は実際の支援イベントから描画し、ダメージを捏造しない。回復HPは既存どおり更新する。
全体攻撃や余波は動作グループで本人の移動を一度にし、実際の連撃は各攻撃で動く。
低モーションでは移動・残像・暗転・飛び道具を抑制する。

## エンジンへの変更を正確に扱う

第1弾と異なり、`src/core/battle.js` と `src/core/skill_effects.js` に変更がある。
既存イベントに表示専用 `motion`（skillId/sourceId/group/outcome/targets/cleared）を追加する。
本文の文字列を解析して発動を推測せず、実際に起きた効果へ接続するため。
新たな戦闘イベント、乱数抽選、ダメージ・回復量・条件・対象選択は追加しない。
上位技は指示だけでは発動扱いにせず、実際の倍率適用や特性発動を識別する。

`tools/test-skill-motion-events.js` は基点fe89ca0と現実装を別VMで実行し、31技×6seedで、motion以外の全イベント・最終状態・次の乱数が一致することを確認する。
この186例の一致は全条件の数学的証明ではない。実画面と既存回帰は別途必要。

## 実施済み検証

- 上記186例の比較と31技の実効果メタデータ接続。
- `test-skill-motions.js`：通常攻撃、31軌道、接触、全体攻撃、MISS、速度、低モーション、支援11経路、薙ぎ払いの単一動作、回復0で吸収線が出ない。
- 既存関連：battle-pacing、command-battle、skills-battle、battle-result-bubbles、skills-command、skill-catalog、chain-events、chain-view、loot-chain、death-chain、meal-attribution-battle、battle-report。
- JavaScript構文とdiffチェック。

Chromiumがないため、新規ブラウザテストとrun-allは未実行。見た目の合格・本番反映はまだ主張しない。

## Opusへの検証指示

1. 最新本線から統合枝を作り、この枝を取り込む。既存の台詞・第1弾モーションを保持し、ハプニング試作を混ぜない。
2. 上記Nodeテストと既存Node全件を確認。長時間テストは400秒以上の枠で扱う。
3. `battle-preview.html` の「全31技」選択から再生。固定の架空attackではなく、実エンジンで計算したイベントを再生する。別seedボタンで実効果の変化も見られる。
4. `tools/browser-tests/skill-motions-all.js` と `sh tools/browser-tests/run-all.sh` を実行。新規テストも未実行なので、実装とテストの両方を検証する。
5. 本編の指示窓から攻撃・回復・蘇生・解除・上位技を実行し、技IDが描画へ届くことを確認する。プレビューと抽出イベントの描画テストだけで本編の通し確認済みにしない。
6. 390×844とPCで、x1/x2/x4、低モーション、途中スキップ、次戦闘を確認。横断・急降下が札や画面外へ過度に飛び出さないこと、暗転が文字を隠さないことも目視する。
7. 支援技が相手を殴らないこと、全体技で本人が何度も飛ばないこと、連撃を省略しないこと、残像が戦闘員数・操作対象を増やさないことを確認する。
8. MISS・不成立の一刀・解除対象なし・実回復0・途中撃破・召喚が混ざる場面を確認。成功していない効果を成功として描かない。
9. スキップ後にHPを確定し、transform/暗幕/飛び道具/残像/pendingHits/motionGroupsSeenを持ち越さないことを確認する。
10. 回帰が緑で実画面に問題がなければ本線へ統合し、配信SHAと完了を報告。問題は原因・修正・再検証結果をHANDOFFに残す。

既知の横はみ出しは基点にも存在する。既存量との比較と今回の追加分を区別し、単に期待値を緩めて通さない。
対象は現行SKILLSの31技。カタログの未割当技などは今回の範囲に含めない。
