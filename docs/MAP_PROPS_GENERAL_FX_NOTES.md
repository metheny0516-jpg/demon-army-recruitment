# 地図小物と転身の炎（I-2）

基点: `claude/hero-arrival-tavern-prototype-uy2toh` / `d7b41ed`。素材のみ。配線は未実施。

| ファイル | 寸法 | 用途 |
|---|---|---|
| `assets/map/props/flag.webp` | 64×64 | 前哨済 |
| `assets/map/props/smoke.webp` | 64×64 | 荒らされた土地 |
| `assets/map/props/vault.webp` | 64×64 | 魔界銀行 |
| `assets/map/props/star.webp` | 64×64 | 勇者の地点 |
| `assets/map/props/fog.webp` | 390×220 | 第二幕の霧、最大不透明度65% |
| `assets/battle/effects/general-aura.webp` | 512×512 | 札を包む縦向きの紫炎。中央は透明 |

## 配置確認

`map-props-preview.png` は `assets/map/bg.webp` 下端700px（y=1500〜2200）を使用。元画像は変更なし。旗=(102,150)、煙=(229,242)、金庫=(299,555) に各64pxの実ファイルをアルファ合成。座標はプレビュー内の左上位置であり、実装上の指定ではない。

## 制作と検査

組み込み image_gen を1素材ずつ使用。PNG原画の透明アルファを保持し、縦横比維持のLANCZOS縮小、透明キャンバスの中央配置、WebP quality=85 / method=6で出力。霧のみアルファを65%に調整。

全6枚の寸法・透過・各80KB未満を検査。小物は64pxで、紫炎は暗色背景と淡色背景で確認。霧は背景が透けることを合成確認。src/ と tools/ は変更なし。

## 生成プロンプト（全文）

### flag

```text
Use case: stylized-concept. Create one isolated 2D fantasy map prop for a 64x64 final game sprite. Thick slightly uneven dark ink, muted matte limited colors, restrained flat shading, 1990s Japanese SFC / tabletop bestiary. Readable bold silhouette at 32px. Slightly top-down view consistent with reference map, which is a STYLE REFERENCE ONLY, do not copy its background. One centered object occupying 80% of square canvas, generous transparent margins. Genuine transparent RGBA PNG alpha background, no drawn checkerboard, no text, no UI, no scenery, no gloss. Subject: a single short black wooden flagpole with a forked dusty burgundy-purple flag flying right, small dull brass spear tip, simple black demonic chevron emblem. Represents a cleared outpost.
```

### smoke

```text
Use case: stylized-concept. Create one isolated 2D fantasy map prop for a 64x64 final game sprite. Thick slightly uneven dark ink, muted matte limited colors, restrained flat shading, 1990s Japanese SFC / tabletop bestiary. Readable bold silhouette at 32px. Slightly top-down view consistent with reference map, which is a STYLE REFERENCE ONLY, do not copy its background. One centered object occupying 80% of square canvas, generous transparent margins. Genuine transparent RGBA PNG alpha background, no drawn checkerboard, no text, no UI, no scenery, no gloss. Subject: a single chunky curling plume of charcoal grey and dusty violet smoke rising from a small dark ash wisp, indicating a ransacked settlement. Not fire. Hollow transparent gaps between curls, compact silhouette.
```

### vault

```text
Use case: stylized-concept. Create one isolated 2D fantasy map prop for a 64x64 final game sprite. Thick slightly uneven dark ink, muted matte limited colors, restrained flat shading, 1990s Japanese SFC / tabletop bestiary. Readable bold silhouette at 32px. Slightly top-down view consistent with reference map, which is a STYLE REFERENCE ONLY, do not copy its background. One centered object occupying 80% of square canvas, generous transparent margins. Genuine transparent RGBA PNG alpha background, no drawn checkerboard, no text, no UI, no scenery, no gloss. Subject: a squat heavy dark iron bank safe, closed square front door, large dull brass circular wheel lock, two very small horn-shaped iron corner projections. Slight top-down 3/4 view, heavy dark ink edges, muted grey-purple metal. No bank building, no coins, no lettering.
```

### star

```text
Use case: stylized-concept. Create one isolated 2D fantasy map prop for a 64x64 final game sprite. Thick slightly uneven dark ink, muted matte limited colors, restrained flat shading, 1990s Japanese SFC / tabletop bestiary. Readable bold silhouette at 32px. Slightly top-down view consistent with reference map, which is a STYLE REFERENCE ONLY, do not copy its background. One centered object occupying 80% of square canvas, generous transparent margins. Genuine transparent RGBA PNG alpha background, no drawn checkerboard, no text, no UI, no scenery, no gloss. Subject: one five-pointed aged gold star map marker indicating the hero location. Warm dull ochre, thick charcoal-brown contour, two simple flat shaded planes. Clearly five points, compact and substantial, no shine rays, no pedestal.
```

### fog

```text
Create one isolated game overlay of a horizontal band of fog, intended final size 390x220. Muted pale slate-grey with dusty lavender shadows, softly curling but chunky hand-painted cloud lobes, 1990s Japanese RPG illustrated bestiary map style, matte colors and restrained ink accents. Entire backdrop genuine transparent alpha PNG. Fog itself genuinely SEMI-TRANSPARENT, around 40-65 percent opacity, terrain behind must remain visible. Feathered transparent edges on all sides, denser across middle, wide horizontal composition about 1.77:1. No landscape, text, border, symbols, glitter, checkerboard or solid background.
```

### general-aura

```text
Use case: stylized-concept. Single 2D RPG transformation effect sprite matching supplied reference style: thick uneven charcoal ink contours, muted matte dusty violet and purple-black fire with restrained pale lilac highlights, 1990s Japanese SFC/tabletop bestiary illustration. Subject: an UPRIGHT ring of purple flames wrapping around the perimeter of a portrait card. Front-facing tall oval / softly rectangular wreath, with flames licking upward along both sides and across the top, heavy curling flame base; large EMPTY TRANSPARENT central opening occupying 45 percent of width and 65 percent of height, so a character card behind stays legible. NOT a horizontal floor circle. Single centered still effect on square canvas with 7 percent clear margins. Genuine transparent RGBA PNG background and hollow center, no character, no card drawn, no text or rune lettering, no scenery, no frame, no checkerboard, no neon gloss. Final use 512x512 transparent WebP.
```
