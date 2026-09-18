---
name: battle-spin-9frame
description: "Produce, recover, validate, and deliver one battle character's ten-image 2D command motion: eight directional frames, a command-request finishing pose, and a post-command combat-ready pose. Use for ready-spin art pipelines and QC; not for full 3D animation or game-code integration."
---

# Battle spin: complete command motion

Finish one character per run. The deliverable is `0.webp` through `9.webp`, each 512×512 RGBA:

- Frames 0–7: one apparent turn through distinct directions.
- Frame 8: the character-specific “give me a command” finishing pose.
- Frame 9: the character-specific combat-ready pose held after a command is confirmed while the actor waits for its action.

The command-request motion is `0..7, 0..7, 8`, with 0.09 s lead, 0.275 s for both turns, and 0.08 s settle. After the player confirms an action, play one very short turn using `0..7`, land on `9`, and hold it until the action begins or the pose changes. The exact confirm turn should remain brief—normally about 0.16 s—so it reads as acknowledgment, not a repeat of the command-request performance.

The historical skill directory remains `battle-spin-9frame` so existing prompts and workspaces continue to resolve it. New work uses the ten-image contract above.

Use a checkpointed workspace and `manifest.json`. Resume from the last verified stage; do not repeat completed generation or processing merely because a later stage failed. Before operating, read [manifest.md](references/manifest.md). For inspection, failures, or recovery, also read [qc-and-recovery.md](references/qc-and-recovery.md).

## Workflow

1. Confirm character identity, art direction, frame order, command-request pose, combat-ready pose, destination, and rights/source notes.
2. Initialize a character workspace and manifest with `scripts/ready_spin.py init`.
3. Create one nine-cell source sheet for frames 0–8 only when no accepted source or cells exist. Require clear differences among front, side, rear, and intermediate views; frame 8 must be a distinct command-request pose.
4. Create frame 9 as a separate, tightly referenced combat-ready pose. Keep identity, costume, proportions, palette, equipment, and baseline consistent. The pose must show readiness to execute the selected order, not repeat frame 8 or depict the attack already happening.
5. Split using measured cell boundaries, not assumed equal thirds when borders drift. Inspect every crop before transparency work.
6. Produce transparency without deleting dark costume pixels. Never use black chroma for black or very dark characters. Prefer native alpha or an explicit background color that cannot occur in the character.
7. Normalize to a 512×512 canvas, horizontal anchor x=256 and baseline y=480. Preserve detached meaningful parts such as wings, tails, weapons, hair, droplets, or effects; component filtering is opt-in per frame.
8. Preview the complete flow: command-request spin, frame 8 hold, command-confirm turn, and frame 9 hold. Inspect `7→0`, `7→8`, `8→0`, and `7→9`.
9. Run automated geometry checks and visual QC. Record the result in the manifest; fix only the affected generation/split/transparency/normalization stage when possible.
10. Deliver only after checks pass. Keep generation sources and intermediate material separate from runtime assets.

Run a single subcommand at a time. Each command writes its output atomically and updates only its own checkpoint. Do not combine generation, extraction, preview, QC, and delivery into one long unattended job.

Typical commands, run from the skill directory:

```sh
python scripts/ready_spin.py init /path/to/character-work --character character-id
python scripts/ready_spin.py split /path/to/character-work --source /path/to/grid.png --x-edges 0 408 815 1223 --y-edges 0 428 843 1286
# Add the separately prepared transparent 9.png beside the nine split cells, then normalize all ten images:
python scripts/ready_spin.py normalize /path/to/character-work --input-dir /path/to/transparent-cells
python scripts/ready_spin.py preview /path/to/character-work
python scripts/ready_spin.py qc /path/to/character-work
python scripts/ready_spin.py verify /path/to/character-work
```

Measure and supply the actual four row/column edges for each sheet; the numbers above document the recovered Succubus sheet and are not universal defaults.

## Required QC

- Exactly ten readable 512×512 RGBA WebP files.
- Frames 0–7 form a coherent turn; two cycles do not reveal outline jumps or identity changes.
- No neighboring-cell fragments, grid borders, background remnants, or foreign objects.
- Feet/baseline and perceived center remain stable unless the pose intentionally requires movement.
- Detached parts are present and uncut. Give extra margin to wings, tails, hair, weapons, and effects.
- Frame 8 is a readable character-specific finish and does not accidentally continue the turn.
- Frame 9 is a readable combat-ready hold, distinct from frame 8 and from the eventual attack impact pose.
- The short post-command turn lands cleanly on frame 9 without a position, identity, weapon, wing, or costume jump.
- Preview timing matches the runtime contract rather than an easy-to-inspect slow substitute.

The script supplies deterministic checks and previews; visual acceptance is still required.

## Boundaries

- Do not edit game `src/` files unless separately requested.
- Do not regenerate accepted source art or cells to solve a crop, alpha, alignment, or preview defect.
- Do not claim exact recovery when only derived assets survived. Record missing provenance and continue from verified artifacts when authorized.
- Do not overwrite a delivered character implicitly. Require an explicit target and preserve its manifest/checksums.
