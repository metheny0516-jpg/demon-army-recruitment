# Battle art contract

Battle art is display-only. It must not add fields to the battle timeline or change combat calculations.

## Files

- `effects/*.webp`: 512x512 transparent generic VFX.
- `units/{monsterId}/idle.webp`: 512x768 transparent standing pose.
- `units/{monsterId}/attack-windup.webp`: optional anticipation key pose.
- Register accepted unit poses in `BattleScene.BATTLE_SPRITES`.

Missing VFX keeps the CSS fallback. Missing unit art falls back to the accepted resume portrait or emoji.

## Generation prompt base

Use the accepted `assets/monsters/{monsterId}.png` as the identity and style reference.

> Preserve the exact face, species silhouette, identifying prop, muted palette, uneven ink line, restrained cel shading, and cheap printed-paper texture. Draw one full-body battle pose, readable at 96px, centered with generous padding. Genuine transparent alpha. No scenery, text, UI, watermark, heroic glamour, cinematic backlight, or glossy gacha finish.

For `idle`, keep a nervous or workmanlike neutral stance that fits the character. For `attack-windup`, create one exaggerated anticipation pose that can switch briefly before the existing CSS lunge. Do not request a generated sprite sheet; generate and validate each key pose separately.

If transparency is returned as a baked checkerboard, reject it and run a background-extraction edit before preparation.

## Preparation and QA

1. Keep generated intermediates named `*-source.png` or `*-extracted.png` only while reviewing.
2. Run `python -X utf8 scripts/prepare_battle_effects.py` or `prepare_battle_units.py`.
3. Confirm alpha extrema include 0 and 255.
4. Inspect the final WebP at full size and in `tools/browser-tests/effects.js`.
5. Remove generated intermediates after the final WebP is accepted.
