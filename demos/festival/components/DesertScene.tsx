'use client';
import { resolveAvatarPreset } from '@/lib/room-types';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { createFestivalBuilderAvatar } from '@/lib/festival-builder-avatar';
import { artworkFocusDistance, nameplateLayout, fitNameplateText, intersectVisibleArtwork } from '@/src/desert/artwork-focus';
import { speechBubbleLayout, speechBubbleFont, festivalBubbleContent } from '@/src/desert/speech-bubble';
import { createFestivalAvatarHeadAnchor, FESTIVAL_AVATAR_SCENE_SCALE } from '@/src/desert/avatar-head-anchor';
import { configureScreenSpaceText } from '@/src/desert/screen-space-text';
import { createClubAvatar, type ClubAvatar } from '@/lib/club-avatar-rig';
import { FESTIVAL_MONUMENT_RADIUS, FESTIVAL_MOVE_SPEED, FESTIVAL_INSTALLATION_RADII, getFestivalPlacementIssue, festivalPlacementMessage, type FestivalSnapshot, type FestivalLighting } from '@/lib/festival-types';
import { festivalSceneState } from '@/lib/festival-ambient';
import { selectFestivalMovement, stepFestivalMotion, type FestivalPrediction, type FestivalRenderedSelf, type FestivalVisualMotion } from '@/lib/festival-motion';
import { createDesertEnvironment } from '@/src/desert/environment';
import { festivalCeremonyAt, FESTIVAL_PHOTO_PEAK_SECONDS, FESTIVAL_PHOTO_LAST_SECONDS } from '@/src/desert/ceremony';
import { createFestivalCeremonyEffects } from '@/src/desert/ceremony-effects';
import { createFestivalCelebrationAvatar } from '@/src/desert/celebration-avatar';
import { captureFestivalCeremonyPhoto } from '@/src/desert/ceremony-capture';
import type { CelebrationPhoto } from '@/lib/celebration-photo';
import { createDesertFire, type DesertFire } from '@/src/desert/fire';
import { createDesertSmoke, type DesertSmoke } from '@/src/desert/smoke';
import { createInstallation, disposeInstallation, updateInstallationAnimation } from '@/src/desert/installations';
import { createArtworkLighting } from '@/src/desert/artwork-lighting';
import { createInstallationConstruction, type InstallationConstruction } from '@/src/desert/construction';
import { createFestivalSelfMarker } from '@/src/desert/self-marker';
import { createPlacementPreview } from '@/src/desert/placement-preview';
import { INSTALLATION_CONSTRUCTION_MS, installationConstruction, installationBurn, smoothstep, shaderTimeSeconds } from '@/src/desert/visual-math';

