#!/usr/bin/env python3
"""Independently decode and validate all six shipped recordings and rights scopes."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT/'public'
AUDIO = PUBLIC/'audio'
MANIFEST = AUDIO/'music-assets.json'
IDS = ['filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove', 'meditative-groove', 'arabic-nights']
SOURCE_DIR = None
EXPECTED_FRAMES = {'filtered-chords':9811848, 'runway-poise':9781128, 'tech-house-groove':8542728, 'understated-groove':9445128}


def decode(path, rate):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0',
                                   '-f', 'f32le', '-ac', '2', '-ar', str(rate), '-'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2)


def loudness(path):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-map', '0:a:0',
        '-af', 'loudnorm=I=-16:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    return json.loads(re.search(r'\{\s*"input_i".*?\}', result.stderr, re.S).group())


class RecordedMusicAssets(unittest.TestCase):
    def test_published_assets_are_measured_credited_recordings(self):
        manifest = json.loads(MANIFEST.read_text())
        provenance = json.loads((ROOT/'scripts/audio/user-generated-provenance.json').read_text())
        frozen_arabic = json.loads((ROOT/'scripts/audio/arabic-nights-preserved-metadata.json').read_text())
        self.assertEqual(manifest['schemaVersion'], 1)
        self.assertEqual([t['id'] for t in manifest['tracks']], IDS)
        self.assertEqual(manifest['tracks'][-1], frozen_arabic)
        self.assertLessEqual(sum(t['audioBytes'] for t in manifest['tracks']), 16*1024*1024)
        self.assertEqual({p.name for p in AUDIO.glob('*.mp3')}, {Path(t['audioUrl']).name for t in manifest['tracks']})
        credits = (AUDIO/'CREDITS.txt').read_text()
        for track in manifest['tracks']:
            with self.subTest(track=track['id']):
                self.assertTrue(track['audioUrl'].startswith('/audio/'))
                path = PUBLIC/track['audioUrl'].lstrip('/')
                self.assertTrue(path.is_file())
                self.assertEqual(path.stat().st_size, track['audioBytes'])
                self.assertLess(track['audioBytes'], 4_000_000)
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), track['audioSha256'])
                samples = decode(path, track['sampleRate'])
                measured_ms = len(samples)/track['sampleRate']*1000
                self.assertAlmostEqual(measured_ms, track['durationMs'], delta=.001)
                self.assertEqual(len(samples), track['decodedSampleFrames'])
                self.assertAlmostEqual(track['loopBeats'], track['durationMs']*track['bpm']/60000, delta=.000001)
                self.assertEqual(track['loopStartSeconds'], 0)
                self.assertTrue(np.isfinite(samples).all())
                peak = float(np.abs(samples).max())
                self.assertAlmostEqual(peak, track['analysis']['decodedPeak'], delta=.000001)
                self.assertLess(peak*track['playbackGain'], .95)
                self.assertGreater(float(np.sqrt(np.mean(samples**2))), .02)
                envelope = track['envelope']
                self.assertIn(envelope['stepMs'], [50, 100])
                values = np.asarray(envelope['values'])
                self.assertEqual(len(values), math.ceil(track['durationMs']/envelope['stepMs']))
                self.assertTrue(np.isfinite(values).all())
                self.assertGreaterEqual(float(values.min()), 0)
                self.assertLessEqual(float(values.max()), 1)
                self.assertGreater(float(values.std()), .01)
                block = round(track['sampleRate']*envelope['stepMs']/1000)
                rms = np.array([np.sqrt(np.mean(samples[i:i+block]**2)) for i in range(0, len(samples), block)])
                np.testing.assert_allclose(values, np.clip(rms/np.percentile(rms, 95), 0, 1), atol=.00006)
                self.assertGreaterEqual(track['downbeatOffsetMs'], 0)
                self.assertLess(track['downbeatOffsetMs'], 60000/track['bpm'])
                self.assertEqual(track['sections'][0]['startMs'], 0)
                self.assertEqual(sorted(x['startMs'] for x in track['sections']), [x['startMs'] for x in track['sections']])
                self.assertTrue(all(0 <= x['startMs'] < track['durationMs'] for x in track['sections']))
                self.assertTrue(all(0 <= x['energy'] <= 1 and x['section'] in ['break','build','drop','return'] for x in track['sections']))
                self.assertGreater(track['playbackGain'], 0)
                self.assertLessEqual(track['playbackGain'], 2)
                measured = loudness(path)
                self.assertAlmostEqual(float(measured['input_i']), track['analysis']['integratedLufs'], delta=.03)
                effective_lufs = float(measured['input_i'])+20*math.log10(track['playbackGain'])
                if track['analysis'].get('headroomLimited'):
                    self.assertLessEqual(effective_lufs, -16)
                    self.assertGreater(effective_lufs, -19)
                    self.assertAlmostEqual(effective_lufs, track['analysis']['effectivePlaybackLufs'], delta=.03)
                else:
                    self.assertAlmostEqual(effective_lufs, -16, delta=.03)
                self.assertFalse(track['analysis']['auditioned'])
                self.assertFalse(track['analysis']['browserDecodeVerified'])
                for value in [track['title'], track['artist'], track['sourceUrl']]:
                    self.assertIn(value, track['attribution'])
                self.assertIn(track['attribution'], credits)
                self.assertIn(track['changes'], credits)
                self.assertIn(track['sourceSha256'], credits)
                if track['id'] == 'arabic-nights':
                    self.assertEqual(track['licenseUrl'], 'https://creativecommons.org/licenses/by/3.0/')
                    self.assertEqual(track['audioSha256'], 'a464bce9092ead1b34c7cebb2f46c836d4b03e4d348cb23fbcde66b665413f4e')
                    samples_32k = decode(path, 32000)
                    self.assertAlmostEqual(len(samples_32k)/32000*1000, track['durationMs'], delta=1000/32000)
                    continue
                self.assertEqual(track['rightsKind'], 'user-authorized-demo')
                self.assertIsNone(track['licenseUrl'])
                self.assertEqual(track['sourceUrl'], '/audio/CREDITS.txt')
                self.assertEqual(track['artist'], 'User-provided · Suno')
                self.assertIn('No Creative Commons license or general redistribution rights are asserted.', track['attribution'])
                self.assertIn('signal-derived', track['analysis']['cueNotes'])
                self.assertLess(float(measured['input_tp'])+20*math.log10(track['playbackGain']), -.45)
                self.assertEqual(track['sampleRate'], 48000)
                probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
                self.assertEqual(len(probe['streams']), 1, 'Artwork and non-audio streams must be removed')
                stream = probe['streams'][0]
                self.assertEqual(stream['codec_type'], 'audio')
                self.assertEqual(stream['channels'], 2)
                self.assertEqual(int(stream['bit_rate']), 128000)
                tags = probe['format'].get('tags', {})
                self.assertEqual(tags['title'], track['title'])
                self.assertEqual(tags['artist'], track['artist'])
                self.assertTrue(set(tags).issubset({'title','artist','copyright','encoder'}))
                if track['id'] in EXPECTED_FRAMES:
                    self.assertEqual(track['decodedSampleFrames'], EXPECTED_FRAMES[track['id']])
                    self.assertEqual(track['sourceStartMs'], 0)
                    self.assertEqual(track['sourceEndMs'], track['sourceDecodedDurationMs'])
                    self.assertEqual(track['sourceDecodedSampleFrames'], track['decodedSampleFrames'])
                    self.assertIn('Complete decoded recording retained', track['changes'])
                else:
                    self.assertEqual(track['durationMs'], 96000)
                    self.assertGreater(track['sourceStartMs'], 0)
                    self.assertLess(track['sourceEndMs'], track['sourceDecodedDurationMs'])
                    self.assertIn('excerpt', track['changes'])
                source_record = next(t for t in provenance['tracks'] if t['id'] == track['id'])
                self.assertEqual(source_record['sourceSha256'], track['sourceSha256'])
                self.assertEqual(source_record['sourceDecodedSampleFrames'], track['sourceDecodedSampleFrames'])
                if SOURCE_DIR:
                    source_path = SOURCE_DIR/source_record['suppliedFilename']
                    self.assertEqual(hashlib.sha256(source_path.read_bytes()).hexdigest(), track['sourceSha256'])
                    self.assertEqual(len(decode(source_path, 48000)), track['sourceDecodedSampleFrames'])
                # Independently verify playback-rate decoding stays within one output frame.
                samples_32k = decode(path, 32000)
                self.assertAlmostEqual(len(samples_32k)/32000*1000, track['durationMs'], delta=1000/32000)
        self.assertFalse(list(AUDIO.glob('*.source.mp3')))
        self.assertFalse(list(AUDIO.glob('*.html')))
        print('Verified six audio hashes, fresh native/32 kHz decodes, full-song frame counts, RMS envelopes, loudness/headroom, metadata stripping, Arabic preservation, rights scope and 16 MiB compressed budget.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path)
    args, other = parser.parse_known_args()
    SOURCE_DIR = args.source_dir
    unittest.main(argv=[__file__]+other)
