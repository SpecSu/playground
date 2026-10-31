import * as THREE from 'three';
import type {WeatherKind} from './weather.ts';

export type WeatherSurface={height:number;water?:boolean;snowAllowed?:boolean};
export type WeatherSurfaceSampler=(x:number,z:number)=>WeatherSurface;
export type PrecipitationOptions={reducedMotion?:boolean;sampleSurface?:WeatherSurfaceSampler};
const RAIN=240,SNOW=192,SPLASH=40,DUST=72,SPAN=24,HEIGHT=9;
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const finite=(n:number,fallback=0)=>Number.isFinite(n)?n:fallback;
const wrap=(n:number,span:number)=>((n%span)+span)%span;
const seed=(i:number,salt:number)=>{let n=Math.imul(i+1,salt)^0x51f15e;n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;};
const surfaceDefault=()=>({height:0,snowAllowed:true});

/** A procedural feathered sprite: no image fetch, canvas, or retained browser resource. */
function featherTexture(){
 const size=32,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2)),i=(y*size+x)*4;
  data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*(1-clamp((r-.25)/.75))**2);
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}

/** Five fixed buffers/meshes at most. Cosmetic only: never edits tiles or collision heights. */
export class WeatherPrecipitation{
 readonly root=new THREE.Group();
 readonly snow:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
 readonly rain:THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>;
 readonly splashes:THREE.InstancedMesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
 readonly dust:THREE.InstancedMesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
 private rainPositions=new Float32Array(RAIN*6);
 private snowPositions=new Float32Array(SNOW*3);
 private rainStarted=new Uint8Array(RAIN);
 private rainHeights=Float32Array.from({length:RAIN},(_,i)=>(1-seed(i,93719))*HEIGHT+.04);
 private snowHeights=Float32Array.from({length:SNOW},(_,i)=>(1-seed(i,93719))*HEIGHT+.04);
 private windX=0;private windZ=0;private rainSpeed=8;
 private splashAge=new Float32Array(SPLASH).fill(10);
 private splashPosition=new Float32Array(SPLASH*3);
 private splashWater=new Uint8Array(SPLASH);
 private splashCursor=0;
 private surfaceHeights=new Float32Array(RAIN+SNOW);
 private surfaceWater=new Uint8Array(RAIN+SNOW);
 private surfaceX=new Float32Array(RAIN+SNOW).fill(Infinity);
 private surfaceZ=new Float32Array(RAIN+SNOW).fill(Infinity);
 private time=0;private rainMix=0;private snowMix=0;private cover=0;private budget=1;
 private slowTime=0;private fastTime=0;private dustTimer=0;private dustX=NaN;private dustZ=NaN;
 private reduced=false;private disposed=false;private sprite=featherTexture();
 private transform=new THREE.Object3D();private color=new THREE.Color();
 private sampleSurface:WeatherSurfaceSampler;
 constructor(options:PrecipitationOptions={}){
  this.reduced=!!options.reducedMotion;this.sampleSurface=options.sampleSurface??surfaceDefault;
  const rainGeometry=new THREE.BufferGeometry(),colors=new Float32Array(RAIN*6);
  rainGeometry.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3).setUsage(THREE.DynamicDrawUsage));
  for(let i=0;i<RAIN;i++)for(let end=0;end<2;end++){const shade=.65+seed(i,51973)*.35,j=i*6+end*3;colors[j]=shade*.85;colors[j+1]=shade*.94;colors[j+2]=shade;}
  rainGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));rainGeometry.setDrawRange(0,0);
  this.rain=new THREE.LineSegments(rainGeometry,new THREE.LineBasicMaterial({color:'#D5EAF3',vertexColors:true,transparent:true,opacity:0,depthWrite:false}));
  this.rain.name='ranch-rain-streaks';this.rain.frustumCulled=false;this.rain.visible=false;
  const snowGeometry=new THREE.BufferGeometry();snowGeometry.setAttribute('position',new THREE.BufferAttribute(this.snowPositions,3).setUsage(THREE.DynamicDrawUsage));snowGeometry.setDrawRange(0,0);
  this.snow=new THREE.Points(snowGeometry,new THREE.PointsMaterial({color:'#F2F6F8',size:3.2,map:this.sprite,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:false}));
  this.snow.name='ranch-snow';this.snow.frustumCulled=false;this.snow.visible=false;
  this.splashes=new THREE.InstancedMesh(new THREE.RingGeometry(.63,1,12),new THREE.MeshBasicMaterial({color:'#D8EBF0',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),SPLASH);
  this.splashes.name='ranch-rain-splashes';this.splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.splashes.frustumCulled=false;this.splashes.visible=false;
  this.dust=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'#F2F4F1',map:this.sprite,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),DUST);
  this.dust.name='ranch-snow-dusting';this.dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.dust.frustumCulled=false;this.dust.visible=false;
  this.root.add(this.rain,this.snow,this.splashes,this.dust);
 }
 setReducedMotion(value:boolean){this.reduced=value;}
 setSurfaceSampler(sample:WeatherSurfaceSampler){this.sampleSurface=sample;this.surfaceX.fill(Infinity);this.dustTimer=1;}
 private cacheSurface(i:number,x:number,z:number,impact=false){
  // Each drop reuses a surface result until it moves appreciably; the exact
  // touchdown is re-sampled. A cached World sampler is never called per pixel.
  if(impact||Math.abs(x-this.surfaceX[i])>.35||Math.abs(z-this.surfaceZ[i])>.35){
   const s=this.surface(x,z);this.surfaceHeights[i]=s.height;this.surfaceWater[i]=Number(s.water);this.surfaceX[i]=x;this.surfaceZ[i]=z;
  }
 }
 private surface(x:number,z:number):WeatherSurface{
  const s=this.sampleSurface(x,z);return {height:finite(s.height),water:!!s.water,snowAllowed:s.snowAllowed!==false};
 }
 update(kind:WeatherKind,delta:number,target:{x:number;z:number}){
  if(this.disposed)return;
  const raw=clamp(finite(delta),0,.25),dt=Math.min(raw,.05),tx=finite(target.x),tz=finite(target.z);
  this.time+=dt*(this.reduced?.28:1);const t=this.time;
  // Hysteresis reacts to sustained slow frames, not one GC/foreground interruption.
  if(raw>.035){this.slowTime+=raw;this.fastTime=0;}else{this.fastTime+=raw;this.slowTime=Math.max(0,this.slowTime-raw);}
  if(this.slowTime>.8){this.budget=Math.max(.45,this.budget-.05);this.slowTime=0;}
  if(this.fastTime>8){this.budget=Math.min(1,this.budget+.05);this.fastTime=0;}
  const rainTarget=kind==='storm'?1:kind==='rain'?.72:0,snowTarget=kind==='snow'?1:0,alpha=1-Math.exp(-dt*1.8);
  this.rainMix+=(rainTarget-this.rainMix)*alpha;this.snowMix+=(snowTarget-this.snowMix)*alpha;
  this.cover+=(snowTarget-this.cover)*(1-Math.exp(-dt*(snowTarget?1/18:1/7)));
  if(this.rainMix<.003)this.rainMix=0;if(this.snowMix<.003)this.snowMix=0;if(!snowTarget&&this.cover<.003)this.cover=0;
  this.rain.visible=this.rainMix>0;this.snow.visible=this.snowMix>0;this.dust.visible=this.cover>.012;
  const density=this.reduced?.2:this.budget,rainCount=Math.round(RAIN*density),snowCount=Math.round(SNOW*density);
  this.rain.geometry.setDrawRange(0,rainCount*2);this.snow.geometry.setDrawRange(0,snowCount);
  this.rain.material.opacity=this.rainMix*.56;this.snow.material.opacity=this.snowMix*.86;this.dust.material.opacity=this.cover*.42;
  const wind=.55+.22*Math.sin(t*.23)+.14*Math.sin(t*.61),cross=.18*Math.sin(t*.17),motionDt=dt*(this.reduced?.28:1);
  this.windX+=motionDt*wind;this.windZ+=motionDt*cross;this.rainSpeed+=((kind==='storm'?10.5:8)-this.rainSpeed)*alpha;
  if(this.rain.visible)for(let i=0;i<rainCount;i++){
   const speed=this.rainSpeed*(.8+seed(i,72431)*.4),length=.25+seed(i,41117)*.4;
   // World-anchored wrapping prevents the weather volume sliding with every player step.
   const x=wrap(seed(i,73327)*SPAN+this.windX-tx+SPAN/2,SPAN)+tx-SPAN/2,z=wrap(seed(i,51767)*SPAN+this.windZ-tz+SPAN/2,SPAN)+tz-SPAN/2;
   this.cacheSurface(i,x,z);let height=this.surfaceHeights[i],y=this.rainHeights[i]-motionDt*speed;let impact=false;
   if(y<=height+.02){this.cacheSurface(i,x,z,true);height=this.surfaceHeights[i];if(y<=height+.02){impact=!!this.rainStarted[i];y=Math.max(HEIGHT,height+3)+seed(i,2719);}}
   this.rainHeights[i]=y;this.rainStarted[i]=1;const j=i*6;
   this.rainPositions[j]=x;this.rainPositions[j+1]=y;this.rainPositions[j+2]=z;
   this.rainPositions[j+3]=x-wind*length/speed;this.rainPositions[j+4]=Math.max(height+.012,y-length);this.rainPositions[j+5]=z-cross*length/speed;
   if(impact&&!this.reduced&&this.rainMix>.08){const slot=this.splashCursor++%SPLASH,k=slot*3;this.splashAge[slot]=0;this.splashPosition[k]=x;this.splashPosition[k+1]=height+.015;this.splashPosition[k+2]=z;this.splashWater[slot]=this.surfaceWater[i];}
  }else this.rainStarted.fill(0);
  if(this.rain.visible)this.rain.geometry.attributes.position.needsUpdate=true;
  if(this.snow.visible)for(let i=0;i<snowCount;i++){
   const speed=.42+seed(i,39119)*.48,sway=Math.sin(t*(.45+seed(i,9133)*.3)+i*2.4),x=wrap(seed(i,73327)*SPAN+t*.22+sway*.36-tx+SPAN/2,SPAN)+tx-SPAN/2,z=wrap(seed(i,51767)*SPAN+Math.cos(t*.39+i)*.26-tz+SPAN/2,SPAN)+tz-SPAN/2,j=i*3;this.cacheSurface(RAIN+i,x,z);
   let y=this.snowHeights[i]-motionDt*speed;if(y<=this.surfaceHeights[RAIN+i]+.035)y=Math.max(HEIGHT,this.surfaceHeights[RAIN+i]+3)+seed(i,2719);this.snowHeights[i]=y;
   this.snowPositions[j]=x;this.snowPositions[j+1]=y;this.snowPositions[j+2]=z;
  }
  if(this.snow.visible)this.snow.geometry.attributes.position.needsUpdate=true;
  this.updateSplashes(dt);
  // Static ground dust updates at 4 Hz or when its world-grid anchor changes, not every frame.
  this.dustTimer+=dt;const anchorX=Math.floor(tx/2.3),anchorZ=Math.floor(tz/2.3);
  if(this.dust.visible&&(this.dustTimer>=.25||anchorX!==this.dustX||anchorZ!==this.dustZ)){this.dustTimer=0;this.dustX=anchorX;this.dustZ=anchorZ;this.updateDust(anchorX,anchorZ);}
 }
 private updateSplashes(dt:number){
  const o=this.transform;let visible=0;
  for(let i=0;i<SPLASH;i++){
   this.splashAge[i]+=dt;const age=this.splashAge[i],duration=this.splashWater[i]?.7:.36,active=age<duration&&this.rainMix>0&&!this.reduced,k=i*3;
   const progress=age/duration,size=active?(.025+progress*(this.splashWater[i]?.2:.09))*(1-Math.max(0,(progress-.7)/.3)):0;
   o.position.set(this.splashPosition[k],this.splashPosition[k+1],this.splashPosition[k+2]);o.rotation.set(-Math.PI/2,0,0);o.scale.set(size,size,size);o.updateMatrix();this.splashes.setMatrixAt(i,o.matrix);if(active)visible++;
   this.splashes.setColorAt(i,this.color.setScalar(active?1-progress*.65:0));
  }
  this.splashes.visible=visible>0;this.splashes.material.opacity=this.rainMix*.4;this.splashes.instanceMatrix.needsUpdate=true;if(this.splashes.instanceColor)this.splashes.instanceColor.needsUpdate=true;
 }
 private updateDust(x:number,z:number){
  const o=this.transform;
  for(let i=0;i<DUST;i++){
   const gx=x+i%9-4,gz=z+Math.floor(i/9)-4,key=Math.imul(gx,73856093)^Math.imul(gz,19349663),px=gx*2.3+(seed(key,31231)-.5)*1.1,pz=gz*2.3+(seed(key,42433)-.5)*1.1,size=1.4+seed(key,9133)*1.6,s=this.surface(px,pz),radius=size*.5;
   const allowed=!s.water&&s.snowAllowed&&[[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dz])=>{const edge=this.surface(px+dx,pz+dz);return !edge.water&&edge.snowAllowed&&Math.abs(edge.height-s.height)<.08;});
   o.position.set(px,s.height+.008,pz);o.rotation.set(-Math.PI/2,0,seed(key,51329)*Math.PI);o.scale.setScalar(allowed?size:0);o.updateMatrix();this.dust.setMatrixAt(i,o.matrix);
  }
  this.dust.instanceMatrix.needsUpdate=true;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.root.removeFromParent();for(const m of [this.rain,this.snow,this.splashes,this.dust]){m.geometry.dispose();m.material.dispose();}this.sprite.dispose();}
}
