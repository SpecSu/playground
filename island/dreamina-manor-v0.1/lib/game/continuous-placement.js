import {inventoryGroups} from './inventory-groups.js';
import {plantableLand} from './seed-paint.js';
import {availableFishingDocks} from './bait-placement.js';
const same=(a,b)=>a?.x===b?.x&&a?.z===b?.z;
/** Selection is a frozen list of identities; the journal remains the only reservation ledger. */
export function placementItems(game,mode,entries=[]){
 const reserved=new Set(entries.filter(e=>!e.localDone&&!e.cancelled).map(e=>e.command?.itemId));if(game?.pending?.itemId)reserved.add(game.pending.itemId);
 const ids=mode?.itemIds??(mode?.itemId?[mode.itemId]:[]),byId=new Map((game?.items??[]).map(i=>[i.id,i]));
 return [...new Set(ids)].map(id=>byId.get(id)).filter(i=>i&&i.kind==='plant'&&['bag','hand'].includes(i.location.kind)&&!reserved.has(i.id));
}
export function displayPlacementMode(game,itemId,entries=[]){
 const group=inventoryGroups(game?.items??[]).find(g=>g.ids.includes(itemId));if(!group||group.item.kind!=='plant')return null;
 const mode={kind:'display',itemId,itemIds:[itemId,...group.ids.filter(id=>id!==itemId)]};return placementItems(game,mode,entries).some(i=>i.id===itemId)?mode:null;
}
export function placementStock(game,mode,entries=[]){return mode?.kind==='bait'?Math.max(0,game?.baits?.[mode.tier-1]??0):mode?.kind==='display'?placementItems(game,mode,entries).length:0;}
export function continuousPlacementDecision(game,mode,target,entries=[]){
 if(!['display','bait'].includes(mode?.kind))return null;
 if(!game||!placementStock(game,mode,entries))return{kind:'exit'};
 if(mode.kind==='bait')return target?.kind==='dock'&&availableFishingDocks(game).some(c=>same(c,target.cell))?{kind:'place',command:{type:'begin-work',action:'fish',tier:mode.tier,target:{kind:'dock',cell:{...target.cell}}}}:{kind:'exit'};
 if(target?.kind!=='land'||!plantableLand(game).some(c=>same(c,target.cell))||(game.pending?.target?.kind==='land'&&same(game.pending.target.cell,target.cell)))return{kind:'exit'};
 return{kind:'place',command:{type:'begin-work',action:'display',itemId:placementItems(game,mode,entries)[0].id,target:{kind:'land',cell:{...target.cell}}}};
}
