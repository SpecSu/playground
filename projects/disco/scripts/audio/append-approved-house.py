#!/usr/bin/env python3
"""Add only the two owner-approved CC BY 3.0 sources; never publish source tokens.

Run after prepare-recorded-music.py. Existing recording files stay byte-identical.
Only local ffmpeg/Python/numpy/scipy are used; no network access is performed.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[2]
RATE = 44100
TARGET_LUFS = -16
LICENSE = 'https://creativecommons.org/licenses/by/3.0/'
SPECS = [
    dict(id='sun-goes-down', source='naan-full.mp3', title='When The Sun Goes Down', artist='Naan Moons',
         sourceUrl='https://soundcloud.com/naanmoons/when-the-sun-goes-down-deep-house-free-download-creative-commons-attribution',
         start=160, genre='Deep house', description='Warm, layered house with a soft break before the groove returns.',
         sections=[dict(startMs=0, section='drop', energy=.82, kickOn=True), dict(startMs=56000, section='break', energy=.38, kickOn=False)]),
    dict(id='arabic-nights', source='nemphirex-full.mp3', title='Arabic Nights', artist='Nemphirex',
         sourceUrl='https://soundcloud.com/nemphirex/nemphirex-arabic-nights', start=64,
         genre='Deep house', description='A rolling house groove with a warm, winding melodic line.',
         sections=[dict(startMs=0, section='drop', energy=.83, kickOn=True)]),
]

def decode(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2)

def loudness(path):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', 'loudnorm=I=-16:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    return json.loads(re.search(r'\{\s*"input_i".*?\}', result.stderr, re.S).group())

def encode(samples, path, title, artist):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '160k', '-write_xing', '1', '-map_metadata', '-1', '-metadata', f'title={title} (demo excerpt)', '-metadata', f'artist={artist}', '-metadata', 'copyright=CC BY 3.0; see CREDITS.txt', str(path)], input=samples.astype('<f4').tobytes(), check=True)

def prepare(source_dir, output_dir):
    manifest = json.loads((output_dir / 'music-assets.json').read_text())
    # Re-running replaces only these approved additions; no rejected candidate is read.
    tracks = [t for t in manifest['tracks'] if t['id'] in ['neon-house', 'midnight-techno']]
    assert len(tracks) == 2
    for track in tracks:
        measured = loudness(ROOT / 'public' / track['audioUrl'].lstrip('/'))
        gain_db = TARGET_LUFS - float(measured['input_i'])
        track['playbackGain'] = round(10 ** (gain_db / 20), 8)
        track['analysis']['integratedLufs'] = float(measured['input_i'])
        track['analysis']['playbackTargetLufs'] = TARGET_LUFS
        track['analysis']['playbackGainDb'] = round(gain_db, 3)
    for spec in SPECS:
        source_path = source_dir / spec['source']
        source = decode(source_path)
        start = round(spec['start'] * RATE)
        clip = source[start:start + 64 * RATE].copy()
        assert len(clip) == 64 * RATE
        wav = Path('/tmp') / f"{spec['id']}-analysis.wav"
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(RATE), '-i', 'pipe:0', '-c:a', 'pcm_f32le', str(wav)], input=clip.astype('<f4').tobytes(), check=True)
        input_measurement = loudness(wav)
        gain_db = TARGET_LUFS - float(input_measurement['input_i'])
        clip *= 10 ** (gain_db / 20)
        fade = round(.004 * RATE)
        taper = np.linspace(0, 1, fade, dtype=np.float32)
        clip[:fade] *= taper[:, None]
        clip[-fade:] *= taper[::-1, None]
        path = output_dir / f"{spec['id']}-128beat.mp3"
        encode(clip, path, spec['title'], spec['artist'])
        decoded = decode(path)
        assert len(decoded) == 64 * RATE
        final_measurement = loudness(path)
        peak = float(np.abs(decoded).max())
        assert peak < .95
        block = round(RATE * .05)
        rms = np.array([np.sqrt(np.mean(decoded[i:i+block] ** 2)) for i in range(0, len(decoded), block)])
        envelope = np.clip(rms / np.percentile(rms, 95), 0, 1)
        mono = decoded.mean(axis=1)
        low = signal.sosfilt(signal.butter(3, 150, 'lowpass', fs=RATE, output='sos'), mono)
        hop = round(RATE * .005)
        count = len(low) // hop
        low_rms = np.sqrt(np.mean(low[:count*hop].reshape(count, hop) ** 2, axis=1))
        onset = np.maximum(low_rms - np.roll(low_rms, 2), 0)
        onset[:2] = 0
        times = (np.arange(count) + .5) * hop / RATE
        peaks, _ = signal.find_peaks(onset, distance=60, prominence=float(np.quantile(onset, .8)))
        hist, bins = np.histogram(times[peaks] % .5, bins=100, range=(0, .5), weights=onset[peaks])
        phase = float((bins[np.argmax(hist)] + bins[np.argmax(hist)+1]) / 2)
        aligned = np.abs((times[peaks] - phase + .25) % .5 - .25) < .045
        indices = np.round((times[peaks][aligned] - phase) / .5)
        period, intercept = np.polyfit(indices, times[peaks][aligned], 1)
        residual = np.median(np.abs(times[peaks][aligned] - (indices * period + intercept))) * 1000
        changes = f"A 64-second / 128-beat excerpt from {spec['start']:.3f}–{spec['start']+64:.3f} seconds; constant gain loudness matching to approximately -16 LUFS; 4 ms edge fades; re-encoded as 160 kbps stereo MP3 for looping game playback. No EQ, pitch or tempo changes."
        attribution = f'"{spec["title"]}" by {spec["artist"]}. Source: {spec["sourceUrl"]} . Licensed under CC BY 3.0: {LICENSE}'
        track = {key: spec[key] for key in ['id', 'title', 'artist', 'sourceUrl', 'genre', 'description']}
        track.update(dict(bpm=120, beatsPerBar=4, loopBeats=128, durationMs=64000, downbeatOffsetMs=round(phase*1000, 3), loopStartSeconds=0,
            audioUrl=f'/audio/{path.name}', audioBytes=path.stat().st_size, audioSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            sampleRate=RATE, decodedSampleFrames=len(decoded), sourceDecodedDurationMs=len(source)/RATE*1000,
            sourceStartMs=spec['start']*1000, sourceEndMs=(spec['start']+64)*1000, sourceSha256=hashlib.sha256(source_path.read_bytes()).hexdigest(),
            licenseUrl=LICENSE, creditsUrl='/audio/CREDITS.txt', attribution=attribution, changes=changes,
            playbackGain=round(10 ** ((TARGET_LUFS-float(final_measurement['input_i'])) / 20), 8), sections=spec['sections'],
            envelope=dict(stepMs=50, values=np.round(envelope,5).tolist()),
            analysis=dict(auditioned=False, method='Offline decoded-waveform, loudness and transient analysis of the owner-approved preview source window',
                phraseAlignment='128 tempo-grid beats from the approved preview entrance; harmonic seam has not been manually auditioned.',
                downbeatNotes='Repeated 120 BPM low-frequency attack phase estimated computationally; musical bar identity is not manually verified.',
                cueNotes='Section labels are broad signal-derived cues. The Naan excerpt energy falls substantially in its last eight seconds; Arabic Nights keeps a steady groove.',
                beatFitBpm=round(float(60/period),5), beatFitMedianResidualMs=round(float(residual),3), beatFitAlignedOnsetCount=int(aligned.sum()),
                decodedPeak=round(peak,6), decodedRms=round(float(np.sqrt(np.mean(decoded**2))),6), gainDb=round(gain_db,3),
                integratedLufs=float(final_measurement['input_i']), playbackTargetLufs=TARGET_LUFS, sourceIntegratedLufs=float(input_measurement['input_i']),
                envelopeNormalization='50 ms stereo RMS of the final MP3, normalized to its 95th percentile and clamped to [0,1].', browserDecodeVerified=False)))
        tracks.append(track)
        print(json.dumps({k:track[k] for k in ['id','durationMs','downbeatOffsetMs','playbackGain','audioBytes']}), track['analysis'], flush=True)
    manifest['tracks'] = tracks
    (output_dir / 'music-assets.json').write_text(json.dumps(manifest, indent=2)+'\n')
    credits = ['RECORDED MUSIC CREDITS', '', 'Edited recordings licensed individually under CC BY 4.0 or CC BY 3.0. The creators do not endorse this game.', 'Sources/licenses checked 2026-10-12. Personal playback volume is separate from approximately -16 LUFS per-track loudness matching.', '']
    for track in tracks:
        credits.extend([track['attribution'], 'Changes: '+track['changes'], 'Playback gain: '+str(track['playbackGain']), ''])
    credits += ['CC BY 3.0 legal code: https://creativecommons.org/licenses/by/3.0/legalcode', 'CC BY 4.0 legal code: https://creativecommons.org/licenses/by/4.0/legalcode.en', 'No additional restrictions are imposed on reuse allowed by each recording’s license.', '']
    (output_dir / 'CREDITS.txt').write_text('\n'.join(credits))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=ROOT/'public/audio')
    args = parser.parse_args()
    prepare(args.source_dir, args.output_dir)
