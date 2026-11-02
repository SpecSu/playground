import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFishingBackgroundBoats } from './fishing-background-boats.ts';

export type FishingSeaEvent = 'none' | 'dolphins' | 'shark' | 'whale';
export interface FishingSeaLifeState { kind: FishingSeaEvent; stage: 'quiet' | 'swim' | 'spout' | 'breach' | 'splash'; progress: number; age: number; cycle: number }
// Seeded, repeatable intervals keep a reserved whale slot every 120–180 seconds.
// A fixed-size table makes sampling bounded even after days in an open tab.
const intervals = Array.from({ length: 16 }, (_, i) => {
  let seed = Math.imul(i + 713, 374761393); seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return 120 + ((seed ^ (seed >>> 16)) >>> 0) % 61;
});
const period = intervals.reduce((a, b) => a + b, 0);
export function sampleFishingSeaLife(seconds: number, output?: FishingSeaLifeState): FishingSeaLifeState {
  const state = output ?? { kind: 'none', stage: 'quiet', progress: 0, age: 0, cycle: 0 };
  state.kind = 'none'; state.stage = 'quiet'; state.progress = 0; state.age = 0; state.cycle = 0;
  if (!Number.isFinite(seconds) || seconds < 0) return state;
  let age = seconds % period, cycle = 0;
  while (cycle < intervals.length - 1 && age >= intervals[cycle]) age -= intervals[cycle++];
  state.cycle = Math.floor(seconds / period) * intervals.length + cycle;
  let start = 0, duration = 1;
  if (age >= intervals[cycle] - 10) { state.kind = 'whale'; start = intervals[cycle] - 10; duration = 10; }
  else if (age >= 18 && age < 28) { state.kind = 'dolphins'; state.stage = 'swim'; start = 18; duration = 10; }
  else if (age >= 60 && age < 71) { state.kind = 'shark'; state.stage = 'swim'; start = 60; duration = 11; }
  if (state.kind !== 'none') {
    state.age = age - start; state.progress = state.age / duration;
    if (state.kind === 'whale') state.stage = state.age < 2.2 ? 'spout' : state.age < 7.8 ? 'breach' : 'splash';
  }
  return state;
}

type SeaHeight = (x: number, z: number, time: number, reducedMotion?: boolean) => number;
type Part = { geometry: THREE.BufferGeometry; position?: [number, number, number]; scale?: [number, number, number]; rotation?: [number, number, number] };
const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

