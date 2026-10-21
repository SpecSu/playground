import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('group smoke requires an explicit remote HTTPS origin before making requests', () => {
  for (const base of ['', 'http://127.0.0.1:8787', 'https://localhost', 'https://club.example/?room=main', 'https://club.example/api/room', 'https://name:secret@club.example']) {
    const result = spawnSync(process.execPath, ['scripts/qa/group-http-smoke.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, QA_BASE_URL: base },
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1, base);
    assert.match(result.stderr, /QA_BASE_URL must be an explicit remote HTTPS origin/, base);
    assert.doesNotMatch(result.stdout, /"passed": true/);
  }
});
