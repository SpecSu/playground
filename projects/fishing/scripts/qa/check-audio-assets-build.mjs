import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

// After the official build: node scripts/qa/check-audio-assets-build.mjs dist/client
// Also accepts public/ to validate the source asset package without building.
const root = resolve(process.argv[2] ?? 'dist/client');
assert.ok(existsSync(root), `Missing audio asset output: ${root}`);
const manifestFile = resolve(root, 'audio/music-assets.json');
assert.ok(existsSync(manifestFile), 'Missing recorded music manifest');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
assert.equal(manifest.schemaVersion, 1, 'Unsupported recording manifest schema');
assert.deepEqual(manifest.tracks?.map((track) => track.id), ['filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove', 'meditative-groove', 'arabic-nights'], 'Expected the six approved canonical recordings');
const unit = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
for (const track of manifest.tracks) {
  assert.match(track.audioUrl, /^\/audio\/[a-z0-9_.-]+\.mp3$/i, 'Expected a same-origin audio path');
  const file = resolve(root, `.${track.audioUrl}`);
  assert.ok(existsSync(file), `Missing recording asset: ${track.audioUrl}`);
  const bytes = readFileSync(file);
  assert.ok(bytes.length > 0 && bytes.length < 4 * 1024 * 1024, 'Recording exceeds compressed size budget');
  assert.equal(bytes.length, track.audioBytes, `Recording size mismatch: ${track.audioUrl}`);
  assert.match(track.audioSha256, /^[a-f0-9]{64}$/, 'Missing recording checksum');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), track.audioSha256, `Recording checksum mismatch: ${track.audioUrl}`);
  assert.ok(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0), 'Recording has no MP3 signature');
  assert.ok(Number.isFinite(track.durationMs) && track.durationMs >= 55000 && track.durationMs <= 210000, 'Invalid measured recording duration');
  assert.ok(Number.isFinite(track.bpm) && track.bpm > 0 && Number.isFinite(track.loopBeats) && track.loopBeats > 0, 'Invalid recording beat metadata');
  assert.ok(Number.isFinite(track.downbeatOffsetMs) && track.downbeatOffsetMs >= 0 && track.downbeatOffsetMs < track.durationMs, 'Invalid downbeat offset');
  assert.ok(track.title && track.artist && track.sourceUrl && track.attribution && track.changes, 'Missing recording credit or changes');
  if (track.id === 'arabic-nights') {
    assert.match(track.sourceUrl, /^https:\/\//, 'Source must link to the creator');
    assert.equal(track.licenseUrl, 'https://creativecommons.org/licenses/by/3.0/', 'Missing approved recording license');
  } else {
    assert.equal(track.rightsKind, 'user-authorized-demo', 'User tracks require explicit demo authorization');
    assert.equal(track.licenseUrl, null, 'Demo authorization must not invent a public reuse license');
    assert.equal(track.sourceUrl, '/audio/CREDITS.txt', 'User track provenance must point to the public notice');
  }
  assert.ok(Number.isFinite(track.playbackGain) && track.playbackGain > 0 && track.playbackGain <= 2, 'Invalid recording loudness gain');
  assert.equal(track.creditsUrl, '/audio/CREDITS.txt', 'Invalid public music credits path');
  assert.ok(existsSync(resolve(root, 'audio/CREDITS.txt')), 'Missing public music credits');
  if (track.decodedSampleFrames !== undefined) {
    assert.ok(Number.isInteger(track.decodedSampleFrames) && track.decodedSampleFrames > 0 && Number.isFinite(track.sampleRate) && track.sampleRate > 0, 'Invalid decoded sample metadata');
    assert.ok(Math.abs(track.decodedSampleFrames / track.sampleRate * 1000 - track.durationMs) < 2000 / track.sampleRate, 'Declared duration differs from decoded frame count');
  }
  assert.ok(Array.isArray(track.sections) && track.sections.length > 0 && track.sections[0].startMs === 0, 'Recording cues must start at zero');
  let previous = -1;
  for (const cue of track.sections) {
    assert.ok(Number.isFinite(cue.startMs) && cue.startMs > previous && cue.startMs < track.durationMs, 'Recording cue positions must be ordered within the clip');
    assert.ok(['intro', 'build', 'drop', 'break', 'return'].includes(cue.section) && unit(cue.energy) && typeof cue.kickOn === 'boolean', 'Invalid recording cue');
    previous = cue.startMs;
  }
  assert.ok(Number.isFinite(track.envelope?.stepMs) && track.envelope.stepMs > 0, 'Invalid RMS envelope step');
  assert.ok(Array.isArray(track.envelope.values) && track.envelope.values.length >= Math.ceil(track.durationMs / track.envelope.stepMs), 'RMS envelope does not cover the recording');
  assert.ok(track.envelope.values.every(unit), 'RMS envelope must be normalized');
}
const listedAudio = new Set(manifest.tracks.map(track => track.audioUrl.split('/').at(-1)));
for (const file of readdirSync(resolve(root, 'audio'))) {
  if (/\.mp3$/i.test(file)) assert.ok(listedAudio.has(file), `Unlisted recording asset: ${file}`);
}
function filesAt(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(path, entry.name);
    return entry.isDirectory() ? filesAt(file) : [file];
  });
}
for (const file of filesAt(root).filter((file) => extname(file) === '.js')) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), /club-audio-(?:worker|synth)|generateTrackPCM/, `Obsolete procedural audio in ${relative(root, file)}`);
}
console.log(`Audio asset check passed: ${manifest.tracks.length} licensed recording assets, exact sizes/checksums and bounded timing metadata. Listening/browser decode are separate checks.`);
