import{cellKey,validCell,docksHaveWater}from'./grid.js';
export const BUILD_DURATION_MS=12000;
const same=(a,b)=>a.x===b.x&&a.z===b.z;
export function reservedCells(game,kind=null){return(game.constructions??[]).filter(c=>!kind||c.kind===kind).flatMap(c=>c.cells);}
/** Read-only time projection. The persisted startedAt/readyAt is never rewritten. */
export function constructionView(original,now){const pending=original.constructions??[],ready=pending.filter(c=>c.readyAt<=now);if(!ready.length)return original;const s=structuredClone(original);for(const c of ready){const key=c.kind==='land'?'land':c.kind==='dock'?'docks':'tank';for(const cell of c.cells)if(!s[key].some(p=>same(p,cell)))s[key].push({...cell});}s.constructions=pending.filter(c=>c.readyAt>now).map(c=>structuredClone(c));return s;}
export function startConstruction(s,c,context,applyImmediate,fail){
 if(!['land','dock','tank'].includes(c.kind)||!Array.isArray(c.cells)||!c.cells.length||c.cells.length>32||c.cells.some(p=>!validCell(p))||new Set(c.cells.map(cellKey)).size!==c.cells.length)fail('BAD_BUILD','重新选一下要建的位置');
 const occupied=reservedCells(s);if(c.cells.some(p=>occupied.some(x=>same(x,p))))fail('BUILDING','这里还在建，等一会儿吧');
 let shadow={...structuredClone(s),constructions:[],...(c.kind==='tank'?{tank:[...s.tank,...reservedCells(s,'tank')]}:{})};const cells=c.cells.map(p=>({...p}));
 if(c.kind==='land'){
  const left=[...cells];while(left.length){const index=left.findIndex(p=>shadow.land.some(x=>Math.abs(x.x-p.x)+Math.abs(x.z-p.z)===1));if(index<0)fail('NOT_ADJACENT','选中的地块要连着小岛');const cell=left.splice(index,1)[0];shadow=applyImmediate(shadow,{type:'expand-land',cell},context).state;}
 }else if(c.kind==='dock'){if(cells.length!==1)fail('BAD_BUILD','每次接一段码头');shadow=applyImmediate(shadow,{type:'build-dock',cell:cells[0]},context).state;
 }else shadow=applyImmediate(shadow,{type:'build-tank',cells},context).state;
 const land=[...shadow.land,...reservedCells(s,'land')],docks=[...shadow.docks,...reservedCells(s,'dock')];if(!docksHaveWater(land,docks))fail('NO_WATER','给钓位留一片水面吧');
 s.coins=shadow.coins;if(c.kind==='tank'){s.position=shadow.position;s.pending=null;}
 const construction={id:context.newId?.()??crypto.randomUUID(),kind:c.kind,cells,startedAt:context.now,readyAt:context.now+BUILD_DURATION_MS};s.constructions=[...(s.constructions??[]),construction];return construction;
}
export function constructionSignature(game,now){return(game.constructions??[]).filter(c=>c.readyAt<=now).map(c=>c.id).join('|');}
