import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as rodModule from '../lib/fishing-rod.ts';

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

// Execute production TSX hooks and event callbacks without a DOM renderer,
// browser, WebGL context, network, or audible audio graph.
class ElementStub {
  listeners = new Map(); captured = new Set(); style = {}; children = [];
  clientWidth = 390; clientHeight = 758; parentNode = null;
  classList = { add() {}, remove() {}, toggle() {} };
  addEventListener(type, callback, options) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ callback, options }); this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item.callback !== callback));
  }
  dispatch(type, values = {}) {
    const event = { type, pointerId: 1, pointerType: 'touch', button: 0, buttons: 1,
      clientX: 120, clientY: 250, cancelable: true, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, target: this, ...values };
    for (const { callback } of this.listeners.get(type) ?? []) callback(event);
    return event;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  setAttribute(name, value) { this[name] = value; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  focus() {}
  closest() { return null; }
}
function reactHarness() {
  const slots = [], pending = [];
  let cursor = 0;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  return {
    react: {
      useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
      useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
        return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
      useCallback(callback, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { callback, deps }; return slots[index].callback; },
      useEffect(effect, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) pending.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; }); },
    },
    render(fn) { cursor = 0; const result = fn(); for (const run of pending.splice(0)) run(); return result; },
    cleanup() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children)] : [];
}
const jsx = (type, props) => ({ type, props });
function compile(relative, requireModule, globals = {}) {
  const exports = {};
  const context = vm.createContext({ exports, console, Date, Math, Promise, Set, Map,
    queueMicrotask, AbortController, ...globals, require: requireModule });
  vm.runInContext(ts.transpileModule(source(relative), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context, { filename: relative });
  return exports;
}
const baseTime = 1_800_000_000_000;
const catchRecord = (speciesId = 'oarfish', lengthCm = 900) => ({ id: 'qa-catch', speciesId, lengthCm, weightKg: 120, caughtAt: baseTime - 4000 });
const participant = (phase = 'waiting', extra = {}) => ({ id: 'qa-angler', name: 'QA', preset: 'cat', slot: 0,
  joinedAt: baseTime - 30_000, lastSeenAt: baseTime,
  fishing: { phase, castId: 'qa-cast', castAt: baseTime - 3000, biteAt: baseTime + 10_000, expiresAt: baseTime + 13_000,
    ...(phase === 'bite' ? { biteAt: baseTime - 100, expiresAt: baseTime + 2900 } : {}),
    ...(phase === 'holding' ? { catch: catchRecord() } : {}) }, ...extra });
async function sceneHarness(t, props = {}) {
  const worldModule = await import('../lib/fishing-world.ts');
  const cameraModule = await import('../lib/fishing-camera.ts');
  const types = await import('../lib/fishing-types.ts');
  const marine = await import('../components/fishing/MarineModels.ts');
  const actions = await import('../lib/fishing-action-motion.ts').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
  });
  const ambient = await import('../lib/fishing-ambient.ts');
  const cameraInput = await import('../lib/fishing-camera-input.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
  const realAvatar = props.qaRealAvatar ? await import('../lib/fishing-avatar.ts') : null;
  const templates = new Map();
  if (realAvatar) for (const person of props.participants ?? [participant()]) { if (!templates.has(person.preset)) templates.set(person.preset, await avatarTemplate(person.preset)); }
  const runtime = reactHarness(), host = new ElementStub(), labels = new ElementStub();
  const document = new ElementStub(); document.hidden = false; document.createElement = () => new ElementStub();
  const window = new ElementStub(); window.devicePixelRatio = 1;
  const raf = new Map(), frames = [], avatarCalls = [], renderers = [], catchJobs = new Set();
  const trackCatch = job => { catchJobs.add(job); void job.then(() => catchJobs.delete(job), () => catchJobs.delete(job)); return job; };
  const settleCatches = async () => { while (catchJobs.size) await Promise.allSettled([...catchJobs]); };
  let rafId = 0, now = props.qaNow ?? baseTime;
  class Renderer {
    constructor() { renderers.push(this); this.domElement = new ElementStub(); this.shadowMap = {}; }
    setPixelRatio() {} setSize() {} dispose() { this.disposed = true; }
    render(scene, camera) { frames.push({ scene, camera: camera.clone(), position: camera.position.clone() }); }
  }
  const dependencies = {
    '@/lib/fishing-avatar-loading':{...await import('../lib/fishing-avatar-loading.ts'),preloadFishingAvatar:async()=>{}},
    '@/lib/fishing-chat': await import('../lib/fishing-chat.ts'), '@/lib/fishing-own-marker': await import('../lib/fishing-own-marker.ts'),
    react: runtime.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    three: { ...THREE, WebGLRenderer: Renderer }, '@/lib/fishing-world': worldModule,
    '@/lib/fishing-confetti': await import('../lib/fishing-confetti.ts'), '@/lib/fishing-catalog': await import('../lib/fishing-catalog.ts'),
    '@/lib/fishing-seat-motion': await import('../lib/fishing-seat-motion.ts'), '@/lib/fishing-camera': cameraModule, '@/lib/fishing-camera-input': cameraInput, '@/lib/fishing-types': types,
    '@/lib/fishing-sea-life': await import('../lib/fishing-sea-life.ts'),
    '@/lib/fishing-catch-motion': await import('../lib/fishing-catch-motion.ts'), '@/lib/fishing-rod': rodModule, '@/lib/fishing-action-motion': actions, '@/lib/fishing-ambient': ambient, './MarineModels': marine,
    '@/lib/fishing-avatar': { createFishingAvatar: (kind, id) => {
      if (realAvatar) {
        const avatar = realAvatar.createFishingAvatar(kind, id, { template: templates.get(kind) });
        return { ...avatar, get height() { return avatar.height; }, get footprintRadius() { return avatar.footprintRadius; },
          prepareCatchAsync(...args) { return trackCatch(avatar.prepareCatchAsync(...args)); },
          updateFishing(...args) { avatarCalls.push({ id, args }); avatar.updateFishing(...args); } };
      }
      const root = new THREE.Group(); root.name = `QA avatar ${id}`;
      const body = new THREE.Mesh(new THREE.BoxGeometry(.7, 1.7, .6), new THREE.MeshBasicMaterial()); body.position.y = .85; root.add(body);
      return { root, height: 1.7, footprintRadius: .5, loaded: true, ready: Promise.resolve(), rodPosition: new THREE.Vector3(0, .9, .45), rodQuaternion: new THREE.Quaternion(), catchPosition: new THREE.Vector3(0, .8, .62), positionCatchReady(target) { target.set(0,.8,.62); return true; },
        prepareCatchAsync(model) { return trackCatch(Promise.resolve(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()))); }, setCatchSurface() {}, updateFishing(...args) { avatarCalls.push({ id, args }); }, dispose() {} };
    } },
  };
  const realRef = runtime.react.useRef;
  let refCount = 0;
  runtime.react.useRef = value => { const ref = realRef(value); if (refCount++ === 0) ref.current = host; else if (refCount === 2) ref.current = labels; return ref; };
  class FakeDate extends Date { static now() { return now; } }
  const sceneExports = compile('components/fishing/YachtScene.tsx', name => {
    if (name in dependencies) return dependencies[name]; throw Error(`Unmocked scene dependency: ${name}`);
  }, { document, window, Date: FakeDate, ResizeObserver: class { observe() {} disconnect() { this.disconnected = true; } },
    requestAnimationFrame: callback => { raf.set(++rafId, callback); return rafId; }, cancelAnimationFrame: id => raf.delete(id) });
  let current = { participants: [participant()], ownId: 'qa-angler', serverOffsetMs: 0, cameraMode: 'deck', reducedMotion: true, enabled: true, ...props };
  const render = () => { refCount = 0; return runtime.render(() => sceneExports.default(current)); };
  render();
  const renderer = renderers[0];
  t.after(() => runtime.cleanup());
  let time = 0;
  const step = (count = 1) => { for (let i = 0; i < count; i++) { time += 40; for (const [id, callback] of [...raf]) { raf.delete(id); callback(time); } } return frames.at(-1); };
  step();
  if (catchJobs.size) { await settleCatches(); step(); }
  assert.ok(frames.length, 'production RAF must render successfully');
  return { host, labels, window, document, canvas: renderer.domElement, renderer, frames, raf, avatarCalls,
    step, settleCatches, render, cleanup: () => runtime.cleanup(), get latest() { return frames.at(-1); },
    update(next) { current = { ...current, ...next }; render(); }, setNow(value) { now = value; } };
}