/** Decorative only: no catch records, colliders, lights, textures or per-event loads. */
export function createFishingSeaLife(waterHeightAt: SeaHeight) {
  const root = new THREE.Group(); root.name = 'Nearby boats and quiet sea life'; root.userData.decorative = true;
  const boatFleet = createFishingBackgroundBoats(); root.add(boatFleet.root);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const material = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .56, metalness: .02 }); materials.add(m); return m; };
  const blue = material('#7699a6'), dark = material('#284755'), pale = material('#d5e5e6');
  const waterRingMaterial = new THREE.MeshBasicMaterial({ color: '#e5f7f8', transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true }); materials.add(waterRingMaterial);
  const sprayMaterial = new THREE.LineBasicMaterial({ color: '#f5ffff', transparent: true, opacity: .75, depthWrite: false }); materials.add(sprayMaterial);
  const sphere = new THREE.SphereGeometry(1, 10, 6), cone = new THREE.ConeGeometry(1, 1, 8);
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([-.5,0,-.035,0,1,-.035,.5,0,-.035,-.5,0,.035,0,1,.035,.5,0,.035], 3));
  fin.setIndex([0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5]); fin.computeVertexNormals();
  const transform = new THREE.Object3D();
  const merged = (parent: THREE.Object3D, name: string, surface: THREE.Material, parts: Part[]) => {
    const chunks = parts.map(part => {
      transform.position.set(...part.position ?? [0,0,0]); transform.scale.set(...part.scale ?? [1,1,1]); transform.rotation.set(...part.rotation ?? [0,0,0]); transform.updateMatrix();
      const copy = part.geometry.clone().applyMatrix4(transform.matrix);
      const chunk = copy.index ? copy.toNonIndexed() : copy;
      if (chunk !== copy) copy.dispose();
      chunk.deleteAttribute('uv');
      return chunk;
    });
    const geometry = mergeGeometries(chunks); chunks.forEach(g => g.dispose());
    if (!geometry) throw new Error('Sea-life geometry could not be merged');
    geometries.add(geometry); const mesh = new THREE.Mesh(geometry, surface); mesh.name = name; mesh.raycast = () => {}; parent.add(mesh); return mesh;
  };
  const pod = new THREE.Group(); pod.name = 'Dolphin pod'; root.add(pod);
  const dolphin = new THREE.Group(); dolphin.name = 'Dolphin companion';
  merged(dolphin, 'Dolphin blue silhouette', blue, [
    { geometry:sphere, scale:[.25,.28,.83] }, { geometry:sphere, position:[0,.03,.68], scale:[.21,.23,.34] },
    { geometry:cone, position:[0,-.015,1.0], scale:[.09,.42,.09], rotation:[Math.PI/2,0,0] },
    { geometry:fin, position:[0,.15,-.2], scale:[.46,.45,1], rotation:[0,Math.PI/2,0] },
    { geometry:fin, position:[-.22,-.08,.1], scale:[.45,.42,1], rotation:[-.9,0,.95] },
    { geometry:fin, position:[.22,-.08,.1], scale:[.45,.42,1], rotation:[-.9,0,-.95] },
    { geometry:sphere, position:[-.23,0,-.82], scale:[.32,.045,.16], rotation:[0,-.28,0] },
    { geometry:sphere, position:[.23,0,-.82], scale:[.32,.045,.16], rotation:[0,.28,0] },
  ]);
  merged(dolphin, 'Dolphin pale underside', pale, [{ geometry:sphere, position:[0,-.19,.12], scale:[.18,.09,.6] }]);
  merged(dolphin, 'Dolphin eyes', dark, [-1,1].map(sign => ({ geometry:sphere, position:[sign*.181,.09,.71] as [number,number,number], scale:[.035,.035,.035] })));
  for (let i = 0; i < 3; i++) { const companion = dolphin.clone(); companion.name = `Dolphin companion ${i+1}`; pod.add(companion); }
  const shark = new THREE.Group(); shark.name = 'Shark fin visit'; root.add(shark);
  merged(shark, 'Only a cruising dorsal fin', dark, [{ geometry:fin, scale:[1.2,.72,1.6], rotation:[0,Math.PI/2,0] }]);
  const whale = new THREE.Group(); whale.name = 'Whale visit'; root.add(whale);
  const whaleBody = new THREE.Group(); whaleBody.name = 'Whale body'; whale.add(whaleBody);
  merged(whaleBody, 'Whale broad silhouette', dark, [
    { geometry:sphere, scale:[.77,.7,2.2] }, { geometry:sphere, position:[0,.02,1.75], scale:[.72,.62,.86] },
    { geometry:cone, position:[0,-.04,-2.1], scale:[.35,1.1,.3], rotation:[-Math.PI/2,0,0] },
    { geometry:fin, position:[0,.5,-.6], scale:[.8,.45,1.8], rotation:[0,Math.PI/2,0] },
    { geometry:fin, position:[-.68,-.18,.7], scale:[.7,1.3,2], rotation:[-1,0,1.1] },
    { geometry:fin, position:[.68,-.18,.7], scale:[.7,1.3,2], rotation:[-1,0,-1.1] },
    { geometry:sphere, position:[-.62,-.02,-2.5], scale:[.83,.08,.36], rotation:[0,-.3,0] },
    { geometry:sphere, position:[.62,-.02,-2.5], scale:[.83,.08,.36], rotation:[0,.3,0] },
  ]);
  merged(whaleBody, 'Whale silver throat', pale, [{ geometry:sphere, position:[0,-.52,.55], scale:[.58,.18,1.45] }]);
  merged(whaleBody, 'Whale eyes', blue, [-1,1].map(sign => ({ geometry:sphere, position:[sign*.65,.07,1.9] as [number,number,number], scale:[.07,.06,.06] })));
  sphere.dispose(); cone.dispose(); fin.dispose();
  const sprayPoints: number[] = [];
  for (let branch = 0; branch < 9; branch++) for (let segment = 0; segment < 5; segment++) {
    const angle = branch*Math.PI*2/9;
    for (const p of [segment/5,(segment+1)/5]) sprayPoints.push(Math.cos(angle)*p*p*.65,Math.sin(p*Math.PI*.65)*2.3,Math.sin(angle)*p*p*.65);
  }
  const sprayGeometry = new THREE.BufferGeometry(); sprayGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sprayPoints,3)); geometries.add(sprayGeometry);
  const spray = new THREE.LineSegments(sprayGeometry,sprayMaterial); spray.name = 'Brief whale blow'; spray.raycast = () => {}; whale.add(spray);
  const ringGeometry = new THREE.RingGeometry(.94,1,32); ringGeometry.rotateX(-Math.PI/2); geometries.add(ringGeometry);
  const rings = [0,1].map(i => { const geometry=i===0?ringGeometry:ringGeometry.clone(); geometries.add(geometry);
    const position=geometry.attributes.position;
    if(position instanceof THREE.BufferAttribute)position.setUsage(THREE.DynamicDrawUsage);
    const ring = new THREE.Mesh(geometry,waterRingMaterial); ring.name = `Whale landing ripple ${i+1}`; ring.raycast = () => {}; whale.add(ring); return ring; });
  const events = [pod,shark,whale]; events.forEach(event => { event.visible=false; event.userData.decorative=true; });
  // clone() copies own methods only via Object3D defaults, so explicitly disable
  // picking on every pooled drawable, including the cloned dolphin companions.
  root.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { object.raycast=()=>{}; object.castShadow=false; object.receiveShadow=false; } });
  let disposed=false,active=true,lastTime:number|undefined,elapsed=0;
  const state: FishingSeaLifeState = {kind:'none',stage:'quiet',progress:0,age:0,cycle:0};
  function setActive(value: boolean) { if (active===value || disposed) return; active=value; root.visible=value; lastTime=undefined; }
  function update(time: number, reducedMotion=false) {
    if (disposed || !active || !Number.isFinite(time)) return;
    const now=Math.max(0,time);
    if (lastTime!==undefined && !reducedMotion) elapsed+=Math.max(0,now-lastTime);
    lastTime=now;
    for (let i=0;i<boatFleet.boats.length;i++) {
      const boat=boatFleet.boats[i],t=reducedMotion?0:now;
      boat.root.position.set(boat.x,waterHeightAt(boat.x,boat.z,t,reducedMotion)+.03,boat.z);
      boat.root.rotation.set(reducedMotion?0:Math.sin(t*.51+i)*.018,boat.heading+(reducedMotion?0:Math.sin(t*.11+i)*.018),reducedMotion?0:Math.sin(t*.43+i*1.7)*.025);
      boat.root.updateMatrix();
    }
    sampleFishingSeaLife(reducedMotion?-1:elapsed,state);
    pod.visible=state.kind==='dolphins'; shark.visible=state.kind==='shark'; whale.visible=state.kind==='whale';
    if (pod.visible) for (let i=0;i<3;i++) {
      const p=clamp((state.progress-i*.075)/.78,0,1),x=-11+p*7+i*.65,z=-13-p*4+i*.8,companion=pod.children[i];
      companion.position.set(x,waterHeightAt(x,z,now)-1.05+Math.sin(p*Math.PI)*2.35,z);
      companion.rotation.set(-Math.cos(p*Math.PI)*.8,Math.atan2(7,-4),0);
    }
    if (shark.visible) {
      const angle=state.progress*Math.PI*2,x=-4+Math.cos(angle)*1.8,z=-17+Math.sin(angle)*2.4;
      const reveal=smooth(Math.min(state.progress/.16,(1-state.progress)/.16));
      shark.position.set(x,waterHeightAt(x,z,now)-.78+reveal*.75,z); shark.rotation.y=-angle;
    }
    if (whale.visible) {
      whale.position.set(-10,0,-12); whale.rotation.y=-.6;
      const p=clamp((state.age-2.2)/5.6,0,1),z=-2+6*p;
      const surface=waterHeightAt(-10-Math.sin(.6)*z,-12+Math.cos(.6)*z,now);
      whaleBody.position.set(0,state.stage==='spout'?surface-.66:surface-2.2+Math.sin(p*Math.PI)*5,z);
      whaleBody.rotation.x=state.stage==='spout'?0:-Math.cos(p*Math.PI)*1.05;
      whaleBody.visible=state.stage!=='splash';
      spray.visible=state.stage==='spout'; spray.position.set(0,surface+.12,-.45); spray.scale.setScalar(Math.max(.01,Math.sin(clamp(state.age/2.2,0,1)*Math.PI)));
      const splash=clamp((state.age-7.8)/2.2,0,1); waterRingMaterial.opacity=.48*(1-splash);
      for (let i=0;i<rings.length;i++) {
        const ring=rings[i];ring.visible=state.stage==='splash';
        if (!ring.visible) continue;
        const scale=.7+splash*3.4+i*.3;ring.position.set(0,0,4);ring.scale.setScalar(scale);
        // Reuse the two small prebuilt buffers and conform each ripple vertex to
        // the same analytic sea as the yacht. A flat ring disappears under crests.
        const points=ring.geometry.attributes.position,cos=Math.cos(-.6),sin=Math.sin(-.6);
        for (let vertex=0;vertex<points.count;vertex++) {
          const x=points.getX(vertex)*scale,z=4+points.getZ(vertex)*scale;
          const worldX=-10+cos*x+sin*z,worldZ=-12-sin*x+cos*z;
          points.setY(vertex,(waterHeightAt(worldX,worldZ,now)+.035)/scale);
        }
        points.needsUpdate=true;ring.geometry.computeBoundingSphere();
      }
    }
  }
  update(0); lastTime=undefined; // The first scene timestamp establishes the active clock origin.
  return {root,boats:boatFleet.boats,state,get elapsed(){return elapsed;},setActive,update,dispose(){if(disposed)return;disposed=true;boatFleet.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();root.clear();}};
}
