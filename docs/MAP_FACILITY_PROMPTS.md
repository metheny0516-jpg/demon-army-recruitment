# 市場・宿舎の施設画像プロンプト

2026-09-13 / チケット H。内蔵 `image_gen` を使用。今回の制作は市場・宿舎と共通空き地の7枚。残り6施設はオーナーの確認後に別タスクで制作する。

## 共通の画風と差分ルール

基準は `assets/map/bg.webp` の城下町。太い不均一なこげ茶インク、くすんだ灰褐色の壁と木材、暗い灰紫の屋根。90年代の手描き怪物図鑑の地図。屋根がよく見える俯瞰、横長の正面と少しの右側面。彩度の高い緑・青や光沢は使わない。128pxで分かる大きな面を優先する。

再利用する共通文：

> 背景透過のゲーム用施設アイコンを1つ。正方形PNG、実アルファ。見下ろしの俯瞰、太い不均一なこげ茶インク、くすんだマットな灰褐色と暗い灰紫。90年代の手描き怪物図鑑の地図用。背景・風景・文字・数字なし。建物の周囲は透明、足元に必要最小限の影。128角で読める簡素な形。全体を余白内に収める。

Lv差分は同じ施設を増築する考え方で指定する。施設の種類、土台の幅、向き、玄関や柱などの目印を先に固定し、「追加するもの」を1段階ずつ列挙する。別の建築様式へ置き換えない。参照編集でも背景が不透明になる場合があったため、実ファイルのアルファを確認して採否を決めた。採用画像には筆致・細部の揺れがあり、同一ピクセルへの描き足しではない。

| 施設 | Lv1 | Lv2で追加 | Lv3で追加 |
|---|---|---|---|
| 市場 | 天幕1枚の屋台、籠2つと袋 | 奥に高い天幕1枚 | くすんだ色布、小旗、買い物客3人 |
| 宿舎 | 玄関3つの平屋長屋 | 窓3つの二階 | 洗濯物と煙突の煙 |
| 共通Lv0 | 杭と縄の建設予定地。内側も透過 | — | — |

## 出力と配置

- 出力先は `assets/map/facility/`。全7枚が128×128、RGBA WebP、各20,000 bytes以下。可逆WebPで保存。
- Lv0は `lot-0.webp` だけ。`market-0` / `hostel-0` は作らない。
- 生成原画から実アルファを維持して縮小。可視領域の判定にはアルファ32以上の外接矩形と6pxの余白を使い、ピクセル自体のアルファを塗り替えずに切り出した。
- 各施設のLv1〜3は共通倍率で縮小。市場0.1100917431、宿舎0.0998217469。最大幅112px・最大高さ108pxに収め、中央寄せ、外接矩形の下端をy=116に揃えた。Lv3の人物・煙も余白内に収める。
- `docs/map-facility-preview.png` は390×844の静止合成。既存 `bg.webp` のy=1466〜2200を画面y=82から表示し、完成WebPを64×64で重ねた。背景そのものは変更していない。
- 左が市場、右が宿舎。上からLv1・Lv2・Lv3。最下段2区画は背景の空き地を残す。
- 合成の左右中心xは136 / 250、各行の足元yは313 / 366 / 420（プレビュー画面座標）。64px画像の左上は `(中心x−32, 足元y−58)`。UIの実装座標・クリック領域の決定ではない。

## 採用画像の生成プロンプト

以下は採用画像に使った入力全文。背景参照は `assets/map/bg.webp`、宿舎Lv2の参照は採用したLv1原画。その他は表記どおり新規生成。

### lot-0.webp

背景を画風・角度の参照に指定。杭8本と縄。内側も透過。

```text
One isolated fantasy town facility sprite on a TRUE TRANSPARENT ALPHA background, square canvas. Background map reference is STYLE AND VIEW ANGLE ONLY, do not include map terrain. Match its overhead 2D map angle, mostly front facade with visible roof, thick uneven charcoal-brown ink outlines, muted matte dusty taupe stone, grey-brown wood, dull plum accents, old 1990s Japanese monster encyclopedia map. No bright green/blue, no glossy rendering. Simple bold readable shapes at128x128, no tiny fussy hatching. Entire object inside square, generous margin, base center at (50%,85%), roof no higher than15%; full footprint width about70%. Minimal semi-transparent warm grey contact shadow immediately under feet; no ground tile or opaque backdrop, no border, no text, no letters, no numerals. LEVEL0 COMMON EMPTY CONSTRUCTION LOT: one bare rectangular building footprint marked by eight rough wooden survey stakes connected with slack rope around perimeter. View from the same high top-down angle as town plots in reference, near-horizontal front/back edges. No building, no crops, no tilled rows, no vegetation, no signs. Transparent space inside the rope so underlying map earth shows through, only a few tiny grey loose pebbles and minimal soft contact shadows under stakes. Actual alpha transparency outside AND inside the rope perimeter. Looks like a surveyed future building site, not a garden.
```

### market-1.webp

新規生成。天幕1枚と籠2つ・袋。

