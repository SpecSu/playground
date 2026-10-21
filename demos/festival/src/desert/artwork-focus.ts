import * as THREE from 'three';
import { deformConstructionVertex } from './construction.ts';

/** Conservative sphere fit inside the unobscured portrait viewport. */
export function artworkFocusDistance(radius:number,height:number,fov:number,aspect:number):number {
 const vertical=Math.atan(Math.tan(fov*Math.PI/360)*.60);
 const horizontal=Math.atan(Math.tan(fov*Math.PI/360)*Math.max(.1,aspect)*.78);
 return Math.hypot(radius,height/2)/Math.sin(Math.min(vertical,horizontal))*1.06;
}
export function nameplateLayout(measuredWidth:number){
 const width=Math.min(300,Math.ceil(Math.max(0,measuredWidth))+32),height=80;
 return {width,height,worldWidth:.9*width/height,worldHeight:.9};
}
/** Keep glyphs at their readable font size rather than squeezing long nicknames. */
export function fitNameplateText(text:string,measure:(text:string)=>number):string {
 if(measure(text)<=268)return text;
 const characters=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),({segment})=>segment);
 while(characters.length&&measure(characters.join('')+'…')>268)characters.pop();
 return characters.join('')+'…';
}
/** Raycast the vertices actually shown by the construction shader, never its future silhouette. */
export function intersectVisibleArtwork(raycaster:THREE.Raycaster,root:THREE.Group,seconds:number,started:boolean):THREE.Intersection|null {
 if(!started||!root.visible||seconds<=0)return null;
 root.updateWorldMatrix(true,true);
 let nearest:THREE.Intersection|null=null;
 root.traverseVisible(node=>{
  if(!(node instanceof THREE.Mesh))return;
  let geometry=node.geometry,temporary:THREE.BufferGeometry|undefined;
  const anchors=geometry.getAttribute('aBuildAnchor'),axes=geometry.getAttribute('aBuildAxis');
  if(seconds<20&&anchors&&axes){
   temporary=geometry.clone();geometry=temporary;
   const points=geometry.getAttribute('position'),position=new THREE.Vector3(),anchor=new THREE.Vector4(),axis=new THREE.Vector4();
   for(let i=0;i<points.count;i++){
    position.fromBufferAttribute(points,i);anchor.fromBufferAttribute(anchors,i);axis.fromBufferAttribute(axes,i);
    deformConstructionVertex(position,anchor,axis,seconds,false,position);points.setXYZ(i,position.x,position.y,position.z);
   }
   geometry.computeBoundingSphere();geometry.computeBoundingBox();
  }
  const proxy=new THREE.Mesh(geometry,node.material);proxy.matrixWorld.copy(node.matrixWorld);
  const hits:THREE.Intersection[]=[];proxy.raycast(raycaster,hits);
  for(const hit of hits)if(!nearest||hit.distance<nearest.distance)nearest={...hit,object:node};
  temporary?.dispose();
 });
 return nearest;
}
