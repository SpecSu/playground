#!/usr/bin/env python3
"""Prepare only the five user-authorized local recordings; preserve Arabic Nights.

No network access. See README.md and user-generated-provenance.json. Native-rate
source frames are retained for the four complete songs. No source artwork,
account identity, provider identifiers or acquisition URLs are propagated.
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[2]
RATE = 48000
ARTIST = 'User-provided · Suno'
TARGET_LUFS = -16
SPECS = [
    ('filtered-chords', 'Filtered Chords'),
    ('runway-poise', 'Runway Poise'),
    ('tech-house-groove', 'Tech House Groove'),
    ('understated-groove', 'Understated Groove'),
    ('meditative-groove', 'Meditative Groove'),
]
ARABIC_HASH = 'a464bce9092ead1b34c7cebb2f46c836d4b03e4d348cb23fbcde66b665413f4e'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path, rate=RATE):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0',
                                   '-f', 'f32le', '-ac', '2', '-ar', str(rate), '-'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2)


def loudness(path):
    cache = Path('/tmp')/('club-loudness-'+sha256(path)+'.json')
    if cache.exists():
        return json.loads(cache.read_text())
    result = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-map', '0:a:0',
        '-af', 'loudnorm=I=-16:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'],
        capture_output=True, text=True, check=True)
    measured = json.loads(re.search(r'\{\s*"input_i".*?\}', result.stderr, re.S).group())
    cache.write_text(json.dumps(measured))
    return measured


def encode(samples, path, title):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(RATE),
        '-i', 'pipe:0', '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-c:a', 'libmp3lame',
        '-b:a', '128k', '-write_xing', '1', '-id3v2_version', '3',
        '-metadata', f'title={title}', '-metadata', f'artist={ARTIST}',
        '-metadata', 'copyright=User-authorized public demo; see /audio/CREDITS.txt', str(path)],
        input=samples.astype('<f4').tobytes(), check=True)


def tempo(samples):
    # 12 kHz low-band positive spectral-energy changes, measured in 5 ms hops.
    mono = samples.mean(axis=1)[::4]
    low = signal.sosfilt(signal.butter(3, 150, fs=12000, output='sos'), mono)
    hop = 60
    n = len(low)//hop
    rms = np.sqrt(np.mean(low[:n*hop].reshape(n, hop)**2, axis=1))
    onset = np.maximum(rms-np.roll(rms, 2), 0)
    onset[:2] = 0
    bpms = np.arange(110, 145.001, .025)
    scores = np.zeros(len(bpms))
    local_bpms = []
    for start in range(0, len(onset)-4000, 2000):
        chunk = onset[start:start+4000]
        peaks, _ = signal.find_peaks(chunk, distance=50, prominence=float(np.quantile(chunk, .7)))
        times = (peaks+.5)*.005
        weights = chunk[peaks]
        concentration = np.abs(np.exp(2j*np.pi*bpms[:, None]*times[None, :]/60) @ weights) / max(float(sum(weights)), 1e-9)
        scores += concentration
        local_bpms.append(float(bpms[np.argmax(concentration)]))
    bpm = round(float(bpms[np.argmax(scores)]), 3)
    confidence = float(scores.max()/max(1, len(local_bpms)))
    step = .005
    peak_distance = 50
    method = 'low-band energy attacks'
    if confidence < .35:
        # Tonal bass can hide kicks: independently estimate high-band spectral
        # attacks instead of presenting a weak low-frequency maximum as reliable.
        frequencies, _, spectrum = signal.stft(mono, fs=12000, nperseg=512, noverlap=392)
        flux = np.maximum(np.diff(np.log1p(10*np.abs(spectrum)), axis=1), 0)
        onset = flux[frequencies > 150].sum(axis=0)
        step = .01
        peak_distance = 20
        scores = np.zeros(len(bpms))
        local_bpms = []
        for start in range(0, len(onset)-2000, 1000):
            chunk = onset[start:start+2000]
            peaks, _ = signal.find_peaks(chunk, distance=20, prominence=float(np.quantile(chunk, .7)))
            times = (peaks+.5)*step
            weights = chunk[peaks]
            concentration = np.abs(np.exp(2j*np.pi*bpms[:, None]*times[None, :]/60) @ weights) / max(float(sum(weights)), 1e-9)
            scores += concentration
            local_bpms.append(float(bpms[np.argmax(concentration)]))
        bpm = round(float(bpms[np.argmax(scores)]), 3)
        confidence = float(scores.max()/max(1, len(local_bpms)))
        method = 'high-band positive spectral-flux fallback after weak low-band periodicity'
    # First 30 s phase avoids making drift look like a verified global downbeat.
    chunk = onset[:round(30/step)]
    peaks, _ = signal.find_peaks(chunk, distance=peak_distance, prominence=float(np.quantile(chunk, .7)))
    times = (peaks+.5)*step
    weights = chunk[peaks]
    period = 60/bpm
    hist, bins = np.histogram(times % period, bins=100, range=(0, period), weights=weights)
    phase = float((bins[hist.argmax()]+bins[hist.argmax()+1])/2)
    residuals = np.abs((times-phase+period/2) % period-period/2)
    aligned = residuals < .045
    return dict(method=method, bpm=bpm, phaseMs=round(phase*1000, 3), confidence=round(confidence, 4),
                localMinBpm=round(min(local_bpms), 3), localMaxBpm=round(max(local_bpms), 3),
                medianResidualMs=round(float(np.median(residuals[aligned]))*1000, 3),
                alignedOnsetCount=int(aligned.sum()))


def envelope_and_sections(samples):
    block = RATE//10
    rms = np.array([np.sqrt(np.mean(samples[i:i+block]**2)) for i in range(0, len(samples), block)])
    envelope = np.clip(rms/np.percentile(rms, 95), 0, 1)
    # Broad eight-second energy bins. Labels are visual hints, not musical annotation.
    bins = [float(np.mean(rms[i:i+80])) for i in range(0, len(rms), 80)]
    reference = float(np.percentile(bins, 80))
    sections = []
    previous = None
    for i, value in enumerate(bins):
        energy = min(1., value/reference)
        kind = 'break' if energy < .55 else ('build' if energy < .80 else 'drop')
        if kind != previous:
            sections.append(dict(startMs=i*8000, section=kind, energy=round(max(.05, energy), 3), kickOn=energy >= .55))
            previous = kind
    return dict(stepMs=100, values=np.round(envelope.astype(float), 5).tolist()), sections


def choose_excerpt(samples):
    # Search 96-second windows on whole-second boundaries; favor sustained RMS
    # and comparable energetic entrances/exits, keeping clear of file ends.
    mono = samples.mean(axis=1)[::4]
    n = len(mono)//12000
    rms = np.sqrt(np.mean(mono[:n*12000].reshape(n, 12000)**2, axis=1))
    candidates = []
    for start in range(16, n-96-8):
        values = rms[start:start+96]
        score = float(values.mean()-.6*values.std()+.15*min(values[:4].mean(), values[-4:].mean()))
        candidates.append((score, start))
    score, start = max(candidates)
    return start, dict(method='96-second sliding-window mono RMS: mean - 0.6*standard deviation + 0.15*minimum edge-4-second mean; one-second candidates excluding file edges.',
                       score=round(score, 6), candidateCount=len(candidates), manuallyAuditioned=False)


def prepare(source_dir, output_dir, reuse_prepared=False):
    manifest_path = output_dir/'music-assets.json'
    manifest = json.loads(manifest_path.read_text())
    arabic = next(t for t in manifest['tracks'] if t['id'] == 'arabic-nights')
    frozen = json.loads((ROOT/'scripts/audio/arabic-nights-preserved-metadata.json').read_text())
    assert arabic == frozen, 'Arabic Nights metadata must remain exactly unchanged'
    assert sha256(output_dir/Path(arabic['audioUrl']).name) == ARABIC_HASH
    tracks = []
    provenance = dict(schemaVersion=1, authorizationDate='2026-10-12',
        authorization='The user explicitly authorized these user-provided Suno-generated recordings for this public demo.',
        scope='This public demo only; no Creative Commons license or general redistribution rights are asserted.',
        acquisition='User-supplied local MP3 files; source bytes retained outside the repository.',
        publicMetadataPolicy='No artwork, source account handles, provider track IDs, Library/chat IDs, tokens or signed URLs.', tracks=[])
    for track_id, title in SPECS:
        source_path = source_dir/f'{title}.mp3'
        resume_path = Path('/tmp')/f'{track_id}-prepared-track.json'
        if reuse_prepared and resume_path.exists():
            cached = json.loads(resume_path.read_text())
            cached_path = output_dir/Path(cached['track']['audioUrl']).name
            if cached['track']['sourceSha256'] == sha256(source_path) and cached_path.exists() and sha256(cached_path) == cached['track']['audioSha256']:
                tracks.append(cached['track'])
                provenance['tracks'].append(cached['record'])
                print('Reused validated preparation: '+track_id, flush=True)
                continue
        source = decode(source_path)
        source_frames = len(source)
        start = 0
        selection = None
        if track_id == 'meditative-groove':
            start, selection = choose_excerpt(source)
            clip = source[start*RATE:(start+96)*RATE].copy()
        else:
            clip = source.copy()
        del source
        analysis_wav = Path('/tmp')/f'{track_id}-normalization.wav'
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ac','2','-ar',str(RATE),'-i','pipe:0',
                        '-c:a','pcm_f32le',str(analysis_wav)], input=clip.astype('<f4').tobytes(), check=True)
        original_measurement = loudness(analysis_wav)
        analysis_wav.unlink()
        gain_db = min(TARGET_LUFS-float(original_measurement['input_i']), -2-float(original_measurement['input_tp']))
        clip *= 10**(gain_db/20)
        if selection:
            fade = round(.008*RATE)
            taper = np.linspace(0, 1, fade, dtype=np.float32)
            clip[:fade] *= taper[:, None]
            clip[-fade:] *= taper[::-1, None]
        expected_frames = len(clip)
        path = output_dir/f'{track_id}.mp3'
        encode(clip, path, title)
        del clip
        decoded = decode(path)
        assert len(decoded) == expected_frames, 'Gapless MP3 re-encode changed decoded sample count'
        final = loudness(path)
        integrated = float(final['input_i'])
        target_gain = 10**((TARGET_LUFS-integrated)/20)
        peak = float(np.abs(decoded).max())
        playback_gain = min(target_gain, .94/peak, 10**((-.6-float(final['input_tp']))/20))
        assert peak*playback_gain < .95, 'Effective decoded peak needs headroom'
        assert float(final['input_tp'])+20*math.log10(playback_gain) < -.45, 'Effective true peak needs headroom'
        beat = tempo(decoded)
        env, sections = envelope_and_sections(decoded)
        duration = len(decoded)/RATE*1000
        source_duration = source_frames/RATE*1000
        portion = (f'A {duration/1000:g}-second excerpt from {start:.3f}–{start+duration/1000:.3f} seconds of the decoded source; 8 ms edge fades added' if selection
                   else f'Complete decoded recording retained, {source_frames} frames / {duration/1000:.6f} seconds at {RATE} Hz; no trimming or edge fades')
        changes = portion+'; constant-gain loudness matching; artwork and source metadata removed; re-encoded as 128 kbps stereo MP3. No EQ, pitch or tempo changes. Playback gain targets -16 LUFS, with headroom protection taking priority for high-crest-factor recordings.'
        attribution = f'"{title}" — {ARTIST}. User-provided Suno-generated recording, authorized by the user for this public demo. Source and credits: /audio/CREDITS.txt. No Creative Commons license or general redistribution rights are asserted.'
        track = dict(id=track_id, title=title, artist=ARTIST, genre='User-generated electronic',
            description='User-provided Suno-generated recording for this public demo.', bpm=beat['bpm'], beatsPerBar=4,
            loopBeats=duration*beat['bpm']/60000, durationMs=duration, downbeatOffsetMs=beat['phaseMs'],
            loopStartSeconds=0, playbackGain=round(playback_gain, 8), audioUrl=f'/audio/{path.name}', audioBytes=path.stat().st_size,
            audioSha256=sha256(path), sampleRate=RATE, decodedSampleFrames=len(decoded),
            sourceDecodedDurationMs=source_duration, sourceDecodedSampleFrames=source_frames, sourceStartMs=start*1000,
            sourceEndMs=start*1000+duration, sourceSha256=sha256(source_path), sourceUrl='/audio/CREDITS.txt',
            rightsKind='user-authorized-demo', licenseUrl=None, creditsUrl='/audio/CREDITS.txt',
            attribution=attribution, changes=changes, sections=sections, envelope=env,
            analysis=dict(auditioned=False, browserDecodeVerified=False,
                method='Offline decoded-waveform RMS, local transient/spectral-flux periodicity, and ffmpeg EBU R128 loudness analysis.',
                phraseAlignment='Actual decoded duration is authoritative; fractional loopBeats expresses an approximate visual tempo, not an integer phrase or verified seamless loop.',
                downbeatNotes='Estimated recurring attack phase in the opening 30 seconds. This is not a verified musical downbeat; timing can drift in generated recordings.',
                cueNotes='Broad signal-derived eight-second RMS energy cues only. break/build/drop and kickOn are visual heuristics, not verified section names or isolated percussion detection.',
                beatMethod=beat['method'], beatFitBpm=beat['bpm'], beatConfidence=beat['confidence'], beatConfidenceLabel='low' if beat['confidence']<.35 else 'approximate',
                localTempoMinBpm=beat['localMinBpm'], localTempoMaxBpm=beat['localMaxBpm'],
                beatFitMedianResidualMs=beat['medianResidualMs'], beatFitAlignedOnsetCount=beat['alignedOnsetCount'],
                decodedPeak=round(peak, 7), decodedRms=round(float(np.sqrt(np.mean(decoded**2))), 7),
                gainDb=round(gain_db, 3), integratedLufs=integrated, truePeakDbtp=float(final['input_tp']),
                playbackTargetLufs=TARGET_LUFS, effectivePlaybackLufs=round(integrated+20*math.log10(playback_gain), 3), headroomLimited=playback_gain < target_gain, playbackGainDb=round(20*math.log10(playback_gain), 3),
                sourceIntegratedLufs=float(original_measurement['input_i']),
                envelopeNormalization='100 ms stereo RMS from the final decoded MP3, divided by its 95th percentile and clamped to [0,1].'))
        if selection:
            track['analysis']['excerptSelection'] = selection
        tracks.append(track)
        record = dict(id=track_id, suppliedFilename=source_path.name, sourceSha256=track['sourceSha256'], sourceBytes=source_path.stat().st_size,
                      sourceSampleRate=RATE, sourceDecodedSampleFrames=source_frames, sourceDecodedDurationMs=source_duration,
                      retainedStartMs=start*1000, retainedEndMs=start*1000+duration, rightsKind='user-authorized-demo')
        if track_id == 'tech-house-groove':
            record['sourceTitleNote'] = 'Embedded source title says Understated Groove; display title follows the user-supplied filename Tech House Groove.mp3.'
        provenance['tracks'].append(record)
        resume_path.write_text(json.dumps(dict(track=track, record=record), ensure_ascii=False))
        print(json.dumps({k:track[k] for k in ['id','durationMs','decodedSampleFrames','bpm','downbeatOffsetMs','audioBytes','playbackGain']})+' '+json.dumps(dict(peak=peak, lufs=integrated, bpmConfidence=beat['confidence'])), flush=True)
    tracks.append(arabic)
    manifest['tracks'] = tracks
    manifest['userAuthorizationCheckedOn'] = '2026-10-12'
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n')
    (ROOT/'scripts/audio/user-generated-provenance.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False)+'\n')
    credits = ['RECORDED MUSIC CREDITS', '',
        'The first five recordings are user-provided, Suno-generated recordings explicitly authorized by the user for this public demo on 2026-10-12. This is not a Creative Commons grant or a representation of general redistribution rights.',
        'Arabic Nights retains its existing CC BY 3.0 attribution and modification notice. The creator does not endorse this demo.',
        'Personal playback volume is separate from approximately -16 LUFS track matching.', '']
    for track in tracks:
        credits.extend([track['attribution'], 'Changes: '+track['changes'], 'Playback gain: '+str(track['playbackGain']),
                        'Source SHA-256: '+track['sourceSha256'], ''])
    credits.extend(['Arabic Nights only: CC BY 3.0 legal code: https://creativecommons.org/licenses/by/3.0/legalcode',
                    'No additional restrictions are imposed on reuse permitted by the Arabic Nights license. That license does not apply to the five user-provided recordings.', ''])
    (output_dir/'CREDITS.txt').write_text('\n'.join(credits))
    keep = {Path(t['audioUrl']).name for t in tracks}
    for path in output_dir.glob('*.mp3'):
        if path.name not in keep:
            path.unlink()
    assert next(t for t in json.loads(manifest_path.read_text())['tracks'] if t['id']=='arabic-nights') == frozen
    assert sha256(output_dir/'arabic-nights-128beat.mp3') == ARABIC_HASH


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=ROOT/'public/audio')
    parser.add_argument('--reuse-prepared', action='store_true', help='Reuse source/output-hash-matched local preparation checkpoints for this recipe')
    args = parser.parse_args()
    prepare(args.source_dir, args.output_dir, args.reuse_prepared)
