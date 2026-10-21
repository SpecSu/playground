import * as THREE from 'three';

/** A single unlit, depth-tested ground marker, owned by the yacht rather than an animated body. */
export function createFishingOwnMarker(){
 const root=new THREE.Group();root.name='Own angler ground ring';root.visible=false;
 const add=(name:string,geometry:THREE.BufferGeometry,color:string,opacity:number,y:number)=>{
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
  mesh.name=name;mesh.rotation.x=-Math.PI/2;mesh.position.y=y;mesh.raycast=()=>{};root.add(mesh);
 };
 add('Own ring fill',new THREE.CircleGeometry(.86,64),'#FFD84D',.15,0);
 add('Own ring dark rim',new THREE.RingGeometry(.83,1.025,64),'#2D2512',.85,.001);
 add('Own ring yellow',new THREE.RingGeometry(.86,1,64),'#FFD84D',1,.002);
 return root;
}
/** Keep larger species legible, without extending into the next 1.62-unit berth. */
export function fishingOwnMarkerRadius(footprintRadius:number){return Math.min(.74,Math.max(.60,footprintRadius*1.06));}

/** Pixel floor is bounded before it can intrude into the next berth. */
export function fitFishingOwnMarkerRadius(baseRadius:number,screenDiameter:number){return Math.min(.74,screenDiameter>0?Math.max(baseRadius,baseRadius*34/screenDiameter):baseRadius);}
