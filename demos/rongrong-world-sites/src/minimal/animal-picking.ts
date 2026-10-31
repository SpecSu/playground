import * as THREE from 'three';
import {cacheGeometry,sampleGeometry,captureGeometryAttributes,geometryAttributesMatch,type GeometryAttributeStamp,type PickGeometry} from './animal-picking-geometry.ts';
import {registeredAnimalPickGeometry} from './animal-pick-cache.ts';

export type ScreenPoint={x:number;y:number};
export type ScreenBounds={left:number;right:number;top:number;bottom:number};
export type PickViewport={left:number;top:number;width:number;height:number};
export type AnimalTouchCandidate={id:string;bounds:ScreenBounds;depth:number};
export type PickSurfacePoint={screen:ScreenPoint;world:THREE.Vector3;depth:number};
export type AnimalPickProjection={bounds:ScreenBounds;depth:number;points:PickSurfacePoint[]};
const MIN_TOUCH_SIZE=44,MAX_TOUCH_MARGIN=14;
const finiteBounds=(b:ScreenBounds)=>[b.left,b.right,b.top,b.bottom].every(Number.isFinite)&&b.right>b.left&&b.bottom>b.top;
export function animalTouchBounds(bounds:ScreenBounds):ScreenBounds|null{
 if(!finiteBounds(bounds))return null;
 const x=Math.min(MAX_TOUCH_MARGIN,Math.max(0,(MIN_TOUCH_SIZE-(bounds.right-bounds.left))/2)),y=Math.min(MAX_TOUCH_MARGIN,Math.max(0,(MIN_TOUCH_SIZE-(bounds.bottom-bounds.top))/2));
 return {left:bounds.left-x,right:bounds.right+x,top:bounds.top-y,bottom:bounds.bottom+y};
}
export function insideAnimalTouchBounds(point:ScreenPoint,bounds:ScreenBounds):boolean{
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
 const b=animalTouchBounds(bounds);if(!b||point.x<b.left||point.x>b.right||point.y<b.top||point.y>b.bottom)return false;
 const radius=Math.min(MAX_TOUCH_MARGIN,(b.right-b.left)/2,(b.bottom-b.top)/2),x=Math.max(b.left+radius-point.x,0,point.x-(b.right-radius)),y=Math.max(b.top+radius-point.y,0,point.y-(b.bottom-radius));
 return x*x+y*y<=radius*radius;
}
const bodyDistance=(p:ScreenPoint,b:ScreenBounds)=>Math.hypot(Math.max(b.left-p.x,0,p.x-b.right),Math.max(b.top-p.y,0,p.y-b.bottom));
const centerDistance=(p:ScreenPoint,b:ScreenBounds)=>Math.hypot(p.x-(b.left+b.right)/2,p.y-(b.top+b.bottom)/2);
export function rankAnimalTouchCandidates<T extends AnimalTouchCandidate>(point:ScreenPoint,candidates:readonly T[]):T[]{
 return candidates.filter(c=>Number.isFinite(c.depth)&&insideAnimalTouchBounds(point,c.bounds)).sort((a,b)=>bodyDistance(point,a.bounds)-bodyDistance(point,b.bounds)||centerDistance(point,a.bounds)-centerDistance(point,b.bounds)||a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0));
}
/** Raycaster does not honor Object3D.visible or noninteractive feedback itself. */
export function isPickVisible(object:THREE.Object3D):boolean{
 for(let node:THREE.Object3D|null=object;node;node=node.parent)if(!node.visible||node.userData.pickable===false)return false;
 return true;
}
export function visiblePickMeshes(root:THREE.Object3D):THREE.Mesh[]{
 const meshes:THREE.Mesh[]=[];root.traverseVisible(node=>{if(!(node instanceof THREE.Mesh)||!isPickVisible(node))return;const materials=Array.isArray(node.material)?node.material:[node.material];if(materials.some(m=>m.visible&&(!m.transparent||m.opacity>.05)))meshes.push(node);});return meshes;
}

function corners(box:THREE.Box3,visit:(point:THREE.Vector3)=>void){for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])visit(new THREE.Vector3(x,y,z));}

