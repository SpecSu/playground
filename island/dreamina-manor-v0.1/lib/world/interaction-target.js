/** A tile hit is walking, not plant interaction. Meshes and ready bubbles retain their own hit target. */
export function walksOnOccupiedLand(target,state){
 const same=cell=>cell?.x===target.cell?.x&&cell?.z===target.cell?.z;
 if(target.kind==='dock'&&target.surface==='ground')return true;
 return target.kind==='land'&&target.surface==='ground'&&Boolean(state?.jobs?.some(j=>j.target.kind==='land'&&same(j.target.cell))||state?.items?.some(i=>i.location.kind==='land'&&same(i.location.cell)));
}
