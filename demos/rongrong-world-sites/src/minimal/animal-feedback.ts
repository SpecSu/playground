import * as THREE from 'three';
import type {FarmAnimalPose,FarmSpecies} from './animal-art.ts';

const clamp=(value:number)=>THREE.MathUtils.clamp(value,0,1);
const ease=(value:number)=>{const t=clamp(value);return t*t*(3-2*t);};
/** Stable six-second action envelope shared by procedural contact and feedback. */
export function drinkingPoseAt(phase:number){
 const p=clamp(phase),lower=ease((p-.12)/.18)*(1-ease((p-.78)/.22));
 const sipWindow=p>=.32&&p<=.76,sipPhase=clamp((p-.32)/.44)*3;
 return {lower,sipping:sipWindow,sip:sipWindow?Math.sin(sipPhase*Math.PI*2):0,sipPhase};
}

/** Ground feedback belongs to the canonical actor, never to either body renderer. */
export function createAnimalFeedback(root:THREE.Group,species:FarmSpecies){
 const [inner,outer,segments,height]=species==='cow'?[.48,.515,40,.012]:species==='duck'?[.4,.44,36,.012]:[.45,.49,40,.018];
 const halo=new THREE.Mesh(new THREE.RingGeometry(inner,outer,segments),new THREE.MeshBasicMaterial({color:'#FFF1AB',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
 if(species==='cow')halo.name='selection-halo';halo.rotation.x=-Math.PI/2;halo.position.y=height;halo.visible=false;halo.userData.pickable=false;root.add(halo);
 const ripples=new THREE.Group();ripples.name='drink-ripples';ripples.position.y=.01;ripples.userData.pickable=false;root.add(ripples);
 const rings=Array.from({length:3},()=>{const ring=new THREE.Mesh(new THREE.RingGeometry(.065,.079,24),new THREE.MeshBasicMaterial({color:'#E6FFFF',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ripples.add(ring);return ring;});
 let disposed=false;
 return {
  update(p:FarmAnimalPose){
   if(disposed)return;
   halo.visible=!!p.selected&&!p.carried;
   const grazing=p.activity==='graze',enabled=(p.activity==='drink'||grazing)&&!p.carried&&p.speed<.1,action=grazing?{lower:1,sipping:false,sipPhase:0}:drinkingPoseAt(p.drinkPhase??.5);
   ripples.visible=enabled&&action.sipping;
   if(!enabled||!action.lower)return;
   const contact=(!grazing&&p.waterContact)||{x:0,y:grazing?.07:.045,z:.72};
   ripples.position.set(contact.x,contact.y+.006,contact.z);
   rings.forEach((ring,i)=>{const phase=(action.sipPhase+i/3)%1;ring.scale.setScalar(1+phase*2.4);ring.material.opacity=(1-phase)*.55;});
  },
  dispose(){if(disposed)return;disposed=true;halo.removeFromParent();ripples.removeFromParent();for(const mesh of [halo,...rings]){mesh.geometry.dispose();mesh.material.dispose();}ripples.clear();},
 };
}
