# Sites V27 integration handoff

## Ownership and scope

- Existing Site base: `437624707177bc64f2b5e20aed6e281d7f275720`.
- Game source provenance is recorded in `docs/sites-v27-source-sync.json`; copied bytes are hash-verified by `tests/sites-v27-integration.test.ts`.
- This staging worktree is local only. No Sites access policy, runtime variables, remote source, hosted database, or deployment has been changed here.
- The release owner must use the official Sites source workflow for source synchronization, packaging, and deployment. A successful local build is **not** proof of deployment or enabled online play.

## Hosted wiring

`app/api/minimal/[action]/route.ts` delegates to `server/sites-minimal-adapter.ts` behind the existing Worker `withChatGPTAccess` gate and Sites dispatcher. Trusted identity is only the dispatcher-owned `oai-authenticated-user-id`; editable UID, email, sharing account UUID, browser cookie, and arbitrary identity headers cannot select a cloud account. `X-Farm-Account` is an account-switch precondition only.

Worker runtime imports use `sites-minimal-adapter.ts`, `minimal-api.ts`, and `minimal-d1.ts` plus their domain imports. The Node SQLite adapter and standalone Node server are not imported into the Worker route. Existing legacy APIs retain their prior behavior.

The existing `.openai/hosting.json` identity and `DB` binding are unchanged. Optional `Cloudflare.Env` values are declarations, not enabled values:

- `FARM_MINIMAL_ONLINE`: exactly `1` enables the API; absent/other values fail closed.
- `FARM_OWNER_ACCOUNT_ID`: only an independently verified `uid_` plus 64 lowercase hexadecimal digits.
- `FARM_OWNER_SITE_SUBJECT`: optional alternative verified site-scoped subject.

No owner identifier is embedded in source. Runtime configuration belongs to the release owner; no automatic first-visitor binding exists. `/account-info` and `/api/account-info` remain byte-for-byte unchanged and do not initialize the new database.

## Persistence safety

`npm run db:generate` produced one appended migration, `0002_spooky_the_fallen.sql`, with eight JSON-checked key/value tables and one transaction gate. It contains only CREATE TABLE statements. Old SQL, snapshots, and journal entries remain unchanged. The new snapshot and appended journal entry accompany the migration.

The request path performs a single atomic `INSERT ... ON CONFLICT(id) DO NOTHING` to initialize gate **data** after schema deployment; it performs no CREATE/ALTER/DROP. Tests apply the generated migrations to an in-memory SQLite D1 adapter and verify original legacy rows survive unchanged, eight concurrent initializations produce one gate, and an existing revision/token remain unchanged. Missing migration-owned schema returns unavailable without runtime DDL.

The game source preserves original browser farm/atlas keys. Account inventory uses verified-UID-scoped storage and explicit migration flow; no actual user's browser save has been read, imported, associated, or overwritten by this integration task.

## Preserved and added assets

All 35 original GLBs are hash-identical to the Site base, including avatars, farm animals, and the animation lab. Five Hunyuan environment models and one distinct Hunyuan creative creature are added; tree/rock/bush creative catalog copies share existing environment model hashes, yielding nine shipped paths and six unique verified Hunyuan models. Original authored demo props remain explicitly labeled as such. Ten additional farm animal models are **not** claimed ready.

Existing Sites-specific main export/SSR shell, animation-lab routing, legacy client identity handshake, cloud-save wording, API routes, account-info hotfix, and outer access gate are retained. The normal minimal entry now uses `FarmEntry`; only minimal game modules and required audio dependencies are synchronized from the game candidate.

## Verification limits

Checks are CPU/DOM/source/type/build only. No CUA, browser automation, headless Chromium, Playwright, cookies/profile access, or preview browser is used. No browser/GPU rendering, touch, perceived audio quality, mobile FPS, two real authorized visitors, owner binding, or migration completion is implied. Candidate aggregate and final Sites validation must be tied to their respective exact commits in the release handoff.

## Final local evidence

- Runtime/source copy pin: `7ef1f3a73e27651182cc5274aef70b427b77fa4b` (initial frozen source `923fd79be5b061a37636e885013c7847aa71aee5`). All 183 copied files match that Git source exactly.
- Upstream final aggregate candidate: `3cd5d2fe9966af0397aa4cfccb10dc6913dae6c7`; its five fixture repairs and handoff documentation do not change imported runtime source/assets. All 118 copied runtime/asset files independently match it. Its aggregate is separately owned and is not asserted complete here.
- Sites validation finished at **2026-10-25 17:41:27 UTC**: `npm run typecheck` exit 0; `npm test` **725/725 passed**, 0 failed/skipped/cancelled; `npm run build` exit 0. Full local log and exact input digest are in `docs/evidence/sites-v27/local-validation.log` and `docs/sites-v27-test-manifest.json`.
- Independent boundary review found no Critical/Important/Minor issues. It reran eight integration and nine identity/access tests, verified hashes directly against Git blobs, and reviewed the follow-up storage-access failure handling.
- Build retains one advisory client chunk-size warning; no browser/GPU/perceived-audio acceptance has been performed.
