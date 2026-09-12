# 戦闘 FX プリセット

チケット E（2026-09-12）の CodeX 担当：画像と静的 CSS。動き・イベント配線は Opus 担当。

## 素材とクラス

全ファイルは `assets/battle/effects/`。演出10枚は512×512、弾2枚は128×128、透過WebP、各80,000 bytes以下。既存の slash / impact / guard / revive / overkill は変更しない。

| fx | ファイル | CSS | 見た目 |
|---|---|---|---|
| `heavy` | `heavy.webp` | `.bu-vfx.fx-heavy` | 太い白橙の衝撃と亀裂 |
| `slash_multi` | `slash_multi.webp` | `.bu-vfx.fx-slash_multi` | 重なる2本の斬撃 |
| `fire` | `fire.webp` | `.bu-vfx.fx-fire` | 着弾の炎と火花 |
| `dark` | `dark.webp` | `.bu-vfx.fx-dark` | 紫黒の波紋 |
| `holy` | `holy.webp` | `.bu-vfx.fx-holy` | 淡い金の光の柱 |
| `nature` | `nature.webp` | `.bu-vfx.fx-nature` | 緑の粘液と蔦 |
| `wind` | `wind.webp` | `.bu-vfx.fx-wind` | 風の筋 |
| `aura` | `aura.webp` | `.bu-vfx.fx-aura` | 足元の光の輪 |
| `shield` | `shield.webp` | `.bu-vfx.fx-shield` | 半透明の盾の面 |
| `summon` | `summon.webp` | `.bu-vfx.fx-summon` | 蘇生の光＋召喚の煙 |
| `projectile-fire` | `projectile-fire.webp` | `.projectile-fire`（::before） | 右向き炎弾 |
| `projectile-wind` | `projectile-wind.webp` | `.projectile-wind`（::before） | 右向き風弾 |

## 描画側への接続

- `.bu-vfx-anchor` の中へ空の `<span class="bu-vfx fx-heavy" aria-hidden="true"></span>` などを追加する。背景画像として描くため、既存画像を src に持つ img 要素との併用はしない。
- 基本位置は既存 `.bu-vfx` の中央。各 fx の width / height / top が静的な見かけの大きさを決め、共通 transform は `translate(-50%, -50%)`。背景は contain で比率を保持する。
- 既存 `.bu-vfx` から継承する初期 opacity は0。表示・非表示、拡縮・移動・反転・残存時間・削除は描画側で制御する。この CSS は animation / keyframes / transition を追加しない。
- 弾は既存と同じ `<span class="battle-projectile projectile-fire" aria-hidden="true"></span>`（または projectile-wind）。零サイズの親を移動・回転し、::before が44px / 52pxの画像を中心合わせで描く。元絵は右向き、尾は左。画像の128pxはファイル寸法であり表示寸法ではない。
- aura は淡い金を基本とし、対象要素か祖先の `--fx-aura-filter` で色を指定できる。例：`sepia(1) saturate(2) hue-rotate(65deg)`。側の判定自体は描画側で行う。
- summon は既存 revive.webp を参照して蘇生の光柱と輪の意匠を再利用し、根元に煙を加えた独立素材。元ファイルを上書きしない。
- charm は dark、stun は nature を利用し、♥ / ✦ の表示は描画側。
- 低モーション時の静止画＋数字、全体同時着弾、残る印、スキップ時の掃除は Opus 担当。基点ブランチでは既存の低モーション規則が bu-vfx と弾を非表示にするため、静止画を出す配線・規則もそちらで扱う。

## 再生成プロンプト

生成：組み込み image_gen、1素材ごとの個別呼出し。透過不備のあった holy / nature / aura / summon は再生成。参照画像は既存の同ディレクトリ内のファイル。共通文＋個別 Subject＋末尾指定をそのまま連結する。出力をRGBAのまま指定寸法へ縮小しWebPへ変換する。背景色の塗りつぶしや透過の除去は行わない。AI生成のため同じプロンプトでも完全一致は保証しない。

### 共通文

```text
Use case: stylized-concept. Asset type: single 2D RPG battle effect sprite. Match the supplied reference style: 1990s Japanese RPG / tabletop bestiary, thick slightly uneven ink, muted matte colors, restrained hand-painted flat shading and printed texture confined to the artwork. Square canvas, one isolated centered effect with 7% clear margin, genuine transparent RGBA background and transparent gaps (not a checkerboard drawing). No scenery, characters, text, frame, watermark, UI, photorealism, lens flare or glossy 3D. Produce one still sprite, not a sheet. 
```

### heavy

参照：`impact.webp`

```text
Subject: A single heavy blunt impact: thick branching cracks radiating from a white-hot ivory center, weighty jagged white-orange shock, a few ochre debris chips. Distinct from a regular thin starburst. Target final size: 512×512. References are supporting style references, not exact edit targets.
```

### slash_multi

参照：`slash.webp`

```text
Subject: Exactly two bold overlapping parallel diagonal crescent slash strokes, sweeping from lower left to upper right, cream-white cores with muted rust-orange edges. Two clearly separated strokes, no sword. Target final size: 512×512. References are supporting style references, not exact edit targets.
```

### fire

参照：`impact.webp`

