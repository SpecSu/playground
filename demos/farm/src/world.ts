import * as THREE from 'three';
import {createClubAvatar,type ClubAvatar} from './avatars/club-avatar-rig.ts';
import type {ClubMotionState} from './avatars/club-scene-motion.ts';
import {ClubCameraController,projectCameraLabel,type ClubCameraMode} from './avatars/club-camera.ts';
import {CLUB_AVATAR_SCALE} from './avatars/club-avatar-scale.ts';
import {CameraMovementGesture} from './farm-camera.ts';
import {SceneTapGesture,pickSceneEntity,bindEntityLabel} from './picking.ts';
import {assetStatusText,type AssetStatus} from './asset-status.ts';
import {makeSheep} from './sheep.ts';
import {makeEnvironment} from './environment.ts';
import {HOMES,keepInMeadow,responseAt,sheepAnimationTime,sheepDestination,type Point} from './navigation.ts';
import {ACTIONS,AVATAR_LABEL,type Snapshot,type FarmEvent,type Action,type Animal} from './model.ts';

type Handlers={select:(id:string)=>void;status:(message:string)=>void};
type Sheep=ReturnType<typeof makeSheep> & {label:HTMLButtonElement;bubble:HTMLSpanElement;name:HTMLElement;memory:HTMLElement};
const clamp=THREE.MathUtils.clamp;
export class FarmWorld {
 private playerStatus:AssetStatus='loading';private guardianStatus:AssetStatus='loading';
 private scene=new THREE.Scene();private cameraController=new ClubCameraController();private camera:THREE.Camera=this.cameraController.overview;private cameraMode:ClubCameraMode='overview';
 private renderer:THREE.WebGLRenderer;private frame=0;private disposed=false;private resize:ResizeObserver;
 private data:Snapshot;private event:FarmEvent|undefined;private selected='all';private reduced=false;
 private env:ReturnType<typeof makeEnvironment>;private sheep:Sheep[]=[];private player:ClubAvatar|undefined;private guardian:ClubAvatar;
 private playerGroup=new THREE.Group();private guardianGroup=new THREE.Group();
 private guardDistance=0;
 private destination:Point={x:0,z:2.7};private distance=0;private prevTime=0;private lastEvent='';private offset=0;
 private keys=new Set<string>();private direction:Point={x:0,z:0};private sceneTap=new SceneTapGesture();private ray=new THREE.Raycaster();private cursor=new THREE.Vector2();
 private movementGesture=new CameraMovementGesture();
 private listenerCleanup:(()=>void)[]=[];private projection=new THREE.Vector3();
 private host:HTMLDivElement;private handlers:Handlers;
 constructor(host:HTMLDivElement,data:Snapshot,handlers:Handlers){
   this.host=host;this.handlers=handlers;
   this.data=data;this.offset=data.now-Date.now();this.scene.background=new THREE.Color('#edf3dc');this.scene.fog=new THREE.Fog('#edf3dc',30,65);

   this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
   const canvas=this.renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','农场草地，点击移动，点小羊选择。方向键或 WASD 行走。');this.host.append(canvas);
   this.scene.add(new THREE.HemisphereLight('#fff9e9','#a8b984',2.5));const sun=new THREE.DirectionalLight('#fff0d5',3);sun.position.set(-6,14,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-11;sun.shadow.camera.right=11;sun.shadow.camera.top=11;sun.shadow.camera.bottom=-11;sun.shadow.normalBias=.04;this.scene.add(sun);
   this.env=makeEnvironment(this.scene);
   data.animals.forEach((a,i)=>{const sheep=makeSheep(a);sheep.root.position.set(HOMES[i].x,0,HOMES[i].z);sheep.root.userData.entityId=a.id;this.scene.add(sheep.root);
     const label=document.createElement('button');label.className='animal-label';label.setAttribute('aria-label',`选择${a.name}`);
     const name=document.createElement('strong'),memory=document.createElement('small'),bubble=document.createElement('span');bubble.className='world-bubble';label.append(bubble,name,memory);name.textContent=a.name;label.style.setProperty('--sheep-color',a.color);this.listenerCleanup.push(bindEntityLabel(label,a.id,handlers.select));this.host.append(label);this.sheep.push({...sheep,label,bubble,name,memory});
   });
   this.scene.add(this.playerGroup,this.guardianGroup);this.playerGroup.position.set(0,0,2.7);this.guardianGroup.position.set(-2,0,2.6);
   this.guardianGroup.userData.entityId='guardian';
   this.guardian=createClubAvatar('milk-frog','farm-guardian');this.guardianGroup.add(this.guardian.root);void this.guardian.ready.then(()=>{if(!this.disposed){this.guardian.root.scale.setScalar(CLUB_AVATAR_SCALE);this.guardianStatus='ready';this.reportAssets();}}).catch(()=>{if(!this.disposed){this.guardianStatus='error';this.reportAssets();}});
   this.installAvatar(data.avatar);
   const guardianLabel=document.createElement('button');guardianLabel.className='guardian-label';guardianLabel.textContent='奶蛙 · 守护伙伴';guardianLabel.setAttribute('aria-label','查看奶蛙守护伙伴');this.listenerCleanup.push(bindEntityLabel(guardianLabel,'guardian',handlers.select));this.host.append(guardianLabel);
   const playerLabel=document.createElement('div');playerLabel.className='player-label';playerLabel.textContent='▼ 我';this.host.append(playerLabel);
   this.positionLabels=(now:number)=>{
     this.sheep.forEach((s,i)=>{const a=this.data.animals[i];this.place(s.label,s.root.position,2.1);s.label.classList.toggle('selected',this.selected===a.id);s.name.textContent=`${a.name}${a.appearance==='starlit'?' ✦':''}`;
       const response=responseAt(this.event,a.id,now);const invite=this.invitation(a,i,now);s.bubble.textContent=response?.reaction.text||(invite?'想和你再来一段 ♫':'');s.bubble.hidden=!s.bubble.textContent;s.memory.textContent=a.habits.dance?.stage==='invite'?'♫ 记得你的舞步':a.habits.dance?.stage==='imitate'?'♫ 学着你的舞步':'';
     });this.place(guardianLabel,this.guardianGroup.position,this.guardian.height*CLUB_AVATAR_SCALE+.3);playerLabel.textContent=`▼ 我 · ${AVATAR_LABEL[this.data.avatar]}`;this.place(playerLabel,this.playerGroup.position,(this.player?.height??1.5)*CLUB_AVATAR_SCALE+.35);
   };
   this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);this.fit();
   const listen=(target:EventTarget,type:string,fn:EventListener)=>{target.addEventListener(type,fn);this.listenerCleanup.push(()=>target.removeEventListener(type,fn));};
   listen(canvas,'pointerdown',((e:PointerEvent)=>{if(!this.sceneTap.begin(e))return;canvas.focus();canvas.setPointerCapture(e.pointerId);}) as EventListener);
   listen(canvas,'pointermove',((e:PointerEvent)=>this.sceneTap.move(e)) as EventListener);
   listen(canvas,'pointerup',((e:PointerEvent)=>{if(this.sceneTap.end(e))this.point(e);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}) as EventListener);
   listen(canvas,'pointercancel',((e:PointerEvent)=>this.sceneTap.cancel(e.pointerId)) as EventListener);listen(canvas,'lostpointercapture',((e:PointerEvent)=>this.sceneTap.cancel(e.pointerId)) as EventListener);
   listen(canvas,'keydown',((e:KeyboardEvent)=>{if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){this.keys.add(e.key);e.preventDefault();}}) as EventListener);
   listen(canvas,'keyup',((e:KeyboardEvent)=>{this.keys.delete(e.key);}) as EventListener);listen(canvas,'blur',(()=>{this.keys.clear();this.direction={x:0,z:0};}) as EventListener);
   listen(canvas,'webglcontextlost',((e:Event)=>{e.preventDefault();handlers.status('3D 画面连接中断，请刷新恢复；已保存的关系仍在。');}) as EventListener);
   this.frame=requestAnimationFrame(t=>this.animate(t));
 }
 private positionLabels: (now:number)=>void=()=>{};
 private reportAssets(){this.handlers.status(assetStatusText(this.playerStatus,this.guardianStatus));}
 private installAvatar(kind:Snapshot['avatar']){
   this.player?.dispose();if(this.player)this.playerGroup.remove(this.player.root);
   const avatar=createClubAvatar(kind,'farm-player');this.player=avatar;this.playerGroup.add(avatar.root);
   this.playerStatus='loading';this.reportAssets();
   void avatar.ready.then(()=>{if(!this.disposed&&this.player===avatar){avatar.root.scale.setScalar(CLUB_AVATAR_SCALE);this.playerStatus='ready';this.reportAssets();}}).catch(()=>{if(!this.disposed&&this.player===avatar){this.playerStatus='error';this.reportAssets();}});
 }
 set(data:Snapshot,event:FarmEvent|undefined,target:string,reduced:boolean,cameraMode:ClubCameraMode='overview'){
   if(data.avatar!==this.data.avatar)this.installAvatar(data.avatar);
   if(data!==this.data)this.offset=data.now-Date.now();
   if(this.cameraMode!==cameraMode){this.movementGesture.reset();this.direction={x:0,z:0};this.keys.clear();this.destination={x:this.playerGroup.position.x,z:this.playerGroup.position.z};}
   this.data=data;this.event=event;this.selected=target;this.reduced=reduced;this.cameraMode=cameraMode;this.env.stage.visible=data.stage;
   if(event&&event.id!==this.lastEvent){this.lastEvent=event.id;this.destination={x:this.playerGroup.position.x,z:this.playerGroup.position.z};
     if(event.kind==='stage')this.destination={x:3.6,z:3.25};
     const facing=target==='all'?new THREE.Vector3(0,0,-1):this.sheep[data.animals.findIndex(a=>a.id===target)]?.root.position.clone().sub(this.playerGroup.position);if(facing)this.playerGroup.rotation.y=Math.atan2(facing.x,facing.z);
   }
 }
 move(direction:Point){this.direction=direction;if(!direction.x&&!direction.z){this.movementGesture.reset();this.destination={x:this.playerGroup.position.x,z:this.playerGroup.position.z};}}
 private updateCamera(dt:number){this.camera=this.cameraController.update({width:this.host.clientWidth,height:this.host.clientHeight,mode:this.cameraMode,orbit:{yaw:0,pitch:0},headingLock:this.movementGesture.headingLock,subject:{id:'farm-player',position:this.playerGroup.position,heading:this.playerGroup.rotation.y,height:(this.player?.height??1.5)*CLUB_AVATAR_SCALE,radius:(this.player?.footprintRadius??.6)*CLUB_AVATAR_SCALE,displayScale:CLUB_AVATAR_SCALE,groundLift:(this.player?.groundLift??0)*CLUB_AVATAR_SCALE},deltaSeconds:dt,reducedMotion:this.reduced});}
 private fit(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.updateCamera(0);}
 private place(el:HTMLElement,point:THREE.Vector3,lift:number){this.projection.copy(point);this.projection.y+=lift;const position=projectCameraLabel(this.projection,this.camera,this.host.clientWidth,this.host.clientHeight);el.hidden=!position;if(position)el.style.transform=`translate(-50%,-100%) translate(${position.x}px,${position.y}px)`;}
 private point(e:PointerEvent){const r=this.renderer.domElement.getBoundingClientRect();const entity=pickSceneEntity(this.scene.children,this.camera,e,r);if(entity){this.handlers.select(entity);return;}
   this.cursor.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.cursor,this.camera);
   const point=new THREE.Vector3();if(this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),point))this.destination=keepInMeadow(point);
 }
 private invitation(a:Animal,i:number,now:number):Action|undefined{
   if(this.event&&now-this.event.at<10000)return;
   const action=ACTIONS.find(k=>a.habits[k]?.stage==='invite');
   return action&&((now/1000-i*6)%24+24)%24<4?action:undefined;
 }
 private animate(time:number){
   if(this.disposed)return;this.frame=requestAnimationFrame(t=>this.animate(t));const dt=Math.min(.05,(time-this.prevTime)/1000||.016);this.prevTime=time;const now=Date.now()+this.offset,t=time/1000;
   const dx=(this.keys.has('d')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('a')||this.keys.has('ArrowLeft')?1:0)+this.direction.x;
   const dz=(this.keys.has('s')||this.keys.has('ArrowDown')?1:0)-(this.keys.has('w')||this.keys.has('ArrowUp')?1:0)+this.direction.z;
   if(dx||dz){const ground=this.movementGesture.sample(this.camera,this.cameraMode,dx,dz);this.destination=keepInMeadow({x:this.playerGroup.position.x+ground.x*.7,z:this.playerGroup.position.z+ground.z*.7});}
   else if(this.movementGesture.active){this.movementGesture.reset();this.destination={x:this.playerGroup.position.x,z:this.playerGroup.position.z};}
   const speed=this.walk(this.playerGroup,this.destination,dt,2.8);this.distance+=speed*dt;
   const age=this.event?now-this.event.at:Infinity;const active=this.event&&age>=0&&age<6000&&['action','rhythm','stage','feed','company'].includes(this.event.kind);
   const action=active?this.event!.action:undefined;const beat=active?age/500:t*2;
   const heading=this.playerGroup.rotation.y,origin=this.playerGroup.position.clone(),distance=this.distance;
   const locomotion:ClubMotionState={slot:0,x:origin.x,z:origin.z,heading,speed,distance,walkBlend:clamp(speed/2.8,0,1),action:action||'dance',sampleAtDistance:d=>({x:origin.x+Math.sin(heading)*(d-distance),z:origin.z+Math.cos(heading)*(d-distance),heading})};
   this.player?.update(beat,action||'dance',this.reduced||(!action&&!speed),active?.7:.2,locomotion);
   const group=active&&this.event?.kind==='rhythm';const guardDestination=group?{x:-1,z:1}:{x:this.playerGroup.position.x-1.8,z:this.playerGroup.position.z+.4};
   const guardSpeed=this.walk(this.guardianGroup,keepInMeadow(guardDestination),dt,1.6);
   this.guardDistance+=guardSpeed*dt;
   const guardOrigin=this.guardianGroup.position.clone(),guardHeading=this.guardianGroup.rotation.y,guardDistance=this.guardDistance;
   this.guardian.update(group?age/500:t*2,'dance',this.reduced||(!group&&guardSpeed<.05),group?.8:.25,{...locomotion,x:guardOrigin.x,z:guardOrigin.z,distance:guardDistance,walkBlend:clamp(guardSpeed/1.6,0,1),speed:guardSpeed,heading:guardHeading,sampleAtDistance:d=>({x:guardOrigin.x+Math.sin(guardHeading)*(d-guardDistance),z:guardOrigin.z+Math.cos(guardHeading)*(d-guardDistance),heading:guardHeading})});
   this.sheep.forEach((s,i)=>{const a=this.data.animals[i],r=responseAt(this.event,a.id,now),invitation=this.invitation(a,i,now);const center=this.event?.kind==='stage'&&age<8500?{x:3.6,z:3.25}:this.playerGroup.position;
     const company=this.data.company?.animalId===a.id&&now<=this.data.company.expiresAt;
     const distance=a.personality==='shy'?2.5:a.personality==='independent'?3:1.35;
     const destination=company&&!r?keepInMeadow({x:this.playerGroup.position.x+Math.sin((i-1)*.8)*distance,z:this.playerGroup.position.z-Math.cos((i-1)*.8)*distance}):sheepDestination(HOMES[i],center,r?.micro?undefined:r?.reaction,i,t);const moving=this.walk(s.root,destination,dt,a.personality==='eager'?1.6:a.personality==='shy'?.6:1.0);
     if(r&&!r.micro){const toward=this.playerGroup.position.clone().sub(s.root.position);s.root.rotation.y=Math.atan2(toward.x,toward.z);}
     const sheepAction=r&&!r.micro?(this.event?.kind==='feed'?'eat':r.reaction.action):company&&!r?'rest':invitation;const elapsed=sheepAnimationTime(r,t);const weight=r?Math.min(1,Math.max(0,r.elapsed/400))*Math.min(1,(8500-age)/650):company||invitation?1:0;
     s.update(a,elapsed,sheepAction,weight,moving,r?.micro||false,this.selected===a.id||this.selected==='all',this.reduced);
   });
   this.env.update(t,this.reduced);this.updateCamera(dt);this.positionLabels(now);this.renderer.render(this.scene,this.camera);
 }
 private walk(group:THREE.Group,to:Point,dt:number,speed:number){const dx=to.x-group.position.x,dz=to.z-group.position.z,d=Math.hypot(dx,dz);if(d<.035)return 0;const step=Math.min(d,speed*dt);group.position.x+=dx/d*step;group.position.z+=dz/d*step;group.rotation.y+=Math.atan2(Math.sin(Math.atan2(dx,dz)-group.rotation.y),Math.cos(Math.atan2(dx,dz)-group.rotation.y))*Math.min(1,dt*7);return step/dt;}
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.listenerCleanup.forEach(f=>f());this.player?.dispose();this.guardian.dispose();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.renderer.dispose();this.host.replaceChildren();}
}
