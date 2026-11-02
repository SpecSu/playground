# Preparation music — Disco revision

The quiet synthesized pad was explicitly rejected by the user. The lobby now
uses an energetic excerpt from their earlier cloud Disco's **Tech House Groove**
recording: drums, bass and electronic rhythm, not another calm synthesizer pad.
Gameplay's STAGE RUSH and imported tracks are unchanged.

## Provenance (project-only documentation, not a public credit claim)

Inspected reference application:
https://dreamina-disco-avatars.mythicgleam32.chatgpt.site/

Its `LiveFeed-Bk4Ag9I1.js` bundle describes `/audio/tech-house-groove.mp3` as:
“User-provided · Suno”, genre “User-generated electronic”, description
“User-provided Suno-generated recording for this public demo.” The user explicitly
requested this earlier Disco style; the parent approved reuse of this recording.
No third-party SoundCloud entries from that playlist were copied.

Source URL:
https://dreamina-disco-avatars.mythicgleam32.chatgpt.site/audio/tech-house-groove.mp3

Original bytes: 2,848,703. SHA256:
`1ee441ce0bad8899901481415bda74ebdbc908ee4528c0edf8ba91efd0f8cc12`

## Excerpt preparation

- Decode original to 44.1 kHz stereo PCM.
- Detected bass-drum peaks at 18.28244898s and 48.68934240s delimit 64 pulse
  intervals. Trim 80ms before each peak: 18.20244898s–48.60934240s.
- Wrap blend: replace first 80ms with a linear blend from the following 80ms
  after the end into the first 80ms. Preserve the central recording untouched.
- Normalize PCM peak to 0.85; apply 4ms raised-cosine endpoint fades to avoid
  codec-induced wrap clicks; encode LAME stereo MP3 at 128kbps, no metadata.
- Source metadata estimates 126.95 BPM, but explicitly warns it is not a
  verified downbeat/grid. Our selected pulse interval averages 126.287 BPM;
  do not claim exact musical bars or studio-perfect beat quantization.

Shipped `public/assets/audio/lobby-tech-house.mp3`: 487,801 bytes (~476 KiB).
SHA256: `dcb718be324eb21a6a596a16cca5fca06c262fb7ede8e9474019da7684d88bae`.
Decoded duration: 30.4076s; stereo decoded memory approximately 10.23 MiB.

## Playback safety

Only first pointer/key interaction unlocks and begins fetching/decoding the
recording. Fetch/decode is asynchronous and cached, with concurrent unlocks
sharing one preparation promise. It does not change gameplay buffers, import
ownership or playback time. Failed loading is retryable on another interaction.
Late completion checks current lobby/activity/playback state before starting.

Fade-in: 1.2s. Lobby gain: 0.36 into shared 0.75 master. Dance start retires the
lobby over 0.3s. Paused/results do not start lobby music. Lobby return restores
music respecting mute. Hidden/pagehide stops audio and invalidates pending play;
hidden lobby restores on return while gameplay requires manual resume.

## Objective verification (2026-10-29 cloud CPU)

Run `python tests/test_lobby_recording.py` (ffmpeg, numpy, scipy) and `npm test`.
Decoded asset has 64 detected bass-drum pulses; median pulse spacing ~125.81 BPM,
consistent with a lively ~126 BPM generated recording. Test enforces strong
low-band pulse contrast, finite samples, unclipped headroom, and a smooth wrap.

At steady output gain: RMS 0.036994 (**−28.64 dBFS**), peak 0.22489. This is about
6.75dB above the rejected pad. Codec-decoded wrap jumps: 0.001916 / 0.002088,
well below the recording's ordinary adjacent-sample changes.

JS tests cover gesture gating, transitions, shared mute, repeated unlock,
lobby return, visibility/page lifecycle, pending-play cancellation, independent
cached lobby decoding, late-load cancellation and failure retry. No subjective
listening, phone-speaker audition or browser decode timing is claimed.
