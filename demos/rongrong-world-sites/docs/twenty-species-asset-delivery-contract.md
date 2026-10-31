# Existing animal candidate delivery — v1

**Staging only.** This packet does not enable a species, grant commerce, or certify hosted/mobile performance. Keep the already admitted cow/bunny/alpaca/penguin bytes and evidence unchanged. Target: 11 Hunyuan identities + existing sheep/pig/duck + six authored Blender candidates (dog/fox/hedgehog/lion/tiger/raccoon); no wolf.

## One folder per candidate

Deliver `candidate.glb`, `portrait.png`, `candidate.json`, and the actual reports/screenshots referenced by the JSON. Library handoff must include the confirmed Library file ID(s), original filenames, and archive member paths. Cloud independently materializes and hashes bytes; a producer's local filesystem path is not a transfer or hosted receipt.

```ts
type Candidate = {
 schema: 'farm-animal-candidate/v1';
 species: 'bear'|'capybara'|'cat'|'deer'|'crocodile'|'chicken'|'parrot'|
          'dog'|'fox'|'hedgehog'|'lion'|'tiger'|'raccoon';
 source: {kind: 'hunyuan-mesh'|'authored-blender'; originalSha256: string;
          reducedSha256: string; identityReport: string};
 model: {file: 'candidate.glb'; sha256: string; bytes: number; triangles: number;
         vertices: number; bones: number; draws: number; skinnedMeshes: number;
         unskinnedMeshes: number; textures: {width: number;height: number;mime: string}[]};
 portrait: {file: 'portrait.png'; sha256: string; bytes: number; width: number;height: number};
 rig: {root: string; head: string; neckChain: [string,string,string];
       footChains: {upper: string;lower: string;foot: string;contact: string}[];
       clips: {name: string;durationSeconds: number}[]};
 profile: {candidateSha256: string; height: number; interactionRadius: number;
   transferUnderside: number; drinkDatum: {x: number;y: number;z: number};
   motion: {stride: number;cyclesPerSecond: number;muzzleReach: number;
     feet: {side: number;front: number;back: number};
     walkFeet: {side: number;front: number;back: number};
     walkContactFeet: {side: number;front: number;back: number};
     reachAdjustment: {back: number;forward: number;pondForward?: number}};
   water: {bowl: 'verified'|'disabled'|'unmeasured';creek: 'verified'|'disabled'|'unmeasured';
           pond: 'verified'|'disabled'|'unmeasured'}};
 evidence: {check: 'identity-compression'|'skin-clips'|'anatomy-visual'|'ground'|
                   'water-contact'|'carry-placement'|'picking'|'care-interruption'|
                   'sale-lifecycle'|'growth-save'|'mobile-performance';
            status: 'passed'|'failed'|'unmeasured';candidateSha256: string;
            runtimeCommit?: string;report: string;reason?: string}[];
};
```

## Required artifact and measurements

- Self-contained GLB2, +Y up/+Z forward, ground Y=0, meter units. No external network texture/buffer references. Every visible animal mesh has real normalized skin weights (≤4 influences); no detached rigid body parts. Declare actual bone/clip names, not guessed donor names.
- Required nine authored, genuinely deforming clips: `idle`, `walk`, `drink_enter`, `drink_loop`, `drink_exit`, `eat`, `rest`, `carried`, `react`. Semantic anchors: `feeding-mouth`, `animal-support`, `animal-head`, `animal-ground`; connected two-neck-bone→head and upper→lower→foot chains. Include ≥3 rigid sole vertices per foot for actual ground-contact checks. Parrot initially uses grounded locomotion; flight is not automatically promised or a substitute for walking/carry clips.
- `drinkDatum` is the actual mouth position at `drink_loop` t=0 in unscaled actor-local coordinates; `muzzleReach=drinkDatum.z`. `cyclesPerSecond` uses actual exported walk duration, not rounded manifest duration. Measure stride from planted-foot travel. Feet envelopes and support-to-lowest-skin transfer underside come from actual posed skin, not markers or donor values. Record padding separately in reports.
- Sample every key time, interval interiors and ≥24 fps across required clips; test finite skin, fixed bone lengths, root motion, actual sole grounding. Exercise gameplay scale endpoints **0.6, 0.75, 1, 2.2**, action crossfades, interrupted/repeated care, pickup/putdown, shop sale, picking and save/restore. Report water sources separately: a blocked bowl is acceptable if stated and safe usable sources are verified; no universal safety claim from sparse samples.
- Existing strict ceiling remains **4 MiB GLB, 18,000 triangles, 64 bones, 12 draws, 1024 px maximum texture edge** for new Hunyuan candidates; aim ≤3 MiB and ≤8 MiB decoded RGBA textures. Zero-texture Blender candidates are valid. Do not degrade the four already approved models. Compression must preserve identity, UV/materials, skins and actual clip poses; give before/after bytes, triangles and hashes. Transport gzip/Brotli savings are not GLB geometry reduction or measured served compression.
- Runtime evidence also names the exact tested code commit. Portrait must show the delivered candidate, not old donor art. Actual visual anatomy review is separate from CPU checks. Mobile FPS/GPU, browser touch and hosted HTTP remain **unmeasured** until observed; never manufacture successful checks or rewrite local evidence into hosted receipts.
