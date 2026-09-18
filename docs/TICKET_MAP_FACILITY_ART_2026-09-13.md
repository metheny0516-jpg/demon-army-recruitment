# チケット H（CodeX・絵）：城下町の施設の絵（まず市場と宿舎、Lv0〜3）

目的：全体マップの城下町の空き地に、建てた施設の絵が立つ。**先に2施設8枚**で画風と Lv 差分の付け方を決め、残り6施設はそのあと。
設計：`docs/WORLD_MAP_DESIGN_2026-09-13.md` 3節・5節・10節。背景は `assets/map/bg.webp`（取り込み済み）。

## 出してほしいもの（1コミット）
- `assets/map/facility/market-0.webp` 〜 `market-3.webp`、`hostel-0.webp` 〜 `hostel-3.webp`。**128×128 透過 WebP、1枚 20KB 以下**。
  Lv0 は背景の空き地と同じ「杭と縄の建設予定地」（全施設共通なので `lot-0.webp` 1枚にして市場・宿舎の Lv0 は作らない）。→ 実質 7 枚。
- `docs/map-facility-preview.png`：背景の城下町区画に、市場 Lv1〜3 と宿舎 Lv1〜3 を空き地に置いた合成1枚（スマホ縦 390px）。画風と大きさが背景に馴染むかを見る用。
- `docs/MAP_FACILITY_PROMPTS.md`：施設ごとの生成プロンプト（残り6施設を同じ調子で作れるように、共通部と差分の書き方を残す）。

## 絵の決まり
- 見下ろし（背景と同じ角度）。太いインクの線、くすんだマット。背景の紙色に馴染む影を足元に少し。
- **Lv の差分は「増える」だけ**：Lv1 は建物1つ、Lv2 は屋根がもう一段か建物がもう1棟、Lv3 は看板・旗・人影。形を変えない（同じ施設だと一目で分かる）。
- 市場：屋台と天幕。Lv3 で幕が色つきになり人が並ぶ。
- 宿舎：長屋。Lv2 で二階、Lv3 で洗濯物と煙突の煙。
- 文字は入れない。

## 規則
- ブランチ `codex/map-facility-art`（`claude/hero-arrival-tavern-prototype-uy2toh` から切る）。触るのは `assets/map/facility/` と `docs/` の2ファイルだけ。コードは書かない。
- オーナーが見て「この調子で」となったら、残り6施設（酒場・鍛冶場・研究所・工場・巨大厨房・墓地）を同じ規則で18枚、別コミット。

## 貼り付け用
```
docs/TICKET_MAP_FACILITY_ART_2026-09-13.md を読んで、市場と宿舎の施設の絵（Lv1〜3 各3枚＋共通の空き地 lot-0）を作って。
128×128 透過 WebP、20KB 以下、見下ろし、背景 assets/map/bg.webp と同じ画風。合成の確認画像 docs/map-facility-preview.png と、プロンプトのメモ docs/MAP_FACILITY_PROMPTS.md も。
ブランチ codex/map-facility-art（claude/hero-arrival-tavern-prototype-uy2toh から切る）。assets/map/facility/ と docs/ だけ。1コミット。残り6施設はオーナーが見てから。
```
