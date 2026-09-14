# 第二幕（隣国）敵5種：戦闘素材の来歴

- 作成日: 2026-09-14
- 作業ブランチ: `codex/act2-enemy-art`
- 分岐元: `claude/hero-arrival-tavern-prototype-uy2toh`
- 分岐元コミット: `3dda52d41ba2d6efb1766dccf820731d2a6e5c41`
- 制作: OpenAI image generation（ユーザー指定に基づく新規生成）。外部配布素材のダウンロード・流用なし。外部素材のCCライセンス表記は付与していない。
- 画風参照: 同リポジトリの `assets/battle/units/archer/idle.webp` と `assets/battle/units/shield/idle.webp`。太いインク線、くすんだマットな塗り、右向きの全身像。

| ディレクトリ | 内容 |
| --- | --- |
| `dragoon` | 小型の緑竜に乗る人間の軽装弓兵。青緑の鎧、赤茶のマント、弓と矢筒。 |
| `dragoon_heavy` | 大型の青灰色竜と全身鎧の大男。金縁の鎧、獅子紋の大盾。 |
| `inquisitor` | 黒い法衣と火の杖を持つ人間の術士。赤黒い裏地と金具。 |
| `chorister` | 白い法衣、青い帯、楽譜と真鍮の鈴を持つ人間の僧。 |
| `artillery` | 青い上着の人間砲手、小型の車輪付き火砲、火薬袋と火縄棒。 |

各種のファイルは `idle.webp` / `attack-windup.webp` / `strike.webp` / `recover.webp` / `hurt.webp` / `fallen.webp` と `motion-review.png`。レビュー画像は同じ順序の3列×2行で、明暗背景上の透過縁を確認できる。

## 制作・書き出し

各種の待機姿を作成し、それを同一人物・装備の参照として残る5ポーズを個別生成。市松背景が描き込まれた初期出力は採用せず、画像生成による透明背景への修正出力を使用した。倒れ姿は単なる画像回転ではなく、身体・竜・装備が崩れた姿勢として生成した。

既存の `scripts/prepare_species_motion.py` の出力規約に合わせ、実アルファ付き画像をアルファ値20超の外接矩形で切り出し、種別の6ポーズ全体に共通の倍率 `min(450 / 最大幅, 440 / 最大高)` を適用。LANCZOSで縮小、512×512の透明キャンバス中央に配置し、下端は492。WebPはquality=90、method=4。レビューPNGは768×560。背景除去やポーズの描画をスクリプトで代用していない。

ゲーム内の登録やモーション設定は変更していない。

## 生成指示の記録

初期待機姿の共通指示:

```text
Use case: stylized-concept. Production single full-body 2D RPG enemy battle sprite. Match attached archer/shield reference STYLE: thick slightly uneven dark ink contours, restrained muted matte colors, flat hand-painted cel shading, 1990s Japanese RPG / tabletop bestiary, modest printed texture ONLY inside artwork. Character is HUMAN. Veteran second-act kingdom equipment one tier richer than reference, practical dull brass trim and quality cloth, not gaudy. Faces RIGHT in side three-quarter battle view. Idle neutral ready stance. Whole unit and every prop contained in center 80% of square canvas with large transparent margins; grounded feet at common baseline. GENUINE TRANSPARENT RGBA PNG background and gaps, no backdrop, floor, ground shadow, glow, labels, UI, grid, checkerboard or extra characters. One pose ONLY. Final use 512x512.
```

### dragoon

```text
A young adult lean human mounted archer, short dark auburn hair under a small open-faced steel helmet with two modest brass ridges, muted teal light leather brigandine, dusty burgundy short cape, ivory trousers, brown boots, composite bow in left hand held down, quiver on back. Seated on ONE small dog-sized slender moss-green riding dragon with four short sturdy legs, long tapered tail curled close, two backward horns, folded small wings and brown leather saddle. Dragon looks right, mouth closed. Rider and mount are one unit. Rider clearly humanoid, not a dragon person; slim nimble silhouette.
```

