import { AnimationClip, Bone, Box3, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, VectorKeyframeTrack } from 'three';
import type { LabAsset } from '../src/animation-lab/types.ts';

/** Real skinned geometry and bone tracks, with no WebGL dependency. */
export function labFixture(asset: LabAsset) {
 const scene = new Group();
 const root = new Bone(); root.name = asset.anchors.root;
 const body = new Bone(); body.name = asset.anchors.body; root.add(body);
 const bones = [root, body];
 for (const name of [asset.anchors.neck[0], asset.anchors.neck[1], asset.anchors.head, asset.anchors.mouth, asset.anchors.support, asset.anchors.ground, asset.anchors.headTarget, ...asset.anchors.feet]) {
  const bone = new Bone(); bone.name = name; body.add(bone); bones.push(bone);
 }
 const geometry = new BufferGeometry();
 geometry.setAttribute('position', new Float32BufferAttribute([-.2, .2, 0, .2, .2, 0, 0, .8, 0], 3));
 geometry.setAttribute('skinIndex', new Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
 geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
 const material = new MeshStandardMaterial();
 const mesh = new SkinnedMesh(geometry, material); mesh.add(root); scene.add(mesh); mesh.bind(new Skeleton(bones));
 const clips = asset.clips.map(clip => new AnimationClip(clip.name, clip.durationSeconds, [new VectorKeyframeTrack(body.name + '.position', [0, clip.durationSeconds / 2, clip.durationSeconds], [0, 0, 0, 0, .2, 0, 0, clip.loop ? 0 : .4, 0])]));
 let disposals = 0;
 return { scene, clips, bounds: new Box3(new Vector3(-1, 0, -1), new Vector3(1, 4, 1)), body, mesh, get disposals() { return disposals; }, dispose() { disposals++; geometry.dispose(); material.dispose(); mesh.skeleton.dispose(); } };
}

export function deferred<T>() {
 let resolve!: (value: T) => void;
 let reject!: (reason: Error) => void;
 const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
 return { promise, resolve, reject };
}