test('upgrade QA: production canvas consumes drags locally and removes listeners/RAF on disposal', async t => {
  const scene = await sceneHarness(t);
  const canvas = scene.canvas;
  assert.equal(canvas.style.touchAction, 'none');
  const before = scene.latest.position.clone();
  canvas.dispatch('pointerdown');
  const move = canvas.dispatch('pointermove', { clientX: 180, clientY: 290 });
  scene.step();
  assert.equal(move.defaultPrevented, true, 'drag cannot become a browser/page scroll');
  assert.ok(scene.latest.position.distanceTo(before) > .1, 'drag changes the actual rendered camera');
  assert.equal(scene.document.listeners.get('pointermove')?.length ?? 0, 0);
  assert.equal(scene.window.listeners.get('pointermove')?.length ?? 0, 0);
  canvas.dispatch('pointercancel');
  const canceled = scene.latest.position.clone();
  canvas.dispatch('pointermove', { clientX: 350, clientY: 450 });
  scene.step();
  assert.ok(scene.latest.position.distanceTo(canceled) < 1e-8);
  scene.cleanup();
  assert.equal(scene.raf.size, 0);
  assert.equal([...canvas.listeners.values()].flat().length, 0);
  assert.equal(scene.renderer.disposed, true);
});

test('upgrade QA: horizontal/vertical orbit and wheel zoom remain available in every fishing phase', async t => {
  for (const cameraMode of ['overview', 'deck']) for (const phase of ['waiting', 'bite', 'holding']) {
    const scene = await sceneHarness(t, { cameraMode, participants: [participant(phase)] });
    let previous = scene.latest.position.clone();
    scene.canvas.dispatch('pointerdown');
    scene.canvas.dispatch('pointermove', { clientX: 180 }); scene.step();
    assert.ok(scene.latest.position.distanceTo(previous) > .01, `${cameraMode}/${phase} horizontal camera motion`);
    previous = scene.latest.position.clone();
    scene.canvas.dispatch('pointermove', { clientX: 180, clientY: 300 }); scene.step();
    assert.ok(scene.latest.position.distanceTo(previous) > .01, `${cameraMode}/${phase} vertical camera motion`);
    scene.canvas.dispatch('pointerup', { clientX: 180, clientY: 300 });
    previous = scene.latest.position.clone();
    const wheel = scene.canvas.dispatch('wheel', { deltaY: 120, deltaMode: 0 }); scene.step();
    assert.equal(wheel.defaultPrevented, true);
    assert.ok(scene.latest.position.distanceTo(previous) > .01, `${cameraMode}/${phase} zoom`);
    scene.cleanup();
  }
});

