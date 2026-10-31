import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Bone, Box3, LoopOnce, PerspectiveCamera, Scene, SkeletonHelper, Vector3 } from 'three';
import { createLabController } from '../src/animation-lab/controller.ts';
import type { LabState } from '../src/animation-lab/controller.ts';
import type { LoadedLabAsset } from '../src/animation-lab/asset-loader.ts';
import type { LabAsset } from '../src/animation-lab/types.ts';
import { getLabAsset } from '../src/animation-lab/manifest.ts';
import { createLabAssetLoader } from '../src/animation-lab/asset-loader.ts';
import { deferred, labFixture } from './animation-lab-fixtures.ts';

function harness(loadAsset = async (asset: LabAsset): Promise<LoadedLabAsset> => labFixture(asset)) {
 let tick: FrameRequestCallback | undefined; let resizeCallback: (() => void) | undefined; const canvas = { clientWidth: 400, clientHeight: 400 }; let scene!: Scene; let camera!: PerspectiveCamera; let cancelled = 0; let rendererDisposals = 0; let controlDisposals = 0; let disconnects = 0;
 const states: LabState[] = []; const visibility = new EventTarget() as EventTarget & { hidden: boolean }; visibility.hidden = false;
 const controls = { target: new Vector3(), minDistance: 0, maxDistance: 100, enableDamping: true, update() {}, dispose() { controlDisposals++; } };
 const controller = createLabController(canvas as HTMLCanvasElement, state => states.push(state), {
  loadAsset, createRenderer: () => ({ setSize() {}, setPixelRatio() {}, render(s, c) { scene = s; camera = c; }, dispose() { rendererDisposals++; } }), createControls: () => controls,
  requestFrame: fn => { tick = fn; return 1; }, cancelFrame: () => { cancelled++; }, visibility,
  createResizeObserver: callback => { resizeCallback = callback; return { observe() {}, disconnect() { disconnects++; } }; },
 });
 function frame(time: number) { assert.ok(tick); tick(time); }
 frame(0);
 return { controller, frame, states, controls, visibility, resize(width: number, height: number) { canvas.clientWidth = width; canvas.clientHeight = height; resizeCallback!(); }, get state() { return states.at(-1)!; }, get scene() { return scene; }, get camera() { return camera; }, get teardown() { return { cancelled, rendererDisposals, controlDisposals, disconnects }; } };
}

test('only newest A→B load attaches, obsolete assets release once and old asset is removed immediately', async () => {
 const a = deferred<LoadedLabAsset>(); const b = deferred<LoadedLabAsset>(); let owlLoads = 0; const cow = labFixture(getLabAsset('cow')); const owl = labFixture(getLabAsset('owl'));
 const h = harness(asset => asset.id === 'cow' ? a.promise : ++owlLoads === 1 ? b.promise : Promise.resolve(labFixture(asset)));
 const first = h.controller.selectSpecies('cow'); const second = h.controller.selectSpecies('owl'); b.resolve(owl); await second;
 assert.equal(h.state.species, 'owl'); assert.equal(h.state.status, 'ready'); assert.equal(owl.scene.parent, h.scene);
 a.resolve(cow); await first; assert.equal(cow.scene.parent, null); assert.equal(cow.disposals, 1); assert.equal(h.state.species, 'owl');
 const retry = h.controller.selectSpecies('owl'); assert.equal(owl.scene.parent, null); assert.equal(owl.disposals, 1); await retry;
 h.controller.dispose();
});

test('stale failures never replace newer ready state and repeated failed requests can retry', async () => {
 const old = deferred<LoadedLabAsset>(); let attempts = 0;
 const h = harness(asset => { if (asset.id === 'cow') return old.promise; if (++attempts < 3) return Promise.reject(new Error('temporary')); return Promise.resolve(labFixture(asset)); });
 const stale = h.controller.selectSpecies('cow'); await h.controller.selectSpecies('owl'); assert.equal(h.state.status, 'error'); await h.controller.selectSpecies('owl'); assert.equal(h.state.status, 'error'); await h.controller.selectSpecies('owl'); assert.equal(h.state.status, 'ready');
 old.reject(new Error('obsolete')); await stale; assert.equal(h.state.status, 'ready'); assert.equal(h.state.error, null); h.controller.dispose();
});

