import type {HunyuanEnvironmentPlacement} from './hunyuan-environment-scene.ts';
export type HunyuanLandmarkTile={x:number;z:number;terrain:string;naturalTerrain?:string;owned:boolean};
type Point={x:number;z:number};
export type EnvironmentExclusions={circles?:readonly (Point&{radius:number})[];paths?:readonly (readonly Point[])[];observer?:Point};
const finite=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.z);
const world=(p:Point):Point=>({x:(p.x-1.5)*2,z:(p.z-1.5)*2});
const segmentDistance=(p:Point,a:Point,b:Point)=>{const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz,u=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/n)):0;return Math.hypot(p.x-a.x-dx*u,p.z-a.z-dz*u);};
const validExclusions=(e:EnvironmentExclusions)=>!(e.observer&&!finite(e.observer)||e.circles?.some(p=>!finite(p)||!Number.isFinite(p.radius)||p.radius<0)||e.paths?.some(path=>path.some(p=>!finite(p))));
/** Cheap per-frame check for the at-most-two selected landmarks; no tile scan. */
export function environmentPlacementClear(p:HunyuanEnvironmentPlacement,exclusions:EnvironmentExclusions={}):boolean{
 if(!finite(p)||!Number.isFinite(p.maxDimension)||p.maxDimension<=0||!validExclusions(exclusions))return false;
 const radius=p.maxDimension/Math.SQRT2;
 if(exclusions.observer){const d=Math.hypot(p.x-exclusions.observer.x,p.z-exclusions.observer.z);if(d<radius+1.5||d>30)return false;}
 if(exclusions.circles?.some(c=>Math.hypot(p.x-c.x,p.z-c.z)<=radius+c.radius+.45))return false;
 if(exclusions.paths?.some(path=>path.some((point,i)=>segmentDistance(p,i?path[i-1]:point,point)<=radius+.45)))return false;
 return true;
}
/** Decorative meshes only. Own land and every continuous route retain their original floor/physics.
 * Up to two landmarks; none is the safe answer when a map has no eligible location.
 */
export function selectEnvironmentPlacements(input:readonly HunyuanLandmarkTile[],exclusions:EnvironmentExclusions={}):HunyuanEnvironmentPlacement[]{
 if(!validExclusions(exclusions))return [];
 const tiles=input.filter(t=>finite(t)&&Number.isInteger(t.x)&&Number.isInteger(t.z));
 const owned=tiles.filter(t=>t.owned).map(world),selected:HunyuanEnvironmentPlacement[]=[];
 const safe=(p:HunyuanEnvironmentPlacement)=>{
  const half=p.maxDimension/2,radius=half*Math.SQRT2;
  if(owned.some(o=>Math.hypot(p.x-o.x,p.z-o.z)<4.5||Math.abs(p.x-o.x)<=half+1.5&&Math.abs(p.z-o.z)<=half+1.5))return false;
  if(!environmentPlacementClear(p,exclusions))return false;
  if(selected.some(other=>Math.hypot(p.x-other.x,p.z-other.z)<radius+other.maxDimension/Math.SQRT2+.5))return false;
  return true;
 };
 for(const [terrain,asset] of [['desert','desert-dunes'],['glacier','glacier-outcrop']] as const){
  const eligible=tiles.filter(t=>!t.owned&&t.terrain===terrain&&(t.naturalTerrain??t.terrain)===terrain).sort((a,b)=>a.z-b.z||a.x-b.x);
  const keys=new Set(eligible.map(t=>`${t.x},${t.z}`)),candidates:HunyuanEnvironmentPlacement[]=[];
  for(const t of eligible)if([[1,0],[0,1],[1,1]].every(([dx,dz])=>keys.has(`${t.x+dx},${t.z+dz}`))){const p=world({x:t.x+.5,z:t.z+.5});candidates.push({id:`hunyuan-${terrain}-${t.x}-${t.z}-patch`,asset,...p,groundY:0,maxDimension:3.2,yaw:0});}
  // Full patches win; sparse/fragmented natural biomes may use a contained small landmark.
  for(const t of eligible)candidates.push({id:`hunyuan-${terrain}-${t.x}-${t.z}`,asset,...world(t),groundY:0,maxDimension:1.35,yaw:0});
  const p=candidates.find(safe);if(p)selected.push(p);
 }
 return selected;
}
export const selectHunyuanLandmarks=selectEnvironmentPlacements;
