# v9 · Lighter loading, new looks and a full-length round

2026-10-29. This update preserves the existing owner-private Site and its URL.

## User-facing changes

- POPSTARS now starts at the beginning of the supplied recording and runs 59.348 seconds, with 112 notes and three simultaneous two-key events. Entrance and ending fades are retained. FANTASTIC and the alternating playlist are unchanged.
- Model and song loading no longer cover the middle of the stage. Status lives beside the relevant outfit or song controls, fast cached loads avoid flashing, and failed loads can be retried locally. The old actor stays visible until its replacement is ready. The actually worn look and pending look are distinct.
- Jiji's three looks share a newly reconstructed face from the original reference. The green look has a charcoal newsboy cap; the white look has a cream beret. The red hat is retained. Hat fit, stray old hair fragments and neck integration were reviewed in actual model renders.
- My Avatar gains one unlockable look, **埃及法老**: a wheat-tone bare upper body, oversized gold-and-blue headdress, gold collar, chest ornament, cuffs and waist ornaments. It uses the existing avatar's face, glasses, proportions and dance rig. The earlier blue-shirt candidate is not the released look.
- The costume panel has the Pharaoh prompt prefilled. Its local creation flow waits for both the preparation interval and an actually loaded model before granting the look and deducting 100 local points once. Cancelled or failed work does not charge or grant it. Old retired outfit IDs do not accidentally unlock it.
- **+ 我的分身** opens the photo panel without starting creation. One manual **创建分身** click starts the process. The extra **确认导入** step is gone.

## Verification references

- `audit/v9/INDEPENDENT_ACCEPTANCE.md` and `FINAL_ASSET_AUDIT.json`: final asset audit and limitations.
- `JIJI_V9.md` and `qa/jiji-v9/receipt.json`: new face, hat integration, exact asset hashes and original-rig checks.
- `PHARAOH_V9.md`: bare-torso revision, skinning, representative and dense dance-pose inspection.
- `LOADING_UX_V9.md`, `GAMEPLAY_AUDIO.md` and `avatar-creation.md`: UI, audio and local entitlement behavior.

No new runtime AI API, real payment, real photo upload, public sharing expansion or user-computer access was added. Offline renders, CPU skinning tests and DOM layout inspection are not measurements of native-phone/WebGL frame rate. Single-photo likeness remains an approximation; source-mesh micro-boundaries are documented rather than claimed perfectly watertight.
