import * as THREE from 'three';

const BODY = /^(hips|spine|chest|neck|head)$/;
const ARM = /^(upperArm|forearm|hand)_[LR]$/;
const empty = () => ({count:0,labels:{},samples:[]});
const bounds = triangle => {
  const {a,b,c}=triangle;
  return [Math.min(a.x,b.x,c.x),Math.max(a.x,b.x,c.x),Math.min(a.y,b.y,c.y),Math.max(a.y,b.y,c.y),Math.min(a.z,b.z,c.z),Math.max(a.z,b.z,c.z)];
};
const cells = (box,size) => box.map(value=>Math.floor(value/size));
const key = (x,y,z) => `${x},${y},${z}`;
function makeGrid(triangles,size) {
  const grid=new Map(),boxes=triangles.map(bounds);
  for(let i=0;i<triangles.length;i++) {
    const [x0,x1,y0,y1,z0,z1]=cells(boxes[i],size);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++) {
      const k=key(x,y,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);
    }
  }
  return {grid,boxes};
}
function crossings(subjects,obstacles,index,{cellSize,epsilon,sampleLimit}) {
  const result=empty(),ray=new THREE.Ray(),direction=new THREE.Vector3(),hit=new THREE.Vector3();
  const edgeHit=(a,b)=>{
    const corners=[a.a,a.b,a.c];
    for(let i=0;i<3;i++) {
      ray.origin.copy(corners[i]);direction.subVectors(corners[(i+1)%3],corners[i]);
      const length=direction.length();if(length<=epsilon)continue;
      ray.direction.copy(direction).multiplyScalar(1/length);
      if(ray.intersectTriangle(b.a,b.b,b.c,false,hit)) {
        const distance=hit.distanceTo(ray.origin);
        if(distance>epsilon&&distance<length-epsilon)return hit.toArray();
      }
    }
    return null;
  };
  for(const subject of subjects) {
    const box=bounds(subject),[x0,x1,y0,y1,z0,z1]=cells(box,cellSize),candidates=new Set();
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(const i of index.grid.get(key(x,y,z))??[])candidates.add(i);
    for(const i of candidates) {
      const other=index.boxes[i];
      if(box[0]>other[1]||box[1]<other[0]||box[2]>other[3]||box[3]<other[2]||box[4]>other[5]||box[5]<other[4])continue;
      const obstacle=obstacles[i],point=edgeHit(subject,obstacle)||edgeHit(obstacle,subject);
      if(!point)continue;
      result.count++;
      const label=subject.label??'surface';result.labels[label]=(result.labels[label]??0)+1;
      if(result.samples.length<sampleLimit)result.samples.push({point,subject:label,obstacle:obstacle.label??'surface',subjectMesh:subject.mesh,subjectOffset:subject.offset,obstacleMesh:obstacle.mesh,obstacleOffset:obstacle.offset});
    }
  }
  return result;
}

/**
 * Bidirectional segment/triangle surface intersections. No watertight-volume or
 * wrist-point assumption. Counts triangle pairs, NOT depth or penetration volume.
 * Exact endpoint touches and coplanar overlaps are not reported. Fully contained
 * geometry need not cross a surface: pair this with the vertex-inside probe.
 */
export function findFishingTriangleCrossings(subjects,obstacles,{cellSize=.07,epsilon=1e-5,sampleLimit=8}={}) {
  return crossings(subjects,obstacles,makeGrid(obstacles,cellSize),{cellSize,epsilon,sampleLimit});
}

/** Reuse an obstacle index while testing several subjects against one posed frame.
 * Recreate after moving the obstacle vertices. */
export function createFishingTriangleIntersectionProbe(obstacles,{cellSize=.07,epsilon=1e-5,sampleLimit=8}={}) {
  const index=makeGrid(obstacles,cellSize),settings={cellSize,epsilon,sampleLimit};
  return subjects=>crossings(subjects,obstacles,index,settings);
}

