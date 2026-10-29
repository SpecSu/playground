# v11 · Closer dance camera and a playful aftershow

2026-10-29. Low-cost presentation work using the existing eight looks and their existing rigs. No model or texture edits, paid generation, sharing changes, or resumed face-reconstruction work.

- Playing uses an approximately 150% larger default projected character. Lobby outfit framing remains unchanged. Gentle beat breathing and occasional phrase-level push-ins add motion without moving the rhythm targets or input buttons; pauses and reduced-motion preferences are respected.
- Results reuse the same loaded performer, outfit, canvas and renderer in the upper-right hero beside the title and score. Statistics and rankings keep their existing dark layout. Background scenery is hidden for the transparent portrait and restored on exit.
- A short, once-per-result turn, look-back and hand-near-face gesture leads into a resting portrait. The current 23-bone assets have no finger joints or facial morph targets: this is an expressive approximation, not literal finger articulation or a newly animated smile.
- A finite cream/yellow SVG popcorn burst marks the turn. It is clipped to the portrait and suppressed for reduced motion; leaving the page clears its lifetime.
- Results-to-game transitions restore the normal renderer mount, framing and ready pose, so the next round does not inherit the gesture.

Verification includes state and UI tests, CPU skinning and projected bounds for the actual assets, and offline rendered gesture samples. UI placeholder screenshots prove layout only. Cloud WebGL/native-phone performance has not been measured; offline proof is not a browser recording.
