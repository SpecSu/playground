/** Actual GLB/Three.js pose validation. No browser, WebGL or measured-FPS claim. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AnimationMixer, Box3, LoopOnce, Matrix4, Mesh, Object3D, PropertyBinding, Quaternion, SkinnedMesh, Texture, Vector3, VectorKeyframeTrack } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationClip } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { LabAsset, LabManifest } from '../src/animation-lab/types.ts';

type Window = { start: number; end: number };
type Foot = { anchor: string; bone: string; stanceWindows: Window[]; expectedLiftMeters: number };
type ContactClip = { contactPlaneY: number; feet: Foot[]; airborneWindows: Window[]; contactMode: string };
type Contacts = { species: string; clips: Record<string, ContactClip> };
type Edge = { parent: string; child: string; lengthMeters: number };
type AuthorMetrics = { boneLengthEdges: Edge[]; deformingBones: string[]; glbSha256: string; [key: string]: unknown };
type Pose = { p: Vector3; q: Quaternion; localP: Vector3; localQ: Quaternion };
type ClipReport = {
 name: string; durationSeconds: number; samples: number; sampledVertices: number;
 bounds: { min: number[]; max: number[] }; minimumY: number; maximumRootMotionMeters: number;
 maximumBoneLengthRelativeError: number; maximumStanceAnchorErrorMeters: number;
 maximumStanceVertexErrorMeters: number; maximumCompensatedStanceDriftMeters: number;
 maximumFootLiftMeters: number; maximumVertexMotionMeters: number; weightedDeformBonesChanged: string[];
 limbChainsChanged: string[]; loopPositionErrorMeters: number; loopAngularErrorDegrees: number;
 headStart: number[]; headEnd: number[]; mouthStart: number[]; mouthEnd: number[];
 headStartQuaternion: number[]; headEndQuaternion: number[]; failures: string[];
};
export type AssetReport = { species: string; passed: boolean; failures: string[]; clips: ClipReport[]; vertices: number; triangles: number; bones: number; draws: number; materials: number; bytes: number; sha256: string; maximumWeightError: number; bounds: { min: number[]; max: number[] }; targetBudgetMet: boolean };
const DEGREES = 180 / Math.PI;
const LEGACY = new Set(['cow', 'sheep', 'pig', 'bunny', 'duck']);
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const inWindows = (u: number, windows: Window[]) => windows.some(w => u >= w.start - 1e-7 && u <= w.end + 1e-7);
const position = (node: Object3D) => node.getWorldPosition(new Vector3());
const snapshot = (node: Object3D): Pose => ({ p: position(node), q: node.getWorldQuaternion(new Quaternion()), localP: node.position.clone(), localQ: node.quaternion.clone() });
function loadJson<T>(file: string): T { return JSON.parse(readFileSync(file, 'utf8')); }

/** Contact metadata cannot erase the support phases that the pose sampler checks.
 * Coverage is the union across feet, allowing raised forepaws but never missing support.
 * The marker's actual skeleton parent, not an author-supplied name, identifies its foot.
 */
