/** Natural-resource metadata is separate from walkability. Generic turf and
 * placed decorations are not fertile grassland or woodland. Rendering, previews
 * and production all consume this same map and four-edge footprint rule. */
import {buildingFootprint, type Building, type GridPoint, type Layout} from './layout.ts';

export type FoodResource = 'grassland'|'freshwater'|'forest';
export type FoodQuality = 'plain'|'fresh'|'rich';
export type FoodStars = 0|1|2|3;
export type NaturalResourceKind = 'grassland'|'forest'|'pond'|'river';
export interface FoodResourcePatch {
  readonly id:string;
  readonly kind:NaturalResourceKind;
  readonly cells:readonly Readonly<GridPoint>[];
}
export interface FoodProduction {
  batchSize:number;intervalMs:number;quality:FoodQuality;nutrition:number;
}
export interface FoodSiteRating {
  stars:FoodStars;resources:FoodResource[];border:GridPoint[];production:FoodProduction;
}

const key=(p:Readonly<GridPoint>)=>`${p.x},${p.z}`;
const RESOURCE_ORDER:readonly FoodResource[]=['grassland','freshwater','forest'];
const category=(kind:NaturalResourceKind):FoodResource=>kind==='pond'||kind==='river'?'freshwater':kind;

/** Pond cells mirror layout.terrainAt, including the pond's two deep cells.
 * The deep outer sea is deliberately absent. River patches use the same
 * freshwater category when another map supplies them; this map has no river. */
export const FOOD_RESOURCE_PATCHES:readonly FoodResourcePatch[]=Object.freeze([
  {id:'fertile-bank',kind:'grassland' as const,cells:[{x:8,z:6},{x:9,z:6}]},
  {id:'bank-woodland',kind:'forest' as const,cells:[{x:7,z:7},{x:7,z:8}]},
  {id:'pond',kind:'pond' as const,cells:[
    {x:10,z:8},{x:10,z:9},{x:10,z:10},{x:10,z:11},
    {x:11,z:8},{x:11,z:9},{x:11,z:10},{x:11,z:11},
  ]},
].map(patch=>Object.freeze({...patch,cells:Object.freeze(patch.cells.map(cell=>Object.freeze(cell)))})));

export const FOOD_NUTRITION:Readonly<Record<FoodQuality,number>>=Object.freeze({plain:30,fresh:36,rich:42});
export const FOOD_PRODUCTION_BY_STARS:Readonly<Record<FoodStars,Readonly<FoodProduction>>>=Object.freeze({
  0:Object.freeze({batchSize:3,intervalMs:60_000,quality:'plain',nutrition:FOOD_NUTRITION.plain}),
  1:Object.freeze({batchSize:3,intervalMs:50_000,quality:'plain',nutrition:FOOD_NUTRITION.plain}),
  2:Object.freeze({batchSize:3,intervalMs:40_000,quality:'fresh',nutrition:FOOD_NUTRITION.fresh}),
  3:Object.freeze({batchSize:3,intervalMs:30_000,quality:'rich',nutrition:FOOD_NUTRITION.rich}),
});

/** Optional patches support alternate authored maps without changing the rule. */
export function resourcesAt(cell:GridPoint,patches:readonly FoodResourcePatch[]=FOOD_RESOURCE_PATCHES):FoodResource[] {
  if(!Number.isSafeInteger(cell.x)||!Number.isSafeInteger(cell.z)) return [];
  const found=new Set(patches.filter(patch=>patch.cells.some(p=>p.x===cell.x&&p.z===cell.z)).map(patch=>category(patch.kind)));
  return RESOURCE_ORDER.filter(resource=>found.has(resource));
}

/** Count categories, not cells. Only outside cells sharing a footprint edge
 * qualify, never corners, covered land or cells inside the evaluated building.
 * Pass the current layout for live production and the preview layout for edits.
 * Other buildings suppress covered natural cells; they never create resources. */
export function foodSiteRating(building:Building,layout?:Pick<Layout,'buildings'>,
  patches:readonly FoodResourcePatch[]=FOOD_RESOURCE_PATCHES):FoodSiteRating {
  const footprint=buildingFootprint(building),inside=new Set(footprint.map(key));
  const borderMap=new Map<string,GridPoint>();
  for(const p of footprint) for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]) {
    const next={x:p.x+dx,z:p.z+dz};
    if(!inside.has(key(next))) borderMap.set(key(next),next);
  }
  const border=[...borderMap.values()];
  const covered=new Set((layout?.buildings??[]).filter(b=>b.id!==building.id).flatMap(buildingFootprint).map(key));
  const found=new Set(border.filter(p=>!covered.has(key(p))).flatMap(p=>resourcesAt(p,patches)));
  const resources=RESOURCE_ORDER.filter(resource=>found.has(resource));
  const stars=resources.length as FoodStars;
  return {stars,resources,border,production:{...FOOD_PRODUCTION_BY_STARS[stars]}};
}