/** Tap-time only. No full posed-vertex scans or animation-frame hooks are added. */
export class AnimalPickSampler{
 private geometry=new WeakMap<THREE.BufferGeometry,PickGeometry>();
 private geometryStamps=new WeakMap<THREE.BufferGeometry,GeometryAttributeStamp>();
 private data(mesh:THREE.SkinnedMesh){const registered=registeredAnimalPickGeometry(mesh);if(registered)return registered;let cached=this.geometry.get(mesh.geometry);if(!cached||!geometryAttributesMatch(mesh.geometry,this.geometryStamps.get(mesh.geometry))){cached=cacheGeometry(mesh.geometry);this.geometry.set(mesh.geometry,cached);this.geometryStamps.set(mesh.geometry,captureGeometryAttributes(mesh.geometry));}return cached;}
 private refreshMeshBounds(mesh:THREE.SkinnedMesh,data:PickGeometry):boolean{
  if(!data.valid||data.regions.some(region=>!mesh.skeleton.bones[region.bone]))return false;
  // Before bindMatrixInverse, a nonnegative LBS vertex is its weight sum times a
  // convex combination of transformed bone-region points. Bounding both recorded
  // weight-sum endpoints also covers tiny Float32 normalization roundoff.
  const worldBlend=new THREE.Box3(),transform=new THREE.Matrix4();
  for(const region of data.regions){transform.multiplyMatrices(mesh.skeleton.bones[region.bone].matrixWorld,mesh.skeleton.boneInverses[region.bone]).multiply(mesh.bindMatrix);corners(region.bounds,p=>worldBlend.expandByPoint(p.applyMatrix4(transform)));}
  const local=new THREE.Box3();corners(worldBlend,p=>{for(const weight of [data.minimumWeight,data.maximumWeight])local.expandByPoint(p.clone().multiplyScalar(weight).applyMatrix4(mesh.bindMatrixInverse));});
  if(local.isEmpty()||!local.min.toArray().concat(local.max.toArray()).every(Number.isFinite))return false;
  local.expandByScalar(1e-6);(mesh.boundingBox??=new THREE.Box3()).copy(local);local.getBoundingSphere(mesh.boundingSphere??=new THREE.Sphere());return true;
 }
 refreshRayBounds(root:THREE.Object3D){for(const mesh of visiblePickMeshes(root))if(mesh instanceof THREE.SkinnedMesh)this.refreshMeshBounds(mesh,this.data(mesh));}
 project(root:THREE.Object3D,camera:THREE.Camera,viewport:PickViewport,near?:ScreenPoint):AnimalPickProjection|null{
  if(!isPickVisible(root)||![viewport.left,viewport.top,viewport.width,viewport.height].every(Number.isFinite)||viewport.width<=0||viewport.height<=0)return null;
  if(near&&(!Number.isFinite(near.x)||!Number.isFinite(near.y)))return null;
  const meshes=visiblePickMeshes(root).filter(mesh=>{if(mesh instanceof THREE.SkinnedMesh)return this.refreshMeshBounds(mesh,this.data(mesh));if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();return !!mesh.geometry.boundingBox;});
  if(near){
   const coarse:ScreenBounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
   for(const mesh of meshes){const box=mesh instanceof THREE.SkinnedMesh?mesh.boundingBox:mesh.geometry.boundingBox;if(box)corners(box,p=>{p.applyMatrix4(mesh.matrixWorld).project(camera);const x=viewport.left+(p.x*.5+.5)*viewport.width,y=viewport.top+(-p.y*.5+.5)*viewport.height;coarse.left=Math.min(coarse.left,x);coarse.right=Math.max(coarse.right,x);coarse.top=Math.min(coarse.top,y);coarse.bottom=Math.max(coarse.bottom,y);});}
   // Always add the full cap to conservative coarse bounds. Applying the44px
   // minimum here could wrongly shrink an asymmetrically inflated bone envelope.
   if(!finiteBounds(coarse)||near.x<coarse.left-MAX_TOUCH_MARGIN||near.x>coarse.right+MAX_TOUCH_MARGIN||near.y<coarse.top-MAX_TOUCH_MARGIN||near.y>coarse.bottom+MAX_TOUCH_MARGIN)return null;
  }
  const bounds:ScreenBounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity},points:PickSurfacePoint[]=[];let depth=Infinity;
  const add=(world:THREE.Vector3)=>{const projected=world.clone().project(camera);if(!projected.toArray().every(Number.isFinite)||projected.z< -1||projected.z>1)return;const screen={x:viewport.left+(projected.x*.5+.5)*viewport.width,y:viewport.top+(-projected.y*.5+.5)*viewport.height};bounds.left=Math.min(bounds.left,screen.x);bounds.right=Math.max(bounds.right,screen.x);bounds.top=Math.min(bounds.top,screen.y);bounds.bottom=Math.max(bounds.bottom,screen.y);depth=Math.min(depth,projected.z);if(Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1)points.push({screen,world:world.clone(),depth:projected.z});};
  for(const mesh of meshes){
   if(mesh instanceof THREE.SkinnedMesh){const data=this.data(mesh),samples=data.samples??=sampleGeometry(mesh.geometry),point=new THREE.Vector3();for(const index of samples)add(mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld));}
   else{if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();if(mesh.geometry.boundingBox)corners(mesh.geometry.boundingBox,p=>add(p.applyMatrix4(mesh.matrixWorld)));}
  }
  return finiteBounds(bounds)&&points.length?{bounds,depth,points}:null;
 }
}
