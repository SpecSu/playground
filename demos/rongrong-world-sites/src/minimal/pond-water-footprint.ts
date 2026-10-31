import type {Tile} from './model.ts';
import {smooth} from './terrain-field.ts';
const dirs=[[1,0],[-1,0],[0,1],[0,-1]] as const;
export function waterEdgeConnection(a:Tile,b:Tile){if(Math.abs(a.x-b.x)+Math.abs(a.z-b.z)!==1||!([a.terrain,b.terrain].includes('creek')&&[a.terrain,b.terrain].includes('pond')))return null;return {center:0,halfWidth:.36};}
/** Exact pond surface field shared with rendering. Grid tiles are converted to
 * scene-world meters here; dry shoreline is not the same as the whole pond tile.
 * This module has no Three, scene, asset, or runtime-model imports. */
export function createPondWaterFootprint(tiles:readonly Tile[]){
 const lookup=new Map(tiles.map(t=>[`${t.x},${t.z}`,{...t}])),shores:{ax:number;az:number;bx:number;bz:number}[]=[];
 // Global exposed shore segments: adjacent ponds sample the same depth, even at L corners.
 for(const t of tiles)if(t.terrain==='pond')for(const [dx,dz]of dirs){const n=lookup.get(`${t.x+dx},${t.z+dz}`);if(n?.terrain==='pond')continue;const cx=(t.x-1.5)*2+dx,cz=(t.z-1.5)*2+dz,intervals=n&&waterEdgeConnection(t,n)?[[-1,-.36],[.36,1]]:[[-1,1]];for(const [a,b]of intervals)shores.push({ax:cx+(dz?a:0),az:cz+(dx?a:0),bx:cx+(dz?b:0),bz:cz+(dx?b:0)});}
 // Depth is saturated by .73 world units; .80 also bounds all visible shore/clip influence.
 const shoreBins=new Map<string,typeof shores>();
 for(const segment of shores)for(let gx=Math.floor((Math.min(segment.ax,segment.bx)-.8)/2+2);gx<=Math.floor((Math.max(segment.ax,segment.bx)+.8)/2+2);gx++)for(let gz=Math.floor((Math.min(segment.az,segment.bz)-.8)/2+2);gz<=Math.floor((Math.max(segment.az,segment.bz)+.8)/2+2);gz++){
  const key=`${gx},${gz}`,bin=shoreBins.get(key)??[];bin.push(segment);shoreBins.set(key,bin);
 }
 return {lookup,shores,shoreBins};
}
export type PondWaterFootprint=ReturnType<typeof createPondWaterFootprint>;
/** distance<=0 is pond water coverage. Non-pond tiles (including standalone
 * creek) return dry; creek mouths modify the pond side exactly as rendered.
 * Optional tileHint is only for rendering a shared edge from either tile side. */
export function samplePondWaterFootprint(field:PondWaterFootprint,x:number,z:number,tileHint?:Tile):{distance:number;depth:number}{
 const t=tileHint??field.lookup.get(`${Math.round(x/2+1.5)},${Math.round(z/2+1.5)}`);if(!t||t.terrain!=='pond')return {distance:1,depth:0};
 const lx=x-(t.x-1.5)*2,lz=z-(t.z-1.5)*2;
 let edge=.8;for(const s of field.shoreBins.get(`${Math.floor(x/2+2)},${Math.floor(z/2+2)}`)??[]){const vx=s.bx-s.ax,vz=s.bz-s.az,u=Math.max(0,Math.min(1,((x-s.ax)*vx+(z-s.az)*vz)/(vx*vx+vz*vz)));edge=Math.min(edge,Math.hypot(x-s.ax-u*vx,z-s.az-u*vz));}
 let distance=.08+.018*Math.sin(x*4.1+z*1.7)*Math.sin(z*3.3-x*.9)-edge,depth=Math.min(1,Math.max(0,(edge-.08)/.65));
 for(const [dx,dz]of dirs){const n=field.lookup.get(`${t.x+dx},${t.z+dz}`);if(!n||!waterEdgeConnection(t,n))continue;
  const inset=1-(dx?lx*dx:lz*dz),cross=Math.abs(dx?lz:lx),ease=smooth((.6-inset)/.6);if(!ease)continue;
  const mouthDistance=cross-.36;distance=Math.min(distance,mouthDistance);const influence=ease*(1-smooth((cross-.36)/.10));depth=depth*(1-influence)+Math.max(0,1-cross/.36)*.5*influence;
 }
 return {distance,depth};
}
