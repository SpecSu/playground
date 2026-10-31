# V27 accounts / wishing / creative integration

## Delivered contracts

- Site-scoped subject supplied only by the existing trusted Sites dispatcher -> SHA256-derived stable `uid_...`. UID is visible/copyable, not a credential and never an editable login field.
- `X-Farm-Account` is an expected-account precondition, not identity. If the current signed-in account changes, an old tab cannot apply a pending command to the new account.
- `MinimalAuthority` remains the canonical inventory/economy. The SQLite/D1 adapters commit whole receipts, both sides of a trade, provenance and quota atomically.
- Animal-only legacy offers are supported. `depositAsset` / `acceptAsset` support normal eggs/animals, custom eggs/creatures and props. Escrowed items stay owned but locked until swap/withdraw/expiry. Accepted kinds are explicit; success counts once for both accounts daily UTC+8.
- Creative jobs are explicitly a **fixed-sample mock workflow**, asynchronous-compatible and trusted-clock/catalog-driven. User wishes/names are text data only; no APIs, arbitrary external URLs, prices, completion flags or account IDs are accepted. The creature sample is an actual externally generated HY3D GLB; tree and rock are genuine optimized Hunyuan models as well; earlier authored assets are retained for audit. Their release SHA256 values are validated by tests.
- Original browser saves remain intact. Account play never opens/writes their farm or atlas keys; online atlas/outbox keys are scoped by verified UID. A confirmed owner-only one-time import namespaces assets and records unverified historical provenance; it never overwrites an existing cloud farm.

## Hosted deployment wiring (parent-owned; not executed here)

1. Preserve existing Site access settings and `withChatGPTAccess` outer Worker gate. **Do not open public access.** No credentials are added or generated.
2. Copy new `src/minimal` files, server authority adapter files, and `public/ugc`. Keep the existing Sites main-entry React export shape, but import `FarmEntry` rather than `MinimalApp` as the normal farm destination; animation lab and legacy routes remain unchanged.
3. Add the eight JSON-row table declarations and one gate table from `server/minimal-schema.sql` to the existing `db/schema.ts`, then run `npm run db:generate`. Inspect and commit only the appended schema migration/journal; never edit historical migrations. The SQL is schema-only (no seed INSERT). `MinimalD1Repository` initializes gate data outside migrations with one atomic `INSERT ... ON CONFLICT(id) DO NOTHING`, so concurrent first requests create one row and never reset existing revision/token. Request handling performs no CREATE/ALTER; missing schema fails closed. Never replace/drop legacy tables.
4. Add `app/api/minimal/[action]/route.ts`:
   ```ts
   import {env} from 'cloudflare:workers';
   import {handleSitesMinimalRequest} from '../../../../server/sites-minimal-adapter.ts';
   const handle=(request:Request)=>handleSitesMinimalRequest(request,env);
   export const GET=handle;
   export const POST=handle;
   ```
   Add the non-secret optional bindings below to `Cloudflare.Env`. The adapter must run **only** behind Sites dispatch, never on arbitrary header-trusting standalone/proxy routes.
5. Default is disabled. After the schema and signed-in API access are verified, `FARM_MINIMAL_ONLINE=1` enables account operations for the Site's **existing allowed users only**. This does not change sharing policy.
6. Without owner binding, the verified account gate first shows the canonical UID and preserves the existing save. An explicit “继续本机牧场 · 不关联账号” choice opens the unclaimed local farm; it is never automatically associated with the new UID. Settings continues to show the verified UID. It does not auto-create an empty farm. Copy that UID from the user's actual signed-in session and configure `FARM_OWNER_ACCOUNT_ID=uid_...`; alternatively use an independently verified site-scoped `FARM_OWNER_SITE_SUBJECT`. **The Sites sharing UI account_user_id and email are not this identifier. Never bind the first visitor.** Binding reserves `twx` and permits one explicit owner legacy import. New accounts cannot upload inventory JSON.
7. In Settings choose “连接云端牧场” then “将原牧场带到云端”. The original local keys are unchanged. Immutable per-request, per-account outbox records survive interleaved browser tabs and replay a lost response with the same request ID. No service credentials or model-generation keys go into the browser.

- Individual quality badges show both color and symbol. New normal eggs use the shared 55/25/13/6/1% domain distribution; old and fixed creative samples are white. Transfers preserve quality and accumulated incubation; escrow blocks collection/placement/hatching.

## Operational boundaries

- Standalone Node `/api/minimal/*` is explicitly disabled; local game remains available. It never trusts the hosted identity header.
- User-facing data is private/no-store and varies by identity/cookie. Same-origin request restrictions and body caps are enforced before mutation.
- Cloud import has no universal proof of historical local provenance; accepted owner legacy history remains marked `grandfathered-unverified`. An existing pre-V26 canonical database may require import-fingerprint alias reconciliation before enabling migration.
- The current Site access policy may allow only the owner. Mixed-account exchange is verified in isolated multi-actor tests; this does not imply a second real user is currently authorized.
- Creative display assets are decorative; they do not add a separate realtime multiplayer simulation or change terrain ownership. Only the authority chooses legal placement; visual scale/grounding transforms do not rewrite GLB bytes.
- Original HY3D model remains preserved outside the public bundle. The shipped creature has 17,500 triangles, one 1024 texture, ~1.37 MiB, no skeleton/animation; idle is a small whole-model motion, not invented rigging.

## Verification ledger

Focused identity/D1/escrow/UGC/client/DOM and asset tests are being run throughout implementation. Final aggregate/build/visual findings must be appended after the integrated review; intermediate focused passes are not a release pass.

## Exact hosted adapter handoff

Runtime server files: `server/sites-minimal-adapter.ts`, `server/minimal-api.ts`, `server/minimal-d1.ts`, plus their `src/minimal/*.ts` authority/domain imports. Do not import the Node-only SQLite test adapter `minimal-store.ts` or standalone `server/index.ts` into the Worker.

Bindings: existing `DB`; non-secret `FARM_MINIMAL_ONLINE` exactly `"1"` to enable, otherwise disabled; optional `FARM_OWNER_ACCOUNT_ID` equal to verified canonical `uid_` + 64 lowercase hex; alternative optional `FARM_OWNER_SITE_SUBJECT` equal to separately verified site-scoped trusted subject. Neither sharing account UUID nor email is accepted as a substitute.

Preserve parent-owned read-only `/account-info` and `/api/account-info` hotfix and the current private Site access policy when copying the main game. These identity routes do not enable online inventory or seed D1.