function validateContacts(asset: LabAsset, declaration: LabAsset['clips'][number], contact: ContactClip | undefined, nodes: Map<string, Object3D>, weighted: Set<string>): string[] {
 const failures: string[] = [], fail = (message: string) => failures.push(`contact: ${message}`);
 if (!contact || contact.contactMode !== declaration.contactMode || !Array.isArray(contact.feet) || !Array.isArray(contact.airborneWindows)) return ['contact: missing or wrong declaration'];
 if (!Number.isFinite(contact.contactPlaneY)) fail('nonfinite contact plane');
 // The lab contract uses local ground Y=0, including local perch poses. Future
 // world branch placement must not redefine this plane to excuse floating soles.
 else if (contact.contactPlaneY !== 0) fail('contact plane must equal the frozen local ground Y=0');
 const identities = contact.feet.map(foot => foot.anchor);
 if (identities.length !== asset.anchors.feet.length || new Set(identities).size !== identities.length || asset.anchors.feet.some(anchor => !identities.includes(anchor))) fail('feet must exactly match unique manifest sole markers');
 if (new Set(contact.feet.map(foot => foot.bone)).size !== contact.feet.length) fail('foot bones must be unique');
 for (const foot of contact.feet) {
  if (!weighted.has(foot.bone) || nodes.get(foot.anchor)?.parent?.name !== foot.bone) fail(`invalid weighted foot-bone mapping ${foot.anchor} -> ${foot.bone}`);
  if (!Number.isFinite(foot.expectedLiftMeters) || foot.expectedLiftMeters < 0) fail('invalid expected foot lift');
  if (!Array.isArray(foot.stanceWindows)) fail('missing stance windows');
 }
 const windows = [...contact.airborneWindows, ...contact.feet.flatMap(foot => foot.stanceWindows ?? [])];
 if (windows.some(w => !w || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end > 1 || w.end <= w.start)) fail('invalid positive stance/airborne window');
 if (failures.length) return failures;
 const stances = contact.feet.flatMap(foot => foot.stanceWindows), airborne = contact.airborneWindows;
 const coversCycle = (intervals: Window[]) => {
  let covered = 0;
  for (const window of [...intervals].sort((a, b) => a.start - b.start)) {
   if (window.start > covered) return false;
   covered = Math.max(covered, window.end);
  }
  return covered === 1;
 };
 // Shared transition endpoints are valid; a positive stance/airborne overlap is not.
 if (stances.some(stance => airborne.some(air => Math.min(stance.end, air.end) > Math.max(stance.start, air.start)))) fail('stance and airborne windows overlap');
 if (declaration.contactMode === 'grounded') {
  if (airborne.length) fail('grounded clip cannot declare airborne exemptions');
  if (!coversCycle(stances)) fail('grounded support must cover the entire cycle');
 } else if (declaration.contactMode === 'mixed') {
  if (!stances.length || !coversCycle([...stances, ...airborne])) fail('mixed support/airborne coverage leaves unaccounted phases');
 } else if (declaration.contactMode === 'airborne') {
  if (stances.length || !coversCycle(airborne)) fail('airborne clip needs full airborne coverage and no stance');
 } else if (declaration.contactMode === 'carried' && (stances.length || airborne.length)) fail('carried clip must not assert ground or airborne contact windows');
 if (declaration.name === 'walk' && contact.feet.some(foot => !foot.stanceWindows.length)) fail('walking requires a stance phase for every foot');
 return failures;
}

/** Evaluate all weighted deform-bone world poses on a common normalized timeline.
 * Keys plus interval interiors catch resampling aliases, and quaternion angleTo
 * treats q and -q as the same orientation. Sub-millimeter/sub-half-degree noise
 * is not a distinct expression, regardless of key counts or clip duration.
 */
function expressionFailures(root: Object3D, animations: AnimationClip[], bones: Object3D[]): string[] {
 const clips = ['pet', 'alert', 'celebrate'].map(name => animations.find(clip => clip.name === name));
 if (clips.some(clip => !clip || !Number.isFinite(clip.duration) || clip.duration <= 0)) return ['expression: missing or invalid expression clips'];
 const expressions = clips as AnimationClip[];
 const knots = [...new Set([...Array.from({ length: 33 }, (_, i) => i / 32), ...expressions.flatMap(clip => clip.tracks.flatMap(track => Array.from(track.times, t => t / clip.duration).filter(t => Number.isFinite(t) && t >= 0 && t <= 1)))])].sort((a, b) => a - b);
 const phases = [...new Set([...knots, ...knots.slice(1).map((knot, i) => (knots[i] + knot) / 2)])].sort((a, b) => a - b);
 const mixer = new AnimationMixer(root);
 const poses = expressions.map(clip => {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  return phases.map(phase => {
   mixer.setTime(phase * clip.duration); root.updateMatrixWorld(true);
   return bones.map(bone => ({ p: position(bone), q: bone.getWorldQuaternion(new Quaternion()).normalize() }));
  });
 });
 mixer.stopAllAction(); mixer.uncacheRoot(root); root.updateMatrixWorld(true);
 const failures: string[] = [];
 for (let a = 0; a < expressions.length; a++) for (let b = a + 1; b < expressions.length; b++) {
  const distinct = poses[a].some((frame, i) => frame.some((pose, j) => pose.p.distanceTo(poses[b][i][j].p) > .001 || pose.q.angleTo(poses[b][i][j].q) > .5 / DEGREES));
  if (!distinct) failures.push(`expression: ${expressions[a].name}/${expressions[b].name} must have distinct evaluated normalized curves`);
 }
 return failures;
}

