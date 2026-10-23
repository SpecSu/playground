import * as THREE from 'three';
import {createMarineModel,animateMarineModel} from './marine-models.js';
import {goldMaterial} from './plant-presentation.js';

export const FISH_ART_IDS=Object.freeze(['clownfish','sardine','mackerel','pufferfish','blue-tang','salmon','cuttlefish','octopus','lobster','snow-crab','squid','mahi-mahi','manta-ray','king-crab','tuna','swordfish','oarfish','sailfish','hammerhead','sunfish']);
export const FISH_FORWARD=Object.freeze([1,0,0]);

export function individualMotion(instanceId){
  let hash=2166136261;for(const c of String(instanceId)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}
  // Avalanche the final hash so consecutive catch IDs do not produce almost identical phases.
  hash=Math.imul(hash^(hash>>>16),0x7feb352d);hash=Math.imul(hash^(hash>>>15),0x846ca68b);hash^=hash>>>16;
  const n=(hash>>>0)/4294967296;
  return {phase:n*Math.PI*2,speed:.88+((hash>>>8)%1000)/1000*.24};
}

/** Size in world units is explicitly provided by the approved physical conversion. */
export function createFishPresentation({speciesId,lengthCm,worldLength,variant='normal',instanceId=''}){
  if(!FISH_ART_IDS.includes(speciesId))throw new Error(`Unknown fish art ${speciesId}`);
  if(!(Number.isFinite(worldLength)&&worldLength>0))throw new Error('Fish worldLength must be explicit');
  const root=createMarineModel(speciesId,lengthCm);
  root.scale.setScalar(worldLength/1.6);
  root.userData.forwardAxis=FISH_FORWARD.slice();
  root.userData.worldLength=worldLength;
  const ownsMaterials=new Set();
  if(variant==='gold')root.traverse(node=>{
    if(!node.isMesh)return;
    const mats=Array.isArray(node.material)?node.material:[node.material];
    const out=mats.map(m=>{const clone=m.clone();ownsMaterials.add(clone);goldMaterial(clone,node.name);return clone;});
    node.material=Array.isArray(node.material)?out:out[0];
    if(node.geometry.getAttribute('color')&&!/eye|pupil|mouth|gill/.test(node.name)){
      const geo=node.geometry.clone();node.geometry=geo;geo.computeBoundingBox();
      const positions=geo.getAttribute('position'),colors=geo.getAttribute('color');
      const low=new THREE.Color('#B28C4D'),high=new THREE.Color('#F1DDA7'),shade=new THREE.Color();
      const minY=geo.boundingBox.min.y,height=Math.max(.001,geo.boundingBox.max.y-minY);
      for(let i=0;i<colors.count;i++){shade.copy(low).lerp(high,(positions.getY(i)-minY)/height);colors.setXYZ(i,shade.r,shade.g,shade.b);}
      colors.needsUpdate=true;
      // Vertex colors already are the golden gradient. Do not multiply it by gold again.
      for(const m of out)m.color.set('#ffffff');
    }
  });
  const motion=individualMotion(instanceId);
  const animate=(seconds)=>animateMarineModel(root,seconds,motion.phase,motion.speed);
  root.updateMatrixWorld(true);
  const initialBounds=new THREE.Box3().setFromObject(root);
  const dimensions=initialBounds.getSize(new THREE.Vector3());
  return {root,animate,dimensions,motion,forwardAxis:FISH_FORWARD,dispose(){
    const geometries=new Set(),materials=new Set();
    root.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);for(const m of (Array.isArray(n.material)?n.material:[n.material]))materials.add(m);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());ownsMaterials.forEach(m=>m.dispose());
  }};
}

/** Entire rigid-body yaw envelope including appendage animation, no fish-size shrink. */
export function measureFishTurnEnvelope(presentation,{samples=48,seconds=12}={}){
  const old= presentation.root.rotation.clone();const box=new THREE.Box3();
  for(let i=0;i<samples;i++){
    presentation.animate(i/samples*seconds);
    presentation.root.rotation.y=i/samples*Math.PI*2;
    presentation.root.updateMatrixWorld(true);
    box.union(new THREE.Box3().setFromObject(presentation.root));
  }
  presentation.root.rotation.copy(old);presentation.root.updateMatrixWorld(true);
  return {bounds:box,size:box.getSize(new THREE.Vector3()),half:box.getSize(new THREE.Vector3()).multiplyScalar(.5)};
}
