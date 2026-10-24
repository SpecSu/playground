/** Counts the projected inventory already including local reservations. No second subtraction. */
export function inventoryCategoryCounts(game){return{seed:(game?.seeds??[]).reduce((a,n)=>a+n,0),bait:(game?.baits??[]).reduce((a,n)=>a+n,0),harvest:new Set((game?.items??[]).filter(i=>['bag','hand'].includes(i.location.kind)).map(i=>i.id)).size};}