### dragoon_heavy

```text
A huge broad middle-aged human man in full muted dark steel plate armor with dull brass edge trim, closed but face-visible helmet, dark burgundy tabard and large thick heater shield held on forward right side. Riding ONE large stocky slate-blue dragon, four thick legs, thick short neck, ivory horns, stubby folded wings, close-curled tail, armored saddle and plated brow. Strong heavy rectangular silhouette, noticeably bulkier and better protected than a mounted archer. Shield role, no bow. One rider one mount.
```

### inquisitor

```text
A stern adult human inquisitor with lean angular clean-shaven face and dark short hair under a charcoal hood. Black long priestly robes with muted oxblood lining, dull brass clasps and narrow embroidered hem, sturdy boots, belt with two small seals. Carries one dark wooden staff capped with an iron brazier holding a SMALL subdued orange flame. Upright composed stance, staff grounded forward-right. Fire mage, no book, no halo. Flame is physical part of staff, no flying spell effects.
```

### chorister

```text
An adult human military cantor with short brown hair and calm determined face, ivory-white long robe with muted warm-gold stitched edging and dusty blue stole, leather belt and simple dark boots. Holds an open cream parchment music book in the left arm and a single small brass handbell in the right hand at waist level. Music is a few abstract small ink strokes, no legible text. Support priest, no staff, no halo, no magic effects. Clear readable cream silhouette.
```

### artillery

```text
A stocky middle-aged human cannoneer with short moustache, open steel cap helmet, padded dusty navy military coat with brass buttons and rust-brown leather reinforcements, pale trousers and sturdy brown boots. ONE small knee-high black iron field cannon on two wooden spoked wheels, barrel pointing RIGHT, operator standing behind-left with a short slow-match linstock held lowered. Large dark leather gunpowder bag on belt with closed flap. Cannon and operator one compact unit. No modern gun or musket, no explosion, no detached cannonballs.
```

透過修正時の指示:

```text
A transparent PNG cutout of this entire battle unit and its equipment. Keep the exact character design, colors and idle pose. Whole body and all props visible. Background is transparent.
```

## ポーズ生成と採用原画

各ポーズは待機姿を参照し、次の共通指示の動作部分を変更した。

```text
A transparent PNG battle sprite of exactly this same unit in a new pose: [action] Preserve character identity, all equipment, colors, thick ink and muted matte painting. Full body, faces right, same proportions and camera distance as reference. All limbs and props fit inside the square canvas. Background is transparent.
```

### dragoon

| ポーズ | 採用原画ID | 原画SHA-256 |
| --- | --- | --- |
| idle | `exec-b2fb7cd8-b2f0-47f3-a5ae-4b9b75c14897.png` | `4004a2b019c8a1166b9d1bc71b2bebe460756756cb5b4c4159e44839c6433bb0` |
| attack-windup | `exec-ecb51429-a401-4936-9bf5-854a1038d0c0.png` | `f5cfbcfc419c62aef6a4856bede982bc44452028d36da86efbcae89c717ca6ee` |
| strike | `exec-f0dbc5c6-af1a-43b4-aae7-b919be1f1f52.png` | `b8859afbdafa3ccb55f80185800c578f38dba79d74ac23c264dbfe4136d8ff3d` |
| recover | `exec-6020a238-db70-4e9c-80c8-229701500e44.png` | `e823e619d9dde6708a450bf2934da183e154bc6f1d3a71a58744c961a52e62ab` |
| hurt | `exec-f7811217-e8f0-4990-bff4-fe078411f849.png` | `6df6224903625f029bfaf7c0664962a3064ae42a099db041d0e27fbc574531c6` |
| fallen | `exec-95fa43e6-6e9c-4375-9b64-a2874887e038.png` | `bd7250cf29b62ed928be04651907ea4a7e059509bb6f6811ee6a562eed5e0f64` |

