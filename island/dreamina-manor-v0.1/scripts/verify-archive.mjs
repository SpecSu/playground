/** Verify the current 0.1 source snapshot. Generated dependencies/build/state are not inputs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(root, 'ARCHIVE-MANIFEST.json'), 'utf8'));
const seen = new Set();
let bytes = 0;
for (const file of manifest.files) {
  assert(typeof file.path === 'string' && !file.path.startsWith('/') && !file.path.split('/').includes('..'), 'Unsafe manifest path');
  assert(!seen.has(file.path), `Duplicate path: ${file.path}`);
  seen.add(file.path);
  const target = path.join(root, file.path);
  assert(statSync(target).isFile(), `Not a file: ${file.path}`);
  const content = readFileSync(target);
  assert.equal(content.length, file.bytes, `Size mismatch: ${file.path}`);
  assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256, `SHA-256 mismatch: ${file.path}`);
  assert(content.length < 100 * 1024 * 1024, `Exceeds GitHub 100 MiB file limit: ${file.path}`);
  if (file.change === 'unchanged') assert.equal(file.sha256, file.sourceSha256, `Source mismatch: ${file.path}`);
  bytes += content.length;
}
for (const [directory, extension] of [['public/assets/avatars/cast-v1/', '.glb'], ['public/assets/avatars/portraits/', '.webp']]) {
  assert.equal(manifest.files.filter(file => file.path.startsWith(directory) && file.path.endsWith(extension)).length, 12, `Expected 12 ${extension} files`);
}
assert.equal(manifest.files.filter(file => file.path.startsWith('public/assets/world/plants/') && file.path.endsWith('.glb')).length, 10, 'Expected 10 plant GLBs');
assert.equal(seen.size, manifest.fileCount, 'File count mismatch');
assert.equal(bytes, manifest.totalBytes, 'Byte count mismatch');
console.log(JSON.stringify({version:manifest.version, sourceCommit:manifest.sourceCommit, files:seen.size, bytes, avatarFiles:24, plantGlbs:10, sha256:'verified', note:'Manifest excludes itself; generated/local files are ignored.'}, null, 2));

