const same=(a,b)=>a.x===b.x&&a.z===b.z;
/** Footprint-only cells are never independent placement anchors or charged twice. */
export function placementPreview(candidates,selection){
 const selected=(Array.isArray(selection)?selection:[selection]).filter(Boolean);
 return [...candidates.map(cell=>({cell,selected:selected.some(s=>same(s,cell)),selectable:true})),...selected.filter(cell=>!candidates.some(c=>same(c,cell))).map(cell=>({cell,selected:true,selectable:false}))];
}
