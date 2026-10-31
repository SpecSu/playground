import {TERRAIN_APPEARANCES,tileAppearance,type TerrainAppearance} from './terrain-appearance.ts';
import type {Terrain,Tile} from './model.ts';
export const TERRAIN_TYPES:readonly Terrain[]=['meadow','grove','hill','creek','pond','desert','glacier'];
export type TerrainField={readonly tiles:readonly Readonly<Tile>[];readonly lookup:ReadonlyMap<string,Readonly<Tile>>;readonly minX:number;readonly maxX:number;readonly minZ:number;readonly maxZ:number};
export const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
export function createTerrainField(tiles:readonly Tile[]):TerrainField{
 if(!tiles.length)throw new Error('Terrain field needs at least one tile');
 const copy=tiles.map(t=>Object.freeze({...t})).sort((a,b)=>a.z-b.z||a.x-b.x);
 return Object.freeze({tiles:Object.freeze(copy),lookup:new Map(copy.map(t=>[`${t.x},${t.z}`,t])),minX:Math.min(...copy.map(t=>t.x)),maxX:Math.max(...copy.map(t=>t.x)),minZ:Math.min(...copy.map(t=>t.z)),maxZ:Math.max(...copy.map(t=>t.z))});
}
function axis(world:number){const grid=world/2+1.5,lo=Math.floor(grid),fraction=grid-lo;const w=smooth((fraction-.35)/.3);return [[lo,1-w],[lo+1,w]] as const;}
/** Globally shared bounded warp; compact C1 support is .30+.06 world units at boundaries. */
export function sampleGround(field:TerrainField,x:number,z:number){
 const appearances:Record<TerrainAppearance,number>={natural:0,lunar:0,slate:0,rose:0};const weights:Record<Terrain,number>={meadow:0,grove:0,hill:0,creek:0,pond:0,desert:0,glacier:0};let owned=0,total=0;
 const wx=x+.06*Math.sin(z*1.7+x*.37),wz=z+.06*Math.sin(x*1.31-z*.43);
 for(const [gx,a]of axis(wx))for(const [gz,b]of axis(wz)){
  const cx=Math.max(field.minX,Math.min(field.maxX,gx)),cz=Math.max(field.minZ,Math.min(field.maxZ,gz)),t=field.lookup.get(`${cx},${cz}`);if(!t)continue;
  const w=a*b;weights[t.terrain]+=w;appearances[tileAppearance(t)]+=w;owned+=Number(t.owned)*w;total+=w;
 }
 // Sparse fixtures may have holes. Deterministic nearest-tile extension, never array-order dependent.
 if(!total){let nearest=field.tiles[0],distance=Infinity;for(const t of field.tiles){const d=((t.x-1.5)*2-x)**2+((t.z-1.5)*2-z)**2;if(d<distance){distance=d;nearest=t;}}weights[nearest.terrain]=1;appearances[tileAppearance(nearest)]=1;owned=Number(nearest.owned);total=1;}
 for(const type of TERRAIN_TYPES)weights[type]/=total;
 for(const appearance of TERRAIN_APPEARANCES)appearances[appearance]/=total;
 return {weights,appearances,owned:owned/total};
}
