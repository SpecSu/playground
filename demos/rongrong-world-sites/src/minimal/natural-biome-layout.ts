import type {MinimalState,Point,Tile} from './model.ts';
import {SHOP_TILES,WATER_BOWL,REST_MAT} from './farm-landmarks.ts';

type Theme='desert'|'glacier';
type LayoutInput=Pick<MinimalState,'tiles'|'player'|'playerPath'|'animals'|'eggs'>;
const key=(p:Point)=>`${p.x},${p.z}`;
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.z-b.z);
const adjacent=(p:Point):Point[]=>[{x:p.x-1,z:p.z},{x:p.x+1,z:p.z},{x:p.x,z:p.z-1},{x:p.x,z:p.z+1}];

/** Protect every cell touched by a continuous route, not just its waypoints. */
function touchesSegment(tile:Point,a:Point,b:Point):boolean{
 let lo=0,hi=1;
 for(const axis of ['x','z'] as const){
  const delta=b[axis]-a[axis],min=tile[axis]-.5,max=tile[axis]+.5;
  if(delta===0){if(a[axis]<min||a[axis]>max)return false;}
  else {const u=(min-a[axis])/delta,v=(max-a[axis])/delta;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false;}
 }
 return true;
}

/** One-time, deterministic layout planning. Caller owns versioning and exploration grants. */
export function planNaturalBiomes(input:LayoutInput):{tiles:Tile[];compatibilityGrants:Theme[]}{
 const tiles:Tile[]=input.tiles.map(t=>({...t,naturalTerrain:t.naturalTerrain??t.terrain}));
 // Initialized origins are immutable, even after current terrain has been converted.
 if(input.tiles.every(t=>t.naturalTerrain!==undefined))return {tiles,compatibilityGrants:[]};
 const byKey=new Map(tiles.map(t=>[key(t),t]));
 const shops=new Set(SHOP_TILES.map(key));
 const protectedKeys=new Set([...SHOP_TILES,WATER_BOWL,REST_MAT].map(key));
 const protect=(p:Point)=>protectedKeys.add(key({x:Math.round(p.x),z:Math.round(p.z)}));
 const protectRoute=(start:Point,path:Point[])=>{
  protect(start);
  for(let i=0;i<path.length;i++)for(const tile of tiles)if(touchesSegment(tile,i?path[i-1]:start,path[i]))protectedKeys.add(key(tile));
 };
 protectRoute(input.player,input.playerPath);
 for(const animal of input.animals){
  protectRoute(animal.position,animal.path??[]);
  if(animal.target)protect(animal.target);
  if(animal.drinkAnchor){protect(animal.drinkAnchor.site);protect(animal.drinkAnchor.stance);if(animal.drinkAnchor.waterSite)protect(animal.drinkAnchor.waterSite);}
 }
 for(const egg of input.eggs)if(egg.location==='ground'&&egg.position)protect(egg.position);
 // Expansion accepts a tile next to any owned walkable tile. Flooding non-pond
 // land simulates all possible successive expansions without assuming free coins.
 const owned=tiles.filter(t=>t.owned&&t.terrain!=='pond'&&!shops.has(key(t)));
 const reachable=new Set(owned.map(key)),queue=[...owned];
 for(let i=0;i<queue.length;i++)for(const p of adjacent(queue[i])){
  const tile=byKey.get(key(p));
  if(tile&&tile.terrain!=='pond'&&!shops.has(key(tile))&&!reachable.has(key(tile))){reachable.add(key(tile));queue.push(tile);}
 }
 const original=new Map(input.tiles.map(t=>[key(t),t]));
 const safe=tiles.filter(t=>!t.owned&&!protectedKeys.has(key(t))&&reachable.has(key(t))&&['meadow','hill','grove'].includes(t.terrain)&&original.get(key(t))!.naturalTerrain===undefined);
 const safeKeys=new Set(safe.map(key));
 const hasTheme=(theme:Theme)=>tiles.some(t=>t.naturalTerrain===theme&&(t.owned||reachable.has(key(t))));
 const candidates=(theme:Theme):Tile[][]=>{
  if(hasTheme(theme))return [[]];
  const opposite=theme==='desert'?'glacier':'desert';
  const allowed=(patch:Tile[])=>patch.every(t=>!adjacent(t).some(p=>byKey.get(key(p))?.terrain===opposite));
  const rank=(a:Tile,b:Tile)=>{
   const depth=(t:Tile)=>Math.min(...owned.map(o=>distance(t,o)));
   return depth(b)-depth(a)||(theme==='desert'?a.z-b.z||a.x-b.x:b.z-a.z||b.x-a.x);
  };
  const singles=[...safe].sort(rank).map(t=>[t]);
  const squares=[...safe].sort(rank).flatMap(t=>{
   const points=[t,{x:t.x+1,z:t.z},{x:t.x,z:t.z+1},{x:t.x+1,z:t.z+1}];
   return points.every(p=>safeKeys.has(key(p)))?[points.map(p=>byKey.get(key(p))!)]:[];
  });
  return [...squares,...singles].filter(allowed);
 };
 const deserts=candidates('desert'),glaciers=candidates('glacier');
 let chosen:Tile[][]|undefined;
 // Try all large pairs before degrading either side; do not commit a greedy
 // first patch that could block the only valid partner in a constrained save.
 for(const sizes of [[4,4],[4,1],[1,4],[1,1]]){
  for(const desert of deserts.filter(p=>p.length===0||p.length===sizes[0])){
   const glacier=glaciers.find(p=>(p.length===0||p.length===sizes[1])&&p.every(g=>desert.every(d=>distance(d,g)>1)));
   if(glacier){chosen=[desert,glacier];break;}
  }
  if(chosen)break;
 }
 if(!chosen)chosen=[deserts[0]??[],[]];
 // A single available theme is still useful; grant only the absent one.
 if(!chosen[0].length&&!hasTheme('desert'))chosen[1]=glaciers[0]??[];
 const themes:Theme[]=['desert','glacier'];
 for(let i=0;i<themes.length;i++)for(const tile of chosen[i]){tile.terrain=themes[i];tile.naturalTerrain=themes[i];}
 return {tiles,compatibilityGrants:themes.filter(theme=>!hasTheme(theme))};
}
