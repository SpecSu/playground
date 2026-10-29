# V9 · In-place loading plan

Remove stage-covering model/song cards. Keep the old actual model until a successful replacement. Put a slim model status line beside the wardrobe heading and a narrow progress edge on the requested outfit/character tab; only the actually worn outfit earns a check. Place song status inside the song row and label the disabled start button “准备音乐”. Reserve the model line within controls, not under the actor.

Show loading only after 180 ms, preserving immediate completion without a flash. Measured download fractions may be shown; decoding/assembly with unknown work has no invented percentage. Keep announcements phase-based, not per byte event. Errors remain locally visible with retry. Latest selection wins; old progress cannot commit UI selection. A failed replacement keeps the existing actor and does not enable a misleading start.

Avatar creation keeps its separate five-second flow, but transitions from timed preparation to “载入舞台模型”; model loading is indeterminate rather than a timer stuck at 100%.

Tests: delayed/fast completion, repeated progress, cancel/new target, unknown progress, worn-vs-pending selection, error/retry, startup and failed load gating, avatar timer/model phases. Re-run full input/chord, start/import races, pause and creation suites. Browser inspection uses real DOM/CSS and an explicitly labeled local UI fixture; WebGL/native-device validation remains unavailable. No deployment or asset edits.

## Implementation and UI audit

- Central loading scene markup and obsolete card CSS removed. Stage asset progress starts indeterminate; 100% transferred transitions to assembly text, not completed loading. Actual `ready` commits the worn check.
- Main now gates start while a model is pending or failed; failure says “重试造型” and keeps Start disabled. Retry uses the same latest-selection transaction. Changing an outfit cancels a pending music-start transaction, preventing late audio from starting over the new selection.
- Inline status text is at least 11 px and retry has a 44×44 px transparent target without increasing row height. Failed outfit cards themselves remain retryable. Phase text is live-announced; byte percentages are not.
- Root and the independent audit worker inspected real UI/store/flow through an explicitly labeled static-model fixture in the official preview. Desktop embedded-stage and a narrow viewport passed visual inspection of local progress, error retention, retry placement, and no central card. This is not GPU or native mobile validation.
- The temporary `qa-v9-loading.html` was deleted after review and is absent from `dist`. Private screenshots remain with the root/auditor; none were removed or shipped by this implementation.
- Pharaoh generation is the newly authorized single outfit, with manual confirmation, five-second preparation, actual model success gating, version-2 entitlement migration and one 100-point debit. The base-avatar panel opens idle and needs one manual “创建分身” click.