test('upgrade QA: pinch, remaining-finger orbit and canceled pointer cannot corrupt camera state', async t => {
  const scene = await sceneHarness(t);
  scene.canvas.dispatch('pointerdown', { pointerId: 11, clientX: 100, clientY: 200 });
  scene.canvas.dispatch('pointerdown', { pointerId: 12, clientX: 200, clientY: 200 });
  const before = scene.latest.position.clone();
  scene.canvas.dispatch('pointermove', { pointerId: 12, clientX: 260, clientY: 220 }); scene.step();
  assert.ok(scene.latest.position.distanceTo(before) > .01, 'two-finger pinch moves rendered camera');
  scene.canvas.dispatch('pointerup', { pointerId: 12, clientX: 260, clientY: 220 });
  const afterPinch = scene.latest.position.clone();
  scene.canvas.dispatch('pointermove', { pointerId: 11, clientX: 130, clientY: 230 }); scene.step();
  assert.ok(scene.latest.position.distanceTo(afterPinch) > .01, 'remaining pointer can immediately orbit');
  scene.canvas.dispatch('lostpointercapture', { pointerId: 11 });
  const released = scene.latest.position.clone();
  scene.canvas.dispatch('pointermove', { pointerId: 11, clientX: 330, clientY: 730 }); scene.step();
  assert.ok(scene.latest.position.distanceTo(released) < 1e-8);
  scene.canvas.dispatch('pointerdown', { pointerId: 21 });
  scene.canvas.dispatch('pointerdown', { pointerId: 22, clientX: 250 });
  scene.canvas.dispatch('pointercancel', { pointerId: 22 });
  scene.canvas.dispatch('pointermove', { pointerId: 21, clientX: 350 }); scene.step();
  assert.ok(scene.latest.position.distanceTo(released) < 1e-8, 'an OS gesture cancellation clears the whole gesture');
  for (const value of scene.latest.camera.matrixWorld.elements) assert.ok(Number.isFinite(value));
});

