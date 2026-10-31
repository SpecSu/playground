/** Test-only independent posed-triangle oracle. No WebGL renderer is used. */
import * as THREE from 'three';
import {refreshPose} from '../src/minimal/avatar-pose.ts';
/** Inspect every posed vertex, not Box3's bind-pose approximation or runtime contact probes. */
export function vertices(root:THREE.Object3D,visit:(v:THREE.Vector3,node:THREE.Mesh,index:number)=>void){
 refreshPose(root);
 root.traverseVisible(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const v=new THREE.Vector3();
  for(let i=0;i<node.geometry.getAttribute('position').count;i++){
   node.getVertexPosition(i,v);visit(v.applyMatrix4(node.matrixWorld),node,i);
  }
 });
}
/** A static snapshot of deformed triangles lets the independent oracle raycast real skin. */
export function deformedMeshes(root:THREE.Object3D){
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes:THREE.Mesh[]=[];
 refreshPose(root);
 root.traverseVisible(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(node.geometry.getAttribute('position').count*3),v=new THREE.Vector3();
  for(let i=0;i<positions.length/3;i++){node.getVertexPosition(i,v);v.applyMatrix4(node.matrixWorld).toArray(positions,i*3);}
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  if(node.geometry.index)geometry.setIndex(node.geometry.index.clone());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=node.name;meshes.push(mesh);
 });
 return {meshes,dispose(){meshes.forEach(m=>m.geometry.dispose());material.dispose();}};
}
/** Spatially binned +Y crossings inspect actual triangles without a vertex × triangle scan. */
export function penetrationCount(points:THREE.Vector3[],meshes:THREE.Mesh[]){
 type Triangle={ax:number;az:number;ay:number;bx:number;bz:number;by:number;cx:number;cz:number;cy:number;inverse:number};
 const partitions=meshes.map(mesh=>{
  const bounds=mesh.geometry.boundingBox!,positions=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
  const width=Math.max(1e-6,bounds.max.x-bounds.min.x),depth=Math.max(1e-6,bounds.max.z-bounds.min.z),cells=32;
  const column=(x:number)=>Math.max(0,Math.min(cells-1,Math.floor((x-bounds.min.x)/width*cells)));
  const row=(z:number)=>Math.max(0,Math.min(cells-1,Math.floor((z-bounds.min.z)/depth*cells)));
  const bins:Array<Triangle[]>=Array.from({length:cells*cells},()=>[]);
  for(let i=0;i<(index?.count??positions.count);i+=3){
   const ai=index?index.getX(i):i,bi=index?index.getX(i+1):i+1,ci=index?index.getX(i+2):i+2;
   const ax=positions.getX(ai),az=positions.getZ(ai),ay=positions.getY(ai),bx=positions.getX(bi)-ax,bz=positions.getZ(bi)-az,by=positions.getY(bi)-ay,cx=positions.getX(ci)-ax,cz=positions.getZ(ci)-az,cy=positions.getY(ci)-ay;
   const denominator=bx*cz-cx*bz;if(Math.abs(denominator)<1e-12)continue;
   const triangle={ax,az,ay,bx,bz,by,cx,cz,cy,inverse:1/denominator};
   const lowX=column(Math.min(ax,ax+bx,ax+cx)),highX=column(Math.max(ax,ax+bx,ax+cx)),lowZ=row(Math.min(az,az+bz,az+cz)),highZ=row(Math.max(az,az+bz,az+cz));
   for(let x=lowX;x<=highX;x++)for(let z=lowZ;z<=highZ;z++)bins[x+z*cells].push(triangle);
  }
  return {name:mesh.name,bounds,column,row,cells,bins,source:mesh};
 });
 const ray=new THREE.Raycaster(),direction=new THREE.Vector3(.8347,.3921,.3869).normalize();
 let count=0;const parts=new Map<string,number>(),locations:THREE.Vector3[]=[];
 for(const point of points)for(const mesh of partitions){
  if(!mesh.bounds.containsPoint(point))continue;
  const distances:number[]=[];
  for(const q of mesh.bins[mesh.column(point.x)+mesh.row(point.z)*mesh.cells]){
   const x=point.x-q.ax,z=point.z-q.az,u=(x*q.cz-q.cx*z)*q.inverse,v=(q.bx*z-x*q.bz)*q.inverse;
   if(u< -1e-10||v< -1e-10||u+v>1+1e-10)continue;
   const distance=q.ay+u*q.by+v*q.cy-point.y;if(distance>=0)distances.push(distance);
  }
  distances.sort((a,b)=>a-b);
  const unique=distances.filter((d,i,all)=>i===0||Math.abs(d-all[i-1])>1e-5);
  if(unique.length%2===1&&unique[0]>.003){
   // Independently confirm candidates on a non-axis ray to reject projection seam artifacts.
   ray.set(point,direction);const hits=ray.intersectObject(mesh.source,false);
   const other=hits.map(hit=>hit.distance).filter((d,i,all)=>i===0||Math.abs(d-all[i-1])>1e-5);
   if(other.length%2!==1||other[0]<=.003)continue;
   count++;locations.push(point.clone());parts.set(mesh.name,(parts.get(mesh.name)??0)+1);break;
  }
 }
 return {count,parts:Object.fromEntries(parts),locations};
}