test('dispose while loading invalidates generation, releases late result and tears down exactly once', async () => {
 const pending = deferred<LoadedLabAsset>(); const fixture = labFixture(getLabAsset('cow')); const h = harness(() => pending.promise);
 const task = h.controller.selectSpecies('cow'); h.controller.dispose(); h.controller.dispose(); const count = h.states.length; pending.resolve(fixture); await task;
 assert.equal(fixture.disposals, 1); assert.equal(fixture.scene.parent, null); assert.equal(h.states.length, count);
 assert.deepEqual(h.teardown, { cancelled: 1, rendererDisposals: 1, controlDisposals: 1, disconnects: 1 });
});

test('injected assets with missing skins, clips or invalid bounds cannot become ready', async () => {
 for (const fault of ['skin', 'clip', 'bounds']) {
  const fixture = labFixture(getLabAsset('cow'));
  if (fault === 'skin') fixture.scene.clear(); if (fault === 'clip') fixture.clips.pop(); if (fault === 'bounds') fixture.bounds = new Box3();
  const h = harness(async () => fixture); await h.controller.selectSpecies('cow'); assert.equal(h.state.status, 'error', fault); assert.equal(fixture.disposals, 1); h.controller.dispose();
 }
});

test('real mixer pause freezes pose, seek is exact and clip switches preserve pause', async () => {
 const fixture = labFixture(getLabAsset('cow')); const h = harness(async () => fixture); await h.controller.selectSpecies('cow');
 h.frame(100); h.frame(120); assert.ok(h.state.time > 0); h.controller.setPaused(true); const frozen = fixture.body.position.y; const time = h.state.time; h.frame(160); h.frame(200); assert.equal(h.state.time, time); assert.equal(fixture.body.position.y, frozen);
 h.controller.seek(h.state.duration / 2); assert.ok(Math.abs(fixture.body.position.y - .2) < 1e-7); assert.equal(h.state.time, h.state.duration / 2);
 h.controller.selectClip('walk'); assert.equal(h.state.paused, true); assert.equal(h.state.time, 0); assert.equal(fixture.body.position.y, 0); h.frame(240); assert.equal(h.state.time, 0); h.controller.dispose();
});

test('one-shot clamps and restart samples t=0 without stopping paused state', async () => {
 const fixture = labFixture(getLabAsset('cow')); const h = harness(async () => fixture); await h.controller.selectSpecies('cow'); h.controller.selectClip('react');
 h.controller.seek(h.state.duration - .01); h.frame(100); h.frame(150); h.frame(200); assert.equal(h.state.time, h.state.duration); assert.ok(Math.abs(fixture.body.position.y - .4) < 1e-7);
 h.controller.setPaused(true); h.controller.seek(0); assert.equal(fixture.body.position.y, 0); assert.equal(h.state.time, 0); assert.equal(h.state.paused, true);
 h.controller.setPaused(false); h.frame(250); h.frame(270); assert.ok(h.state.time > 0); h.controller.dispose();
});

test('loop repeats, speed applies, per-frame delta clamps and hidden/resume drops wall time', async () => {
 const h = harness(); await h.controller.selectSpecies('cow'); h.controller.setSpeed(1.5); h.frame(0); h.frame(1000); assert.ok(Math.abs(h.state.time - .075) < 1e-8);
 h.controller.seek(h.state.duration - .01); h.frame(1050); assert.ok(h.state.time < .1);
 h.visibility.hidden = true; h.visibility.dispatchEvent(new Event('visibilitychange')); const time = h.state.time; h.frame(3000); assert.equal(h.state.time, time);
 h.visibility.hidden = false; h.visibility.dispatchEvent(new Event('visibilitychange')); h.frame(5000); assert.equal(h.state.time, time); h.frame(5020); assert.ok(Math.abs(h.state.time - time - .03) < 1e-8);
 assert.throws(() => h.controller.setSpeed(NaN)); assert.throws(() => h.controller.seek(Infinity)); h.controller.dispose();
});

