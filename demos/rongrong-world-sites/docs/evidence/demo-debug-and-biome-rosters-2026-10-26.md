# Demo debug coins and biome-specific sample rosters

Published base: `a91d765c38a8bd7c1c546c2b757837ca6b4f1802` (v31).
Reviewed business source: `70f297d67e5b0bd14557094571caa8268adababd`.

## Bounded behavior

- Settings exposes **演示调试**, **+1万**, **+5万**, labeled **仅演示账号 · 不影响正式金币或交易** only for a named-demo account session. A URL name, formal account handle `twx`, offline save or visitor scene cannot mint coins.
- The existing trusted Sites/loopback adapter selects the subject/instance-specific demo repository namespace. The account API then binds its verified demo actor to a server-only option, overriding unrelated caller options. Authority requires that exact actor and the exact numeric amount 10,000 or 50,000. Request JSON cannot supply the grant, account or namespace.
- The result must be a nonnegative safe-integer coin balance no higher than 1,000,000,000. This is a debugging safety limit, not real currency or an entitlement. Formal coin rules and local simulation commands are unchanged.
- Existing atomic D1 command receipts and durable client outbox own retries. Duplicate IDs credit once; changed contents under the same ID reject. Pending commands disable both buttons, GET is not an ACK, older receipts cannot replace newer canonical state. Storage failure before POST now displays an actionable error without sending or crediting.
- Demo-funded eggs and wishing offers remain in the same demo namespace. Formal users and other signed-in subjects cannot see or accept them. No new route, table, migration, auth permission, dependency or public model byte is added.
- The retained standalone server does not mount the minimal named-demo API. No offline mint fallback or local install is claimed; existing unavailable-mode messaging remains in force.

## Sample animals

Desert: 3 existing alpacas and 2 rabbits in the green oasis. Glacier: 4 existing penguins on dry shore. Wetland: 4 ducks and 1 cow on the green bank. Lunar keeps the two explicitly ordinary interaction stand-ins and **6 pending DIY GLB slots**. Friend names/avatars remain unbound. These are the game's existing admitted seven-species assets, not new candidates or a claim that alpacas are biologically desert-native.

The current provider/scope and actual skins remain mandatory. Missing alpaca/penguin resources are explicitly reported and cannot be greeted or picked up; ordinary available animals remain interactive. No species/profile/asset gate or home World implementation changed.

## Fresh verification

- Ordinary suite: **954/954**, no skipped cases.
- Actual React/World CPU DOM suite: **100/100**, no skipped cases.
- Typecheck, explicit full-source ESLint (`--no-ignore`), production build and `git diff --check`: exit 0.
- Owner RED→GREEN covered real Sites + SQLite/D1 grants, concurrent duplicate receipts, modified amount replay, malformed input, limits/unsafe balances, final receipt-write rollback, namespace/offer isolation and lost-ACK reload with newer balance.
- Independent adversarial review covered spoofed API grant options, actor binding, query/header namespace attempts, competing different-amount IDs, loopback/hosted/formal isolation, wrong-subject replay and no local/visitor grant capability. Its actual Settings checks held the POST, performed a GET without clearing pending, and changed accounts before a late ACK.
- Independent sample checks cover **16 real skins across all four distinct themes**, species/hash and safe dry placements, retained home/shared resources, no storage writes with a verified storage proxy, and four delayed penguin clones released once without reattaching to the new scene.
- Review found one pre-pending storage-error display defect. The actual App reproduced the RED, then the one-line catch-path fix and repository regression passed. No POST/coins/outbox safety was weakened; storage restoration can safely retry.
- All 159 source pins match actual source bytes. Old public GLBs, migrations, dependency inputs, namespace/auth adapters, AccountClient, local model and World remain byte-identical to v31.

These are CPU, actual-GLB, in-process API and DOM checks—not browser/GPU/mobile visual or performance acceptance. Publication is a separate native Sites step; this document does not claim deployment or Mac installation.
