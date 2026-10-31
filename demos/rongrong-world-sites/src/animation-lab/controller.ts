import { AnimationClip, AnimationMixer, Bone, Color, DirectionalLight, HemisphereLight, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PropertyBinding, QuaternionKeyframeTrack, Scene, SkeletonHelper, Vector3, VectorKeyframeTrack, WebGLRenderer } from 'three';
import type { AnimationAction, Box3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadLabAsset, validateLoadedLabAsset } from './asset-loader.ts';
import type { LoadedLabAsset } from './asset-loader.ts';
import { getLabAsset, getLabClip } from './manifest.ts';
import type { LabAsset, LabClipName, LabSpecies } from './types.ts';

export interface LabState {
 species: LabSpecies | null;
 clip: LabClipName | null;
 status: 'loading' | 'ready' | 'error';
 error: string | null;
 paused: boolean;
 time: number;
 duration: number;
}
export interface LabController {
 selectSpecies(id: LabSpecies): Promise<void>;
 selectClip(name: LabClipName): void;
 setPaused(paused: boolean): void;
 seek(seconds: number): void;
 setSpeed(speed: number): void;
 setSkeletonVisible(visible: boolean): void;
 resetCamera(): void;
 dispose(): void;
}
export interface LabRenderer {
 setSize(width: number, height: number, updateStyle?: boolean): void;
 setPixelRatio?(ratio: number): void;
 render(scene: Scene, camera: PerspectiveCamera): void;
 dispose(): void;
}
export interface LabOrbitControls {
 target: Vector3;
 minDistance: number;
 maxDistance: number;
 enableDamping: boolean;
 update(): unknown;
 dispose(): void;
}
interface VisibilitySource {
 readonly hidden: boolean;
 addEventListener(type: 'visibilitychange', callback: () => void): void;
 removeEventListener(type: 'visibilitychange', callback: () => void): void;
}
export interface LabControllerDependencies {
 loadAsset?(asset: LabAsset): Promise<LoadedLabAsset>;
 createRenderer?(canvas: HTMLCanvasElement): LabRenderer;
 createControls?(camera: PerspectiveCamera, canvas: HTMLCanvasElement): LabOrbitControls;
 requestFrame?(callback: FrameRequestCallback): number;
 cancelFrame?(id: number): void;
 visibility?: VisibilitySource | null;
 createResizeObserver?: ((callback: () => void) => { observe(canvas: HTMLCanvasElement): void; disconnect(): void }) | null;
}

