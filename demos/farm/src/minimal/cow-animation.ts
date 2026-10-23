import * as THREE from 'three';
import type {FarmAnimalPose} from './animal-art.ts';

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
   mixer.update(previousTime===undefined?0:THREE.MathUtils.clamp(p.time-previousTime,0,.1));previousTime=p.time;
   const lower=drinking?smooth((phase-.12)/.2)*(1-smooth((phase-.78)/.22)):grazing?1:0;
   if(lower>0&&p.waterContact&&head.parent){
    root.updateWorldMatrix(true,true);contactRoot.localToWorld(worldTarget.set(p.waterContact.x,p.waterContact.y,p.waterContact.z));mouth.getWorldPosition(worldMouth);
    head.parent.worldToLocal(worldTarget);head.parent.worldToLocal(worldMouth);delta.copy(worldTarget).sub(worldMouth);
    // A bad bank selection must not stretch the face back through the body.
    delta.clampLength(0,.18).multiplyScalar(lower);head.position.add(delta);root.updateWorldMatrix(true,true);
   }
   const h=THREE.MathUtils.clamp(p.hatch??1,0,1);root.position.y=h<1?Math.sin(THREE.MathUtils.clamp((h-.1)/.9,0,1)*Math.PI)*.65:0;
  },
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);},
 };
}
