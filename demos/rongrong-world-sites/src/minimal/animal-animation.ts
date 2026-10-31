import {assertHunyuanMainInspectionContext,type AlpacaInspectionContext} from './alpaca-inspection.ts';
import * as THREE from 'three';
import {hatchPoseAt} from './hatch-choreography.ts';
import {createTransitionFloorContact} from './animal-limb-contact.ts';
import type {FarmAnimalPose,FarmSpecies} from './animal-art.ts';
import {animalAssetProfile,ANIMAL_CLIPS,validateAnimalAsset,type AnimalClip} from './animal-assets.ts';
import {HUNYUAN_DESCRIPTORS} from './hunyuan-promotion.ts';

/** Explicit CPU inspection only. This does not install a provider or publish a species.
 * The file inspector must independently hash actual bytes before constructing this. */
export type AlpacaOfflineMeasurements={candidateSha256:string;stride:number;drinkDatum?:{x:number;y:number;z:number}};
export type AlpacaOfflineCarryMode='immediate-authored-limbs'|'authored-crossfade';
export type AlpacaOfflinePreflight={kind:'offline-preflight';profile:AlpacaOfflineMeasurements;candidateSha256:string;carryMode?:AlpacaOfflineCarryMode};
export function assertAlpacaOfflineMeasurements(input:unknown,sha256:string):asserts input is AlpacaOfflineMeasurements{
 if(!/^[a-f0-9]{64}$/.test(sha256)||!input||typeof input!=='object'||Array.isArray(input)||(input as Record<string,unknown>).candidateSha256!==sha256)throw new Error('Offline candidate SHA256 mismatch');
 const p=input as Record<string,unknown>;if(typeof p.stride!=='number'||!Number.isFinite(p.stride)||p.stride<=0)throw new Error('Offline measured stride must be explicit, finite and positive');
 if(p.drinkDatum!==undefined){const d=p.drinkDatum as Record<string,unknown>;if(!d||typeof d!=='object'||Array.isArray(d)||!['x','y','z'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k])))throw new Error('Offline drink datum must contain explicit finite coordinates or be omitted');}
}

const smooth=(x:number)=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};
// Terrain contact is an articulated two-neck-bone solve, never a translated head.
/** All semantic states select genuine authored clips. Contact IK preserves bone
 * lengths and locomotion phase follows actual scaled distance travelled. */
