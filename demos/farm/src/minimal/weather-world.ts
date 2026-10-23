import * as THREE from 'three';
import {lightningStrength,WEATHER_PALETTES,type WeatherState} from './weather.ts';
export type WeatherWorldOptions={hemisphere:THREE.HemisphereLight;key:THREE.DirectionalLight;fill:THREE.DirectionalLight;reducedMotion?:boolean;shopPosition?:{x:number;y:number;z:number}};
const COUNT=224;
const wrap=(n:number,range:number)=>((n%range)+range)%range;
/** Owns only an isolated visual layer. Never changes terrain materials or gameplay. */
export class WeatherWorld{
 readonly root=new THREE.Group();
 readonly precipitation:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
 readonly rain:THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>;
 readonly clouds=new THREE.Group();
 readonly shopLight=new THREE.PointLight('#FFD99D',0,7,1.3);
 private positions=new Float32Array(COUNT*3);
 private seeds=new Float32Array(COUNT*3);
 private cloudMaterial=new THREE.MeshStandardMaterial({color:'#FFFFFF',roughness:1,transparent:true,opacity:.62,depthWrite:false});
 private cloudGeometry=new THREE.SphereGeometry(1,10,6);
 private targetSky=new THREE.Color();private targetCloud=new THREE.Color();private targetGround=new THREE.Color();private nightSky=new THREE.Color('#34445F');private nightCloud=new THREE.Color('#74819A');private nightGround=new THREE.Color('#73839B');
 private color=new THREE.Color();private disposed=false;private initial=true;
 private original:{background:THREE.Scene['background'];fog:THREE.Scene['fog'];hemi:THREE.Color;ground:THREE.Color;key:THREE.Color;fill:THREE.Color;hi:number;ki:number;fi:number};
 private sky=new THREE.Color();private fog:THREE.Fog;
 private scene:THREE.Scene;private options:WeatherWorldOptions;
 constructor(scene:THREE.Scene,options:WeatherWorldOptions){
  this.scene=scene;this.options=options;
  const {hemisphere:h,key:k,fill:f}=options;
  this.original={background:scene.background,fog:scene.fog,hemi:h.color.clone(),ground:h.groundColor.clone(),key:k.color.clone(),fill:f.color.clone(),hi:h.intensity,ki:k.intensity,fi:f.intensity};
  this.sky.copy(scene.background instanceof THREE.Color?scene.background:new THREE.Color('#DCECCF'));
  this.fog=new THREE.Fog(this.sky,23,53);scene.background=this.sky;scene.fog=this.fog;
  this.root.name='ranch-weather';this.root.add(this.clouds,this.shopLight);scene.add(this.root);
  const p=options.shopPosition??{x:-2,y:2.2,z:-3};this.shopLight.position.set(p.x,p.y,p.z);
  for(let i=0;i<5;i++){
   const cloud=new THREE.Group();cloud.position.set((i-2)*6,8.5+(i%2)*1.2,(i%3-1)*7);
   for(let j=0;j<3;j++){const puff=new THREE.Mesh(this.cloudGeometry,this.cloudMaterial);puff.scale.set(1.65+(j%2)*.4,.44+(j%2)*.2,.95);puff.position.set((j-1)*1.35,j%2*.18,0);cloud.add(puff);}this.clouds.add(cloud);
  }
  for(let i=0;i<COUNT;i++){this.seeds[i*3]=((i*73)%223)/223;this.seeds[i*3+1]=((i*97)%227)/227;this.seeds[i*3+2]=((i*137)%229)/229;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
  this.precipitation=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#E5F4FF',size:.065,transparent:true,opacity:.64,depthWrite:false,sizeAttenuation:true}));
  this.rain=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#D8EDFF',transparent:true,opacity:.52,depthWrite:false}));this.rain.name='ranch-rain-streaks';this.rain.frustumCulled=false;this.rain.visible=false;this.root.add(this.rain);
  this.precipitation.name='ranch-snow';this.precipitation.frustumCulled=false;this.precipitation.visible=false;this.root.add(this.precipitation);
 }
 update(state:WeatherState,dt:number,seconds:number,target:{x:number;z:number}){
  if(this.disposed)return;const {hemisphere:h,key:k,fill:f}=this.options,p=WEATHER_PALETTES[state.kind],day=state.daylight;
  const alpha=this.initial?1:1-Math.exp(-Math.min(.1,Math.max(0,dt))*2);this.initial=false;
  this.targetSky.set(p.sky).lerp(this.nightSky,1-day);this.sky.lerp(this.targetSky,alpha);this.fog.color.copy(this.sky);
  this.targetCloud.set(p.cloud).lerp(this.nightCloud,1-day);this.cloudMaterial.color.lerp(this.targetCloud,alpha);
  this.targetGround.set(p.ground).lerp(this.nightGround,1-day);h.groundColor.lerp(this.targetGround,alpha);
  h.color.lerp(this.color.set(day>.5?'#FFF8EB':'#BFCFEA'),alpha);k.color.lerp(this.color.set(day>.5?'#FFF0D1':'#B9CEF3'),alpha);f.color.lerp(this.color.set(day>.5?'#DEEADC':'#CCD8F5'),alpha);
  const flash=lightningStrength(seconds,state.kind,this.options.reducedMotion);
  h.intensity=THREE.MathUtils.lerp(h.intensity,1.12+day*.58-p.overcast*.16,alpha);
  k.intensity=THREE.MathUtils.lerp(k.intensity,.85+day*1.35-p.overcast*.8+flash,alpha);
  f.intensity=THREE.MathUtils.lerp(f.intensity,.65+day*.1,alpha);
  this.shopLight.intensity=THREE.MathUtils.lerp(this.shopLight.intensity,(1-day)*2.3,alpha);
  this.cloudMaterial.opacity=THREE.MathUtils.lerp(this.cloudMaterial.opacity,state.kind==='sunny'?.32:.72,alpha);
  for(let i=0;i<this.clouds.children.length;i++){const c=this.clouds.children[i];c.position.x=wrap((i-2)*6+(this.options.reducedMotion?0:seconds*.055),34)-17;c.position.z=(i%3-1)*7;}
  const snow=state.kind==='snow',wet=snow||state.kind==='rain'||state.kind==='storm';this.precipitation.visible=snow;this.rain.visible=wet&&!snow;
  if(!wet)return;
  this.precipitation.position.set(target.x,0,target.z);this.rain.position.copy(this.precipitation.position);
  const speed=snow?.8:state.kind==='storm'?6.5:5,drift=snow?.3:.85,t=this.options.reducedMotion?seconds*.3:seconds;
  this.precipitation.material.size=snow?.115:.055;this.precipitation.material.opacity=snow?.8:.65;
  for(let i=0;i<COUNT;i++){const j=i*3;this.positions[j]=wrap(this.seeds[j]*24+t*drift,24)-12+(snow?Math.sin(t*.6+i)*.2:0);this.positions[j+1]=.4+wrap(this.seeds[j+1]*10-t*speed,10);this.positions[j+2]=this.seeds[j+2]*24-12;}
  if(!snow)for(let i=0;i<COUNT;i+=2){const a=i*3,b=a+3;this.positions[b]=this.positions[a]+.045;this.positions[b+1]=this.positions[a+1]-.23;this.positions[b+2]=this.positions[a+2];}
  this.precipitation.geometry.attributes.position.needsUpdate=true;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.root.removeFromParent();this.precipitation.geometry.dispose();this.precipitation.material.dispose();this.rain.material.dispose();this.cloudGeometry.dispose();this.cloudMaterial.dispose();this.shopLight.dispose();
  const o=this.original,{hemisphere:h,key:k,fill:f}=this.options;
  if(this.scene.background===this.sky)this.scene.background=o.background;if(this.scene.fog===this.fog)this.scene.fog=o.fog;
  h.color.copy(o.hemi);h.groundColor.copy(o.ground);k.color.copy(o.key);f.color.copy(o.fill);h.intensity=o.hi;k.intensity=o.ki;f.intensity=o.fi;
 }
}
