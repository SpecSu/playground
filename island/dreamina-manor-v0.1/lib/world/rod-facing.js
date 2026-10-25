const dirs=[{x:0,z:1},{x:1,z:0},{x:0,z:-1},{x:-1,z:0}],same=(a,b)=>a.x===b.x&&a.z===b.z;
/** Computed on layout changes only; does not change build legality or fishing state. */
export function rodWaterFacing(land,docks,cell,heights=[]){
 const adjacent=land.filter(p=>Math.abs(p.x-cell.x)+Math.abs(p.z-cell.z)===1);let shores=adjacent;
 if(!shores.length){const sorted=[...land].sort((a,b)=>Math.hypot(a.x-cell.x,a.z-cell.z)-Math.hypot(b.x-cell.x,b.z-cell.z)||a.z-b.z||a.x-b.x),nearest=sorted[0];shores=nearest?sorted.filter(p=>Math.abs(Math.hypot(p.x-cell.x,p.z-cell.z)-Math.hypot(nearest.x-cell.x,nearest.z-cell.z))<1e-8):[];}
 const away=shores.reduce((a,p)=>({x:a.x+cell.x-p.x,z:a.z+cell.z-p.z}),{x:0,z:0}),obstacles=[...land,...docks.filter(p=>!same(p,cell))];
 const clearance=d=>{let safe=.48;for(let t=.5;t<=2.1;t+=.04){const x=cell.x+d.x*t,z=cell.z+d.z*t;if(obstacles.some(p=>Math.abs(x-p.x)<.56&&Math.abs(z-p.z)<.56))break;safe=t;}return safe;};
 const candidates=dirs.map((d,i)=>({...d,index:i,clear:clearance(d),score:d.x*away.x+d.z*away.z}));
 candidates.sort((a,b)=>(b.clear>=1.85)-(a.clear>=1.85)||b.score-a.score||b.clear-a.clear||a.index-b.index);
 let best=candidates.find(d=>d.clear>=.67)??candidates[0];
 if(best.clear<1.85){const alternate=Array.from({length:16},(_,i)=>{const angle=i*Math.PI/8,d={x:Math.sin(angle),z:Math.cos(angle)};return{...d,index:i+4,clear:clearance(d),score:d.x*away.x+d.z*away.z};}).filter(d=>d.clear>=1.85).sort((a,b)=>b.score-a.score||a.index-b.index)[0];if(alternate)best=alternate;}
 // A completely enclosed legacy station still fishes: keep the rod upright on
 // its own deck and route only the line above the obstruction to open water.
 if(best.clear<.67){
  const extent=Math.max(2,...obstacles.map(p=>Math.hypot(p.x-cell.x,p.z-cell.z)))+2;
  const flights=dirs.map((d,index)=>{let distance=extent;for(let t=1.85;t<=extent;t+=.1){const x=cell.x+d.x*t,z=cell.z+d.z*t;if(!obstacles.some(p=>Math.abs(x-p.x)<.72&&Math.abs(z-p.z)<.72)){distance=t;break;}}return{...d,index,distance,score:d.x*away.x+d.z*away.z};}).sort((a,b)=>a.distance-b.distance||b.score-a.score||a.index-b.index);
  const f=flights[0],height=Math.max(1,...heights.map(p=>p.height??1))+1;
  return{x:f.x,z:f.z,reach:1,overflight:{distance:f.distance*3.2,height}};
 }
 // If a distant obstacle closes every long corridor, keep fishing over the nearest
 // clear patch of water with a shorter cast; the rod base and size stay unchanged.
 return{x:best.x,z:best.z,reach:Math.max(.10,Math.min(1,(best.clear*3.2-.28-1.36)/(5.14-1.36)))};
}
