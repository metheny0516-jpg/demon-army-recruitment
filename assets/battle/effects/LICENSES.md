# 戦闘エフェクトの来歴

## 2026-09-13 転身の炎

制作日: 2026-09-13（日本時間）。作者・制作: 本プロジェクト向けにOpenAI image_genで生成。外部配布素材の取得なし（取得元URLなし）。ライセンス区分: プロジェクト独自のAI生成素材。CC0／CC-BYの外部素材ではない。既存ゲーム内のAI生成画像を画風参照に使用。生成プロンプトと変換記録は `docs/MAP_PROPS_GENERAL_FX_NOTES.md`。

- 対象: `general-aura.webp`。
- 参照: 同ディレクトリの `dark.webp`。紫黒の太いインクとマットな炎を参照し、縦向きの独立した炎の輪として新規生成。
- 加工: RGBAを維持して512×512へ縮小、WebP変換。中央は透明。
- この記録は今回の1枚のみを対象とし、既存素材のライセンスを変更しない。

## 2026-09-15 大技用8枚

- 制作: 本プロジェクト向けにOpenAI組み込みimage_genで生成。外部配布画像の取得なし（取得元URLなし）。ライセンス区分: プロジェクト独自のAI生成素材。CC0外部素材ではない。
- 画風参照: 同ディレクトリの `impact.webp`。荒いインク・マットな塗り、光沢なし。
- 基準ブランチ: `claude/hero-arrival-tavern-prototype-uy2toh` の `891fff329f37d49bbd3bc04f2dde5379040b19e6`。
- 各WebPは512×512、透過RGBA、lossless=True、method=6。元画像の実アルファを保持しLANCZOSで等倍比縮小。着弾原点は(256,256)＝対象の胸。弾は右向き、尾は左。原画は `big-skill-sources/` に保持。
- 変換: 下表の原画アンカーを(256,256)に合わせ、倍率 `232 / max(anchorX, width-anchorX, anchorY, height-anchorY)` で四辺に余白を確保。縦横を別々に伸縮していない。
- 原画プロンプトは各項に記録。fire/heavyは初稿の類似を避ける修正指示を記載。初稿の共通指示は「rough thick uneven ink, muted matte limited colors, restrained flat shadows and old printed game-art texture; transparent PNG isolated RPG battle effect」。

### `big-dark.webp`

- 原画: `big-skill-sources/big-dark.png`
- 原画SHA-256: `04795dea3496ce75d04e26718f7a2a2cdafaf9a4f2039a3bdd2bd115c4a44912`
- 原画アンカー: [627, 652]、倍率: 0.355828221

```text
Transparent PNG isolated RPG battle effect. A huge dark magic eruption. Dense plum purple and charcoal ink flames erupting radially from exact canvas center, a pale lavender jagged core, torn smoky curls. Not a portal. Match reference's rough thick uneven ink, muted matte limited colors, restrained flat shadows and old printed game-art texture. Large bold shape contained within square canvas with clear transparent margins, readable small. No glossy gradients, lens flare, text or scenery. Transparent background.
```

### `big-fire.webp`

- 原画: `big-skill-sources/big-fire.png`
- 原画SHA-256: `c19613f3457a29e090630bff2653f61311ed9b8807b11b7a507435fd57ae279b`
- 原画アンカー: [627, 652]、倍率: 0.355828221

```text
Transparent PNG cutout. Make this a huge FIRE explosion: surround the central burst with broad rolling lobes of orange and dark rust flame, a dense round boiling fire bloom. Remove flying rocks. Fewer needle-like rays, more thick flame tongues. Keep rough ink and flat matte colors, center at exact square center, clear margins. Transparent background.
```

### `big-heavy.webp`

- 原画: `big-skill-sources/big-heavy.png`
- 原画SHA-256: `694b0e6dd4342bd1d71d47b482de9d4c1840ffac9d9da233fd50ea7bbd854be7`
- 原画アンカー: [627, 652]、倍率: 0.355828221

```text
Transparent PNG cutout. Change this impact into a blunt earth-shattering impact: remove ALL orange and all fire. Huge brown grey angular rocks and bold dark brown zigzag cracks radiating from a SMALL ivory central impact. Earthy muted ochre dust wedges, no flames. Preserve rough ink, centered square composition. Transparent background.
```