export async function loadLabGlb(file: string): Promise<GLTF> {
 const buffer = readFileSync(file);
 return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
}

/** Samples every exported skinned vertex at every 24fps sample, exact endpoint, and declared contact interval boundary/interior.
 * Cached matrices implement the same linear-blend skinning equation as SkinnedMesh.applyBoneTransform.
 * The first vertex of each mesh/frame is independently cross-checked against Three's implementation.
 */
function skinFrame(mesh: SkinnedMesh, target: Float64Array, footBones: Map<string, string>, footMin: Map<string, number>, bounds: Box3): void {
 mesh.skeleton.update();
 const geometry = mesh.geometry, positions = geometry.getAttribute('position'), indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
 const matrices = mesh.skeleton.bones.map((bone, i) => new Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).multiply(bone.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix).elements);
 const v = new Vector3();
 for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i); let ox = 0, oy = 0, oz = 0;
  let dominant = 0, largest = -1;
  for (let k = 0; k < 4; k++) {
   const weight = weights.getComponent(i, k), joint = indices.getComponent(i, k); if (weight > largest) { largest = weight; dominant = joint; }
   const m = matrices[joint]; if (!m || weight === 0) continue;
   ox += weight * (m[0] * x + m[4] * y + m[8] * z + m[12]);
   oy += weight * (m[1] * x + m[5] * y + m[9] * z + m[13]);
   oz += weight * (m[2] * x + m[6] * y + m[10] * z + m[14]);
  }
  target[i * 3] = ox; target[i * 3 + 1] = oy; target[i * 3 + 2] = oz;
  v.set(ox, oy, oz); bounds.expandByPoint(v);
  const foot = footBones.get(mesh.skeleton.bones[dominant]?.name);
  if (foot) footMin.set(foot, Math.min(footMin.get(foot) ?? Infinity, oy));
  if (i === 0) {
   const actual = mesh.applyBoneTransform(i, new Vector3(x, y, z)).applyMatrix4(mesh.matrixWorld);
   if (actual.distanceTo(v) > 1e-7) throw new Error('Independent skin evaluator disagrees with Three.js applyBoneTransform');
  }
 }
}

