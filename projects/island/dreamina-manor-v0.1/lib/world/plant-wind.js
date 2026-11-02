import * as THREE from 'three';
const WIDE=new Set(['lithops','spiral-aloe','pumpkin','radish']);
export function plantWindParameters(id,speciesId){let h=2166136261;for(const c of String(id)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}const u=h>>>0;return{phase:(u%65536)/65536*Math.PI*2,speed:.65+((u>>>16)%1000)/1000*.45,amplitude:(WIDE.has(speciesId)?.007:.022)*(.8+(u%127)/127*.4)};}
// Only world instances get this pivot. Thumbnail and carried factories stay static.
export function createWorldPlantWind(presentation,item){
 const root=new THREE.Group(),pivot=new THREE.Group();root.add(pivot);pivot.add(presentation.root);const params=plantWindParameters(item.id,item.speciesId),organ=typeof presentation.animate==='function';let time=params.phase/params.speed,sampleAge=Infinity,x=0,z=0;
 return{root,pivot,params,step(dt,visible=true,far=false,reduced=false){
  if(!visible)return;const step=Math.max(0,Math.min(.05,dt));
  if(reduced){pivot.rotation.x=pivot.rotation.z=0;return;}
  time+=step;sampleAge+=step;
  if(sampleAge>=(far?.12:0)){sampleAge=0;if(organ)presentation.animate(time*params.speed);else{x=Math.sin(time*params.speed*.83+.7)*params.amplitude*.55;z=Math.sin(time*params.speed)*params.amplitude;}}
  if(!organ){const a=1-Math.exp(-step*12);pivot.rotation.x+=(x-pivot.rotation.x)*a;pivot.rotation.z+=(z-pivot.rotation.z)*a;}
 }};
}
