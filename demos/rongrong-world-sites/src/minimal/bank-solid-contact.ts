import * as THREE from 'three';

type XYZ=Readonly<{x:number;y:number;z:number}>;
type Triangle={points:readonly [XYZ,XYZ,XYZ];denominator:number;minX:number;maxX:number;minZ:number;maxZ:number};
/** Roundoff allowance in barycentric coordinates, not a physical shore margin. */
const EPSILON=1e-12,BIN_SIZE=.125; // Two cells of the rendered 1/16m bank grid.
const cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx;
const denominator=(a:XYZ,b:XYZ,c:XYZ)=>cross(b.x-a.x,b.z-a.z,c.x-a.x,c.z-a.z);
function heightInside(a:XYZ,b:XYZ,c:XYZ,d:number,x:number,z:number):number|null{
 if(Math.abs(d)<1e-14)return null;
 const u=cross(x-a.x,z-a.z,c.x-a.x,c.z-a.z)/d,v=cross(b.x-a.x,b.z-a.z,x-a.x,z-a.z)/d;
 return u>=-EPSILON&&v>=-EPSILON&&u+v<=1+EPSILON?a.y+(b.y-a.y)*u+(c.y-a.y)*v:null;
}
/** Snapshot actual visible rendered bank faces in world coordinates. Recreate when
 * World rebuilds its terrain. Water surfaces and analytic groundHeight are never
 * solid geometry. The returned function is the exact maximum vertical overlap
 * of two piecewise-affine triangles, not a vertex-only ray approximation. */
export function createBankSolidContact(terrain:THREE.Object3D):(a:XYZ,b:XYZ,c:XYZ)=>number{
 terrain.updateWorldMatrix(true,true);const triangles:Triangle[]=[],bins=new Map<string,number[]>();
 terrain.traverseVisible(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const geometry=node.geometry,positions=geometry.getAttribute('position');if(!positions)return;
  const index=geometry.index,count=index?.count??positions.count,materials=Array.isArray(node.material)?node.material:[node.material];
  const groups=Array.isArray(node.material)?geometry.groups:[{start:0,count,materialIndex:0}];
  for(const group of groups){const material=materials[group.materialIndex??0];if(!material?.visible||material.userData.environmentRole!=='bank')continue;
   const start=Math.max(group.start,geometry.drawRange.start,0),end=Math.min(group.start+group.count,geometry.drawRange.start+geometry.drawRange.count,count);
   for(let offset=start;offset+2<end;offset+=3){
    const points=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(offset+i):offset+i).applyMatrix4(node.matrixWorld)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3];
    if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.z)))continue;
    const d=denominator(...points);if(Math.abs(d)<1e-14)continue;
    const t:Triangle={points,denominator:d,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))},id=triangles.length;triangles.push(t);
    for(let x=Math.floor(t.minX/BIN_SIZE);x<=Math.floor(t.maxX/BIN_SIZE);x++)for(let z=Math.floor(t.minZ/BIN_SIZE);z<=Math.floor(t.maxZ/BIN_SIZE);z++){const key=`${x},${z}`,list=bins.get(key);if(list)list.push(id);else bins.set(key,[id]);}
   }
  }
 });
 // Reuse deduplication storage across the many sole faces queried each frame.
 const seen=new Uint32Array(triangles.length);let stamp=0;
 return (a,b,c)=>{
  if(![a,b,c].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)))throw new Error('Solid foot triangle must contain finite world coordinates');
  const feet=[a,b,c],footDenominator=denominator(a,b,c),minX=Math.min(a.x,b.x,c.x),maxX=Math.max(a.x,b.x,c.x),minZ=Math.min(a.z,b.z,c.z),maxZ=Math.max(a.z,b.z,c.z);let lift=0;
  stamp=(stamp+1)>>>0;if(stamp===0){seen.fill(0);stamp=1;}
  for(let x=Math.floor(minX/BIN_SIZE);x<=Math.floor(maxX/BIN_SIZE);x++)for(let z=Math.floor(minZ/BIN_SIZE);z<=Math.floor(maxZ/BIN_SIZE);z++){
   const candidates=bins.get(`${x},${z}`);if(!candidates)continue;
   for(const id of candidates){if(seen[id]===stamp)continue;seen[id]=stamp;const bank=triangles[id];if(bank.maxX<minX||bank.minX>maxX||bank.maxZ<minZ||bank.minZ>maxZ)continue;
    const [u,v,w]=bank.points;
    for(const p of feet){const y=heightInside(u,v,w,bank.denominator,p.x,p.z);if(y!==null)lift=Math.max(lift,y-p.y);}
    for(const p of bank.points){const y=heightInside(a,b,c,footDenominator,p.x,p.z);if(y!==null)lift=Math.max(lift,p.y-y);}
    // Convex intersection vertices are vertices of either triangle inside the
    // other, or edge intersections. Affine vertical difference peaks at one.
    // This edge path also handles vertical-projection/degenerate sole faces.
    for(let i=0;i<3;i++){const p=feet[i],q=feet[(i+1)%3],rx=q.x-p.x,rz=q.z-p.z;
     for(let j=0;j<3;j++){const s=bank.points[j],t=bank.points[(j+1)%3],sx=t.x-s.x,sz=t.z-s.z,d=cross(rx,rz,sx,sz);if(Math.abs(d)<1e-14)continue;
      const along=cross(s.x-p.x,s.z-p.z,sx,sz)/d,across=cross(s.x-p.x,s.z-p.z,rx,rz)/d;
      if(along< -EPSILON||along>1+EPSILON||across< -EPSILON||across>1+EPSILON)continue;
      lift=Math.max(lift,s.y+(t.y-s.y)*across-(p.y+(q.y-p.y)*along));
     }
    }
   }
  }
  return lift;
 };
}