export function validateLoadedAsset(asset: LabAsset, gltf: GLTF, contacts: Contacts, metrics: AuthorMetrics, bytes: Uint8Array, options: { onlyClips?: string[] } = {}): AssetReport {
 const failures: string[] = [], fail = (message: string) => { if (!failures.includes(message)) failures.push(message); };
 const root = gltf.scene, meshes: SkinnedMesh[] = [], allMeshes: Mesh[] = [], nodes = new Map<string, Object3D>();
 root.traverse(node => { nodes.set(node.name, node); if (node instanceof Mesh) allMeshes.push(node); if (node instanceof SkinnedMesh) meshes.push(node); });
 root.updateMatrixWorld(true);
 if (!meshes.length || meshes.length !== allMeshes.length) fail('static: every visible mesh must be an actual SkinnedMesh');
 const skeletonBones = new Map<string, Object3D>(); for (const mesh of meshes) for (const bone of mesh.skeleton.bones) skeletonBones.set(bone.name, bone);
 const semantic = new Set([asset.anchors.root, asset.anchors.mouth, asset.anchors.support, asset.anchors.ground, asset.anchors.headTarget, ...asset.anchors.feet]);
 const names = [asset.anchors.root, asset.anchors.body, asset.anchors.head, ...asset.anchors.neck, asset.anchors.mouth, asset.anchors.support, asset.anchors.ground, asset.anchors.headTarget, ...asset.anchors.feet];
 for (const name of names) if (!nodes.has(name) || !skeletonBones.has(name)) fail(`anchor: missing skeleton anchor ${name}`);
 for (const node of nodes.values()) if (node.scale.x <= 0 || node.scale.y <= 0 || node.scale.z <= 0) fail(`scale: nonpositive ${node.name}`);
 let vertices = 0, triangles = 0, draws = 0, maxWeightError = 0;
 const materials = new Set<unknown>(), weighted = new Set<string>();
 for (const object of [root, ...allMeshes]) if (Math.max(object.scale.x, object.scale.y, object.scale.z) - Math.min(object.scale.x, object.scale.y, object.scale.z) > 1e-5) fail('scale: nonuniform object scale');
 for (const mesh of meshes) {
  const geometry = mesh.geometry, positions = geometry.getAttribute('position'), weights = geometry.getAttribute('skinWeight'), indices = geometry.getAttribute('skinIndex');
  vertices += positions.count; triangles += (geometry.index?.count ?? positions.count) / 3; draws += geometry.groups.length || 1;
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
   materials.add(material);
   for (const value of Object.values(material)) if (value instanceof Texture) {
    const image = value.image as { width?: number; height?: number } | undefined;
    if (!image || (image.width ?? 0) > 1024 || (image.height ?? 0) > 1024) fail('budget: missing or oversized texture');
   }
  }
  if (!weights || !indices || weights.count !== positions.count || indices.count !== positions.count) { fail('weights: incomplete skin attributes'); continue; }
  for (let i = 0; i < weights.count; i++) {
   let sum = 0, influences = 0;
   for (let k = 0; k < 4; k++) {
    const weight = weights.getComponent(i, k), joint = indices.getComponent(i, k);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) fail('weights: invalid skin weight');
    if (!Number.isInteger(joint) || joint < 0 || joint >= mesh.skeleton.bones.length) fail('joint-index: out of range');
    if (weight > 1e-7) { influences++; if (mesh.skeleton.bones[joint]) weighted.add(mesh.skeleton.bones[joint].name); }
    sum += weight;
   }
   maxWeightError = Math.max(maxWeightError, Math.abs(sum - 1));
   if (Math.abs(sum - 1) > .0001 || influences < 1 || influences > 4) fail('weights: normalization/influence count');
  }
 }
 for (const name of weighted) if (semantic.has(name) || !metrics.deformingBones.includes(name)) fail(`weights: semantic/nondeforming anchor is weighted: ${name}`);
 if (skeletonBones.size > 64 || draws > 12 || bytes.byteLength > 4 * 1024 * 1024) fail('budget: hard asset budget exceeded');
 if (triangles > (LEGACY.has(asset.id) ? 40000 : 18000)) fail('budget: triangle budget exceeded');
 if (contacts.species !== asset.id) fail('contact: species does not match manifest');
 const expected = asset.clips.map(c => c.name).sort(), actual = gltf.animations.map(c => c.name).sort();
 if (JSON.stringify(expected) !== JSON.stringify(actual)) fail('clips: clip set differs from manifest');
 for (const animation of gltf.animations) for (const track of animation.tracks) {
  const binding = PropertyBinding.parseTrackName(track.name), node = PropertyBinding.findNode(root, binding.nodeName);
  if (!node) fail(`tracks: unresolved ${track.name}`);
  else if (!(node instanceof Object3D) || !skeletonBones.has(node.name)) fail(`root: scene/mesh track is forbidden: ${track.name}`);
 }
 const reports: ClipReport[] = [], envelope = new Box3();
 if (failures.some(f => f.startsWith('weights:') || f.startsWith('joint-index:') || f.startsWith('anchor:'))) return { species: asset.id, passed: false, failures, clips: reports, vertices, triangles, bones: skeletonBones.size, draws, materials: materials.size, bytes: bytes.byteLength, sha256: hash(bytes), maximumWeightError: maxWeightError, bounds: { min: [], max: [] }, targetBudgetMet: false };
 const mixer = new AnimationMixer(root), rootNode = nodes.get(asset.anchors.root)!;
 const rest = new Map([...skeletonBones].map(([n, b]) => [n, snapshot(b)]));
 const restScales = new Map([...skeletonBones].map(([n, b]) => [n, b.scale.clone()]));
 const edges = [...metrics.boneLengthEdges];
 // Independently check every other exported parent/child offset too. Only the
 // body under the stationary root may translate by contract. Zero-length
 // semantic markers do not define a physical bone length.
 for (const [name, node] of skeletonBones) {
  if (name === asset.anchors.body || !node.parent || !skeletonBones.has(node.parent.name)) continue;
  const lengthMeters = position(node).distanceTo(position(node.parent));
  if (lengthMeters > 1e-5 && !edges.some(e => e.child === name)) edges.push({ parent: node.parent.name, child: name, lengthMeters });
 }
 const initialObjects = new Map([...nodes].filter(([, n]) => !skeletonBones.has(n.name)).map(([n, b]) => [n, snapshot(b)]));
 for (const declaration of asset.clips) {
  if (options.onlyClips && !options.onlyClips.includes(declaration.name)) continue;
  const animation = gltf.animations.find(c => c.name === declaration.name); if (!animation) continue;
  const clipFailures: string[] = [], clipFail = (message: string) => { if (!clipFailures.includes(message)) clipFailures.push(message); };
  const contact = contacts.clips[declaration.name];
  const contactFailures = validateContacts(asset, declaration, contact, nodes, weighted);
  if (contactFailures.length) { for (const message of contactFailures) fail(`${declaration.name}/${message}`); continue; }
  if (Math.abs(animation.duration - declaration.durationSeconds) > 1 / 24) clipFail('duration: differs from manifest by more than one 24fps sample');
  mixer.stopAllAction(); const action = mixer.clipAction(animation).reset().setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const count = Math.ceil(animation.duration * 24);
  const contactTimes = [...contact.airborneWindows, ...contact.feet.flatMap(foot => foot.stanceWindows)].flatMap(window => [window.start, (window.start + window.end) / 2, window.end].map(u => u * animation.duration));
  const sampleTimes = [...new Set([...Array.from({ length: count + 1 }, (_, frame) => frame === count ? animation.duration : frame / 24), ...contactTimes])].sort((a, b) => a - b);
  const frameBuffers = meshes.map(mesh => new Float64Array(mesh.geometry.getAttribute('position').count * 3));
  let firstVertices: Float64Array[] = [], start = new Map<string, Pose>(), end = new Map<string, Pose>();
  const changed = new Set<string>(), limbs = new Set<string>(), bounds = new Box3(), driftPoints = new Map<string, Vector3[]>();
  let rootMotion = 0, lengthError = 0, anchorError = 0, soleError = 0, drift = 0, lift = 0, vertexMotion = 0;
  const footBones = new Map(contact.feet.map(foot => [foot.bone, foot.anchor]));
  for (const [frame, t] of sampleTimes.entries()) {
   const u = t / animation.duration;
   mixer.setTime(t); root.updateMatrixWorld(true);
   for (const node of nodes.values()) if (!node.matrixWorld.elements.every(Number.isFinite) || Math.min(node.scale.x, node.scale.y, node.scale.z) <= 0) clipFail('finite: invalid matrix or scale');
   const poses = new Map([...skeletonBones].map(([n, b]) => [n, snapshot(b)]));
   if (frame === 0) start = poses;
   end = poses;
   rootMotion = Math.max(rootMotion, position(rootNode).distanceTo(rest.get(asset.anchors.root)!.p));
   if (poses.get(asset.anchors.root)!.q.angleTo(rest.get(asset.anchors.root)!.q) > 1e-5) clipFail('root: root bone rotates');
   for (const [name, pose] of poses) {
    const initial = start.get(name)!;
    if (weighted.has(name) && !semantic.has(name) && (pose.localQ.angleTo(initial.localQ) > .5 / DEGREES || pose.localP.distanceTo(initial.localP) > .001)) {
     changed.add(name);
     const chain = name.match(/(?:front|back)_[LR]|wing_[LR]|_(L|R)_(?:upper|lower|foot)/)?.[0];
     if (chain) limbs.add(chain.replace(/_(upper|lower|foot)$/, ''));
    }
   }
   for (const [name, pose] of initialObjects) { const node = nodes.get(name)!; if (position(node).distanceTo(pose.p) > 1e-5) clipFail(`root: actor/scene object translation ${name}`); }
   for (const [name, node] of skeletonBones) { const scale = restScales.get(name)!; lengthError = Math.max(lengthError, Math.abs(node.scale.x / scale.x - 1), Math.abs(node.scale.y / scale.y - 1), Math.abs(node.scale.z / scale.z - 1)); }
   for (const edge of edges) {
    const a = nodes.get(edge.parent), b = nodes.get(edge.child); if (!a || !b) { clipFail('bone-length: missing measurement edge'); continue; }
    lengthError = Math.max(lengthError, Math.abs(position(a).distanceTo(position(b)) / edge.lengthMeters - 1));
   }
   const frameBounds = new Box3(), feetMin = new Map<string, number>();
   for (let i = 0; i < meshes.length; i++) skinFrame(meshes[i], frameBuffers[i], footBones, feetMin, frameBounds);
   if (frame === 0) firstVertices = frameBuffers.map(buffer => buffer.slice());
   for (let i = 0; i < frameBuffers.length; i++) {
    const current = frameBuffers[i], initial = firstVertices[i];
    for (let v = 0; v < current.length; v += 3) {
     if (!Number.isFinite(current[v]) || !Number.isFinite(current[v + 1]) || !Number.isFinite(current[v + 2])) clipFail('finite: nonfinite skinned vertex');
     vertexMotion = Math.max(vertexMotion, Math.hypot(current[v] - initial[v], current[v + 1] - initial[v + 1], current[v + 2] - initial[v + 2]));
    }
   }
   bounds.union(frameBounds);
   const airborne = inWindows(u, contact.airborneWindows);
   if (declaration.contactMode !== 'carried' && declaration.contactMode !== 'airborne' && !airborne && frameBounds.min.y < -.02) clipFail('ground: skinned geometry penetrates floor');
   for (const foot of contact.feet) {
    const p = position(nodes.get(foot.anchor)!), min = feetMin.get(foot.anchor);
    lift = Math.max(lift, p.y - contact.contactPlaneY);
    if (!inWindows(u, foot.stanceWindows)) continue;
    anchorError = Math.max(anchorError, Math.abs(p.y - contact.contactPlaneY));
    if (min === undefined) clipFail(`contact: no weighted foot vertices for ${foot.anchor}`);
    else soleError = Math.max(soleError, Math.abs(min - contact.contactPlaneY));
    if (declaration.name === 'walk') for (const [i, w] of foot.stanceWindows.entries()) if (inWindows(u, [w])) {
     const key = `${foot.anchor}:${i}`, points = driftPoints.get(key) ?? [];
     points.push(new Vector3(p.x, 0, p.z + asset.strideMeters * u)); driftPoints.set(key, points);
    }
   }
  }
  for (const points of driftPoints.values()) for (const point of points) for (const other of points) drift = Math.max(drift, point.distanceTo(other));
  let loopPosition = 0, loopAngle = 0;
  for (const [name, a] of start) { const b = end.get(name)!; loopPosition = Math.max(loopPosition, a.localP.distanceTo(b.localP)); loopAngle = Math.max(loopAngle, a.localQ.angleTo(b.localQ) * DEGREES); }
  if (rootMotion > 1e-5) clipFail('root: root bone translates');
  if (lengthError > .005) clipFail(`bone-length: relative change ${lengthError.toFixed(6)} exceeds 0.005`);
  if (!changed.size || vertexMotion <= .001) clipFail('static: no actual weighted deformation');
  if (['walk', 'fly'].includes(declaration.name) && limbs.size < 2) clipFail('static: locomotion needs two changing limb/wing chains');
  if (declaration.loop && (loopPosition > .005 || loopAngle > 2)) clipFail('loop: endpoint discontinuity');
  if (anchorError > .025 || soleError > .025) clipFail(`contact: stance anchor ${anchorError.toFixed(5)} / sole ${soleError.toFixed(5)} exceeds .025m`);
  if (declaration.name === 'walk' && drift > .06) clipFail(`contact: compensated stance drift ${drift.toFixed(5)} exceeds .06m`);
  if (declaration.name === 'walk' && lift < .025) clipFail('contact: no clear .025m walking foot lift');
  if (bounds.isEmpty() || bounds.getSize(new Vector3()).length() < .05) clipFail('finite: zero/empty bounds');
  const report: ClipReport = { name: declaration.name, durationSeconds: animation.duration, samples: sampleTimes.length, sampledVertices: sampleTimes.length * vertices, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, minimumY: bounds.min.y, maximumRootMotionMeters: rootMotion, maximumBoneLengthRelativeError: lengthError, maximumStanceAnchorErrorMeters: anchorError, maximumStanceVertexErrorMeters: soleError, maximumCompensatedStanceDriftMeters: drift, maximumFootLiftMeters: lift, maximumVertexMotionMeters: vertexMotion, weightedDeformBonesChanged: [...changed], limbChainsChanged: [...limbs], loopPositionErrorMeters: loopPosition, loopAngularErrorDegrees: loopAngle, headStart: start.get(asset.anchors.head)!.p.toArray(), headEnd: end.get(asset.anchors.head)!.p.toArray(), mouthStart: start.get(asset.anchors.mouth)!.p.toArray(), mouthEnd: end.get(asset.anchors.mouth)!.p.toArray(), headStartQuaternion: start.get(asset.anchors.head)!.q.toArray(), headEndQuaternion: end.get(asset.anchors.head)!.q.toArray(), failures: clipFailures };
  reports.push(report); envelope.union(bounds); for (const message of clipFailures) fail(`${declaration.name}/${message}`);
 }
 mixer.stopAllAction(); mixer.uncacheRoot(root);
 if (!options.onlyClips) {
  const byName = new Map(reports.map(report => [report.name, report]));
  for (const [aName, bName] of [['idle', 'drink_enter'], ['drink_enter', 'drink_loop'], ['drink_loop', 'drink_exit'], ['drink_exit', 'idle']]) {
   const a = byName.get(aName), b = byName.get(bName); if (!a || !b) continue;
   for (const part of ['head', 'mouth'] as const) if (new Vector3().fromArray(a[`${part}End`]).distanceTo(new Vector3().fromArray(b[`${part}Start`])) > .02) fail(`drink-seam: ${part} ${aName} -> ${bName}`);
   if (new Quaternion().fromArray(a.headEndQuaternion).angleTo(new Quaternion().fromArray(b.headStartQuaternion)) * DEGREES > 5) fail(`drink-seam: head angle ${aName} -> ${bName}`);
  }
  const eat = byName.get('eat'); if (eat && !eat.weightedDeformBonesChanged.some(n => /head|neck|jaw|bill/.test(n))) fail('eat: no head/jaw driven deformation');
  for (const message of expressionFailures(root, gltf.animations, [...weighted].filter(name => !semantic.has(name)).map(name => skeletonBones.get(name)!))) fail(message);
 }
 return { species: asset.id, passed: !failures.length, failures, clips: reports, vertices, triangles, bones: skeletonBones.size, draws, materials: materials.size, bytes: bytes.byteLength, sha256: hash(bytes), maximumWeightError: maxWeightError, bounds: { min: envelope.min.toArray(), max: envelope.max.toArray() }, targetBudgetMet: triangles <= (LEGACY.has(asset.id) ? 40000 : 18000) && draws <= (LEGACY.has(asset.id) ? 12 : 10) && bytes.byteLength <= (LEGACY.has(asset.id) ? 4 : 2) * 1024 * 1024 };
}

