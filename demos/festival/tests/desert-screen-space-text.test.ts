import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

async function api() {
 const result = await import('../src/desert/screen-space-text.ts').catch(() => null);
 assert.ok(result, 'screen-space label sizing exists'); return result;
}

/** Project the real Sprite shader's four corners into a logical CSS viewport. */
function projectedBounds(sprite: THREE.Sprite, camera: THREE.Camera, viewport: THREE.Vector4) {
 const center = new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
 const scale = new THREE.Vector3().setFromMatrixScale(sprite.matrixWorld);
 if (camera instanceof THREE.PerspectiveCamera && !sprite.material.sizeAttenuation) scale.multiplyScalar(-center.z);
 const points = [-.5, .5].flatMap(x => [-.5, .5].map(y => new THREE.Vector3(
  center.x + (x - sprite.center.x + .5) * scale.x,
  center.y + (y - sprite.center.y + .5) * scale.y,
  center.z,
 ).applyMatrix4(camera.projectionMatrix)));
 const xs = points.map(p => (p.x + 1) * viewport.z / 2), ys = points.map(p => (1 - p.y) * viewport.w / 2);
 return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), top: Math.min(...ys), bottom: Math.max(...ys) };
}
function prepare(sprite: THREE.Sprite, camera: THREE.Camera, viewport: THREE.Vector4) {
 camera.updateMatrixWorld(); sprite.updateMatrixWorld();
 sprite.onBeforeRender({ getViewport: (target: THREE.Vector4) => target.copy(viewport) } as THREE.WebGLRenderer, new THREE.Scene(), camera, sprite.geometry, sprite.material, null as never);
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`);

test('nickname and speech sizes stay exact CSS pixels across distance, orbit, FOV, zoom, resize and photo camera', async () => {
 const { configureScreenSpaceText } = await api();
 for (const [width, height] of [[58, 20], [197.6, 51.2], [41.6, 44.8]]) {
  const sprite = new THREE.Sprite(); configureScreenSpaceText(sprite, width, height);
  sprite.position.set(12, 5, -8);
  for (const [viewportWidth, viewportHeight] of [[390, 758], [320, 640], [1024, 600], [390, 390]]) {
   for (const distance of [24, 30, 102, 260, 290]) for (const fov of [35, 55, 80]) for (const zoom of [.75, 1, 2]) {
    const camera = new THREE.PerspectiveCamera(fov, viewportWidth / viewportHeight, .25, 1600);
    camera.zoom = zoom; camera.updateProjectionMatrix(); camera.position.set(distance * .5, distance * .7, distance); camera.lookAt(12, 5, -8);
    const viewport = new THREE.Vector4(0, 0, viewportWidth, viewportHeight); prepare(sprite, camera, viewport);
    const bounds = projectedBounds(sprite, camera, viewport); near(bounds.width, width); near(bounds.height, height);
   }
  }
  assert.equal(sprite.frustumCulled, false, 'a stale tiny world bound cannot discard readable text');
 }
});

test('stacked speech keeps its exact pixel gap above nickname while preserving shared world anchor', async () => {
 const { configureScreenSpaceText } = await api();
 const name = new THREE.Sprite(), speech = new THREE.Sprite();
 configureScreenSpaceText(name, 63, 20); configureScreenSpaceText(speech, 120, 60, 23);
 name.position.set(-20, 5, 33); speech.position.copy(name.position);
 const viewport = new THREE.Vector4(0, 0, 402, 700);
 for (const pitch of [.2, .39, 1.05, 1.18]) for (const distance of [24, 102, 290]) {
  const camera = new THREE.PerspectiveCamera(55, 402 / 700, .25, 1600);
  camera.position.copy(name.position).add(new THREE.Vector3(distance * .5, Math.sin(pitch) * distance, Math.cos(pitch) * distance)); camera.lookAt(name.position);
  prepare(name, camera, viewport); prepare(speech, camera, viewport);
  near(projectedBounds(name, camera, viewport).top - projectedBounds(speech, camera, viewport).bottom, 3);
 }
});

test('new text dimensions take effect without accumulating scale, and zero viewport stays finite', async () => {
 const { configureScreenSpaceText } = await api();
 const sprite = new THREE.Sprite(), camera = new THREE.PerspectiveCamera(55, 1, .25, 1600); camera.position.z = 25;
 const viewport = new THREE.Vector4(0, 0, 390, 390);
 configureScreenSpaceText(sprite, 40, 20); prepare(sprite, camera, viewport);
 configureScreenSpaceText(sprite, 88, 36); prepare(sprite, camera, viewport); prepare(sprite, camera, viewport);
 near(projectedBounds(sprite, camera, viewport).width, 88); near(projectedBounds(sprite, camera, viewport).height, 36);
 prepare(sprite, camera, new THREE.Vector4()); assert.ok(sprite.scale.toArray().every(Number.isFinite));
});

test('ceremony capture re-sizes real text for its square viewport and restores live text sizing before repaint', async () => {
 const { configureScreenSpaceText } = await api();
 const { captureFestivalCeremonyPhoto } = await import('../src/desert/ceremony-capture.ts');
 const name = new THREE.Sprite(), speech = new THREE.Sprite(), scene = new THREE.Scene();
 configureScreenSpaceText(name, 58, 20); configureScreenSpaceText(speech, 170, 32, 23);
 name.position.set(0, 5, 0); speech.position.copy(name.position); scene.add(name, speech);
 const live = new THREE.PerspectiveCamera(55, 390 / 758, .25, 1600); live.position.set(12, 20, 32); live.lookAt(name.position);
 const viewport = new THREE.Vector4(0, 0, 390, 758), renders: { width: number; height: number; name: number; speech: number }[] = [];
 const renderer = {
  domElement: { width: 780, height: 1516 } as HTMLCanvasElement, getPixelRatio: () => 2,
  getViewport(target: THREE.Vector4) { return target.copy(viewport); },
  setViewport(x: THREE.Vector4 | number, y?: number, width?: number, height?: number) { if (x instanceof THREE.Vector4) viewport.copy(x); else viewport.set(x, y!, width!, height!); },
  render(_scene: THREE.Scene, camera: THREE.Camera) {
   for (const sprite of [name, speech]) prepare(sprite, camera, viewport);
   const nameBounds = projectedBounds(name, camera, viewport), speechBounds = projectedBounds(speech, camera, viewport);
   near(nameBounds.width, 58); near(nameBounds.height, 20); near(speechBounds.width, 170); near(speechBounds.height, 32);
   near(nameBounds.top - speechBounds.bottom, 3);
   renders.push({ width: viewport.z, height: viewport.w, name: nameBounds.width, speech: speechBounds.width });
  },
 };
 const original = globalThis.document;
 Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,REALFRAME' }) } });
 try {
  assert.ok(captureFestivalCeremonyPhoto(renderer, scene, live, 1, 1000));
  assert.equal(renders.length, 2); assert.equal(renders[0].height, 390); assert.equal(renders[1].height, 758);
  assert.deepEqual(viewport.toArray(), [0, 0, 390, 758]);
 } finally { Object.assign(globalThis, { document: original }); }
});