/** This controller owns its renderer, stage and exactly one attached loaded animal. */
export function createLabController(canvas: HTMLCanvasElement, onState: (state: LabState) => void, dependencies: LabControllerDependencies = {}): LabController {
 const cleanups: (() => void)[] = [];
 let disposed = false;
 function dispose() {
  if (disposed) return;
  disposed = true;
  const errors: unknown[] = [];
  // Drain ownership even if one disposer fails; repeated cleanup is a no-op.
  for (const cleanup of cleanups.splice(0).reverse()) {
   try { cleanup(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw errors[0];
 }
 try { return initialize(); } catch (error) {
  // The caller has no handle yet. Roll back partial startup, but retain its
  // original error for the existing error UI and explicit Retry action.
  try { dispose(); } catch { /* A secondary cleanup error must not mask startup. */ }
  throw error;
 }
 function initialize(): LabController {
 const renderer = dependencies.createRenderer?.(canvas) ?? new WebGLRenderer({ canvas, antialias: true, alpha: false });
 cleanups.push(() => renderer.dispose());
 const scene = new Scene(); cleanups.push(() => scene.clear()); scene.background = new Color('#e8e9e3');
 const camera = new PerspectiveCamera(42, 1, .01, 100);
 const controls = dependencies.createControls?.(camera, canvas) ?? new OrbitControls(camera, canvas);
 cleanups.push(() => controls.dispose());
 controls.enableDamping = false; // Stable, exact reset; orbit/zoom still work while paused.
 const floorGeometry = new PlaneGeometry(1, 1); cleanups.push(() => floorGeometry.dispose());
 const floorMaterial = new MeshStandardMaterial({ color: '#d0d3c7', roughness: 1 }); cleanups.push(() => floorMaterial.dispose());
 const floor = new Mesh(floorGeometry, floorMaterial);
 floor.rotation.x = -Math.PI / 2; floor.position.y = -.005; floor.scale.setScalar(12);
 const key = new DirectionalLight(0xffffff, 2.5); key.position.set(3, 6, 4);
 scene.add(floor, new HemisphereLight(0xffffff, 0x78856d, 2), key);
 const requestFrame = dependencies.requestFrame ?? (callback => requestAnimationFrame(callback));
 const cancelFrame = dependencies.cancelFrame ?? (id => cancelAnimationFrame(id));
 const visibility = dependencies.visibility === undefined ? (typeof document === 'undefined' ? null : document) : dependencies.visibility;
 const makeObserver = dependencies.createResizeObserver === undefined ? (typeof ResizeObserver === 'undefined' ? null : (callback: () => void) => new ResizeObserver(callback)) : dependencies.createResizeObserver;
 const loader = dependencies.loadAsset ?? loadLabAsset;
 let state: LabState = { species: null, clip: null, status: 'loading', error: null, paused: false, time: 0, duration: 0 };
 let generation = 0, speed = 1, skeletonVisible = false;
 let loaded: LoadedLabAsset | null = null, asset: LabAsset | null = null, mixer: AnimationMixer | null = null, action: AnimationAction | null = null, helper: SkeletonHelper | null = null, bounds: Box3 | null = null;
 let frameId: number | null = null, previousTime: number | null = null;
 cleanups.push(() => { generation++; release(); });
 cleanups.push(() => { if (frameId !== null) cancelFrame(frameId); });
 let fade: { previous: AnimationAction; elapsed: number; poseClip?: AnimationClip } | null = null;
 const emit = (patch: Partial<LabState> = {}) => { if (disposed) return; state = { ...state, ...patch }; onState({ ...state }); };

 function clearFade() {
  if (!fade) return;
  fade.previous.stop();
  if (fade.poseClip) mixer?.uncacheClip(fade.poseClip);
  fade = null;
 }
 function release() {
  if (mixer && loaded) { mixer.stopAllAction(); clearFade(); mixer.uncacheRoot(loaded.scene); }
  if (helper) { helper.removeFromParent(); helper.dispose(); }
  if (loaded) { loaded.scene.removeFromParent(); loaded.dispose(); }
  loaded = null; mixer = null; action = null; helper = null; bounds = null; asset = null; fade = null;
 }
 function resetCamera() {
  if (disposed) return;
  const center = bounds?.getCenter(new Vector3()) ?? new Vector3(0, .75, 0);
  const radius = bounds ? Math.max(bounds.getSize(new Vector3()).length() / 2, .1) : 1;
  const halfVertical = camera.fov * Math.PI / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
  const distance = radius / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.15;
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(new Vector3(1, .65, 1.3).normalize(), distance);
  camera.near = Math.max(.001, radius / 100); camera.far = distance * 5 + radius;
  camera.zoom = 1; camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  controls.minDistance = radius * .3; controls.maxDistance = distance * 4; controls.update();
 }
 function resize() {
  if (disposed) return;
  const width = Math.max(1, canvas.clientWidth || canvas.width || 1), height = Math.max(1, canvas.clientHeight || canvas.height || 1);
  renderer.setPixelRatio?.(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2));
  renderer.setSize(width, height, false); camera.aspect = width / height; resetCamera();
 }
 const observer = makeObserver?.(resize) ?? null;
 if (observer) cleanups.push(() => observer.disconnect());
 observer?.observe(canvas);
 const visibilityChanged = () => { previousTime = null; };
 if (visibility) cleanups.push(() => visibility.removeEventListener('visibilitychange', visibilityChanged));
 visibility?.addEventListener('visibilitychange', visibilityChanged);

 /** Capture before stopping actions so an interrupted aggregate never snaps.
  * Reuse the clips' exact binding paths: aliases would create separate property
  * mixers that overwrite, rather than blend, the same bone transform.
  */
 function captureTransitionPose(): AnimationClip {
  const tracks: (VectorKeyframeTrack | QuaternionKeyframeTrack)[] = [];
  const paths = new Set(loaded!.clips.flatMap(clip => clip.tracks.map(track => track.name)));
  for (const path of paths) {
   const parsed = PropertyBinding.parseTrackName(path);
   const bone = PropertyBinding.findNode(loaded!.scene, parsed.nodeName);
   if (!(bone instanceof Bone)) continue; // Already checked by the loader boundary.
   if (parsed.propertyName === 'quaternion') {
    const value = bone.quaternion.toArray(); tracks.push(new QuaternionKeyframeTrack(path, [0, .15], [...value, ...value]));
   } else {
    const value = (parsed.propertyName === 'scale' ? bone.scale : bone.position).toArray();
    tracks.push(new VectorKeyframeTrack(path, [0, .15], [...value, ...value]));
   }
  }
  return new AnimationClip('lab-transition-pose', .15, tracks);
 }
 function startClip(name: LabClipName, crossfade: boolean) {
  if (!asset || !loaded || !mixer) return;
  const declaration = getLabClip(asset, name), clip = loaded.clips.find(candidate => candidate.name === name)!;
  const previous = action;
  const poseClip = crossfade && previous && fade ? captureTransitionPose() : undefined;
  if (!crossfade || !previous || poseClip) { mixer.stopAllAction(); clearFade(); }
  action = mixer.clipAction(clip).reset();
  action.setLoop(declaration.loop ? LoopRepeat : LoopOnce, declaration.loop ? Infinity : 1);
  action.clampWhenFinished = !declaration.loop; action.enabled = true; action.setEffectiveTimeScale(1); action.setEffectiveWeight(1); action.play();
  if (crossfade && previous && previous !== action) {
   const outgoing = poseClip ? mixer.clipAction(poseClip).reset().setLoop(LoopOnce, 1) : previous;
   if (poseClip) { outgoing.clampWhenFinished = true; outgoing.play(); }
   outgoing.crossFadeTo(action, .15, false); fade = { previous: outgoing, elapsed: 0, poseClip };
  }
  // A zero-delta mixer evaluation samples the actual skeleton even while paused.
  mixer.update(0); loaded.scene.updateMatrixWorld(true);
  emit({ clip: name, time: 0, duration: clip.duration });
 }
 function seek(seconds: number) {
  if (!Number.isFinite(seconds)) throw new Error('Animation lab seek must be finite');
  if (disposed || !mixer || !action || !loaded) return;
  const target = Math.min(state.duration, Math.max(0, seconds));
  mixer.stopAllAction(); clearFade();
  action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  // Direct action time plus update(0) avoids LoopRepeat wrapping duration to zero.
  action.time = target; action.paused = false; mixer.update(0);
  if (asset && state.clip && !getLabClip(asset, state.clip).loop && target === state.duration) action.paused = true;
  loaded.scene.updateMatrixWorld(true); emit({ time: target });
 }
 function frame(timestamp: number) {
  if (disposed) return;
  const delta = previousTime === null ? 0 : Math.min(.05, Math.max(0, (timestamp - previousTime) / 1000)); previousTime = timestamp;
  if (mixer && action && !state.paused && !visibility?.hidden) {
   const elapsed = delta * speed; mixer.update(elapsed);
   if (fade) { fade.elapsed += elapsed; if (fade.elapsed >= .15) clearFade(); }
   loaded?.scene.updateMatrixWorld(true);
   if (delta > 0) emit({ time: Math.min(state.duration, Math.max(0, action.time)) });
  }
  controls.update(); renderer.render(scene, camera); frameId = requestFrame(frame);
 }
 resize(); emit(); frameId = requestFrame(frame);
 return {
  async selectSpecies(id) {
   if (disposed) return;
   const token = ++generation; release(); previousTime = null;
   emit({ species: id, clip: null, status: 'loading', error: null, time: 0, duration: 0 });
   let candidate: LoadedLabAsset | null = null;
   try {
    const declaration = getLabAsset(id); candidate = await loader(declaration);
    // Validate even a late result, then dispose it without ever attaching.
    validateLoadedLabAsset(declaration, candidate);
    if (disposed || token !== generation) { candidate.dispose(); return; }
    loaded = candidate; asset = declaration; bounds = candidate.bounds.clone();
    mixer = new AnimationMixer(candidate.scene); helper = new SkeletonHelper(candidate.scene); helper.visible = skeletonVisible;
    scene.add(candidate.scene, helper); floor.scale.setScalar(Math.max(6, bounds.getSize(new Vector3()).length() * 4));
    startClip('idle', false); resetCamera(); emit({ status: 'ready', error: null });
   } catch (error) {
    if (candidate && candidate !== loaded) candidate.dispose();
    if (disposed || token !== generation) return;
    release(); emit({ status: 'error', error: error instanceof Error ? error.message : 'Animation lab asset failed to load', clip: null, time: 0, duration: 0 });
   }
  },
  selectClip(name) { if (!disposed && state.status === 'ready') startClip(name, !state.paused && state.clip !== name); },
  setPaused(paused) { if (!disposed) { if (state.paused !== paused) previousTime = null; emit({ paused }); } },
  seek,
  setSpeed(value) { if (!Number.isFinite(value) || value <= 0) throw new Error('Animation lab speed must be finite and positive'); if (!disposed) speed = value; },
  setSkeletonVisible(visible) { if (!disposed) { skeletonVisible = visible; if (helper) helper.visible = visible; } },
  resetCamera,
  dispose,
 };
 }
}
