/** ID-only view/commands; the existing reducer owns walking, capacity, footprint and value. */
export function tankManagementRows(game,own=true){return(game?.items??[]).filter(i=>i.kind==='fish'&&(i.location.kind==='tank'||own&&['bag','hand'].includes(i.location.kind))).sort((a,b)=>(a.location.kind==='tank'?0:1)-(b.location.kind==='tank'?0:1)||a.id.localeCompare(b.id));}
export function tankManagementCommand(game,itemId,action,own=true){
 if(!own)return null;const item=game?.items.find(i=>i.id===itemId&&i.kind==='fish');if(!item||!['bag','hand','tank'].includes(item.location.kind))return null;
 if(action==='sell')return{type:'sell',itemId};
 if(!game.tank.length)return null;
 if(action==='bag'&&item.location.kind==='tank')return{type:'begin-work',action:'retrieve',target:{kind:'tank',cell:{...game.tank[0]}},itemId,destination:'bag'};
 if(action==='display'&&['bag','hand'].includes(item.location.kind))return{type:'begin-work',action:'display',target:{kind:'tank',cell:{...game.tank[0]}},itemId};
 return null;
}