```text
Subject: A compact impact burst of curling orange flames and scattered ember sparks, ivory hottest center, ochre and brick-red outer flames. No fireball trail; this is the impact sprite. Target final size: 512×512. References are supporting style references, not exact edit targets.
```

### dark

参照：`impact.webp`

```text
Subject: Purple-black concentric elliptical ripples of dark magic, dark charcoal ink edges, dusty violet highlights and a few rising wisps. Hollow transparent center; readable purple outlines on dark scenery. Target final size: 512×512. References are supporting style references, not exact edit targets.
```

### holy

最終採用：参照画像添付なし。透過不備のあった初回を置換。以下は共通文を足さずに使用する完全なプロンプト。

```text
Create a single 2D RPG healing spell effect asset: a narrow vertical pillar of PALE GOLD / IVORY light descending into a small ellipse, with 3 simple gold sparkles. Hand-painted 1990s RPG bestiary style, thick uneven brown ink contours, muted matte colors, flat shading, no gloss. Centered on a square with large clear margins. Output transparent PNG, genuine alpha channel. The entire background must be transparent. No grey or white squares, no grid, no checkerboard, no scenery, no text. The light itself can be opaque pale ivory. One isolated effect only.
```

### nature

最終採用：参照画像添付なし。透過不備のあった初回を置換。以下は共通文を足さずに使用する完全なプロンプト。

```text
Create one isolated 2D RPG spell effect, real transparent PNG with alpha channel. No grid or grey-white squares or checkerboard. Hand-painted 1990s bestiary, thick uneven ink outlines, matte muted flat colors, restrained texture within colored strokes. Large clear margins on square canvas. No characters, text or scenery. Subject: Muted moss-green sticky slime intertwined with two curling vines, wrapping around an empty transparent center, small droplets and simple leaves. Readable thick winding shapes, no creature.
```

### wind

参照：`slash.webp`

```text
Subject: Three bold sweeping gust ribbons, pale sage and ivory, dusty blue-grey ink shadows, tapered speed streaks moving left to right with a slight rising curl. Open transparent negative spaces. Target final size: 512×512. References are supporting style references, not exact edit targets.
```

### aura

最終採用：参照画像添付なし。透過不備のあった初回を置換。以下は共通文を足さずに使用する完全なプロンプト。

```text
Create one isolated 2D RPG spell effect, real transparent PNG with alpha channel. No grid or grey-white squares or checkerboard. Hand-painted 1990s bestiary, thick uneven ink outlines, matte muted flat colors, restrained texture within colored strokes. Large clear margins on square canvas. No characters, text or scenery. Subject: A single luminous horizontal elliptical ring at the feet, viewed slightly from above. Neutral ivory with muted warm gold edging, hollow transparent center, just a few upward wisps. Keep the ring itself compact vertically and horizontally centered near the lower half of the square; no pillar, no runes. Designed to be recolored by CSS.
```

### shield

参照：`impact.webp`

```text
Subject: A single translucent magical shield face, upright simple pointed-bottom shield silhouette, pale desaturated steel blue and ivory rim with dark uneven ink contour. Sparse facet strokes and an actually semi-transparent interior so a character behind stays visible. No physical handle, no emblem. Target final size: 512×512. References are supporting style references, not exact edit targets.
```

### summon

最終採用：参照画像添付なし。透過不備のあった初回を置換。以下は共通文を足さずに使用する完全なプロンプト。

```text
Create one isolated 2D RPG summoning effect, real transparent PNG with alpha channel. No checkerboard, no squares, no grid, no background. Reuse this established resurrection motif: narrow pale green and ivory light pillar, dusty violet spiral ribbons around it, a small concentric horizontal ring at the bottom; add chunky curling matte pale grey-violet smoke around the base for summoning. Keep middle above smoke open enough for an arriving character. No characters or text. Thick slightly uneven brown ink, muted matte hand-painted colors and flat shading, 1990s Japanese RPG bestiary style. Entire effect within square canvas with 7 percent transparent margins.
```

### projectile-fire

参照：`impact.webp`

```text
Subject: One small flame projectile moving horizontally RIGHT, bright ivory round head at the right, tapering orange and rusty-red flame tail extending LEFT. Compact silhouette readable at 32 pixels, no detached particles. Target final size: 128×128. References are supporting style references, not exact edit targets.
```

### projectile-wind

参照：`slash.webp`

```text
Subject: One small wind projectile moving horizontally RIGHT, two pale ivory-sage pointed gust streaks with dusty blue-grey edging, thicker head on RIGHT, tapered tail extending LEFT. Compact silhouette readable at 32 pixels, no bow or arrow. Target final size: 128×128. References are supporting style references, not exact edit targets.
```


## 検証

- 12枚のWebPを再読込し、寸法・実アルファ透過・各80,000 bytes以下を確認。WebP出力はPillowのLANCZOS縮小、quality=85から5刻みで下げて80,000 bytes以下になった時点で採用（method=6）。
- 暗い背景で全12種の縮小プレビューを目視確認。
- CSSの構文、全12種の背景パス、既存ルールの不変、変更対象14ファイルを確認。
- 既存 `tools/browser-tests/battlefield.js` はChromium未導入で起動不可。ブラウザ取得もネットワークタイムアウトのため、実ブラウザの検証は未実施。
