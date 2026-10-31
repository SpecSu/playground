import { AnimationClip, Bone, Box3, Group, Material, Mesh, PropertyBinding, Skeleton, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getLabAsset, LAB_ASSETS } from './manifest.ts';
import type { LabAsset } from './types.ts';

export interface LoadedLabAsset {
 scene: Group;
 clips: AnimationClip[];
 /** Measured union of every clip, not just the loaded rest pose. */
 bounds: Box3;
 dispose(): void;
}
export interface LabAssetIndex {
 schemaVersion: 1;
 assets: Record<string, { sha256: string; bytes: number; bounds: { min: number[]; max: number[] } }>;
}
interface LabGLTF { scene: Group; scenes?: Group[]; animations: AnimationClip[] }
export interface LabLoaderDependencies {
 fetchIndex(): Promise<unknown>;
 loadGLTF(url: string): Promise<LabGLTF>;
}

function fail(message: string): never { throw new Error(`Invalid animation lab asset: ${message}`); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function finiteVector(value: unknown): value is number[] { return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n)); }

/** Reject incomplete or corrupt metadata before requesting any model. */
export function validateLabAssetIndex(value: unknown): asserts value is LabAssetIndex {
 const bad = () => { throw new Error('Invalid animation lab asset index'); };
 if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.assets)) return bad();
 const ids = LAB_ASSETS.map(asset => asset.id);
 if (Object.keys(value.assets).length !== ids.length) return bad();
 for (const id of ids) {
  const entry = value.assets[id];
  if (!isRecord(entry) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || typeof entry.bytes !== 'number' || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > 4 * 1024 * 1024 || !isRecord(entry.bounds)) return bad();
  const { min, max } = entry.bounds;
  if (!finiteVector(min) || !finiteVector(max) || min.some((n, axis) => n >= max[axis])) return bad();
 }
}

/** Also used at the controller boundary so injected loaders cannot report false ready. */
export function validateLoadedLabAsset(asset: LabAsset, loaded: LoadedLabAsset): void {
 if (!(loaded.scene instanceof Group) || !Array.isArray(loaded.clips) || !(loaded.bounds instanceof Box3) || ![...loaded.bounds.min.toArray(), ...loaded.bounds.max.toArray()].every(Number.isFinite) || loaded.bounds.isEmpty() || loaded.bounds.getSize(new Vector3()).toArray().some(n => n <= 0)) fail('missing scene or finite nonzero full-clip bounds');
 const named = new Map<string, number>(); const weightedBones = new Set<string>(); let meshes = 0;
 loaded.scene.updateMatrixWorld(true);
 loaded.scene.traverse(object => {
  named.set(object.name, (named.get(object.name) ?? 0) + 1);
  if (!object.matrixWorld.elements.every(Number.isFinite) || object.scale.toArray().some(n => !Number.isFinite(n) || n <= 0)) fail('nonfinite transform or nonpositive scale');
  if (!(object instanceof Mesh)) return;
  if (!(object instanceof SkinnedMesh)) fail('every visible mesh must be skinned');
  meshes++;
  const { skeleton, geometry } = object;
  if (!skeleton || !skeleton.bones.length || skeleton.bones.length > 64 || skeleton.bones.length !== skeleton.boneInverses.length || skeleton.bones.some(bone => !bone.isBone || !loaded.scene.getObjectById(bone.id))) fail('invalid skeleton');
  const positions = geometry.getAttribute('position'), weights = geometry.getAttribute('skinWeight'), indices = geometry.getAttribute('skinIndex');
  if (!positions || !positions.count || positions.itemSize !== 3 || !weights || !indices || weights.itemSize !== 4 || indices.itemSize !== 4 || weights.count !== positions.count || indices.count !== positions.count) fail('missing skin attributes');
  skeleton.update();
  const vertex = new Vector3();
  for (let i = 0; i < positions.count; i++) {
   let sum = 0;
   for (let channel = 0; channel < 4; channel++) {
    const weight = weights.getComponent(i, channel), index = indices.getComponent(i, channel);
    if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(index) || index < 0 || index >= skeleton.bones.length) fail('invalid skin weight or joint index');
    sum += weight; if (weight > 0) weightedBones.add(skeleton.bones[index].name);
   }
   if (Math.abs(sum - 1) > .001) fail('skin weights must be normalized');
   vertex.fromBufferAttribute(positions, i);
   object.applyBoneTransform(i, vertex).applyMatrix4(object.matrixWorld);
   if (!vertex.toArray().every(Number.isFinite)) fail('nonfinite skinned position');
   // Envelope measurements are sampled with floating-point tolerances in the exporter.
   if (vertex.x < loaded.bounds.min.x - .025 || vertex.y < loaded.bounds.min.y - .025 || vertex.z < loaded.bounds.min.z - .025 || vertex.x > loaded.bounds.max.x + .025 || vertex.y > loaded.bounds.max.y + .025 || vertex.z > loaded.bounds.max.z + .025) fail('loaded skin lies outside the measured envelope');
  }
 });
 if (!meshes || !weightedBones.size) fail('no skinned geometry');
 for (const anchor of [asset.anchors.root, asset.anchors.body, asset.anchors.head, ...asset.anchors.neck, asset.anchors.mouth, asset.anchors.support, asset.anchors.ground, asset.anchors.headTarget, ...asset.anchors.feet]) {
  if (named.get(anchor) !== 1) fail(`missing or duplicate anchor ${anchor}`);
 }
 if (loaded.clips.length !== asset.clips.length || new Set(loaded.clips.map(clip => clip.name)).size !== loaded.clips.length) fail('incorrect clip set');
 for (const declaration of asset.clips) {
  const clip = loaded.clips.find(candidate => candidate.name === declaration.name);
  if (!clip || !Number.isFinite(clip.duration) || Math.abs(clip.duration - declaration.durationSeconds) > 1 / 24 || !clip.tracks.length) fail(`missing or wrong duration for ${declaration.name}`);
  let deformTrack = false;
  for (const track of clip.tracks) {
   const parsed = PropertyBinding.parseTrackName(track.name);
   const node = PropertyBinding.findNode(loaded.scene, parsed.nodeName);
   if (!(node instanceof Bone) || !['position', 'quaternion', 'scale'].includes(parsed.propertyName) || parsed.objectName !== undefined || parsed.propertyIndex !== undefined || track.getValueSize() !== (parsed.propertyName === 'quaternion' ? 4 : 3) || !track.validate() || !Array.from(track.values).every(Number.isFinite) || !Array.from(track.times).every(Number.isFinite)) fail(`unresolvable or invalid track ${track.name}`);
   if (weightedBones.has(node.name) && node.name !== asset.anchors.root) deformTrack = true;
  }
  if (!deformTrack) fail(`no deform-bone tracks in ${declaration.name}`);
 }
}

