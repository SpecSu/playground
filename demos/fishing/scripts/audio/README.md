# Recorded music assets

## Current six-track playlist

The canonical order is:

1. Filtered Chords (`filtered-chords`), complete supplied recording
2. Runway Poise (`runway-poise`), complete supplied recording
3. Tech House Groove (`tech-house-groove`), complete supplied recording
4. Understated Groove (`understated-groove`), complete supplied recording
5. Meditative Groove (`meditative-groove`), computationally selected 96-second excerpt
6. Arabic Nights (`arabic-nights`), the existing 64-second excerpt

The first five are **user-provided Suno-generated recordings explicitly authorized
for this public demo on 2026-10-12**. They are not labeled CC-licensed or granted
unrestricted redistribution rights. Their `rightsKind` is `user-authorized-demo`,
`licenseUrl` is null, `sourceUrl` is `/audio/CREDITS.txt`, and credited artist is
`User-provided · Suno`. Public credits and source hashes are in
`public/audio/CREDITS.txt`; nonsecret source provenance is in
`user-generated-provenance.json`. The Tech House Groove source has an embedded
Understated Groove title; its public name follows the supplied filename.

Arabic Nights by Nemphirex retains its existing **CC BY 3.0** source, attribution,
modification notice, audio bytes and complete manifest object without alteration.
`arabic-nights-preserved-metadata.json` is its comparison fixture. Its existing
source/license observations remain in `warm-house-license-evidence.json`.

EDM Detection Mode, When The Sun Goes Down and Deep Woyak are no longer shipped.
Older append scripts and license evidence describe historical preparation only;
do not run those append scripts against the current playlist.

## Reproduce offline

Requires installed ffmpeg/ffprobe, Python, numpy and scipy. There are no downloads
or package installs. Keep the supplied source recordings **outside the repository**.
The source directory must contain the five titles above as `.mp3` filenames.
The existing Arabic Nights asset and manifest entry must be present.

```sh
python scripts/audio/prepare-recorded-music.py --source-dir /path/to/user-generated-club-music
python scripts/audio/validate-recorded-music.py --source-dir /path/to/user-generated-club-music
```

The preparation command processes only the five supplied files, retains Arabic
Nights exactly, and removes other public MP3 files. Rerunning replaces the five
new encoded assets deterministically with the same ffmpeg version/settings.

## Processing and timing contract

- New assets: stereo 48 kHz, 128 kbps MP3 with Xing gapless sample-count metadata.
- The first four retain every decoded source sample frame, including their
  original entrances and endings. No trimming, time stretching or edge fades.
- Meditative Groove: 96-second sliding-window selection maximizing sustained
  one-second RMS with a variability penalty and energetic edge preference.
  The chosen decoded source interval is recorded in the manifest. Only this
  excerpt receives 8 ms edge tapers.
- Constant gain targets approximately −16 LUFS. Final-MP3 measurement determines
  `playbackGain`; effective decoded and true-peak headroom is checked. High-crest-factor
  recordings may remain slightly below the loudness target to avoid clipping; the
  achieved loudness and `headroomLimited` flag are recorded. No EQ,
  pitch changes, tempo changes, compression or limiting are applied.
- Source cover art and source metadata are stripped. Only accurate title, artist,
  rights notice and ffmpeg's encoder tag remain. No source account handles,
  provider track IDs, Library/chat IDs, tokens or signed download URLs are shipped.
- Each track has a fresh-decode duration, sample-frame count, SHA-256 and byte size.
  MP3 container duration includes encoder padding and is not authoritative.
- `loopBeats = durationMs * bpm / 60000` may be fractional. Full songs are **not**
  integer-beat excerpts. Use decoded `durationMs` for wrapping and loop end;
  approximate BPM is for animation only. `loopStartSeconds` is zero.
- New RMS envelopes use 100 ms stereo RMS blocks from final decoded MP3 samples,
  normalized to the 95th percentile and clamped to [0,1]. Arabic Nights keeps its
  original 50 ms envelope and all other metadata.
- Broad eight-second energy cues are explicitly signal-derived visual heuristics.
  `drop`, `build`, `break` and `kickOn` do not claim identified musical sections or
  source-separated percussion.
- BPM comes from repeated low-frequency attacks (or high-band spectral flux when
  bass periodicity is weak) across overlapping 20-second
  windows. Attack offset is a phase estimate in the opening 30 seconds, not a
  verified musical downbeat. Generated tracks can drift, and Filtered Chords has
  a low-confidence tempo estimate. These limits are recorded in `analysis`.

## Verification and limits

The validator independently checks fresh native-rate decodes, 32 kHz runtime-rate
decode duration, complete-song source frame counts, source/output hashes and byte
sizes, RMS envelopes, loudness and effective true-peak headroom, audio-only streams,
128 kbps bitrate, metadata stripping, ordered IDs, credits and authorization scope,
exact Arabic Nights preservation, and the complete compressed set fitting 16 MiB.
With `--source-dir`, source hashes and native decoded frame counts are rechecked.

No listening, musical phrase/downbeat validation, harmonic loop-seam validation,
browser playback or deployment is claimed by this asset workflow. The selected
Meditative window is computationally energetic and comparatively consistent;
subjective coherence still requires listening. Full songs repeat at their actual
endings. The runtime's browser QA and shared-timing tests are separate.

## Final measured package (2026-10-12)

Decoded durations are 204.4135, 203.7735, 177.9735 and 196.7735 seconds for the
four complete songs; Meditative Groove is exactly 96 seconds from decoded source
110–206 seconds. Arabic Nights remains exactly 64 seconds. Container durations
are slightly longer because they include encoder delay/padding.

The six MP3 files total 15,349,592 bytes (14.64 MiB), below the 16 MiB compressed
cache limit. All effective playback levels are −16.00 LUFS except Tech House
Groove at −16.61 LUFS: headroom protection caps its gain to preserve the original
transient dynamics. No compression or limiting was added. Its effective true peak
is −0.60 dBTP; Filtered Chords is −0.73 dBTP. Other tracks have more headroom.
