import * as THREE from 'three';

export type BasketballPoint={x:number;y:number;z:number};
export type BasketballRelease={clipTime:number;handWorld:BasketballPoint;secondsToRim:number;apexRise:number;/** Authored C1 release, not a gravity simulation. */departureWorld?:BasketballPoint;velocityWorld?:BasketballPoint};
export type BasketballFrame={actionId:string;clipTime:number}&({phase:'held';handWorld:BasketballPoint}|{phase:'dribble';ballWorld:BasketballPoint}|{phase:'shot';release?:BasketballRelease});
export const LUNAR_COURT_LAYOUT=Object.freeze({rim:Object.freeze({x:3,y:2.15,z:-4.65}),base:Object.freeze({x:3,z:-5.35}),paint:Object.freeze({minX:.5,maxX:5.5,minZ:-3.8,maxZ:1.8})});
const finite=(p:BasketballPoint)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const clone=(p:BasketballPoint)=>({x:p.x,y:p.y,z:p.z});
const releaseKey=(r:BasketballRelease)=>JSON.stringify([r.clipTime,r.handWorld.x,r.handWorld.y,r.handWorld.z,r.secondsToRim,r.apexRise,r.departureWorld,r.velocityWorld]);

/** Original visitor-only art. No state, model admission, picking, commands or timer.
 * The actor owner supplies a calibrated ball-center hand anchor and an exact
 * clip-event release snapshot. This module never pretends to animate an actor. */
