import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DANCE_TRACK, DANCE_TRACK_BEATS_MS, DANCE_TRACK_CHART, DANCE_TRACK_SECTIONS } from '../lib/dance-track.ts';

test('demo song is original user-provided audio with measured full decoded duration', () => {
  assert.equal(DANCE_TRACK.durationMs, 51_120);
  assert.ok(Math.abs(-14.60 + 20 * Math.log10(DANCE_TRACK.playbackGain) - (-16)) < 0.001);
  assert.equal(DANCE_TRACK.durationSeconds * 1000, DANCE_TRACK.durationMs);
  const asset = readFileSync(new URL('../public/audio/dance-machine/gai-chi-yao-le.mp3', import.meta.url));
  assert.equal(createHash('sha256').update(asset).digest('hex'), 'e15dca1530d99aea8c7da8947e10ec7ed1be8f60bb9107119fde16a9d2337ae2');
  assert.equal(asset.length, 1_203_640);
});

test('authored chart is sparse, onset-aligned, four-direction, and leaves the complete tail', () => {
  assert.equal(DANCE_TRACK.bpm, 115);
  assert.equal(DANCE_TRACK_CHART.length, 77);
  assert.deepEqual([...new Set(DANCE_TRACK_CHART.map(n => n.lane))].sort(), [0, 1, 2, 3]);
  for (const [i, note] of DANCE_TRACK_CHART.entries()) {
    assert.equal(note.id, i);
    assert.ok(note.atMs >= 2000 && note.atMs + 180 < DANCE_TRACK.durationMs);
    assert.ok(DANCE_TRACK_BEATS_MS.some(beat => Math.abs(beat - note.atMs) <= 25));
    if (i) {
      assert.ok(note.atMs - DANCE_TRACK_CHART[i - 1].atMs >= 480);
      assert.notEqual(note.lane, DANCE_TRACK_CHART[i - 1].lane);
    }
  }
  assert.ok(DANCE_TRACK.durationMs - DANCE_TRACK_CHART.at(-1)!.atMs > 1000);
  assert.ok(DANCE_TRACK_CHART.length / DANCE_TRACK.durationSeconds < 2);
});

test('scene energy sections cover the full song without gaps', () => {
  assert.equal(DANCE_TRACK_SECTIONS[0].startMs, 0);
  assert.equal(DANCE_TRACK_SECTIONS.at(-1)!.endMs, DANCE_TRACK.durationMs);
  DANCE_TRACK_SECTIONS.forEach((section, i) => {
    assert.ok(section.energy >= 0 && section.energy <= 1);
    assert.ok(section.endMs > section.startMs);
    if (i) assert.equal(section.startMs, DANCE_TRACK_SECTIONS[i - 1].endMs);
  });
});
