import * as THREE from 'three';

type Region={bone:number;bounds:THREE.Box3};
export type PickGeometry={regions:Region[];samples?:number[];minimumWeight:number;maximumWeight:number;valid:boolean};
// Even sphere directions avoid the coarse angular gaps of a small cube grid.
const directions=[new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)];
for(let i=0;i<256;i++){const y=1-2*(i+.5)/256,r=Math.sqrt(1-y*y),angle=i*Math.PI*(3-Math.sqrt(5));directions.push(new THREE.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r));}
/** Geometry is shared by cloned actors. This one-time cache keeps per-bone bind
 * envelopes for conservative ray bounds and real vertex indices for touch bounds. */
export function cacheGeometry(geometry:THREE.BufferGeometry):PickGeometry{
 const position=geometry.getAttribute('position'),indices=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight'),regions=new Map<number,THREE.Box3>(),point=new THREE.Vector3();
 let minimumWeight=Infinity,maximumWeight=0,valid=!!position&&!!indices&&!!weights;
 if(!valid)return {regions:[],minimumWeight:0,maximumWeight:0,valid:false};
 for(let i=0;i<position.count;i++){
  point.fromBufferAttribute(position,i);if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z)){valid=false;break;}
  let sum=0;
  for(let k=0;k<4;k++){
   const weight=weights.getComponent(i,k),bone=indices.getComponent(i,k);if(!Number.isFinite(weight)||weight<0||!Number.isInteger(bone)||bone<0){valid=false;break;}sum+=weight;
   if(weight>0){let box=regions.get(bone);if(!box){box=new THREE.Box3();regions.set(bone,box);}box.expandByPoint(point);}
  }
  if(!valid)break;minimumWeight=Math.min(minimumWeight,sum);maximumWeight=Math.max(maximumWeight,sum);
 }
 return {regions:[...regions].map(([bone,bounds])=>({bone,bounds})),minimumWeight,maximumWeight,valid:valid&&Number.isFinite(minimumWeight)&&maximumWeight>0};
}
/** Only nearby touch candidates need these indices; LX/guardian ray occluders
 * never pay for unused directional sampling. No posed skin is scanned here. */
export function sampleGeometry(geometry:THREE.BufferGeometry):number[]{
 const position=geometry.getAttribute('position'),indices=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight'),groups=new Map<string,{scores:number[];indices:number[]}>(),point=new THREE.Vector3();
 for(let i=0;i<position.count;i++){
  point.fromBufferAttribute(position,i);let dominant=0,largest=-1;const influences:number[]=[];
  for(let k=0;k<4;k++){const weight=weights.getComponent(i,k),bone=indices.getComponent(i,k);if(weight>0)influences.push(bone);if(weight>largest){largest=weight;dominant=bone;}}
  // Keep every original dominant-bone extremum. Joint transition vertices can
  // become a silhouette after a secondary bone bends, despite lying inside that
  // large bind hull, so also retain extrema of each positive influence set.
  const partitions=[`bone:${dominant}`,`joint:${influences.sort((a,b)=>a-b).join(',')}`].map(key=>{let group=groups.get(key);if(!group){group={scores:directions.map(()=>-Infinity),indices:directions.map(()=>i)};groups.set(key,group);}return group;});
  for(let d=0;d<directions.length;d++){const score=point.dot(directions[d]);for(const group of partitions)if(score>group.scores[d]){group.scores[d]=score;group.indices[d]=i;}}
 }
 return [...new Set([...groups.values()].flatMap(g=>g.indices))];
}


export type GeometryAttributeStamp={attributes:Array<THREE.BufferAttribute|THREE.InterleavedBufferAttribute|undefined>;versions:number[]};
const attributeVersion=(attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute|undefined)=>attribute instanceof THREE.InterleavedBufferAttribute?attribute.data.version:attribute?.version??-1;
export function captureGeometryAttributes(geometry:THREE.BufferGeometry):GeometryAttributeStamp{const attributes=['position','skinIndex','skinWeight'].map(name=>geometry.getAttribute(name));return {attributes,versions:attributes.map(attributeVersion)};}
export function geometryAttributesMatch(geometry:THREE.BufferGeometry,stamp:GeometryAttributeStamp|undefined):boolean{return !!stamp&&['position','skinIndex','skinWeight'].every((name,i)=>{const attribute=geometry.getAttribute(name);return attribute===stamp.attributes[i]&&attributeVersion(attribute)===stamp.versions[i];});}
