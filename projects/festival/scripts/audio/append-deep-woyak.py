#!/usr/bin/env python3
"""Append only the approved Deep Woyak excerpt. Retained recordings stay intact; the rejected Beat Timed Grime is excluded.

Uses local source audio and existing ffmpeg helpers. No network or service tokens.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[2]
RATE = 44100
START = 95
SECONDS = 60
BPM = 128
PERIOD = 60 / BPM
LICENSE = 'https://creativecommons.org/licenses/by/3.0/'
SOURCE_URL = 'https://soundcloud.com/tkanizaj/t-kanizaj-deep-woyak-original'
TITLE = 'Deep Woyak (Original Mix)'
ARTIST = 'T.Kanizaj'
helper_spec = importlib.util.spec_from_file_location('approved_house', Path(__file__).with_name('append-approved-house.py'))
helpers = importlib.util.module_from_spec(helper_spec)
sys.dont_write_bytecode = True
helper_spec.loader.exec_module(helpers)


def prepare(source_dir, output_dir):
    manifest = json.loads((output_dir / 'music-assets.json').read_text())
    tracks = [t for t in manifest['tracks'] if t['id'] not in ['deep-woyak', 'midnight-techno']]
    assert [t['id'] for t in tracks] == ['neon-house', 'sun-goes-down', 'arabic-nights']
    source_path = source_dir / 'deep-woyak-full.mp3'
    source = helpers.decode(source_path)
    clip = source[START * RATE:(START + SECONDS) * RATE].copy()
    assert len(clip) == SECONDS * RATE
    wav = Path('/tmp/deep-woyak-analysis.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-i', 'pipe:0', '-c:a', 'pcm_f32le', str(wav)], input=clip.astype('<f4').tobytes(), check=True)
    original_loudness = helpers.loudness(wav)
    gain_db = -16 - float(original_loudness['input_i'])
    clip *= 10 ** (gain_db / 20)
    fade = round(.004 * RATE)
    taper = np.linspace(0, 1, fade, dtype=np.float32)
    clip[:fade] *= taper[:, None]
    clip[-fade:] *= taper[::-1, None]
    path = output_dir / 'deep-woyak-128beat.mp3'
    helpers.encode(clip, path, TITLE, ARTIST)
    decoded = helpers.decode(path)
    assert len(decoded) == SECONDS * RATE
    measurement = helpers.loudness(path)
    playback_gain = round(10 ** ((-16 - float(measurement['input_i'])) / 20), 8)
    peak = float(np.abs(decoded).max())
    assert peak * playback_gain < .95
    block = round(RATE * .05)
    rms = np.array([np.sqrt(np.mean(decoded[i:i + block] ** 2)) for i in range(0, len(decoded), block)])
    envelope = np.clip(rms / np.percentile(rms, 95), 0, 1)
    mono = decoded.mean(axis=1)
    low = signal.sosfilt(signal.butter(3, 150, 'lowpass', fs=RATE, output='sos'), mono)
    hop = round(RATE * .005)
    count = len(low) // hop
    low_rms = np.sqrt(np.mean(low[:count * hop].reshape(count, hop) ** 2, axis=1))
    onset = np.maximum(low_rms - np.roll(low_rms, 2), 0)
    onset[:2] = 0
    times = (np.arange(count) + .5) * hop / RATE
    peaks, _ = signal.find_peaks(onset, distance=60, prominence=float(np.quantile(onset, .8)))
    hist, bins = np.histogram(times[peaks] % PERIOD, bins=100, range=(0, PERIOD), weights=onset[peaks])
    phase = float((bins[np.argmax(hist)] + bins[np.argmax(hist) + 1]) / 2)
    aligned = np.abs((times[peaks] - phase + PERIOD / 2) % PERIOD - PERIOD / 2) < .045
    indices = np.round((times[peaks][aligned] - phase) / PERIOD)
    period, intercept = np.polyfit(indices, times[peaks][aligned], 1)
    fitted_bpm = float(60 / period)
    residual = float(np.median(np.abs(times[peaks][aligned] - (indices * period + intercept))) * 1000)
    assert abs(fitted_bpm - BPM) < .2 and int(aligned.sum()) > 60
    changes = 'A 60-second / 128-beat excerpt from 95.000–155.000 seconds; constant gain loudness matching to approximately -16 LUFS; 4 ms edge fades; re-encoded as 160 kbps stereo MP3 for looping game playback. No EQ, pitch or tempo changes.'
    attribution = f'"{TITLE}" by {ARTIST}. Source: {SOURCE_URL} . Licensed under CC BY 3.0: {LICENSE}'
    track = dict(id='deep-woyak', title=TITLE, artist=ARTIST, sourceUrl=SOURCE_URL, genre='Deep house',
        description='A steady deep-house groove from the approved Deep Woyak preview.', bpm=BPM, beatsPerBar=4, loopBeats=128,
        durationMs=SECONDS * 1000, downbeatOffsetMs=round(phase * 1000, 3), loopStartSeconds=0,
        audioUrl=f'/audio/{path.name}', audioBytes=path.stat().st_size, audioSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        sampleRate=RATE, decodedSampleFrames=len(decoded), sourceDecodedDurationMs=len(source) / RATE * 1000,
        sourceStartMs=START * 1000, sourceEndMs=(START + SECONDS) * 1000, sourceSha256=hashlib.sha256(source_path.read_bytes()).hexdigest(),
        licenseUrl=LICENSE, creditsUrl='/audio/CREDITS.txt', attribution=attribution, changes=changes, playbackGain=playback_gain,
        sections=[dict(startMs=0, section='drop', energy=.82, kickOn=True)], envelope=dict(stepMs=50, values=np.round(envelope, 5).tolist()),
        analysis=dict(auditioned=False, method='Offline decoded-waveform, loudness and transient analysis of the owner-approved preview source window',
            phraseAlignment='128 tempo-grid beats from the approved preview entrance; harmonic seam has not been manually auditioned.',
            downbeatNotes='Repeated 128 BPM low-frequency attack phase estimated computationally; musical bar identity is not manually verified.',
            cueNotes='A broad steady-groove cue follows the stable four-second RMS blocks across the excerpt; section identity is not manually verified.',
            beatFitBpm=round(fitted_bpm, 5), beatFitMedianResidualMs=round(residual, 3), beatFitAlignedOnsetCount=int(aligned.sum()),
            decodedPeak=round(peak, 6), decodedRms=round(float(np.sqrt(np.mean(decoded ** 2))), 6), gainDb=round(gain_db, 3),
            integratedLufs=float(measurement['input_i']), playbackTargetLufs=-16, sourceIntegratedLufs=float(original_loudness['input_i']),
            envelopeNormalization='50 ms stereo RMS of the final MP3, normalized to its 95th percentile and clamped to [0,1].', browserDecodeVerified=False))
    tracks.append(track)
    (output_dir / 'midnight-techno-128beat.mp3').unlink(missing_ok=True)
    manifest['tracks'] = tracks
    (output_dir / 'music-assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
    credits = ['RECORDED MUSIC CREDITS', '', 'Edited recordings licensed individually under CC BY 4.0 or CC BY 3.0. The creators do not endorse this game.', 'Sources/licenses checked 2026-10-12. Personal playback volume is separate from approximately -16 LUFS per-track loudness matching.', '']
    for item in tracks:
        credits.extend([item['attribution'], 'Changes: ' + item['changes'], 'Playback gain: ' + str(item['playbackGain']), ''])
    credits += ['CC BY 3.0 legal code: https://creativecommons.org/licenses/by/3.0/legalcode', 'CC BY 4.0 legal code: https://creativecommons.org/licenses/by/4.0/legalcode.en', 'No additional restrictions are imposed on reuse allowed by each recording’s license.', '']
    (output_dir / 'CREDITS.txt').write_text('\n'.join(credits))
    print(json.dumps({k: v for k, v in track.items() if k != 'envelope'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/audio')
    args = parser.parse_args()
    prepare(args.source_dir, args.output_dir)
