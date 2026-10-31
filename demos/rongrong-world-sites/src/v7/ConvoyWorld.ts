import * as THREE from 'three';
import {createClubAvatar,type ClubAvatar,type ClubAvatarKind} from '../avatars/club-avatar-rig.ts';
import type {ClubMotionState} from '../avatars/club-scene-motion.ts';
import {EstateCameraController,screenMovement} from '../v5/isometric-camera.ts';
import {SceneTapGesture} from '../picking.ts';
import {makeSheep} from '../sheep.ts';
import {createFarm} from '../model.ts';
import {CONVOY_GATES,CONVOY_SCOUT,CONVOY_END,routeCells,convoyTrackAt,convoyDirectionalTarget,type ConvoySnapshot,type Actor,type Point} from './convoy.ts';
const color={grass:'#8ab874',road:'#ddc9a0',cover:'#bad29c',wall:'#849575'};
const world=(p:Point)=>new THREE.Vector3(p.x-8,0,p.z-7);
const kinds={dog:'sword-shield-dog',cat:'miaocuijiao',frog:'milk-frog'} as const;
/** The same projection function is used by canvas taps and numerical Three.js regression checks. */
export function convoyGroundHit(camera:THREE.Camera,point:{clientX:number;clientY:number},rect:{left:number;top:number;width:number;height:number}):Point|null{
 if(rect.width<=0||rect.height<=0||point.clientX<rect.left||point.clientX>rect.left+rect.width||point.clientY<rect.top||point.clientY>rect.top+rect.height)return null;
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((point.clientX-rect.left)/rect.width*2-1,1-(point.clientY-rect.top)/rect.height*2),camera);
 const hit=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)?{x:Math.round(hit.x+8),z:Math.round(hit.z+7)}:null;
}
/** Same fixed orthographic camera and avatar rigs as the farm. No browser simulation or fake remote movement. */
export class ConvoyWorld{
 private host:HTMLElement;private scene=new THREE.Scene();private camera=new EstateCameraController();private renderer:THREE.WebGLRenderer;
 private snapshot:ConvoySnapshot|null=null;private receivedAt=0;private renderTime=0;private frame=0;private previous=0;private resize:ResizeObserver;
 private carrier:ClubAvatar;private guardian:ClubAvatar;private guardianKind:ClubAvatarKind='sword-shield-dog';
 private cart=new THREE.Group();private wolf=new THREE.Group();private legs:THREE.Mesh[]=[];private sheep=createFarm('convoy-training',0).animals.map(a=>({animal:a,rig:makeSheep(a)}));
 private gates=new Map<string,THREE.Group>();private roads=new Map<string,THREE.Mesh>();private labels:{element:HTMLDivElement;point:Point;text:string}[]=[];
 private effect:THREE.Mesh;private marker:THREE.Mesh;private keys=new Set<string>();private lastKeyCommand=0;private tap=new SceneTapGesture();private listeners:(()=>void)[]=[];
 private travelled={carrier:0,guard:0,cart:0,wolf:0};private lastPositions:Partial<Record<'carrier'|'guard'|'cart'|'wolf',Point>>={};private headings={carrier:Math.PI/2,guard:Math.PI/2};private blends={carrier:0,guard:0};private disposed=false;
 private onMove:(point:Point)=>void;private onError:(message:string)=>void;
 constructor(host:HTMLElement,onMove:(point:Point)=>void,onError:(message:string)=>void){
  this.host=host;this.onMove=onMove;this.onError=onError;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
  host.appendChild(this.renderer.domElement);this.scene.background=new THREE.Color('#b9d4b4');this.scene.add(new THREE.HemisphereLight('#fff5df','#78936c',2.4));const light=new THREE.DirectionalLight('#fff1d8',3);light.position.set(-9,17,8);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-12,right:12,top:12,bottom:-12});this.scene.add(light);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(19,17),new THREE.MeshStandardMaterial({color:color.grass}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;this.scene.add(ground);
  const roadCells=new Map([...routeCells('covered'),...routeCells('short')].map(p=>[`${p.x},${p.z}`,p]));roadCells.set('1,4',{x:1,z:4});
  for(const [key,p] of roadCells){const tile=new THREE.Mesh(new THREE.BoxGeometry(.96,.035,.96),new THREE.MeshStandardMaterial({color:color.road}));tile.position.copy(world(p)).setY(.018);tile.receiveShadow=true;this.scene.add(tile);this.roads.set(key,tile);}
  for(let z=0;z<=14;z++){if(z===4||z===11)continue;const rock=this.box(color.wall,.85,.6+(z%3)*.18,.93);rock.position.set(0,.36,z-7);this.scene.add(rock);}
  for(const [route,p] of Object.entries(CONVOY_GATES)){const group=new THREE.Group();group.position.copy(world(p));for(const x of [-.48,.48]){const post=this.box('#716848',.14,.95,.14);post.position.set(x,.45,0);group.add(post);}const bar=this.box('#ba8560',.85,.18,.18);bar.position.y=.55;bar.name='bar';group.add(bar);this.scene.add(group);this.gates.set(route,group);this.label(p,route==='short'?'短路门':'掩护路门');}
  for(const p of [{x:5,z:10},{x:6,z:12},{x:9,z:12},{x:11,z:10},{x:13,z:10}]){const bush=new THREE.Mesh(new THREE.SphereGeometry(.65,10,7),new THREE.MeshStandardMaterial({color:'#648953'}));bush.position.copy(world(p)).setY(.38);bush.scale.y=.7;this.scene.add(bush);}
  this.label(CONVOY_SCOUT,'观察点');this.label(CONVOY_END,'庇护所');this.label({x:2,z:4},'出发地');
  const scout=new THREE.Mesh(new THREE.CylinderGeometry(.42,.55,.12,24),new THREE.MeshStandardMaterial({color:'#8bbbc6'}));scout.position.copy(world(CONVOY_SCOUT)).setY(.06);this.scene.add(scout);
  const safe=new THREE.Mesh(new THREE.CircleGeometry(1.2,32),new THREE.MeshStandardMaterial({color:'#e8d8a7'}));safe.rotation.x=-Math.PI/2;safe.position.copy(world(CONVOY_END)).setY(.04);this.scene.add(safe);
  for(const z of [-.9,.9])for(const x of [-.9,.9]){const post=this.box('#f5e5c1',.1,.65,.1);post.position.copy(world(CONVOY_END)).add(new THREE.Vector3(x,.325,z));this.scene.add(post);}
  const bed=this.box('#b6824f',.7,.24,.85);bed.position.y=.4;this.cart.add(bed);for(const x of [-.4,.4])for(const z of [-.28,.28]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.09,12),new THREE.MeshStandardMaterial({color:'#605344'}));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.18,z);this.cart.add(wheel);}for(const x of [-.18,.18]){const wool=new THREE.Mesh(new THREE.SphereGeometry(.24,10,8),new THREE.MeshStandardMaterial({color:'#f5ead6'}));wool.position.set(x,.67,0);this.cart.add(wool);}this.scene.add(this.cart);
  const body=this.box('#6b7078',.55,.48,.9);body.position.y=.55;this.wolf.add(body);const head=this.box('#7f858b',.4,.35,.4);head.position.set(0,.78,.5);this.wolf.add(head);for(const x of [-.14,.14]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.12,.25,3),new THREE.MeshStandardMaterial({color:'#6b7078'}));ear.position.set(x,1.04,.48);this.wolf.add(ear);}for(const x of [-.2,.2])for(const z of [-.3,.3]){const leg=this.box('#555d64',.12,.4,.14);leg.position.set(x,.2,z);this.wolf.add(leg);this.legs.push(leg);}this.scene.add(this.wolf);
  this.carrier=createClubAvatar('human-lx','convoy-carrier');this.guardian=createClubAvatar(this.guardianKind,'convoy-guard');this.installAvatar(this.carrier);this.installAvatar(this.guardian);
  this.sheep.forEach(({rig},i)=>{rig.root.scale.setScalar(.38);rig.root.name=`training-sheep-${i}`;this.scene.add(rig.root);});
  this.effect=new THREE.Mesh(new THREE.RingGeometry(2.5,2.58,48),new THREE.MeshBasicMaterial({color:'#c3effa',transparent:true,opacity:.65,side:THREE.DoubleSide}));this.effect.rotation.x=-Math.PI/2;this.effect.position.y=.07;this.scene.add(this.effect);
  this.marker=new THREE.Mesh(new THREE.RingGeometry(.24,.32,32),new THREE.MeshBasicMaterial({color:'#fff7d3',side:THREE.DoubleSide}));this.marker.rotation.x=-Math.PI/2;this.marker.visible=false;this.scene.add(this.marker);
  const canvas=this.renderer.domElement;
  this.listen(canvas,'pointerdown',(e:PointerEvent)=>{if(this.tap.begin(e))canvas.setPointerCapture(e.pointerId);});
  this.listen(canvas,'pointermove',(e:PointerEvent)=>this.tap.move(e));
  this.listen(canvas,'pointerup',(e:PointerEvent)=>{const tapped=this.tap.end(e);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(tapped)this.pick(e.clientX,e.clientY);});
  this.listen(canvas,'pointercancel',(e:PointerEvent)=>this.tap.cancel(e.pointerId));
  this.listen(window,'keydown',(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select,button'))return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(key)){e.preventDefault();this.keys.add(key);}});
  this.listen(window,'keyup',(e:KeyboardEvent)=>this.keys.delete(e.key.toLowerCase()));this.listen(window,'blur',()=>this.keys.clear());
  this.resize=new ResizeObserver(()=>this.renderer.setSize(host.clientWidth,host.clientHeight,false));this.resize.observe(host);this.renderer.setSize(host.clientWidth,host.clientHeight,false);this.frame=requestAnimationFrame(this.tick);
 }
 private box(color:string,w:number,h:number,d:number){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.85}));mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
 private installAvatar(avatar:ClubAvatar){avatar.root.scale.setScalar(.48);this.scene.add(avatar.root);void avatar.ready.catch(()=>{if(!this.disposed)this.onError('分身模型未加载，请确认网络后刷新；房间进度已保存');});}
 private label(point:Point,text:string){const element=document.createElement('div');element.className='convoy-world-label';element.textContent=text;this.host.appendChild(element);this.labels.push({element,point,text});}
 private listen<T extends Event>(target:EventTarget,event:string,handler:(event:T)=>void){target.addEventListener(event,handler as EventListener);this.listeners.push(()=>target.removeEventListener(event,handler as EventListener));}
 private pick(clientX:number,clientY:number){
  if(!this.snapshot||this.snapshot.room.phase!=='active')return;const target=convoyGroundHit(this.camera.camera,{clientX,clientY},this.renderer.domElement.getBoundingClientRect());if(target){this.marker.position.copy(world(target)).setY(.08);this.marker.visible=true;this.onMove(target);}
 }
 set(snapshot:ConvoySnapshot){
  if(this.snapshot&&this.snapshot.room.id===snapshot.room.id&&snapshot.room.revision<this.snapshot.room.revision)return;
  if(!this.snapshot||this.snapshot.room.id!==snapshot.room.id){this.renderTime=Math.max(0,snapshot.room.elapsed-.35);this.lastPositions={};this.camera.reset();}
  this.snapshot=snapshot;this.receivedAt=performance.now();const kind=kinds[snapshot.room.guardian];if(kind!==this.guardianKind){this.scene.remove(this.guardian.root);this.guardian.dispose();this.guardianKind=kind;this.guardian=createClubAvatar(kind,'convoy-guard');this.installAvatar(this.guardian);}
  const selected=new Set(routeCells(snapshot.room.route).map(p=>`${p.x},${p.z}`));for(const [key,tile]of this.roads)(tile.material as THREE.MeshStandardMaterial).color.set(selected.has(key)?'#f0d7a6':color.cover);
  for(const [route,gate]of this.gates){const bar=gate.getObjectByName('bar')!;bar.rotation.z=snapshot.room.gates[route as 'short'|'covered']?Math.PI/2:0;}
 }
 private position(kind:'carrier'|'guard'|'cart'|'wolf',position:Point,dt:number){const previous=this.lastPositions[kind]??position;const dx=position.x-previous.x,dz=position.z-previous.z,distance=Math.hypot(dx,dz);this.travelled[kind]+=distance;this.lastPositions[kind]=position;return {speed:dt>0?distance/dt:0,heading:distance>.00001?Math.atan2(dx,dz):undefined};}
 private avatar(avatar:ClubAvatar,kind:'carrier'|'guard',actor:Actor,time:number,dt:number){
  const p=convoyTrackAt(actor.track,time),movement=this.position(kind,p,dt);if(movement.heading!==undefined){const diff=Math.atan2(Math.sin(movement.heading-this.headings[kind]),Math.cos(movement.heading-this.headings[kind]));this.headings[kind]+=diff*(1-Math.exp(-14*dt));}
  this.blends[kind]+=(Math.min(1,movement.speed/.45)-this.blends[kind])*(1-Math.exp(-12*dt));avatar.root.position.copy(world(p));avatar.root.rotation.y=this.headings[kind];
  const motion:ClubMotionState={slot:0,x:avatar.root.position.x,z:avatar.root.position.z,heading:this.headings[kind],speed:movement.speed,distance:this.travelled[kind],walkBlend:this.blends[kind],action:'dance'};
  avatar.update(time,'dance',false,0,motion);return p;
 }
 private tick=(at:number)=>{
  if(this.disposed)return;const dt=Math.min(.05,Math.max(0,(at-this.previous)/1000));this.previous=at;const s=this.snapshot;
  if(s){
   const room=s.room;const estimate=room.elapsed+(at-this.receivedAt)/1000-.35;this.renderTime=Math.max(this.renderTime,Math.min(room.elapsed,estimate));const time=this.renderTime;
   const carrier=this.avatar(this.carrier,'carrier',room.carrier,time,dt),guard=this.avatar(this.guardian,'guard',room.guard,time,dt),cart=convoyTrackAt(room.cart.track,time),wolf=convoyTrackAt(room.wolfTrack,time);
   const cartMovement=this.position('cart',cart,dt);this.cart.position.copy(world(cart));if(cartMovement.heading!==undefined)this.cart.rotation.y=cartMovement.heading;
   const wolfMovement=this.position('wolf',wolf,dt);this.wolf.visible=room.scouted||room.elapsed>=6;this.wolf.position.copy(world(wolf));if(wolfMovement.heading!==undefined)this.wolf.rotation.y=wolfMovement.heading;this.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(this.travelled.wolf*7+i%2*Math.PI)*Math.min(1,wolfMovement.speed)*.35);
   this.sheep.forEach(({rig,animal},i)=>{const p=convoyTrackAt(room.cart.track,Math.max(0,time-(i+1)*.4));rig.root.position.copy(world(p)).add(new THREE.Vector3((i%2?-.35:.35),0,.25));rig.root.rotation.y=this.cart.rotation.y;rig.update(animal,time,undefined,0,cartMovement.speed,false,false,false,this.travelled.cart);});
   this.effect.visible=room.elapsed<room.effectUntil;this.effect.position.copy(world(guard)).setY(.07);(this.effect.material as THREE.MeshBasicMaterial).color.set(room.guardian==='dog'?'#ffe09b':room.guardian==='cat'?'#e4b5f0':'#b8e8f4');
   const self=s.selfRole==='carrier'?carrier:guard;this.camera.update({dt,aspect:Math.max(.1,this.host.clientWidth/this.host.clientHeight),mode:'third-person',position:world(self),bounds:{minX:-7,maxX:7,minZ:-6,maxZ:6}});
   if(this.keys.size&&at-this.lastKeyCommand>220&&room.phase==='active'){
    this.lastKeyCommand=at;const dx=Number(this.keys.has('d')||this.keys.has('arrowright'))-Number(this.keys.has('a')||this.keys.has('arrowleft')),dz=Number(this.keys.has('s')||this.keys.has('arrowdown'))-Number(this.keys.has('w')||this.keys.has('arrowup'));const direction=screenMovement(this.camera.camera,dx,dz);
    const target=convoyDirectionalTarget(room,s.selfRole,direction);if(target)this.onMove(target);
   }
  }
  for(const label of this.labels){const p=world(label.point).setY(.9).project(this.camera.camera);label.element.style.transform=`translate(-50%,-50%) translate(${(p.x+1)/2*this.host.clientWidth}px,${(1-p.y)/2*this.host.clientHeight}px)`;label.element.hidden=Math.abs(p.x)>1.2||Math.abs(p.y)>1.1;}
  this.renderer.render(this.scene,this.camera.camera);this.frame=requestAnimationFrame(this.tick);
 };
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.listeners.forEach(fn=>fn());this.labels.forEach(label=>label.element.remove());this.carrier.dispose();this.guardian.dispose();this.scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose());}});this.renderer.dispose();this.renderer.domElement.remove();}
}
