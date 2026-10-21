'use client';
import {positionFishingCatchArrival} from '@/lib/fishing-catch-motion';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {createYachtWorld,FISHING_RENDER_SEATS,catchDisplayScale,disposeObject} from '@/lib/fishing-world';
import {FishingCameraController} from '@/lib/fishing-camera';
import type {FishingCameraSubject} from '@/lib/fishing-camera';
import {bindFishingCameraInput,createFishingCameraGesture} from '@/lib/fishing-camera-input';
import {createFishingConfetti,FishingCatchCelebration} from '@/lib/fishing-confetti';
import {MARINE_SPECIES,getSpecies} from '@/lib/fishing-catalog';
import {FishingActionTimeline,sampleFishingAction,FISHING_HAUL_DURATION_MS} from '@/lib/fishing-action-motion';
import {FishingSeatTimeline,fishingSeatHop,selectableFishingSeats} from '@/lib/fishing-seat-motion';
import {projectFishingAmbientParticipants} from '@/lib/fishing-ambient';
import {createFishingAvatar} from '@/lib/fishing-avatar';
import {createFishingRod} from '@/lib/fishing-rod';
import {createFishingSeaLife} from '@/lib/fishing-sea-life';
import {fishingSpeech,layoutFishingSpeech,type FishingSpeechAnchor} from '@/lib/fishing-chat';
import {createFishingOwnMarker,fishingOwnMarkerRadius,fitFishingOwnMarkerRadius} from '@/lib/fishing-own-marker';
import {projectFishing} from '@/lib/fishing-types';
import type {FishingParticipant} from '@/lib/fishing-types';
import {createMarineModel,animateMarineModel} from './MarineModels';
/** A successful frame must actually draw an avatar mesh, not just an empty scene. */
function observeAvatarDraw(root:THREE.Object3D){
 let drawn=false;const restore:(()=>void)[]=[];
 root.traverseVisible(node=>{if(!(node instanceof THREE.Mesh))return;const previous=node.onAfterRender;node.onAfterRender=function(...args){previous.apply(this,args);drawn=true;};restore.push(()=>{node.onAfterRender=previous;});});
 return {get drawn(){return drawn;},restore(){for(const reset of restore)reset();}};
}
export type FishingCatchStatus='preparing'|'ready'|'error';
export type YachtSceneProps={participants:readonly FishingParticipant[];ambientParticipants?:readonly FishingParticipant[];ownId:string|null;serverOffsetMs:number;cameraMode:'overview'|'deck';reducedMotion:boolean;enabled?:boolean;seatMovementEnabled?:boolean;onMoveSeat?:(slot:number)=>Promise<unknown>;onSeatMotionChange?:(moving:boolean)=>void;onCastStart?:(castId:string)=>void;onOwnCatchStatus?:(catchId:string,status:FishingCatchStatus)=>void;prepareAvatars?:boolean;avatarRetry?:number;onAvatarStatus?:(id:string,preset:string,status:'loading'|'ready'|'error')=>void;onSceneError?:()=>void};
export default function YachtScene(props:YachtSceneProps){
 const host=useRef<HTMLDivElement>(null),labels=useRef<HTMLDivElement>(null),latest=useRef(props);const [failure,setFailure]=useState(false),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 const celebrationSession=useRef<FishingCatchCelebration|null>(null),assetRetry=useRef(0);const [avatarFailure,setAvatarFailure]=useState(false);
 useEffect(()=>{latest.current=props;},[props]);
 useEffect(()=>{if(!host.current||!labels.current)return;const element=host.current,labelRoot=labels.current;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{let active=true;queueMicrotask(()=>{if(active){setFailure(true);latest.current.onSceneError?.();}});return()=>{active=false;};}
 let alive=true,frame=0,lastFrame=0,graphicsFailed=false,rendered=false,reportedAssetFailure=false;const world=createYachtWorld(),overviewBounds=new THREE.Box3().setFromObject(world.yacht),camera=new THREE.PerspectiveCamera(35,1,.15,240);camera.position.set(18,21,27);const look=new THREE.Vector3(0,1,0),targetPos=new THREE.Vector3(),targetLook=new THREE.Vector3(),projected=new THREE.Vector3();renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.domElement.setAttribute('aria-label','碧蓝海面上的豪华游艇。船上的旅人在钓鱼，咬钩后收竿并展示渔获。拖动旋转视角，双指或滚轮缩放。');renderer.domElement.setAttribute('role','img');element.appendChild(renderer.domElement);
 const seaLife=createFishingSeaLife(world.waterHeightAt);world.scene.add(seaLife.root);
 // Fit the actual curved hull rather than the empty corners of its enclosing
 // box. The projection samples are captured once before anglers are added.
 const overviewHull:THREE.Vector3[]=[];
 const hull=world.scene.getObjectByName('Sculpted ivory hull');
 if(hull instanceof THREE.Mesh){
  const points=hull.geometry.attributes.position;
  for(let index=0;index<points.count;index++)overviewHull.push(new THREE.Vector3().fromBufferAttribute(points,index).applyMatrix4(hull.matrixWorld));
 }
 const confetti=createFishingConfetti(camera),celebration=celebrationSession.current??(celebrationSession.current=new FishingCatchCelebration());world.scene.add(camera);
 const seenCastIds=new Set<string>();let observedCastOwner:string|null|undefined,ownCatchStatus:{ownerId:string;catchId:string;status:FishingCatchStatus}|undefined;
 const catchObservation=(closeup=false)=>{const current=latest.current,self=current.participants.find(person=>person.id===current.ownId),record=self?.fishing.phase==='holding'?self.fishing.catch:undefined;return {ownerId:current.ownId,catchId:record?.id,rarity:MARINE_SPECIES.find(species=>species.id===record?.speciesId)?.rarity,closeup,visible:current.enabled!==false&&!document.hidden,reducedMotion:current.reducedMotion};};
 const interruptCelebration=()=>{confetti.stop();celebration.sample(catchObservation(),lastFrame);celebration.interrupt();const self=latest.current.participants.find(person=>person.id===latest.current.ownId);if(self?.fishing.castId)seenCastIds.add(self.fishing.castId);};
 const visibilityChanged=()=>{interruptCelebration();if(document.hidden){cancelPendingCatches();seaLife.setActive(false);}};document.addEventListener('visibilitychange',visibilityChanged);
 const cameraRig=new FishingCameraController(),cameraGesture=createFishingCameraGesture();let selectedId:string|null=null,lastCameraMode=latest.current.cameraMode,lastAvatarRetry=latest.current.avatarRetry;
 const inputEnabled=()=>alive&&!graphicsFailed&&latest.current.enabled!==false;
 const selectPerson=(id:string)=>{if(inputEnabled()&&avatars.has(id))selectedId=id;};
 const ownMarker=createFishingOwnMarker();world.yacht.add(ownMarker);
 const avatars=new Map<string,{timeline:FishingActionTimeline;seatTimeline:FishingSeatTimeline;avatar:ReturnType<typeof createFishingAvatar>;preset:string;group:THREE.Group;rod:ReturnType<typeof createFishingRod>;line:THREE.Line;bobber:THREE.Group;ring:THREE.Mesh;label:HTMLButtonElement;nameLabel:HTMLSpanElement;stateLabel:HTMLSpanElement;speechLabel:HTMLSpanElement;labelInput:ReturnType<typeof bindFishingCameraInput>;assetFailed:boolean;installed:boolean;readyNotified:boolean;attempt:number;pending?:{avatar:ReturnType<typeof createFishingAvatar>;preset:string;installed:boolean;failed:boolean;attempt:number};wasHopping:boolean;catchModel?:THREE.Group;catchId?:string;catchScale:number;catchSize:THREE.Vector3;catchGeneration:number;catchController?:AbortController;catchReadyAt?:number;catchAnimateArrival:boolean;catchRetryAt:number;catchFailures:number}>();
 const rodMaterial=new THREE.MeshStandardMaterial({color:'#25445a',roughness:.25,metalness:.55}),goldMaterial=new THREE.MeshStandardMaterial({color:'#f5ce72',metalness:.55,roughness:.3});
 const makePerson=(person:FishingParticipant)=>{const avatar=createFishingAvatar(person.preset,person.id),group=new THREE.Group();group.name=`Angler ${person.name}`;const seat=FISHING_RENDER_SEATS[person.slot];group.position.set(seat.x,seat.y,seat.z);group.rotation.y=seat.heading;group.add(avatar.root);group.visible=avatar.loaded;world.yacht.add(group);const rod=createFishingRod(rodMaterial,goldMaterial);group.add(rod);
 const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#e9f7ef',transparent:true,opacity:.85}));line.visible=false;world.scene.add(line);
 const bobber=new THREE.Group();const red=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshStandardMaterial({color:'#ff8067',roughness:.3}));bobber.add(red);const stem=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.3,8),new THREE.MeshStandardMaterial({color:'#fff7d6'}));stem.position.y=.1;bobber.add(stem);bobber.visible=false;world.scene.add(bobber);const ring=new THREE.Mesh(new THREE.RingGeometry(.32,.39,36),new THREE.MeshBasicMaterial({color:'#fff3a9',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.visible=false;world.scene.add(ring);
 const label=document.createElement('button');label.type='button';label.className='yacht-person-label';label.style.display='flex';label.style.visibility='hidden';
 const nameLabel=document.createElement('span'),stateLabel=document.createElement('span'),speechLabel=document.createElement('span');speechLabel.className='yacht-person-speech';speechLabel.style.display='none';speechLabel.style.visibility='hidden';label.appendChild(speechLabel);nameLabel.className='yacht-person-name';stateLabel.className='yacht-person-state';label.appendChild(nameLabel);label.appendChild(stateLabel);labelRoot.appendChild(label);
 const labelInput=bindFishingCameraInput(label,cameraRig,{gesture:cameraGesture,enabled:inputEnabled,windowTarget:window,documentTarget:document,onTap:()=>selectPerson(person.id)});
 // Keyboard-generated button clicks have no pointer gesture; pointer selection
 // goes through the same drag/pinch threshold as the canvas.
 label.addEventListener('click',event=>{if(event.detail===0)selectPerson(person.id);});
 const entry:NonNullable<ReturnType<typeof avatars.get>>={timeline:new FishingActionTimeline(),seatTimeline:new FishingSeatTimeline(),avatar,preset:person.preset,group,rod,line,bobber,ring,label,nameLabel,stateLabel,speechLabel,labelInput,assetFailed:false,installed:avatar.loaded,readyNotified:false,attempt:(latest.current.avatarRetry??0)+assetRetry.current,wasHopping:false,catchScale:1,catchSize:new THREE.Vector3(1,1,1),catchGeneration:0,catchAnimateArrival:false,catchRetryAt:0,catchFailures:0};avatars.set(person.id,entry);
 latest.current.onAvatarStatus?.(person.id,person.preset,'loading');
 void avatar.ready.then(()=>{if(alive&&avatars.get(person.id)===entry&&entry.avatar===avatar)entry.installed=avatar.loaded;}).catch(()=>{if(alive&&avatars.get(person.id)===entry&&entry.avatar===avatar){entry.assetFailed=true;latest.current.onAvatarStatus?.(person.id,person.preset,'error');}});return entry;};
 const reportOwnCatchStatus=(ownerId:string,catchId:string|undefined,status:FishingCatchStatus)=>{
  const current=latest.current,self=current.participants.find(person=>person.id===current.ownId);
  if(ownerId!==current.ownId||!catchId||self?.fishing.phase!=='holding'||self.fishing.catch?.id!==catchId)return;
  if(ownCatchStatus?.ownerId===ownerId&&ownCatchStatus.catchId===catchId&&ownCatchStatus.status===status)return;
  ownCatchStatus={ownerId,catchId,status};current.onOwnCatchStatus?.(catchId,status);
 };
 // A catch job belongs to one avatar, model and generation. Cancel before any
 // of those are replaced so worker completion cannot revive disposed geometry.
 const cancelCatchPreparation=(entry:NonNullable<ReturnType<typeof avatars.get>>)=>{
  entry.catchGeneration++;entry.catchController?.abort();entry.catchController=undefined;entry.catchReadyAt=undefined;entry.catchRetryAt=0;entry.catchFailures=0;
  if(entry.catchModel){entry.catchModel.visible=false;entry.catchModel.userData.supportAvatar=undefined;}
  entry.avatar.setCatchSurface(undefined);const ownerId=latest.current.ownId;if(ownerId&&avatars.get(ownerId)===entry)reportOwnCatchStatus(ownerId,entry.catchId,'preparing');
 };
 const cancelPendingCatches=()=>{for(const entry of avatars.values())if(entry.catchController)cancelCatchPreparation(entry);};
 const removeCatch=(entry:NonNullable<ReturnType<typeof avatars.get>>)=>{
  cancelCatchPreparation(entry);if(entry.catchModel){entry.group.remove(entry.catchModel);disposeObject(entry.catchModel);}
  entry.catchModel=undefined;entry.catchId=undefined;entry.catchScale=1;entry.catchSize.set(1,1,1);
 };
 const startCatchPreparation=(person:FishingParticipant,entry:NonNullable<ReturnType<typeof avatars.get>>,time:number)=>{
  const model=entry.catchModel,avatar=entry.avatar,catchId=entry.catchId;
  if(latest.current.enabled===false||document.hidden||!model||!avatar.loaded||entry.catchController||entry.catchReadyAt!==undefined||time<entry.catchRetryAt||entry.pending&&!entry.pending.failed)return;
  const controller=new AbortController(),generation=++entry.catchGeneration;entry.catchController=controller;reportOwnCatchStatus(person.id,catchId,'preparing');
  const isCurrent=()=>{
   const current=latest.current,owner=current.participants.find(p=>p.id===person.id)??(current.ambientParticipants?.some(p=>p.id===person.id)?projectFishingAmbientParticipants(Date.now()+current.serverOffsetMs).find(p=>p.id===person.id):undefined);
   return alive&&current.enabled!==false&&!document.hidden&&!controller.signal.aborted&&avatars.get(person.id)===entry&&entry.avatar===avatar&&entry.catchModel===model&&entry.catchGeneration===generation&&owner?.preset===entry.preset&&owner?.fishing.phase==='holding'&&owner.fishing.catch?.id===catchId;
  };
  const failed=()=>{if(!isCurrent())return;entry.catchController=undefined;entry.catchFailures++;entry.catchRetryAt=lastFrame+Math.min(8000,2000*2**(entry.catchFailures-1));reportOwnCatchStatus(person.id,catchId,'error');};
  try{void avatar.prepareCatchAsync(model,controller.signal).then(size=>{
   if(!isCurrent())return;entry.catchController=undefined;entry.catchSize.copy(size);entry.catchReadyAt=lastFrame-(entry.catchAnimateArrival?0:FISHING_HAUL_DURATION_MS);entry.catchFailures=0;model.userData.supportAvatar=avatar.root.uuid;reportOwnCatchStatus(person.id,catchId,'ready');
  },failed);}catch{failed();}
 };
 const replaceAvatar=(person:FishingParticipant,entry:NonNullable<ReturnType<typeof avatars.get>>)=>{
  cancelCatchPreparation(entry);entry.pending?.avatar.dispose();
  const avatar=createFishingAvatar(person.preset,person.id),pending={avatar,preset:person.preset,installed:avatar.loaded,failed:false,attempt:(latest.current.avatarRetry??0)+assetRetry.current};entry.pending=pending;
  latest.current.onAvatarStatus?.(person.id,person.preset,'loading');
  void avatar.ready.then(()=>{if(alive&&avatars.get(person.id)===entry&&entry.pending===pending)pending.installed=avatar.loaded;}).catch(()=>{if(alive&&avatars.get(person.id)===entry&&entry.pending===pending){pending.failed=true;latest.current.onAvatarStatus?.(person.id,person.preset,'error');}});
 };

 const removePerson=(id:string)=>{const entry=avatars.get(id);if(!entry)return;removeCatch(entry);entry.pending?.avatar.dispose();entry.avatar.dispose();world.yacht.remove(entry.group);world.scene.remove(entry.line,entry.bobber,entry.ring);disposeObject(entry.rod);disposeObject(entry.line);disposeObject(entry.bobber);disposeObject(entry.ring);entry.labelInput.dispose();entry.label.remove();avatars.delete(id);};
 let width=390,height=758;const resize=()=>{width=Math.max(1,element.clientWidth);height=Math.max(1,element.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.setViewOffset(width,height,0,66,width,height);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(element);resize();
 let pendingSeat:{slot:number;owner:string;generation:number}|null=null,moveGeneration=0,ownVisualMoving=false;
 const clearPendingSeat=()=>{pendingSeat=null;moveGeneration++;for(const marker of world.seatMarkers)marker.root.userData.pending=false;};
 const stopSeatMotion=()=>{
  ownMarker.visible=false;
  if(ownVisualMoving){ownVisualMoving=false;latest.current.onSeatMotionChange?.(false);}
  clearPendingSeat();for(const entry of avatars.values())entry.seatTimeline.reset();
  for(const marker of world.seatMarkers)marker.root.visible=false;
 };
 const availableSeats=(now:number)=>ownVisualMoving||!avatars.get(latest.current.ownId??'')?.installed?[]:selectableFishingSeats(latest.current.participants,latest.current.ambientParticipants??[],latest.current.ownId,now);
 const updateSeatMarkers=(time:number,now:number)=>{
  const current=latest.current,self=current.participants.find(person=>person.id===current.ownId),slots=availableSeats(now);
  if(pendingSeat&&(!self||pendingSeat.owner!==current.ownId||fishingSeatHop(self,now)||!slots.includes(pendingSeat.slot)))clearPendingSeat();
  for(const marker of world.seatMarkers){
   const pending=pendingSeat?.slot===marker.root.userData.slot;
   marker.root.visible=inputEnabled()&&!!current.onMoveSeat&&(pending||!pendingSeat&&current.seatMovementEnabled!==false&&slots.includes(marker.root.userData.slot));
   marker.root.userData.pending=Boolean(pending);
   const pulse=current.reducedMotion?0:Math.sin(time*(pending?9:2.4));
   marker.ring.scale.setScalar(pending?1.12+pulse*.035:1+pulse*.025);
   marker.ring.material.opacity=pending?1:.86+pulse*.08;
   marker.halo.material.opacity=pending?.36:.12+pulse*.04;
  }
 };
 const requestSeat=(slot:number)=>{
  const current=latest.current,now=Date.now()+current.serverOffsetMs;
  if(!inputEnabled()||current.seatMovementEnabled===false||!current.onMoveSeat||!current.ownId||pendingSeat||!availableSeats(now).includes(slot))return;
  const generation=++moveGeneration;pendingSeat={slot,owner:current.ownId,generation};
  updateSeatMarkers(lastFrame/1000,now); // Immediate feedback precedes network work.
  // Only room snapshots can move a player. Late/rejected responses cannot start
  // an old hop, resurrect an unmounted scene, or overwrite a newer selection.
  try{void Promise.resolve(current.onMoveSeat(slot)).catch(()=>{}).finally(()=>{
   if(alive&&pendingSeat?.generation===generation){clearPendingSeat();updateSeatMarkers(lastFrame/1000,Date.now()+latest.current.serverOffsetMs);}
  });}catch{clearPendingSeat();updateSeatMarkers(lastFrame/1000,now);}
 };
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 const cameraInput=bindFishingCameraInput(renderer.domElement,cameraRig,{gesture:cameraGesture,enabled:inputEnabled,windowTarget:window,documentTarget:document,onTap:position=>{
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((position.x-rect.left)/rect.width*2-1,-(position.y-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
  world.scene.updateMatrixWorld(true);
  // A shared depth-ordered raycast respects rails/cabins and occupied avatars.
  // Hidden ancestors and visually empty materials must not intercept a tap.
  for(const hit of raycaster.intersectObjects(world.yacht.children,true)){
   let visible=true;for(let object:THREE.Object3D|null=hit.object;object;object=object.parent)if(!object.visible){visible=false;break;}
   if(!visible||!(hit.object instanceof THREE.Mesh))continue;
   const materials=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material];
   if(!hit.object.userData.seatHit&&materials.every(material=>!material.visible||material.transparent&&material.opacity<=.01))continue;
   for(let object:THREE.Object3D|null=hit.object;object;object=object.parent){
    if(object.name.startsWith('Fishing station ')){requestSeat(object.userData.slot);return;}
    for(const [id,entry] of avatars)if(object===entry.group){selectPerson(id);return;}
   }
   return; // Opaque yacht structure occludes everything farther down this ray.
  }
 }});
 const contextLost=(e:Event)=>{e.preventDefault();graphicsFailed=true;interruptCelebration();stopSeatMotion();cameraInput.cancel();cancelAnimationFrame(frame);setFailure(true);latest.current.onSceneError?.();};renderer.domElement.addEventListener('webglcontextlost',contextLost);
 const lineStart=new THREE.Vector3(),lineMid=new THREE.Vector3(),lineEnd=new THREE.Vector3(),waterPoint=new THREE.Vector3(),catchPoint=new THREE.Vector3(),waterLocal=new THREE.Vector3();
 const drawFrame=(time:number)=>{
  seaLife.setActive(latest.current.enabled!==false&&!document.hidden);
  if(latest.current.enabled===false||document.hidden){interruptCelebration();cancelPendingCatches();stopSeatMotion();cameraInput.cancel();for(const entry of avatars.values())entry.labelInput.cancel();if(document.hidden||!latest.current.prepareAvatars)return;}
  if(time-lastFrame<31)return;
  const dt=Math.min(.1,(time-lastFrame)/1000||.033);lastFrame=time;
  const t=time/1000,current=latest.current,now=Date.now()+current.serverOffsetMs;
  if(!current.participants.some(person=>person.id===current.ownId&&person.fishing.phase==='holding'&&person.fishing.catch?.id===ownCatchStatus?.catchId))ownCatchStatus=undefined;
  world.animate(t,current.reducedMotion);seaLife.update(t,current.reducedMotion);

  // Ambient guests are supplied separately by the room. Only their visual clock
  // is projected locally; room-assigned positions remain authoritative.
  const ambientIds=new Set(current.ambientParticipants?.map(person=>person.id)??[]);
  const ambient=ambientIds.size?projectFishingAmbientParticipants(now).filter(person=>ambientIds.has(person.id)).map(person=>({...person,slot:current.ambientParticipants!.find(assigned=>assigned.id===person.id)!.slot})):[];
  const people=[...current.participants,...ambient];
  const ids=new Set(people.map(person=>person.id));
  if(current.cameraMode!==lastCameraMode||current.avatarRetry!==lastAvatarRetry){selectedId=null;lastCameraMode=current.cameraMode;lastAvatarRetry=current.avatarRetry;}
  if(selectedId&&!ids.has(selectedId))selectedId=null;
  const focusId=selectedId??(current.ownId&&ids.has(current.ownId)?current.ownId:null);
  for(const id of avatars.keys())if(!ids.has(id))removePerson(id);
  for(const person of people){
   if(!FISHING_RENDER_SEATS[person.slot])continue;
   const existing=avatars.get(person.id);
   if(!existing){makePerson(person);continue;}
   if(existing.pending&&existing.pending.preset!==person.preset){existing.pending.avatar.dispose();existing.pending=undefined;}
   const retryAttempt=(current.avatarRetry??0)+assetRetry.current;
   if((existing.preset!==person.preset||existing.assetFailed&&existing.attempt!==retryAttempt)&&(!existing.pending||existing.pending.failed&&existing.pending.attempt!==retryAttempt))replaceAvatar(person,existing);
   if(existing.pending?.installed&&existing.pending.avatar.loaded&&!existing.pending.failed){
    const next=existing.pending;cancelCatchPreparation(existing);existing.group.remove(existing.avatar.root);existing.avatar.dispose();existing.avatar=next.avatar;existing.preset=next.preset;
    // Put the complete replacement in the old root slot. The rod follows its
    // anchors now; the attached catch stays hidden until its new layout is ready.
    existing.group.add(next.avatar.root);existing.group.children.pop();existing.group.children.unshift(next.avatar.root);existing.pending=undefined;existing.installed=true;existing.assetFailed=false;existing.readyNotified=false;existing.attempt=next.attempt;
   }
  }
  const hasAssetFailure=[...avatars.values()].some(entry=>entry.assetFailed||entry.pending?.failed);if(hasAssetFailure!==reportedAssetFailure){reportedAssetFailure=hasAssetFailure;setAvatarFailure(hasAssetFailure);}
  let ownCatchReady=false;let ownHopping=false;ownMarker.visible=false;
  let subject:FishingCameraSubject|undefined,subjectCatchId:string|undefined,subjectCatchBounds:{width:number;height:number;depth:number}|undefined,subjectCatchCenter:THREE.Vector3|undefined;
  for(const person of people){
   const e=avatars.get(person.id);if(!e)continue;
   const state=projectFishing(person.fishing,now),holding=state.phase==='holding';
   if(e.catchModel&&(!holding||e.catchId!==state.catch?.id))removeCatch(e);
   const visible=e.installed&&e.avatar.loaded&&!e.assetFailed;e.group.visible=visible;
   if(!visible){e.rod.visible=e.line.visible=e.bobber.visible=e.ring.visible=false;if(e.catchModel)e.catchModel.visible=false;e.label.style.visibility='hidden';e.speechLabel.style.visibility='hidden';continue;}
   let pose=e.timeline.sample(state,now,time,current.reducedMotion);
   if(holding&&state.catch&&!e.catchModel){
    e.catchAnimateArrival=!pose.settled;
    const fixedCm=getSpecies(state.catch.speciesId).fixedCm;
    e.catchModel=createMarineModel(state.catch.speciesId,fixedCm);e.catchModel.visible=false;
    e.catchScale=catchDisplayScale(fixedCm);e.catchModel.scale.setScalar(e.catchScale);
    e.catchSize.copy(new THREE.Box3().setFromObject(e.catchModel).getSize(new THREE.Vector3()));
    e.group.add(e.catchModel);e.catchId=state.catch.id;
   }
   if(e.catchModel)startCatchPreparation(person,e,time);
   const catchPending=holding&&e.catchReadyAt===undefined;
   if(holding&&state.catch){
    // The full contact solve is asynchronous. Keep a bounded, visible reel in
    // the meantime, then start the actual water-to-palm arrival when it is ready.
    const haulAge=catchPending?185+(current.reducedMotion?0:Math.sin(t*5)*50):Math.max(0,time-e.catchReadyAt!);
    pose=sampleFishingAction({...state,catch:{...state.catch,caughtAt:now-haulAge}},now,catchPending?false:current.reducedMotion);
    if(catchPending)pose.settled=false;
   }
   const seat=FISHING_RENDER_SEATS[person.slot],own=person.id===current.ownId&&!ambientIds.has(person.id);
   if(own){
    if(holding)reportOwnCatchStatus(person.id,e.catchId,e.catchReadyAt!==undefined?'ready':e.catchController||!e.catchFailures?'preparing':'error');
    const castId=state.castId;
    if(observedCastOwner!==person.id){observedCastOwner=person.id;if(castId)seenCastIds.add(castId);}
    if(castId&&!seenCastIds.has(castId)&&(pose.stage==='windup'||pose.stage==='cast'||current.reducedMotion&&state.phase==='waiting')){seenCastIds.add(castId);if(seenCastIds.size>64)seenCastIds.delete(seenCastIds.values().next().value!);current.onCastStart?.(castId);}
    ownCatchReady=holding&&!catchPending&&pose.settled&&e.avatar.loaded&&!e.assetFailed;
   }
   const showcase=pose.showcaseProgress,moving=current.reducedMotion?1:1-Math.exp(-dt*5);
   const targetX=THREE.MathUtils.lerp(seat.x,Math.sign(seat.x)*1.5,showcase);
   const hop=e.seatTimeline.sample(person,now,current.reducedMotion);
   if(own&&hop)ownHopping=true;
   const facing=THREE.MathUtils.lerp(seat.heading,0,showcase);
   if(hop){
    e.group.position.set(hop.x,hop.y,hop.z);e.group.rotation.y=hop.heading;e.group.scale.set(1/Math.sqrt(hop.scaleY),hop.scaleY,1/Math.sqrt(hop.scaleY));
   }else{
    if(e.wasHopping){e.group.position.set(targetX,seat.y,seat.z);e.group.rotation.y=facing;}
    else{e.group.position.lerp(targetPos.set(targetX,seat.y,seat.z),moving);e.group.rotation.y+=Math.atan2(Math.sin(facing-e.group.rotation.y),Math.cos(facing-e.group.rotation.y))*moving;}
    e.group.scale.set(1,1,1);
   }
   e.wasHopping=Boolean(hop);
   if(own){ownMarker.visible=e.avatar.loaded&&!e.assetFailed&&e.avatar.root.visible&&!hop?.changingDeck;ownMarker.position.set(e.group.position.x,(hop?.groundY??seat.y)+.018,e.group.position.z);ownMarker.scale.setScalar(fishingOwnMarkerRadius(e.avatar.footprintRadius));}
   const speech=ambientIds.has(person.id)?null:fishingSpeech(person,now);
   const speechText=speech?.text??'',speechDisplay=speech?'block':'none',speechClass=`yacht-person-speech${speech?.kind==='emote'?' is-emote':''}`;
   if(e.speechLabel.textContent!==speechText)e.speechLabel.textContent=speechText;
   if(e.speechLabel.style.display!==speechDisplay)e.speechLabel.style.display=speechDisplay;
   if(e.speechLabel.className!==speechClass)e.speechLabel.className=speechClass;
   e.avatar.updateFishing(t,state.phase,current.reducedMotion,e.catchScale*1.6,pose,hop?.progress,e.catchSize);
   const h=e.avatar.height;
   e.rod.updateRestPose(pose.restProgress);e.rod.position.copy(e.avatar.rodPosition);e.rod.quaternion.copy(e.avatar.rodQuaternion);e.rod.visible=pose.rodVisible;
   e.group.updateWorldMatrix(true,true);
   lineStart.copy(e.rod.tip);e.rod.localToWorld(lineStart);
   const side=Math.sign(seat.x),waveTime=current.reducedMotion?0:t;
   waterPoint.set(seat.x+side*4.2,0,seat.z+.7);world.yacht.localToWorld(waterPoint);
   waterPoint.y=world.waterHeightAt(waterPoint.x,waterPoint.z,t,current.reducedMotion)+.085;
   if(state.phase==='bite')waterPoint.y-=Math.abs(Math.sin(waveTime*12))*.14;
   lineEnd.copy(lineStart).lerp(waterPoint,pose.castFlight);
   lineEnd.y+=Math.sin(pose.castFlight*Math.PI)*1.8;
   e.bobber.position.copy(lineEnd);
   const waiting=state.phase==='waiting'||state.phase==='bite';
   e.bobber.visible=waiting;e.ring.visible=waiting&&pose.castFlight>=1;e.line.visible=pose.lineVisible;
   e.ring.position.copy(waterPoint);e.ring.position.y=world.waterHeightAt(waterPoint.x,waterPoint.z,t,current.reducedMotion)+.025;
   e.ring.scale.setScalar(state.phase==='bite'?1.4+Math.sin(waveTime*9)*.5:.7+Math.sin(waveTime*2)*.08);
   (e.ring.material as THREE.MeshBasicMaterial).color.set(state.phase==='bite'?'#ffe781':'#d6ffff');
   (e.ring.material as THREE.MeshBasicMaterial).opacity=state.phase==='bite'?.8:.3;
   if(e.catchModel&&e.catchReadyAt!==undefined&&e.avatar.positionCatchReady(catchPoint)){
    // Cached worker output only: a rendering frame can never invoke the solve.
    waterLocal.copy(waterPoint);e.group.worldToLocal(waterLocal);
    positionFishingCatchArrival(e.catchModel.position,waterLocal,catchPoint,e.catchSize,pose.haulProgress,e.avatar.catchApproachDirection);
    lineEnd.copy(e.catchModel.position);e.group.localToWorld(lineEnd);
    e.catchModel.visible=pose.catchVisible;
    animateMarineModel(e.catchModel,waveTime,pose.haulProgress);
    // Only the fish's authored fins/tail move. A root wobble would move the
    // supporting surface out of the real palms after the contact solve.
   }
   lineMid.copy(lineStart).lerp(lineEnd,.5);lineMid.y-=waiting?.25:.1;
   const positions=e.line.geometry.attributes.position as THREE.BufferAttribute;
   positions.setXYZ(0,lineStart.x,lineStart.y,lineStart.z);positions.setXYZ(1,lineMid.x,lineMid.y,lineMid.z);positions.setXYZ(2,lineEnd.x,lineEnd.y,lineEnd.z);
   positions.needsUpdate=true;e.line.geometry.computeBoundingSphere();
   if(person.id===focusId){
    subject={id:person.id,position:e.group.getWorldPosition(new THREE.Vector3()),height:h,width:e.avatar.footprintRadius*2};
    if(holding&&e.catchModel?.visible&&(selectedId!==null||showcase>0)){
     subjectCatchId=state.catch?.id;
     // Actual transformed geometry includes yacht roll, the haul and fish size;
     // fitting its union avoids assumptions about a giant catch's offset.
     e.group.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(e.avatar.root).union(new THREE.Box3().setFromObject(e.catchModel));
     const size=bounds.getSize(new THREE.Vector3());subjectCatchCenter=bounds.getCenter(new THREE.Vector3());subjectCatchBounds={width:size.x+.3,height:size.y+.35,depth:size.z+.3};
    }
   }
   if(e.nameLabel.textContent!==person.name)e.nameLabel.textContent=person.name;
   const stateText=e.assetFailed?'形象加载失败':hop?'换个钓位':state.phase==='bite'?'咬钩！':state.phase==='holding'?(catchPending?(e.catchFailures?'正在重试渔获':'收线中…'):'钓到了'):state.phase==='waiting'?'垂钓中':state.phase==='escaped'?'鱼跑掉了':'休息中';
   if(e.stateLabel.textContent!==stateText)e.stateLabel.textContent=stateText;
   const focused=person.id===focusId&&(selectedId!==null||current.cameraMode==='deck');
   e.label.setAttribute('aria-pressed',String(focused));e.label.setAttribute('aria-label',`围绕${person.name}观看，${e.stateLabel.textContent}`);
   e.label.className=`yacht-person-label${own?' own':''}${state.phase==='bite'?' bite':''}${focused?' selected':''}${e.assetFailed?' asset-failed':''}`;
  }
 if(ownVisualMoving!==ownHopping){ownVisualMoving=ownHopping;current.onSeatMotionChange?.(ownHopping);}
 updateSeatMarkers(t,now);
 const cameraPose=cameraRig.update({overviewBounds,overviewHull,mode:selectedId?'deck':subject?current.cameraMode:'overview',subject,autoReveal:selectedId===null,catchId:subjectCatchId,catchBounds:subjectCatchBounds,catchCenter:subjectCatchCenter},camera.fov,width/height);
 const viewOffset=selectedId||current.cameraMode==='deck'?24:66;
 if(camera.view?.offsetY!==viewOffset){camera.setViewOffset(width,height,0,viewOffset,width,height);camera.updateProjectionMatrix();}
 targetPos.set(cameraPose.position.x,cameraPose.position.y,cameraPose.position.z);targetLook.set(cameraPose.target.x,cameraPose.target.y,cameraPose.target.z);
 camera.position.lerp(targetPos,current.reducedMotion?1:1-Math.exp(-dt*3.5));look.lerp(targetLook,current.reducedMotion?1:1-Math.exp(-dt*3.5));camera.lookAt(look);camera.updateMatrixWorld();
 if(ownMarker.visible){
  ownMarker.updateWorldMatrix(true,false);let minX=Infinity,maxX=-Infinity;
  for(let i=0;i<16;i++){projected.set(Math.cos(i*Math.PI/8),0,Math.sin(i*Math.PI/8));ownMarker.localToWorld(projected);projected.project(camera);const px=(projected.x*.5+.5)*width;minX=Math.min(minX,px);maxX=Math.max(maxX,px);}
  ownMarker.scale.setScalar(fitFishingOwnMarkerRadius(ownMarker.scale.x,maxX-minX));
 }
 // Read untransformed layout dimensions together, before any projection writes.
 // Culling uses visibility, so off-screen labels retain measurable layout and
 // captured label gestures never briefly lose their target to display:none.
 const measured=people.flatMap(person=>{
  const e=avatars.get(person.id);if(!e||!e.group.visible)return [];
  const speech=ambientIds.has(person.id)?null:fishingSpeech(person,now);
  // Emote fallbacks include the shared bubble padding; DOM measurements win.
  const speechWidth=speech?(e.speechLabel.offsetWidth||(speech.kind==='emote'?66:Math.min(184,[...speech.text].length*12+24))):0;
  const speechHeight=speech?(e.speechLabel.offsetHeight||(speech.kind==='emote'?58:Math.ceil([...speech.text].length*12/160)*17+16)):0;
  const speechGap=speech&&e.label.offsetHeight?e.label.offsetHeight-e.speechLabel.offsetTop-speechHeight:37;
  return [{person,e,speech,speechWidth,speechHeight,speechGap}];
 });
 const speechAnchors:FishingSpeechAnchor[]=[];
 for(const {person,e,speech,speechWidth,speechHeight,speechGap} of measured){
  projected.set(0,e.avatar.height+.27,0);e.group.localToWorld(projected);projected.project(camera);
  let x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
  const inFront=Number.isFinite(x)&&Number.isFinite(y)&&projected.z>=-1&&projected.z<=1;
  // A close-up can put the head above the HUD; live own speech gets a bounded
  // overlay anchor rather than changing the camera. Peers remain culled.
  if(inFront&&speech&&person.id===current.ownId){
   const halfWidth=Math.min(speechWidth,width-24)/2;
   x=THREE.MathUtils.clamp(x,12+halfWidth,width-12-halfWidth);
   y=THREE.MathUtils.clamp(y,140+speechHeight+speechGap,height-190);
  }
  const visible=inFront&&x>=0&&x<=width&&y>=140&&y<=height-190;
  // Keep subpixel coordinates in the same frame as WebGL. CSS must never
  // interpolate this transform using the shared 180 ms button transition.
  if(inFront)e.label.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
  const visibility=visible?'visible':'hidden';
  if(e.label.style.visibility!==visibility)e.label.style.visibility=visibility;
  if(speech&&visible)speechAnchors.push({id:person.id,x,y:y-speechGap,width:speechWidth,height:speechHeight,priority:(person.id===current.ownId?1e15:0)+(person.emote?.createdAt??person.chat?.createdAt??0)});
 }
 const speechLayouts=new Map(layoutFishingSpeech(speechAnchors,width,140,height-200).map(layout=>[layout.id,layout]));
 for(const {person,e} of measured){
  const layout=speechLayouts.get(person.id),visibility=layout?.visible?'visible':'hidden';
  // Commit each bubble only once. A visible child otherwise overrides its
  // hidden parent's CSS visibility, so culled peers explicitly stay hidden.
  if(e.speechLabel.style.visibility!==visibility)e.speechLabel.style.visibility=visibility;
  if(layout?.visible)e.speechLabel.style.transform=`translate(${layout.offsetX}px,${-layout.lift}px)`;
 }

 const celebratingOwn=focusId===current.ownId&&cameraRig.isCatchCloseup&&ownCatchReady;
 const celebrationRarity=celebration.sample(catchObservation(celebratingOwn),time);
 if(current.reducedMotion||!celebratingOwn)confetti.stop();
 if(celebrationRarity)confetti.start(celebrationRarity,time);
 confetti.update(time,width,height);
 const receipts=people.flatMap(person=>{const entry=avatars.get(person.id);return entry?.group.visible&&entry.installed&&!entry.readyNotified&&entry.preset===person.preset?[{person,entry,draw:observeAvatarDraw(entry.avatar.root)}]:[];});
 try{renderer.render(world.scene,camera);}finally{for(const receipt of receipts)receipt.draw.restore();}
 // Load/install promises and off-screen roots are insufficient: acknowledge
 // only a real avatar mesh draw, with its solved accessories in this frame.
 for(const {person,entry,draw} of receipts)if(draw.drawn){entry.readyNotified=true;current.onAvatarStatus?.(person.id,entry.preset,'ready');}
 if(!rendered){rendered=true;setLoading(false);setFailure(false);}
 };const draw=(time:number)=>{if(!alive||graphicsFailed)return;try{drawFrame(time);}catch{graphicsFailed=true;interruptCelebration();stopSeatMotion();cameraInput.cancel();setFailure(true);latest.current.onSceneError?.();}if(!graphicsFailed)frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);return()=>{alive=false;celebration.interrupt();confetti.dispose();document.removeEventListener('visibilitychange',visibilityChanged);stopSeatMotion();cancelAnimationFrame(frame);observer.disconnect();for(const id of [...avatars.keys()])removePerson(id);cameraInput.dispose();renderer.domElement.removeEventListener('webglcontextlost',contextLost);seaLife.dispose();world.dispose();rodMaterial.dispose();goldMaterial.dispose();renderer.dispose();renderer.domElement.remove();};
 // Renderer lifecycle only. Latest data is kept in a ref, avoiding canvas recreation.
 },[retry]);
 return <div className="yacht-scene"><div ref={host} className="yacht-canvas"/><div ref={labels} className="yacht-labels"/>{loading&&!failure&&<div className="yacht-loading"><span/><p>海风正在赶来…</p></div>}{avatarFailure&&!failure&&<div className="yacht-avatar-failure" role="status"><span>有分身暂时没能加载</span><button type="button" onClick={()=>{assetRetry.current++;}}>重试分身</button></div>}{failure&&<div className="yacht-failure"><strong>海面暂时没能展开</strong><p>3D 画面加载失败，渔获和背包仍会保留。</p><button onClick={()=>{setFailure(false);setAvatarFailure(false);setLoading(true);setRetry(n=>n+1);}}>重新加载画面</button></div>}</div>;
}