test('upgrade QA: modal/profile scrolling is preserved outside the captured canvas', () => {
  const css = source('components/fishing/FishingFeed.css');
  const shared = source('components/FeedInterface.css');
  const feed = source('components/fishing/FishingFeed.tsx');
  assert.doesNotMatch(css, /(?:html|body|\.fishing-shell|\.fishing-feed)\s*\{[^}]*touch-action:\s*none/);
  assert.match(shared, /\.feed-v020 \.sheet\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(feed, /className="sheet fishing-sheet"/);
});

function projectedExtents(object, camera) {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const point = new THREE.Vector3();
  object.updateWorldMatrix(true, true);
  object.traverseVisible(node => {
    if (!node.isMesh) return;
    const attr = node.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      point.fromBufferAttribute(attr, i).applyMatrix4(node.matrixWorld).project(camera);
      bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y);
      bounds.minZ = Math.min(bounds.minZ, point.z); bounds.maxZ = Math.max(bounds.maxZ, point.z);
    }
  });
  return bounds;
}
test('upgrade QA: canonical catch meshes from legacy maximum records remain uncropped after orbit and closest permitted zoom', async t => {
  const { MARINE_SPECIES } = await import('../lib/fishing-catalog.ts');
  for (const species of MARINE_SPECIES) {
    const person = participant('holding'); person.fishing.catch = catchRecord(species.id, species.maxCm);
    const scene = await sceneHarness(t, { participants: [person] });
    for (const orbit of [null, { clientX: 360, clientY: 390 }, { clientX: -160, clientY: 110 }]) {
      if (orbit) { scene.canvas.dispatch('pointerdown'); scene.canvas.dispatch('pointermove', orbit); scene.canvas.dispatch('pointerup', orbit); }
      for (let i = 0; i < 8; i++) scene.canvas.dispatch('wheel', { deltaY: -500, deltaMode: 0 });
      scene.step(90);
      const model = scene.latest.scene.getObjectByName(`marine-${species.id}`);
      assert.ok(model, species.id + ' real catch mesh exists');
      const bounds = projectedExtents(model, scene.latest.camera);
      assert.ok(bounds.minX >= -1 && bounds.maxX <= 1 && bounds.minY >= -1 && bounds.maxY <= 1,
        `${species.id} projected bounds remain inside viewport: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.minZ >= -1 && bounds.maxZ <= 1, species.id + ' remains inside depth frustum');
    }
    scene.cleanup();
  }
});

test('upgrade QA: action timing comes from authoritative cast/catch timestamps, including delayed snapshots', async () => {
  const { sampleFishingAction } = await import('../lib/fishing-action-motion.ts');
  const waiting = participant('waiting').fishing; waiting.castAt = baseTime;
  const start = sampleFishingAction(waiting, baseTime, false);
  const later = sampleFishingAction(waiting, baseTime + 700, false);
  const arrivedLate = sampleFishingAction(waiting, baseTime + 2200, false);
  assert.notEqual(start.stage, arrivedLate.stage);
  assert.notEqual(start.rodPitch, later.rodPitch, 'cast visibly articulates the rod');
  assert.equal(arrivedLate.stage, 'waiting', 'a late accepted snapshot does not restart an old cast');
  assert.equal(arrivedLate.settled, true);
  assert.equal(sampleFishingAction(waiting, baseTime + 2200, false).stage, 'waiting');
  const caught = participant('holding').fishing; caught.catch.caughtAt = baseTime;
  assert.notEqual(sampleFishingAction(caught, baseTime + 100, false).stage, 'holding');
  assert.equal(sampleFishingAction(caught, baseTime + 2500, false).stage, 'holding');
  const reducedCast = sampleFishingAction(waiting, baseTime + 100, true);
  const reducedCatch = sampleFishingAction(caught, baseTime + 100, true);
  assert.equal(reducedCast.stage, 'waiting'); assert.equal(reducedCatch.stage, 'holding');
  assert.equal(reducedCast.settled, true); assert.equal(reducedCatch.settled, true);
  assert.equal(sampleFishingAction({ phase: 'idle' }, baseTime, false).stage, 'idle');
  assert.equal(sampleFishingAction({ phase: 'escaped' }, baseTime, false).catchVisible, false);
});

async function avatarTemplate(kind) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const bytes = readFileSync(new URL(`../public/avatars/${kind}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
test('upgrade QA: narrow hull preserves unscaled anglers, deck-supported feet without berth markers', async t => {
  const { createYachtWorld, FISHING_SEATS, FISHING_DECK_Y } = await import('../lib/fishing-world.ts');
  const { createFishingAvatar } = await import('../lib/fishing-avatar.ts');
  const { sampleFishingAction } = await import('../lib/fishing-action-motion.ts');
  const world = createYachtWorld(); t.after(() => world.dispose());
  assert.deepEqual(world.yacht.scale.toArray(), [1, 1, 1], 'narrowing is baked into the boat geometry');
  const hull = world.scene.getObjectByName('Sculpted ivory hull');
  const size = new THREE.Box3().setFromObject(hull).getSize(new THREE.Vector3());
  assert.ok(size.x < 7, 'hull is materially narrower than the original nearly-nine-unit width');
  assert.ok(size.z > 16, 'length is retained');
  const berths = []; world.yacht.traverse(node => { if (node.name === 'Fishing berth') berths.push(node); });
  assert.equal(berths.length, 0);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (const kind of ['human-subeike', 'human-jiji', 'human-lx', 'cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'sword-shield-dog', 'monster-tower', 'monster-star']) {
    const avatar = createFishingAvatar(kind, `qa-${kind}`, { template: await avatarTemplate(kind) });
    t.after(() => avatar.dispose());
    const group = new THREE.Group(); group.add(avatar.root); world.yacht.add(group);
    const initial = avatar.root.scale.clone();
    for (const seat of FISHING_SEATS) {
      group.position.set(seat.x, FISHING_DECK_Y, seat.z); group.rotation.y = seat.heading;
      const state = participant('waiting').fishing;
      avatar.updateFishing(1, 'waiting', true, 1, sampleFishingAction(state, baseTime, true));
      world.scene.updateMatrixWorld(true);
      assert.deepEqual(avatar.root.scale.toArray(), initial.toArray());
      for (const name of kind === 'capybara' ? ['foot_L', 'foot_R', 'hand_L', 'hand_R'] : ['foot_L', 'foot_R']) {
        // Quadruped front wrists are lifted to hold a rod and are not contact feet.
        if (name.startsWith('hand')) continue;
        const foot = avatar.root.getObjectByName(name); assert.ok(foot, `${kind}/${name}`);
        const position = foot.getWorldPosition(new THREE.Vector3());
        ray.set(position.clone().addScaledVector(down, -2), down);
        assert.ok(ray.intersectObject(world.deck, false).length > 0, `${kind}/${name} on slot ${seat.x},${seat.z} is supported by deck`);
        const local = world.yacht.worldToLocal(position.clone());
        assert.ok(Math.abs(local.x) < 3.02, `${kind}/${name} stays inside the side rail`);
      }
    }
    world.yacht.remove(group);
  }
});

test('upgrade QA: animated rod is attached to the true grip and both hands remain on its shaft', async t => {
  const { createFishingAvatar } = await import('../lib/fishing-avatar.ts');
  const { sampleFishingAction } = await import('../lib/fishing-action-motion.ts');
  for (const kind of ['human-subeike', 'human-jiji', 'human-lx', 'cat', 'frog', 'dog', 'capybara', 'panda', 'banana-cat', 'sword-shield-dog', 'monster-tower', 'monster-star']) {
    const avatar = createFishingAvatar(kind, `qa-grip-${kind}`, { template: await avatarTemplate(kind) });
    t.after(() => avatar.dispose());
    const states = [participant('waiting').fishing, participant('holding').fishing];
    states[0].castAt = baseTime; states[1].catch.caughtAt = baseTime;
    for (const state of states) for (const offset of [0, 220, 240, 550, 900, 1300, 2000]) {
      const pose = sampleFishingAction(state, baseTime + offset, false);
      avatar.updateFishing(offset / 1000, state.phase, false, 1.6, pose);
      avatar.root.updateMatrixWorld(true);
      const right = avatar.root.getObjectByName('hand_R').getWorldPosition(new THREE.Vector3());
      const left = avatar.root.getObjectByName('hand_L').getWorldPosition(new THREE.Vector3());
      avatar.root.worldToLocal(right); avatar.root.worldToLocal(left);
      if (pose.rodVisible) {
        assert.ok(right.distanceTo(avatar.rodPosition) < .005, `${kind}/${pose.stage}: rod starts at actual right wrist`);
        const axis = new THREE.Vector3(.02, .9, .85).normalize().applyQuaternion(avatar.rodQuaternion);
        const handOffset = left.clone().sub(avatar.rodPosition);
        if (pose.restProgress === 1) {
          assert.ok(axis.y > .9999, `${kind}: cast starts from an upright resting rod`);
          assert.ok(handOffset.clone().cross(axis).length() > .1, `${kind}: free hand starts away from the rod`);
        }
        if (kind !== 'sword-shield-dog' && pose.restProgress === 0) assert.ok(handOffset.clone().cross(axis).length() < .02, `${kind}/${pose.stage}: second hand grips the same shaft`);
      }
      avatar.root.traverse(node => { for (const value of [...node.position, ...node.quaternion]) assert.ok(Number.isFinite(value)); });
    }
  }
});

class AudioParamStub {
  value = 0; events = [];
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  setTargetAtTime(value, time, duration) { this.value = value; this.events.push(['target', value, time, duration]); }
}
class AudioNodeStub {
  connections = []; starts = 0; stops = 0; disconnected = false;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
  start() { this.starts++; }
  stop() { this.stops++; }
}
class AudioContextStub {
  state = 'suspended'; currentTime = 0; sampleRate = 22050; resumes = 0; suspends = 0; closes = 0;
  destination = new AudioNodeStub(); nodes = []; sources = []; blocked = false; gate = null;
  constructor(order) { this.order = order; }
  node(extra = {}) { const node = Object.assign(new AudioNodeStub(), extra); this.nodes.push(node); return node; }
  createBuffer(channels, length, sampleRate) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { length, sampleRate, numberOfChannels: channels, getChannelData: channel => data[channel] }; }
  createBufferSource() { const node = this.node(); this.sources.push(node); return node; }
  createGain() { return this.node({ gain: new AudioParamStub() }); }
  createBiquadFilter() { return this.node({ frequency: new AudioParamStub(), Q: new AudioParamStub() }); }
  createOscillator() { const node = this.node({ frequency: new AudioParamStub() }); this.sources.push(node); return node; }
  async resume() { this.order.push('resume'); this.resumes++; if (this.blocked) throw Error('no transient activation'); if (this.gate) await this.gate; this.state = 'running'; this.onstatechange?.(); }
  async suspend() { this.suspends++; this.state = 'suspended'; this.onstatechange?.(); }
  async close() { this.closes++; this.state = 'closed'; }
}
async function audioHarness(t, { muted = false, feed = false, blockResume = false } = {}) {
  const { FishingOceanAudio, OCEAN_MUTE_KEY } = await import('../lib/fishing-ocean-audio.ts');
  const runtime = reactHarness(), order = [], contexts = [], players = [], storage = new Map([[OCEAN_MUTE_KEY, String(muted)]]), timers = new Map();
  let timerId = 0, enabled = true;
  const document = new ElementStub(); document.hidden = false;
  const window = new ElementStub(); window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  class InjectedAudio extends FishingOceanAudio {
    constructor(options) { super({ ...options, loadMusicBuffer:async()=>{throw Error('offline fixture');}, createContext: () => { const context = new AudioContextStub(order); context.blocked = blockResume; contexts.push(context); return context; },
      storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      schedule: callback => { timers.set(++timerId, callback); return timerId; }, cancel: id => timers.delete(id) }); players.push(this); }
  }
  const globals = { document, window, navigator: { vibrate() {} }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: () => ++timerId, clearInterval() {} };
  const hook = compile('hooks/useFishingOceanAudio.ts', name => {
    if (name === 'react') return runtime.react;
    if (name === '@/lib/fishing-ocean-audio') return { FishingOceanAudio: InjectedAudio };
    throw Error(`Unmocked audio hook dependency: ${name}`);
  }, globals);
  const room = { snapshot: { roomId: 'ocean', revision: 1, serverNow: baseTime, capacity: 10, participants: [], events: [],
    self: { id: 'qa-angler', role: 'visitor', lastSequence: 0, fishing: { phase: 'idle' }, inventory: { total: 0, species: {}, recent: [] } } },
    pending: false, connected: true, uncertain: false, offset: 0, error: '', refresh: async () => {},
    perform: async input => { order.push(input.type); return room.snapshot; } };
  let renderBody = () => hook.useFishingOceanAudio(enabled);
  if (feed) {
    const catalog = await import('../lib/fishing-catalog.ts'), types = await import('../lib/fishing-types.ts');
    const avatars = await import('../lib/fishing-avatar-catalog.ts'), roomTypes = await import('../lib/room-types.ts'), profiles = await import('../lib/fishing-profile.ts');
    const dependencies = {
    '@/lib/fishing-avatar-loading':{...await import('../lib/fishing-avatar-loading.ts'),preloadFishingAvatar:async()=>{}},
    '@/lib/fishing-chat': await import('../lib/fishing-chat.ts'), '@/lib/fishing-own-marker': await import('../lib/fishing-own-marker.ts'), react: runtime.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      '@/hooks/useFishingRoom': { useFishingRoom: () => room }, '@/hooks/useFishingOceanAudio': hook,
      '@/lib/fishing-avatar-catalog': avatars, '@/lib/fishing-catalog': catalog, '@/lib/fishing-types': types, '@/lib/room-types': roomTypes, '@/lib/fishing-profile': profiles,
      './FishingProfilePage': { default: 'Profile', getProfileMedia: () => [] } };
    const component = compile('components/fishing/FishingFeed.tsx', name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => String(key) });
      return { default: name };
    }, globals);
    renderBody = () => elements(component.default());
  }
  const render = () => runtime.render(renderBody);
  t.after(() => runtime.cleanup());
  render(); await flush();
  return { render, document, window, order, contexts, players, storage, room, timers, cleanup: () => runtime.cleanup(),
    setEnabled(value) { enabled = value; return render(); },
    async fireTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } await flush(); } };
}

