import * as THREE from 'three';
import type {FarmAnimalArt} from './animal-art.ts';
/** A retired visual only: never owns an animal, currency, pick target or timer. */
export class SaleHandoff{
 readonly art:FarmAnimalArt;private start:THREE.Vector3;private scale:THREE.Vector3;private at:number;private reduced:boolean;private ended=false;
 private originals=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();private copies=new Map<THREE.Material,THREE.Material>();
 constructor(art:FarmAnimalArt,at:number,reduced:boolean){this.art=art;this.at=at;this.reduced=reduced;this.start=art.root.position.clone();this.scale=art.root.scale.clone();delete art.root.userData.target;this.update(at);}
 update(now:number){
  if(this.ended)return true;const t=Math.max(0,(now-this.at)/(this.reduced?180:850));
  if(t>=1){this.dispose();return true;}
  const ease=t*t*(3-2*t),fade=1-Math.max(0,(t-.3)/.7);
  // Stay close to the carried pose, rather than passing through LX or the counter.
  this.art.root.position.copy(this.start);if(!this.reduced)this.art.root.position.y+=.18*ease;
  this.art.root.scale.copy(this.scale).multiplyScalar(this.reduced?1:1-.12*ease);
  // GLBs can finish loading during the handoff. Clone each new material locally,
  // restore before disposing the art, and never fade a shared animal material.
  if(this.art.root.userData.animationStatus==='loading')return false;
  this.art.root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
   if(!this.originals.has(object)){this.originals.set(object,object.material);const clone=(source:THREE.Material)=>{let copy=this.copies.get(source);if(!copy){copy=source.clone();copy.transparent=true;copy.depthWrite=false;this.copies.set(source,copy);}return copy;};object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);}
  });
  for(const[source,copy]of this.copies)copy.opacity=source.opacity*fade;
  return false;
 }
 dispose(){if(this.ended)return;this.ended=true;this.art.root.removeFromParent();for(const[mesh,material]of this.originals)mesh.material=material;for(const copy of this.copies.values())copy.dispose();this.originals.clear();this.copies.clear();this.art.dispose();}
}
