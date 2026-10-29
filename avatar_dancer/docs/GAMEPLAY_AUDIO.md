# User-provided POPSTARS gameplay excerpt

The user supplied `popstars.mp3` and explicitly requested replacing dance music,
a trimmed/faded entrance, and notes designed to the actual audio. Display title
**POPSTARS** is derived only from the filename; no artist/recording identity is
asserted. Raw input is outside the repo/public/dist, in the task's private audio
folder. Library identity: `libfile_203688630e74819182b46d55eca480d5`, version 0.
Original SHA256: `2f1f55d33aa8132155ff7df5b6e980b354283c236ae01400f1ef72d14f6410cc`.
Input: stereo 44.1kHz MP3, approximately 76.54s, 1,783,828 bytes.

## Delivered audio and chart

- `public/assets/audio/popstars-gameplay.mp3`
- `public/assets/audio/popstars-gameplay.metadata.json`
- Source trim begins **0s**; round length **59.348367s**. This supersedes the earlier33.884s cut at the user’s explicit request. The ending is the fitted phrase boundary at source anchor +148beats, rather than an arbitrary60s cut.
- Fade in **0.45s**, fade out **0.7s**. Audio timestamps are reset after trimming
  before fades are applied. Gain 0.72 provides conservative codec headroom.
- Encode stereo 44.1kHz MP3 at 160kbps without input metadata.
- First judgement target **2.88971s** (fitted grid around2.87446s), leaving a readable entrance. Final target is **57.93424s**, before the58.648367s fade-out start.

Full-file spectral-flux autocorrelation found half/double-time 85/170 BPM, not
the old game's128 BPM. Fitting prominent attacks across the selected recording
produced **169.99 BPM**, anchor **7.110s** in the source. Strong phrase starts
around7.109,8.522,9.936,11.349s support this grid. This is signal analysis, not
an assertion about official score/downbeat metadata.

The static chart contains **112 notes**, **109 distinct events**, all four lanes,
three two-lane accents (12.76204s,24.04757s,52.29147s) and six supported eighth-note
pickups. Authored lane motifs are not random. Half-time patterns cover the whole
excerpt; quarter-note density increases in energetic phrases around7–12s,
18–24s and52–58s, while the29.7s breakdown is lighter. There are no triple chords;
minimum same-lane interval is **0.17038s**. Lane counts are32/29/22/29.
Of109 timing events,100 snap to measured local spectral onsets within45ms of
the fitted grid; nine retain musical grid timing. All targets finish before
the fade-out, and chart/scoring end at the actual59.348367s duration.

`main.js` loads this chart for the supplied track, rather than generating the
old generic128BPM notes. A missing chart is retried/refused instead of silently
playing a mismatched default. Local imports retain their existing estimated
chart flow. Lobby Tech House music, shared mute, transport cancellation, pause,
resume, replay and result lifecycle remain separate.

## Reproduce and verify

```
python scripts/prepare_user_song.py --source /private/path/popstars.mp3
POPSTARS_SOURCE=/private/path/popstars.mp3 python tests/test_user_song.py
node --test tests/user-song.test.mjs tests/main-startup.test.mjs
npm test
npm run build
```

Python production/QA require ffmpeg, numpy and scipy. The source is supplied
explicitly; the script never downloads or uploads it.

Independent QA decodes the shipped MP3 (not its source): **59.348390s**, sample
peak **0.629964**, stereo RMS **0.150420**, post-master RMS **0.112815**. Both
entrance and tail fade attenuation pass. **94.50%** of chart events are within
55ms of detected decoded-audio transients; median distance **0.0029ms** at this
analyzer's discrete resolution (not a claim of perceptual precision). An optional
private-source check measures **0.99861 correlation** against the original from
zero, independently ruling out the old4.286s start. Decoded level ratio is0.68469
through the lossy codec, with the production filter still set to0.72.
JS smoke hits every note perfectly after pause/resume and confirms one end callback;
startup asserts authored first note/count/duration. The initial main metadata
literal is regression-checked against the JSON so it cannot retain the old cut.

No subjective listening, official musical transcription, mobile speaker test,
or audible browser audition is claimed. User judgement still governs feel.


## Agreed ongoing rule and second track (2026-10-29)

Future supplied tracks start at the beginning, remain **under60 seconds**, end
at a sensible musical point with fades, and get an individual measured chart
with **about100–120 notes**. The later explicit POPSTARS extension removes its former short-cut exception: POPSTARS and FANTASTIC follow the from-start, under60s rule. The later explicit v13 KILLLOVE request overrides the length/note-count cap for that track only (see below).

