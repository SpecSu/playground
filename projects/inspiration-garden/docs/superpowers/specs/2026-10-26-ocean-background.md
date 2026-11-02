# Selected ocean B integration

The user selected B (云影翡翠海) for the current demo. Preserve the accepted mature-only packing fix and all gameplay/save behavior.

Use the complete selected artwork, encoding only to a versioned WebP at its original 1024×1536 dimensions. A centered, cover-sized, non-repeating CSS background belongs to the stationary game shell, behind a transparent Canvas; camera movement never moves or tiles it. Keep only restrained theme wash/glints above it, and keep cream panels unchanged. CSS background loading is decorative and never awaited by startup; the existing pale sea background color remains visible on missing/failed image.

Approach: CSS background rather than a decoded image copied into every Canvas frame, avoiding a new startup dependency and repeated full-image draw. Only the selected versioned asset enters the explicit build whitelist; no A/C, private references or generation metadata. No creative raster changes, new features, state/schema/economy or hosting operations.

Acceptance: asset encoding/size budget, explicit build inclusion/exclusion, transparent Canvas clearing/nonopaque water overlay, camera invariance and working rendering without any decorative image loader; full test/check/build and independent review. Parent owns native visual QA and publication.

## Additional current-round seed-card polish
The user asks for a clear stock-dependent block color and planting by tapping the whole stocked card. In the seed bag only, positive stock uses pale green; zero stock uses muted gray-cream. A native main button contains the stocked card's art/name/stock/source/plant label; its independent sibling detail/remix button never plants. Zero-stock blank card area has no action; existing explicit coin-buy/source route remains. Preserve ordering, locked/known rules, sealed art and all state/economy. Native keyboard button activation remains available; no custom key/preventDefault handlers.

## Additional blueprint entrance spacing
Separate the foundational four-choice construction grid from the existing create-blueprint CTA with16px top margin,12px padding and a subtle divider. Keep the same one CTA/cost copy and responsive scrolling tray; no forced minimum section height or new controls.
