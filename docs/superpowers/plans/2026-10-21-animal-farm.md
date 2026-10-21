# Animal Farm Implementation Plan

Goal: Playable local farm where distinct sheep learn and remember a device player's actions.
Spec: The delegated task in this conversation, including no push, PR, deployment or Computer Use.
Architecture: Independent React/Three.js/Vite demo; Node SQLite local adapter owns commands, time, receipts and snapshots. Reuse disco avatar renderer and three confirmed GLBs; do not alter archived demos.

1. Rules and storage: Write failing behavior tests, then implement personalities, cooldowns, learning, greetings, appearance, bounded wool and idempotent SQLite commands. Verify device identity survives avatar changes and database reopen.
2. Playable scene: Warm procedural farm, articulated sheep, existing player avatars and separate milk-frog guardian. Targeted actions and group rhythm produce visible individual reactions. Touch/click movement, responsive controls and saved-memory feedback.
3. Delivery: Lint, typecheck, full farm tests, copied-avatar baseline tests, production build and HTTP persistence checks. Run original disco suite separately and report historical failures by name. Start loopback preview; Chrome plugin only for browser verification if available.

Review focus: storage failure must not fake success; duplicate and concurrent commands; reload greeting derives only from saved habit; touch UI and small viewport framing; GLB load failure and cleanup.
Progress and verification live in demos/farm/PROGRESS.md.