- `attack-windup`: Rider draws bowstring to cheek aiming right; small dragon braces.
- `recover`: Rider lowers bow and reaches toward quiver, dragon settles.
- `hurt`: Rider hunches in pain, dragon recoils with bent legs.
- `fallen`: Dragon lies collapsed on its side, rider slumped across saddle, bow grounded; defeated, no gore.

### dragoon_heavy

| ポーズ | 採用原画ID | 原画SHA-256 |
| --- | --- | --- |
| idle | `exec-f1abeb8e-ade4-4023-8c27-ebcb61afa863.png` | `fdf4581ca5b1a7cf74438f29762cc7f6bdc7e6884e37ae33addf66cf425c0110` |
| attack-windup | `exec-2dbf5171-c45b-4fe8-b223-553cc0dd9c8f.png` | `0635cfa3c2931087a31241bf0c2f50e092e1f73bbe2ed2e34bed9ad7a0fda648` |
| strike | `exec-6d6e9548-c1bd-4297-8d1c-82da45e1c162.png` | `66d4741f759f75643a4a48a9075672dfcb77659603210e030e21030c4c416211` |
| recover | `exec-ef61371f-f2e6-4a67-af5a-416cee392f3a.png` | `af79ad37f69e456c8208f54ee59046a0544e1049ff2c68edd60bfe135c9e1c3d` |
| hurt | `exec-00b32579-39b4-45fb-9137-ae4dd6350416.png` | `d12a4b766ddfa33c7e2ca1e740525b5f736b5970cabad516f05d5cac398f25f8` |
| fallen | `exec-d99c6422-9923-460a-814c-f7e73f14ca81.png` | `0d5d6410d75d9cd0d4bcae5ba37890ff3ff5bd4283e24fdadcafd181e5e46691` |

- `attack-windup`: Rider brings shield forward to right, dragon lowers head and braces.
- `strike`: Rider thrusts shield forward right for a heavy bash, dragon lunges one step.
- `recover`: Rider pulls shield back, dragon plants feet.
- `hurt`: Rider rocks back with shield tilted, dragon recoils.
- `fallen`: Dragon lies collapsed on its side and armored rider slumps off saddle; shield grounded; defeated, no gore.

### inquisitor

| ポーズ | 採用原画ID | 原画SHA-256 |
| --- | --- | --- |
| idle | `exec-2159c72b-5a34-48cc-9f66-d635badc1118.png` | `8bda1f74713c49b9721c42de6be6ecdc1afefbd14ab80b66eda1e99bc8063808` |
| attack-windup | `exec-13a8960f-40ff-40b3-9048-3fe2a573c13a.png` | `a433b270bc8af4dbc4ef4041904136c1314c6b7894662c66f25c2249387420ea` |
| strike | `exec-47cdd859-6ec8-46dd-909c-2e509b6c9cdd.png` | `03a73792ad637933c82309649f55c878e908dc72a7cc401c0862a0bc4a99e9db` |
| recover | `exec-088d71d2-4aab-4c46-8534-f32d67936c8a.png` | `1b9478d479b7185c2e013ea81684e1fa2564395f60505e54f426821b0d82915f` |
| hurt | `exec-cf57fa87-c083-469a-bf1b-356322dfa856.png` | `6c577c89a7b4444c447885aef474275109550171c2ad308beed8bfa4a5351cdf` |
| fallen | `exec-ed1f5d60-cb31-4dc3-b504-926fdf37f357.png` | `c9dc75c02771c4ad9d638eb574ed4d890bd16917c1be2af9c637454c30b47c8f` |

- `attack-windup`: Raises fire staff and free hand at chest, preparing spell.
- `strike`: Thrusts fire staff diagonally right and opens free hand to cast.
- `recover`: Withdraws staff, lowering free hand, robe settling.
- `hurt`: Hunches backward in pain, free hand clutches chest, staff angled.
- `fallen`: Lies defeated on his side, staff on ground alongside, no gore.

### chorister

