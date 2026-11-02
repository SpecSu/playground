/** Independent evidence checks. Run after rendering and visual-review.json exist.
 * node scripts/avatars/festival-v033/verify-evidence.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] ?? '.local-qa/v033');
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const glb = bytes => { const size = bytes.readUInt32LE(12), binHeader = 20 + size; return { json: JSON.parse(bytes.subarray(20, binHeader)), binary: bytes.subarray(binHeader + 8, binHeader + 8 + bytes.readUInt32LE(binHeader)) }; };
const images = ({ json, binary }) => json.images.map(image => { const view = json.bufferViews[image.bufferView], start = view.byteOffset ?? 0; return sha(binary.subarray(start, start + view.byteLength)); });
const metrics = readJson('runtime-pose-metrics.json'), renders = readJson('render-report-all.json'), collision = readJson('tool-intersections.json'), visual = readJson('visual-review.json');
assert.equal(metrics.snapshots.length, 48); assert.equal(renders.length, 32); assert.equal(collision.snapshots.length, 24); assert.equal(visual.reviewed.length, 32);
assert.equal(new Set(metrics.snapshots.map(item => item.file)).size, 48);
assert.equal(new Set(renders.map(item => item.image)).size, 32);
for (const [path, hash] of Object.entries(metrics.sourceHashes)) assert.equal(sha(readFileSync(path)), hash, `${path}: runtime source unchanged`);
let textureChecks = 0, bodyVertices = 0;
for (const snapshot of metrics.snapshots) {
  assert.equal(snapshot.rootScale, 2); assert.equal(snapshot.boneScaleMaxDelta, 0);
  const originalBytes = readFileSync(`public/avatars/cast-v1/${snapshot.kind}.glb`), bytes = readFileSync(resolve(root, snapshot.file));
  assert.equal(sha(originalBytes), snapshot.sourceSha256); assert.equal(sha(bytes), snapshot.exportedSha256);
  const original = glb(originalBytes), output = glb(bytes);
  assert.ok(output.binary.subarray(0, original.binary.length).equals(original.binary), `${snapshot.file}: original binary prefix`);
  assert.deepEqual(images(output), images(original), `${snapshot.file}: embedded image hashes`); textureChecks += images(output).length;
  assert.deepEqual(output.json.materials.slice(0, original.json.materials.length), original.json.materials);
  const sourceBody = original.json.meshes[0].primitives[0], body = output.json.meshes[0].primitives[0];
  assert.equal(sourceBody.indices, body.indices); assert.equal(sourceBody.attributes.TEXCOORD_0, body.attributes.TEXCOORD_0);
  if (snapshot.pose.startsWith('build')) for (const part of ['head', 'handle', 'grip']) assert.ok(output.json.meshes.some(mesh => mesh.name === `festival-builder-hammer-${part}`));
  bodyVertices += snapshot.meshes.filter(mesh => mesh.skinned).reduce((count, mesh) => count + mesh.vertices, 0);
}
assert.equal(textureChecks, 144);
for (const item of collision.snapshots) { assert.equal(item.headBodySurfaceOverlapPairs, 0, `${item.file}: head surface overlap`); assert.equal(item.headSamplesInsideAllThreeRays, 0, `${item.file}: head inside samples`); }
for (const render of renders) {
  const bytes = readFileSync(resolve(root, render.image));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], render.resolution);
  assert.equal(render.allImportedGeometryInFrame, true);
  assert.deepEqual(render.runtimeSourceHashes, metrics.sourceHashes);
  for (const [file, hash] of Object.entries(render.inputGlbHashes)) assert.equal(sha(readFileSync(resolve(root, file))), hash, `${render.image}: GLB lineage`);
  const review = visual.reviewed.find(item => item.image === render.image); assert.ok(review, `${render.image}: individually reviewed`); assert.equal(review.sha256, sha(bytes));
}
const scripts = Object.fromEntries(readdirSync('scripts/avatars/festival-v033').filter(name => /\.(mjs|py|md)$/.test(name)).map(name => [name, sha(readFileSync(`scripts/avatars/festival-v033/${name}`))]));
const summary = { status: 'verified', snapshots: 48, renders: 32, individualVisualReviews: 32, originalTextureHashChecks: textureChecks, originalBinaryPrefixChecks: 48, bodyVerticesBaked: bodyVertices, constructionSnapshotsWithZeroHammerHeadIntersections: 24, maxBoneScaleDelta: 0, sceneRootScale: 2, sourceHashes: metrics.sourceHashes, frozenQaScriptHashes: scripts, limitations: visual.limitations };
writeFileSync(resolve(root, 'verified-evidence.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
