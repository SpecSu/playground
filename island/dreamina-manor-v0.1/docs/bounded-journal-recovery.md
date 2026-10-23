# Bounded journal recovery

The temporary `recover-local-journal` command accepts one SHA-256 commitment to a UID, original baseline (including draw epoch), and an exact ordered operation payload. No player's state or operation payload is part of the source or deployed assets.

The handler checks unchanged economic state against the original baseline before replaying the historical actions. Only the former housing acceptance rule is available in this path. Final fish housing uses current rules. Newer position and independently changed profile metadata are preserved. All original receipts and the resulting state are inserted in one compare-and-swap database transaction. Any mismatch, partial receipt, invalid dependency, or concurrent change aborts the entire write.

Local original journal and pending-body backups remain intact. A lost response reuses the same fixed recovery operation ID and original payload. Confirmation removes only matching original operation IDs; unrelated later entries remain.

Once the incident is verified recovered, remove the commitment, recovery command/handler, and client candidate routing in a later maintenance release. Keep the general exact-body pending reconciliation fix and the already-written immutable operation receipts. Do not remove source local backups as part of an application update.
