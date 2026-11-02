import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MUSIC_CATALOG, getTrackTiming, getMusicSectionEnergy } from '../lib/music-catalog.ts';

test('recording music envelopes change over time and remain deterministic across repeated loops', () => {
  for (const track of MUSIC_CATALOG) {
    const energies = new Set();
    for (let ms = 0; ms < track.durationMs; ms += 250) {
      const energy = getMusicSectionEnergy(track, getTrackTiming(track, 0, ms));
      const again = getMusicSectionEnergy(track, getTrackTiming(track, 0, ms + track.durationMs * 100));
      assert.deepEqual(again, energy);
      for (const key of ['energy', 'beatPulse', 'downbeat', 'build', 'drop', 'sectionProgress']) assert.ok(Number.isFinite(energy[key]) && energy[key] >= 0 && energy[key] <= 1, key);
      energies.add(Math.round(energy.energy * 100));
    }
    assert.ok(energies.size >= 10, 'lighting should follow the measured recording dynamics');
    const seconds = track.durationSeconds;
    assert.ok(seconds * 32000 * 2 * 4 < 52 * 1024 * 1024, 'a selected clip fits the bounded PCM budget at the requested context rate');
    for (const cue of track.sections) {
      const energy = getMusicSectionEnergy(track, getTrackTiming(track, 0, cue.startMs));
      assert.equal(energy.section, cue.section);
      assert.equal(energy.sectionProgress, 0);
    }
  }
});

test('runtime audio has no procedural renderer, Worker or silent fallback path', () => {
  const runtime = readFileSync(new URL('../lib/club-audio.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(runtime, /generateTrackPCM|club-audio-synth|club-audio-worker|new Worker/);
  assert.match(runtime, /decodeAudioData/);
});