```text
Transparent-background PNG game sprite with genuine alpha. ONE small town facility viewed from HIGH ABOVE at 55 degree elevation, 2D old RPG world-map view: roof dominates, front wall shortened, horizontal roof ridge, slight right side visible. Thick irregular dark brown ink, simple matte dusty grey-brown and subdued plum, 1990s Japanese monster encyclopedia illustration. Clear broad forms legible at128x128. Isolated object centered in square canvas, width70%, bottom at85%, generous headroom. Only tiny translucent warm-grey contact shadow; NO opaque ground, backdrop, scenery, checkerboard, text, letters, numbers, vivid colors, glossy 3D rendering. Market LEVEL1: one small wooden stall, FOUR posts support a sagging rectangular taupe canvas canopy. One front counter with exactly TWO round baskets and ONE sack. A dull plum short front valance. No people or flags. Front left post at x25% y80%, front right atx75% y80%. Canopy top at y45%. This low humble single stall will get a second canopy BEHIND it for future levels; do not include second stall yet.
```

### market-2.webp

Lv1の形状を文章で固定し、奥の天幕を追加して新規生成。

```text
透過PNGのゲーム用アイコンを1つ。二段の天幕を持つ木の市場の屋台。前の4本柱の低い天幕、そのすぐ後ろに同じ幅の少し高い天幕を1つ足した形。天幕は2枚とも灰褐色の無地、手前の垂れ幕だけ暗い灰紫。手前の木製カウンターに丸い籠2つと袋1つ。人・旗は無し。真上寄りの俯瞰、太いこげ茶インクの輪郭、くすんだマットな90年代の手描き怪物図鑑の地図用。簡素な形。1枚目の天幕と2枚目の天幕の左右の支柱位置を揃える。正方形の中央に全体を収める。背景は透明、アルファ付きPNG。地面や風景は描かず切り抜き素材にする。
```

### market-3.webp

Lv2の形状を文章で固定し、色布・旗・買い物客を追加して新規生成。

```text
透過PNGのゲーム用アイコンを1つ。二段の天幕を持つ木の市場の屋台。前の4本柱の低い天幕、そのすぐ後ろに同じ幅の少し高い天幕を1つ足した形。天幕は2枚とも灰褐色の無地、手前の垂れ幕だけ暗い灰紫。手前の木製カウンターに丸い籠2つと袋1つ。このLv3だけ追加で、上の天幕にくすんだ葡萄色の布を掛け、右端に無地の小旗を1本、手前に買い物客の小さな人影3人を並ばせる。人物の顔は描き込まない。真上寄りの俯瞰、太いこげ茶インクの輪郭、くすんだマットな90年代の手描き怪物図鑑の地図用。簡素な形。1枚目の天幕と2枚目の天幕の左右の支柱位置を揃える。正方形の中央に全体を収める。背景は透明、アルファ付きPNG。地面や風景や文字は描かず切り抜き素材にする。
```

### hostel-1.webp

新規生成。玄関3つの平屋の長屋。

```text
背景透過のゲーム用建物アイコンを1つ。正方形PNG、実アルファ。90年代の手描き怪物図鑑の地図に置く小さな平屋の長屋。太い不均一なこげ茶のインク輪郭、くすんだ灰褐色の壁、暗い灰紫の屋根。見下ろしの俯瞰、屋根の面がよく見える。玄関3つ、窓4つ、短い煙突1つ。建物の周囲と下は完全な透過。地面も草も風景も描かない。簡素で少しかわいげのあるデフォルメ、写真や3Dにしない。128角に縮小して使うので大きな面と線だけ。建物は横長で画面中央、全体が収まる。人、洗濯物、煙、文字なし。単一の小さな切り抜きアイコン、透明背景。
```

### hostel-2.webp

採用したhostel-1の生成原画を参照して編集。

```text
この長屋アイコンのLv2を作る。変更は二階を足すだけ。一階の玄関3つ、窓4つ、土台の幅・位置・向き・縮尺はそのまま。今の灰紫の切妻屋根を上へ移し、その下に同じ灰褐色の壁と木の柱の二階を1段足す。二階には窓を3つ。煙突は元の屋根と同じ位置。太いこげ茶インクと簡素なマットな画風、見下ろし角度を維持。洗濯物・煙・人物・文字はまだ無し。背景は実アルファ透過PNG、建物だけ切り抜き、余白は透明のまま。
```

### hostel-3.webp

Lv2の長屋の特徴を文章で固定し、洗濯物・煙を追加して新規生成。

```text
背景透過のゲーム用建物アイコンを1つ。正方形PNG、実アルファ。90年代の手描き怪物図鑑の地図に置く小さな二階建ての長屋。太い不均一なこげ茶のインク輪郭、くすんだ灰褐色の壁、暗い灰紫の屋根。見下ろしの俯瞰、屋根の面がよく見え、右側面も少し見える。低い横長の切妻屋根、右寄りの短い煙突1つ。一階に玄関3つと窓4つが交互、各玄関に小さな庇。二階に窓3つと木の梁。一階を維持して二階が足された長屋。二階の外壁に短い物干し縄と洗濯物3枚、既存の煙突から薄い灰色の煙ひと筋。建物の周囲と下は完全な透過。地面も草も風景も描かない。簡素で少しかわいげのあるデフォルメ、写真や3Dにしない。128角に縮小して使うので大きな面と線だけ。建物は横長で画面中央、全体が収まる。文字なし。単一の小さな切り抜きアイコン、透明背景。
```

## 検証

寸法・WebP形式・実アルファ・各20KB以下を確認。128pxの比較画像と390pxの城下町合成を目視し、施設の種類、Lv差分、背景との色調、区画・井戸・通路の見え方を確認した。ゲームコードや既存背景には変更を加えていない。