Second input `fantastic.mp3`:147.30449s,3,474,911bytes, Library
`libfile_fc9ce2e3571c8191b38ceb82abc10c8b` version0. Source SHA256
`adcd936c0b031845e8fdc041e0d6043bbf271213354613554aa223a912fc03da`.
Title FANTASTIC is filename-derived, not an artist/recording attribution.
Trim starts at **0**, ends **58.993565s** on fitted phrase grid. Tempo
**130.03BPM**, source/grid anchor1.776s. Fade in0.45s/out0.7s. Chart has112notes,
109events, three double accents, rhythmic pickup notes in the stronger second
half, and a first judgement after the entrance at approximately3.621s.

Shipped `fantastic-gameplay.mp3` decoded peak0.738441, RMS0.141492;
independent measured target-to-onset coverage is **94.50% within55ms**. Median
onset timing error is below0.01ms at the analyzer resolution because the file
starts at0 and snapped events use the same timebase. This is not a claim of
human perception or perfect musical transcription. Both shipped fade tests pass.

### Sequential performances

`src/performance-playlist.js` lists approved track IDs and metadata paths.
A new successful round advances once: **POPSTARS → FANTASTIC → UptownFunk → KILLLOVE → POPSTARS**.
Replay is a new round. Pausing/resuming does not advance. Failed metadata/audio
load or failed audio start does not advance. A started then abandoned round
counts as played. The next selection is persisted as last-played ID in
`encore.performance.last-track.v1`; appending further IDs naturally extends the
cycle. Persistence failure gracefully falls back to in-session rotation.
Local file imports remain a separate explicit mode and never modify the cycle.

To add later songs: prepare the from-start<=60s audio + measured100+ chart, add one
entry in PERFORMANCE_TRACKS, and run signal, chart and playlist tests. No
hard-coded two-track toggle exists. Rebuild second asset with:

```
python scripts/prepare_user_song.py --track fantastic --source /private/path/fantastic.mp3
```

Rotation tests exercise normal starts, replay, paused resume, aborted rounds,
failedload, failedplay, rapid duplicate clicks, local imports, persistence,
storage failure, the actual third track, and future additions.


## Historical third-track excerpt: KILLLOVE (v10, superseded by v13 below)

Actual attachment filename `killlove.mp3`; display title **KILLLOVE** is derived
only from that filename, not an artist/recording attribution. Library input
`libfile_1fd09412b3a081918e0749c8182c6a17` is kept outside the repository/public.
Original: stereo44.1kHz MP3,74.814694s,1,761,687bytes; SHA256
`ef58227809502d4fd0073c68fe9d6d4f2bbe95b2d06c13cc6a175bd6d296e049`.

- Production asset: `killlove-gameplay.mp3` plus matching metadata JSON.
- Starts at source **0**, ends **58.194022s**. The ending completes32 fitted bars
  immediately before the lower-energy passage around58.2s; it is not a hard60s cut.
- Broad80–185BPM onset-grid search selected132; whole-excerpt refined fit gives
  **131.995BPM**, phase anchor0.010s. Fade in0.45s/out0.7s, gain filter0.72;
  stereo44.1kHz/160kbps MP3 with source metadata stripped.
- **112notes /109distinct events**, four lanes, five measured eighth-note pickups,
  three two-key accents at10.91787s,25.47079s,47.29016s. First target3.65143s;
  last56.86181s before fade-out57.494022s. No triple keys; minimum same-lane repeat
  interval0.41093s. Lane totals31/32/24/25. Authored phrase patterns ease to half-time
  around29–41s and lift again afterward; no random padding to reach the count.
- 107of109 event times snap to measured source transients within45ms; remaining
  two retain fitted grid timing. Independent shipped-file decode:58.194014s,
  peak0.736043, RMS0.125302, post-master RMS0.093976; finite samples and both fades pass.
  **97.25%** of events are within55ms of independently detected decoded transients.
  Median analyzer distance0.00265ms reflects discrete matched time bins, not
  claimed perceptual precision. Source-zero waveform correlation **0.99796**;
  decoded gain ratio0.68569 after lossy encoding.
- Existing POPSTARS and FANTASTIC MP3/metadata hashes remain unchanged.

Reproduce and verify with the private source supplied explicitly:
```bash
python scripts/prepare_killlove_song.py --source /private/path/killlove.mp3
KILLLOVE_SOURCE=/private/path/killlove.mp3 python tests/test_user_song.py
node --test tests/third-song.test.mjs tests/performance-playlist.test.mjs tests/main-playlist.test.mjs
npm test
npm run build
```

### Explicit next-song selection

`performancePlaylist.selectNext()` changes the pending built-in selection
immediately and returns it; it does **not** write last-played history. A successful
`commitStart` of that selected track clears the override, commits once and leaves
the following automatic track pending. Failed starts and pause/resume do not
advance; repeated explicit selections cycle data-driven IDs. The existing local
import mode remains private/in-memory and does not enter permanent rotation.
Main/UI own latest-wins cancellation for concurrent selection/load/start requests.

Audio validation is objective signal/chart analysis only; no subjective listening
or audible browser audition is claimed.


## KILLLOVE full supplied-source exception (v13)