export class LunarBasketballCourt{
 readonly root=new THREE.Group();readonly ball:THREE.Mesh;readonly rimWorld:Readonly<BasketballPoint>;readonly ballRadius:number;readonly scale:number;
 private actionId:string|null=null;private lastTime=-Infinity;private release:BasketballRelease|null=null;private held=false;private paused=false;private disposed=false;private floorY:number;
 constructor(parent:THREE.Object3D,options:{scale?:number;stand?:Readonly<{x:number;z:number}>;ballRadius?:number;rimHeight?:number;groundHeight?:(x:number,z:number)=>number}={}){
  const scale=options.scale??1,stand=options.stand??{x:3,z:1},baseBall=options.ballRadius??.14,rimHeight=options.rimHeight??LUNAR_COURT_LAYOUT.rim.y;
  if(!Number.isFinite(scale)||scale<1||scale>2||![stand.x,stand.z].every(Number.isFinite)||!Number.isFinite(baseBall)||baseBall<.08||baseBall>.2||!Number.isFinite(rimHeight)||rimHeight<1.5||rimHeight>3.1)throw new Error('Invalid visitor basketball dimensions');
  this.scale=scale;this.ballRadius=baseBall*scale;const offset={x:stand.x-3*scale,z:stand.z-scale},ground=(x:number,z:number)=>(options.groundHeight?.(x*scale+offset.x,z*scale+offset.z)??0)/scale;
  const layout=LUNAR_COURT_LAYOUT,localFloor=ground(layout.rim.x,layout.rim.z);this.floorY=localFloor*scale;if(!Number.isFinite(this.floorY))throw new Error('Invalid court ground');const localRim={...layout.rim,y:localFloor+rimHeight};this.rimWorld=Object.freeze({x:localRim.x*scale+offset.x,y:localRim.y*scale,z:localRim.z*scale+offset.z});
  this.root.name='lunar-basketball-court';parent.add(this.root);
  // Scale only private static art. The ball always receives already-world-space
  // hand/track samples, so actor normalization and growth are never applied twice.
  const art=new THREE.Group();art.name='lunar-court-static-art';art.scale.setScalar(scale);art.position.set(offset.x,0,offset.z);this.root.add(art);
  const mat=(color:string)=>new THREE.MeshStandardMaterial({color,roughness:.82});
  const cream=mat('#fff3d3'),post=mat('#878394'),orange=mat('#db864d'),aqua=mat('#98c7bf'),ink=new THREE.LineBasicMaterial({color:'#644738'}),net=new THREE.LineBasicMaterial({color:'#f4eddb'}),unit=new THREE.BoxGeometry();
  const box=(name:string,m:THREE.Material,p:BasketballPoint,size:BasketballPoint)=>{const mesh=new THREE.Mesh(unit,m);mesh.name=name;mesh.position.set(p.x,p.y,p.z);mesh.scale.set(size.x,size.y,size.z);mesh.castShadow=true;mesh.receiveShadow=true;art.add(mesh);return mesh;};
  const baseY=ground(layout.base.x,layout.base.z);
  box('lunar-hoop-grounded-base',post,{...layout.base,y:baseY+.06},{x:.55,y:.12,z:.7});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,rimHeight+.35,8),post);pole.name='lunar-hoop-pole';pole.position.set(layout.base.x,baseY+(rimHeight+.35)/2,layout.base.z);pole.castShadow=true;art.add(pole);
  box('lunar-hoop-arm',post,{x:3,y:localRim.y+.15,z:-5.2},{x:.12,y:.12,z:.45});
  box('lunar-hoop-backboard',cream,{x:3,y:localRim.y+.2,z:-5.13},{x:1.35,y:.86,z:.07});
  for(const side of [-1,1]){box('lunar-hoop-frame',aqua,{x:3+side*.65,y:localRim.y+.2,z:-5.09},{x:.05,y:.86,z:.025});box('lunar-hoop-frame',aqua,{x:3,y:localRim.y+.2+side*.405,z:-5.09},{x:1.35,y:.05,z:.025});box('lunar-hoop-target',orange,{x:3+side*.22,y:localRim.y+.23,z:-5.09},{x:.025,y:.30,z:.022});box('lunar-hoop-target',orange,{x:3,y:localRim.y+.23+side*.15,z:-5.09},{x:.465,y:.025,z:.022});}
  box('lunar-hoop-rim-bracket',orange,{x:3,y:localRim.y,z:-5.015},{x:.1,y:.045,z:.3});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.26,.025,6,20),orange);ring.name='lunar-hoop-rim';ring.rotation.x=Math.PI/2;ring.position.copy(localRim);art.add(ring);
  const netVertices:number[]=[];for(let i=0;i<10;i++){const a=i*Math.PI/5,b=(i+1)*Math.PI/5;for(const [r,y,r2,y2,angle] of [[.245,0,.17,-.36,a],[.17,-.36,.17,-.36,b]])netVertices.push(3+Math.cos(a)*r,localRim.y+y,-4.65+Math.sin(a)*r,3+Math.cos(angle)*r2,localRim.y+y2,-4.65+Math.sin(angle)*r2);}
  const netArt=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(netVertices,3)),net);netArt.name='lunar-hoop-net';art.add(netArt);
  const paintVertices:number[]=[],stroke=(points:readonly (readonly [number,number])[])=>{for(let i=1;i<points.length;i++){const [ax,az]=points[i-1],[bx,bz]=points[i],length=Math.hypot(bx-ax,bz-az),dx=-(bz-az)/length*.018,dz=(bx-ax)/length*.018;const p=[[ax+dx,az+dz],[ax-dx,az-dz],[bx+dx,bz+dz],[bx-dx,bz-dz]];for(const j of [0,2,1,2,3,1])paintVertices.push(p[j][0],ground(...p[j] as [number,number])+.018,p[j][1]);}};
  stroke([[.5,-3.8],[5.5,-3.8],[5.5,1.8],[.5,1.8],[.5,-3.8]]);stroke([[2.05,-3.8],[2.05,-.5],[3.95,-.5],[3.95,-3.8]]);
  for(const [z,r,start,end]of [[-.5,.95,0,Math.PI],[-3.8,2.25,0,Math.PI]] as const)stroke(Array.from({length:25},(_,i)=>{const a=start+(end-start)*i/24;return [3+Math.cos(a)*r,z+Math.sin(a)*r] as const;}));
  const paint=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(paintVertices,3)),cream);paint.geometry.computeVertexNormals();paint.name='lunar-court-paint';paint.receiveShadow=true;art.add(paint);
  this.ball=new THREE.Mesh(new THREE.SphereGeometry(this.ballRadius,12,8),orange);this.ball.name='lunar-basketball';this.ball.visible=false;this.ball.castShadow=true;this.root.add(this.ball);
  for(const axis of ['x','z'] as const){const seam=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:24},(_,i)=>{const a=i*Math.PI/12,r=this.ballRadius+.001;return new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,0);})),ink);seam.rotation[axis]=Math.PI/2;this.ball.add(seam);}
 }
 beginAction(actionId:string){if(this.disposed||!actionId)return false;this.cancel();this.actionId=actionId;return true;}
 setPaused(paused:boolean){this.paused=paused;}
 update(frame:BasketballFrame):boolean{
  if(this.disposed||this.paused||!this.actionId||frame.actionId!==this.actionId||!Number.isFinite(frame.clipTime)||frame.clipTime<0||frame.clipTime<this.lastTime)return false;
  if(frame.phase==='held'){
   if(this.release||!finite(frame.handWorld))return false;this.ball.position.copy(frame.handWorld);this.held=true;
  }else if(frame.phase==='dribble'){
   // The rig owner supplies the hand-contact/free-flight track, including exact
   // floor contacts. Do not run an unrelated oscillator or glue it to the hand.
   if(this.release||!finite(frame.ballWorld)||frame.ballWorld.y<this.floorY+this.ballRadius-1e-6)return false;this.ball.position.copy(frame.ballWorld);this.held=false;
  }else if(frame.phase==='shot'){
   if(!this.release){const r=frame.release;if(!this.held||!r||!finite(r.handWorld)||![r.clipTime,r.secondsToRim,r.apexRise].every(Number.isFinite)||r.clipTime<0||r.clipTime>frame.clipTime||r.secondsToRim<.2||r.secondsToRim>4||r.apexRise<.25+Math.max(0,this.rimWorld.y-r.handWorld.y)/4||r.apexRise>6)return false;if(r.departureWorld||r.velocityWorld){if(!finite(r.departureWorld!)||!finite(r.velocityWorld!)||new THREE.Vector3().copy(r.departureWorld!).distanceTo(new THREE.Vector3().copy(r.handWorld))>3*this.scale||new THREE.Vector3().copy(r.velocityWorld!).length()>4*this.scale||r.departureWorld!.y<this.floorY+this.ballRadius)return false;}this.release={...r,handWorld:clone(r.handWorld),...r.departureWorld?{departureWorld:clone(r.departureWorld),velocityWorld:clone(r.velocityWorld!)}:{}};}
   else if(frame.release&&(!finite(frame.release.handWorld)||![frame.release.clipTime,frame.release.secondsToRim,frame.release.apexRise].every(Number.isFinite)||releaseKey(frame.release)!==releaseKey(this.release)))return false;
   const r=this.release,u=(frame.clipTime-r.clipTime)/r.secondsToRim;
   if(u<=1&&r.departureWorld&&r.velocityWorld){
    // A measured under-wing socket cannot depart upward through the palm.
    // Quintic Bezier: exact hand position/velocity, forward clearance, then arc.
    const a=new THREE.Vector3().copy(r.handWorld),rim=new THREE.Vector3().copy(this.rimWorld),toward=a.clone().sub(rim).setY(0).normalize(),controls=[a,a.clone().addScaledVector(new THREE.Vector3().copy(r.velocityWorld),r.secondsToRim/5),new THREE.Vector3().copy(r.departureWorld),a.clone().lerp(rim,.55).setY(this.rimWorld.y+r.apexRise),rim.clone().addScaledVector(toward,.65*this.scale).setY(this.rimWorld.y+r.apexRise),rim],weights=[1,5,10,10,5,1];this.ball.position.set(0,0,0);controls.forEach((p,i)=>this.ball.position.addScaledVector(p,weights[i]*u**i*(1-u)**(5-i)));
   }else if(u<=1)this.ball.position.set(r.handWorld.x+(this.rimWorld.x-r.handWorld.x)*u,r.handWorld.y+(this.rimWorld.y-r.handWorld.y)*u+4*r.apexRise*u*(1-u),r.handWorld.z+(this.rimWorld.z-r.handWorld.z)*u);
   else{const v=r.departureWorld?-5*r.apexRise/r.secondsToRim:(this.rimWorld.y-r.handWorld.y-4*r.apexRise)/r.secondsToRim,drop=this.rimWorld.y-this.floorY-this.ballRadius,fall=(v+Math.sqrt(v*v+2*9.81*this.scale*drop))/(9.81*this.scale),after=(u-1)*r.secondsToRim;let y=this.floorY+this.ballRadius;if(after<fall)y=this.rimWorld.y+v*after-4.905*this.scale*after*after;else{const bounce=(after-fall)/.55;if(bounce<1)y+=4*.38*this.scale*bounce*(1-bounce);}this.ball.position.set(this.rimWorld.x,Math.max(this.floorY+this.ballRadius,y),this.rimWorld.z);}
   this.ball.rotation.x=u*Math.PI*2;
  }else return false;
  this.lastTime=frame.clipTime;this.ball.visible=true;return true;
 }
 cancel(){this.actionId=null;this.lastTime=-Infinity;this.release=null;this.held=false;this.ball.visible=false;}
 dispose(){if(this.disposed)return;this.disposed=true;this.cancel();const geometry=new Set<THREE.BufferGeometry>(),material=new Set<THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])material.add(m);}});for(const g of geometry)g.dispose();for(const m of material)m.dispose();this.root.removeFromParent();this.root.clear();}
}