test('skeleton visibility uses a real helper and reset fits the full envelope idempotently', async () => {
 const fixture = labFixture(getLabAsset('owl')); const h = harness(async () => fixture); await h.controller.selectSpecies('owl'); h.frame(10);
 const helper = h.scene.children.find(object => object instanceof SkeletonHelper); assert.ok(helper instanceof SkeletonHelper); assert.equal(helper.visible, false); h.controller.setSkeletonVisible(true); assert.equal(helper.visible, true);
 const projection = fixture.bounds.clone(); const positions: Vector3[] = []; for (const x of [projection.min.x, projection.max.x]) for (const y of [projection.min.y, projection.max.y]) for (const z of [projection.min.z, projection.max.z]) positions.push(new Vector3(x, y, z));
 h.camera.updateMatrixWorld(true); for (const point of positions) { const ndc = point.clone().project(h.camera); assert.ok(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && Math.abs(ndc.z) < 1); }
 const expected = h.camera.position.clone(); h.camera.position.set(90, 90, 90); h.controls.target.set(50, 0, 0); h.controller.resetCamera(); assert.ok(h.camera.position.distanceTo(expected) < 1e-8); h.controller.resetCamera(); assert.ok(h.camera.position.distanceTo(expected) < 1e-8);
 const before = h.camera.position.clone(); h.frame(100); assert.deepEqual(h.camera.position.toArray(), before.toArray()); h.controller.dispose();
});

test('resuming from manual pause drops elapsed wall time even when no paused frames ran', async () => {
 const h = harness(); await h.controller.selectSpecies('cow'); h.frame(100); h.frame(120); const time = h.state.time;
 h.controller.setPaused(true); h.controller.setPaused(false); h.frame(10000); assert.equal(h.state.time, time);
 h.frame(10020); assert.ok(Math.abs(h.state.time - time - .02) < 1e-8); h.controller.dispose();
});

test('ordinary playback crossfades but scrub stops the outgoing action and samples exact pose', async () => {
 const fixture = labFixture(getLabAsset('cow'));
 const walk = fixture.clips.find(clip => clip.name === 'walk')!.tracks[0];
 for (let i = 1; i < walk.values.length; i += 3) walk.values[i] = 1;
 const h = harness(async () => fixture); await h.controller.selectSpecies('cow'); h.frame(0); h.controller.selectClip('walk');
 assert.ok(fixture.body.position.y < .01); h.frame(50); assert.ok(fixture.body.position.y > 0 && fixture.body.position.y < 1);
 h.controller.seek(h.state.duration / 2); assert.equal(fixture.body.position.y, 1); h.frame(100); assert.equal(fixture.body.position.y, 1);
 h.controller.dispose(); assert.equal(fixture.body.position.y, 0); assert.equal(fixture.disposals, 1); h.controller.dispose(); assert.equal(fixture.disposals, 1);
});


test('resize refits the full envelope in portrait and clipping planes allow the controls zoom range', async () => {
 const fixture = labFixture(getLabAsset('owl')); const h = harness(async () => fixture); await h.controller.selectSpecies('owl'); h.resize(190, 700); h.frame(1);
 assert.equal(h.camera.aspect, 190 / 700); assert.ok(h.camera.near < h.controls.minDistance);
 const radius = fixture.bounds.getSize(new Vector3()).length() / 2;
 assert.ok(h.camera.far > h.controls.maxDistance + radius);
 for (const x of [fixture.bounds.min.x, fixture.bounds.max.x]) for (const y of [fixture.bounds.min.y, fixture.bounds.max.y]) for (const z of [fixture.bounds.min.z, fixture.bounds.max.z]) {
  const projected = new Vector3(x, y, z).project(h.camera); assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1);
 }
 h.controller.dispose();
});


