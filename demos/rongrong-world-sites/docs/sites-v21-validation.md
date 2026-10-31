# Sites V21 validation

Gameplay source: `26861b9f419f281fc57fa39637fad4aaca622305`. The four minimal-farm files, animation laboratory, models and metadata are copied from that frozen source. The Sites entry remains an SSR-safe adapter; existing D1/HTTP adapters and ChatGPT sign-in gate are unchanged.

Verified October 25, 2026:

- Full Sites test suite: 692 passed, 0 failed.
- Focused V21 tests: 94 passed; independent integration review: 37 passed.
- Typecheck, scoped lint and production build passed.
- Compiled workerd HTTP: 52 anonymous route/method checks; signed-in access for two test identities across all five entry modes; 35 served GLB hashes match built files.
- Built client: 94 files, no static HTML/RSC gameplay bypass.

This is local compiled-worker evidence, not a real browser OAuth, WebGL, touch, audio-listening or FPS acceptance. Platform authentication depends on Sites owning its identity headers. Static JS/images/GLBs contain no user saves. Actual public access is separately controlled by the platform sharing configuration.

The primary farm and atlas remain browser-local, not account-synced. Legacy cooperation modes retain their device-cookie/D1 storage. Account switching in the same browser does not isolate browser-local saves. Existing storage keys, schema and saved values are preserved; Mac and Sites stores remain separate.

The lab contains 25 provisional Blender models and 332 skeletal clips; it does not replace the five animals currently used in the farm, and does not claim external AI generation or final art quality.