export async function validateMutationFixture(root: string, fault: string): Promise<string[]> {
 const manifest = loadJson<LabManifest>(path.join(root, 'src/animation-lab/manifest.json')), asset = manifest.assets[0], file = path.join(root, 'public', asset.url);
 const gltf = await loadLabGlb(file), dir = path.join(root, 'art-source/animation-lab/generated', asset.id), contacts = loadJson<Contacts>(path.join(dir, 'contacts.json')), metrics = loadJson<AuthorMetrics>(path.join(dir, 'metrics.json'));
 const animation = gltf.animations.find(a => a.name === 'idle')!; let mesh: SkinnedMesh | undefined; gltf.scene.traverse(node => { if (!mesh && node instanceof SkinnedMesh) mesh = node; });
 if (fault === 'duration') animation.duration += .5;
 if (fault === 'root') {
  const old = animation.tracks.find(t => t.name === `${asset.anchors.root}.position`)!;
  animation.tracks = animation.tracks.filter(t => t !== old); const v = Array.from(old.values.slice(0, 3));
  animation.tracks.push(new VectorKeyframeTrack(old.name, [0, animation.duration], [...v, v[0] + .1, v[1], v[2]]));
 }
 if (fault === 'static') for (const track of animation.tracks) for (let i = track.getValueSize(); i < track.values.length; i++) track.values[i] = track.values[i % track.getValueSize()];
 if (fault === 'weights') mesh!.geometry.getAttribute('skinWeight').setX(0, -1);
 if (fault === 'joint-index') mesh!.geometry.getAttribute('skinIndex').setX(0, 65535);
 if (fault === 'anchor') gltf.scene.getObjectByName(asset.anchors.mouth)!.name = 'deliberately_missing_anchor';
 if (fault === 'loop') { const track = animation.tracks.find(t => t.name === `${asset.anchors.head}.quaternion`)!; const q = new Quaternion().fromArray(track.values, track.values.length - 4).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .4)); q.toArray(track.values, track.values.length - 4); }
 if (fault === 'contact') for (const m of [mesh!]) { const positions = m.geometry.getAttribute('position'); for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) - .3); }
 if (fault === 'bone-length') { const edge = metrics.boneLengthEdges[0], track = animation.tracks.find(t => t.name === `${edge.child}.position`)!; for (let i = 0; i < track.values.length; i++) track.values[i] *= 1.2; }
 const report = validateLoadedAsset(asset, gltf, contacts, metrics, readFileSync(file), { onlyClips: ['idle'] });
 return report.failures;
}

