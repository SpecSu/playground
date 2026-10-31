# Local runtime upgrade and lunar movement delta

Base: published v34 source `5aef234619c186d49627468afa18f813f57cd39a`.
The portable artifact is a complete static app plus matching Node/SQLite source,
not a frontend-only replacement over r3. Its exact source and all payload hashes
are in the generated MANIFEST and SHA256SUMS. No real databases or dependencies
are bundled; the existing verified FARM_DEMO_DB and browser origin are retained.

## Compatibility evidence

Main and independent reviewer each ran actual old r3 API + old AccountClient
against fresh temporary SQLite fixtures, then upgraded the same database.
Committed create and paid buyEgg lost-ACK requests replay the immutable original
receipt exactly; a newer revision cannot be rolled back by that replay. An old
unexecuted free create is terminally rejected without free asset creation. New
buy-egg receipt-write failure rolls back currency and asset changes atomically.
Concurrent same-ID retry and process restart remain idempotent. Formal/legacy DB
sentinel bytes stay unchanged. These were synthetic fixtures, never user DBs.

Only exact loopback named-demo scope can load the verified lunar assets locally.
Anonymous scope does not gain model capability. Formal boarding remains rejected
locally and links to the clean official hosted root without UID or save data.
The listener remains 127.0.0.1:5190. The namespace remains farm-local-demo-v1.

## Speed, not altered stride or time

Checkpoint `5e8a4ec21fcf2d2cebae8f30cdfe4be40f762d9b` uses 1.6× locomotion
cadence. Straight phase is still derived from actual travelled distance divided
by measured grown stride; turn stepping, contact/replant cadence and acceleration
scale consistently. Action, growth, care cooldown and rest clocks are unchanged.
The substep size is bounded in locomotion time. No model scale or clip bytes were
changed for this speed adjustment.

Controlled actual-Scene route: mature actor, 2 metres, initial 180° heading turn,
including start/replant/turn/arrival and action readiness. Times are CPU simulation
active seconds, not browser performance measurements.

| Actor | Growth | v34 seconds | Faster seconds | New peak m/s |
|---|---:|---:|---:|---:|
| 长耳黄狗 | 1.2 | 20.733 | 13.317 | .404494 |
| 坤坤鸡 | 2 | 13.600 | 8.667 | .864000 |
| 红围巾 | 1.2 | 20.900 | 13.217 | .286670 |
| 粉裙羊 | 1.2 | 20.267 | 12.850 | .334304 |
| 花马甲 | 3 | 13.700 | 8.717 | .805727 |

The independent reviewer used a separate 2.4m chicken return route: 14.350s →
9.117s at60Hz /9.10s at20Hz, with the dribble remaining5s. Independent120s at
20Hz and60Hz: zero unreachable stance/replant solves, full-skin floor within
floating-point zero, steady sole drift≤.509mm, radius/profile ratio<.960.

## New-action boundaries

Text cues are authored strings tied to the actual action clock, not speech
synthesis or generated voice. The UI bubble replaces its existing hint row to
preserve the camera/HUD reserve. Pause freezes the clock; stopping an ordinary
action clears text immediately. The new greeting uses its measured safe authored
retreat, not a direct quaternion shortcut through the vest: Stop immediately
clears its text and announces recovery; only this ≤5s greeting finishes its current
clip before another action/pickup. Older five clips remain immediately interruptible. Only the explicitly reviewed full-turn dance may
animate motion-root yaw; its parent navigation heading never changes. That
bounded≤6s action gives immediate stop feedback and finishes the current turn
before resting. Hidden state pauses immediately; leaving the visitor scene
always disposes immediately. No action owns persistent farm data or economics.

Final new asset and portable artifact hashes are verified separately before
release. CPU/HTTP/SQLite/DOM evidence is not GPU/mobile visual acceptance or
proof that the Mac installation has already occurred.

## Exact appended motion derivatives

- 粉裙羊: `2c2fbc991723cf11ec4ef854ad7b1d8d334308e779ef13f58828832eb716b159`, 2,214,176 bytes; `turn_dance` 5.5999999046s, only this clip permits one root-Y turn. Adult radius updates to .579308867234m; growth scales it once. All old five actions, skin and image data are preserved.
- 花马甲: `ed26f65243418ec3565f8508e477e4729a5019ea7c7b30a21995b0588ab33aa2`, 1,957,412 bytes; internal authored clip `baoqian`, user action `baoquan` / **抱拳**, 5s. Existing bounds and old five actions stay unchanged. Timed text at .82s /2.5s says “各位，久等了！” /“承让，承让！”. Fingers remain the supplied semi-curled geometry; no finger-closing or real-person voice claim.

Both new actions lead their character's recurring showcase list. Existing
portraits are unchanged. The other three GLBs are unchanged. The compiled
candidate is tested locally first; publication and Mac installation remain
separate, authorized operations after independent runtime review.
