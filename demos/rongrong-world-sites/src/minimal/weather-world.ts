import * as THREE from 'three';
import {lightningStrength,WEATHER_PALETTES,type WeatherState} from './weather.ts';
import {WeatherPrecipitation,type WeatherSurfaceSampler} from './weather-precipitation.ts';
export type WeatherWorldOptions={hemisphere:THREE.HemisphereLight;key:THREE.DirectionalLight;fill:THREE.DirectionalLight;reducedMotion?:boolean;shopPosition?:{x:number;y:number;z:number};sampleSurface?:WeatherSurfaceSampler};
const wrap=(n:number,range:number)=>((n%range)+range)%range;
/** Owns only an isolated visual layer. Never changes terrain materials or gameplay. */
export class WeatherWorld{
 readonly root=new THREE.Group();
 readonly precipitation:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
 readonly rain:THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>;
 readonly clouds=new THREE.Group();
 readonly shopLight=new THREE.PointLight('#FFD99D',0,7,1.3);
 private particles:WeatherPrecipitation;
 private cloudBatch:THREE.InstancedMesh;private cloudTransform=new THREE.Object3D();private time=0;private cloudTime=0;
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
  this.cloudBatch=new THREE.InstancedMesh(this.cloudGeometry,this.cloudMaterial,15);this.cloudBatch.name='ranch-cloud-puffs';this.cloudBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.cloudBatch.frustumCulled=false;this.clouds.add(this.cloudBatch);
  this.particles=new WeatherPrecipitation(options);this.precipitation=this.particles.snow;this.rain=this.particles.rain;this.root.add(this.particles.root);

 }
 setSurfaceSampler(sample:WeatherSurfaceSampler){this.particles.setSurfaceSampler(sample);}
 setReducedMotion(value:boolean){this.options.reducedMotion=value;this.particles.setReducedMotion(value);}
 update(state:WeatherState,dt:number,seconds:number,target:{x:number;z:number}){
  if(this.disposed)return;dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,.25)):0;this.time+=Math.min(dt,.05);const {hemisphere:h,key:k,fill:f}=this.options,p=WEATHER_PALETTES[state.kind],day=state.daylight;
  const alpha=this.initial?1:1-Math.exp(-Math.min(.1,Math.max(0,dt))*2);this.initial=false;
  this.targetSky.set(p.sky).lerp(this.nightSky,1-day);this.sky.lerp(this.targetSky,alpha);this.fog.color.copy(this.sky);
  this.targetCloud.set(p.cloud).lerp(this.nightCloud,1-day);this.cloudMaterial.color.lerp(this.targetCloud,alpha);
  this.targetGround.set(p.ground).lerp(this.nightGround,1-day);h.groundColor.lerp(this.targetGround,alpha);
  h.color.lerp(this.color.set(day>.5?'#FFF8EB':'#BFCFEA'),alpha);k.color.lerp(this.color.set(day>.5?'#FFF0D1':'#B9CEF3'),alpha);f.color.lerp(this.color.set(day>.5?'#DEEADC':'#CCD8F5'),alpha);
  const flash=lightningStrength(Number.isFinite(seconds)?seconds:this.time,state.kind,this.options.reducedMotion);
  h.intensity=THREE.MathUtils.lerp(h.intensity,1.12+day*.58-p.overcast*.16,alpha);
  k.intensity=THREE.MathUtils.lerp(k.intensity,.85+day*1.35-p.overcast*.8+flash,alpha);
  f.intensity=THREE.MathUtils.lerp(f.intensity,.65+day*.1,alpha);
  this.shopLight.intensity=THREE.MathUtils.lerp(this.shopLight.intensity,(1-day)*2.3,alpha);
  this.cloudMaterial.opacity=THREE.MathUtils.lerp(this.cloudMaterial.opacity,state.kind==='sunny'?.32:.72,alpha);
  if(!this.options.reducedMotion)this.cloudTime+=Math.min(dt,.05);const cloudTime=this.cloudTime;
  for(let i=0;i<5;i++)for(let j=0;j<3;j++){
   const c=this.cloudTransform;c.position.set(wrap((i-2)*6+cloudTime*.065+17,34)-17+(j-1)*1.35,8.5+(i%2)*1.2+j%2*.18,(i%3-1)*7);c.scale.set(1.65+(j%2)*.4,.44+(j%2)*.2,.95);c.updateMatrix();this.cloudBatch.setMatrixAt(i*3+j,c.matrix);
  }
  this.cloudBatch.instanceMatrix.needsUpdate=true;
  this.particles.update(state.kind,dt,target);

 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.root.removeFromParent();this.particles.dispose();this.cloudGeometry.dispose();this.cloudMaterial.dispose();this.shopLight.dispose();
  const o=this.original,{hemisphere:h,key:k,fill:f}=this.options;
  if(this.scene.background===this.sky)this.scene.background=o.background;if(this.scene.fog===this.fog)this.scene.fog=o.fog;
  h.color.copy(o.hemi);h.groundColor.copy(o.ground);k.color.copy(o.key);f.color.copy(o.fill);h.intensity=o.hi;k.intensity=o.ki;f.intensity=o.fi;
 }
}
