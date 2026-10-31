# Network position regression — CPU geometry evidence

## Reproduction

The fixture runs the real `MinimalApp` React component, `AccountClient`, `MinimalAuthority`, `MinimalWorld`, movement integrators and `CreativeScene`. Only WebGL drawing, avatar artwork, image decoding, and the transport clock are replaced. The released `/ugc/poop-pal.glb` is parsed by the real `GLTFLoader`: **17,500 triangles**. It is not replaced with a pig, box, or another model. This is CPU/DOM/geometry verification, not browser, GPU, visual or touch QA.

The transport delays a real accepted move receipt by 1,200 ms and its background GET by 3,400 ms. The GET has the same farm revision and a newer `serverTime`, but its persisted state has the old `updatedAt`. Measurements are taken every rendered frame at 60 Hz, including before/after delivery.

| Measurement | Published-source RED | Corrected GREEN |
| --- | ---: | ---: |
| Player network snapshot overwrite | 2 grid cells (4 world units) in one frame | max 0.008333333333334 grid cells/frame |
| UGC delayed snapshot overwrite | 2.1867569204 world units/frame | max 0.0091713677 world units/frame across all scenarios |
| UGC ordinary 250 ms simulation tick | 0.1208432033 world units/frame | max 0.0080625581 world units/frame |
| UGC normal-tick allowed maximum | 0.0088652883 world units/frame | 0.0088652883 world units/frame |
| Player direct delayed reconciliation | 0.7032271242 grid cells immediately | 0 immediately; lawful walking convergence |
| Maximum UGC per-frame speed / current allowed speed | exceeds limit | 0.99999891 |
| Camera follow maximum after initial settle | not used as RED assertion | 0.0451466684 world units/frame |

Additional passing assertions: latest queued destination coalesces without losing the in-flight immutable request; same-target retarget preserves origin; stop waits for canonical settlement and ends both routes; a higher-revision GET survives an older response arriving later; the actual care UI sends exactly one accepted care; a delayed rejected move drops queued follow-on intent and continuously returns to authority; explicit `{teleport:true}` still relocates; a new World/account starts at its own state; asset metadata refresh keeps the same GLB instance.

Additional final checks: a real short walk arrives before the 1.2 s ACK, then submits exactly one `placeEgg` and no `stopMove`; lost-response place/care intents expire after 121 s and retry the same request ID without executing either stale action; UGC detours around a pond to the exact fractional target `(3.2, 2.1)` in 765 frames, with every rendered segment legal and maximum step 0.00455960 grid cells.

## Run

Normal development installations can provide `happy-dom`. For this restored checkout, it was installed in an isolated ignored QA directory with the official Sites dependency helper, without changing application dependencies or shared `node_modules`:

```sh
mkdir -p work/cpu-deps
cp tests/helpers/network-motion-package.json work/cpu-deps/package.json
(cd work/cpu-deps && npm_config_cache=./npm-cache node /home/agent/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/install-dependencies.mjs)
node --experimental-strip-types --test tests/minimal-network-motion.dom.mjs
```

The current environment's exact helper path above is not a portable plugin locator. On another executor, resolve the installed Sites plugin root and use its `scripts/install-dependencies.mjs`.

RED source was captured from commit `493f6e9` in ignored `work/*teleport-baseline*` files before production edits. The fixture's `MOTION_BASELINE=1` switch uses those snapshots, with the same real GLB and timings. `work/network-motion-app-red.log` and `work/network-motion-final.log` preserve complete local traces. The final corrected run passed **7/7 tests**, no skips; network trace had no oversized movement frames. The regular `npm test` suite does not glob `.dom.mjs`, so this command must also be run explicitly.

## Authority and timeline checks

The raw canonical state remains the source of truth; server collision, ownership, economy, revision checks, durable outbox and same-ID retry are unchanged. The authority's existing 2-second / 120-second bounded settlement was moved without changing its rules into a pure shared projector. Online presentation caches **completed** 2-second ticks; 250 ms partial frames cannot shift autonomous decision boundaries. A continuously viewed session may speculate beyond 120 seconds; a new receipt resets that display-only timeline to authority. Long unsampled/offline gaps retain bounded settlement.

The client uses monotonic elapsed time, never device wall-clock adjustments. Higher revisions win over worker timestamp skew without rolling back the presentation clock or daily state. Same-revision GETs no longer replace a pending prediction or replay an old player pose. Player correction uses the existing validated player route and movement integrator; UGC correction validates each segment against the same blocked terrain/egg navigation. Correction arrivals cannot trigger care or placement callbacks.

The regular regression suite passed **800/800** (baseline 787, 13 added account/timeline tests), with no skips. Type checking and production build passed. Full explicit source lint passed. An independent read-only reviewer found no critical or important issues. The build still emits the existing large-chunk and dynamic-route-classification advisories; these are not GPU or hosted-device verification.
