# 施設詳細背景（2026-09-15）
制作: CodeX / OpenAI 内蔵 image_gen
仕様: docs/SPEC_FACILITY_DETAIL_2026-09-13.md §8-1
画風参照: assets/battle/backdrops/hall.webp（リポジトリ内）。
外部素材は使用していない。人物・文字なしの新規生成背景。AI生成物として来歴を記録。

## 書き出し
8枚とも780×600、不透明WebP、quality84/method6。
Pillow ImageOps.fit + Lanczosで13:10へ整形。生成時から下半分を暗く指定。
390×300の確認用合成に白文字を重ね、下側の可読性を目視確認。
背景内にはUI文字を焼き込んでいない。原画はCodex generated_images内に保存。

## 原画
market: exec-2b120147-0a43-4347-9948-51ed48586ec2.png
tavern: exec-a8ab84f3-51d2-4244-8e91-8fdfa6271b62.png
smithy: exec-7034825b-1346-4291-bd4a-1f3f22fd15f7.png
lab: exec-cac7b9ce-8778-4407-a893-425d0b931f83.png
hostel: exec-be5e6eeb-484b-410c-a1e0-23dad48822ff.png
factory: exec-db0aa40a-3367-458b-bf3b-150e9998631d.png
grand_kitchen: exec-e5d6a147-7314-4e97-9ed4-4bf81eaee8d5.png
graveyard: exec-ae8b7b75-1b20-491d-bc7c-848dc4d0f770.png

## 共通プロンプト
Game facility detail background, ONE landscape image aspect ratio 13:10, intended 780x600. Eye-level INSIDE the place, no overhead/isometric exterior. Match attached style reference: thick rough uneven ink outlines, muted matte grey-brown colors, aged paper grain, softly hand-drawn 1990s Japanese fantasy RPG bestiary. Restrained humble lived-in demon army workplace, gently quirky proportions. No people, creatures, silhouettes, portraits, writing, signs, labels or UI. Main identifying objects in upper half and edges. Entire image dim; LOWER HALF distinctly darker with broad uncluttered low-contrast shadow surfaces so white text reads clearly. No white highlights in lower half. No glossy 3D, photorealism, saturated colors, dramatic rays or ornate excess. 

## 個別プロンプト
### market
MARKET: viewpoint standing inside a wooden covered market stall, looking past a dark sales counter toward an empty narrow cobblestone shopping lane. Hanging muted cloth awning above, baskets of dull vegetables, sacks and wooden weighing scales at side edges, neighboring shuttered stalls. Overcast late afternoon outside, no bright sky. Foreground dark counter fills lower third.

### tavern
TAVERN: inside a modest medieval tavern looking across a broad dark wooden bar counter toward shelves of earthenware mugs and large tapped beer barrels. Small hearth far upper left, curved timber beams, a few empty stools at edges. Welcoming worn surroundings but subdued nighttime light. Dark counter face fills lower half, no bottles or highlights obscuring that quiet foreground.

### smithy
SMITHY: inside a small stone forge facing a brick furnace at upper left with low dull orange embers. Heavy anvil silhouette to upper right, hanging tongs and hammers on back wall, leather bellows and metal billets at side. No swords floating or dramatic sparks. Broad dark stone workbench and soot-dark floor occupy lower half in quiet deep shadows. Furnace clearly recognizable but limited glow.

### lab
LABORATORY: inside a small round stone tower study, looking across a wide wooden research desk. Upper half has squat stoppered medicine bottles in dusty plum and olive, simple glass retort with no neon glow, rolled parchment scrolls and closed books without any writing, shelves and small high arched window. Curved masonry distinguishes this from other rooms. A small shaded lamp upper left. Lower half is broad dark desk front and shadow, no bright parchment in text area.

### hostel
HOSTEL: inside a modest demon-army dormitory, central aisle between rows of sturdy WOODEN DOUBLE BUNK BEDS, clearly two sleeping levels, ladders and rumpled dull brown blankets, small footlockers at sides. No sleeping bodies, all beds EMPTY. Low timber ceiling, narrow dull twilight window at far wall. Warm humane humble lodging not prison. Bunks frame upper half and edges; lower half central floor dark and spacious, no bright bedding in text area.

### factory
FACTORY: inside a small medieval materials workshop and exchange house, large meshing WOODEN GEARS and iron axle on back wall upper left, a modest exchange counter upper right with old balance scale, a shallow tray of dull coins, neatly tied bundles of lumber and stone blocks. No modern machinery, electricity or steampunk ornament. Big gears make this unmistakably factory. Open dark foreground floor and counter base occupy lower half, sparse low contrast. Tiny warm lantern high at side.

### grand_kitchen
GRAND KITCHEN: inside communal army kitchen, a truly enormous round black iron soup cauldron upper left under a soot-stained chimney hood, gently curling muted grey steam rising into UPPER half, huge wooden stirring paddle leaning at side, hanging ladles, stacked wooden bowls and root vegetables on side shelf. Tiny embers only behind pot high in composition. No magic brew, gore or skulls. Broad dark wooden serving bench across lower half with shadowed front, low detail for overlay text.

### graveyard
GRAVEYARD: eye-level standing INSIDE a quiet small walled cemetery at night, looking along a path toward an old iron fence and gate. Rounded plain uninscribed gravestones at left and right, dark bare branches along upper corners, small muted moon behind thin clouds in upper right. Dusty charcoal and desaturated violet, no blue glow. Not horror, dignified quiet place of remembrance. No ghosts, skeletons, skulls, bodies or creatures. Lower half deep shadow earth and dark flagstone path, very subdued texture, no moon reflections, for white text.