The user explicitly requested restoring the remaining climax and all of their
supplied recording, overriding the<=60s excerpt rule for KILLLOVE only. This is
**not** a download of any longer commercial recording. Source remains the same
private `killlove.mp3`; no raw source is placed in public.

- Source MP3 container74.814694s includes encoder padding; all decoded musical
  samples are retained from source0 toEOF: **74.766803s**. No new leading trim.
- Same131.995BPM and.010s grid origin, including v12 transport-locked camera.
- Same0.72gain and0.45s entrance fade. Old57.494s fadeout is removed. New EOF fade
  is0.45s, half-sine profile, starting74.316803s; it does not remove source duration.
- Original112notes retained exactly. Fill the old57.3s release gap and add the
  final phrase: **151notes /146events**,5two-key accents, no triple keys.
  Lane counts41/40/35/35; minimum same-lane gap.41093s. Last note73.64980s leaves
  1.117003s toEOF; final section is denser without thinning the original chart.
- Exact decoded first56s match the previous game export (correlation1.0,
  maximum sample difference0). Source correlation for restored57.3–58.1s is
  .995585, for58.3–73.8s is.995538; decoded gain.6856–.6889 after MP3 re-encoding.
- Decode peak.736043, RMS.126539; no clipping/non-finite samples. Last40ms RMS
  .001083; last4ms RMS.00000259, no abrupt audible-level tail edge.
  Independent onset check:95.205%of146events within55ms; median.00280ms reflects
  analyzer-grid bins, not a claim of perceptual precision or subjective audition.
- Both this track's metadata URL and audio URL carry `?v=full-v13` to avoid an
  old58s cache. Other two song URLs/files and global model revision are unchanged.
- No runtime60s cap was present: built-in start uses the lesser of decoded audio
  duration and authored metadata. Tests prove the newly fetched74.7668s buffer
  replaces an old58s buffer, main starts the full duration, pause/resume reaches
  the extended chart andEOF fires completion exactly once. Maximum perfect score
  is151000; the existing daily-score completed-round contract remains unchanged.

Only KILLLOVE MP3/metadata and its playlist URL are changed. Future added songs
still default to<=60s/100–120notes unless the user explicitly requests an exception.


## Full new source inserted third: UptownFunk (v14)

User explicitly requested this entire attachment, no60s cut, inserted at slot3.
Actual filename `UptownFunk.mp3` gives the display title **UptownFunk**; no artist
identity is inferred. Library source `libfile_7d61934b3f2c8191aef49fe6cedf809f`,
source SHA256 `6f6182f023d1caea661f9958fda1cee0bbe543979b8e172e5db6ae1a6ff6ebc9`.
Raw recording remains private and outside public/dist.

- Stereo44.1kHz MP3 container80.065306s; complete decoded content from source0 toEOF
  is **80.014512s** (container padding is not musical content). No trim filter.
- Broad85–180BPM transient-grid search strongly selected115; fine fit115.000BPM,
  grid phase.266s. That exact metadata offset drives the unchanged v12 camera.
- **152notes /148events**,113.98notes/minute,4two-key accents, no triples.
  Lane counts40/38/38/36; minimum same-lane gap.51115s. Two calmer bars around
  37.8–42s relax to half-time; measured eighth pickups accent the50–62s return.
  Last note79.05202s leaves.962492s toEOF. All151 preceding notes remain inside
  playable time; the full score is152000.
- Conservative0.60gain matches other tracks without clipping: shipped peak.662823,
  RMS.127008 (master0.75outputRMS.095256). Only0.15s entrance fade and0.35s smooth
  EOF fade are applied; full decoded duration remains intact.
- Independently decoded onset check:98.649%of148events within55ms. Source0-phase
  correlations across1–30s/30–60s/60–79.5s are.998855/.999112/.998779; decoded
  gain.56966–.56973 includes MP3 re-encoding. These are objective signal checks,
  not a claim of subjective listening or real-device performance.
- New metadata and audio URLs both use `?v=full-v14`; previous3songs are byte-for-
  byte and URL-for-URL unchanged. Models, global asset revision and camera unchanged.
- Order is now POPSTARS,FANTASTIC,UptownFunk,KILLLOVE. Storage still persists
  last-played **ID**, not index: old FANTASTIC history naturally proceeds to the
  new third song, and old KILLLOVE history wraps to POPSTARS. Successful start
  commits once; failed starts/pause do not advance; manual-next cycles all4.

Reproduce with the authorized private source:

```
python scripts/prepare_uptownfunk_song.py --source /private/path/UptownFunk.mp3
UPTOWNFUNK_SOURCE=/private/path/UptownFunk.mp3 python -m unittest tests/test_user_song.py
node --test tests/uptownfunk-song.test.mjs tests/main-playlist.test.mjs
```

Full-source duration is explicitly approved for UptownFunk and KILLLOVE. Other
existing recordings and future default excerpt rules are not silently changed.
