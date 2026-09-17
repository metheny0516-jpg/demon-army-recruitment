# QC and recovery

## Visual pass

View a labeled contact sheet and the exact-speed preview. Check frames individually, then both cycles at speed.

- Compare `7→0` twice for center, baseline, silhouette width, hair, tail, and wings.
- Compare `7→8` for a deliberate finish rather than an accidental jump.
- Inspect all four cell edges for clipped outlines or neighboring-cell contamination.
- Zoom frames containing detached parts. Wings, tails, weapons, hair strands, droplets, and effects may be valid components far from the torso.
- Confirm identity, costume, colors, limb count, and prop continuity.
- For black clothing or dark outlines, reject black chroma-key removal. It can silently erase the costume even when the thumbnail looks plausible.

Automated geometry can detect dimensions, alpha bounds, center, baseline, empty frames, and gross edge contact. It cannot reliably judge identity, foreign fragments, intended detached parts, or motion continuity.

## Targeted repair order

Do not regenerate source art first. Repair the earliest defective local stage:

1. Wrong cell boundary or adjacent fragment: adjust only that crop.
2. Background remnant or erased costume: redo transparency for that cell with native alpha or a safe explicit background.
3. Center/baseline jump: renormalize only that cell from its accepted transparent crop.
4. Clipped wing/tail/effect: restore margin from the original cell and disable destructive component filtering.
5. Preview mismatch: rebuild only the preview from unchanged normalized cells.

After any repair, rerun the exact-speed preview and full nine-frame QC because a local fix can alter a transition.

## Work-session recovery

Long Work sessions may stop after producing valuable uncommitted files. Recover before regenerating:

1. Inspect the expected worktree, Git status, worktree list, refs, reflogs, dangling objects, temporary directories, process file descriptors, and tool-specific output locations.
2. Inventory artifacts by path, byte size, dimensions, alpha bounds, SHA-256, and Git blob hash when relevant.
3. Compare surviving artifacts with earlier logs or manifests. A matching size is useful evidence; a recorded checksum is stronger.
4. Copy verified outputs to a stable checkpoint before continuing.
5. If the commit cannot be recovered but accepted normalized cells survive, create a new commit from those cells. Label it as a reconstruction from recovered deliverables, not as the lost commit.
6. Record missing source/provenance honestly. Do not fabricate or regenerate it merely to make the directory look complete.

The Succubus recovery established these failure cases: a stopped Work session, loss of an unpushed commit, insufficient cell boundaries, adjacent-cell fragments, detached wings, and the risk of black chroma against black clothing. Keep these cases in future QC even when a new character looks simpler.