function bonePose(scene: import('three').Group) {
 const pose = new Map<string, { position: Vector3; quaternion: import('three').Quaternion }>();
 scene.traverse(object => { if (object instanceof Bone) pose.set(object.name, { position: object.position.clone(), quaternion: object.quaternion.clone() }); });
 return pose;
}
function assertBonePose(scene: import('three').Group, expected: ReturnType<typeof bonePose>) {
 scene.traverse(object => {
  if (!(object instanceof Bone)) return;
  const pose = expected.get(object.name); assert.ok(pose, object.name);
  assert.ok(object.position.distanceTo(pose.position) < 1e-6, `${object.name} position`);
  assert.ok(object.quaternion.clone().normalize().angleTo(pose.quaternion.clone().normalize()) < 1e-5, `${object.name} rotation`);
 });
}
async function exportedLoader() {
 const { loadLabGlb } = await import('../scripts/validate-animation-lab.ts');
 const index: unknown = JSON.parse(readFileSync('public/models/animation-lab/asset-index.json', 'utf8'));
 return createLabAssetLoader({ fetchIndex: async () => index, loadGLTF: url => loadLabGlb('public' + url.split('?')[0]) });
}

test('real owl land reports loaded duration and end seek matches true endpoint and natural completion', async () => {
 const load = await exportedLoader(); const asset = getLabAsset('owl'); const loaded = await load(asset); const reference = await load(asset);
 const clip = loaded.clips.find(candidate => candidate.name === 'land')!; assert.ok(clip.duration > asset.clips.find(candidate => candidate.name === 'land')!.durationSeconds);
 const referenceMixer = new AnimationMixer(reference.scene); const ending = referenceMixer.clipAction(reference.clips.find(candidate => candidate.name === 'land')!).setLoop(LoopOnce, 1); ending.clampWhenFinished = true; ending.play(); referenceMixer.update(clip.duration);
 const expected = bonePose(reference.scene); const h = harness(async () => loaded); await h.controller.selectSpecies('owl'); h.controller.setPaused(true); h.controller.selectClip('land');
 assert.equal(h.state.duration, clip.duration); h.controller.seek(h.state.duration); assert.equal(h.state.time, clip.duration); assertBonePose(loaded.scene, expected);
 h.controller.seek(0); h.controller.setPaused(false); h.frame(0); for (let time = 50; time <= 1400; time += 50) h.frame(time);
 assert.equal(h.state.time, clip.duration); assertBonePose(loaded.scene, expected);
 h.controller.dispose(); referenceMixer.stopAllAction(); referenceMixer.uncacheRoot(reference.scene); reference.dispose();
});

test('real tit walk uses the shorter loaded timeline for endpoint seek and loop wrap', async () => {
 const load = await exportedLoader(); const asset = getLabAsset('tit'); const loaded = await load(asset); const reference = await load(asset);
 const clip = loaded.clips.find(candidate => candidate.name === 'walk')!; assert.ok(clip.duration < asset.clips.find(candidate => candidate.name === 'walk')!.durationSeconds);
 const referenceMixer = new AnimationMixer(reference.scene); const ending = referenceMixer.clipAction(reference.clips.find(candidate => candidate.name === 'walk')!).setLoop(LoopOnce, 1); ending.clampWhenFinished = true; ending.play(); referenceMixer.update(clip.duration);
 const h = harness(async () => loaded); await h.controller.selectSpecies('tit'); h.controller.setPaused(true); h.controller.selectClip('walk');
 assert.equal(h.state.duration, clip.duration); h.controller.seek(h.state.duration); assert.equal(h.state.time, clip.duration); assertBonePose(loaded.scene, bonePose(reference.scene));
 h.controller.seek(h.state.duration - .01); h.controller.setPaused(false); h.frame(0); h.frame(20); assert.ok(Math.abs(h.state.time - .01) < 1e-7); assert.ok(h.state.time < h.state.duration);
 h.controller.dispose(); referenceMixer.stopAllAction(); referenceMixer.uncacheRoot(reference.scene); reference.dispose();
});

