# Local photo affordance for creation

User requested one simple photo button below each seed/building idea input. Both original and remix creators use a shared quiet row: add photo, then a 44px thumbnail with replace/remove. No new tab, modal, cost, or generation claim.

The demo has no image generation backend. Photos are explicitly local preview only. They never enter reducers, localStorage, catalogue, runtime asset bundles, or network requests. Existing text matching and crystal charging are unchanged. Closing/switching creation sessions or page exit revokes object URLs; normal rerenders and text edits preserve the selection. Cancel leaves the current selection unchanged.

Selection accepts JPEG/PNG/WebP up to 10 MB, verifies image decoding and a 40-megapixel limit, and handles timeout/failure without discarding a previous valid preview. Revision guards make superseded loads unable to enter newer sessions. No SVG, HEIC, or remote URL input is accepted. Errors remain a small inline line.

Validation: real UI rendering assertions, local controller lifecycle and invalid-file tests, actual app event/reducer harness, full regression suite and build; parent owns supported browser QA and publication approval.
