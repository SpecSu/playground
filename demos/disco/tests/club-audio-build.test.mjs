import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../scripts/qa/check-audio-assets-build.mjs', import.meta.url));
function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'club-recording-build-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'audio'), { recursive: true });
  writeFileSync(join(root, 'audio/CREDITS.txt'), 'Recording credits and CC BY 4.0 changes');
  mkdirSync(join(root, '_next/static/chunks'), { recursive: true });
  writeFileSync(join(root, '_next/static/chunks/LiveFeed.js'), options.source ?? 'fetch("/audio/recording.mp3");');
  const bytes = Buffer.from('ID3-recorded-audio-fixture');
  const tracks = ['filtered-chords', 'runway-poise', 'tech-house-groove', 'understated-groove', 'meditative-groove', 'arabic-nights'].map((id) => ({
    id, title: id, artist: 'Creator', audioUrl: `/audio/${id}.mp3`, audioBytes: bytes.length,
    audioSha256: createHash('sha256').update(bytes).digest('hex'),
    durationMs: 60000, bpm: 128, loopBeats: 128, beatsPerBar: 4, downbeatOffsetMs: 0,
    sourceUrl: id === 'arabic-nights' ? 'https://example.com/recording' : '/audio/CREDITS.txt', licenseUrl: id === 'arabic-nights' ? 'https://creativecommons.org/licenses/by/3.0/' : null, rightsKind: id === 'arabic-nights' ? 'cc-by' : 'user-authorized-demo', playbackGain: 1,
    attribution: 'Title by Creator', changes: 'Excerpted and looped',
    creditsUrl: '/audio/CREDITS.txt',
    sections: [{ startMs: 0, section: 'drop', energy: 0.8, kickOn: true }],
    envelope: { stepMs: 1000, values: Array(60).fill(0.8) },
  }));
  for (const track of tracks) writeFileSync(join(root, `.${track.audioUrl}`), bytes);
  options.change?.(tracks, root);
  writeFileSync(join(root, 'audio/music-assets.json'), JSON.stringify({ schemaVersion: 1, tracks }));
  return root;
}
function check(root) {
  return execFileSync(process.execPath, [checker, root], { encoding: 'utf8', stdio: 'pipe' });
}

test('production checker accepts all six emitted authorized recording assets and unrelated workers', (t) => {
  const root = fixture(t, { source: 'new Worker("/unrelated-worker.js"); fetch("/audio/neon-house.mp3");' });
  assert.match(check(root), /6 licensed recording assets/);
});

test('production checker rejects missing or corrupted recording files', (t) => {
  const missing = fixture(t, { change: (tracks, root) => rmSync(join(root, `.${tracks[0].audioUrl}`)) });
  assert.throws(() => check(missing), (error) => /Missing recording asset/.test(error.stderr));
  const corrupt = fixture(t, { change: (tracks, root) => writeFileSync(join(root, `.${tracks[0].audioUrl}`), 'ID3-corrupt') });
  assert.throws(() => check(corrupt), (error) => /size mismatch/.test(error.stderr));
});

test('production checker rejects old synth entry points and unsafe asset paths', (t) => {
  const stale = fixture(t, { source: 'new Worker("/_next/static/club-audio-worker-abc.js");' });
  assert.throws(() => check(stale), (error) => /Obsolete procedural audio/.test(error.stderr));
  const escape = fixture(t, { change: (tracks) => { tracks[0].audioUrl = '/../private.mp3'; } });
  assert.throws(() => check(escape), (error) => /same-origin audio path/.test(error.stderr));
});

test('production checker rejects guessed duration, invalid cues and missing credit changes', (t) => {
  for (const change of [
    (tracks) => { tracks[0].durationMs = 0; },
    (tracks) => { tracks[0].sections[0].startMs = 400; },
    (tracks) => { tracks[0].changes = ''; },
    (tracks) => { tracks[0].envelope.values[0] = 5; },
  ]) {
    assert.throws(() => check(fixture(t, { change })));
  }
});

test('production checker rejects a missing public credits document', (t) => {
  const root = fixture(t, { change: (_tracks, root) => rmSync(join(root, 'audio/CREDITS.txt')) });
  assert.throws(() => check(root), (error) => /Missing public music credits/.test(error.stderr));
});

test('production checker rejects a retired recording left in the public asset directory', (t) => {
  const root = fixture(t, { change: (_tracks, root) => writeFileSync(join(root, 'audio/midnight-techno-128beat.mp3'), 'ID3-retired') });
  assert.throws(() => check(root), (error) => /Unlisted recording asset/.test(error.stderr));
});
