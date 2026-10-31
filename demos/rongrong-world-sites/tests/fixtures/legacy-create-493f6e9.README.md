# Exact legacy source fixture

`legacy-create-493f6e9.json.gz` contains the 55 TypeScript/JSON modules reachable from the historical AccountClient and MinimalAuthority in commit `493f6e9d0e9ecbe7b5111d4202cf9ae97d6f1c3b`. Each `source` string was read byte-for-byte with `git show <commit>:<path>`; each module records its SHA-256. No behavior was rewritten, no receipt was recorded, and no runtime assets, account data, credentials or database are included.

Archive SHA-256: `ae855a23e6d967eade84bbda1dcab3b648a49f44b9eca4c81641a5eb5e002080`.

The upgrade regression verifies the archive and every loaded module, then runs the old client and authority against a fresh real SQLite/D1 repository. A virtual URL namespace isolates old relative imports from the new implementation; installed npm packages remain shared. The fixture makes this check runnable in exported Sites source bundles without historical Git objects. With Git intentionally unavailable, the original test failed and this fixture-backed test passes all five upgrade cases.
