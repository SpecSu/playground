# Local avatar and Pharaoh creation contract (V9)

`jiaxin` starts with only **黑白序章** (black top, white trousers). The new, explicitly authorized outfit at index 1 is **埃及法老**. The old blue/silver and wine variants remain retired. The base avatar, Pharaoh outfit, and portrait are prepared assets; no account, real payment, photo upload, or live model-generation API is involved.

## Manual base-avatar flow

Clicking **+我的分身** only opens the existing portrait/information panel. It does not create anything. The user manually presses **创建分身** once. The previous extra **确认导入** step is removed; there is no automatic generation on opening and no extra file picker.

The flow retains a minimum 5,000 ms preparation phase, followed by successful actual stage loading, before unlocking/selecting the avatar. Closing or canceling invalidates the job. The default 300 local points balance is preserved; base creation is free.

## Pharaoh customization

The wardrobe shows only owned selectable outfits and a **定制新造型** entry. The panel is explicitly themed **埃及法老**, with a prefilled editable Chinese description of an exaggerated Pharaoh headpiece, gold neck/chest/arm/waist accessories, wheat-toned bare upper body, and an ivory-white/gold lower garment. Editing this local draft does not imply an arbitrary live AI generation service; the supported result is this one named outfit.

**生成妆造 · 100 积分** starts one operation. The existing base model remains usable until the real replacement loads. A preparation timer alone never grants the outfit or spends points. Successful model load after the time gate atomically grants index 1 and debits 100 local points, then selects the real outfit for the stage. No third variant is unlocked. Repeat callbacks, repeated clicks and already-owned reuse cannot charge twice. Already-owned reuse is labeled **穿上埃及法老**.

The UI uses `phase:'preparing'` for timed preparation and `phase:'loading-model', progress:null` while waiting for the actual model. The latter is indeterminate, not a timer stuck at 100%. Failure or cancellation does not unlock or debit; cancellation during model loading restores the previous stage selection.

## Store and migration

`createAvatarCreationStore()` returns `{version, characterId, unlocked, outfits, points, operation, storageAvailable}`. `beginAvatarCreation()` / `beginCostumeCreation(1)` create a tokenized job. `completeOperation(token,{resultAvailable:true})` requires both the time gate and successful caller verification. `cancelOperation(token)` invalidates it. Missing manifest/model, failed load, insufficient points, stale tokens and interrupted work do not grant ownership.

Storage key remains `encore-avatar-creation-v1` to preserve existing user balances, while the **record schema is version 2**. Version-1 records—including legacy index 1/2 colorways—migrate to base-only ownership with their exact original point balance. They never silently receive Pharaoh. Version-2 Pharaoh entitlements survive reload. Interrupted jobs are discarded without charge. Unrelated scores, songs and other-character storage are untouched.

Draft key is `encore-outfit-prompt-pharaoh-v1`, separate from old generic drafts. Drafts stay local and editable; no prompt submission request is made to a service. Storage failure leaves current-session in-memory play usable, but reload persistence is not guaranteed. This is local demo state, not a cross-tab financial ledger.

## Verification

Run `npm test` for preparation timing, true model-result gating, failure/cancel, old-version migration, single debit, reload, manual-create entry, prompt reuse, and main startup/loading races. `npm run build` builds production. Local-only UI fixtures must be removed before packaging. Such fixtures do not validate WebGL rendering or native-device smoothness.
