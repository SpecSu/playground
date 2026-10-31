import {SHOP_TILES,WATER_BOWL} from './farm-landmarks.ts';
import type {MinimalState,Tile} from './model.ts';
export type TerrainLevel=1|2|3;
export type SupplyVector={food:number;water:number;rest:number};
export type FarmSupply={capacity:SupplyVector;satisfaction:SupplyVector;animals:number;growthBonusRate:number};
export const TERRAIN_QUALITY_LABELS={1:'自然',2:'丰茂',3:'珍景'} as const;
export function tileLevel(tile:Pick<Tile,'level'>):TerrainLevel{return tile.level??1;}
export function terrainUpgradeCost(tile:Pick<Tile,'level'>):number|null{return tileLevel(tile)===1?30:tileLevel(tile)===2?60:null;}
export function tileSupply(tile:Pick<Tile,'terrain'|'level'>):SupplyVector{
 const multiplier=1+(tileLevel(tile)-1)*.5;
 return {food:tile.terrain==='meadow'?multiplier:0,water:(tile.terrain==='creek'?4:tile.terrain==='pond'?6:0)*multiplier,rest:(tile.terrain==='grove'?4:tile.terrain==='hill'?2:0)*multiplier};
}
const key=(p:{x:number;z:number})=>`${p.x},${p.z}`;
const neighbors=(p:{x:number;z:number})=>[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}];
/** Temporary animal/egg occupancy does not consume land's permanent care capacity. */
export function farmSupply(state:Pick<MinimalState,'tiles'|'animals'>):FarmSupply{
 const tiles=new Map(state.tiles.map(t=>[key(t),t]));
 const isShop=(t:Tile)=>SHOP_TILES.some(p=>p.x===t.x&&p.z===t.z);
 const usable=(t:Tile|undefined):t is Tile=>!!t?.owned&&!isShop(t)&&t.terrain!=='pond';
 const reachable=new Set<string>(),queue=[WATER_BOWL];
 for(let i=0;i<queue.length;i++){const p=queue[i],k=key(p);if(reachable.has(k)||!usable(tiles.get(k)))continue;reachable.add(k);queue.push(...neighbors(p));}
 // Flood each pond from a reachable shore, including interior cells of that pond.
 const ponds=state.tiles.filter(t=>t.owned&&t.terrain==='pond'&&neighbors(t).some(p=>reachable.has(key(p))));
 const water=new Set<string>();
 for(let i=0;i<ponds.length;i++){const t=ponds[i],k=key(t);if(water.has(k))continue;water.add(k);for(const p of neighbors(t)){const next=tiles.get(key(p));if(next?.owned&&next.terrain==='pond'&&!water.has(key(next)))ponds.push(next);}}
 const capacity:SupplyVector={food:2,water:2,rest:2};
 for(const tile of state.tiles){if(!reachable.has(key(tile))&&!water.has(key(tile)))continue;const add=tileSupply(tile);for(const kind of ['food','water','rest'] as const)capacity[kind]+=add[kind];}
 const animals=state.animals.length,denominator=Math.max(1,animals);
 const satisfaction={food:Math.min(1,capacity.food/denominator),water:Math.min(1,capacity.water/denominator),rest:Math.min(1,capacity.rest/denominator)};
 return {capacity,satisfaction,animals,growthBonusRate:animals?Math.min(.2,.08*satisfaction.food+.08*satisfaction.water+.04*satisfaction.rest):0};
}
