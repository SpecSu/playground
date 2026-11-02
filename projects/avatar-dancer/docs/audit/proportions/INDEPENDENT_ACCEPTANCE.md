# Current v3 independent acceptance

Scope: LX shorter neck, Jiji smaller head, lower gameplay camera, preparation ambience; retain prior neck closure, outfit selection/cache and face identity.

## Verified asset result

- **PASS**: LX whole head lowered0.012 model units (roughly20% shorter visible rear neck); Jiji entire head/hat/hair uniformly scaled88% about original Head bind pivot. Matched whole-body front/side comparisons are more balanced; face shape is not squashed.
- Independently inspected all6 ×22 actual-GLB rest/turn/dance views (132 total), including dance05. No obvious new head separation, hollow neck, or jaw/collar penetration in the sampled views. A larger LX lowering candidate exposed an inner-shirt triangle; it was rejected before promotion. The final0.012 candidate removed that artifact.
- All12 public GLB hashes match frozen final candidates (`independent-assets.json`). All original embedded images, rig hierarchy, inverse binds and animations remain unchanged. Six high/low pairs have exact non-image bytes and mesh/skin/node/animation structures.
- All6 final Three.js/Blender skin comparisons pass (`runtime/`):420 named/weighted point correspondences and3780 posed comparisons, maximum error0.000107 raw unit. These are CPU calculations, not browser rendering.

## Camera and UI interpretation

Actual6-model camera tests independently pass at3 clips ×24 phases ×3 horizontal orbit positions. Final sampled feet remain at or above61.88% viewport; head tops remain below the top HUD. The camera lowers the gameplay performer, not the stage geometry, and retains lobby/detail framing.

The62% feet bound is a conservative chosen cap above the hit line/input controls (~80%+), **not** a guarantee of no overlap with falling notes: the transparent note highway begins54%, so lower legs may intentionally occupy its upper region. No stage/UI redesign or performer shrink was introduced to hide that fact.

## Preparation ambience

Source review and unit integration cover trusted-interaction unlock, a cached original synthesized loop, shared mute, gameplay handoff, return-to-lobby, visibility/page lifecycle and pending-play cancellation. Objective signal/CPU details are in `../../LOBBY_AUDIO.md`. No subjective audition, phone-speaker quality, or real-browser playback was independently established. Root browser checked first-click selection and mute UI without new console audio errors; WebGL remains unavailable.

## Final verification

Fresh independent verification after public promotion: **75/75 Node tests**, **12/12 actual-GLB neck closure checks**, **production build passed** (JS656.94KB/CSS27.01KB; existing bundle-size warning only), and `git diff --check` clean. All12 exact proportion/body-preservation checks also independently pass. All6 refreshed384×512 thumbnails have matching promoted-source hashes, dimensions and bytes (`thumbnail-provenance.json`); visual review confirms final proportions, full hats/heads, hems and footwear remain visible and six outfits remain distinct.

**Final scoped verdict: PASS for the implemented v3 geometry, camera, thumbnail and ambience-code changes.** No remaining blocking implementation issue found within the verified scope. This does not mark the requested commercial-song addition complete, and does not imply real-GPU or listening validation.

## Limits and unmet request

- Real WebGL dancer rendering, GPU memory, phone frame rate and subjective ambience listening remain unverified in this cloud environment.
- Original minor garment-edge serration and hair/shoulder intersections can remain; sampled views do not prove every animation frame intersection-free.
- The requested3–4 actual popular songs have **not** been added. This original preparation pad is not a substitute fulfillment of that request. Root reports no authorized game-embedding tracks established; permissions/source remain pending.
- This technical acceptance is not authorization to publish. Root owns packaging and any separately authorized deployment.
