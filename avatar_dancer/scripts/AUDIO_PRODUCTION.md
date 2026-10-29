# STAGE RUSH — original demo instrumental

- Original instrumental composition and synthetic production; no third-party audio, samples, vocals, artist imitation or copied melody. It is **not** a famous K-pop recording. Do not label it as one.
- 128 BPM, 4/4, F# minor. First downbeat at decoded audio time 0.000 s.
- 40 bars = 160 beats = 75.000 s music; 2.000 s release tail; decoded length **77.000 s**.
- Section starts (seconds): Intro 0; Build 7.5; Drop 15; Break 30; Rise 37.5; Final Drop 45; Outro 67.5.
- Layered detuned additive synth chords, independently composed lead motif, sub/harmonic bass, synthesized pitched kick, noise/body clap, metallic hats, tom fills, stereo delays, diffuse reverb, transition sweeps, and resolved final chord.
- `compose_track.py` recreates it with NumPy, SciPy, ffmpeg. No network or credentials needed. Output under `public/assets/audio`.
- `validate_track.py` decodes the actual MP3 and asserts duration, non-silent start, true stereo content, finite samples, no clipping, and exact beat metadata.

## Measured output (2026-10-28)

MP3, stereo, 44.1 kHz, 192 kb/s; 1,849,512 bytes.
FFmpeg decoded duration: 77.000 s (MP3 container reports 77.035 s due to encoder padding; gapless decoded timing is the chart source).
Integrated loudness: **-13.97 LUFS**. True peak: **-1.62 dBTP**. Loudness range: **4.90 LU**.
Maximum decoded sample magnitude: 0.82958; RMS: 0.18393; stereo-difference RMS: 0.04305.
Section RMS dBFS: Intro -14.53, Build -14.46, Drop -13.69, Break -18.24, Rise -15.22, Final Drop -13.85, Outro -16.53.

Objective validation passed. This environment did not offer an actual listening/audition capability, so musical enjoyment and perceptual mix quality were **not independently auditioned**. A human headphone/speaker listen remains worthwhile. The asset is intended as an honest original fallback while the game supports the user's own lawfully supplied music.