test('upgrade QA: real audio hook attempts default playback and follows visibility, BFCache and profile lifecycle', async t => {
  const harness = await audioHarness(t);
  assert.equal(harness.contexts.length, 1, 'default-on attempts autoplay once at mount');
  let status = harness.render(); assert.equal(status.playing, true);
  status.requestFromGesture();
  assert.equal(harness.contexts[0].resumes, 2, 'trusted-gesture call reaches resume without an await');
  await flush(); assert.equal(harness.render().playing, true);
  harness.document.hidden = true; harness.document.dispatch('visibilitychange'); await flush();
  assert.equal(harness.render().playing, false); assert.equal(harness.contexts[0].state, 'suspended');
  harness.document.hidden = false; harness.document.dispatch('visibilitychange'); await flush();
  assert.equal(harness.render().playing, true);
  harness.window.dispatch('pagehide'); await flush(); assert.equal(harness.contexts[0].state, 'suspended');
  harness.window.dispatch('pageshow'); await flush(); assert.equal(harness.render().playing, true);
  harness.setEnabled(false); await harness.fireTimers(); assert.equal(harness.contexts[0].state, 'suspended');
  harness.setEnabled(true); await flush(); assert.equal(harness.render().playing, true);
  harness.cleanup();
  assert.equal(harness.contexts[0].closes, 1);
  assert.ok(harness.contexts[0].sources.every(node => node.stops === 1));
  assert.ok(harness.contexts[0].nodes.every(node => node.disconnected));
  assert.equal([...harness.document.listeners.values()].flat().length, 0);
  assert.equal([...harness.window.listeners.values()].flat().length, 0);
  assert.equal(harness.timers.size, 0);
});