### `big-slash.webp`

- 原画: `big-skill-sources/big-slash.png`
- 原画SHA-256: `a8a1cd185e750e7bd1d73a72e6c818a1489207d459bbd7065f9a98ecab2a29c5`
- 原画アンカー: [727, 777]、倍率: 0.298584299

```text
Transparent PNG isolated RPG battle effect. One huge diagonal sword slash from lower left to upper right. A thick ivory blade-shaped sweeping crescent with dull ochre edge and rough charcoal ink splinters, crosses exact canvas center. No weapon. Match reference's rough thick uneven ink, muted matte limited colors, restrained flat shadows and old printed game-art texture. Large bold shape contained within square canvas with clear transparent margins, readable small. No glossy gradients, lens flare, text or scenery. Transparent background.
```

### `big-slash_multi.webp`

- 原画: `big-skill-sources/big-slash_multi.png`
- 原画SHA-256: `975cb67c0495031ac48e6a6724548815e14abe0e45eaab29b87a90a4e2a7ebbe`
- 原画アンカー: [627, 652]、倍率: 0.355828221

```text
Transparent PNG isolated RPG battle effect. Three huge intersecting slashing crescents: ivory strokes with muted rust red and ochre edges, three different diagonals crossing exact canvas center, rough broken ink flecks. No weapons. Match reference's rough thick uneven ink, muted matte limited colors, restrained flat shadows and old printed game-art texture. Large bold shape contained within square canvas with clear transparent margins, readable small. No glossy gradients, lens flare, text or scenery. Transparent background.
```

### `big-wind.webp`

- 原画: `big-skill-sources/big-wind.png`
- 原画SHA-256: `451ccdb1f695131de4a43fff683dad638f9aec602d4f45350973bf71a41964b5`
- 原画アンカー: [627, 652]、倍率: 0.355828221

```text
Transparent PNG isolated RPG battle effect. A huge gust impact. Broad circular shock spiral of pale sage and ivory wind ribbons, jagged central pressure burst at exact canvas center, irregular torn brush ends. No landscape. Match reference's rough thick uneven ink, muted matte limited colors, restrained flat shadows and old printed game-art texture. Large bold shape contained within square canvas with clear transparent margins, readable small. No glossy gradients, lens flare, text or scenery. Transparent background.
```

### `projectile-fire-big.webp`

- 原画: `big-skill-sources/projectile-fire-big.png`
- 原画SHA-256: `28c39f3e22dcd798bc1ac13c2a749a3ae0ddd95e476d4b06c7a209b5d0f53685`
- 原画アンカー: [627, 627]、倍率: 0.370015949

```text
Transparent PNG isolated RPG battle effect. A massive rightward fireball: round dense orange and ochre flame head at x=70%, y=50%, long ragged flame tail trailing to the left. Compact wide silhouette occupying 85% width and 55% height. No debris. Match reference's rough thick uneven ink, muted matte limited colors, restrained flat shadows and old printed game-art texture. Large bold shape contained within square canvas with clear transparent margins, readable small. No glossy gradients, lens flare, text or scenery. Transparent background.
```

### `projectile-wind-big.webp`

- 原画: `big-skill-sources/projectile-wind-big.png`
- 原画SHA-256: `7076bbd44f1fbd43495c0a437f241b924a27e1bcfde8988708315ef76be56ec5`
- 原画アンカー: [627, 627]、倍率: 0.370015949

```text
Transparent PNG isolated RPG battle effect. A massive rightward wind blade: curled pale sage and ivory crescent vortex head at x=70%, y=50%, long rough curved wind ribbons trailing left. Compact wide silhouette occupying 85% width and 60% height. Match reference's rough thick uneven ink, muted matte limited colors, restrained flat shadows and old printed game-art texture. Large bold shape contained within square canvas with clear transparent margins, readable small. No glossy gradients, lens flare, text or scenery. Transparent background.
```

検証: 全8枚の512×512・RGBA・アルファ0〜255・透明余白を確認。明暗背景の縮小一覧で形状・中心位置を目視確認。`effects.js` はChromium実行ファイル不在で起動不可。Chromium導入も配布サーバーのタイムアウト／502で失敗し、battlefield・effects・vfx-lifecycleおよび実ゲーム速度別確認は未実施。素材のゲーム接続は§2担当の作業。