/** Read every mesh triangle, without anatomical weight exclusions. Topology is
 * cached; returned vectors are updated in place. Defaults to world coordinates.
 * Use relativeTo for avatar-local coordinates. Supports static and skinned meshes. */
export function createFishingMeshTriangleReader(root,{relativeTo}={}) {
  const meshes=[],triangles=[],inverse=new THREE.Matrix4(),transform=new THREE.Matrix4();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometry=mesh.geometry,attribute=geometry.getAttribute('position'),index=geometry.index;
    if(!attribute)return;
    const positions=Array.from({length:attribute.count},()=>new THREE.Vector3());
    const skin=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
    const labels=positions.map((_,i)=>{
      if(!mesh.isSkinnedMesh||!skin||!weights)return mesh.name||'surface';
      let best=-1,label='';
      for(let channel=0;channel<weights.itemSize;channel++)if(weights.getComponent(i,channel)>best){
        best=weights.getComponent(i,channel);label=mesh.skeleton.bones[skin.getComponent(i,channel)]?.name??'';
      }
      return label;
    });
    for(let offset=0;offset<(index?.count??attribute.count);offset+=3){
      const ids=[0,1,2].map(c=>index?index.getX(offset+c):offset+c);
      triangles.push({a:positions[ids[0]],b:positions[ids[1]],c:positions[ids[2]],label:mesh.isSkinnedMesh?ids.map(i=>labels[i]).sort().join('|'):labels[ids[0]],mesh:mesh.name,offset});
    }
    meshes.push({mesh,attribute,positions});
  });
  return ()=>{
    root.updateWorldMatrix(true,true);
    if(relativeTo){relativeTo.updateWorldMatrix(true,false);inverse.copy(relativeTo.matrixWorld).invert();}else inverse.identity();
    for(const {mesh,attribute,positions}of meshes){
      if(mesh.isSkinnedMesh)mesh.skeleton.update();
      transform.multiplyMatrices(inverse,mesh.matrixWorld);
      for(let i=0;i<positions.length;i++){
        if(mesh.isSkinnedMesh)mesh.getVertexPosition(i,positions[i]);else positions[i].fromBufferAttribute(attribute,i);
        positions[i].applyMatrix4(transform);
      }
    }
    return triangles;
  };
}

const triangleAt=(positions,ids,label,mesh,offset)=>({a:positions[ids[0]],b:positions[ids[1]],c:positions[ids[2]],label,mesh,offset});
/**
 * Offline real-skinned-surface regression probe. All corners of a retained body
 * triangle have >=65% torso/head/neck and <=20% arm weight. All corners of an arm
 * triangle have >=65% combined upper-arm/forearm/hand and <=20% body weight. This
 * includes distal upper arms and full retained hands, rather than bone origins.
 * Mixed shoulder seams remain excluded; open retained surfaces are still tested.
 *
 * Optional tool candidates are hand-dominant triangles whose every corner lies
 * >13 cm from its own wrist, including the uploaded dog's merged sword/shield.
 * This distance filter is a reproducible tool proxy, not anatomical segmentation;
 * ordinary shaft/palm grip contact is intentionally outside that check.
 */
