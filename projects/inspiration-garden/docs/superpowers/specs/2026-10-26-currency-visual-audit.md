# Currency visual omission correction

The inspected user screenshot identifies the permanent blueprint card's construct button: `建造 · 60 金币` was hardcoded text, bypassing the verified original gold coin renderer. This is a visual-only correction after v16.

Use the existing shared `coin()`/`icon('coin')` on every amount-bearing price/action surface: all permanent blueprint construct/reuse buttons, seed +1/reuse, plant detail sale amount, ground/harvest sale buttons, house relocation/demolition confirmation and paid placement strips. Preserve numeric values, disabled conditions, action/instance IDs, accessible text and escaped labels. Existing HUD/rank/refund/flight icons already use the shared original art. Canvas contains no active currency-symbol rendering path; sale coins are the shared-SVG DOM effect. Remove the obsolete unreachable line-coin fallback only.

No state/economy/storage/audio/asset/gesture changes. User screenshot and current Library transfer helpers remain in ignored work and outside source/runtime packages. Test exact screenshot path and broad currency renderer coverage, then full tests/check/build before independent review. Parent alone publishes.
