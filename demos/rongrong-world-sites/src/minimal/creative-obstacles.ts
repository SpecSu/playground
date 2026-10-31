import type {MinimalState,Point} from './model.ts';
import type {CreativeAsset} from './creative-assets.ts';
/** Derived spatial context only; asset identity/ownership remains in creative.assets. */
export type StaticObstacleState={staticObstacles?:readonly Point[]};
export const MAX_STATIC_OBSTACLES=32;
const key=(p:Point)=>`${p.x},${p.z}`;
const validPoint=(p:unknown):p is Point=>!!p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===2&&Object.keys(p).every(k=>k==='x'||k==='z')&&['x','z'].every(k=>Number.isInteger((p as Record<string,unknown>)[k])&&Number((p as Record<string,unknown>)[k])>=-3&&Number((p as Record<string,unknown>)[k])<=6);
export function validStaticObstacles(value:unknown):boolean{return value===undefined||Array.isArray(value)&&value.length<=MAX_STATIC_OBSTACLES&&value.every(validPoint)&&new Set(value.map(key)).size===value.length;}
export function withoutStaticObstacles<T extends object>(state:T):T{const next={...state};delete (next as T&StaticObstacleState).staticObstacles;return next;}
export function projectCreativeObstacles(state:MinimalState,assets:readonly CreativeAsset[]=[],excludeId?:string):MinimalState{
 const next=withoutStaticObstacles(state),cells=new Map<string,Point>();
 for(const asset of assets){if(asset.id===excludeId||asset.location!=='ground'||asset.kind!=='prop'&&asset.kind!=='custom-egg'||!validPoint(asset.position))continue;cells.set(key(asset.position),{x:asset.position.x,z:asset.position.z});if(cells.size>=MAX_STATIC_OBSTACLES)break;}
 if(cells.size)next.staticObstacles=[...cells.values()].sort((a,b)=>a.z-b.z||a.x-b.x);return next;
}
export function staticObstacleAt(state:StaticObstacleState,p:Point):boolean{return !!state.staticObstacles?.some(o=>o.x===Math.round(p.x)&&o.z===Math.round(p.z));}
/** Closed conservative tile envelope contains every currently released prop/egg mesh. */
export function staticObstacleSegmentClear(state:StaticObstacleState,from:Point,to:Point,padding=0):boolean{
 if(!state.staticObstacles?.length)return true;
 return !state.staticObstacles.some(o=>{
  let lo=0,hi=1;const half=.500001+Math.max(0,padding);
  for(const axis of ['x','z'] as const){const delta=to[axis]-from[axis],a=o[axis]-half,b=o[axis]+half;if(Math.abs(delta)<1e-12){if(from[axis]<a||from[axis]>b)return false;}else{const u=(a-from[axis])/delta,v=(b-from[axis])/delta;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}}
  return lo<=hi;
 });
}
/** Start-only escape projection; exact closed bounds avoid trapping legacy roots at .5. */
export function staticObstacleEscape<T extends StaticObstacleState>(state:T,from:Point,padding=0):T{
 const obstacles=state.staticObstacles?.filter(o=>Math.abs(o.x-from.x)>.500001+padding||Math.abs(o.z-from.z)>.500001+padding);
 return !obstacles||obstacles.length===state.staticObstacles?.length?state:{...state,staticObstacles:obstacles};
}
/** An already overlapping actor may move out, never deeper or back in later.
 * Call per segment with the original obstacles, not a whole-path escape copy. */
export function staticObstacleSegmentSafe(state:StaticObstacleState,from:Point,to:Point,padding=0):boolean{
 const escaped=staticObstacleEscape(state,from,padding);
 if(escaped===state)return staticObstacleSegmentClear(state,from,to,padding);
 for(const o of state.staticObstacles??[])if(!escaped.staticObstacles?.includes(o)&&(from.x-o.x)*(to.x-from.x)+(from.z-o.z)*(to.z-from.z)<-1e-9)return false;
 return staticObstacleSegmentClear(escaped,from,to,padding);
}
/** Compare reachable dry cells before/after placement, rather than banning future routes. */
export function creativePlacementIssue(state:MinimalState,at:Point,kind:'prop'|'custom-egg',animalRadii:readonly {position:Point;radius:number}[]):string|null{
 const tile=state.tiles.find(t=>t.x===at.x&&t.z===at.z);
 if(!tile?.owned||tile.terrain==='pond'||kind==='prop'&&tile.terrain==='creek')return '选择一块已开辟的干燥空地';
 const addition={staticObstacles:[at]};
 if(!staticObstacleSegmentClear(addition,state.player,state.player,.15)||animalRadii.some(a=>!staticObstacleSegmentClear(addition,a.position,a.position,a.radius)))return '这里离人物或伙伴太近，先腾出位置';
 const base=staticObstacleEscape(state,state.player),startKey=key({x:Math.round(state.player.x),z:Math.round(state.player.z)}),nests=new Set(state.eggs.filter(e=>e.location==='ground'&&e.position&&key(e.position)!==startKey).map(e=>key(e.position!))),land=(p:Point)=>{const t=state.tiles.find(t=>t.x===p.x&&t.z===p.z);return !!t?.owned&&t.terrain!=='pond'&&!(p.z===0&&(p.x===0||p.x===1))&&!nests.has(key(p));};
 const reachable=(added:boolean)=>{const seen=new Set<string>(),queue=[{x:Math.round(state.player.x),z:Math.round(state.player.z)}];for(let i=0;i<queue.length;i++){const p=queue[i],k=key(p);if(seen.has(k)||!land(p)||staticObstacleAt(base,p)||added&&key(at)===k)continue;seen.add(k);queue.push({x:p.x-1,z:p.z},{x:p.x+1,z:p.z},{x:p.x,z:p.z-1},{x:p.x,z:p.z+1});}return seen;};
 const before=reachable(false),after=reachable(true);if([...before].some(k=>k!==key(at)&&!after.has(k)))return '这里会挡住通路，换一块边上的空地';return null;
}