| ポーズ | 採用原画ID | 原画SHA-256 |
| --- | --- | --- |
| idle | `exec-c23c9c3a-092a-4b79-ab3f-111a26ff1962.png` | `a6003ff0aea118d5eea3e519e2389988b1f34898e169a529cc60af69eac11748` |
| attack-windup | `exec-3b977e45-88e8-4a86-bfaa-adc03eae6ebd.png` | `9dfd96b540fa7f363eceea9b7908047968758f9557bce01057e60b4fa7a59abf` |
| strike | `exec-c4304df6-585c-44ac-a23a-5cd11a878be8.png` | `99c1d4adca6f6858296eb2c1a4c7b9af6fa796b8ba7838cb4f76651142008dff` |
| recover | `exec-1a13b390-8679-439a-aef4-09f4a2895e88.png` | `a7eca9983b80a17013242f0b3bea16bd8c87126af383da497d545d973c218e05` |
| hurt | `exec-73407b71-abae-4367-978f-ddd9e5f9ca5d.png` | `7e2be5b0305ea6616d89005e60b591ade76284edabce2c8a15a6487806fabdf7` |
| fallen | `exec-2f672c32-3eb3-4f0b-ab88-6c30bf4e09ab.png` | `55be1ced1b889387de0d81ca8a3f25ade106869b8c8600d86535ff859af0c504` |

- `attack-windup`: Raises bell beside face and open music book, breathes in to sing.
- `strike`: Swings bell forward right, mouth open singing, holds open music book.
- `recover`: Lowers bell and brings book toward chest.
- `hurt`: Hunches in pain clutching book, bell hand drops.
- `fallen`: Lies defeated on his side, open book and bell on ground beside him, no gore.

### artillery

| ポーズ | 採用原画ID | 原画SHA-256 |
| --- | --- | --- |
| idle | `exec-c154a35c-9ef4-48c1-9ea8-92f368715777.png` | `489373a1860e2b8b1d121b811c4a9598d6b9a88a5d1e4ceb6d6a7a02554ca87a` |
| attack-windup | `exec-971412e4-9b14-421a-9388-05fe0c697f2e.png` | `d50e00d7640abe22238c734b4691560278a8843af38ae0fdee15ac292554b5ac` |
| strike | `exec-3ad3d422-de15-4982-82ad-555cf4ae88c5.png` | `b7e9bb10aabf6b38efcdbc84c8729d8db973c3f485e98f8d606ab2673462965b` |
| recover | `exec-c4197378-18e3-40a4-a1a8-aa210a9b1efc.png` | `693ee0c6858becf94037cb194bbf68b25cac42b85eb6a45fad098786901c76a7` |
| hurt | `exec-0232afb0-79d6-44e8-bb4e-5cb1dd3fc81a.png` | `300494fbf98a7f68950dcdde6bf113b4e3e1a130b1cd6fc8d8c9412a324b3403` |
| fallen | `exec-583d07c3-a7e8-4586-b9b9-06606ec1cd0c.png` | `bac300921a59c80d6a78f02b1be375a49cd32c73e8602ced37b2bfd25627157d` |

- `attack-windup`: Bends to cannon breech bringing lit match to rear touchhole.
- `recover`: Steadies cannon with match pulled safely aside.
- `hurt`: Recoils in pain with one hand raised, cannon still alongside.
- `fallen`: Gunner lies defeated behind the cannon, linstock grounded, cannon remains visible, no gore.

竜騎兵の `strike` は射出直後として矢を除き、弦を緩め、引き手を開くよう画像生成で修正。砲兵の `strike` は切れた大きな砲口炎を、余白内に収まる小さな火花へ画像生成で修正。

## 確認結果

- 5種×6枚の透過RGBA WebP、各512×512。各種で6枚のデータが異なることを確認。
- 全画像の透過余白と下端492を確認。5枚のレビューPNGは768×560。
- 各レビューで装備・配色、準備／発動／戻り／被弾／倒れの違いを目視確認。
- 変更は新規5ディレクトリの35画像と本来歴メモのみ。`src/`、`tools/` に差分なし。
