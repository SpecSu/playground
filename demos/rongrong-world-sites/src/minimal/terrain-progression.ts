import {SHOP_TILES} from './farm-landmarks.ts';
import type {MinimalState,Point,Terrain,Tile} from './model.ts';
import {EGG_THEME_LABELS,themeForNaturalTerrain,type EggTheme} from './egg-catalog.ts';
export function terrainConversionIssue(tiles:readonly Tile[],at:Point,to:Terrain):string|null{
 if(to!=='desert'&&to!=='glacier')return null;
 const opposite=to==='desert'?'glacier':'desert';
 return tiles.some(t=>Math.abs(t.x-at.x)+Math.abs(t.z-at.z)===1&&t.terrain===opposite)?'沙漠和冰川之间需要隔一块其他地形':null;
}
export function explorationIssue(explored:readonly EggTheme[],to:Terrain):string|null{
 if(to!=='desert'&&to!=='glacier'||explored.includes(to))return null;
 return `先开垦一块自然${EGG_THEME_LABELS[to]}，再改造这种地形`;
}
export function grantNaturalBiome(explored:EggTheme[],tile:Tile){const theme=themeForNaturalTerrain(tile.naturalTerrain??tile.terrain);if(theme&&!explored.includes(theme))explored.push(theme);}
/** Find a real natural tile reachable by a sequence of ordinary expansions. */
export function naturalBiomeTarget(state:{tiles:readonly Tile[]},theme:EggTheme):Point|null{
 const tiles=new Map(state.tiles.map(t=>[`${t.x},${t.z}`,t])),distances=new Map<string,number>(),queue:Point[]=[];
 const neighbors=(p:Point)=>[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}];
 const shop=(p:Point)=>SHOP_TILES.some(t=>t.x===p.x&&t.z===p.z);
 for(const t of state.tiles)if(t.owned&&t.terrain!=='pond'&&!shop(t)){distances.set(`${t.x},${t.z}`,0);queue.push(t);}
 for(let i=0;i<queue.length;i++)for(const p of neighbors(queue[i])){const key=`${p.x},${p.z}`,tile=tiles.get(key);if(!tile||shop(tile)||tile.terrain==='pond'||distances.has(key))continue;distances.set(key,distances.get(`${queue[i].x},${queue[i].z}`)!+1);queue.push(tile);}
 // Pond expansion additionally requires all owned walkable land to be connected.
 // Future nonpond expansions can bridge components, but a pond barrier cannot.
 const component=new Set<string>(),pending:Point[]=queue.length?[queue[0]]:[];
 if(pending.length)component.add(`${pending[0].x},${pending[0].z}`);
 for(let i=0;i<pending.length;i++)for(const p of neighbors(pending[i])){const key=`${p.x},${p.z}`,tile=tiles.get(key);if(!tile||shop(tile)||tile.terrain==='pond'||component.has(key))continue;component.add(key);pending.push(tile);}
 const landCanConnect=state.tiles.every(t=>!t.owned||t.terrain==='pond'||shop(t)||component.has(`${t.x},${t.z}`));
 const reach=(t:Tile)=>t.terrain==='pond'&&!landCanConnect?Infinity:t.terrain==='pond'?Math.min(...neighbors(t).map(p=>distances.get(`${p.x},${p.z}`)??Infinity))+1:distances.get(`${t.x},${t.z}`)??Infinity;
 const candidates=state.tiles.filter(t=>!t.owned&&themeForNaturalTerrain(t.naturalTerrain??t.terrain)===theme&&Number.isFinite(reach(t))).sort((a,b)=>reach(a)-reach(b)||a.z-b.z||a.x-b.x);
 return candidates.length?{x:candidates[0].x,z:candidates[0].z}:null;
}

/** Shared presentation/domain precondition; compatibility does not waive price,
 * first hatch, target ownership, occupancy, connectivity or ecological checks. */
export function conversionExpansionIssue(state:Pick<MinimalState,'expansions'|'biomeCompatibilityReason'|'biomeCompatibilityGrants'|'tiles'>,to:Terrain):string|null{
 const theme=themeForNaturalTerrain(to),compatibility=state.biomeCompatibilityReason==='legacy-no-reachable-natural-target'&&theme!==null&&state.biomeCompatibilityGrants?.includes(theme)&&!naturalBiomeTarget(state,theme);
 return state.expansions||compatibility?null:'先开辟一块新地，再尝试改造';
}
