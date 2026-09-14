# マンドラゴラ素材の来歴

- 作成日: 2026-09-14
- ブランチ: `codex/mandragora-art`
- 分岐元: `claude/hero-arrival-tavern-prototype-uy2toh` / `54c18ec4b39a89603a9db6d9dd334545af2faa94`
- 制作: OpenAI 組み込み image generation。ユーザーの新種族指定をもとに生成。外部配布素材は使用していない。
- 画風参照: リポジトリ内の `assets/monsters/goblin.png`、`assets/battle/units/archer/idle.webp`。
- デザイン: 引き抜かれた茶色い根、3枚のくすんだ葉、細根の手足、クリーム色のエプロン、木の調理スプーン。声量と丁寧さの落差を、大口の挨拶と恐縮する仕草で表現。

## 納品と変換

- `assets/monsters/mandragora.png`: 768×1024、不透明PNG、63,864 bytes（80,000 bytes以下）。顔の下端は目視で約48%位置、上55%内。淡い青灰色の撮影背景。
- 履歴書原画は微細な紙粒を整理するため192×256へLANCZOS縮小、768×1024へNEAREST拡大後、既存 `scripts/prepare_monster_images.py` でパレット化・容量確認。40pxの上寄せプレビューを目視確認。過度に色が減った初回圧縮は不採用。
- `assets/battle/units/mandragora/`: idle / attack-windup / strike / recover / hurt / fallen の6枚。各512×512、実アルファ付きWebP、quality=90、method=4。
- 既存 `scripts/prepare_species_motion.py` と同じ配置規約。アルファ20超の外接矩形で切り出し、6枚共通倍率 `min(450/最大幅, 440/最大高)`、LANCZOS縮小、中央揃え、下端492。
- `motion-review.png`: 768×560、上記順の3列×2行。明暗背景で透過縁も確認。
- ポーズは画像生成で個別制作。倒れ姿を回転加工で代用していない。背景をスクリプトで除去していない。
- 変更は画像8点と本来歴メモのみ。ゲーム内登録・データ・コードは未変更。

## 生成プロンプト

### 履歴書初稿

```text
Use case: stylized-concept. A formal job application portrait of a mandragora monster chef. Match the reference's thick uneven ink, muted matte flat colors and old RPG bestiary illustration. New subject: a freshly uprooted beige-brown knobbly mandrake root with a round pear-shaped root head, small earnest dark eyes, raised apologetic eyebrows and a very large open oval mouth: greeting extremely loudly but politely, not angry. Three broad wilted sage-green leaves grow from crown; thin root whiskers on cheeks. Wears a plain cream cook's apron, holds one wooden cooking spoon neatly with branching root hands. No human skin or hair. Bust portrait facing camera with courteous posture, all face in upper half of portrait; leaf crown fits. Plain opaque pale blue-grey studio background. 3:4 portrait composition. No text.
```

### 履歴書の顔位置調整

```text
Keep this exact mandragora chef character, colors, ink drawing and opaque blue-grey background. Adjust portrait composition: make the three leaves much smaller and close to the crown. Move the face higher so the entire face including chin is within the top 50 percent of the 3:4 canvas. Eyes around 28 percent down, chin at 48 percent down. Show more apron and folded root hands below. Same polite loud greeting and wooden spoon. No text.
```

### 戦闘待機姿

```text
A transparent PNG full-body battle sprite of this same mandragora root monster chef. Thick uneven ink and muted matte colors like reference. Round beige-brown root head, three SMALL sage-green leaves on crown, tiny root whiskers, earnest courteous eyes, closed shy mouth. Short plump root body with cream apron, branching root arms holding one wooden cooking spoon, two short forked root legs with thin rootlets as toes. Freshly uprooted, no pot. Idle ready stance facing RIGHT in three-quarter view. Entire creature and leaves visible, square canvas. Transparent background.
```

### attack-windup