test('upgrade QA: saved mute and rejected resume never claim playing through lifecycle changes', async t => {
  const muted = await audioHarness(t, { muted: true });
  muted.render().requestFromGesture(); muted.setEnabled(false); muted.setEnabled(true); await flush();
  assert.equal(muted.contexts.length, 0); assert.equal(muted.render().muted, true); assert.equal(muted.render().playing, false);
  muted.render().toggleFromGesture(); await flush(); assert.equal(muted.render().playing, true);
  muted.render().toggleFromGesture(); await muted.fireTimers();
  muted.document.hidden = true; muted.document.dispatch('visibilitychange'); muted.document.hidden = false; muted.document.dispatch('visibilitychange'); await flush();
  assert.equal(muted.render().playing, false); assert.equal(muted.render().muted, true);
  const rejected = await audioHarness(t, { blockResume: true });
  rejected.render().requestFromGesture(); await flush();
  assert.equal(rejected.render().needsGesture, true); assert.equal(rejected.render().playing, false);
  rejected.contexts[0].blocked = false; rejected.render().toggleFromGesture(); await flush();
  assert.equal(rejected.render().needsGesture, false); assert.equal(rejected.render().playing, true);
});

test('upgrade QA: production cast and join handlers unlock audio before starting the asynchronous command', async t => {
  const harness = await audioHarness(t, { feed: true });
  assert.equal(harness.contexts.length, 1);
  harness.order.length=0;
  const clickPrimary = () => harness.render().find(element => String(element.props.className).startsWith('fishing-primary ')).props.onClick();
  clickPrimary(); await flush();
  assert.deepEqual(harness.order, ['resume'], 'opening boarding sheet unlocks sound but does not yet join');
  harness.render().find(element => element.props.id === 'angler-name').props.onChange({ target: { value: '小浪' } });
  const form = harness.render().find(element => element.type === 'form');
  const promise = form.props.onSubmit({ preventDefault() {} });
  assert.equal(harness.order.at(-1), 'resume', 'gesture audio is unlocked before asynchronous model preparation');
  await promise;assert.deepEqual(harness.order.slice(-2), ['resume', 'join']);
  harness.room.snapshot.self.role = 'participant'; harness.room.snapshot.participants = [participant('idle')];
  clickPrimary(); assert.deepEqual(harness.order.slice(-2), ['resume', 'cast']);
  await flush();
  const sound = harness.render().find(element => String(element.props.className).includes('fishing-ocean-sound'));
  assert.match(sound.props.className, /is-playing/);
  sound.props.onClick(); await harness.fireTimers();
  clickPrimary(); await flush();
  assert.equal(harness.players[0].status.muted, true, 'cast never clears the explicit sound preference');
  assert.equal(harness.players[0].status.playing, false);
});

test('upgrade QA: real RAF ties cast/haul poses and fishing line origin to actual rig and authoritative phase', async t => {
  const person = participant('waiting'); person.fishing.castAt = baseTime;
  const scene = await sceneHarness(t, { participants: [person], qaRealAvatar: true, reducedMotion: false });
  const rodOrientations = [], lineEnds = [];
  let priorOffset = 0;
  for (const offset of [100, 280, 500, 800, 1300, 2200]) {
    scene.setNow(baseTime + offset); scene.step(Math.ceil((offset - priorOffset) / 40)); priorOffset = offset;
    const group = scene.latest.scene.getObjectByName('Angler QA'), rod = group.children[1];
    const line = scene.latest.scene.children.find(node => node.isLine);
    const actualStart = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position, 0);
    const rodTip = rod.localToWorld(rod.tip.clone());
    assert.ok(actualStart.distanceTo(rodTip) < 1e-5, `cast ${offset}: line remains attached to rod tip`);
    assert.equal(rod.visible, true); rodOrientations.push(rod.quaternion.clone());
    lineEnds.push(new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position, 2));
  }
  assert.ok(rodOrientations.some(q => q.angleTo(rodOrientations[0]) > .3), 'cast has a real rig-derived rod swing');
  assert.ok(lineEnds.some(point => point.distanceTo(lineEnds[0]) > 2), 'line endpoint actually travels out to the water');
  assert.equal(scene.avatarCalls.at(-1).args[4].stage, 'waiting', 'late cast is sampled at its current phase');
  const held = participant('holding'); held.fishing.catch = catchRecord('tuna', 100); held.fishing.catch.caughtAt = baseTime + 2300;
  scene.update({ participants: [held] }); scene.step(); await scene.settleCatches();
  const haulOrientations = []; priorOffset = 0;
  for (const offset of [100, 400, 700, 1000, 1700]) {
    scene.setNow(baseTime + 2300 + offset); scene.step(Math.ceil((offset - priorOffset) / 40)); priorOffset = offset;
    const group = scene.latest.scene.getObjectByName('Angler QA'), rod = group.children[1];
    const line = scene.latest.scene.children.find(node => node.isLine);
    const pose = scene.avatarCalls.at(-1).args[4];
    assert.ok(pose, 'full action pose reaches the actual avatar update');
    assert.equal(rod.visible, pose.rodVisible);
    assert.equal(line.visible, pose.lineVisible);
    if (rod.visible) {
      const actualStart = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position, 0);
      const rodTip = rod.localToWorld(rod.tip.clone());
      assert.ok(actualStart.distanceTo(rodTip) < 1e-5, `haul ${offset}: line stays on rod tip`);
      haulOrientations.push(rod.quaternion.clone());
    }
  }
  assert.ok(haulOrientations.some(q => q.angleTo(haulOrientations[0]) > .1), 'hauling has a real rig-derived rod sweep');
  assert.equal(scene.avatarCalls.at(-1).args[4].stage, 'holding');
});

