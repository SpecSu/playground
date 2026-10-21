import * as THREE from 'three';
import {createFishingMeshTriangleReader,createFishingTriangleIntersectionProbe} from './fishing-triangle-clearance.mjs';

/** Select the actual authored, baked and world-transformed rail cylinders. The
 * main-deck rails predate mesh names, so their authored radii identify them;
 * the named upper-deck group includes every post, side rail and forward return.
 * Deliberately excludes mast, bollards, glassware and the fishing rod itself. */
export function fishingRailMeshes(world) {
  const rails=[];
  world.yacht.traverse(mesh=>{
    if(!mesh.isMesh||mesh.geometry.type!=='CylinderGeometry')return;
    if(mesh.parent.name==='Upper-deck safety rail'||mesh.parent===world.yacht&&[.028,.032,.04].includes(mesh.geometry.parameters.radiusTop))rails.push(mesh);
  });
  return rails;
}

const boxOf=triangle=>new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c]);
const boxDistanceSq=(a,b)=>{
  let result=0;
  for(const axis of ['x','y','z']){const d=Math.max(0,a.min[axis]-b.max[axis],b.min[axis]-a.max[axis]);result+=d*d;}
  return result;
};
const ab=new THREE.Vector3(),cd=new THREE.Vector3(),offset=new THREE.Vector3(),closest=new THREE.Vector3(),triangle=new THREE.Triangle();
function segmentDistanceSq(a,b,c,d){
  ab.subVectors(b,a);cd.subVectors(d,c);offset.subVectors(a,c);
  const aa=ab.lengthSq(),cc=cd.lengthSq(),ac=ab.dot(cd),ao=ab.dot(offset),co=cd.dot(offset),denominator=aa*cc-ac*ac;
  let s=aa<=1e-20?0:denominator>1e-20?THREE.MathUtils.clamp((ac*co-ao*cc)/denominator,0,1):0;
  let t=cc<=1e-20?0:(ac*s+co)/cc;
  if(t<0){t=0;s=aa<=1e-20?0:THREE.MathUtils.clamp(-ao/aa,0,1);}
  else if(t>1){t=1;s=aa<=1e-20?0:THREE.MathUtils.clamp((ac-ao)/aa,0,1);}
  return offset.addScaledVector(ab,s).addScaledVector(cd,-t).lengthSq();
}
function triangleDistanceSq(a,b){
  const av=[a.a,a.b,a.c],bv=[b.a,b.b,b.c];let result=Infinity;
  triangle.set(b.a,b.b,b.c);for(const v of av)result=Math.min(result,triangle.closestPointToPoint(v,closest).distanceToSquared(v));
  triangle.set(a.a,a.b,a.c);for(const v of bv)result=Math.min(result,triangle.closestPointToPoint(v,closest).distanceToSquared(v));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)result=Math.min(result,segmentDistanceSq(av[i],av[(i+1)%3],bv[j],bv[(j+1)%3]));
  return result;
}

/** Snapshot the real rail mesh surfaces. Recreate after moving the yacht.
 * Crossings are exact bidirectional rod/rail triangle tests. Optional clearance
 * is exact triangle-surface distance, capped at clearanceLimit for speed. A
 * capped result is a lower bound, explicitly marked clearanceCapped. This is
 * neither an axis-center approximation nor a screen-space/AABB collision test. */
export function createFishingRodRailProbe(world,{clearanceLimit=0,sampleLimit=4}={}){
  world.scene.updateMatrixWorld(true);
  const meshes=fishingRailMeshes(world),rails=meshes.flatMap((mesh,index)=>{
    const label=`${mesh.parent.name==='Upper-deck safety rail'?'upper':'main'}-rail-${index}`;
    return createFishingMeshTriangleReader(mesh)().map(t=>({...t,label,mesh:label}));
  });
  const intersections=createFishingTriangleIntersectionProbe(rails,{sampleLimit}),railBoxes=rails.map(boxOf),readers=new WeakMap();
  const radius=Math.max(0,clearanceLimit);
  // Mesh-level broad phase is cheap and cannot discard a triangle pair closer
  // than the current exact surface-distance candidate.
  const batches=[];let start=0;
  for(const mesh of meshes){const count=mesh.geometry.index.count/3;batches.push({start,end:start+count,box:new THREE.Box3().setFromObject(mesh)});start+=count;}
  const measure=rod=>{
    let read=readers.get(rod);if(!read){read=createFishingMeshTriangleReader(rod);readers.set(rod,read);}
    const subjects=read(),crossings=intersections(subjects);
    let minimumSq=crossings.count?0:radius*radius,nearest=null;
    if(!crossings.count&&radius){
      const rodBox=new THREE.Box3().setFromObject(rod),nearby=batches.filter(batch=>boxDistanceSq(rodBox,batch.box)<minimumSq);
      for(const subject of subjects){const subjectBox=boxOf(subject);
        for(const batch of nearby){if(boxDistanceSq(subjectBox,batch.box)>=minimumSq)continue;
          for(let i=batch.start;i<batch.end;i++){if(boxDistanceSq(subjectBox,railBoxes[i])>=minimumSq)continue;
            const distance=triangleDistanceSq(subject,rails[i]);if(distance<minimumSq){minimumSq=distance;nearest={subject:subject.mesh,obstacle:rails[i].label};}
          }
        }
      }
    }
    return {crossings,clearance:crossings.count?0:radius?Math.sqrt(minimumSq):null,clearanceCapped:!crossings.count&&(!radius||minimumSq===radius*radius),nearest,rodTriangles:subjects.length,railMeshes:meshes.length,railTriangles:rails.length};
  };
  return Object.assign(measure,{meshes,railTriangles:rails.length});
}
