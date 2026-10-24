import * as THREE from 'three';
import {smallAnimalCarryFold,type FarmAnimalPose} from './animal-art.ts';

/** Runtime for genuine Blender-authored skin weights and bone animation clips.
 * The terrain contact adjustment is a small IK-like head correction, not generated locomotion. */
export function createSkeletalCowController(root:THREE.Group,clips:THREE.AnimationClip[],contactRoot:THREE.Object3D=root){
 const required=['idle','walk','drink_enter','drink_loop','drink_exit'];
 for(const name of required)if(!clips.some(c=>c.name===name))throw new Error(`Cow asset missing animation ${name}`);
 const mouth=root.getObjectByName('feeding-mouth'),support=root.getObjectByName('animal-support');
 if(!mouth||!support)throw new Error('Cow asset missing mouth/support anchors');
 const bones:THREE.Bone[]=[];root.traverse(o=>{if(o instanceof THREE.Bone)bones.push(o);});
 const head=bones.find(b=>b.name==='cow_head'||b.name.toLowerCase()==='head');
 if(!head)throw new Error('Cow asset missing Head bone');
 const headRest=head.position.clone(),mixer=new THREE.AnimationMixer(root);
 // Carry is a local additive articulation, not a scale or root-height correction.
 // Clear it before the mixer so putting the animal down restores authored feet.
 const carryLegs=bones.filter(b=>/^cow_(front|back)_[LR]_upper$/.test(b.name)).map(bone=>({bone,applied:new THREE.Quaternion(),front:bone.name.includes('_front_'),side:bone.name.includes('_L_')?-1:1}));
 const carryScale=new THREE.Vector3(),rootRotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),basis=new THREE.Quaternion(),foldRotation=new THREE.Quaternion(),foldEuler=new THREE.Euler();
 const actions=new Map(required.map(name=>{const clip=clips.find(c=>c.name===name)!;const action=mixer.clipAction(clip);action.setEffectiveTimeScale(0);return [name,action];}));
 let active='',previousTime:number|undefined;
 const worldTarget=new THREE.Vector3(),worldMouth=new THREE.Vector3(),delta=new THREE.Vector3();
 const smooth=(x:number)=>{const q=THREE.MathUtils.clamp(x,0,1);return q*q*(3-2*q);};
 return {root,mouth,support,mixer,
  update(p:FarmAnimalPose){
   const phase=THREE.MathUtils.clamp(p.drinkPhase??.5,0,1),drinking=p.activity==='drink'&&phase<1&&!p.carried,grazing=p.activity==='graze'&&!p.carried;
   let name='idle',fraction=(p.time%3)/3;
   if(drinking&&phase>=.12&&phase<.32){name='drink_enter';fraction=(phase-.12)/.2;}
   else if(drinking&&phase>=.32&&phase<.78){name='drink_loop';fraction=(phase-.32)/.46;}
   else if(drinking&&phase>=.78){name='drink_exit';fraction=(phase-.78)/.22;}
   else if(grazing){name='drink_loop';fraction=(p.time/1.6)%1;}
   else if(!p.carried&&p.speed>.04){name='walk';fraction=(p.distance/.58)%1;}
   if(name!==active){if(active)actions.get(active)!.fadeOut(.18);const next=actions.get(name)!;next.reset().setEffectiveTimeScale(0).setEffectiveWeight(1).play();if(active)next.fadeIn(.18);active=name;}
   const action=actions.get(name)!;action.time=THREE.MathUtils.clamp(fraction,0,.999999)*action.getClip().duration;
   // Reset correction before evaluating the authored channels; never accumulate offsets.
   head.position.copy(headRest);
   for(const leg of carryLegs){leg.bone.quaternion.premultiply(leg.applied.invert());leg.applied.identity();}
   mixer.update(previousTime===undefined?0:THREE.MathUtils.clamp(p.time-previousTime,0,.1));previousTime=p.time;
   const lower=drinking?smooth((phase-.12)/.2)*(1-smooth((phase-.78)/.22)):grazing?1:0;
   if(lower>0&&p.waterContact&&head.parent){
    root.updateWorldMatrix(true,true);contactRoot.localToWorld(worldTarget.set(p.waterContact.x,p.waterContact.y,p.waterContact.z));mouth.getWorldPosition(worldMouth);
    head.parent.worldToLocal(worldTarget);head.parent.worldToLocal(worldMouth);delta.copy(worldTarget).sub(worldMouth);
    // A bad bank selection must not stretch the face back through the body.
    delta.clampLength(0,.18).multiplyScalar(lower);head.position.add(delta);root.updateWorldMatrix(true,true);
   }
   const carryFold=p.carried?smallAnimalCarryFold(contactRoot.getWorldScale(carryScale).x):0;
   if(carryFold>0){
    root.updateWorldMatrix(true,true);root.getWorldQuaternion(rootRotation);
    for(const leg of carryLegs){
     leg.bone.parent!.getWorldQuaternion(parentRotation);basis.copy(parentRotation).invert().multiply(rootRotation);
     // The welded hide blends inner upper-leg skin with the belly. Lateral
     // splay keeps that skin outside the head while the legs fold fore/aft.
     foldRotation.setFromEuler(foldEuler.set((leg.front?-1:1)*1.3*carryFold,0,leg.side*.7*carryFold));
     leg.applied.copy(basis).multiply(foldRotation).multiply(basis.invert());
     leg.bone.quaternion.premultiply(leg.applied);
    }
   }
   const h=THREE.MathUtils.clamp(p.hatch??1,0,1);root.position.y=h<1?Math.sin(THREE.MathUtils.clamp((h-.1)/.9,0,1)*Math.PI)*.65:0;
  },
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);},
 };
}