class InspectionFishingStore {
  rooms = new Map(); visits = new Map(); writes = 0;
  key(room, actor) { return `${room}/${actor}`; }
  async ensureRoom(id, state) { if (!this.rooms.has(id)) { this.rooms.set(id, structuredClone(state)); this.writes++; } }
  async ensureVisit(room, actor, state) { const key = this.key(room, actor); if (!this.visits.has(key)) { this.visits.set(key, structuredClone(state)); this.writes++; } }
  async readState(room, actor) { return { room: structuredClone(this.rooms.get(room) ?? null), visit: structuredClone(this.visits.get(this.key(room, actor)) ?? null) }; }
  async commit(room, revision, state, actor, sequence, visit) {
    await Promise.resolve();
    if (this.rooms.get(room).revision !== revision || (visit && this.visits.get(this.key(room, actor)).lastSequence !== sequence)) return false;
    this.rooms.set(room, structuredClone(state)); if (visit) this.visits.set(this.key(room, actor), structuredClone(visit)); this.writes++; return true;
  }
}
test('upgrade QA: two ambient anglers never consume human seats or write player inventory', async () => {
  const { createFishingService } = await import('../lib/fishing-server.ts');
  const store = new InspectionFishingStore(); let now = baseTime;
  const service = createFishingService(store, { now: () => now, random: () => 0 });
  const initial = await service.snapshot('ocean', 'qa-viewer');
  assert.equal(initial.participants.length, 0); assert.equal(initial.ambientParticipants.length, 2); assert.equal(initial.capacity, 10);
  const writes = store.writes, phaseSignatures = new Set();
  for (let i = 0; i < 100; i++) {
    now += 500;
    const snapshot = await service.snapshot('ocean', 'qa-viewer');
    phaseSignatures.add(snapshot.ambientParticipants.map(p => p.fishing.phase).join('/'));
    assert.equal(snapshot.revision, initial.revision, 'ambient animation does not create room mutations');
    assert.equal(snapshot.events.length, 0); assert.equal(snapshot.self.inventory.total, 0);
    assert.ok(snapshot.ambientParticipants.every(p => p.ambient && p.slot >= 0 && p.slot < 12 && !('inventory' in p)));
  }
  assert.ok(phaseSignatures.size >= 3, 'server clock still animates a genuinely changing background');
  assert.equal(store.writes, writes, 'repeated ambient projections perform no persistent writes');
  assert.deepEqual([...store.visits.keys()], ['ocean/qa-viewer'], 'no fake device visits exist');
  const joined = await Promise.all(Array.from({ length: 11 }, (_, i) => service.command(`qa-human-${i}`, {
    roomId: 'ocean', requestId: `qa-human-join-${i}`, sequence: 1, type: 'join', name: `Human${i}`, preset: 'cat',
  })));
  assert.equal(joined.filter(result => result.self.role === 'participant').length, 10);
  assert.equal(joined.filter(result => result.self.role === 'spectator').length, 1);
  const full = await service.snapshot('ocean', 'qa-viewer');
  assert.equal(full.participants.length, 10); assert.equal(full.ambientParticipants.length, 2);
  assert.equal(new Set([...full.participants,...full.ambientParticipants].map(p=>p.slot)).size,12);
  assert.ok(full.events.every(event => !event.actorId.startsWith('ambient:')));
  const beforeForbidden = store.writes;
  for (const person of full.ambientParticipants) await assert.rejects(service.command(person.id, {
    roomId: 'ocean', requestId: `qa-forbidden-${person.slot}`, sequence: 1, type: 'join', name: 'Impostor', preset: 'cat',
  }), { code: 'FORBIDDEN' });
  assert.equal(store.writes, beforeForbidden);
  assert.ok([...store.visits.values()].every(visit => visit.inventory.total === 0));
});

test('upgrade QA: production feed keeps ambient guests separate from real online counts and commands', async t => {
  const { projectFishingAmbientParticipants } = await import('../lib/fishing-ambient.ts');
  const harness = await audioHarness(t, { feed: true, muted: true });
  harness.room.snapshot.ambientParticipants = projectFishingAmbientParticipants(baseTime);
  let tree = harness.render();
  const scene = tree.find(element => element.type === './YachtScene');
  assert.equal(scene.props.participants.length, 0); assert.equal(scene.props.ambientParticipants.length, 2);
  const status = tree.find(element => String(element.props['aria-label']).includes('最多10人'));
  assert.match(status.props['aria-label'], /在线 0 人/);
  harness.room.snapshot.participants = Array.from({ length: 10 }, (_, slot) => participant('idle', { id: `human-${slot}`, slot }));
  tree = harness.render();
  assert.match(tree.find(element => String(element.props['aria-label']).includes('最多10人')).props['aria-label'], /在线 10 人/);
  const primary = tree.find(element => String(element.props.className).startsWith('fishing-primary '));
  assert.ok(elements(primary).some(element => element.props.children === '等待空位'), 'capacity is ten real people');
  assert.equal(harness.order.length, 0, 'rendering animated guests cannot issue any player command');
});

test('upgrade QA: delayed fresh ACK stays visible, but authoritative bite preempts it and reconnect does not replay old catches', async t => {
  const idle = participant('idle'); idle.fishing = { phase: 'idle' }; const scene = await sceneHarness(t, { participants: [idle], reducedMotion: false });
  const cast = participant('waiting'); cast.fishing.castAt = baseTime; cast.fishing.biteAt = baseTime + 2400; cast.fishing.expiresAt = baseTime + 5400;
  scene.setNow(baseTime + 2200); scene.update({ participants: [cast] }); scene.step();
  assert.equal(scene.avatarCalls.at(-1).args[4].settled, false, 'fresh delayed ACK gets a readable one-shot action');
  scene.setNow(baseTime + 2400); scene.step(5);
  assert.equal(scene.avatarCalls.at(-1).args[1], 'bite');
  assert.equal(scene.avatarCalls.at(-1).args[4].stage, 'bite', 'exact authoritative bite overrides incomplete cast animation');
  scene.setNow(baseTime + 5400); scene.step(75);
  assert.equal(scene.avatarCalls.at(-1).args[1], 'escaped', 'visual timeline cannot extend the3-second deadline');
  const old = participant('holding'); old.fishing.catch = catchRecord('tuna', 100); old.fishing.catch.caughtAt = baseTime - 60000;
  scene.update({ participants: [old] }); scene.step(); await scene.settleCatches(); scene.step();
  assert.equal(scene.avatarCalls.at(-1).args[4].settled, true, 'unseen old catch after reconnect does not restart hauling');
  const cold = await sceneHarness(t, { participants: [cast], reducedMotion: false, qaNow: baseTime + 2200 });
  assert.equal(cold.avatarCalls.at(-1).args[4].stage, 'waiting', 'initial snapshot respects authoritative cast age');
});

