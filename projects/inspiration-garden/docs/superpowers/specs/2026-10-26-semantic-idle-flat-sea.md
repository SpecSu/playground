# Semantic idle clock and flat sea correction

User-authorized narrow correction after v12 (`74c9bfbc`). No state, catalogue, prices or save-schema changes.

- The ten-second clock measures intervention in the avatar/game, not raw activity. A completed manual move, deliberate plant/building touch, entering placement/edit/confirmation, and successful economic/game commands interrupt autonomous motion and restart the clock. Camera drag/pinch/wheel/recenter, opening/closing/browsing menus, editing idea text, and focus/keyboard navigation do not.
- Every actual UI activation (including already-focused category/detail/camera controls) cancels older world contact candidates/tap gates without resetting the semantic clock or idle route. Rejected inert purchase-grid events remain no-ops.
- Read-only panels and idea editors permit scene-local idle behind them; idle and delayed approach completion must never rewrite the focused tray/editor. Active placement/edit/confirmation or actual held instrument contact still pause safely. Hidden/blurred pages stop and restart a fresh clock on return.
- Canvas classifies pointer intent: a short stationary release is a tap; a stationary hold becomes deliberate contact after 150 ms. Movement beyond the existing 7 px tolerance or a second pointer cancels an uncommitted contact and becomes view movement without resetting idle. No canceled tap, delayed hold or pinch may later play/walk. Once a genuine hold has activated, existing instrument scrub controls remain intact.
- Sea is one pale aqua fill (`#b9dfdc`), without the B illustration, water-line/glint/gradient decoration. Remove the B runtime asset and whitelist reference. Preserve actual object shadows, construction/plant effects, projection and hit rules.

Approach: keep the current presentation-only life controller; move interruption to semantic command/contact boundaries instead of adding any persisted activity log. This is the smallest change that preserves local saves and existing controls.