export function createSkeletalAnimalController(root:THREE.Group,clips:THREE.AnimationClip[],species:FarmSpecies,contactRoot:THREE.Object3D=root,offline?:AlpacaOfflinePreflight,alpacaInspection?:AlpacaInspectionContext){
 if(alpacaInspection!=null){assertHunyuanMainInspectionContext(alpacaInspection);if(offline)throw new Error('Cannot combine offline partial profile with verified inspection context');}
 if(offline!==undefined){if(species!=='alpaca'||offline.kind!=='offline-preflight')throw new Error('Offline measured-profile override is for alpaca preflight only');assertAlpacaOfflineMeasurements(offline.profile,offline.candidateSha256);if(offline.carryMode!==undefined&&offline.carryMode!=='immediate-authored-limbs'&&offline.carryMode!=='authored-crossfade')throw new Error('Invalid offline alpaca carry mode');}
 // Capture once: offline counterfactual cannot change policy after validation.
 const authoredCarryCrossfade=(species==='alpaca'||species==='penguin')&&offline?.carryMode!=='immediate-authored-limbs';
 validateAnimalAsset(root,clips,species);
 const profile=offline?{stride:offline.profile.stride,drinkDatum:offline.profile.drinkDatum?{...offline.profile.drinkDatum}:undefined,head:HUNYUAN_DESCRIPTORS.alpaca.neckChain[2],neckChain:HUNYUAN_DESCRIPTORS.alpaca.neckChain,footChains:HUNYUAN_DESCRIPTORS.alpaca.footChains}:animalAssetProfile(species,alpacaInspection),mouth=root.getObjectByName('feeding-mouth')!,support=root.getObjectByName('animal-support')!,head=root.getObjectByName(profile.head)!;
 const mixer=new THREE.AnimationMixer(root),actions=new Map<AnimalClip,THREE.AnimationAction>();
 for(const name of ANIMAL_CLIPS){const action=mixer.clipAction(clips.find(c=>c.name===name)!);action.setEffectiveTimeScale(0).setEffectiveWeight(0).play();actions.set(name,action);}
 // Existing five species retain their immediate authored-limb safety mask. New
 // alpaca and penguin use continuous full-body authored carry with the root-preserving lift
 // path; a same-time command must not jump any limb/skin into the avatar. The
 // explicit offline baseline can still measure the old mask counterfactual.
 const carriedClip=clips.find(c=>c.name==='carried')!;
 const carryBones=profile.footChains?new Set(profile.footChains.flatMap(chain=>[chain.upper,chain.lower,chain.foot])):null;
 const carryTracks=carriedClip.tracks.flatMap(track=>{const match=track.name.match(/^(.+_(?:upper|lower|hoof|paw|foot))\.(position|quaternion|scale)$/);const bone=match?root.getObjectByName(match[1]):undefined;if(!match||!bone||(carryBones&&!carryBones.has(match[1])))return [];
  // GLTFLoader installs a custom factory for CUBICSPLINE. A forced linear
  // interpolant would interpret its incoming tangent as the actual transform.
  const factory=(track as THREE.KeyframeTrack&{createInterpolant:()=>THREE.Interpolant}).createInterpolant;
  return [{bone,property:match[2],interpolant:factory.call(track)}];});
 const weights=new Map<AnimalClip,number>(ANIMAL_CLIPS.map(name=>[name,0])),from=new Map(weights);
 let active:AnimalClip='idle',initialized=false,previousTime:number|undefined,transition=1,started=0;
 const neck1=root.getObjectByName(profile.neckChain[0])!,neck2=root.getObjectByName(profile.neckChain[1])!;
 const contact=createNeckContactSolver(root,contactRoot,neck1,neck2,head,mouth),floorContact=createTransitionFloorContact(root,contactRoot,profile.footChains);
 const correction=new THREE.Vector3(),desiredCorrection=new THREE.Vector3();
 return {root,mouth,support,mixer,
  update(p:FarmAnimalPose){
   if(p.waterContact&&!profile.drinkDatum)throw new Error('Offline drink datum is unmeasured; waterContact cannot be evaluated');
   const dt=previousTime===undefined?0:THREE.MathUtils.clamp(p.time-previousTime,0,.1);previousTime=p.time;
   const phase=THREE.MathUtils.clamp(p.drinkPhase??.5,0,1),drinking=p.activity==='drink'&&phase<1&&!p.carried&&p.speed<.1;
   let next:AnimalClip='idle';
   if(p.carried)next='carried';
   else if(p.speed>.04)next='walk';
   else if(drinking&&phase>=.12&&phase<.32)next='drink_enter';
   else if(drinking&&phase>=.32&&phase<.78)next='drink_loop';
   else if(drinking&&phase>=.78)next='drink_exit';
   else if(p.activity==='eat'||p.activity==='graze')next='eat';
   else if(p.activity==='rest')next='rest';
   else if(p.activity==='love'||p.activity==='react'||p.activity==='pet')next='react';
   if(!initialized){active=next;weights.set(active,1);initialized=true;started=p.time;}
   else if(next!==active){for(const name of ANIMAL_CLIPS)from.set(name,weights.get(name)!);active=next;transition=0;started=p.time;}
   if(transition<1){transition=Math.min(1,transition+dt/.2);const t=smooth(transition);for(const name of ANIMAL_CLIPS)weights.set(name,THREE.MathUtils.lerp(from.get(name)!,name===active?1:0,t));}
   for(const name of ANIMAL_CLIPS){
    const action=actions.get(name)!,weight=weights.get(name)!;action.setEffectiveWeight(weight);
    if(!weight)continue;
    let fraction=(p.time/action.getClip().duration)%1;
    if(name==='walk')fraction=(p.distance/profile.stride)%1;
    else if(name===active&&name==='drink_enter')fraction=(phase-.12)/.20;
    else if(name===active&&name==='drink_loop')fraction=(phase-.32)/.46;
    else if(name===active&&name==='drink_exit')fraction=(phase-.78)/.22;
    else if(name==='drink_enter'||name==='drink_loop'||name==='drink_exit')continue; // Keep interrupted contact pose while blending away.
    else if(name==='react'){if(name!==active)continue;fraction=p.reactProgress??Math.min(1,(p.time-started)/action.getClip().duration);}
    action.time=THREE.MathUtils.clamp(fraction,0,.999999)*action.getClip().duration;
   }
   contact.restoreAuthored();floorContact.restoreAuthored();mixer.update(0);contact.captureAuthored();floorContact.captureAuthored();
   let contributing=0;for(const weight of weights.values())if(weight>1e-9)contributing++;
   if(p.carried&&!authoredCarryCrossfade)for(const {bone,property,interpolant} of carryTracks){const value=interpolant.evaluate((p.time%carriedClip.duration));if(property==='quaternion')bone.quaternion.fromArray(value);else if(property==='position')bone.position.fromArray(value);else bone.scale.fromArray(value);}
   desiredCorrection.set(0,0,0);
   if(drinking&&p.waterContact){
    const lower=smooth((phase-.12)/.20)*(1-smooth((phase-.78)/.22));
    // Offset the authored low-water contact datum, not the animated mouth itself:
    // this retains all three authored sip pulses while adapting to a raised bowl.
    desiredCorrection.set(p.waterContact.x-profile.drinkDatum!.x,p.waterContact.y-profile.drinkDatum!.y,p.waterContact.z-profile.drinkDatum!.z).multiplyScalar(lower);
   }
   correction.lerp(desiredCorrection,dt?1-Math.exp(-dt*28):1);contact.solve(correction,drinking&&!!p.waterContact,dt);
   const hatch=THREE.MathUtils.clamp(p.hatch??1,0,1);root.position.y=hatchPoseAt(hatch).lift;
   // Only the new resources preserve a prior grounded correction while its authored
   // carry blend takes over, including a reversal before the release completes.
   if(authoredCarryCrossfade&&(p.carried||weights.get('carried')!>=1e-9))floorContact.release(dt);
   else {const solidFloor=species==='alpaca'||species==='penguin'?p.solidFootTriangleLiftWorld:undefined;floorContact.solve((contributing>1||!!solidFloor)&&weights.get('carried')!<1e-9&&hatch>=1&&!p.carried,solidFloor);}
   root.userData.activeAnimation=active;root.userData.animationWeights=Object.fromEntries(weights);
  },
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);},
 };
}