test('upgrade QA: initial overview frames the real hull with sea gutters inside the phone viewport', async t => {
  const scene = await sceneHarness(t, { participants: [], ownId: null, cameraMode: 'overview', reducedMotion: true });
  const hull = scene.latest.scene.getObjectByName('Sculpted ivory hull');
  const bounds = projectedExtents(hull, scene.latest.camera);
  assert.ok(bounds.minX >= -.8 && bounds.maxX <= .8, `initial hull leaves at least10% sea on each side: ${JSON.stringify(bounds)}`);
  const top = (1 - bounds.maxY) * 758 / 2, bottom = (1 - bounds.minY) * 758 / 2;
  assert.ok(top > 185 && bottom < 565, `hull stays in the clear middle between header and dock: top=${top}, bottom=${bottom}`);
});


test('default-on explicit sound toggle owns pointer and keyboard retry without accidental muting',async t=>{
 for(const type of ['pointerdown','keydown']){
  const h=await audioHarness(t,{blockResume:true});assert.equal(h.render().needsGesture,true);h.contexts[0].blocked=false;
  h.document.dispatch(type,{target:{closest:selector=>selector==='.fishing-ocean-sound'?{}:null}});await flush();
  assert.equal(h.contexts[0].resumes,1,'generic gesture leaves explicit sound button to onClick');
  h.render().toggleFromGesture();await flush();assert.equal(h.render().playing,true);assert.equal(h.render().muted,false);
 }
});

function nodeText(node) { return Array.isArray(node)?node.map(nodeText).join(''):node?.props?nodeText(node.props.children):node==null||typeof node==='boolean'?'':String(node); }
function heldFeed(h,id='feed-catch',owner='qa-angler') {
 const person={...participant('holding'),id:owner};person.fishing.catch={...person.fishing.catch,id,speciesId:'tuna'};
 h.room.snapshot={...h.room.snapshot,participants:[person],self:{...h.room.snapshot.self,id:owner,role:'participant',fishing:person.fishing}};
 return h.render();
}
const feedScene=nodes=>nodes.find(node=>node.type==='./YachtScene');
const catchCard=nodes=>nodes.find(node=>node.props.className==='catch-reveal');
const primaryButton=nodes=>nodes.find(node=>node.type==='button'&&node.props.className?.includes('fishing-primary'));

test('catch card explains pending display while collection and the next cast remain available',async t=>{
 const h=await audioHarness(t,{feed:true});let nodes=heldFeed(h);assert.match(nodeText(catchCard(nodes)),/正在收线|准备展示/);assert.match(nodeText(catchCard(nodes)),/可直接收进背包/);
 assert.equal(primaryButton(nodes).props.disabled,false);assert.equal(nodeText(primaryButton(nodes)),'收进背包');
 const oldStatus=feedScene(nodes).props.onOwnCatchStatus;assert.equal(typeof oldStatus,'function');
 oldStatus('feed-catch','error');nodes=h.render();assert.match(nodeText(catchCard(nodes)),/展示准备中，可直接收进背包/);assert.equal(primaryButton(nodes).props.disabled,false);
 const actions=[];h.room.perform=async input=>{actions.push(input);if(input.type==='collect'){const idle={phase:'idle'};h.room.snapshot={...h.room.snapshot,participants:h.room.snapshot.participants.map(p=>({...p,fishing:idle})),self:{...h.room.snapshot.self,fishing:idle}};}return h.room.snapshot;};nodes=h.render();
 primaryButton(nodes).props.onClick();await flush();nodes=h.render();assert.deepEqual(actions.map(a=>a.type),['collect']);assert.equal(actions[0].catchId,'feed-catch');assert.equal(catchCard(nodes),undefined);
 oldStatus('feed-catch','ready');nodes=h.render();assert.equal(catchCard(nodes),undefined);assert.equal(primaryButton(nodes).props.disabled,false);assert.equal(nodeText(primaryButton(nodes)),'抛竿钓鱼');primaryButton(nodes).props.onClick();await flush();assert.deepEqual(actions.map(a=>a.type),['collect','cast']);
});

test('catch card restores its species description only for the current owner and catch',async t=>{
 const h=await audioHarness(t,{feed:true});let nodes=heldFeed(h,'first'),old=feedScene(nodes).props.onOwnCatchStatus;
 old('first','ready');nodes=h.render();const description=(await import('../lib/fishing-catalog.ts')).getSpecies('tuna').description;assert.ok(nodeText(catchCard(nodes)).includes(description));
 nodes=heldFeed(h,'second');assert.match(nodeText(catchCard(nodes)),/准备展示/);old('first','error');nodes=h.render();assert.match(nodeText(catchCard(nodes)),/准备展示/);
 feedScene(nodes).props.onOwnCatchStatus('second','ready');nodes=h.render();assert.ok(nodeText(catchCard(nodes)).includes(description));old('first','ready');nodes=h.render();assert.ok(nodeText(catchCard(nodes)).includes(description),'old callback cannot overwrite the new ready result');
 const previousOwner=feedScene(nodes).props.onOwnCatchStatus;nodes=heldFeed(h,'second','another-owner');assert.match(nodeText(catchCard(nodes)),/准备展示/);previousOwner('second','ready');nodes=h.render();assert.match(nodeText(catchCard(nodes)),/准备展示/,'same catch id from a previous owner remains stale');
});
