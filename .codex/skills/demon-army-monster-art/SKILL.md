---
name: demon-army-monster-art
description: Create, revise, prepare, or integrate monster portrait art for the 魔王採用試験 / demon-army-recruitment game. Use for monster images, résumé portraits, battle icons, visual-style decisions, image compression, or additions under assets/monsters. Do not apply to unrelated repository artwork.
---

# 魔王採用試験・モンスター画像制作

Treat the repository README and `src/data/monsters.js` as the source of truth for available monster IDs and character writing. Preserve the game's central joke: serious job-application photography applied to unsuitable fantasy monsters.

## Art direction

Avoid generic AI-fantasy polish. The shared visual language is:

- 1990s overseas tabletop-RPG bestiary × Japanese Super Famicom monster manual.
- Thick, slightly uneven ink contours; limited muted colors; restrained flat cel shading.
- Subtle cheap printed-paper texture, with deliberate human awkwardness.
- Plain, opaque pale blue-grey studio background shared across the series.
- Formal résumé-photo framing contrasted with each monster's failure to fit the format.
- No glossy gacha finish, cinematic backlight, lens flare, heroic glamour, plastic skin, excessive ornament, scenery, text, UI, or watermark.

Use one authoritative accepted portrait as the style reference for later portraits when the image tool supports references. Keep the fixed style, background, lighting, saturation, contrast, line weight, and framing unchanged; vary only species, expression, and one identifying prop.

## Production contract

Every final portrait must satisfy all of these:

- PNG, exactly 768×1024 pixels (3:4), opaque background.
- At most 80KB per file; all monster portraits should remain under 1MB total.
- Bust-up, front-facing to slight three-quarter, camera eye contact when the creature has eyes.
- Face or primary identifying mass entirely within the upper 55% of the canvas.
- Readable in both the 54×72 résumé card and a top-aligned 34–40px circular crop.
- Species must be recognizable from its silhouette plus one bold feature such as helmet, color, horns, glasses, or skull brooch.
- Save as `assets/monsters/{id}.png`, using the exact ID from `src/data/monsters.js`.
- Add the ID to `src/data/portraits.js` only after the corresponding image exists and passes validation.
- Preserve the existing emoji fallback for missing or failed images.

Use `scripts/prepare_monster_images.py` to resize, palette-reduce, enforce the size budget, and create the 40px QA preview. Inspect the preview visually before accepting the assets. Slight palette reduction or retro pixel texture is preferable to exceeding the size budget.

## Character comedy

Make the expression or framing carry the joke. Established examples:

- `goblin`: forced polite smile, eyes wandering nervously, oversized ill-fitting helmet.
- `orc`: visibly irritated, shoulders tense, barely fitting the formal portrait.
- `slime`: no face at all, blue body spreading into a puddle, crooked partly sunken necktie.
- `necromancer`: the only applicant with an unnervingly immaculate photo, perfect posture, round glasses, dark hair, small skull brooch.
- `king_slime`: three slimes permanently merged into one awkward applicant; produce last unless requested earlier.

For other species, derive one similarly mundane employment-photo failure from its writing in `src/data/monsters.js`. Do not add unrequested lore or props that weaken 40px readability.

## Execution boundary

Use the built-in image-generation capability when available; it does not require an API key. If the current cloud session has no image-generation tool, do not request that the user expose an API key. Instead, either integrate user-supplied images or explain that generation must run in a local Codex project with image generation available.

Generate distinct monsters with separate image-generation calls. After generation, prepare and inspect assets, run relevant repository tests, then report changed paths and validation results. Commit or push only when the user requested it or the active repository workflow already includes it.
