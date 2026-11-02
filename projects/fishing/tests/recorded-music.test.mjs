import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_CATALOG, TRACK_IDS, getTrack, getTrackTiming, getMusicSectionEnergy, isTrackId } from '../lib/music-catalog.ts';

test('six approved recordings expose honest rights and resolve every retired ID', () => {
  assert.deepEqual(MUSIC_CATALOG.map(track => track.id), ['filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove', 'meditative-groove', 'arabic-nights']);
  for (const id of ['neon-house', 'midnight-techno', 'mirrorball-disco', 'sun-goes-down', 'deep-woyak']) {
    assert.equal(isTrackId(id), true);
    assert.equal(getTrack(id), getTrack('arabic-nights'));
  }
  assert.equal(isTrackId('__proto__'), false);
  assert.throws(() => getTrack('__proto__'), /Unknown track/);
  for (const track of MUSIC_CATALOG) {
    assert.ok(TRACK_IDS.includes(track.id));
    assert.equal(track.original, false);
    assert.match(track.audioUrl, /^\/audio\/[^/]+\.mp3$/);
    assert.ok(track.artist && track.attribution && track.changes && track.sourceUrl);
    assert.equal(track.durationSeconds, track.durationMs / 1000);
    assert.ok(track.durationSeconds >= 55 && track.durationSeconds <= 210);
    assert.ok(track.audioBytes > 0 && track.audioBytes < 4 * 1024 * 1024);
    assert.equal(track.sections[0].startMs, 0);
    if (track.id === 'arabic-nights') {
      assert.equal(track.licenseUrl, 'https://creativecommons.org/licenses/by/3.0/');
    } else {
      assert.equal(track.rightsKind, 'user-authorized-demo');
      assert.equal(track.licenseUrl, null, 'private permission is not a Creative Commons license');
      assert.equal(track.sourceUrl, '/audio/CREDITS.txt');
    }
  }
  for (const id of ['filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove']) assert.ok(getTrack(id).durationSeconds > 175, 'first four user songs stay full length');
  assert.ok(getTrack('meditative-groove').durationSeconds >= 90 && getTrack('meditative-groove').durationSeconds <= 100);
});

function unevenTrack() {
  return {
    ...getTrack('arabic-nights'), bpm: 120, beatsPerBar: 4, loopBeats: 122,
    durationMs: 61337, durationSeconds: 61.337, downbeatOffsetMs: 125,
    sections: [
      { startMs: 0, section: 'intro', energy: 0.4, kickOn: true },
      { startMs: 1000, section: 'build', energy: 0.6, kickOn: true },
      { startMs: 2500, section: 'drop', energy: 0.95, kickOn: true },
      { startMs: 4000, section: 'break', energy: 0.2, kickOn: false },
    ],
    envelope: { stepMs: 500, values: [0.1, 0.2, 0.4, 0.8, 0.9, 1, 0.9, 0.5, 0.1] },
  };
}

test('recording duration controls wrapping while downbeat offset controls beat phase', () => {
  const track = unevenTrack();
  const timing = getTrackTiming(track, 1000, 1000 + track.durationMs * 3 + 375);
  assert.equal(timing.loop, 3);
  assert.equal(timing.positionMs, 375);
  assert.equal(timing.beat, 0);
  assert.equal(timing.absoluteBeat, 366);
  assert.equal(timing.beatPhase, 0.5);
  assert.equal(timing.progress, 375 / track.durationMs);
  const early = getTrackTiming(track, 1000, 1050);
  assert.equal(early.pulse, 0, 'there is no kick before the first recorded downbeat');
  const future = getTrackTiming(track, 1000, 500);
  assert.equal(future.playing, false);
  assert.equal(future.positionMs, 0);
  assert.equal(future.startsInMs, 500);
  assert.equal(future.pulse, 0);
});

test('exact duration boundaries do not drift over thousands of recording loops', () => {
  const track = unevenTrack();
  for (const loop of [1, 10, 1000, 10000]) {
    const timing = getTrackTiming(track, 0, loop * track.durationMs);
    assert.equal(timing.loop, loop);
    assert.equal(timing.positionMs, 0);
    assert.equal(timing.progress, 0);
  }
  assert.throws(() => getTrackTiming(track, NaN, 0), /finite/);
});

test('real recording lead-ins preserve continuous dance phase across each loop boundary', () => {
  for (const track of MUSIC_CATALOG) {
    for (const loop of [1, 10, 1000]) {
      const end = track.durationMs * loop;
      const before = getTrackTiming(track, 0, end - 1);
      const boundary = getTrackTiming(track, 0, end);
      const after = getTrackTiming(track, 0, end + 1);
      const phase = (timing) => timing.absoluteBeat + timing.beatPhase;
      const oneMs = track.bpm / 60000;
      assert.ok(Math.abs(phase(boundary) - phase(before) - oneMs) < 1e-8, `${track.id}: no loop jump`);
      assert.ok(Math.abs(phase(after) - phase(boundary) - oneMs) < 1e-8, `${track.id}: no lead-in freeze`);
      assert.equal(boundary.pulse, 0, 'no imaginary kick before the recorded attack');
    }
  }
});

test('recording cues and RMS envelope drive shared deterministic musical energy', () => {
  const track = unevenTrack();
  const at = (ms) => getMusicSectionEnergy(track, getTrackTiming(track, 0, ms));
  assert.equal(at(1000).section, 'build');
  assert.equal(at(1000).sectionProgress, 0);
  assert.ok(at(2000).build > at(1000).build);
  assert.equal(at(2500).section, 'drop');
  assert.equal(at(2500).drop, 1);
  assert.equal(at(4000).section, 'break');
  assert.equal(at(4000).kickOn, false);
  assert.ok(at(2500).energy > at(4000).energy);
  assert.deepEqual(at(2500), at(track.durationMs + 2500));
  for (let ms = 0; ms < track.durationMs; ms += 125) {
    for (const key of ['energy', 'beatPulse', 'downbeat', 'build', 'drop', 'sectionProgress']) {
      assert.ok(Number.isFinite(at(ms)[key]) && at(ms)[key] >= 0 && at(ms)[key] <= 1, key);
    }
  }
  assert.throws(() => getMusicSectionEnergy(track, NaN), /finite/);
});
