import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createClubAvatar,type ClubAvatar} from '../avatars/club-avatar-rig.ts';
import {makeSheep} from '../sheep.ts';
import type {Animal as LegacyAnimal} from '../model.ts';
import {FarmActionRig} from '../v5/farm-action-rig.ts';
import {feedingPoseAt,guardianPoseAt} from '../v5/action-sequence.ts';
import {continuousRoute,type MinimalState,type Point} from './model.ts';

export type WorldTarget={kind:'tile';x:number;z:number}|{kind:'animal';id:string};
export type MinimalWorldHandlers={select:(target:WorldTarget)=>void;arrive:(point:Point)=>void;status?:(text:string)=>void};
const CELL=2;
const toWorld=(p:Point)=>new THREE.Vector3((p.x-1.5)*CELL,.04,(p.z-1.5)*CELL);
const toGrid=(p:THREE.Vector3):Point=>({x:p.x/CELL+1.5,z:p.z/CELL+1.5});
const smooth=(x:number)=>{const v=THREE.MathUtils.clamp(x,0,1);return v*v*(3-2*v);};
function disposeTree(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
function shape(parent:THREE.Object3D,geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number){const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.88}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function sphere(parent:THREE.Object3D,color:string,x:number,y:number,z:number,sx:number,sy=sx,sz=sx){const m=shape(parent,new THREE.SphereGeometry(1,12,8),color,x,y,z);m.scale.set(sx,sy,sz);return m;}
function box(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h:number,d:number,r=.07){return shape(parent,new RoundedBoxGeometry(w,h,d,2,r),color,x,y,z);}
function tree(parent:THREE.Object3D,x:number,z:number,s=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);parent.add(g);shape(g,new THREE.CylinderGeometry(.065,.09,.8,7),'#A8794D',0,.4,0);sphere(g,'#649164',0,.95,0,.49,.64,.48);sphere(g,'#82A46C',-.18,1.17,.04,.3,.37,.32);return g;}
function legacyAnimal(id:string,name:string,index:number):LegacyAnimal{return {id,name,personality:index%2?'shy':'eager',preference:'love',color:index%2?'#b2b7df':'#efa376',bond:0,habits:{},experiences:[],appearance:'plain',growthEligible:false,growthChoiceMade:true,care:{feedCount:0,companyCount:0,lastFeedAt:0,lastCompanyAt:0}};}
function wolf(){const root=new THREE.Group(),body=new THREE.Group();root.add(body);sphere(body,'#879293',0,.44,0,.24,.26,.45);const head=new THREE.Group();head.position.set(0,.69,.36);body.add(head);sphere(head,'#A8AFA8',0,0,0,.21,.22,.24);sphere(head,'#D5D7C4',0,-.09,.2,.14,.11,.16);sphere(head,'#3E4A4B',0,-.05,.34,.06,.045,.04);for(const side of [-1,1]){shape(head,new THREE.ConeGeometry(.09,.22,3),'#6E8080',side*.13,.24,-.015);sphere(head,'#E8BF70',side*.14,.045,.18,.027,.032,.026);}const legs=Array.from({length:4},(_,i)=>{const leg=new THREE.Group();body.add(leg);leg.position.set(i%2?.15:-.15,.33,i<2?-.28:.25);box(leg,'#6E8080',0,-.14,0,.09,.29,.1,.02);return leg;});const tail=shape(body,new THREE.ConeGeometry(.11,.5,7),'#6E8080',0,.43,-.55);tail.rotation.x=-.9;return {root,head,legs,tail,distance:0};}
type AnimalVisual={sheep:ReturnType<typeof makeSheep>;legacy:LegacyAnimal;position:THREE.Vector3;distance:number;speed:number;label:HTMLDivElement};

