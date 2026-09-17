---
name: battle-spin-9frame
description: "Produce, recover, validate, and deliver one battle character's nine-frame 2D ready animation: eight directional frames played twice at high speed, then a character-specific finishing pose. Use for ready-spin art pipelines and QC; not for full 3D animation or game-code integration."
---

# Battle spin: nine-frame 2D motion

Finish one character per run. The deliverable is `0.webp` through `8.webp`, each 512×512 RGBA: frames 0–7 describe one apparent turn and frame 8 is the character-specific finishing pose. Runtime order is `0..7, 0..7, 8`, with 0.09 s lead, 0.275 s for both turns, and 0.08 s settle.

Use a checkpointed workspace and `manifest.json`. Resume from the last verified stage; do not repeat completed generation or processing merely because a later stage failed. Before operating, read [manifest.md](references/manifest.md). For inspection, failures, or recovery, also read [qc-and-recovery.md](references/qc-and-recovery.md).

## Workflow

1. Confirm character identity, art direction, frame order, finishing pose, destination, and rights/source notes.
2. Initialize a character workspace and manifest with `scripts/ready_spin.py init`.
3. Create one nine-cell source sheet only when no accepted source or cells exist. Require clear differences among front, side, rear, and intermediate views; frame 8 must be a distinct pose.
4. Split using measured cell boundaries, not assumed equal thirds when borders drift. Inspect every crop before transparency work.
5. Produce transparency without deleting dark costume pixels. Never use black chroma for black or very dark characters. Prefer native alpha or an explicit background color that cannot occur in the character.
6. Normalize to a 512×512 canvas, horizontal anchor x=256 and baseline y=480. Preserve detached meaningful parts such as wings, tails, weapons, hair, droplets, or effects; component filtering is opt-in per frame.
7. Preview the exact runtime order and timing. Inspect both `7→0` transitions and `7→8`.
8. Run automated geometry checks and visual QC. Record the result in the manifest; fix only the affected split/transparency/normalization stage when possible.
9. Deliver only after checks pass. Keep generation sources and intermediate material separate from runtime assets.

Run a single subcommand at a time. Each command writes its output atomically and updates only its own checkpoint. Do not combine generation, extraction, preview, QC, and delivery into one long unattended job.

Typical commands, run from the skill directory:

```sh
python scripts/ready_spin.py init /path/to/character-work --character character-id
python scripts/ready_spin.py split /path/to/character-work --source /path/to/grid.png --x-edges 0 408 815 1223 --y-edges 0 428 843 1286
# Remove the background from the nine split cells with native alpha or a safe non-black method, then:
python scripts/ready_spin.py normalize /path/to/character-work --input-dir /path/to/transparent-cells
python scripts/ready_spin.py preview /path/to/character-work
python scripts/ready_spin.py qc /path/to/character-work
python scripts/ready_spin.py verify /path/to/character-work
```

Measure and supply the actual four row/column edges for each sheet; the numbers above document the recovered Succubus sheet and are not universal defaults.

## Required QC

- Exactly nine readable 512×512 RGBA WebP files.
- Frames 0–7 form a coherent turn; two cycles do not reveal outline jumps or identity changes.
- No neighboring-cell fragments, grid borders, background remnants, or foreign objects.
- Feet/baseline and perceived center remain stable unless the pose intentionally requires movement.
- Detached parts are present and uncut. Give extra margin to wings, tails, hair, weapons, and effects.
- Frame 8 is a readable character-specific finish and does not accidentally continue the turn.
- Preview timing matches the runtime contract rather than an easy-to-inspect slow substitute.

The script supplies deterministic checks and previews; visual acceptance is still required.

## Boundaries

- Do not edit game `src/` files unless separately requested.
- Do not regenerate accepted source art or cells to solve a crop, alpha, alignment, or preview defect.
- Do not claim exact recovery when only derived assets survived. Record missing provenance and continue from verified artifacts when authorized.
- Do not overwrite a delivered character implicitly. Require an explicit target and preserve its manifest/checksums.
