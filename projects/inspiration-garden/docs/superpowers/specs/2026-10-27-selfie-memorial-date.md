# Selfie memorial date

Scope: Add a distinct, centered date immediately below the existing `苏贝壳 × 好友` caption. Keep the four approved photo assets, image preview, footer, title, and disclosures elsewhere unchanged. Use a 14px semibold warm-neutral date, larger than the 10px names, without an extra explanatory label.

The application snapshots `openedAt` once when the photo panel opens. The photo loader preserves that value throughout loading, failure, retry, and repaint; closing and opening a new photo captures a new instant. Format the day with a fixed UTC+08:00 offset, independent of device timezone. Missing or invalid instants render no fabricated date. The original PNG remains byte-identical and contains no newly composited date; its requested download filename gets the same Beijing date as the UI. No persistence, network, permissions, assets, or economy changes.

Validation: Red→green regressions for all four friend names across loading/ready/error, invalid dates, Beijing midnight, retry stability and reopening, filename alignment. Full tests, syntax check, build and independent review are required. Parent owns native browser QA and publication.