export function createFishingTriangleClearanceProbe(root,{cellSize=.07,epsilon=1e-5,sampleLimit=8,propWristRadius=.13}={}) {
  const settings={cellSize,epsilon,sampleLimit},meshes=[];
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const geometry=mesh.geometry,skin=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
    if(!skin||!weights)return;
    const positions=Array.from({length:skin.count},()=>new THREE.Vector3()),classification=[];
    for(let i=0;i<skin.count;i++) {
      let body=0,arm=0,left=0,right=0,largest=-1,label='';
      for(let channel=0;channel<weights.itemSize;channel++) {
        const weight=weights.getComponent(i,channel),name=mesh.skeleton.bones[skin.getComponent(i,channel)]?.name??'';
        if(BODY.test(name))body+=weight;if(ARM.test(name))arm+=weight;
        if(name==='hand_L')left+=weight;if(name==='hand_R')right+=weight;
        if(weight>largest){largest=weight;label=name;}
      }
      classification.push({body,arm,left,right,label});
    }
    const body=[],arms=[],handCandidates=[],index=geometry.index;
    for(let offset=0;offset<(index?.count??skin.count);offset+=3) {
      const ids=[0,1,2].map(c=>index?index.getX(offset+c):offset+c),corners=ids.map(i=>classification[i]);
      const label=corners.map(c=>c.label).sort().join('|'),triangle=triangleAt(positions,ids,label,mesh.name,offset);
      if(corners.every(c=>c.body>=.65&&c.arm<=.2))body.push(triangle);
      if(corners.every(c=>c.arm>=.65&&c.body<=.2))arms.push(triangle);
      if(corners.every(c=>c.left>=.65||c.right>=.65))handCandidates.push({triangle,ids,sides:corners.map(c=>c.left>=.65?'L':'R')});
    }
    meshes.push({mesh,positions,body,arms,handCandidates});
  });
  const body=meshes.flatMap(m=>m.body),arms=meshes.flatMap(m=>m.arms);
  const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4(),wristPositions={L:new THREE.Vector3(),R:new THREE.Vector3()};
  const wristBones={L:root.getObjectByName('hand_L'),R:root.getObjectByName('hand_R')};
  const rodCache=new WeakMap();
  function rodTriangles(rod) {
    let cached=rodCache.get(rod);
    if(!cached) {
      cached=[];
      rod.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const geometry=mesh.geometry,attribute=geometry.getAttribute('position'),index=geometry.index;
        const positions=Array.from({length:attribute.count},()=>new THREE.Vector3()),triangles=[];
        for(let offset=0;offset<(index?.count??attribute.count);offset+=3) {
          const ids=[0,1,2].map(c=>index?index.getX(offset+c):offset+c);
          triangles.push(triangleAt(positions,ids,mesh.name||'reel',mesh.name,offset));
        }
        cached.push({mesh,attribute,positions,triangles});
      });
      rodCache.set(rod,cached);
    }
    rod.updateWorldMatrix(true,true);
    for(const item of cached) {
      matrix.multiplyMatrices(inverse,item.mesh.matrixWorld);
      for(let i=0;i<item.positions.length;i++)item.positions[i].fromBufferAttribute(item.attribute,i).applyMatrix4(matrix);
    }
    return cached.flatMap(item=>item.triangles);
  }
  return function measure({rod,rodVisible=true,checkProps=false}={}) {
    root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();
    for(const item of meshes) {
      item.mesh.skeleton.update();matrix.multiplyMatrices(inverse,item.mesh.matrixWorld);
      for(let i=0;i<item.positions.length;i++)item.mesh.getVertexPosition(i,item.positions[i]).applyMatrix4(matrix);
    }
    const bodyGrid=makeGrid(body,cellSize);
    const result={testedVertices:meshes.reduce((n,item)=>n+item.positions.length,0),bodyTriangles:body.length,armTriangles:arms.length,upperArmTriangles:arms.filter(t=>t.label.includes('upperArm_')).length,armBody:crossings(arms,body,bodyGrid,settings),rodBody:empty(),rodProps:empty()};
    if(rod&&rodVisible) {
      const triangles=rodTriangles(rod);result.rodBody=crossings(triangles,body,bodyGrid,settings);
      if(checkProps) {
        for(const side of ['L','R'])if(wristBones[side])wristBones[side].getWorldPosition(wristPositions[side]).applyMatrix4(inverse);
        const props=[];
        for(const item of meshes)for(const candidate of item.handCandidates)if(candidate.ids.every((id,i)=>wristBones[candidate.sides[i]]&&item.positions[id].distanceTo(wristPositions[candidate.sides[i]])>propWristRadius))props.push(candidate.triangle);
        result.rodProps=crossings(triangles,props,makeGrid(props,cellSize),settings);
      }
    }
    return result;
  };
}
