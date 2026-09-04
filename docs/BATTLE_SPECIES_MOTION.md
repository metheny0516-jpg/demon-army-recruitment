# 種族モーション追加（2026-09-04）

## 剣士の単体差分（2026-09-04）

内蔵image_genで既存 `swordsman/idle.webp` を毎回参照し、5差分を単体生成。
共通指示: same character/equipment, right-facing full body, thick uneven ink, muted matte
1990s RPG bestiary, generous margins, real RGBA transparency, no backdrop/shadow/effects/text.
ポーズ指示: windup=pull sword back and bend knees; strike=lunge and slash low forward;
recover=shift weight back and draw sword to hip; hurt=recoil backward, eyes closed;
fallen=collapse on side, head right, equipment beside hands, no gore.
windup/hurt初稿はRGBチェック柄だったためbackground-extractionで実alphaへ修正した。
保存先 `assets/battle/units/swordsman/`。各 `*-source.png` が採用原画。
`motion-scale.json` の兜寸法を基準に出力画像間の体格を校正し、その後は全ポーズ共通倍率・足元492。
再生成: `python scripts/prepare_single_motion.py assets/battle/units/swordsman`
`motion-review.jpg` は左右の128px比較。命中38%・総尺・HP/音・フォールバック契約を維持。
検証: species通常/orc/swordsman、battlefield、ranged、arrival、vfx-lifecycle。

スライム・骸骨兵の6ポーズ（idle/attack-windup/strike/recover/hurt/fallen）。
内蔵image_genで生成。履歴書写真ではなく戦闘用全身絵とするオーナー指示を優先。
設計ゲート7の「短い映像でも種族の個性が伝わる」に対応。ルールや戦闘尺は増やさない。

保存先: `assets/battle/units/slime/`、`assets/battle/units/skeleton/`。
各motion-source.pngが採用原画、各WebPは512×512・透明背景・共通倍率・足元492px。
生成後は背景抽出で実alphaを得た。修正版の再生成は不透明な背景が焼き込まれたため不採用。
骸骨兵のidle右上の隣コマ槍先はCSSの余白クリップで非表示。元原画のコマ境界改善は残件。

再生成:
```
python scripts/prepare_species_motion.py slime assets/battle/units/slime/motion-source.png
python scripts/prepare_species_motion.py skeleton assets/battle/units/skeleton/motion-source.png
```

スライムの伸縮/跳躍と骸骨兵の槍突きはmeleeFramesで分岐。待機・被弾も差別化。
通常近接と同じ38%命中・同じ総尺。倍率/圧縮/低モーション/スキップ処理を共有。
UI既存の戦闘絵→履歴書→絵文字フォールバックを保持。

## 生成プロンプト

### Orc（追加・2026-09-04）

内蔵image_genの初回生成を採用。`assets/battle/units/orc/` にmotion-source.pngと
6種の512×512透過WebPを保存。モンスター画像スキルの色/輪郭を踏襲し、
オーナー指定の戦闘専用全身絵として制作。データの「斧が仕事をした」という人物像に合わせた。
溜め27%→振り下ろし38%→踏ん張り56%→引き戻し。総尺・命中・ダメージは従来通り。
設計ゲート7: 重量級という見た目の違いを短い戦闘で伝える。新しいルールは追加しない。
再生成: `python scripts/prepare_species_motion.py orc assets/battle/units/orc/motion-source.png`
回帰試験: `SPECIES=orc node tools/browser-tests/species.js`（Windowsは環境変数を先に設定）。

Use case: stylized-concept. Production transparent RGBA 2D RPG sprite sheet, 1536x1024, EXACT 3 columns x 2 rows of 512x512 cells. Six full body poses of ONE same stocky olive-green ORC worker soldier, big square jaw, two small tusks, irritated tired face, tense huge shoulders, short legs, patched brown leather tunic, dull red waist cloth, iron wristbands, heavy short-handled single-bladed axe held in BOTH hands. Thick uneven dark ink contour, muted earthy flat cel colors, matte 1990s tabletop bestiary/SNES monster manual, awkward not heroic. All face RIGHT. Row1: idle broad planted stance axe held low; attack-windup axe lifted high overhead knees bent; strike heavy downward chop axe low forward-right torso leaning into blow. Row2: recover pulls axe up from ground; hurt rocked back with hunched shoulders; fallen lying sideways on ground axe beside him. SAME SCALE in all six poses. Every body and weapon stays within center 400x440 area of EACH 512 cell with generous transparent margins; NOTHING crosses any cell boundary. Actual ALPHA TRANSPARENCY, NO painted checkerboard, no backdrop, no ground, no shadow, no haze, no labels or grid, no effects, no gore, no cinematic lighting or glossy 3D.

### Slime

Use case: stylized-concept. Production 2D RPG animation sprite sheet, EXACT 1536x1024, 3 columns x 2 rows of equal 512 cells, six poses of ONE identical faceless blue slime with a crooked partly submerged burgundy necktie. Thick uneven dark ink outlines, muted teal blue, restrained matte cel shading, 1990s tabletop bestiary / SNES monster manual, deliberately awkward lowly employee monster. No eyes, no mouth. All facing right. Each cell full body, generous transparent margins, no overlap. Row1: idle squat dome; attack-windup compressed wide puddle; strike stretched diagonally forward-right body slam. Row2: recover wobbling back; hurt deeply indented soft body; fallen flattened limp puddle with tie. Keep common physical scale across cells, same mass, ground under each body. Genuinely transparent alpha background. No grid, text, effects, scenery, cast shadows, glow or glossy 3D.

### Skeleton

Use case: stylized-concept. Production 2D RPG animation sprite sheet, EXACT 1536x1024, 3 columns x 2 rows of equal 512 cells, six poses of ONE identical squat skeleton foot soldier: oversized ivory skull, nervous hollow eyes, battered iron helmet, faded ochre cloth scarf, ribs exposed, short rusty spear and small cracked wooden buckler. Thick uneven dark ink outlines, muted bone/grey/brown, restrained matte cel shading, 1990s tabletop bestiary / SNES monster manual, awkward exhausted employee monster, not heroic. All face RIGHT in side three-quarter view. Full body and weapons in each cell, generous transparent margins, no overlap. Row1: idle bent knees spear forward; attack-windup draws spear backward; strike forward low spear thrust. Row2: recover pulls spear back crouched; hurt recoils backward skull tilted; fallen collapsed heap of bones and equipment. Same identity, scale, proportions and equipment in all cells. Genuinely transparent alpha background. No grid, text, scenery, cast shadows, gore, magic, glow or glossy 3D.

### 採用した背景抽出

Background extraction only: remove ALL dark backdrop and colored haze around the six sprites. Make genuinely transparent alpha background, including gaps between bones and equipment. Preserve exactly the six illustrations, their colors, ink outlines, identities, positions, size and 1536x1024 three-by-two grid layout. No other changes. No background, no shadow, no glow.
