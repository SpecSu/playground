import * as THREE from 'three';
import {createClubAvatar,type ClubAvatar,type ClubAvatarKind} from '../avatars/club-avatar-rig.ts';
import type {ClubMotionState} from '../avatars/club-scene-motion.ts';
import {projectCameraLabel,createCameraObstacle,type CameraObstacle,type ClubCameraMode} from '../avatars/club-camera.ts';
import {CLUB_AVATAR_SCALE} from '../avatars/club-avatar-scale.ts';
import {EstateCameraController,screenMovement} from './isometric-camera.ts';
import {BufferedMotionTrack} from './motion-track.ts';
import {renderRoute,routeLength} from './render-route.ts';
import {openingPresentation,type OpeningState} from './opening.ts';
import {SceneTapGesture,pickSceneEntity,bindEntityLabel} from '../picking.ts';
import {makeSheep} from '../sheep.ts';
import {AVATAR_LABEL} from '../model.ts';
import {animalScale} from './life.ts';
import {terrainAt,regionAt,findPath,buildingFootprint,worldCells,layoutWorldBounds,isOwned,BUILDING_RULES,type BuildingKind,type GridPoint,type Building} from './layout.ts';
import {LANDMARKS,discoveredLandmarkIds,currentJourneyGoal} from './journey.ts';
import {gridToWorld,worldToGrid,sceneResponse,sceneBuilding,legacyAnimal,scenePalette,cameraCapture} from './estate-scene.ts';
import type {EstateSnapshot,EstateAnimal} from './estate.ts';
import type {GuardianKind,ThreatWolf} from './threat.ts';
export type EstateWorldHandlers={select:(id:string)=>void;destination:(p:GridPoint)=>void;status:(message:string)=>void;steer?:(direction:GridPoint)=>void;assetsReady?:(ready:boolean)=>void};
export type EstateGhost={x:number;z:number;kind:BuildingKind;valid:boolean};
type SheepVisual=ReturnType<typeof makeSheep>&{label:HTMLButtonElement;name:HTMLElement;memory:HTMLElement;bubble:HTMLElement;cleanup:()=>void};
type Mover={root:THREE.Group;path:GridPoint[];target:GridPoint;distance:number;track?:BufferedMotionTrack;sampleAt?:number;authorityAt?:number;future?:GridPoint[];speed?:number};
const guardianKinds:Record<GuardianKind,ClubAvatarKind>={dog:'sword-shield-dog',cat:'miaocuijiao',frog:'milk-frog'};
const guardianNames:Record<GuardianKind,string>={dog:'刀盾狗',cat:'喵脆角',frog:'奶蛙'};
const key=(p:GridPoint)=>`${p.x},${p.z}`;
const clamp=THREE.MathUtils.clamp;
function disposeTree(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();
}
function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number,opacity=1){
 const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.88,transparent:opacity<1,opacity}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function box(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h:number,d:number,opacity=1){return mesh(parent,new THREE.BoxGeometry(w,h,d),color,x,y,z,opacity);}
