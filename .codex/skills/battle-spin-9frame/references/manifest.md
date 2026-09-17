# Manifest and checkpoint contract

Keep `manifest.json` in the character workspace. Paths should be relative to the workspace when practical.

Required top-level fields:

- `schema_version`: currently `1`.
- `character`: stable character or species ID.
- `source_sheet`: path or `null`; add a note when the source was lost.
- `frames_dir`, `preview_dir`, `qc_dir`.
- `motion`: `lead_seconds`, `spin_seconds`, `settle_seconds`, and the exact sequence.
- `normalization`: canvas, anchor, baseline, alpha policy, component-filter policy.
- `stages`: status for `spec`, `reference`, `source`, `split`, `transparency`, `normalize`, `preview`, `qc`, and `delivery`.
- `artifacts`: SHA-256 checksums for accepted deliverables.
- `recovery`: whether work was rescued, regenerated, and the last verified stage.

Use these statuses: `pending`, `in_progress`, `complete`, `failed`, `unavailable`. Set `in_progress` before a stage and write `complete` only after its outputs are verified. A missing historical source may be `unavailable` while later derived stages remain `complete`; explain this in `recovery.notes`.

Resume rules:

1. Verify recorded outputs and hashes before trusting a `complete` stage.
2. Restart at the earliest invalid or missing required output, not at generation by default.
3. If normalized cells survive, source/split/transparency loss does not require regeneration unless the owner explicitly requests it.
4. Use a temporary output beside the destination, validate it, then rename it into place.
5. After delivery, record destination paths and hashes so a future session can distinguish accepted assets from working copies.

The standard motion values are:

```json
{
  "lead_seconds": 0.09,
  "spin_seconds": 0.275,
  "settle_seconds": 0.08,
  "sequence": [0,1,2,3,4,5,6,7,0,1,2,3,4,5,6,7,8]
}
```