/** Rotational two-bone IK with a modest terrain-aware pitch preference. The same
 * exported local joint translations are retained exactly. Unreachable targets are
 * reported explicitly; the solver never lengthens a neck or lifts the animal root. */
function createNeckContactSolver(root:THREE.Group,contactRoot:THREE.Object3D,first:THREE.Object3D,second:THREE.Object3D,head:THREE.Object3D,mouth:THREE.Object3D){
 const authored=[first,second,head].map(bone=>({bone,rotation:bone.quaternion.clone(),additive:new THREE.Quaternion()}));
 let releaseTime=.2;const releasing=new THREE.Quaternion(),identity=new THREE.Quaternion();
 const start=new THREE.Vector3(),middle=new THREE.Vector3(),end=new THREE.Vector3(),mouthPoint=new THREE.Vector3(),offset=new THREE.Vector3(),muzzle=new THREE.Vector3(),wantedMouth=new THREE.Vector3(),wantedEnd=new THREE.Vector3(),candidateEnd=new THREE.Vector3(),candidateOffset=new THREE.Vector3(),wantedMiddle=new THREE.Vector3(),axis=new THREE.Vector3(),pole=new THREE.Vector3(),right=new THREE.Vector3(),currentDirection=new THREE.Vector3(),wantedDirection=new THREE.Vector3();
 const worldBasis=new THREE.Matrix3(),headRotation=new THREE.Quaternion(),pitchRotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),boneRotation=new THREE.Quaternion(),deltaRotation=new THREE.Quaternion(),desiredHeadRotation=new THREE.Quaternion();
 const maxPitch=THREE.MathUtils.degToRad(20);
 function rotateToward(bone:THREE.Object3D,child:THREE.Object3D,target:THREE.Vector3){
  bone.getWorldPosition(middle);child.getWorldPosition(end);currentDirection.copy(end).sub(middle).normalize();wantedDirection.copy(target).sub(middle).normalize();
  deltaRotation.setFromUnitVectors(currentDirection,wantedDirection);bone.getWorldQuaternion(boneRotation);bone.parent!.getWorldQuaternion(parentRotation);
  bone.quaternion.copy(parentRotation.invert()).multiply(deltaRotation).multiply(boneRotation).normalize();bone.updateWorldMatrix(false,true);
 }
 return {
  // AnimationMixer may skip unchanged samples. Undo our previous additive rotations
  // before sampling, otherwise a constant sip phase could accumulate an IK transform.
  restoreAuthored(){for(const item of authored)item.bone.quaternion.copy(item.rotation);},
  captureAuthored(){for(const item of authored)item.rotation.copy(item.bone.quaternion);},
  solve(localOffset:THREE.Vector3,contactActive:boolean,dt:number){
   if(!contactActive){
    // Keep the last solved pose as a rotational additive layer while the authored
    // action crossfades. Decaying the target position instead makes a raised-bowl
    // muzzle drop toward the pond datum before it rises into the carried pose.
    releaseTime=Math.min(.2,releaseTime+dt);const fade=smooth(releaseTime/.2);
    for(const item of authored)item.bone.quaternion.multiply(releasing.copy(item.additive).slerp(identity,fade)).normalize();
    delete root.userData.contactIK;return;
   }
   releaseTime=0;
   if(localOffset.lengthSq()<1e-14){for(const item of authored)item.additive.identity();delete root.userData.contactIK;return;}
   root.updateWorldMatrix(true,true);first.getWorldPosition(start);second.getWorldPosition(middle);head.getWorldPosition(end);mouth.getWorldPosition(mouthPoint);head.getWorldQuaternion(headRotation);
   const length1=start.distanceTo(middle),length2=middle.distanceTo(end),epsilon=Math.min(length1,length2)*1e-5,minReach=Math.abs(length1-length2)+epsilon,maxReach=length1+length2-epsilon;
   worldBasis.setFromMatrix4(contactRoot.matrixWorld);offset.copy(localOffset).applyMatrix3(worldBasis);wantedMouth.copy(mouthPoint).add(offset);muzzle.copy(mouthPoint).sub(end);right.setFromMatrixColumn(contactRoot.matrixWorld,0).normalize();
   const endpoint=(pitch:number)=>{pitchRotation.setFromAxisAngle(right,pitch);candidateOffset.copy(muzzle).applyQuaternion(pitchRotation);candidateEnd.copy(wantedMouth).sub(candidateOffset);return start.distanceTo(candidateEnd);};
   const violation=(distance:number)=>Math.max(0,distance-maxReach,minReach-distance);
   let pitch=0,bestError=violation(endpoint(0)),bestPitch=0;
   if(bestError>1e-8){
    let nearest=Infinity;
    for(const sign of [-1,1]){let previous=0;for(let step=1;step<=40;step++){
     const angle=sign*maxPitch*step/40,error=violation(endpoint(angle));if(error<bestError){bestError=error;bestPitch=angle;}
     if(error<=1e-8){let lo=previous,hi=angle;for(let pass=0;pass<12;pass++){const between=(lo+hi)/2;if(violation(endpoint(between))<=1e-8)hi=between;else lo=between;}if(Math.abs(hi)<nearest){nearest=Math.abs(hi);pitch=hi;}break;}
     previous=angle;
    }}
    if(nearest===Infinity)pitch=bestPitch;
   }
   endpoint(pitch);wantedEnd.copy(candidateEnd);const requestedDistance=start.distanceTo(wantedEnd),reachable=violation(requestedDistance)<1e-6;
   axis.copy(wantedEnd).sub(start).normalize();const distance=THREE.MathUtils.clamp(requestedDistance,minReach,maxReach);wantedEnd.copy(start).addScaledVector(axis,distance);
   // Source rigs use the upward/backward sagittal pole, transformed with the animal.
   pole.crossVectors(axis,right).normalize();if(pole.lengthSq()<.5)pole.setFromMatrixColumn(contactRoot.matrixWorld,1).normalize();
   const along=(length1*length1-length2*length2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,length1*length1-along*along));
   wantedMiddle.copy(start).addScaledVector(axis,along).addScaledVector(pole,height);
   desiredHeadRotation.copy(pitchRotation).multiply(headRotation);
   rotateToward(first,second,wantedMiddle);rotateToward(second,head,wantedEnd);
   head.parent!.getWorldQuaternion(parentRotation);head.quaternion.copy(parentRotation.invert()).multiply(desiredHeadRotation).normalize();root.updateWorldMatrix(true,true);mouth.getWorldPosition(mouthPoint);
   for(const item of authored)item.additive.copy(item.rotation).invert().multiply(item.bone.quaternion).normalize();
   root.userData.contactIK={reachable,errorWorld:mouthPoint.distanceTo(wantedMouth),pitchDegrees:THREE.MathUtils.radToDeg(pitch),segmentLengths:[length1,length2]};
  },
 };
}