function ball(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h=w,d=w){const m=mesh(parent,new THREE.SphereGeometry(1,12,8),color,x,y,z);m.scale.set(w,h,d);return m;}
function ring(parent:THREE.Object3D,color:string,x:number,z:number,radius:number,opacity=.7){
 const m=new THREE.Mesh(new THREE.RingGeometry(radius-.035,radius,48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.06,z);m.userData.pickThrough=true;parent.add(m);return m;
}
function pathLine(parent:THREE.Group,path:GridPoint[],color:string,height=.07){
 if(path.length<2)return;const points=path.map(p=>{const w=gridToWorld(p);return new THREE.Vector3(w.x,height,w.z);});
 const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:.75}));line.userData.pickThrough=true;parent.add(line);
}
function wolfModel(){
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);
 ball(body,'#82888b',0,.57,0,.28,.35,.58);const head=ball(body,'#9b9d97',0,.9,.49,.24,.25,.3);ball(body,'#d3d1bd',0,.79,.72,.17,.12,.18);ball(body,'#303c3e',0,.82,.87,.08,.05,.05);
 for(const side of [-1,1]){const ear=mesh(body,new THREE.ConeGeometry(.12,.3,3),'#667477',side*.16,1.17,.46);ear.rotation.z=-side*.22;ball(body,'#e4b777',side*.15,.96,.71,.034,.04,.025);}
 const legs=Array.from({length:4},(_,i)=>{const leg=new THREE.Group();leg.position.set(i%2?-.17:.17,.51,i<2?-.36:.33);body.add(leg);box(leg,'#697679',0,-.22,0,.1,.45,.11);return leg;});
 const tail=mesh(body,new THREE.ConeGeometry(.13,.62,7),'#6b797b',0,.65,-.72);tail.rotation.x=-.9;
 const tell=ring(root,'#e59368',0,0,.72,.85);tell.visible=false;
 const bubble=mesh(root,new THREE.SphereGeometry(.8,18,12),'#bce3ed',0,.6,0,.22);bubble.visible=false;bubble.userData.pickThrough=true;
 return {root,head,legs,tell,body,bubble};
}
/** V5 renders the persisted graph and actor state; no gameplay rules settle here. */
export class EstateWorld{
 private host:HTMLDivElement;private handlers:EstateWorldHandlers;private data:EstateSnapshot;
 private scene=new THREE.Scene();private introBush=new THREE.Group();private layoutGroup=new THREE.Group();private routeGroup=new THREE.Group();private effectGroup=new THREE.Group();private ghostGroup=new THREE.Group();
 private cameraController=new EstateCameraController();private camera:THREE.Camera=this.cameraController.camera;private cameraMode:ClubCameraMode='third-person';private obstacles:CameraObstacle[]=[];
 private renderer:THREE.WebGLRenderer;private resize:ResizeObserver;private frame=0;private disposed=false;private prev=0;private offset=0;private enteredAt=0;
 private replay=false;
 private playerAvatar:ClubAvatar|undefined;private guardianAvatar:ClubAvatar|undefined;private guardianKind:GuardianKind|null=null;
 private player:Mover={root:new THREE.Group(),path:[],target:{x:0,z:0},distance:0};private guardian:Mover={root:new THREE.Group(),path:[],target:{x:0,z:0},distance:0};
 private sheep=new Map<string,SheepVisual>();private animalMovers=new Map<string,Mover>();private wolves=new Map<string,ReturnType<typeof wolfModel>&{mover:Mover}>();
 private guardianLabel:HTMLButtonElement;private playerLabel:HTMLDivElement;private visitorGroup=new THREE.Group();private visitors=new Map<string,{avatar:ClubAvatar;kind:EstateSnapshot['avatar'];mover:Mover;label:HTMLDivElement}>();private visitorLabels:HTMLDivElement[]=[];private careProp=new THREE.Group();private previewTheme:keyof typeof scenePalette|undefined;private labels:HTMLDivElement[]=[];private selected='';private reduced=false;private ghost:EstateGhost|undefined;
 private listenerCleanup:(()=>void)[]=[];private projection=new THREE.Vector3();private keys=new Set<string>();private direction:GridPoint={x:0,z:0};private openingState:OpeningState|undefined;private attention:GridPoint|null=null;private inputLocked=false;private steering=false;private tap=new SceneTapGesture();private ray=new THREE.Raycaster();private cursor=new THREE.Vector2();private sentAt=-Infinity;private mapKey='';private playerStatus='loading';private guardianStatus='';
 constructor(host:HTMLDivElement,data:EstateSnapshot,handlers:EstateWorldHandlers){
  this.host=host;this.handlers=handlers;this.data=data;this.offset=data.now-Date.now();this.enteredAt=data.now;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
  const canvas=this.renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','农场连续地图：点地面行走，点动物打开卡片；WASD或方向键移动');host.append(canvas);
  this.scene.add(this.layoutGroup,this.routeGroup,this.effectGroup,this.ghostGroup,this.visitorGroup,this.careProp,this.player.root,this.guardian.root);
  this.makeCareProps();this.scene.add(this.introBush);for(const [x,y,z] of [[0,.2,0],[.25,.3,0],[-.2,.22,.15],[0,.38,-.15]])ball(this.introBush,'#6e965d',x,y,z,.25,.3,.23);
  this.scene.add(new THREE.HemisphereLight('#fff5df','#78936c',2.4));const sun=new THREE.DirectionalLight('#fff1d8',3);sun.position.set(-9,17,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.normalBias=.05;this.scene.add(sun);
  this.guardian.root.userData.entityId='guardian';this.guardianLabel=document.createElement('button');this.guardianLabel.className='guardian-label';this.guardianLabel.setAttribute('aria-label','查看守护伙伴');host.append(this.guardianLabel);this.listenerCleanup.push(bindEntityLabel(this.guardianLabel,'guardian',handlers.select));
  this.playerLabel=document.createElement('div');this.playerLabel.className='player-label';host.append(this.playerLabel);
  this.installPlayer(data.avatar);this.sync(data,true);this.set(data,'',false,'third-person');
  const on=(target:EventTarget,type:string,fn:EventListener)=>{target.addEventListener(type,fn);this.listenerCleanup.push(()=>target.removeEventListener(type,fn));};
  on(canvas,'pointerdown',((e:PointerEvent)=>{if(!this.tap.begin(e))return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);}) as EventListener);
  on(canvas,'pointermove',((e:PointerEvent)=>this.tap.move(e)) as EventListener);
  on(canvas,'pointerup',((e:PointerEvent)=>{if(this.tap.end(e))this.point(e);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}) as EventListener);
  on(canvas,'pointercancel',((e:PointerEvent)=>this.tap.cancel(e.pointerId)) as EventListener);on(canvas,'lostpointercapture',((e:PointerEvent)=>this.tap.cancel(e.pointerId)) as EventListener);
  on(canvas,'keydown',((e:KeyboardEvent)=>{if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){this.keys.add(e.key);e.preventDefault();}}) as EventListener);on(canvas,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.key);}) as EventListener);
  const stop=()=>{this.keys.clear();this.direction={x:0,z:0};this.stopSteering();};on(canvas,'blur',stop);on(window,'blur',stop);on(document,'visibilitychange',()=>{if(document.hidden)stop();});
  on(canvas,'webglcontextlost',((e:Event)=>{e.preventDefault();handlers.status('3D画面连接中断，刷新可恢复存档');}) as EventListener);
  this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);this.fit();this.frame=requestAnimationFrame(t=>this.animate(t));
 }
 private makeCareProps(){
  const milk=new THREE.Group();milk.name='milk-bottle';this.careProp.add(milk);mesh(milk,new THREE.CylinderGeometry(.07,.08,.25,12),'#fff6de',0,0,0);mesh(milk,new THREE.CylinderGeometry(.06,.07,.055,12),'#f1c68d',0,.15,0);ball(milk,'#eab895',0,.2,0,.027,.045,.027);
  const food=new THREE.Group();food.name='feed-bowl';this.careProp.add(food);mesh(food,new THREE.CylinderGeometry(.12,.1,.08,12),'#d2b68d',0,0,0);for(let i=0;i<4;i++)ball(food,'#8fa968',(i%2-.5)*.1,.05,(Math.floor(i/2)-.5)*.1,.055,.04,.055);this.careProp.visible=false;this.careProp.traverse(o=>o.userData.pickThrough=true);
 }
 private updateCareProp(){
  const job=this.data.profile.job,a=job?.target?this.data.profile.animals.find(a=>a.id===job.target):undefined;this.careProp.visible=job?.type==='feed'&&job.phase==='act'&&!!a&&!a.memorial;if(!this.careProp.visible||!a)return;
  const animal=this.animalMovers.get(a.id)?.root.position??new THREE.Vector3(...[a.position.x-5.5,0,a.position.z-5.5] as [number,number,number]);const player=this.player.root.position;this.careProp.position.set(animal.x*.8+player.x*.2,.75*animalScale(a.life),animal.z*.8+player.z*.2);this.careProp.rotation.z=job?.food==='milk'?.5:0;
  this.careProp.getObjectByName('milk-bottle')!.visible=job?.food==='milk';this.careProp.getObjectByName('feed-bowl')!.visible=job?.food!=='milk';
 }
 private reportAssets(){this.handlers.assetsReady?.(this.playerStatus==='ready'&&(!this.guardianKind||this.guardianStatus==='ready'));this.handlers.status(this.playerStatus==='error'?'LX分身模型加载失败，刷新重试':this.guardianStatus==='error'?'守护伙伴模型加载失败，规则与存档仍在':this.playerStatus==='loading'||this.guardianStatus==='loading'?'正在载入分身与伙伴…':'点击动物看卡片 · 点地面或摇杆行走');}
 private installPlayer(kind:EstateSnapshot['avatar']){
  this.playerAvatar?.dispose();this.player.root.clear();const avatar=createClubAvatar(kind,'estate-player');this.playerAvatar=avatar;this.player.root.add(avatar.root);this.playerStatus='loading';this.reportAssets();
  void avatar.ready.then(()=>{if(!this.disposed&&avatar===this.playerAvatar){avatar.root.scale.setScalar(CLUB_AVATAR_SCALE);this.playerStatus='ready';this.reportAssets();}}).catch(()=>{if(!this.disposed&&avatar===this.playerAvatar){this.playerStatus='error';this.reportAssets();}});
 }
 private installGuardian(kind:GuardianKind|null){
  this.guardianAvatar?.dispose();this.guardian.root.clear();this.guardianKind=kind;this.guardian.root.visible=!!kind;this.guardianLabel.hidden=!kind;if(!kind){this.guardianAvatar=undefined;this.guardianStatus='';this.reportAssets();return;}
  const avatar=createClubAvatar(guardianKinds[kind],`estate-guardian-${kind}`);this.guardianAvatar=avatar;this.guardian.root.add(avatar.root);this.guardianStatus='loading';this.reportAssets();
  void avatar.ready.then(()=>{if(!this.disposed&&avatar===this.guardianAvatar){avatar.root.scale.setScalar(CLUB_AVATAR_SCALE);this.guardianStatus='ready';this.reportAssets();}}).catch(()=>{if(!this.disposed&&avatar===this.guardianAvatar){this.guardianStatus='error';this.reportAssets();}});
 }
 set(data:EstateSnapshot,target:string,reduced:boolean,cameraMode:ClubCameraMode='third-person',ghost?:EstateGhost,previewTheme?:keyof typeof scenePalette,opening?:OpeningState,replay=false,attention:GridPoint|null=null){
  if(data.avatar!==this.data.avatar)this.installPlayer(data.avatar);
  const profileChanged=data.activeProfile!==this.data.activeProfile||data.profile.runId!==this.data.profile.runId||replay!==this.replay;this.replay=replay;
  // Props and replay frames can reuse an older snapshot. Keep the clock mapping
  // stable until its motion source changes, or those updates rewind render time.
  if(profileChanged){this.enteredAt=data.now;this.mapKey='';this.offset=data.now-Date.now();}
  if(cameraMode!==this.cameraMode){this.stopSteering();this.keys.clear();this.direction={x:0,z:0};}
  this.attention=attention;this.openingState=opening??data.profile.opening;this.inputLocked=replay||!!this.openingState&&(openingPresentation(this.openingState).controlsLocked||data.profile.tutorial!=='done'&&(this.openingState.stage==='done'||data.profile.threat?.phase==='complete'));if(this.inputLocked){this.keys.clear();this.direction={x:0,z:0};this.stopSteering();}
  this.data=data;this.selected=target;this.reduced=reduced;this.cameraMode=cameraMode;this.ghost=ghost;this.previewTheme=previewTheme;this.sync(data,profileChanged);this.drawGhost();
 }
 private stopSteering(){if(this.steering){this.steering=false;this.handlers.steer?.({x:0,z:0});}}
 stopInput(){this.keys.clear();this.direction={x:0,z:0};this.stopSteering();}
 move(v:GridPoint){if(this.inputLocked){this.direction={x:0,z:0};return;}this.direction={x:Number.isFinite(v.x)?v.x:0,z:Number.isFinite(v.z)?v.z:0};if(!this.direction.x&&!this.direction.z){this.stopSteering();}}
 private syncMover(m:Mover,to:GridPoint,reset=false,future:GridPoint[]=[]){
  let at=this.replay?Date.now()+this.offset:this.data.profile.lastPulseAt;
  if(reset||!m.track){const w=gridToWorld(to);m.root.position.set(w.x,0,w.z);m.target={...to};m.path=[];m.distance=0;m.speed=0;m.sampleAt=at;m.authorityAt=at;m.future=future.map(p=>({...p}));m.track=new BufferedMotionTrack(to,at);return;}
  const changed=Math.hypot(to.x-m.target.x,to.z-m.target.z)>.00001;
  // A command can move an actor at a safe transition without advancing pulse time.
  if(changed&&at<=(m.authorityAt??at))at=this.data.now;
  if(at<=(m.authorityAt??-Infinity)){m.future=future.map(p=>({...p}));return;}
  const route=changed?renderRoute(this.data.profile.layout,m.target,to,m.future,m===this.player):[];
  if(changed&&!route.length){m.future=future.map(p=>({...p}));return;}
  // Slot admission/egress is atomic in gameplay. Show its legal doorway route
  // over time rather than teleporting to the allocated bed in one frame.
  const sampleAt=Math.max(at,(m.sampleAt??at)+routeLength(m.target,route)/3.2*1000);
  if(m.track.push({position:to,at:sampleAt,route})){m.sampleAt=sampleAt;m.target={...to};}
  m.authorityAt=at;m.future=future.map(p=>({...p}));
 }
 private sync(data:EstateSnapshot,reset=false){
  const p=data.profile,theme=this.previewTheme??p.creation.theme;
  const layoutKey=`${p.id}:${p.layout.version}:${theme}:${p.layout.construction?.eventId??''}:${discoveredLandmarkIds(p).join(',')}`;
  if(layoutKey!==this.mapKey){this.mapKey=layoutKey;this.buildMap();}
  this.syncMover(this.player,p.position,reset,p.path);
  const guardian=p.threat?.guardian,kind=guardian?.kind??p.guardian;if(kind!==this.guardianKind)this.installGuardian(kind);this.syncMover(this.guardian,guardian?.position??p.guardianAt,reset,guardian?guardian.path.slice(guardian.pathIndex):p.guardianPath);
  const ids=new Set(p.animals.map(a=>a.id));for(const [id,s] of this.sheep)if(!ids.has(id)){s.cleanup();s.label.remove();this.scene.remove(s.root);disposeTree(s.root);this.sheep.delete(id);this.animalMovers.delete(id);}
  for(const a of p.animals){let visual=this.sheep.get(a.id);if(!visual){const body=makeSheep(legacyAnimal(a));body.root.userData.entityId=a.id;this.scene.add(body.root);const label=document.createElement('button');label.className='animal-label';label.setAttribute('aria-label',`查看${a.name}的卡片`);const bubble=document.createElement('span'),name=document.createElement('strong'),memory=document.createElement('small');bubble.className='world-bubble';label.append(bubble,name,memory);label.style.setProperty('--sheep-color',a.color);this.host.append(label);visual={...body,label,bubble,name,memory,cleanup:bindEntityLabel(label,a.id,this.handlers.select)};this.sheep.set(a.id,visual);this.animalMovers.set(a.id,{root:body.root,path:[],target:{...a.position},distance:0});this.syncMover(this.animalMovers.get(a.id)!,a.position,true);}
   const actor=p.threat?.actors.find(item=>item.id===a.id);visual.root.visible=!a.memorial&&(!actor||!['boundary','lost','memorial'].includes(actor.status));visual.label.hidden=!visual.root.visible;const size=animalScale(a.life);visual.root.scale.setScalar(size);this.syncMover(this.animalMovers.get(a.id)!,a.position,reset,actor?actor.path.slice(actor.pathIndex):a.path);
  }
  const wolves=p.threat?.wolves??[];const wolfIds=new Set(wolves.map(w=>w.id));for(const [id,w] of this.wolves)if(!wolfIds.has(id)){this.scene.remove(w.root);disposeTree(w.root);this.wolves.delete(id);}
  for(const w of wolves){let visual=this.wolves.get(w.id);if(!visual){const body=wolfModel();body.root.userData.entityId=`wolf:${w.id}`;this.scene.add(body.root);visual={...body,mover:{root:body.root,path:[],target:{...w.position},distance:0}};this.wolves.set(w.id,visual);this.syncMover(visual.mover,w.position,true);}visual.root.visible=!['retreated','boundary'].includes(w.status);this.syncMover(visual.mover,w.position,reset,w.path.slice(w.pathIndex));}
  this.drawRoutes();this.drawVisits();
 }
 private buildMap(){
  disposeTree(this.layoutGroup);this.labels.forEach(el=>el.remove());this.labels=[];this.obstacles=[];
  const p=this.data.profile,theme=this.previewTheme??p.creation.theme,palette=scenePalette[theme];this.scene.background=new THREE.Color(palette.sky);this.scene.fog=new THREE.Fog(palette.sky,26,60);
  const bounds=layoutWorldBounds(),center=gridToWorld({x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2});box(this.layoutGroup,'#7b9363',center.x,-.34,center.z,bounds.maxX-bounds.minX+1,.5,bounds.maxZ-bounds.minZ+1);
  const tileBatches=new Map<string,{water:boolean;positions:THREE.Vector3[]}>();
  for(const c of worldCells()){const w=gridToWorld(c),terrain=terrainAt(c),region=regionAt(c);const color=terrain==='deep'?'#68a9b7':terrain==='shallow'?'#8ac3be':!isOwned(p.layout,c)?(c.x<0?'#a0b684':c.z>11?'#a4b995':palette.meadow):region==='meadow'?palette.meadow:region==='home'?palette.home:region==='shore'?palette.shore:palette.grass;
   const batch=tileBatches.get(color)??{water:terrain!=='grass',positions:[]};batch.positions.push(new THREE.Vector3(w.x,terrain==='grass'?-.055:-.035,w.z));tileBatches.set(color,batch);
   if(terrain==='shallow')for(let i=0;i<2;i++){const ripple=ring(this.layoutGroup,'#d6f0dd',w.x+(i-.5)*.28,w.z,.19+i*.05,.23);ripple.position.y=.005;}
  }
  // Expanded ground uses a handful of draw calls, not one per world tile.
  const transform=new THREE.Matrix4();for(const [color,batch] of tileBatches){const tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1.006,.12,1.006),new THREE.MeshStandardMaterial({color,roughness:batch.water?.28:.88}),batch.positions.length);tiles.name='valley-ground';tiles.receiveShadow=true;batch.positions.forEach((position,index)=>tiles.setMatrixAt(index,transform.makeTranslation(position)));this.layoutGroup.add(tiles);}
  for(const r of p.layout.roads){const w=gridToWorld(r);box(this.layoutGroup,palette.road,w.x,.016,w.z,.84,.035,.84).castShadow=false;}
  // Ground-only flowers never introduce unmodelled navigation blockers.
  for(let i=0;i<56;i++){const x=(i*47%113)/10,z=(i*31%113)/10,c={x:Math.round(x),z:Math.round(z)};if(terrainAt(c)!=='grass'||p.layout.roads.some(r=>r.x===c.x&&r.z===c.z)||p.layout.buildings.some(b=>buildingFootprint(b).some(q=>q.x===c.x&&q.z===c.z)))continue;const w=gridToWorld({x,z});const flower=ball(this.layoutGroup,i%3?'#e7dfae':'#efd8c3',w.x,.05,w.z,.035,.04,.035);flower.castShadow=false;}
  if(theme==='lotus')for(const c of p.layout.owned.filter(c=>terrainAt(c)==='shallow')){const w=gridToWorld(c);const leaf=mesh(this.layoutGroup,new THREE.CylinderGeometry(.25,.25,.025,18),'#8db899',w.x,.025,w.z);leaf.castShadow=false;ball(this.layoutGroup,'#ecc4cf',w.x,.09,w.z,.09,.09,.09);}
  if(theme==='starlit')for(let i=0;i<18;i++){const w=gridToWorld({x:(i*7%12),z:(i*5%12)});const star=mesh(this.layoutGroup,new THREE.OctahedronGeometry(.045),'#ffe9b6',w.x,1.5+(i%3)*.4,w.z);(star.material as THREE.MeshStandardMaterial).emissive.set('#ffe9b6');(star.material as THREE.MeshStandardMaterial).emissiveIntensity=.7;star.userData.pickThrough=true;}
  for(const b of p.layout.buildings)this.building(b,palette.accent);
  if(p.layout.construction){const c=p.layout.construction;for(const cell of c.footprint){const w=gridToWorld(cell);box(this.layoutGroup,'#eeb76e',w.x,.045,w.z,.94,.08,.94,.4);}const point=c.footprint[0];if(point){const w=gridToWorld(point);const label=document.createElement('div');label.className='player-label';label.textContent='施工中';label.dataset.worldX=String(w.x);label.dataset.worldZ=String(w.z);this.host.append(label);this.labels.push(label);}}
  const landmarks=[{x:4,z:5,text:'保护区'},{x:8,z:2,text:'散养草场'},{x:9,z:8,text:'池岸 · 羊留岸上'},{x:3,z:10,text:'家园工作台'}];
  for(const landmark of LANDMARKS){const w=gridToWorld(landmark.position),known=discoveredLandmarkIds(p).includes(landmark.id);landmarks.push({...landmark.position,text:`${known?'✓':'◇'} ${landmark.name}`});
   ring(this.layoutGroup,known?'#d2edb5':'#ffe5ad',w.x,w.z,.75,.7);
   // Ground-level scenery keeps the walkable discovery point unobstructed.
   for(let i=0;i<7;i++){const angle=i*Math.PI*2/7;ball(this.layoutGroup,landmark.position.x<0?'#f1d7cb':landmark.position.z>11?'#d4dde6':'#ecdca9',w.x+Math.cos(angle)*.72,.1,w.z+Math.sin(angle)*.72,.1,.12,.1);}
  }
  for(const landmark of landmarks){const w=gridToWorld(landmark);const label=document.createElement('div');label.className='player-label estate-region-label';label.textContent=landmark.text;label.dataset.worldX=String(w.x);label.dataset.worldZ=String(w.z);label.style.fontSize='10px';label.style.opacity='.7';this.host.append(label);this.labels.push(label);}
  // The distant bank, beyond the actual navigable valley, carries the tall scenery.
  for(let i=0;i<18;i++){const w=gridToWorld({x:i<9?bounds.minX-1:bounds.maxX+1,z:bounds.minZ+i%9*3});box(this.layoutGroup,'#aa8a60',w.x,.7,w.z,.24,1.4,.24);ball(this.layoutGroup,theme==='starlit'?'#71869c':'#91aa6f',w.x,1.9,w.z,.65,.9,.65);}
 }
 private fence(x:number,z:number,alongX:boolean,parent:THREE.Object3D=this.layoutGroup){
  const fence=new THREE.Group();fence.name='protection-fence';parent.add(fence);
  for(const offset of [-.46,.46])box(fence,'#ddd1ac',x+(alongX?offset:0),.31,z+(alongX?0:offset),.09,.65,.09);
  for(const height of [.23,.47])box(fence,'#e6d9b9',x,height,z,alongX?1:.075,.065,alongX?.075:1);
 }
 private building(b:Building,accent:string){
  const g=sceneBuilding(b),root=new THREE.Group();root.position.set(g.center.x,0,g.center.z);root.userData.entityId=`building:${b.id}`;this.layoutGroup.add(root);const w=g.width,d=g.depth;
  if(b.kind==='shelter'){
   const floor=box(root,'#c6a576',0,.04,0,w-.08,.1,d-.08);floor.castShadow=false;
   const footprint=buildingFootprint(b),cells=new Set(footprint.map(key));
   for(const c of footprint)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const outside={x:c.x+dx,z:c.z+dz};if(cells.has(key(outside))||b.doors.some(door=>door.x===outside.x&&door.z===outside.z))continue;const at=gridToWorld(c);this.fence(at.x-g.center.x+dx*.5,at.z-g.center.z+dz*.5,dx===0,root);}
   for(const offset of [-.55,0,.55])ball(root,'#e9d6a2',offset,.14,.22,.28,.1,.31);
  }else if(b.kind==='trough'){
   box(root,'#a98059',0,.2,0,.87,.4,.68);box(root,'#e4d3a6',0,.43,0,.73,.08,.55);for(let i=0;i<5;i++)ball(root,'#849e61',(i%3-1)*.19,.51,(Math.floor(i/3)-.5)*.2,.13,.09,.12);
  }else if(b.kind==='workbench'){
   box(root,'#b78c63',0,.48,0,.92,.12,.78);for(const x of [-.34,.34])for(const z of [-.26,.26])box(root,'#9c7d58',x,.23,z,.09,.5,.09);box(root,'#e6e3bf',-.2,.68,0,.22,.3,.22);ball(root,'#c9a96e',.2,.6,.08,.2,.1,.16);
  }else if(b.kind==='factory'){
   const body=box(root,'#d0c09a',0,.65,0,w-.1,1.3,d-.1);box(root,accent,0,1.36,0,w,.18,d);box(root,'#ad9d7c',.5,1.78,-.5,.27,.9,.27);box(root,'#8d9e8d',0,.5,d/2,.65,.65,.05);this.obstacles.push(createCameraObstacle(body));
  }else if(b.kind==='tower'){
   for(const x of [-.7,.7])for(const z of [-.7,.7])box(root,'#aa895e',x,1.15,z,.15,2.3,.15);const platform=box(root,'#d4bc89',0,2.16,0,1.9,.14,1.9);for(let i=0;i<6;i++)box(root,'#aa895e',-.6,1.9-i*.3,1,.8,.08,.1);const roof=mesh(root,new THREE.ConeGeometry(1.5,.65,4),accent,0,2.8,0);roof.rotation.y=Math.PI/4;this.obstacles.push(createCameraObstacle(platform));
  }else if(b.kind==='ramp'){
   const ramp=box(root,'#c5ae81',0,.08,0,w*.9,.16,d*.95);ramp.rotation.x=.1;
  }else{
   box(root,'#b7a789',0,.11,0,.8,.22,.8);for(let i=0;i<5;i++)ball(root,i%2?accent:'#b7c88c',Math.cos(i*2.4)*.2,.35+Math.sin(i)*.1,Math.sin(i*2.4)*.2,.18,.22,.18);
  }
  for(const door of g.doors){const dx=door.x-g.center.x,dz=door.z-g.center.z;const entry=ring(root,door.open?'#b7dfad':'#e2a185',dx,dz,.34,.9);entry.position.y=.08;if(!door.open){const bar=box(root,'#b97960',dx,.36,dz,.8,.5,.12);if(Math.abs(dx)>Math.abs(dz))bar.rotation.y=Math.PI/2;}}
 }
 private drawRoutes(){
  disposeTree(this.routeGroup);disposeTree(this.effectGroup);const p=this.data.profile;
  pathLine(this.routeGroup,[p.position,...p.path],'#fff4b1');const destination=p.path.at(-1);if(destination){const goal=gridToWorld(destination);ring(this.routeGroup,'#fff3a7',goal.x,goal.z,.25,.95);}
  for(const a of p.animals){const actor=p.threat?.actors.find(item=>item.id===a.id);const route=actor?actor.path.slice(actor.pathIndex):a.path;if(p.threat||this.selected===a.id)pathLine(this.routeGroup,[a.position,...route],a.color,.085);}
  for(const w of p.threat?.wolves??[])if(!['retreated','boundary'].includes(w.status))pathLine(this.routeGroup,[w.position,...w.path.slice(w.pathIndex)],'#d88e73',.09);
  for(const door of p.threat?.doors??[]){const w=gridToWorld(door.position);ring(this.effectGroup,door.queue.length?'#f4d28a':'#d1e5ba',w.x,w.z,.48,.85);}
  const guardian=p.threat?.guardian;if(guardian?.ability&&guardian.abilityUntil>p.threat!.elapsed){const w=gridToWorld(guardian.abilityPosition);ring(this.effectGroup,guardian.ability==='calm'?'#b7e5cd':guardian.ability==='gather'?'#eddda4':guardian.ability==='bubble'?'#9cd8ec':'#f4b976',w.x,w.z,guardian.ability==='calm'||guardian.ability==='gather'?4:1,.45);}
  const goal=currentJourneyGoal(p);if(p.tutorial==='done'&&goal.action.kind==='move'&&!p.path.length){const w=gridToWorld(goal.action.to);ring(this.effectGroup,'#ffe8a8',w.x,w.z,.55,.8);}
 }
 private drawVisits(){
  const p=this.data.profile,active=p.creation.visits.filter(v=>v.status==='active');
  const ids=new Set(active.map(v=>v.id));for(const [id,old] of this.visitors)if(!ids.has(id)){old.avatar.dispose();old.label.remove();this.scene.remove(old.mover.root);this.visitors.delete(id);}
  for(const v of active){const point=v.route[v.routeIndex];if(!point)continue;let old=this.visitors.get(v.id);
   if(old&&old.kind!==this.data.avatar){old.avatar.dispose();old.label.remove();this.scene.remove(old.mover.root);this.visitors.delete(v.id);old=undefined;}
   if(!old){const avatar=createClubAvatar(this.data.avatar,`local-visit-${v.id}`),root=new THREE.Group();root.add(avatar.root);this.scene.add(root);const label=document.createElement('div');label.className='player-label';this.host.append(label);const record={avatar,kind:this.data.avatar,mover:{root,path:[],target:{...point},distance:0},label};this.visitors.set(v.id,record);this.syncMover(record.mover,point,true);void avatar.ready.then(()=>{if(this.disposed||this.visitors.get(v.id)!==record)return;avatar.root.scale.setScalar(CLUB_AVATAR_SCALE);avatar.root.traverse(o=>{if(o instanceof THREE.Mesh){for(const material of Array.isArray(o.material)?o.material:[o.material]){material.transparent=true;material.opacity=.4;material.depthWrite=false;}o.userData.pickThrough=true;}});}).catch(()=>this.handlers.status('本地投影模型加载失败，自己的场景和存档仍保留'));old=record;}
   this.syncMover(old.mover,point);old.label.textContent=v.mode==='example'?'我的分身投影 · 示例庄园':'只读分身 · 本地访客演示';
  }
  disposeTree(this.visitorGroup);this.visitorLabels=[];
  for(const v of active){const grant=v.grantId?p.creation.grants.find(g=>g.id===v.grantId):undefined,layout=grant?{...p.layout,owned:p.layout.owned.filter(c=>grant.regions.includes(regionAt(c)))}:p.layout;const route:GridPoint[]=[];
   for(let i=1;i<v.route.length;i++){const segment=findPath(layout,v.route[i-1],v.route[i]);if(segment)route.push(...segment);}
   pathLine(this.visitorGroup,route,'#c7dfde',.12);
  }
 }
 private drawGhost(){
  disposeTree(this.ghostGroup);if(!this.ghost)return;const rule=BUILDING_RULES[this.ghost.kind],w=gridToWorld(this.ghost);box(this.ghostGroup,this.ghost.valid?'#a1d8b5':'#e7a090',w.x+(rule.width-1)/2,.25,w.z+(rule.depth-1)/2,rule.width-.04,.5,rule.depth-.04,.36);this.ghostGroup.traverse(o=>o.userData.pickThrough=true);
 }
 private point(e:PointerEvent){
  if(this.inputLocked)return;this.keys.clear();this.direction={x:0,z:0};this.stopSteering();
  const r=this.renderer.domElement.getBoundingClientRect(),entity=pickSceneEntity(this.scene.children,this.camera,e,r);if(entity){this.handlers.select(entity);return;}
  this.cursor.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);this.ray.setFromCamera(this.cursor,this.camera);const p=new THREE.Vector3();if(this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),p))this.handlers.destination(worldToGrid(p));
 }
 private moveVisual(m:Mover,dt:number,now=Date.now()+this.offset){
  if(!m.track)return 0;
  const sample=m.track.sample(now),w=gridToWorld(sample.position),blend=1-Math.exp(-dt*12);
  m.root.position.x=w.x;m.root.position.z=w.z;m.distance=sample.distance;
  m.speed=(m.speed??0)+(sample.speed-(m.speed??0))*blend;
  if(sample.speed>.001)m.root.rotation.y+=Math.atan2(Math.sin(sample.heading-m.root.rotation.y),Math.cos(sample.heading-m.root.rotation.y))*blend;
  return m.speed;
 }
 private locomotion(m:Mover,speed:number):ClubMotionState{const origin=m.root.position,heading=m.root.rotation.y,distance=m.distance;return {slot:0,x:origin.x,z:origin.z,heading,speed,distance,walkBlend:clamp(speed/2.4,0,1),action:'dance',sampleAtDistance:d=>{const p=m.track?.sampleAtDistance(d);return p?{...gridToWorld(p),heading:p.heading}:{x:origin.x,z:origin.z,heading};}};}
 private place(el:HTMLElement,point:THREE.Vector3,lift:number){this.projection.copy(point);this.projection.y+=lift;const p=projectCameraLabel(this.projection,this.camera,this.host.clientWidth,this.host.clientHeight);el.hidden=!p;if(p)el.style.transform=`translate(-50%,-100%) translate(${p.x}px,${p.y}px)`;}
 private cameraUpdate(dt:number){
  const bounds=layoutWorldBounds(),focus=this.attention,attention=focus?gridToWorld(focus):undefined;
  this.camera=this.cameraController.update({dt,aspect:this.host.clientWidth/Math.max(1,this.host.clientHeight),mode:this.openingState&&!['defend','done'].includes(this.openingState.stage)?'overview':this.cameraMode,position:this.player.root.position,bounds:{minX:bounds.minX-5.5,maxX:bounds.maxX-5.5,minZ:bounds.minZ-5.5,maxZ:bounds.maxZ-5.5},...(attention?{attention:{...attention,zoom:this.reduced?1:1.06}}:{})});
 }
 private fit(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.cameraUpdate(0);}
 private updateSheep(a:EstateAnimal,t:number,now:number,dt:number){
  const s=this.sheep.get(a.id)!,m=this.animalMovers.get(a.id)!,speed=this.moveVisual(m,dt,now),event=this.data.profile.threat,inDanger=!!event&&event.phase!=='complete',response=sceneResponse(a,inDanger?null:this.data.profile.lastVisual,now,inDanger?0:this.enteredAt,inDanger?undefined:this.data.profile.onlineMs),actor=event?.actors.find(item=>item.id===a.id);
  const feeding=this.data.profile.job?.type==='feed'&&this.data.profile.job.target===a.id&&this.data.profile.job.phase==='act',action=actor?.status==='safe'||a.restAssignment?.phase==='admitted'?'rest':feeding?'eat':response.action;s.update(legacyAnimal(a),response.action?response.elapsed:t,action,feeding?1:response.weight||Number(action==='rest'),speed,response.micro,this.selected===a.id,this.reduced,m.distance);if(action==='eat'&&a.life.stage==='baby'){const grass=s.root.getObjectByName('feeding-grass');if(grass)grass.visible=false;}
  this.place(s.label,s.root.position,1.6*animalScale(a.life)+.24);if(!s.root.visible)s.label.hidden=true;s.label.classList.toggle('selected',this.selected===a.id);s.name.textContent=`${a.name}${a.appearance==='starlit'?' ✦':''}`;
  const stage=a.life.stage==='baby'?'幼崽':a.life.stage==='juvenile'?'少年':'成年';s.memory.textContent=actor?.status==='queued'?'正在排队回棚':actor?.status==='safe'?'已经安全入棚':a.life.hunger<30?'肚子饿了':a.restAssignment?.phase==='admitted'?'安稳休息中':a.life.energy<30?'想休息':`${stage}${a.following?' · 陪你散步':''}`;
  const startled=this.openingState&&['startle','choose','arrival'].includes(this.openingState.stage);s.root.rotation.z=startled&&!this.reduced?Math.sin(t*9)*.025:0;s.bubble.textContent=startled?(a.personality==='shy'?'咩…先躲近一点':a.personality==='independent'?'我往围栏边退一退':'有动静，回小家！'):response.text;s.bubble.hidden=!s.bubble.textContent;
 }
 private updateWolf(w:ThreatWolf,t:number,dt:number){const visual=this.wolves.get(w.id);if(!visual)return;const speed=this.moveVisual(visual.mover,dt);visual.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(visual.mover.distance/1.1*Math.PI*2+(i%2?Math.PI:0))*clamp(speed,0,1)*.5);visual.bubble.visible=w.slowedUntil>(this.data.profile.threat?.elapsed??Infinity);visual.tell.visible=w.status==='windup'||w.status==='grabbing';visual.tell.scale.setScalar(1+Math.sin(t*7)*.09);visual.head.rotation.x=w.status==='grabbing'?.3:0;visual.body.position.y=w.status==='windup'?Math.sin(t*8)*.035:0;}
 private animate(time:number){
  if(this.disposed)return;this.frame=requestAnimationFrame(t=>this.animate(t));const dt=Math.min(.06,(time-this.prev)/1000||.016);this.prev=time;const t=time/1000,now=Date.now()+this.offset,p=this.data.profile;
  this.introBush.visible=this.openingState?.stage==='rustle';if(this.introBush.visible&&this.attention){const w=gridToWorld(this.attention);this.introBush.position.set(w.x,.02,w.z);this.introBush.rotation.z=this.reduced?0:Math.sin(t*21)*.09;}
  const dx=(this.keys.has('d')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('a')||this.keys.has('ArrowLeft')?1:0)+this.direction.x,dz=(this.keys.has('s')||this.keys.has('ArrowDown')?1:0)-(this.keys.has('w')||this.keys.has('ArrowUp')?1:0)+this.direction.z;
  if(!this.inputLocked&&(dx||dz)){const direction=screenMovement(this.camera,dx,dz);if(time-this.sentAt>=150){this.handlers.steer?.(direction);this.steering=true;this.sentAt=time;}}else this.stopSteering();
  const playerSpeed=this.moveVisual(this.player,dt,now),visual=p.lastVisual,age=visual?now-visual.at:Infinity,active=!!visual&&age>=0&&age<6000&&visual.action!=='eat'&&visual.action!=='rest';const reacting=this.openingState?.stage==='startle';this.playerAvatar?.update(active?age/500:t*2,reacting?'bounce':active?visual!.action as 'dance'|'bounce'|'love':'dance',this.reduced||(!reacting&&!active&&playerSpeed<.02),reacting?.25:active?.8:.2,this.locomotion(this.player,playerSpeed));
  const guardSpeed=this.moveVisual(this.guardian,dt),guard=p.threat?.guardian,group=active&&visual?.target==='all';this.guardianAvatar?.update(group?age/500:t*2,'dance',this.reduced||(!group&&!guard?.ability&&guardSpeed<.02),group?.8:guard?.ability?.6:.25,this.locomotion(this.guardian,guardSpeed));
  p.animals.forEach(a=>this.updateSheep(a,t,now,dt));this.updateCareProp();for(const wolf of p.threat?.wolves??[])this.updateWolf(wolf,t,dt);for(const visit of this.visitors.values()){const speed=this.moveVisual(visit.mover,dt,now);visit.avatar.update(t*2,'dance',this.reduced||speed<.02,.2,this.locomotion(visit.mover,speed));this.place(visit.label,visit.mover.root.position,visit.avatar.height*CLUB_AVATAR_SCALE+.3);}this.cameraUpdate(dt);
  this.playerLabel.textContent=`▼ 我 · ${AVATAR_LABEL[this.data.avatar]}`;this.place(this.playerLabel,this.player.root.position,(this.playerAvatar?.height??1.5)*CLUB_AVATAR_SCALE+.3);
  if(this.guardianKind){this.guardianLabel.textContent=`${guardianNames[this.guardianKind]} · ${guard?.ability==='block'?'守住入口':guard?.ability==='calm'?'安抚中':guard?.ability==='gather'?'归拢中':guard?.ability==='bubble'?'泡泡减速':'守护伙伴'}`;this.place(this.guardianLabel,this.guardian.root.position,(this.guardianAvatar?.height??1)*CLUB_AVATAR_SCALE+.25);}else this.guardianLabel.hidden=true;
  this.labels.forEach(label=>this.place(label,new THREE.Vector3(Number(label.dataset.worldX),0,Number(label.dataset.worldZ)),.25));this.visitorLabels.forEach(label=>this.place(label,new THREE.Vector3(Number(label.dataset.worldX),0,Number(label.dataset.worldZ)),1.25));this.renderer.render(this.scene,this.camera);
 }
 capture(){
  if(this.disposed)return undefined;
  try{this.renderer.render(this.scene,this.camera);const camera=cameraCapture(this.camera,this.camera.position.distanceTo(this.player.root.position)),source=this.renderer.domElement,scale=Math.min(180/Math.max(1,source.width),320/Math.max(1,source.height));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));const context=canvas.getContext('2d');if(!context)return undefined;context.drawImage(source,0,0,canvas.width,canvas.height);const thumbnail=canvas.toDataURL('image/webp',.65);if(!/^data:image\/(?:webp|jpeg|png);base64,/.test(thumbnail)||thumbnail.length>40000)return {camera};return {camera,thumbnail};
  }catch{return undefined;}
 }
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.listenerCleanup.forEach(fn=>fn());this.sheep.forEach(s=>s.cleanup());this.playerAvatar?.dispose();this.guardianAvatar?.dispose();this.visitors.forEach(v=>v.avatar.dispose());disposeTree(this.introBush);disposeTree(this.careProp);disposeTree(this.layoutGroup);disposeTree(this.routeGroup);disposeTree(this.effectGroup);disposeTree(this.ghostGroup);disposeTree(this.visitorGroup);this.wolves.forEach(w=>disposeTree(w.root));this.sheep.forEach(s=>disposeTree(s.root));this.renderer.dispose();this.host.replaceChildren();}
}
