# v5 · Base avatar customization and lobby motion

Date: 2026-10-29. Audience remains owner-private.

## Requested changes

- Jiaxin has only the black long-sleeve T, white trousers and leather shoes base look. Retired blue and burgundy models/thumbnails are removed from the shipped assets and manifest.
- Custom looks open a prompt editor. Drafts stay local; generation is unavailable, no model is substituted, no credits are deducted and no success is fabricated.
- Existing avatar ownership is preserved. Legacy extra-look entitlements migrate to base-only while keeping the saved credit balance unchanged.
- Jiaxin head receives bounded local likeness corrections, retaining the continuous native head/neck, rig and dance clips. This is an approximate generated likeness, not a scan or a claim of exact identity.
- Lobby idle is separate from gameplay: subtle upper-body idle with planted feet in the lobby; successful input drives dance; no-input gameplay settles to a still ready pose; pause freezes animation.
- Successful, current lobby costume changes trigger the turntable showcase. Failed, superseded or in-game loads do not.

## Verification

- Full JavaScript regression suite: 137 tests pass, including all seven actual rig variants, 14 versioned model URLs, state migration, no-spend behavior, lobby/game/pause transitions and stale showcase guards.
- Root browser inspection used a temporary, explicitly stubbed local-only UI fixture because WebGL is unavailable in the cloud browser. The real UI and store showed only base plus customization, preserved a typed draft after close/reopen, and preserved credits. The fixture was removed before packaging.
- Production build passes after final model promotion; all 38 public files match the build byte-for-byte. Retired looks and temporary fixture are absent. Final head evidence is documented in `JIAXIN_ASSETS.md` and `audit/jiaxin-v5/`.

## Limits

Cloud browser WebGL is unavailable. Actual GPU rendering, physical mobile multi-touch and device FPS are not verified. Offline actual-model renders and CPU skinning checks do not replace hardware testing. Final resemblance remains subject to the user's review.

No new Tripo job or paid API call was used for this revision. Raw source portrait and temporary trials remain outside `public/` and the published build.
