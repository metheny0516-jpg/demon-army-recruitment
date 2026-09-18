# 反乱軍の首謀者：画像の来歴（2026-09-14）

## 制作・範囲

- 制作：CodeX、本プロジェクト向けに内蔵 OpenAI `image_gen` で生成。外部配布素材・取得元URLなし。プロジェクト独自のAI生成素材であり、CC0/CC-BY素材ではない。
- 画風参照：本プロジェクトの `assets/monsters/harpy.png`。`ogre.png` も目視で線・色・構図を確認。首謀者は新規の人物デザイン。
- 姿：平たい嘴、灰紫の厚い鱗、琥珀色の目、太い尾。古い魔王軍の軍服を着崩し、片方だけの肩章とくすんだ赤のたすき。角・牙はなく、ミノタウロス／オーガとは別種。
- 設計原則15節のゲート7：反乱軍の首謀者を一目で区別するための素材。srcの登録・挙動・数値は変更していない。表示側への登録は取り込み側で行う。

## 納品

- `assets/battle/units/rebel_boss/`：harpyと同じ8ファイル。
  - `motion-source.png`：1536×1024、実RGBA、3列×2行。
  - `idle.webp`, `attack-windup.webp`, `strike.webp`, `recover.webp`, `hurt.webp`, `fallen.webp`：各512×512、実アルファ透過、共通倍率、足元492px。
  - `motion-review.png`：768×512、RGB、6ポーズ比較。
- `assets/monsters/rebel_boss.png`：768×1024、PNG、不透明、70,427 bytes。顔（頭頂から嘴の下端まで）はおよそy=7〜45%に収まる。40pxの上部正方形クロップを確認。

## 原画

内蔵ツールの保存名（同一セッションのgenerated_images配下）：

- 履歴書採用原画：`exec-dcbf1394-290b-454e-a7fe-eea5eeda2171.png`。
- 戦闘初稿：`exec-35c2c701-11fa-450b-9f61-915341e00d6c.png`。RGBにチェック柄が描かれていたため、そのままでは不採用。
- 背景抽出1回目：`exec-0ba199d8-8f38-4981-a137-0d14a6399aec.png`。RGBのため不採用。
- 背景抽出2回目・採用：`exec-8597fcd4-0b53-4e96-8c58-0c04c6d745fc.png`。これを `motion-source.png` に保存。透明ピクセルにはRGBが残るが、アルファ0なので合成では見えない。

## プロンプト

### 履歴書（画風参照としてharpy.pngを添付）

Use case: stylized-concept. Create ONE original monster resume portrait, vertical 3:4 composition, intended final 768x1024. Reference image is STYLE AND STUDIO COMPOSITION ONLY, not character identity. Match its thick uneven dark brown ink, simple softly rounded Japanese 1990s monster-manual shapes, muted matte earthy limited colors and restrained printed texture. Plain opaque pale blue-grey studio backdrop. Subject: the leader of a demon-world rebellion, a NEW hulking hornless reptilian monster, neither ogre nor minotaur nor human. Distinct wide flat blunt turtle-like beak muzzle, small determined amber eyes under thick plated brow, broad cheek plates, slate dusty purple leathery skin, overlapping stone-grey scales around thick neck like a natural collar. NO horns, NO tusks, NO mammalian nose, NO bull features. Large powerful shoulders barely fit passport-photo frame. Wears a worn OLD DEMON ARMY military coat, faded olive-brown, open crooked collar and rolled cuffs, only one worn ochre epaulette, missing-button stitch marks, muted burgundy sash diagonally across chest. No insignia symbols or text. Expression stubborn, world-weary, slightly comically trying to look respectable for a formal ID photo; softened expressive shape design, not horrific. Bust portrait facing camera slight three quarter, direct eye contact. Entire face including beak between y=15% and y=49%, shoulders below, generous top margin, face legible in top-square tiny crop. No weapon in this portrait, no other characters, no scenery, no letters, no watermarks, no glossy rendering, no vivid color, no cinematic light. One consistent character design for later full-body combat poses.

### 戦闘（履歴書採用原画を人物参照として添付）

Use case: stylized-concept. Make a production combat sprite sheet of THE EXACT SAME individual in the reference portrait, not a new design. 1536x1024 PNG, EXACT 3 columns x 2 rows of equal 512x512 cells. Genuine transparent alpha background (NOT checkerboard drawn into image). Six completely separate full-body sprites at IDENTICAL physical scale, all facing RIGHT, side/three-quarter view. Same dusty purple-grey layered scale plates, stern amber eyes, flat broad turtle-beak face and thick neck, NO horns or tusks. Bulky muscular body, short sturdy legs, thick short tapered scaly tail behind, three clawed toes. Same faded olive-brown old military coat worn open with rolled cuffs, one worn ochre epaulette, diagonal dull burgundy sash, dark patched trousers. Add one short heavy battered iron mace/baton, blunt solid head, held in right hand throughout. Soft expressive old Japanese RPG monster-manual character shapes, thick uneven dark ink, muted matte flat colors, restrained texture matching reference, no glossy Western concept-art rendering. Row1 left: idle, planted squat legs, baton held low forward. Row1 center: attack-windup, knees bent, baton raised behind shoulder. Row1 right: strike, forceful downward-right mace smash, full body lunging right. Row2 left: recover, pulls mace back to waist and straightens. Row2 center: hurt, recoils left, free hand on chest, head still right, mace kept. Row2 right: fallen, whole creature lying sideways, head at right, same mace beside hand, intact body. Maintain consistent head size, coat/sash/epaulette/tail and weapon across every frame. Each complete silhouette within its own 440x440 central safe zone, generous clear gutters, NOTHING crossing cell borders, all feet/tail/mace tips visible. No text, labels, frame borders, grids, background, floor, cast shadows, dust, speed lines, magic effects, blood, gore, extra characters. True transparent RGBA outside the six figures and between limbs.

### 採用した背景抽出（戦闘初稿を添付）

Remove the background. Transparent background PNG. Keep all six monsters exactly unchanged, keep dimensions and arrangement. Delete the grey and white checkerboard entirely, including holes between limbs. Output an RGBA transparent cutout, not an illustration of transparency.

## 加工・再生成

- 戦闘：`scripts/prepare_species_motion.py` を使用。本体は変更せず、実行時だけspeciesのchoicesに `rebel_boss` を追加。下段のコマ境界を `(0, 512, 985, 1536)` にする。fallenの尾とhurtの足の間の空白で区切り、隣コマの混入を避ける。それ以外は既存処理のアルファ外接矩形・共通倍率・下端492・WebP quality=90/method=4。
- 履歴書：`scripts/prepare_monster_images.py` のflatten_and_resizeとtop_square_previewを使用。標準の容量優先減色では赤いたすき・灰紫の肌の差が弱くなったため、最終版は768×1024から256×341にLanczos縮小、MEDIANCUT 64色・ディザなしで減色し、NEARESTで768×1024へ戻して最適化PNG保存。コードファイルは変更していない。
- 比較：6枚を256角に縮小して3列×2行、無地背景に合成。実画像で輪郭・武器・尾・倒れ姿・同一人物を確認。
- 検証：harpyとファイル名・寸法・形式が一致。6WebPのアルファ、余白と足元を検査。履歴書の寸法・不透明・80KB以下を検査。ゲームコードを変更しない素材納品なので、ゲームのsimは実行していない。
