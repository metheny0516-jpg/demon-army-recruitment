# Battle art contract

Battle art is display-only. It must not add fields to the battle timeline or change combat calculations.

## Files

- `effects/*.webp`: 512x512 transparent generic VFX.
- `units/{artId}/*.webp`: 512x512 transparent motion poses in the rebuilt battlefield (legacy standing art was 512x768).
- `units/{monsterId}/attack-windup.webp`: optional anticipation key pose.
- Register accepted unit poses in `BattleScene.BATTLE_SPRITES`.

Missing VFX keeps the CSS fallback. Missing unit art falls back to the accepted resume portrait or emoji.

## Generation prompt base

As of the owner's 2026-09-04 direction, battle actors are independent full-body 2D designs. Do not require the resume portrait as a reference. Preserve species readability, rough ink and restrained shading, but prioritize clear motion silhouettes.

> Preserve the exact face, species silhouette, identifying prop, muted palette, uneven ink line, restrained cel shading, and cheap printed-paper texture. Draw one full-body battle pose, readable at 96px, centered with generous padding. Genuine transparent alpha. No scenery, text, UI, watermark, heroic glamour, cinematic backlight, or glossy gacha finish.

For `idle`, use a readable ready stance. Motion needs anticipation, strike, recovery, hurt and fallen poses. An accepted sheet may be sliced only after checking spacing, consistent proportions and a common ground baseline; never auto-fit every pose to a different scale. The current goblin uses six key poses, not a finished frame-by-frame animation.

If transparency is returned as a baked checkerboard, reject it and run a background-extraction edit before preparation.

## Preparation and QA

1. Retain accepted source sheets for reproducibility. Discarded drafts need not be checked in.
2. For the new goblin/swordsman/hall pipeline use `scripts/prepare_goblin_motion.py` with the arguments documented in `docs/BATTLE_MOTION_REVIEW.md`. VFX retain `prepare_battle_effects.py`; `prepare_battle_units.py` is the legacy tall-portrait pipeline.
3. Confirm alpha extrema include 0 and 255.
4. Inspect the final WebP at full size and in `tools/browser-tests/effects.js`.
5. Check `battle-preview.html` at x1/x2/x4 and on mobile. Run `battlefield`, `effects`, and `vfx-lifecycle` browser tests. Never register failed assets.