```text
Transparent PNG battle sprite of exactly this same mandragora chef in a new pose: Leans backward and takes a huge breath, cheeks puffed, mouth tightly closed, shoulders raised, wooden spoon clutched to chest; leaves tilt backward. Keep the same root face, three leaves, cream apron, wooden spoon, thick ink and muted matte colors. Whole body and props visible, same proportions and camera distance as reference, square canvas, facing right. Transparent background.
```

### strike

```text
Transparent PNG battle sprite of exactly this same mandragora chef in a new pose: Leans forward toward RIGHT and opens mouth enormously to shout, eyes squeezed with effort, root arms spread, one hand holds wooden spoon out to side; leaves flare backward. No drawn sound waves or text. Keep the same root face, three leaves, cream apron, wooden spoon, thick ink and muted matte colors. Whole body and props visible, same proportions and camera distance as reference, square canvas, facing right. Transparent background.
```

### recover

```text
Transparent PNG battle sprite of exactly this same mandragora chef in a new pose: Bows head slightly with an apologetic expression, mouth closes, shoulders relax, spoon lowered, free root hand politely covers mouth. Keep the same root face, three leaves, cream apron, wooden spoon, thick ink and muted matte colors. Whole body and props visible, same proportions and camera distance as reference, square canvas, facing right. Transparent background.
```

### hurt

```text
Transparent PNG battle sprite of exactly this same mandragora chef in a new pose: Recoils backward in pain, eyes shut, root knees bent, free hand clutches apron, spoon tilted downward, leaves droop. Keep the same root face, three leaves, cream apron, wooden spoon, thick ink and muted matte colors. Whole body and props visible, same proportions and camera distance as reference, square canvas, facing right. Transparent background.
```

### fallen

```text
Transparent PNG battle sprite of exactly this same mandragora chef in a new pose: Lies completely collapsed sideways on ground, eyes closed, root legs folded, leaves resting limp, spoon fallen beside hands. Same body size as reference; not a rotated standing pose. No gore. Keep the same root face, three leaves, cream apron, wooden spoon, thick ink and muted matte colors. Whole body and props visible, same proportions and camera distance as reference, square canvas, facing right. Transparent background.
```


## 採用原画の記録

| 用途 | 原画ID | SHA-256 |
| --- | --- | --- |
| portrait | `exec-8f4f7aec-3b1f-46a4-a108-815c578912e0.png` | `829be75880e506f769f0a87e92fcc9c55c01d6bd8aeb6420d994cc4565608454` |
| idle | `exec-6c6a7500-e5a7-486a-b0bd-1d02c7e06f82.png` | `194c630cb8f4475949611dc0347f6e1d4b59f930ff409c899e83d07aaa81a5c5` |
| attack-windup | `exec-191f3e18-58f3-4246-9f5f-07cb619972d5.png` | `abcfca678f19671020f59bc237d2b10d275e55ee4bd66b3fb720bcb92eed261c` |
| strike | `exec-cac38d4f-e0cb-4c70-bc8e-7518b63924f4.png` | `b2aa5483802dcf6670fb35bd5e58f7e49240ae12ecf0cc1c495f5c07709b3539` |
| recover | `exec-cb8f61e5-cbd2-4403-bde7-b5c583223f5f.png` | `2a51f79209113172e189fbd1cddb759c749b470e2a06b2a1ed456c8d7f31a86a` |
| hurt | `exec-eae31f60-6eaf-4d39-b58c-4c216c770735.png` | `4b5e529af0d61dd1ac386e7f3258f081e8f5167adf66ef4d70ffe1fe8022d2f9` |
| fallen | `exec-fb07d6ed-75b0-4f0c-af32-ec2fe8aabda6.png` | `6f080b818cc4ade5014d35df60c1efff7b15201467380695117595b5d0ec07a8` |

検証: 履歴書寸法・不透明・容量、6枚の戦闘寸法・透過・余白・下端位置・別データを確認。レビューで各ポーズの動作と装備の統一を確認。
