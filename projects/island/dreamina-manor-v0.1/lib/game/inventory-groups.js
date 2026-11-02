/** Presentation only: individual inventory identities, size/value and ownership stay intact.
 * Normal bag items of the same species and tier share a card, regardless of size.
 * Mutations and hand-held items retain their own cards.
 */
export function inventoryGroups(items=[]){
 const groups=new Map();
 for(const item of items.filter(i=>['bag','hand'].includes(i.location?.kind)).sort((a,b)=>a.id.localeCompare(b.id))){
  const stack=item.location.kind==='bag'&&item.mutation==='normal';
  const key=stack?`${item.kind}:${item.speciesId}:${item.tier??1}`:`item:${item.id}`;
  if(!groups.has(key))groups.set(key,{key,item,ids:[],count:0,total:0,minSize:item.finalSize,maxSize:item.finalSize});
  const g=groups.get(key);g.ids.push(item.id);g.count++;g.total+=item.value;g.minSize=Math.min(g.minSize,item.finalSize);g.maxSize=Math.max(g.maxSize,item.finalSize);
 }
 return [...groups.values()];
}
export function saleSelection(items,ids,requested=1){
 const allowed=new Set(ids),available=items.filter(i=>i.location?.kind==='bag'&&allowed.has(i.id)).sort((a,b)=>a.id.localeCompare(b.id));
 const count=Math.min(available.length,Math.max(1,Math.floor(Number(requested)||1))),selected=available.slice(0,count);
 return {ids:selected.map(i=>i.id),count,total:selected.reduce((n,i)=>n+i.value,0),available:available.length};
}
