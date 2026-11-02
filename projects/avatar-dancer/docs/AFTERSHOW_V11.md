# V11 aftershow portrait

Approved scope: screenshot marks the upper-right hero beside title/final score, not the lower ranking whitespace. Keep score, statistics, ranking rules and dark theme unchanged. Wrap existing hero content without adding vertical space; transparent portrait window occupies right 46% of the hero. Foreground text remains above portrait; portrait/particles never intercept clicks or spill into statistics.

Reuse the same loaded performer/outfit and one WebGL renderer. UI provides `getResultPortraitTarget()` only while results. Main enters results, shows UI, then calls `stage.setResultPortraitTarget(host)`; every non-results transition restores via `null`. Stage owns transparent rendering, framing and animation. Do not reload/reselect a costume on aftershow. No face or finger blendshape exists: expressive motion is not genuine facial deformation.

Stage option `onAftershowEvent({type:'popcorn',runId})` invokes `ui.showAftershowEvent`. UI emits one finite, clipped SVG popcorn burst per run, no timers repeating forever. Hidden/reduced-motion states suppress burst, exit cleans animation/timer. Preserve semantics and keyboard navigation; decorative SVG/window aria-hidden.

Tests: real UI DOM boundary for host lifecycle, one event per run, repeated results/exit cleanup/reduced motion; main boundary for attach exactly after results and detach before start/lobby, no avatar reload. CUA official preview with explicitly labelled UI-only portrait placeholder validates 375x667 and desktop layout, foreground safety and motion clipping, not real WebGL rendering. Remove fixture before build.
