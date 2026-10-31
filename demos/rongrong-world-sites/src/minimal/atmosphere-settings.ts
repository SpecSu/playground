import type {MinimalState} from './model.ts';
export const ATMOSPHERE_STORAGE='dreamina-farm-atmosphere-v1';
export type AtmosphereSettings={volume:number;reducedMotion:boolean};
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
const volume=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):.65;
export function loadAtmosphereSettings(storage:StorageAccess|undefined,systemReduced=false):AtmosphereSettings{
 try{const saved=JSON.parse(storage?.getItem(ATMOSPHERE_STORAGE)??'null');return {volume:volume(saved?.volume),reducedMotion:typeof saved?.reducedMotion==='boolean'?saved.reducedMotion:systemReduced};}catch{return {volume:.65,reducedMotion:systemReduced};}
}
export function saveAtmosphereSettings(storage:StorageAccess|undefined,settings:AtmosphereSettings){
 try{storage?.setItem(ATMOSPHERE_STORAGE,JSON.stringify({volume:volume(settings.volume),reducedMotion:!!settings.reducedMotion}));}catch{/* Preferences remain usable when browser storage is full/private. */}
}
/** Grid-space proximity only. Never mutates/advances game state or invents a water source. */
export function nearbyWaterAmbience(state:Pick<MinimalState,'tiles'|'player'>):number{
 let nearest=Infinity;
 for(const tile of state.tiles)if(tile.terrain==='creek'||tile.terrain==='pond')nearest=Math.min(nearest,Math.hypot(tile.x-state.player.x,tile.z-state.player.z));
 if(!Number.isFinite(nearest))return 0;const proximity=Math.max(0,Math.min(1,1-(nearest-.55)/2.7));return proximity*proximity*(3-2*proximity);
}
