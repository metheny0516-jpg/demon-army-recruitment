# 敵将13人の履歴書写真・来歴
2026-09-15 / CodeX / OpenAI 内蔵 image_gen
仕様: docs/SPEC_CAPTAINS_BD_2026-09-15.md §3
人物設定: src/data/enemy_captains.js の既存intro・hire・role。
画風参照: assets/monsters/necromancer.png（リポジトリ内）。
外部写真・素材は使用していない。新規AI生成物として記録。

## 保存・確認
全13枚 PNG 768×1024、不透明の青灰色背景、1枚80,000 bytes以下。
既存scripts/prepare_monster_images.pyのflatten_and_resizeとtop_square_previewを使用。
色を残すため、256×341へLanczos縮小、64色MEDIANCUT（ディザなし）、768×1024へ最近傍拡大してPNG最適化保存。
54×72相当と上部40px切り抜きで顔・種族の見分けを確認。長老の根ひげは顔の下へ伸びるが目・口は上部に保持。
写真の登録・描画は後続の担当範囲。src/data/portraits.jsは変更していない。

## 台詞の扱い
13人×enter/beaten/sparedまたはhired 各3本＝117本、最長25字。
ポルカenterは威勢→装備→本気の順。ガレスは一人も死なせない、ザガンは本当の魔王軍を軸にした。
ヴァルはoffer:nullのまま。ユーザー指定の13人×9本に合わせたspared3本は未使用の予備。提案や雇用を有効化していない。
lines以外のテキスト・値の一致、node構文確認、tools/test-captains.js全通過。

## 採用原画
Codex generated_images/01a093ec-55de-7a81-8575-c48ac9263f10/
polka: exec-62aa7d3b-9736-4814-9cfb-7d50498718da.png
zagan: exec-e25be573-4e4a-4bd1-86e9-eb2e9313ed93.png
gravekeeper: exec-cc17c0ed-042b-44a2-aba8-4d3d6da21891.png
blood_chief: exec-dd57953d-a9a8-442e-890b-695e3a30e779.png
elder: exec-67d9e504-7586-4a0c-a8eb-19e46c1b393a.png
tower_lord: exec-418389a2-3038-4a3d-93b1-fcd298aacaab.png
labyrinth_lord: exec-dad9b8be-25b0-4f9c-8664-eabac4e118db.png
gareth: exec-dc5aa328-e4f8-499f-acbc-0508c9a20ac5.png
bold: exec-2a34049f-c6d7-40b9-a1d2-67d7a5d332c4.png
serena: exec-1f8c4034-bdd9-4cb5-ad95-8f880ae23b39.png
dolph: exec-47f95ba8-0ab8-46d8-8fa1-138acde63e61.png
zack: exec-6c90d87c-9e72-403a-8e34-69f00359c351.png
inquisitor: exec-80fda039-e6ad-44a1-b6cf-74715e0d25b8.png

## 共通プロンプト
ONE original character resume portrait, vertical 3:4 intended 768x1024. Attached image is STYLE ONLY, not character identity. Thick uneven ink, soft hand-drawn Japanese 1990s monster manual, limited muted matte flat colors, modest paper grain. Plain opaque pale blue-grey studio backdrop. Bust-up awkward formal employment photograph, front or slight three-quarter, camera eye contact. Whole face in upper 50%, chin about 42%, shoulders below. Clear bold face readable at 40 pixels. No words, scenery, UI, watermark, glossy metal, gacha beauty, cinematic lighting, excessive detail.

## 個別プロンプト
### polka
POLKA: young adult human male village amateur hero leader. Round freckled face, messy chestnut hair, oversized dented kettle helmet tilted, patched rust-red tunic, a little brass trumpet at lower edge. Overconfident forced grin hiding nervousness, squared shoulders, humble village-made gear, friendly and funny.

### zagan
ZAGAN: older green goblin self-proclaimed general, long pointed ears, stout small body, broad nose, one chipped tusk, grey sideburns, stubborn pompous frown. Worn former demon-army officer coat dark burgundy, ONE much-too-large tarnished brass shoulder epaulette, patched collar. Looks like disgruntled veteran manager demanding respect.

### gravekeeper
GRAVEKEEPER: calm skeletal cemetery keeper, ivory skull with kindly downward eye sockets, no eyeballs, dark brown hood and worn plain work robe, one small unlit candle held low. Slightly tilted skull as if patiently counting names. Dignified quiet, no horror or gore.

### blood_chief
BLOOD CHIEF: large adult orc male leader, muted moss-grey skin, broad snout, two strong lower tusks, shaved head with short black topknot, old healed eyebrow scar. Rough hide shoulder mantle with one dark red cloth binding, thick neck and shoulders barely fit frame. Proud direct challenging stare, no gore.

### elder
FOREST ELDER: ancient mandragora root-person, squat tan gnarled root face, leafy eyebrows, two sleepy tiny black eyes, long thin root whiskers like beard, cluster of dull olive leaves on head, little moss mantle. Grumpy just-woken expression, earthy lovable vegetable elder. No human skin.

### tower_lord
TOWER LORD: adult male human necromancer researcher distinct from reference: narrow long face, receding grey hair tied back, lopsided round spectacles, small sly businesslike smile, dark plum high collar ink-stained robe, one corked bottle low in frame. Tired under-eyes, calculating about pay, no glamour.

### labyrinth_lord
LABYRINTH LORD: immense minotaur bull-man, dark umber fur, broad bovine muzzle, two heavy ivory horns curving sideways fully inside frame, one horn tip chipped, small steady eyes. Simple worn iron chest strap, shoulders too wide, stern patient gatekeeper. Clear bull head not human.

### gareth
GARETH: human male kingdom general in his late fifties, broad weathered kind face, short iron-grey hair and close beard, strong worried brows and steady protective eyes. Plain battered dull silver plate armor, faded navy cloak, one broad shield rim at lower edge. Upright dependable mentor, gentle firmness, no grin.

### bold
BOLD mercenary captain: human man forties, stocky square face, dark cropped hair, thick black moustache, broken nose and small healed chin scar. Worn leather brigandine, dull ochre scarf, plain sword pommel low. Businesslike direct gaze, tight honest half-smile, practical paid soldier.

### serena
SERENA: adult human woman temple healer, round warm face, ordinary slightly tired features, dark brown hair tucked beneath simple ivory linen head covering, muted blue-grey robe. Compassionate determined open eyes, small reassuring smile, a folded bandage held low. Modest practical clothes, no cleavage, no glamour, no halo.

### dolph
DOLPH: adult human male kingdom marksman, lean angular face, auburn sideburns and short hair, one eyebrow raised, soot smudge on cheek, intent open eyes. Faded green padded military coat, simple leather shoulder strap and wooden crossbow stock low at edge. No modern firearm, no helmet covering eyes. Exacting patient professional.

### zack
ZACK: adult human male bandit scout, narrow foxlike face, messy sandy hair, stubble, uneven sly grin, one eyebrow nick. Patched charcoal hood pushed back, scuffed leather vest, ONE small coin pouch clutched low. Slight sideways shoulders while looking camera, opportunistic untrustworthy but personable.

### inquisitor
VAL inquisitor: adult human man, long severe face, shaved head, thin pressed lips, unblinking round eyes NOT narrowed, heavy brows. Austere charcoal and off-white church robes, simple iron clasp, tightly rolled blank parchment low. Rigid judgmental posture, uncompromising, no religious text or real insignia.
