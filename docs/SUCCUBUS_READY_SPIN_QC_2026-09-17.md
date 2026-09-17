# Succubus ready-spin recovery and QC — 2026-09-17

## Decision

The recovered normalized `0.webp`–`8.webp` files are the authoritative Succubus ready-spin assets. They were not regenerated or reprocessed. Their byte sizes match the previously reviewed deliverables, and their SHA-256 values are recorded in `docs/succubus-ready-spin-preview/manifest.json`.

The lost commit `e5ed4b0` is not represented as recovered. `ready-spin-source.png` was lost with the stopped Work session and is intentionally absent rather than reconstructed.

## Motion contract

- Sequence: `0..7`, `0..7`, `8`.
- Lead: 0.09 s.
- Both turns: 0.275 s total.
- Settle: 0.08 s.
- Each cell: 512×512 RGBA WebP, perceived center around x=256, foot at y=480.

## QC result

- Automated geometry report: pass for all nine cells.
- Exact-speed preview and labeled contact sheet recovered.
- Visual review: coherent front/side/rear progression; no neighboring-cell fragments or foreign objects seen.
- Frame 6: both wing tips and the outer silhouette remain inside the canvas; no observed edge clipping.
- Detached wings, hair, and tail remain present across the relevant cells.
- Frame 8 reads as a distinct provocative finishing pose.
- Black clothing is intact. Black chroma-key removal is prohibited for this character and is recorded in the reusable skill.

`src/` integration is intentionally outside this commit.

## Recovery facts carried into the skill

The reusable procedure explicitly covers stopped Work sessions, rescue of uncommitted artifacts, insufficient cell boundaries, adjacent-cell contamination, detached parts such as wings, and dark-costume chroma-key hazards. It uses stage checkpoints and `manifest.json` so a later character can resume from its last verified output.
