import * as T from 'three';
import {SHARED_CELL_SIZE} from './physical-contract.js';
const key=(x,z)=>`${x},${z}`;
export function exposedLandEdges(cells,cellSize=SHARED_CELL_SIZE){const set=new Set(cells.map(c=>key(c.x,c.z))),edges=[];for(const c of cells)for(const[nx,nz]of[[1,0],[-1,0],[0,1],[0,-1]])if(!set.has(key(c.x+nx,c.z+nz)))edges.push({x:(c.x+nx*.5)*cellSize,z:(c.z+nz*.5)*cellSize,nx,nz});return edges;}
/** SDF from actual completed land union, never a fixed2x2 footprint. Docks contribute only their narrow pilings. */
export function createShoreField(cells=[],docks=[],cellSize=SHARED_CELL_SIZE){
 const boxes=cells.map(c=>({x:c.x*cellSize,z:c.z*cellSize,hx:cellSize/2,hz:cellSize/2}));
 const poles=docks.flatMap(c=>[-1,1].flatMap(x=>[-1,1].map(z=>({x:(c.x+x*.34)*cellSize,z:(c.z+z*.34)*cellSize,r:.10}))));
 const distance=(x,z,landOnly=false)=>{let d=1000;for(const b of boxes){const qx=Math.abs(x-b.x)-b.hx+.04,qz=Math.abs(z-b.z)-b.hz+.04;d=Math.min(d,Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-.04);}if(!landOnly)for(const p of poles)d=Math.min(d,Math.hypot(x-p.x,z-p.z)-p.r);return d;};
 const all=[...boxes,...poles],xs=all.map(p=>p.x),zs=all.map(p=>p.z),minX=(xs.length?Math.min(...xs):0)-cellSize/2-9,minZ=(zs.length?Math.min(...zs):0)-cellSize/2-9,maxX=(xs.length?Math.max(...xs):0)+cellSize/2+9,maxZ=(zs.length?Math.max(...zs):0)+cellSize/2+9;
 const width=maxX-minX,depth=maxZ-minZ,scale=Math.max(width,depth),resolution=Math.min(512,Math.max(256,Math.ceil(scale*10))),data=new Float32Array(resolution*resolution);
 for(let j=0;j<resolution;j++)for(let i=0;i<resolution;i++)data[j*resolution+i]=T.MathUtils.clamp(.5+distance(minX+(i+.5)/resolution*width,minZ+(j+.5)/resolution*depth)/scale,0,1);
 const texture=new T.DataTexture(data,resolution,resolution,T.RedFormat,T.FloatType);texture.minFilter=texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
 return {texture,distance,bounds:new T.Vector4(minX,minZ,width,depth),scale,centre:{x:(minX+maxX)/2,z:(minZ+maxZ)/2},edges:exposedLandEdges(cells,cellSize)};
}

/** Decorative schools stay in water across their complete orbit, including concave/expanded shores. */
export function underwaterFishAnchors(field,limit=3){
 const edges=[...field.edges].sort((a,b)=>(b.nz*.8+b.nx*.4)-(a.nz*.8+a.nx*.4)),result=[];
 for(const edge of edges){const anchor={x:edge.x+edge.nx*2.4,z:edge.z+edge.nz*2.4};if(result.some(r=>Math.hypot(r.anchor.x-anchor.x,r.anchor.z-anchor.z)<1.5))continue;
  let safe=true;for(let i=0;i<48;i++){const a=i/48*Math.PI*2,x=anchor.x-edge.nz*Math.sin(a)*.65+edge.nx*Math.cos(a)*.16,z=anchor.z+edge.nx*Math.sin(a)*.65+edge.nz*Math.cos(a)*.16;if(field.distance(x,z)<.55){safe=false;break;}}
  if(safe)result.push({edge,anchor});if(result.length===limit)break;
 }return result;
}
