# Handdrawn Cast — separate post-v8 batch

User explicitly requested all twelve roles redrawn in the map's handdrawn2D style, not3D screenshots, and authorized direct publication. Publishedv8 (`785206e`) is the unchanged gameplay/economy/save baseline. Artist owns proofs, finalart and avatar manifest; parent approves art and publishes.

## Runtime contract
- Preserve all12 stable IDs, names, proportions, settings and save namespace. No economy, schema, interaction or oldmanor changes.
- `portrait` accepts old image-path strings and new `{image,frame:{x,y,w,h}}`. Front/back remain framed/anchored refs and may share the same RGBAatlas asportrait.
- Every visible portrait (HUD, selector and threefriendcards) uses manifest-driven matching2D frames; no hardcoded oldwebp fallback. Scene fallbackportrait also respectsframe.
- Load only unique image URLs for critical selectedavatar, includingportrait. Commit avatar selection only after all required sources succeed; failed or staleasyncchoices leavecurrentactor unchanged. Otherportraits remainlazy.
- Asset completion repaints canvases only; do not rerender DOM or steal inputfocus when a portrait finishes loading.
- Build whitelist resolves bothreferenceformats, deduplicates sharedatlas, excludes work/proofs/prompts and unreferenced oldscreenshots.

## Acceptance
TDD legacy/structured image refs, allportraitsurfaces, selectedsharedatlas/failedportrait behavior, lazyrepaint/focus safety; full test/check/build; independent review and parentnativeartQA beforepublication. No publishing byimplementer.