/** Lightweight standalone renderer. All purchases, energy and animal decisions live in model.ts. */
export class MinimalWorld{
 private state:MinimalState;
 private host:HTMLElement;
 private handlers:MinimalWorldHandlers;
 private renderer:THREE.WebGLRenderer;
 private scene=new THREE.Scene();
 private camera=new THREE.OrthographicCamera(-5.2,5.2,7,-7,.1,100);
 private terrain=new THREE.Group();
 private picks:THREE.Object3D[]=[];
 private tileStamp='';
 private animals=new Map<string,AnimalVisual>();
 private player:ClubAvatar;
 private playerRig?:FarmActionRig;
 private guardian:ClubAvatar;
 private guardianRig?:FarmActionRig;
 private guardianKind='';
 private playerRoot=new THREE.Group();
 private guardRoot=new THREE.Group();
 private wolves=[wolf(),wolf()];
 private path:THREE.Vector3[]=[];
 private destination:Point|null=null;
 private travelled=0;
 private guardTravelled=0;
 private guardTarget=new THREE.Vector3();
 private guardNextAt=0;
 private guardPath:THREE.Vector3[]=[];
 private wolfStamp=0;
 private wolfFront:Point={x:1.5,z:0};
 private gifts=new THREE.Group();
 private giftStamp='';
 private frame=0;
 private previous=0;
 private disposed=false;
 private resizeObserver:ResizeObserver;
 private raycaster=new THREE.Raycaster();
 private pointer=new THREE.Vector2();
 private pointerStart:{x:number;y:number;button:number}|null=null;
 private pointerMoved=false;
 private yaw=Math.atan2(9,18);
 private zoomLevel=1;
 private center=new THREE.Vector3(0,.75,0);
 private pan=new THREE.Vector3();
 private reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 private activeAction:{kind:'feed'|'pet'|'collect'|'help';at:number;animalId?:string}|null=null;
 private selected:WorldTarget|null=null;
 private marker:THREE.Mesh;
 private route=new THREE.Group();
 private feedProp=new THREE.Group();
 private actionUntil=0;
 constructor(host:HTMLElement,state:MinimalState,handlers:MinimalWorldHandlers){
  this.host=host;this.state=state;this.handlers=handlers;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.domElement.setAttribute('aria-label','牧场三维地图，点击地块或小动物，拖动查看周围');this.renderer.domElement.style.touchAction='none';this.host.appendChild(this.renderer.domElement);
  this.scene.background=new THREE.Color('#BAC5AE');this.scene.fog=new THREE.Fog('#BAC5AE',30,58);
  this.scene.add(new THREE.HemisphereLight('#F5F7EE','#B6B59B',1.4));
  const key=new THREE.DirectionalLight('#FFF9F0',1.85);key.position.set(-7,14,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-15;key.shadow.camera.right=15;key.shadow.camera.top=15;key.shadow.camera.bottom=-15;key.shadow.bias=-.00025;key.shadow.radius=3.2;this.scene.add(key);
  const fill=new THREE.DirectionalLight('#E4F2F0',.85);fill.position.set(8,5,-8);this.scene.add(fill);
  const beyond=box(this.scene,'#73816C',0,-.43,0,80,.4,80,.1);beyond.castShadow=false;
  this.scene.add(this.terrain,this.route,this.playerRoot,this.guardRoot,this.gifts);
  this.marker=new THREE.Mesh(new THREE.RingGeometry(.24,.3,32),new THREE.MeshBasicMaterial({color:'#FFF7BD',side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));this.marker.rotation.x=-Math.PI/2;this.marker.visible=false;this.scene.add(this.marker);
  this.player=createClubAvatar('human-lx','minimal-player');this.playerRoot.add(this.player.root);this.player.root.scale.setScalar(.65);this.playerRoot.position.copy(toWorld(state.player));
  void this.player.ready.then(()=>{if(this.disposed)return;this.player.update(0,'dance',true,0);this.playerRig=new FarmActionRig(this.player.root);this.playerRig.attach(this.feedProp);}).catch(()=>handlers.status?.('LX 模型暂未载入，可刷新重试；存档仍保留'));
  this.guardian=createClubAvatar('sword-shield-dog','minimal-dog');this.guardRoot.add(this.guardian.root);this.guardian.root.scale.setScalar(.68);this.guardRoot.position.copy(toWorld({x:2.8,z:2.8}));this.guardTarget.copy(this.guardRoot.position);this.guardianKind='dog';this.loadGuardian();
  this.feedProp.name='minimal-feeding-grass';for(let i=0;i<4;i++){const leaf=shape(this.feedProp,new THREE.ConeGeometry(.03,.22,4),'#89A95B',(i-1.5)*.045,0,0);leaf.rotation.z=(i-1.5)*.16;}this.feedProp.visible=false;
  this.wolves.forEach(w=>{w.root.visible=false;this.scene.add(w.root);});
  this.renderer.domElement.addEventListener('pointerdown',this.onPointerDown);this.renderer.domElement.addEventListener('pointermove',this.onPointerMove);this.renderer.domElement.addEventListener('pointerup',this.onPointerUp);this.renderer.domElement.addEventListener('pointercancel',this.onPointerCancel);this.renderer.domElement.addEventListener('wheel',this.onWheel,{passive:false});this.renderer.domElement.addEventListener('contextmenu',this.onContext);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.update(state);this.resize();this.frame=requestAnimationFrame(this.animate);
 }
 private loadGuardian(){const avatar=this.guardian;void avatar.ready.then(()=>{if(this.disposed||avatar!==this.guardian)return;avatar.update(0,'dance',true,0);this.guardianRig=new FarmActionRig(avatar.root);}).catch(()=>this.handlers.status?.('守护者模型暂未载入，可刷新重试'));}
 update(state:MinimalState){
  this.state=state;
  const stamp=state.tiles.map(t=>`${t.x},${t.z},${t.terrain},${Number(t.owned)}`).join(';');if(stamp!==this.tileStamp){this.tileStamp=stamp;this.buildTerrain();}
  if(state.guardian!==this.guardianKind){this.guardian.dispose();this.guardRoot.clear();this.guardianKind=state.guardian;this.guardianRig=undefined;this.guardian=createClubAvatar(state.guardian==='cat'?'miaocuijiao':state.guardian==='frog'?'milk-frog':'sword-shield-dog',`minimal-${state.guardian}`);this.guardRoot.add(this.guardian.root);this.guardian.root.scale.setScalar(.68);this.loadGuardian();}
  const giftStamp=state.gifts.map(g=>g.id+g.location).join(';');if(giftStamp!==this.giftStamp){this.giftStamp=giftStamp;this.buildGifts();}
  const ids=new Set(state.animals.map(a=>a.id));for(const [id,v] of this.animals)if(!ids.has(id)){this.scene.remove(v.sheep.root);disposeTree(v.sheep.root);v.label.remove();this.animals.delete(id);}
  state.animals.forEach((a,i)=>{if(this.animals.has(a.id))return;const old=legacyAnimal(a.id,a.name,i),sheep=makeSheep(old);sheep.root.position.copy(toWorld(a.position));sheep.root.scale.setScalar(.55);sheep.root.userData.target={kind:'animal',id:a.id};this.scene.add(sheep.root);const label=document.createElement('div');label.className='minimal-world-label';label.style.cssText='position:absolute;pointer-events:none;transform:translate(-50%,-100%);font-size:11px;color:#4b5947;background:#fff9e8dd;padding:3px 7px;border-radius:12px;white-space:nowrap;';label.textContent=a.name;this.host.appendChild(label);this.animals.set(a.id,{sheep,legacy:old,position:sheep.root.position,distance:0,speed:0,label});});
 }
 private buildTerrain(){
  disposeTree(this.terrain);this.terrain.clear();this.picks=[];
  for(const tile of this.state.tiles){
   const g=new THREE.Group();g.position.copy(toWorld(tile));g.position.y=0;g.userData.target={kind:'tile',x:tile.x,z:tile.z};this.terrain.add(g);
   const base=box(g,tile.owned?'#B5C491':'#667563',0,-.135,0,1.985,.27,1.985,.085);base.castShadow=false;this.picks.push(base);
   if(tile.terrain==='creek'){
    // A dry bank stays traversable. The shallow stream is a scenic/behavioral resource, not a path blocker.
    box(g,'#A9B69A',.56,.008,0,.77,.035,1.96,.11);
    const water=box(g,'#72A8AA',.56,.036,0,.54,.035,1.985,.06);(water.material as THREE.MeshStandardMaterial).roughness=.24;
    for(let i=0;i<3;i++){const stripe=box(g,'#BFDBCA',.56,.059,(i-1)*.52,.29,.008,.016,.003);stripe.castShadow=false;}
    for(let i=0;i<3;i++)sphere(g,'#CBD0AF',.15+i*.08,.08,(i-1)*.6,.1,.08,.13);
   }else if(tile.terrain==='hill'){
    sphere(g,'#A3B67B',.37,.03,-.35,.64,.47,.59);sphere(g,'#C3CB9F',.64,.06,-.62,.21,.28,.23);
    for(let i=0;i<3;i++){const flower=sphere(g,i%2?'#F6E6A4':'#E4D5B9',-.52+i*.2,.075,.59,.045);flower.castShadow=false;}
   }else if(tile.terrain==='grove'){
    tree(g,-.58,-.5,.84);tree(g,.58,-.62,.68);sphere(g,'#79945F',.64,.12,.6,.27,.25,.24);
   }else{
    for(let i=0;i<5;i++){const xx=Math.sin((tile.x*17+tile.z*7+i)*2.4)*.75,zz=Math.cos((tile.x*11+tile.z*9+i)*2.1)*.75;const grass=shape(g,new THREE.ConeGeometry(.05,.15,3),'#8DA36B',xx,.07,zz);grass.rotation.z=.25;grass.castShadow=false;if(i<2)sphere(g,'#EFE9BA',xx+.06,.12,zz,.035);}
   }
   if(!tile.owned){g.traverse(o=>{if(o instanceof THREE.Mesh){for(const material of Array.isArray(o.material)?o.material:[o.material])if(material instanceof THREE.MeshStandardMaterial)material.color.multiplyScalar(.61);}});}
   else{const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.98,1.98)),new THREE.LineBasicMaterial({color:'#DDE0B7',transparent:true,opacity:.48}));edge.rotation.x=-Math.PI/2;edge.position.y=.012;g.add(edge);}
  }
  // Free essentials: a visible water bowl and rest mat, not mandatory production buildings.
  const bowl=new THREE.Group();bowl.position.copy(toWorld({x:0,z:0}));bowl.position.x-=.45;bowl.position.z-=.45;shape(bowl,new THREE.CylinderGeometry(.26,.2,.15,18),'#D8C6A1',0,.08,0);shape(bowl,new THREE.CylinderGeometry(.225,.225,.02,18),'#85BBC2',0,.165,0);this.terrain.add(bowl);
  const mat=box(this.terrain,'#DECBA4',toWorld({x:0,z:1}).x-.45,.03,toWorld({x:0,z:1}).z-.45,.73,.06,.55,.14);mat.rotation.y=.15;
 }
 private buildGifts(){
  disposeTree(this.gifts);this.gifts.clear();
  const visible=this.state.gifts.filter(g=>g.location!=='bag');
  visible.forEach((gift,index)=>{const group=new THREE.Group();this.gifts.add(group);const animal=this.state.animals.find(a=>a.id===gift.animalId);const at=gift.location==='display'?{x:0,z:2}:animal?.position??{x:1,z:1};group.position.copy(toWorld(at));group.position.x+=.55+(index%2)*.2;group.position.z+=.35+(index%3)*.15;group.userData.target={kind:'tile',x:Math.round(at.x),z:Math.round(at.z)};
   if(gift.location==='display')box(group,'#BEA37C',0,.13,0,.42,.26,.34,.04);
   const y=gift.location==='display'?.36:.12;
   if(gift.kind==='wool'){sphere(group,gift.rare?'#F2D78B':'#FFF8E4',0,y,0,.16,.14,.15);sphere(group,'#FFF9EB',.12,y+.03,0,.09);}
   else if(gift.kind==='flower'){shape(group,new THREE.CylinderGeometry(.02,.02,.25,5),'#839961',0,y,0);for(let i=0;i<5;i++)sphere(group,'#E9B7A6',Math.cos(i*1.256)*.09,y+.12,Math.sin(i*1.256)*.09,.07);sphere(group,'#F2D78B',0,y+.15,0,.055);}
   else shape(group,new THREE.OctahedronGeometry(.15),'#9ABAC2',0,y,0);
  });
 }
 private groundHeight(p:THREE.Vector3){const grid=toGrid(p),tile=this.state.tiles.find(t=>t.x===Math.round(grid.x)&&t.z===Math.round(grid.z));if(tile?.terrain!=='hill')return .04;const localX=p.x-toWorld(tile).x-.37,localZ=p.z-toWorld(tile).z+.35;const r=(localX/.64)**2+(localZ/.59)**2;return r<1?.04+.46*Math.sqrt(1-r):.04;}
 walkTo(point:Point):boolean{
  const start=toGrid(this.playerRoot.position),route=continuousRoute(this.state,start,point);if(!route)return false;
  this.path=route.map(toWorld).filter(p=>p.distanceTo(this.playerRoot.position)>.025);if(this.selected?.kind==='animal'){const animal=this.state.animals.find(a=>a.id===(this.selected as {kind:'animal';id:string}).id);if(animal){const last=this.path[this.path.length-1]??this.playerRoot.position.clone(),toward=toWorld(animal.position).sub(last);toward.y=0;if(toward.length()>.85){const approach=Math.min(1.2,toward.length()-.85);last.add(toward.normalize().multiplyScalar(approach));last.y=.04;if(!this.path.length)this.path.push(last);}}}this.destination={...point};this.marker.position.copy(toWorld(point));this.marker.position.y=.055;this.marker.visible=true;disposeTree(this.route);this.route.clear();
  for(const p of this.path){const dot=new THREE.Mesh(new THREE.CircleGeometry(.045,8),new THREE.MeshBasicMaterial({color:'#FFF5C8',transparent:true,opacity:.8}));dot.rotation.x=-Math.PI/2;dot.position.copy(p);dot.position.y=.05;this.route.add(dot);}
  if(!this.path.length){this.destination=null;this.handlers.arrive(point);}return true;
 }
 cancelWalk(){this.path=[];this.destination=null;disposeTree(this.route);this.route.clear();this.marker.visible=false;}
 perform(kind:'feed'|'pet'|'collect'|'help'){this.activeAction={kind,at:performance.now(),animalId:this.selected?.kind==='animal'?this.selected.id:undefined};this.actionUntil=performance.now()+3000;}
 focus(){this.pan.set(0,0,0);this.zoomLevel=1;this.yaw=Math.atan2(9,18);this.resize();}
 zoom(delta:number){this.zoomLevel=THREE.MathUtils.clamp(this.zoomLevel+delta,.65,1.65);this.resize();}
 screenPoint(point:Point){const v=toWorld(point).add(new THREE.Vector3(0,1.2,0)).project(this.camera);return {x:(v.x+1)*.5*this.host.clientWidth,y:(1-v.y)*.5*this.host.clientHeight};}
 private resize(){const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h,false);const half=5.2/this.zoomLevel;this.camera.left=-half;this.camera.right=half;this.camera.top=half*h/w;this.camera.bottom=-half*h/w;this.camera.updateProjectionMatrix();}
 private onContext=(event:Event)=>event.preventDefault();
 private onWheel=(event:WheelEvent)=>{event.preventDefault();this.zoom(event.deltaY>0?-.07:.07);};
 private onPointerDown=(event:PointerEvent)=>{this.pointerStart={x:event.clientX,y:event.clientY,button:event.button};this.pointerMoved=false;this.renderer.domElement.setPointerCapture(event.pointerId);};
 private onPointerMove=(event:PointerEvent)=>{if(!this.pointerStart)return;const dx=event.clientX-this.pointerStart.x,dy=event.clientY-this.pointerStart.y;if(Math.hypot(dx,dy)>5)this.pointerMoved=true;if(this.pointerMoved){if(event.button===2||event.buttons===2||event.shiftKey){this.yaw-=dx*.006;}else{const units=10.4/this.zoomLevel/Math.max(1,this.host.clientWidth);this.pan.x-=dx*units*Math.cos(this.yaw)+dy*units*Math.sin(this.yaw);this.pan.z+=dx*units*Math.sin(this.yaw)-dy*units*Math.cos(this.yaw);this.pan.clamp(new THREE.Vector3(-8,0,-8),new THREE.Vector3(8,0,8));}this.pointerStart={x:event.clientX,y:event.clientY,button:this.pointerStart.button};}};
 private onPointerCancel=()=>{this.pointerStart=null;};
 private onPointerUp=(event:PointerEvent)=>{
  if(!this.pointerStart)return;const moved=this.pointerMoved;this.pointerStart=null;if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);if(moved)return;
  const bounds=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
  const hits=this.raycaster.intersectObjects([...this.animals.values()].map(v=>v.sheep.root).concat(this.picks as THREE.Group[]),true);
  for(const hit of hits){let object:THREE.Object3D|null=hit.object;while(object&&!object.userData.target)object=object.parent;if(object?.userData.target){this.selected=object.userData.target as WorldTarget;this.handlers.select(this.selected);return;}}
 };
 private move(root:THREE.Object3D,target:THREE.Vector3,dt:number,speed:number){const dx=target.x-root.position.x,dz=target.z-root.position.z,distance=Math.hypot(dx,dz);if(distance<.01)return 0;const step=Math.min(distance,speed*dt);root.position.x+=dx/distance*step;root.position.z+=dz/distance*step;const yaw=Math.atan2(dx,dz);root.rotation.y+=Math.atan2(Math.sin(yaw-root.rotation.y),Math.cos(yaw-root.rotation.y))*(1-Math.exp(-dt*9));return step;}
 private locomotion(root:THREE.Object3D,speed:number,distance:number){return {slot:0,x:root.position.x,z:root.position.z,heading:root.rotation.y,speed,distance,walkBlend:Math.min(1,speed/1.8),action:'dance' as const};}
 private updateActors(dt:number,now:number){
  let moved=0;const next=this.path[0];if(next&&now>this.actionUntil){moved=this.move(this.playerRoot,next,dt,4.4);this.travelled+=moved;if(Math.hypot(this.playerRoot.position.x-next.x,this.playerRoot.position.z-next.z)<.035){this.playerRoot.position.copy(next);this.path.shift();if(!this.path.length&&this.destination){const arrived=this.destination;this.destination=null;this.route.clear();this.handlers.arrive(arrived);}}}
  this.playerRoot.position.y=THREE.MathUtils.lerp(this.playerRoot.position.y,this.groundHeight(this.playerRoot.position),1-Math.exp(-dt*14));
  const speed=moved/dt;this.player.update(now/500,'dance',speed<.02,.15,this.locomotion(this.playerRoot,speed,this.travelled));
  for(const a of this.state.animals){const v=this.animals.get(a.id);if(!v)continue;const predicted={...a.position};let travel=Math.min(.5,Math.max(0,(Date.now()-this.state.updatedAt)/1000))*(this.state.animals.indexOf(a)%2?.55:.65);for(const waypoint of a.path??[]){const dx=waypoint.x-predicted.x,dz=waypoint.z-predicted.z,d=Math.hypot(dx,dz);if(d<.0001)continue;const step=Math.min(d,travel);predicted.x+=dx/d*step;predicted.z+=dz/d*step;travel-=step;if(travel<=0)break;}const target=toWorld(predicted);const remaining=Math.hypot(target.x-v.position.x,target.z-v.position.z);const step=this.move(v.sheep.root,target,dt,Math.min(3,remaining*(1-Math.exp(-dt*12))/dt));v.distance+=step;v.speed=step/dt;v.sheep.root.position.y=THREE.MathUtils.lerp(v.sheep.root.position.y,this.groundHeight(v.sheep.root.position),1-Math.exp(-dt*10));const age=Date.now()-a.bornAt,scale=.48+Math.min(.17,Math.max(0,age)/(7*86400000)*.17);v.sheep.root.scale.setScalar(scale);
   if(a.activity==='drink'&&v.speed<.08){const tile=this.state.tiles.find(t=>t.x===Math.round(a.position.x)&&t.z===Math.round(a.position.z));const desired=tile?.terrain==='creek'?Math.PI/2:-Math.PI*.75;v.sheep.root.rotation.y+=Math.atan2(Math.sin(desired-v.sheep.root.rotation.y),Math.cos(desired-v.sheep.root.rotation.y))*(1-Math.exp(-dt*5));}
   let action:'eat'|'rest'|'love'|undefined=a.activity==='drink'||a.activity==='graze'?'eat':a.activity==='rest'?'rest':undefined;
   if(this.activeAction?.animalId===a.id&&now-this.activeAction.at<3000)action=this.activeAction.kind==='feed'?'eat':'love';
   v.sheep.update(v.legacy,now/1000,action,1,v.speed,false,this.selected?.kind==='animal'&&this.selected.id===a.id,this.reduced,v.distance);if(a.activity==='drink'){const grass=v.sheep.root.getObjectByName('feeding-grass');if(grass)grass.visible=false;}
   const proj=v.sheep.root.position.clone().add(new THREE.Vector3(0,.9,0)).project(this.camera);v.label.style.left=`${(proj.x+1)*.5*this.host.clientWidth}px`;v.label.style.top=`${(1-proj.y)*.5*this.host.clientHeight}px`;v.label.style.display=proj.z>1?'none':'';v.label.textContent=`${a.name}${a.activity==='drink'?' · 喝水':a.activity==='rest'?' · 休息':a.activity==='graze'?' · 吃草':''}`;
  }
  if(this.activeAction&&now-this.activeAction.at<3000){const act=this.activeAction;const animal=act.animalId?this.animals.get(act.animalId):undefined;if(animal&&(act.kind==='feed'||act.kind==='pet')){const direction=animal.sheep.root.position.clone().sub(this.playerRoot.position);this.playerRoot.rotation.y=Math.atan2(direction.x,direction.z);const mouth=animal.sheep.root.getObjectByName('feeding-mouth')?.getWorldPosition(new THREE.Vector3());if(mouth)this.playerRig?.feed(feedingPoseAt(now-act.at,'feed'),mouth);this.feedProp.visible=act.kind==='feed'&&now-act.at>450&&now-act.at<2500;}else{this.player.update((now-act.at)/500,'wave',this.reduced,.5);}}
  else{this.activeAction=null;this.feedProp.visible=false;}
  const event=this.state.wolfEvent;
  if(event){if(this.wolfStamp!==event.startedAt){this.wolfStamp=event.startedAt;const owned=this.state.tiles.filter(t=>t.owned),north=Math.min(...owned.map(t=>t.z)),front=owned.filter(t=>t.z===north).sort((a,b)=>Math.abs(a.x-1.5)-Math.abs(b.x-1.5))[0];this.wolfFront={x:front.x,z:north};this.guardPath=(continuousRoute(this.state,toGrid(this.guardRoot.position),front)??[]).map(toWorld);this.wolves.forEach((w,i)=>{w.root.position.copy(toWorld({x:this.wolfFront.x-.8+i*1.6,z:this.wolfFront.z-2.4}));w.distance=0;});}const age=(Date.now()-event.startedAt)/1000,ending=Math.max(0,(Date.now()-(event.endsAt-3500))/3500);this.guardTarget.copy(this.guardPath[0]??toWorld(this.wolfFront));this.wolves.forEach((w,i)=>{w.root.visible=true;const entry=toWorld({x:this.wolfFront.x-.8+i*1.6,z:this.wolfFront.z-2.4}),edge=toWorld({x:this.wolfFront.x-.8+i*1.6,z:this.wolfFront.z-.7});const progress=smooth(age/4)*(1-smooth(ending));const desired=entry.clone().lerp(edge,progress);if(age<.1)w.root.position.copy(entry);const delta=this.move(w.root,desired,dt,2.1);w.distance+=delta;w.head.rotation.y=delta<.001?Math.sin(now/1800+i)*.16:0;w.legs.forEach((leg,j)=>leg.rotation.x=Math.sin(w.distance/.6*Math.PI*2+(j%2?Math.PI:0))*.4*(delta>0?1:0));});}
  else{this.wolves.forEach(w=>w.root.visible=false);if(now>this.guardNextAt&&!this.guardPath.length){this.guardNextAt=now+6000;const tiles=this.state.tiles.filter(t=>t.owned);const index=Math.floor(now/6000)%tiles.length;this.guardPath=(continuousRoute(this.state,toGrid(this.guardRoot.position),tiles[index])??[]).map(toWorld);}if(this.guardPath[0])this.guardTarget.copy(this.guardPath[0]);}
  const guardStep=this.move(this.guardRoot,this.guardTarget,dt,event?1.9:.85);if(this.guardPath.length&&this.guardRoot.position.clone().setY(.04).distanceTo(this.guardPath[0])<.04)this.guardPath.shift();this.guardRoot.position.y=THREE.MathUtils.lerp(this.guardRoot.position.y,this.groundHeight(this.guardRoot.position),1-Math.exp(-dt*10));this.guardTravelled+=guardStep;this.guardian.update(now/500,'dance',guardStep<.001,.12,this.locomotion(this.guardRoot,guardStep/dt,this.guardTravelled));if(event&&guardStep<.01)this.guardianRig?.guardian(guardianPoseAt(this.state.guardian,'protect',(Date.now()-event.startedAt)/1000));
 }
 private animate=(now:number)=>{if(this.disposed)return;const dt=Math.min(.05,Math.max(.001,(now-(this.previous||now-16))/1000));this.previous=now;this.updateActors(dt,now);const player=this.playerRoot.position;const nearby=this.state.tiles.filter(t=>t.owned&&toWorld(t).distanceTo(player)<=5);const bias=new THREE.Vector3();if(nearby.length){const xs=nearby.map(t=>toWorld(t).x),zs=nearby.map(t=>toWorld(t).z);bias.set(((Math.min(...xs)+Math.max(...xs))/2-player.x)*.45,0,((Math.min(...zs)+Math.max(...zs))/2-player.z)*.45);bias.clampLength(0,1.3);}const follow=player.clone().add(bias).add(this.pan);follow.y=.75;this.center.lerp(follow,1-Math.exp(-dt*3));const horizontal=Math.hypot(9,18);this.camera.position.set(this.center.x+Math.sin(this.yaw)*horizontal,this.center.y+13.8,this.center.z+Math.cos(this.yaw)*horizontal);this.camera.lookAt(this.center);this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(this.animate);};
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();const canvas=this.renderer.domElement;canvas.removeEventListener('pointerdown',this.onPointerDown);canvas.removeEventListener('pointermove',this.onPointerMove);canvas.removeEventListener('pointerup',this.onPointerUp);canvas.removeEventListener('pointercancel',this.onPointerCancel);canvas.removeEventListener('wheel',this.onWheel);canvas.removeEventListener('contextmenu',this.onContext);this.player.dispose();this.guardian.dispose();for(const a of this.animals.values())a.label.remove();disposeTree(this.scene);this.renderer.dispose();canvas.remove();}
}