/** Resources can be shared by meshes, but are never shared with production caches. */
function ownScenes(scenes: Group[]): () => void {
 let disposed = false;
 return () => {
  if (disposed) return; disposed = true;
  const geometries = new Set<Mesh['geometry']>(), materials = new Set<Material>(), textures = new Set<Texture>(), skeletons = new Set<Skeleton>();
  const inspectTexture = (value: unknown): void => {
   if (value instanceof Texture) textures.add(value);
   else if (Array.isArray(value)) value.forEach(inspectTexture);
  };
  for (const scene of scenes) {
   scene.removeFromParent();
   scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    if (object instanceof SkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
     materials.add(material); Object.values(material).forEach(inspectTexture);
     if ('uniforms' in material && isRecord(material.uniforms)) for (const uniform of Object.values(material.uniforms)) if (isRecord(uniform)) inspectTexture(uniform.value);
    }
   });
  }
  skeletons.forEach(skeleton => skeleton.dispose());
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
 };
}

export function createLabAssetLoader(dependencies: LabLoaderDependencies): (asset: LabAsset) => Promise<LoadedLabAsset> {
 let indexPromise: Promise<LabAssetIndex> | undefined;
 const readIndex = () => indexPromise ??= dependencies.fetchIndex().then(value => { validateLabAssetIndex(value); return value; }).catch(error => { indexPromise = undefined; throw error; });
 return async asset => {
  const catalog = getLabAsset(asset.id);
  if (asset.url !== catalog.url) fail('URL must match the fixed catalog');
  const index = await readIndex(); const entry = index.assets[asset.id];
  const gltf = await dependencies.loadGLTF(`${catalog.url}?rev=${entry.sha256}`);
  const dispose = ownScenes([...new Set([gltf.scene, ...(gltf.scenes ?? [])])]);
  const loaded: LoadedLabAsset = { scene: gltf.scene, clips: gltf.animations, bounds: new Box3(new Vector3().fromArray(entry.bounds.min), new Vector3().fromArray(entry.bounds.max)), dispose };
  try { validateLoadedLabAsset(catalog, loaded); return loaded; } catch (error) { dispose(); throw error; }
 };
}

const defaultLoader = createLabAssetLoader({
 async fetchIndex() { const response = await fetch('/models/animation-lab/asset-index.json', { cache: 'no-cache' }); if (!response.ok) throw new Error(`Animation lab index request failed (${response.status})`); return response.json(); },
 loadGLTF: url => new GLTFLoader().loadAsync(url),
});
export function loadLabAsset(asset: LabAsset): Promise<LoadedLabAsset> { return defaultLoader(asset); }
