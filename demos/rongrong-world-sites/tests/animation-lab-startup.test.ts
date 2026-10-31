import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { createLabController } from '../src/animation-lab/controller.ts';
import type { LabControllerDependencies } from '../src/animation-lab/controller.ts';
import { getLabAsset } from '../src/animation-lab/manifest.ts';
import { deferred, labFixture } from './animation-lab-fixtures.ts';

// A missing startup rollback leaves these owned resources live before the caller
// has a controller handle. Only WebGL/platform boundaries are substituted.
const stages = ['controls-create', 'controls-configure', 'observer-create', 'observer-observe', 'visibility-add', 'pixel-ratio', 'size', 'camera-update', 'state', 'frame'] as const;
for (const stage of stages) {
 test(`startup failure at ${stage} releases partial ownership, preserves the error and allows retry`, async t => {
  const geometryDispose = t.mock.method(PlaneGeometry.prototype, 'dispose');
  const materialDispose = t.mock.method(MeshStandardMaterial.prototype, 'dispose');
  const original = new Error(`startup ${stage}`);
  let failing = true, rendererCount = 0, rendererDisposals = 0, controlCount = 0, controlDisposals = 0, observerCount = 0, observerDisposals = 0, stateCount = 0, sizeCount = 0;
  const listeners = new Set<() => void>(), frames = new Map<number, FrameRequestCallback>();
  const resizes: (() => void)[] = [];
  const fail = (point: typeof stage) => { if (failing && stage === point) throw original; };
  const pending = deferred<ReturnType<typeof labFixture>>();
  const dependencies: LabControllerDependencies = {
   loadAsset: () => pending.promise,
   createRenderer: () => { rendererCount++; return { setPixelRatio() { fail('pixel-ratio'); }, setSize() { sizeCount++; fail('size'); }, render() {}, dispose() { rendererDisposals++; } }; },
   createControls: () => {
    fail('controls-create'); controlCount++;
    return { target: new Vector3(), minDistance: 0, maxDistance: 0, get enableDamping() { return false; }, set enableDamping(_value: boolean) { fail('controls-configure'); }, update() { fail('camera-update'); }, dispose() { controlDisposals++; } };
   },
   createResizeObserver: callback => { fail('observer-create'); observerCount++; resizes.push(callback); return { observe() { fail('observer-observe'); }, disconnect() { observerDisposals++; } }; },
   visibility: { hidden: false, addEventListener(_type, callback) { listeners.add(callback); fail('visibility-add'); }, removeEventListener(_type, callback) { listeners.delete(callback); } },
   requestFrame: callback => { fail('frame'); frames.set(1, callback); return 1; }, cancelFrame: id => { frames.delete(id); },
  };
  const onState = () => { stateCount++; fail('state'); };
  const canvas = { clientWidth: 400, clientHeight: 400 } as HTMLCanvasElement;
  for (let attempt = 1; attempt <= 2; attempt++) {
   assert.throws(() => createLabController(canvas, onState, dependencies), error => error === original);
   assert.equal(rendererDisposals, rendererCount, 'all returned renderers are released');
   assert.equal(controlDisposals, controlCount, 'all returned controls are released');
   assert.equal(observerDisposals, observerCount, 'all returned observers are disconnected');
   assert.equal(listeners.size, 0); assert.equal(frames.size, 0);
   const floorCount = stage.startsWith('controls-') ? 0 : attempt;
   assert.equal(geometryDispose.mock.callCount(), floorCount); assert.equal(materialDispose.mock.callCount(), floorCount);
   const before = { stateCount, sizeCount };
   resizes.forEach(callback => callback());
   assert.deepEqual({ stateCount, sizeCount }, before, 'queued resize callbacks are inert after failed startup');
  }
  failing = false;
  const controller = createLabController(canvas, onState, dependencies);
  const loading = controller.selectSpecies('cow');
  const fixture = labFixture(getLabAsset('cow'));
  controller.dispose(); controller.dispose();
  const before = stateCount;
  pending.resolve(fixture); await loading;
  assert.equal(fixture.disposals, 1); assert.equal(fixture.scene.parent, null); assert.equal(stateCount, before);
  assert.equal(rendererDisposals, 3); assert.equal(controlDisposals, controlCount); assert.equal(observerDisposals, observerCount);
  assert.equal(listeners.size, 0); assert.equal(frames.size, 0);
 });
}

test('startup rollback continues after a disposer throws and does not replace the original error', () => {
 const original = new Error('initial size failed'); let rendererDisposals = 0, controlDisposals = 0;
 assert.throws(() => createLabController({ clientWidth: 400, clientHeight: 400 } as HTMLCanvasElement, () => {}, {
  createRenderer: () => ({ setSize() { throw original; }, render() {}, dispose() { rendererDisposals++; } }),
  createControls: () => ({ target: new Vector3(), minDistance: 0, maxDistance: 0, enableDamping: false, update() {}, dispose() { controlDisposals++; throw new Error('secondary cleanup failure'); } }),
  createResizeObserver: null, visibility: null, requestFrame: () => 1, cancelFrame() {},
 }), error => error === original);
 assert.equal(controlDisposals, 1); assert.equal(rendererDisposals, 1);
});
