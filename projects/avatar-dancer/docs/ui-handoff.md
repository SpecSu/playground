# UI / scoring integration

Owned files: `src/ui.js`, `src/rhythm.js`, `src/style.css`, `tests/rhythm.test.mjs`.

## HTML
`<main id="app"><div id="stage"></div><div id="ui"></div></main>`.
Stage may alternatively itself be a canvas. Import CSS from main. Stage occupies full portrait shell (desktop 9:16, narrow mobile full viewport). UI transparency reserves center/right stage for dancer. In lobby, dancer ideal screen center x≈62%, full figure y≈40%; lower controls start around 60% height. Playing dancer center above note highway.

## UI
`createUI({ onCharacter(id), onOutfit(index), onStart({character,outfit}), onPause(), onResume(), onReplay(), onImport(File), onHit(lane), onMute(boolean), onLobby() })`.
Character IDs `jiji`, `lx`; outfits integer `0..2`. Selected outfits persist individually. Lane `0=left/A`, `1=down/S`, `2=up/W`, `3=right/D`. Keyboard arrow keys, WASD, Escape pause toggle, touch pointerdown are handled inside UI; do not duplicate input listeners in main.

Returned API:
- `setMode('lobby'|'playing'|'paused'|'results')` (aliases `select`, `selection`, `game`, `pause`, `result`). Main owns game/audio transitions. Clicking start only requests callback, never starts fake game state.
- `updateGame(game.state)` every RAF renders current notes, score, combo, progress, judgements.
- `showJudge({rating,lane})` optional exact judgement event. If also using automatic updateGame judgement, harmless duplicate but main may omit explicit onJudge UI call.
- `setProgress(fraction, elapsedSeconds)` optional, included in updateGame.
- `setTrack({title,meta,bpm,local})` or `setTrack(title,meta)`; safe textContent, imported names never inserted as HTML.
- `showResults(game.state)` renders stats, grade, explicitly labeled mocked friends leaderboard with real self score and sorted placement. Changes UI mode to results.
- `toast(message)`, `flashLane(index)`, `getSelection()`, `destroy()`.

Music import passes File only; main decodes locally. Do not upload. `onLobby` optional allows main to return stage to idle when exiting result screen.

## Rhythm engine
`new RhythmGame({getTime,onJudge,onEnd,duration=60,perfectWindow=.065,goodWindow=.14})`.
Clock is seconds, audio-driven. `start(chart,{duration})` captures origin from getTime; chart times are relative to that start. Notes `{time,lane}` validated, cloned/sorted, assigned IDs. `start` returns state. `update()` returns state. `hit(lane)` returns `{rating,lane,offset,note,score,combo,state}` or null. `pause()`/`resume()` account for either frozen audio clock or advancing audio context clock. **Order matters:** pause game then pause audio; resume audio then resume game. Reset audio transport before calling `start`.

State: `{status:'idle'|'playing'|'paused'|'ended',time,duration,progress,notes,score,combo,maxCombo,accuracy,counts:{perfect,good,miss},judged,lastJudgement}`. Notes gain `{id,judged,rating}`. Perfect ≤65ms =1000; good ≤140ms=650; missing >140ms =0 and resets combo. Wrong key outside window does not score. Accuracy is earned score / judged maximum, percentage (0–100). End emits once at configured duration; configured duration is extended if last chart note is later. No autoplay.

Run `node --test tests/rhythm.test.mjs` from project root. 16 tests pass, including replay, idempotent pause/resume, repeated hit protection, final-note boundary, duration validation, and real UI event handling with a minimal DOM boundary.


## Accessibility / QA notes
- All icon controls labeled; character/outfit selection exposes aria-pressed.
- Modal pause/results move focus into the panel, trap Tab, and mark underlying header/game inert. Resume restores pause-button focus; result-to-lobby restores start focus.
- Touch uses pointerdown with default prevention; synthesized pointer clicks do not double hit. Detail-zero assistive/keyboard clicks are supported. Keyboard auto-repeat cannot accumulate notes. Inputs are ignored during pause/results/lobby.
- Reduced-motion media preference disables cosmetic transitions. Container-relative scale and safe-area bottom/top handling included.
- Exact displayed judgement now uses state.lastJudgement rather than guessing chronologically when early hits and late misses interleave.
- No browser rendering verification completed by this subagent: standalone browser launch was sandbox-blocked; parent owns supported-tool visual QA. No publication occurred.
- Engine adds 10ms safety margin after final good-window boundary so a last note remains hittable at exactly +140ms. Config duration must be finite positive.
