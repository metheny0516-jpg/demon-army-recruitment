# Manifest and checkpoint contract

Keep `manifest.json` in the character workspace. Paths should be relative to the workspace when practical.

Required top-level fields:

- `schema_version`: currently `2` for the ten-image contract. Version 1 is the legacy nine-image format.
- `character`: stable character or species ID.
- `source_sheet`: path or `null`; add a note when the source was lost.
- `frames_dir`, `preview_dir`, `qc_dir`.
- `motion.command_request`: lead, spin, settle, and `0..7,0..7,8` sequence.
- `motion.command_confirm`: the short `0..7,9` acknowledgment turn and hold timing.
- `normalization`: canvas, anchor, baseline, alpha policy, component-filter policy.
- `stages`: status for `spec`, `reference`, `source`, `split`, `transparency`, `normalize`, `command_pose`, `preview`, `qc`, and `delivery`.
- `artifacts`: SHA-256 checksums for accepted deliverables.
- `recovery`: whether work was rescued, regenerated, and the last verified stage.

Use these statuses: `pending`, `in_progress`, `complete`, `failed`, `unavailable`. Set `in_progress` before a stage and write `complete` only after its outputs are verified. A missing historical source may be `unavailable` while later derived stages remain `complete`; explain this in `recovery.notes`.

Resume rules:

1. Verify recorded outputs and hashes before trusting a `complete` stage.
2. Restart at the earliest invalid or missing required output, not at generation by default.
3. If normalized cells survive, source/split/transparency loss does not require regeneration unless the owner explicitly requests it.
4. Use a temporary output beside the destination, validate it, then rename it into place.
5. After delivery, record destination paths and hashes so a future session can distinguish accepted assets from working copies.

The standard version 2 motion values are:

```json
{
  "command_request": {
    "lead_seconds": 0.09,
    "spin_seconds": 0.275,
    "settle_seconds": 0.08,
    "sequence": [0,1,2,3,4,5,6,7,0,1,2,3,4,5,6,7,8]
  },
  "command_confirm": {
    "spin_seconds": 0.16,
    "sequence": [0,1,2,3,4,5,6,7,9],
    "hold_frame": 9
  }
}
```

For a recovered version 1 character with only frames 0–8, do not invent frame 9 or mark version 2 complete. Preserve its accepted files, record `command_pose: pending`, and upgrade it only through a separately approved frame-9 production pass.