export type DesertView = 'vista'|'follow'|'aerial';
export interface DesertStick {x:number;y:number;active:boolean}
interface Props {
 snapshot:FestivalSnapshot|null; getSnapshot:()=>FestivalSnapshot|null; serverTime:()=>number; selectedKind:number|null;
 active:boolean;ownMarkerEnabled?:boolean;view:DesertView; focusVersion:number; movementVersion:MutableRefObject<number>; joystick:MutableRefObject<DesertStick>;prediction:MutableRefObject<FestivalPrediction|null>;renderedSelf:MutableRefObject<FestivalRenderedSelf|null>;
 onCelebrationPhoto?:(photo:CelebrationPhoto)=>void;
 onMove:(x:number,z:number)=>boolean;onPlace:(x:number,z:number)=>void;onMessage:(text:string)=>void;
}
interface PersonVisual { avatar:ClubAvatar; headAnchor:ReturnType<typeof createFestivalAvatarHeadAnchor>; builder:ReturnType<typeof createFestivalBuilderAvatar>; celebration:ReturnType<typeof createFestivalCelebrationAvatar>; label:THREE.Sprite; labelKey:string; labelSelf:boolean; bubble:THREE.Sprite; bubbleKey:string; shadow:THREE.Mesh; }
interface ArtVisual {root:THREE.Group;lighting:ReturnType<typeof createArtworkLighting>;intrinsicLighting:FestivalLighting;construction:InstallationConstruction;fire:DesertFire;smoke:DesertSmoke;ash:THREE.Mesh;materials:{material:THREE.MeshStandardMaterial;color:THREE.Color;emissive:THREE.Color;intensity:number}[]; parts:{node:THREE.Object3D;y:number;rotation:THREE.Euler}[];}
function textSprite(text:string,bubble=false,self=false){
 const canvas=document.createElement('canvas');const measure=canvas.getContext('2d')!;measure.font=bubble?speechBubbleFont(text):'400 48px "PingFang SC", "Microsoft YaHei", Arial';
 const labelText=bubble?text:fitNameplateText(text,value=>measure.measureText(value).width);
 const speech=bubble?speechBubbleLayout(text,value=>measure.measureText(value).width):null;
 const layout=speech??nameplateLayout(measure.measureText(labelText).width);canvas.width=layout.width;canvas.height=layout.height;
 const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
 const w=canvas.width,h=canvas.height;
 // Speech retains the white rounded plate and tail; nicknames stay light,
 // unboxed text with a subtle shadow against the desert scenery.
 if(bubble){
  ctx.fillStyle='rgba(255,255,255,.9)';
  ctx.beginPath();ctx.roundRect(4,4,w-8,h-25,Math.min(24,(w-8)/2));ctx.fill();
  ctx.beginPath();ctx.moveTo(w/2-17,h-25);ctx.lineTo(w/2,h-3);ctx.lineTo(w/2+17,h-25);ctx.fill();
 }else{ctx.shadowColor='rgba(20,14,10,.45)';ctx.shadowBlur=6;ctx.shadowOffsetY=2;}
 ctx.fillStyle=bubble?'#44332a':self?'#fff':'#fff0cc';ctx.font=bubble?speechBubbleFont(text):'400 48px "PingFang SC", "Microsoft YaHei", Arial';ctx.textAlign='center';ctx.textBaseline='middle';
 if(speech){
  // Center visible glyph ink within the rounded body (y=4 through h-21),
  // not the font em box or the full canvas that also includes the lower tail.
  ctx.textBaseline='alphabetic';
  const fontSize=Number(ctx.font.match(/(\d+)px/)?.[1]??34);
  if(speech.lineHeight===80){
   // A single emoji is one grapheme (including ❤️'s variation selector).
   // Color fonts can report the padded bitmap box instead of painted pixels.
   const ink=emojiInkCenter(text,ctx.font,fontSize),metrics=ctx.measureText(text);
   const left=metrics.actualBoundingBoxLeft,right=metrics.actualBoundingBoxRight;
   const ascent=metrics.actualBoundingBoxAscent,descent=metrics.actualBoundingBoxDescent;
   const validX=Number.isFinite(left)&&Number.isFinite(right)&&left+right>0;
   const validY=Number.isFinite(ascent)&&Number.isFinite(descent)&&ascent+descent>0;
   const centerX=ink?.x??(validX?(right-left)/2:0);
   const centerY=ink?.y??(validY?(descent-ascent)/2:-fontSize*.3);
   ctx.fillText(text,w/2-centerX,(h-17)/2-centerY);
  }else{
   const bounds=speech.lines.map((line,i)=>{
    const metrics=ctx.measureText(line);
    return {top:i*speech.lineHeight-(metrics.actualBoundingBoxAscent??fontSize*.8),bottom:i*speech.lineHeight+(metrics.actualBoundingBoxDescent??fontSize*.2)};
   });
   const inkTop=Math.min(...bounds.map(bound=>bound.top)),inkBottom=Math.max(...bounds.map(bound=>bound.bottom));
   const baseline=(h-17-inkTop-inkBottom)/2;
   for(let i=0;i<speech.lines.length;i++)ctx.fillText(speech.lines[i],w/2,baseline+i*speech.lineHeight);
  }
 }else ctx.fillText(labelText,w/2,h/2);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
 sprite.userData.festivalSpeechBubble=bubble;
 // High-resolution canvas glyphs become 12px names / 11.56px speech, with
 // a 21.76px single emoji. Screen sizing stays constant at every camera distance.
 const pixels=bubble?.34:.25;configureScreenSpaceText(sprite,w*pixels,h*pixels,bubble?23:0);sprite.renderOrder=bubble?12:self?11:10;return sprite;
}
/** Read only the emoji's transparent probe, never the white plate or tail. */
function emojiInkCenter(text:string,font:string,fontSize:number):{x:number;y:number}|null{
 const probe=document.createElement('canvas'),ctx=probe.getContext('2d',{willReadFrequently:true});
 if(!ctx||typeof ctx.getImageData!=='function')return null;
 const size=Math.ceil(fontSize*4),origin=size/2;probe.width=size;probe.height=size;
 ctx.font=font;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText(text,origin,origin);
 try{
  const {data}=ctx.getImageData(0,0,size,size);let left=size,top=size,right=-1,bottom=-1;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(data[(y*size+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  // Empty or clipped probes cannot provide trustworthy glyph bounds.
  if(right<left||left===0||top===0||right===size-1||bottom===size-1)return null;
  return {x:(left+right+1)/2-origin,y:(top+bottom+1)/2-origin};
 }catch{return null;}
}
function disposeSprite(sprite:THREE.Sprite){sprite.material.map?.dispose();sprite.material.dispose();sprite.removeFromParent();}
function replaceText(sprite:THREE.Sprite,text:string,bubble:boolean,self=false){const replacement=textSprite(text,bubble,self);sprite.material.map?.dispose();sprite.material.dispose();sprite.material=replacement.material;const {width,height,bottomOffset}=replacement.userData.screenSpaceText;configureScreenSpaceText(sprite,width,height,bottomOffset);}

export default function DesertScene(props:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(props),photoRounds=useRef(new Set<number>()),photoAttempts=useRef(new Map<number,{count:number;at:number}>());
 const [status,setStatus]=useState<'loading'|'ready'|'failed'>('loading');const [retry,setRetry]=useState(0);
 useEffect(()=>{latest.current=props;},[props]);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  let alive=true,failed=false,frame=0,renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{queueMicrotask(()=>setStatus('failed'));return;}
  const failScene=(error?:unknown)=>{failed=true;cancelAnimationFrame(frame);if(error)console.error('[desert-scene] Render failure',error);queueMicrotask(()=>{if(alive)setStatus('failed');});};
  renderer.debug.onShaderError=()=>failScene(new Error('A scene shader could not compile.'));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));renderer.setSize(390,758);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.domElement.setAttribute('aria-label','实时共享荒原。点击地面行走，拖动改变视角。创作时点击任意可用地面放置作品。');renderer.domElement.setAttribute('role','img');renderer.domElement.tabIndex=0;element.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc39275);scene.fog=null;
  const world=createDesertEnvironment();scene.add(world.root);
  const monumentFocusId='festival:central-monument';
  const monumentHeight=new THREE.Box3().setFromObject(world.monument).getSize(new THREE.Vector3()).y;
  const ceremonyEffects=createFestivalCeremonyEffects(Math.min(window.devicePixelRatio||1,1.65));scene.add(ceremonyEffects.root);
  const hemisphere=new THREE.HemisphereLight(0xffd4a4,0x736b7d,2.3);scene.add(hemisphere);
  const daySky=new THREE.Color(0xffd4a4),nightSky=new THREE.Color(0x91b3df),dayGround=new THREE.Color(0x736b7d),nightGround=new THREE.Color(0x253b59),daySun=new THREE.Color(0xffd2a0),nightSun=new THREE.Color(0xa6c5f0);
  const sun=new THREE.DirectionalLight(0xffd2a0,3.4);sun.position.set(-65,65,-50);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-72;sun.shadow.camera.right=72;sun.shadow.camera.top=72;sun.shadow.camera.bottom=-72;sun.shadow.camera.near=1;sun.shadow.camera.far=200;sun.shadow.bias=-.00035;sun.shadow.normalBias=.13;scene.add(sun);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const reflectionScene=new THREE.Scene();reflectionScene.background=new THREE.Color(0xc59b80);
  const sky=world.root.getObjectByName('dusk-sky');if(sky)reflectionScene.add(sky.clone());
  const reflections=pmrem.fromScene(reflectionScene,.07,.5,1600,{size:128});scene.environment=reflections.texture;scene.environmentIntensity=.48;pmrem.dispose();
  const glow=new THREE.PointLight(0xff9b4a,0,100,2);glow.position.set(0,12,10);scene.add(glow);
  const camera=new THREE.PerspectiveCamera(55,390/758,.25,1600);camera.position.set(48,35,86);
  const target=new THREE.Vector3(0,8,0),desiredTarget=new THREE.Vector3(),desiredPosition=new THREE.Vector3();
  let orbitYaw=.50,orbitPitch=.38,orbitDistance=102,lastView:DesertView='vista',lastFocus=-1,lastTime=performance.now(),lastMove=0,lastShadow=0,previousRound=-1;
  let artworkFocus:string|null=null,pendingOwnFocus:string|null=null,observedOwnTask:string|null=null,taskBaseline=false,lastSceneNow=0;
  let lastMovementAt=-Infinity,followingMovement=false,lastMovement=latest.current.movementVersion.current;
  let down:{x:number;y:number;px:number;py:number;at:number;pointer:number}|null=null,dragged=false,lastGround:THREE.Vector3|null=null;
  const touchPoints=new Map<number,{x:number;y:number}>();let pinchDistance=0;
  const touchDistance=()=>{const [a,b]=[...touchPoints.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
  const people=new Map<string,PersonVisual>(),arts=new Map<string,ArtVisual>();
  const selfMarker=createFestivalSelfMarker();scene.add(selfMarker.root);
  const motions=new Map<string,FestivalVisualMotion>(),motionIdentities=new Map<string,number>();
  const charcoalColor=new THREE.Color(0x211a17),emberColor=new THREE.Color(0x9c2105);
  const placementPreview=createPlacementPreview(),placement=placementPreview.root;scene.add(placement);
  const destination=new THREE.Mesh(new THREE.RingGeometry(.5,.66,32),new THREE.MeshBasicMaterial({color:0xffe4a3,transparent:true,opacity:.7,depthWrite:false}));destination.rotation.x=-Math.PI/2;destination.visible=false;scene.add(destination);let destinationAt=0;
  const followOwnMovement=()=>{
   artworkFocus=null;pendingOwnFocus=null;followingMovement=true;lastMovementAt=latest.current.serverTime();
   const snapshot=latest.current.getSnapshot();observedOwnTask=snapshot?.participants.find(p=>p.id===snapshot.self.id)?.buildTask?.installationId??null;
   lastMovement=latest.current.movementVersion.current;
  };
  const moveOwnAvatar=(x:number,z:number)=>{if(!latest.current.onMove(x,z))return false;followOwnMovement();return true;};
  const focusArtwork=(id:string,builder?:{x:number;z:number})=>{const root=id===monumentFocusId?world.monument:arts.get(id)?.root;if(!root)return;artworkFocus=id;pendingOwnFocus=null;orbitPitch=.30;if(builder)orbitYaw=Math.atan2(builder.x-root.position.x,builder.z-root.position.z);orbitDistance=artworkFocusDistance(Number(root.userData.radius??6)+(builder?3:0),id===monumentFocusId?monumentHeight:Number(root.userData.height??12),camera.fov,camera.aspect);};
  const resize=()=>{const w=element.clientWidth||390,h=element.clientHeight||758;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(artworkFocus)focusArtwork(artworkFocus);};resize();const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(element);
  const groundPoint=(event:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);return raycaster.ray.intersectPlane(plane,hit)?hit.clone():null;};
  const onDown=(event:PointerEvent)=>{
   if(event.pointerType==='touch'){touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});renderer.domElement.setPointerCapture(event.pointerId);if(touchPoints.size>1){pinchDistance=touchDistance();down=null;dragged=true;pendingOwnFocus=null;return;}}
   if(event.button!==0||!event.isPrimary)return;lastGround=groundPoint(event);down={x:event.clientX,y:event.clientY,px:event.clientX,py:event.clientY,at:performance.now(),pointer:event.pointerId};dragged=false;renderer.domElement.setPointerCapture(event.pointerId);};
  const onMove=(event:PointerEvent)=>{
   lastGround=groundPoint(event);
   if(touchPoints.has(event.pointerId)){touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});if(touchPoints.size>1){const distance=touchDistance();if(distance>0&&pinchDistance>0)orbitDistance=THREE.MathUtils.clamp(orbitDistance*pinchDistance/distance,24,290);pinchDistance=distance;return;}}
   if(!down||event.pointerId!==down.pointer)return;
   const dx=event.clientX-down.px,dy=event.clientY-down.py;down.px=event.clientX;down.py=event.clientY;
   if(Math.hypot(event.clientX-down.x,event.clientY-down.y)>7)dragged=true;
   if(dragged){pendingOwnFocus=null;orbitYaw-=dx*.006;orbitPitch=THREE.MathUtils.clamp(orbitPitch+dy*.003,.20,1.18);}
  };
  const onUp=(event:PointerEvent)=>{
   touchPoints.delete(event.pointerId);if(touchPoints.size<2)pinchDistance=0;
   if(!down||down.pointer!==event.pointerId)return;
   if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
   const isClick=!dragged&&performance.now()-down.at<600;down=null;if(!isClick)return;
   const point=groundPoint(event);const current=latest.current,snapshot=current.getSnapshot();
   if(current.selectedKind===null){
    let picked:string|null=null,nearest=Infinity;
    for(const[id,art]of arts){const intersection=intersectVisibleArtwork(raycaster,art.root,art.construction.seconds.value,art.root.visible);if(intersection&&intersection.distance<nearest){picked=id;nearest=intersection.distance;}}
    const monumentHit=intersectVisibleArtwork(raycaster,world.monument,20,world.monument.visible);
    if(monumentHit&&monumentHit.distance<nearest)picked=monumentFocusId;
    if(picked){focusArtwork(picked);return;}
   }
   if(!point)return;
   if(current.selectedKind!==null){
    if(!snapshot||current.serverTime()>=snapshot.round.burnAt){current.onMessage('火焰结束后，下一轮再一起创作');return;}
    const now=current.serverTime(),visualState=festivalSceneState(snapshot,now);
    const issue=getFestivalPlacementIssue(current.selectedKind,point.x,point.z,visualState.installations,visualState.participants,now);
    if(issue){current.onMessage(festivalPlacementMessage(issue));return;}
    current.onPlace(point.x,point.z);return;
   }
   if(snapshot?.self.role!=='participant'){current.onMessage('先进入荒原，再点击地面漫游');return;}
   if(Math.hypot(point.x,point.z)>79){current.onMessage('太远了，试试更近的地方，或切换俯瞰视角');return;}
   if(Math.hypot(point.x,point.z)<FESTIVAL_MONUMENT_RADIUS){current.onMessage('中央雕塑是地标，沿环形步道绕行吧');return;}
   if(!moveOwnAvatar(point.x,point.z))return;destination.position.set(point.x,.10,point.z);destination.visible=true;destinationAt=performance.now();
  };
  const onCancel=(event:PointerEvent)=>{touchPoints.delete(event.pointerId);pinchDistance=0;down=null;};
  const onWheel=(event:WheelEvent)=>{event.preventDefault();pendingOwnFocus=null;orbitDistance=THREE.MathUtils.clamp(orbitDistance+event.deltaY*.07,24,290);};
  const onContextLost=(event:Event)=>{event.preventDefault();failScene();};
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointermove',onMove);renderer.domElement.addEventListener('pointerup',onUp);renderer.domElement.addEventListener('pointercancel',onCancel);renderer.domElement.addEventListener('wheel',onWheel,{passive:false});renderer.domElement.addEventListener('webglcontextlost',onContextLost);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const removeArt=(id:string,art:ArtVisual)=>{if(artworkFocus===id)artworkFocus=null;if(pendingOwnFocus===id)pendingOwnFocus=null;art.lighting.dispose();art.construction.dispose();disposeInstallation(art.root);art.fire.dispose();art.smoke.dispose();art.ash.geometry.dispose();(art.ash.material as THREE.Material).dispose();art.ash.removeFromParent();arts.delete(id);};
  const removePerson=(id:string,item:PersonVisual)=>{item.builder.dispose();item.celebration.dispose();item.avatar.dispose();disposeSprite(item.label);disposeSprite(item.bubble);item.shadow.geometry.dispose();(item.shadow.material as THREE.Material).dispose();item.shadow.removeFromParent();people.delete(id);};
  const animate=()=>{
   if(!alive||failed)return;if(!latest.current.active||document.visibilityState!=='visible'){lastTime=performance.now();frame=requestAnimationFrame(animate);return;}try{const nowPerf=performance.now(),dt=Math.min(.06,(nowPerf-lastTime)/1000);lastTime=nowPerf;
   const current=latest.current,snapshot=current.getSnapshot(),now=current.serverTime();const seconds=shaderTimeSeconds(now),resuming=lastSceneNow>0&&now-lastSceneNow>1000;lastSceneNow=now;
   const ceremony=festivalCeremonyAt(now,snapshot?.round??null);
   world.update(reduced?100:seconds,ceremony,reduced);ceremonyEffects.update(ceremony,snapshot?.round.index??0,reduced);
   hemisphere.color.copy(daySky).lerp(nightSky,ceremony.night);hemisphere.groundColor.copy(dayGround).lerp(nightGround,ceremony.night);hemisphere.intensity=2.3-ceremony.night*1.35;
   sun.color.copy(daySun).lerp(nightSun,ceremony.night);sun.intensity=3.4-ceremony.night*3.05;scene.environmentIntensity=.48-ceremony.night*.24;
   const selected=current.selectedKind!==null;
   if(current.view!==lastView||current.focusVersion!==lastFocus){
    lastView=current.view;lastFocus=current.focusVersion;artworkFocus=null;pendingOwnFocus=null;followingMovement=false;
    if(current.view==='aerial'){orbitPitch=1.05;orbitDistance=260;orbitYaw=.25;}
    else if(current.view==='follow'){orbitPitch=.39;orbitDistance=30;orbitYaw=.50;}
    else {orbitPitch=.37;orbitDistance=102;orbitYaw=.50;}
   }
   const visualState=snapshot?festivalSceneState(snapshot,now):{participants:[],installations:[]};
   const liveIds=new Set(visualState.participants.map(p=>p.id));
   for(const id of motions.keys())if(!liveIds.has(id)){motions.delete(id);motionIdentities.delete(id);}
   for(const participant of visualState.participants){
    const source=selectFestivalMovement(participant,participant.id===snapshot?.self.id?current.prediction.current:null,now);
    const workingAfterPause=resuming&&participant.buildTask;
    const previous=workingAfterPause?null:motionIdentities.get(participant.id)===participant.joinedAt?motions.get(participant.id)??null:null;
    motions.set(participant.id,stepFestivalMotion(previous,source,now,dt));motionIdentities.set(participant.id,participant.joinedAt);
   }
   const selfMotion=snapshot?motions.get(snapshot.self.id):null;
   const selfParticipant=snapshot?.participants.find(p=>p.id===snapshot.self.id),ownTask=selfParticipant?.buildTask;
   current.renderedSelf.current=selfMotion&&snapshot?{...selfMotion,actorId:snapshot.self.id}:null;
   if(current.movementVersion.current!==lastMovement)followOwnMovement();
   const stick=current.joystick.current;
   if(stick.active&&selfMotion&&!selected&&nowPerf-lastMove>290){
    lastMove=nowPerf;const forward=new THREE.Vector3(-Math.sin(orbitYaw),0,-Math.cos(orbitYaw)),right=new THREE.Vector3(Math.cos(orbitYaw),0,-Math.sin(orbitYaw));
    const dx=(right.x*stick.x+forward.x*stick.y)*(FESTIVAL_MOVE_SPEED*.39),dz=(right.z*stick.x+forward.z*stick.y)*(FESTIVAL_MOVE_SPEED*.39);
    let x=selfMotion.x+dx,z=selfMotion.z+dz;const r=Math.hypot(x,z);if(r>78){x*=78/r;z*=78/r;}if(Math.hypot(x,z)>=FESTIVAL_MONUMENT_RADIUS+.1)moveOwnAvatar(x,z);
   }
   if(snapshot){
    const taskId=ownTask?.installationId??null;
    if(taskBaseline&&taskId&&taskId!==observedOwnTask&&(selfParticipant?.moveAt??0)>lastMovementAt)pendingOwnFocus=taskId;
    observedOwnTask=taskId;taskBaseline=true;
    if(!taskId)pendingOwnFocus=null;
    if(pendingOwnFocus===taskId&&ownTask&&now>=ownTask.arrivalAt&&now<ownTask.finishAt&&now<snapshot.round.burnAt)focusArtwork(taskId!,selfParticipant?{x:selfParticipant.targetX,z:selfParticipant.targetZ}:undefined);
    if(artworkFocus&&artworkFocus!==monumentFocusId&&(!visualState.installations.some(a=>a.id===artworkFocus)||now>=snapshot.round.ashesAt))artworkFocus=null;
   }
   const focusedArt=artworkFocus?arts.get(artworkFocus):null;
   if(artworkFocus===monumentFocusId)desiredTarget.set(0,monumentHeight/2,0);
   else if(focusedArt)desiredTarget.set(focusedArt.root.position.x,Number(focusedArt.root.userData.height??12)/2,focusedArt.root.position.z);
   else if((followingMovement||current.view==='follow')&&selfMotion)desiredTarget.set(selfMotion.x,4.4,selfMotion.z);else desiredTarget.set(0,current.view==='aerial'?0:8,0);
   target.lerp(desiredTarget,1-Math.exp(-dt*3.8));
   desiredPosition.set(target.x+Math.sin(orbitYaw)*Math.cos(orbitPitch)*orbitDistance,target.y+Math.sin(orbitPitch)*orbitDistance,target.z+Math.cos(orbitYaw)*Math.cos(orbitPitch)*orbitDistance);
   camera.position.lerp(desiredPosition,1-Math.exp(-dt*4));camera.lookAt(target);
   if(snapshot){
    if(previousRound!==snapshot.round.index){previousRound=snapshot.round.index;for(const[id,art]of arts)removeArt(id,art);}
    const live=new Set(visualState.participants.map(p=>p.id));for(const[id,item]of people)if(!live.has(id))removePerson(id,item);
    for(const p of visualState.participants){
     let visual=people.get(p.id);const isSelf=snapshot.self.role==='participant'&&p.id===snapshot.self.id&&!('ambient' in p&&p.ambient);
     if(visual&&visual.avatar.kind!==resolveAvatarPreset(p.preset)){removePerson(p.id,visual);visual=undefined;}
     if(!visual){
      const avatar=createClubAvatar(p.preset,p.id,{mode:'desert'});avatar.root.scale.setScalar(FESTIVAL_AVATAR_SCENE_SCALE);scene.add(avatar.root);const label=textSprite(p.name,false,isSelf),bubble=textSprite('',true);bubble.visible=false;scene.add(label,bubble);
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(.8,24),new THREE.MeshBasicMaterial({color:0x493b36,transparent:true,opacity:.22,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.setScalar(FESTIVAL_AVATAR_SCENE_SCALE);scene.add(shadow);
      visual={avatar,headAnchor:createFestivalAvatarHeadAnchor(avatar),builder:createFestivalBuilderAvatar(avatar),celebration:createFestivalCelebrationAvatar(avatar,p.id),label,labelKey:p.name,labelSelf:isSelf,bubble,bubbleKey:'',shadow};people.set(p.id,visual);avatar.ready.catch(()=>{if(alive)current.onMessage('一个分身资源没载入成功，重新进入可重试');});
     }
     const motion=motions.get(p.id)!,position=visual.avatar.root.position;
     // Avatar, labels, shadow, gait and follow camera all consume the same reconciled pose.
     const building=!!p.buildTask&&now>=p.buildTask.arrivalAt&&now<p.buildTask.finishAt&&now<snapshot.round.burnAt;
     position.set(motion.x,0,motion.z);visual.avatar.root.rotation.y=building?p.buildTask!.facing:motion.heading;
     const emoteActive=!ceremony.burning&&now-p.emoteAt<5000&&now>=p.emoteAt;const action=emoteActive?p.emote:'dance';
     const slot=p.slot,heading=building?p.buildTask!.facing:motion.heading,forwardX=Math.sin(heading),forwardZ=Math.cos(heading);
     visual.avatar.update((now-(emoteActive?p.emoteAt:0))/500,action,reduced,emoteActive?.55:0,{
      slot,x:motion.x,z:motion.z,heading,speed:motion.speed,distance:motion.distance,walkBlend:motion.walkBlend,action,
      sampleAtDistance:(distance:number)=>({x:motion.x+forwardX*(distance-motion.distance),z:motion.z+forwardZ*(distance-motion.distance),heading}),
     });
     visual.builder.update(building?(now-p.buildTask!.arrivalAt)/1000:null,reduced);
     visual.celebration.update(ceremony.burning?ceremony.elapsed:null,reduced,ceremony.intensity);
     visual.headAnchor.update(visual.label.position);visual.shadow.position.set(motion.x,.045,motion.z);
     if(p.name!==visual.labelKey||isSelf!==visual.labelSelf){replaceText(visual.label,p.name,false,isSelf);visual.labelKey=p.name;visual.labelSelf=isSelf;}
     const message=festivalBubbleContent(p,now);
     visual.bubble.visible=!!message;if(message){if(message!==visual.bubbleKey){replaceText(visual.bubble,message,true);visual.bubbleKey=message;}visual.bubble.position.copy(visual.label.position);}
     // Shared world anchor plus a pixel gap keeps names/speech stacked at every zoom.
    }
    const currentArts=new Set(visualState.installations.map(art=>art.id));for(const[id,art]of arts)if(!currentArts.has(id))removeArt(id,art);
    for(const entry of visualState.installations){
     let visual=arts.get(entry.id);
     if(!visual){
      const seed=entry.kind*83+Math.round(entry.x*31+entry.z*17)+snapshot.round.index;const root=createInstallation(entry.kind,seed);root.position.set(entry.x,0,entry.z);root.rotation.y=entry.kind*.73;scene.add(root);
      const materials:ArtVisual['materials']=[],seen=new Set<THREE.Material>();root.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=true;node.receiveShadow=true;for(const m of Array.isArray(node.material)?node.material:[node.material]){if(m instanceof THREE.MeshStandardMaterial&&!seen.has(m)){seen.add(m);materials.push({material:m,color:m.color.clone(),emissive:m.emissive.clone(),intensity:m.emissiveIntensity});}}}});
      const parts=root.children.map(node=>({node,y:node.position.y,rotation:node.rotation.clone()}));
      const radius=Number(root.userData.radius??FESTIVAL_INSTALLATION_RADII[entry.kind]),height=Number(root.userData.height??9);
      const fire=createDesertFire(seed,height*.95,radius*1.8);fire.root.position.set(entry.x,0,entry.z);scene.add(fire.root);
      const smoke=createDesertSmoke(seed,height,radius);smoke.root.position.set(entry.x,0,entry.z);scene.add(smoke.root);
      const ash=new THREE.Mesh(new THREE.CircleGeometry(radius,32),new THREE.MeshStandardMaterial({color:0x3f3830,roughness:1,transparent:true,opacity:0,depthWrite:false}));ash.rotation.x=-Math.PI/2;ash.position.set(entry.x,.055,entry.z);scene.add(ash);
      const construction=createInstallationConstruction(root,seed);scene.add(construction.dust);
      visual={root,construction,lighting:createArtworkLighting(root,entry.kind),intrinsicLighting:{mode:'chase',palette:'solar',startedAt:entry.createdAt+INSTALLATION_CONSTRUCTION_MS},fire,smoke,ash,materials,parts};arts.set(entry.id,visual);
     }
     const construction=installationConstruction(Math.min(now,entry.constructionStoppedAt??Infinity),entry.createdAt,snapshot.round.burnAt);
     visual.construction.update(construction.seconds,reduced,construction.active&&entry.constructionStoppedAt===undefined&&now>=entry.createdAt&&now<snapshot.round.burnAt);
     updateInstallationAnimation(visual.root,(now-entry.createdAt)/1000,{active:construction.progress>=1,reducedMotion:reduced});
     const burn=installationBurn(now,snapshot.round.burnAt,snapshot.round.ashesAt,entry.kind*13+Math.round(entry.x*3+entry.z*7),snapshot.round.endsAt);
     visual.root.visible=burn.visible&&now>=entry.createdAt;visual.root.scale.y=Math.max(.035,1-burn.collapse*.965);visual.root.position.y=-burn.collapse*.1;
     visual.root.rotation.z=Math.sin(entry.kind+1)*burn.collapse*.20;
     for(const original of visual.materials){original.material.color.copy(original.color).lerp(charcoalColor,burn.char);original.material.emissive.copy(original.emissive).lerp(emberColor,burn.flame*.45);original.material.emissiveIntensity=original.intensity*(1-burn.char)+burn.flame*.65;}
     visual.parts.forEach((part,i)=>{const fall=smoothstep(.56+(i%5)*.025,.94,burn.progress);part.node.rotation.z=part.rotation.z+Math.sin(i*2.4+entry.kind)*fall*.22;part.node.position.y=part.y-fall*Math.max(0,part.y)*.20;if(part.node.userData.spinAxis==='y')part.node.rotation.y=part.rotation.y+(reduced?0:seconds*Number(part.node.userData.spinSpeed??.09))*(1-burn.collapse);});
     const lighting=visual.intrinsicLighting;
     visual.lighting.update(Math.max(0,(now-lighting.startedAt)/1000),lighting,{active:construction.progress>=1&&now<snapshot.round.burnAt,reducedMotion:reduced});
     visual.fire.update(reduced?10:seconds,burn.flame);(visual.ash.material as THREE.MeshStandardMaterial).opacity=burn.ash*.76;visual.ash.scale.setScalar(.68+burn.collapse*.35);
     visual.smoke.update(Math.max(0,(now-snapshot.round.burnAt)/1000),burn.smoke,reduced,burn.collapse);
    }
    placement.visible=selected&&now<snapshot.round.burnAt&&!!lastGround;
    if(placement.visible&&lastGround&&current.selectedKind!==null){
     const radius=FESTIVAL_INSTALLATION_RADII[current.selectedKind];placement.scale.setScalar(radius);placement.position.set(lastGround.x,.09,lastGround.z);
     const issue=getFestivalPlacementIssue(current.selectedKind,lastGround.x,lastGround.z,visualState.installations,visualState.participants,now);
     placementPreview.setValid(issue===null);
    }
    glow.intensity=ceremony.intensity*(18+Math.min(45,arts.size*3));
   }else placement.visible=false;
   const ownVisual=selfParticipant?people.get(selfParticipant.id):undefined;
   selfMarker.update({self:snapshot?.self,participant:selfParticipant,connected:current.ownMarkerEnabled===true&&!!ownVisual?.avatar.loaded,now,x:selfMotion?.x??0,z:selfMotion?.z??0,groundY:0,footprintRadius:(ownVisual?.avatar.groundFootprintRadius??.6)*(ownVisual?.avatar.root.scale.x??FESTIVAL_AVATAR_SCENE_SCALE),viewportHeight:element.clientHeight||758,camera});
   if(destination.visible){const age=(nowPerf-destinationAt)/1000;destination.scale.setScalar(1+Math.sin(age*5)*.10);(destination.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.7-age*.13);if(age>5)destination.visible=false;}
   if(nowPerf-lastShadow>180){renderer.shadowMap.needsUpdate=true;lastShadow=nowPerf;}
   renderer.render(scene,camera);
   if(snapshot&&current.onCelebrationPhoto&&ceremony.burning&&ceremony.elapsed>=FESTIVAL_PHOTO_PEAK_SECONDS&&ceremony.elapsed<=FESTIVAL_PHOTO_LAST_SECONDS&&!photoRounds.current.has(snapshot.round.index)){
    const attempt=photoAttempts.current.get(snapshot.round.index);
    const actorsReady=visualState.participants.every(person=>people.get(person.id)?.avatar.loaded);
    if(actorsReady&&(!attempt||(attempt.count<3&&now-attempt.at>=1000))){
     photoAttempts.current.set(snapshot.round.index,{count:(attempt?.count??0)+1,at:now});
     if(photoAttempts.current.size>8)photoAttempts.current.delete(photoAttempts.current.keys().next().value!);
     const photo=captureFestivalCeremonyPhoto(renderer,scene,camera,snapshot.round.index,now);
     if(photo){photoRounds.current.add(snapshot.round.index);if(photoRounds.current.size>8)photoRounds.current.delete(photoRounds.current.values().next().value!);current.onCelebrationPhoto(photo);}
    }
   }
   frame=requestAnimationFrame(animate);
   }catch(error){console.error('[desert-scene] Frame failed',error);failScene();}
  };
  try{animate();queueMicrotask(()=>{if(alive&&!failed)setStatus('ready');});}catch(error){failScene(error);}
  return()=>{
   alive=false;cancelAnimationFrame(frame);resizeObserver.disconnect();
   renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointermove',onMove);renderer.domElement.removeEventListener('pointerup',onUp);renderer.domElement.removeEventListener('pointercancel',onCancel);renderer.domElement.removeEventListener('wheel',onWheel);renderer.domElement.removeEventListener('webglcontextlost',onContextLost);
   for(const[id,item]of people)removePerson(id,item);for(const[id,art]of arts)removeArt(id,art);ceremonyEffects.dispose();world.dispose();
   selfMarker.dispose();placementPreview.dispose();destination.geometry.dispose();(destination.material as THREE.Material).dispose();sun.shadow.map?.dispose();reflections.dispose();renderer.dispose();renderer.domElement.remove();
  };
 },[retry]);
 return <div className="desert-scene" ref={host}>
  {status==='loading'&&<div className="scene-loading"><i/><span>风正在穿过荒原</span><small>正在载入 3D 世界</small></div>}
  {status==='failed'&&<div className="scene-loading scene-failed"><strong>3D 场景暂时没能打开</strong><span>试试更新浏览器，或重新载入场景</span><button onClick={()=>{setStatus('loading');setRetry(x=>x+1);}}>重新载入</button></div>}
 </div>;
}