async function main(): Promise<void> {
 const root = process.cwd(), manifestFile = path.join(root, 'src/animation-lab/manifest.json'), manifest = loadJson<LabManifest>(manifestFile);
 const speciesArg = process.argv.indexOf('--species'), selected = speciesArg >= 0 ? new Set(process.argv[speciesArg + 1].split(',')) : undefined;
 const assets: AssetReport[] = [], failures: string[] = [];
 for (const asset of manifest.assets.filter(a => !selected || selected.has(a.id))) {
  const file = path.join(root, 'public', asset.url), dir = path.join(root, 'art-source/animation-lab/generated', asset.id);
  if (!existsSync(file)) { failures.push(`${asset.id}/missing GLB`); continue; }
  const gltf = await loadLabGlb(file), metrics = loadJson<AuthorMetrics>(path.join(dir, 'metrics.json'));
  const report = validateLoadedAsset(asset, gltf, loadJson<Contacts>(path.join(dir, 'contacts.json')), metrics, readFileSync(file));
  assets.push(report); failures.push(...report.failures.map(message => `${asset.id}/${message}`));
  writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify({ ...metrics, measured: report, verification: 'Actual exported GLTFLoader/AnimationMixer and all skinned vertices sampled at 24fps plus exact endpoints and contact-window boundaries/interiors. Expression curves compared by evaluated normalized weighted-bone poses. Not browser/FPS evidence.' }, null, 2) + '\n');
  console.log(`${report.passed ? 'PASS' : 'FAIL'} ${asset.id}: ${report.clips.length} clips, ${report.vertices} vertices, ${report.triangles} triangles, ${report.bones} bones, ${report.draws} draws, ${report.bytes} bytes`);
  if (report.failures.length) console.log(report.failures.join('\n'));
 }
 const result = { schemaVersion: 1, tool: 'Three.js GLTFLoader + AnimationMixer + actual linear blend skinning', sampleRate: 24, additionalSamples: 'Exact clip endpoints and every stance/airborne window boundary and midpoint', manifestSha256: hash(readFileSync(manifestFile)), passed: !failures.length, scope: selected ? [...selected] : 'all 25 species / 332 clips', assets, failures, limitations: ['Blender offline previews are not browser screenshots.', 'No browser/CUA or hardware FPS measurement was performed.', 'Automated checks do not establish anatomy or final art quality.'] };
 writeFileSync(path.join(root, 'art-source/animation-lab', selected ? 'validation-representatives.json' : 'validation.json'), JSON.stringify(result, null, 2) + '\n');
 if (!selected && result.passed) {
  const index = { schemaVersion: 1, assets: Object.fromEntries(assets.map(asset => [asset.species, { sha256: asset.sha256, bytes: asset.bytes, bounds: asset.bounds }])) };
  writeFileSync(path.join(root, 'public/models/animation-lab/asset-index.json'), JSON.stringify(index, null, 2) + '\n');
 }
 process.exitCode = failures.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
