# Kelly Wonderland implementation plan

Spec: `docs/superpowers/specs/2026-10-27-kelly-wonderland-design.md`.

1. Freeze the existing Kelly support/placement/music identity and the other three islands/photos in regression fixtures. Write failing chessboard-isolation and measured-instrument tests.
2. Add a Kelly-only terrain surface helper. Wire tile tops/sides/edges and suppress decorative grass/timber only for that override. Preserve geometry and all non-Kelly palettes.
3. Accept root-approved five-art and one-photo whitelists. Verify source hashes before copying, then replace only their manifest references with measured frames, anchors, alpha bounds and reaction landmarks. Remove stale runtime references without deleting unrelated source files.
4. Route authored instrument pointers through inverse sprite transforms into full-frame normalized coordinates. Use measured five-key/two-drum/three-rehearsal centers for selection and feedback. Preserve fallback behavior for all older artwork and all sound plans.
5. Update Kelly's public title/description/source story, not support/plant/economic identity. Update its single offline selfie entry and nothing else.
6. Run focused tests, the full test suite, syntax checks, build and diff check. Render actual Kelly scene diagnostics on its existing 28 cells, send the final frozen candidate to the independent reviewer, and fix only verified important findings. Do not push or publish; root owns deployment.

All shared integration changes remain uncommitted until root review. The previous six-exhibit/Christmas partial freeze is recorded under `work/sculptural-integration/`.