for (const destination of ['rest', 'idle'] as const) {
 test(`interrupted real-mixer idle→walk→${destination} fade is continuous and removes every outgoing contributor`, async context => {
  const observed = context.mock.method(AnimationMixer.prototype, 'clipAction');
  const fixture = labFixture(getLabAsset('cow'));
  for (const [name, height] of [['idle', 0], ['walk', 1], ['rest', 2]] as const) {
   const track = fixture.clips.find(clip => clip.name === name)!.tracks[0]; for (let i = 1; i < track.values.length; i += 3) track.values[i] = height;
  }
  const h = harness(async () => fixture); await h.controller.selectSpecies('cow'); h.frame(0); h.controller.selectClip('walk'); h.frame(50);
  const before = fixture.body.position.y; assert.ok(Math.abs(before - 1 / 3) < 1e-6);
  h.controller.selectClip(destination); assert.ok(Math.abs(fixture.body.position.y - before) < 1e-6, 'selection must preserve the current blended pose');
  h.frame(100); assert.ok(Math.abs(fixture.body.position.y - (before * 2 / 3 + (destination === 'rest' ? 2 : 0) / 3)) < 1e-6, `blend was ${fixture.body.position.y}, before ${before}`);
  h.frame(150); h.frame(200); h.frame(250); assert.ok(Math.abs(fixture.body.position.y - (destination === 'rest' ? 2 : 0)) < 1e-6);
  const actions = [...new Set(observed.mock.calls.map(call => { assert.ok(call.result); return call.result; }))];
  assert.deepEqual(actions.filter(action => action.isScheduled()).map(action => action.getClip().name), [destination]);
  for (const action of actions) if (!fixture.clips.includes(action.getClip())) assert.equal(action.getMixer().existingAction(action.getClip()), null, 'temporary transition action must be uncached');
  h.controller.setPaused(true); h.controller.seek(0); assert.equal(fixture.body.position.y, destination === 'rest' ? 2 : 0); h.controller.dispose();
 });
}

test('returning to a moving earlier clip preserves the interrupted pose before restarting its own timeline', async () => {
 const fixture = labFixture(getLabAsset('cow')); const walk = fixture.clips.find(clip => clip.name === 'walk')!.tracks[0]; for (let i = 1; i < walk.values.length; i += 3) walk.values[i] = 1;
 const h = harness(async () => fixture); await h.controller.selectSpecies('cow'); h.controller.seek(h.state.duration * .3); h.frame(0); h.controller.selectClip('walk'); h.frame(50);
 const before = fixture.body.position.y; h.controller.selectClip('idle'); assert.ok(Math.abs(fixture.body.position.y - before) < 1e-6); assert.equal(h.state.time, 0);
 h.frame(100); h.frame(150); h.frame(200); h.frame(250); assert.ok(Math.abs(fixture.body.position.y - .4 * h.state.time / h.state.duration) < 1e-6);
 h.controller.dispose();
});

test('paused seek/restart and selection discard an interrupted transition exactly', async context => {
 const observed = context.mock.method(AnimationMixer.prototype, 'clipAction');
 const fixture = labFixture(getLabAsset('cow')); const h = harness(async () => fixture); await h.controller.selectSpecies('cow'); h.frame(0); h.controller.selectClip('walk'); h.frame(50); h.controller.selectClip('rest');
 const pose = bonePose(fixture.scene); h.controller.setPaused(true); h.frame(100); assertBonePose(fixture.scene, pose);
 h.controller.seek(h.state.duration / 2); assert.ok(Math.abs(fixture.body.position.y - .2) < 1e-7); assert.equal(h.state.paused, true);
 const actions = [...new Set(observed.mock.calls.map(call => { assert.ok(call.result); return call.result; }))];
 assert.deepEqual(actions.filter(action => action.isScheduled()).map(action => action.getClip().name), ['rest']);
 for (const action of actions) if (!fixture.clips.includes(action.getClip())) assert.equal(action.getMixer().existingAction(action.getClip()), null);
 h.controller.seek(0); assert.equal(fixture.body.position.y, 0); h.controller.selectClip('react'); assert.equal(fixture.body.position.y, 0); assert.equal(h.state.paused, true); h.frame(150); assert.equal(h.state.time, 0);
 h.controller.dispose();
});
