# Project instructions

## Highest-priority product vision

Before planning, implementing, reviewing, or refactoring anything in this project, read
`GAME_DESIGN_PRINCIPLES.md` in full. Treat it as the highest-level design authority for
the game. It takes precedence over individual feature specifications, UI details,
balance values, content volume, implementation convenience, and this README when they
conflict.

Use its eight questions in section 15 as a gate for proposed features. Optimize for the
core KPI, 「もう1回遊びたいか」: prefer simple rules, surprising interactions,
player-discovered combinations, emergent stories, and replayability over feature count.
Do not silently dilute or contradict the product vision. If a request appears to conflict
with it, call out the tension before implementation so the product owner can decide.

## Monster art

For any request involving monster portraits, résumé images, battle icons, image compression, or files under `assets/monsters`, read and follow `.codex/skills/demon-army-monster-art/SKILL.md` before acting.

Keep image IDs synchronized with `src/data/monsters.js` and `src/data/portraits.js`. Preserve the emoji fallback for monsters without an accepted portrait.
