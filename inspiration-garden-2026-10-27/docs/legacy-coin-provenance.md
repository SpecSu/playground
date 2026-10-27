# Legacy manor sale feedback reuse

Read-only source: `https://dreamina-manor.mythicgleam32.chatgpt.site`, Site project `appgprj_6ada46e99b6c81919a0b4e8db57f4163`, v37, opened source commit `633f1af5f8f8a6fe30f267abef0f2383c962b4e2`. The legacy Site was not modified, saved, or published.

- HUD gold coin: `components/manor/Manor.tsx:43`, `GoldCoin()`. Exact geometry/colors are retained as `GOLD_COIN_SVG`, changing only JSX attribute names to SVG attributes. The prior legacy flight used a second, slightly simpler gold SVG; this port intentionally uses the original **HUD** engraving consistently for flight and UI per the user's same-icon request.
- Motion: `lib/client/action-feedback.js`, `coinCount`, `flightPoints`, and sale branch of `createCommerceFeedback`. Retained 3 / 5 / 7 coins at amount thresholds 30 / 100; 13 sampled points; sinusoidal upward bow capped at 100 px; 560 ms duration, 24 ms staggering, ease-in; 8 px horizontal and 6 px vertical offsets; 240 ms destination pulse. Reduced-motion retains stationary short fade, additionally removing the original destination scale pulse. Added non-interactive +gain label and lifecycle/bounded-node guards.
- Audio: `public/assets/audio/coins-user-v23.wav`, copied byte-for-byte to `assets/audio/legacy-sale-coins.wav`. It is the latest user-supplied recording used by legacy `lib/client/audio/user-action-recordings.js` → `actionSound('sell')`, **not** older Kenney or procedural coinClinks alternatives. PCM16 mono, 22050 Hz, duration 0.7040 s. SHA-256 asserted in `tests/coin-reward.test.js`.
- Legacy playback: `lib/client/ocean-audio.js`: `SFX_LEVEL = 1.01`; limiter `0.70 * tanh(value / 0.70)` with oversample `2x`; no pitch shift or extra synthesized layer. New audio integration should use existing mute/visibility/gesture lifecycle and bounded voices; visual feedback and economy must not wait for sample fetch/decode.

## Source recording notice (verbatim relevant scope)

User-supplied target sound recordings, provided for this demo and its requested source archive on 2026-10-24. `coins-user-v23.wav`: audio extracted from the supplied coin sound. Only the requested audio is included. Original videos and their metadata are excluded. Preparation: short edge fades and silence trimming, linear peak headroom for coins, mono 22050 Hz PCM16. No pitch shift or EQ. These recordings are user-provided, not represented as CC0 or as separately licensed by a third-party asset vendor. Existing CC0 source notices apply only to their named original assets.

Full notice source: legacy `public/assets/audio/USER-AUDIO-SOURCE-v23.txt`. Reuse requested by user message `[历史需求]`: “卖出的金币动画参考上一版3d demo 里的金币动画和音效。帮我加上。金币素材也用上一版的那个金色 icon”.

## Integration

`createCoinReward(positionedHost, {target: () => currentHUDWallet, playSound})`.
Capture sale-button geometry with `capture(button)` before `dispatch` removes/replaces DOM. After accepted SELL or SELL_PACKED_PLANT only: `sale({id: soldInstanceOrTransactionId, value: actualCoinDelta, source})`. Use immutable instance/transaction ID, not species ID. No effects during loads or balance re-render. Do not call the old generic coin cue in addition. Optional `ok:false` rejects a failed operation defensively. Helper owns no state/dispatch/economy callback. `dispose()` clears active nodes and animations; call it on page teardown as appropriate. Host must have a containing position and target callback must re-query replacement HUD nodes.

Build must whitelist `AUDIO_PATH`. Gold icon can be used by shared `icon('coin')`; do not make generic CSS overwrite SVG fills. Optional sound failures never roll back or repeat a sale.
