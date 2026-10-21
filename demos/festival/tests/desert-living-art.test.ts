import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as installations from '../src/desert/installations.ts';

function kinetic(root:THREE.Group){const nodes:THREE.Object3D[]=[];root.traverse(n=>{if(n.userData.livingMotion)nodes.push(n);});return nodes;}
function pose(root:THREE.Group){return kinetic(root).map(n=>[...n.position.toArray(),...n.rotation.toArray().slice(0,3),...n.scale.toArray()]);}
function meshVertices(root:THREE.Group){const vertices:THREE.Vector3[]=[];root.updateMatrixWorld(true);root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const points=node.geometry.getAttribute('position');for(let i=0;i<points.count;i+=3)vertices.push(new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(node.matrixWorld));});return vertices;}

test('all twelve artworks move articulated local parts while preserving construction and parent transforms',()=>{
  for(let kind=0;kind<12;kind++){
    const root=installations.createInstallation(kind,4);assert.ok(kinetic(root).length>0);
    const before=pose(root);
    root.position.set(10,-.7,20);root.rotation.set(0,kind*.73,.1);root.scale.y=.4;
    const parent=[...root.position.toArray(),...root.rotation.toArray(),...root.scale.toArray()];
    for(let frame=0;frame<100;frame++)installations.updateInstallationAnimation(root,frame/20,{active:true});
    assert.notDeepEqual(pose(root),before,`kind ${kind} animates`);
    assert.deepEqual([...root.position.toArray(),...root.rotation.toArray(),...root.scale.toArray()],parent);
    installations.updateInstallationAnimation(root,6,{active:false});assert.deepEqual(pose(root),before);
    installations.updateInstallationAnimation(root,7,{active:true,reducedMotion:true});assert.deepEqual(pose(root),before);
    installations.disposeInstallation(root);
  }
});

test('wide-view idle motion has substantial real-vertex travel on every installation',()=>{
  for(let kind=0;kind<12;kind++){
    const root=installations.createInstallation(kind,0),rest=meshVertices(root);let maxTravel=0;
    for(let frame=0;frame<300;frame++){
      installations.updateInstallationAnimation(root,frame*.1,{active:true});if(frame%10)continue;
      const points=meshVertices(root);for(let i=0;i<points.length;i++)maxTravel=Math.max(maxTravel,points[i].distanceTo(rest[i]));
    }
    assert.ok(maxTravel>1.4,`kind ${kind}: only ${maxTravel.toFixed(3)}m of travel, should read from the wide camera`);
    if(kind===2)assert.ok(maxTravel>3.5,`whale needs an obvious swim, got ${maxTravel}m`);
    installations.disposeInstallation(root);
  }
});

test('animation does not change a single material, geometry buffer, or placement safety boundary',()=>{
  const vertex=new THREE.Vector3();
  for(let kind=0;kind<12;kind++){
    const root=installations.createInstallation(kind,0),materials=new Set<THREE.MeshStandardMaterial>();
    root.traverse(node=>{if(node instanceof THREE.Mesh){for(const material of Array.isArray(node.material)?node.material:[node.material])if(material instanceof THREE.MeshStandardMaterial)materials.add(material);}});
    const buffers: {attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; before: number[]}[]=[];
    root.traverse(node=>{if(node instanceof THREE.Mesh){const attribute=node.geometry.getAttribute('position');buffers.push({attribute,before:Array.from(attribute.array)});}});
    const before=[...materials].map(m=>[m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity,m.opacity,m.roughness,m.metalness]);
    for(let frame=0;frame<300;frame++){
      installations.updateInstallationAnimation(root,frame*.1,{active:true});if(frame%10)continue;
      root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const points=node.geometry.getAttribute('position');for(let i=0;i<points.count;i++){vertex.fromBufferAttribute(points,i).applyMatrix4(node.matrixWorld);assert.ok(Math.hypot(vertex.x,vertex.z)<=root.userData.footprintRadius+.001,`kind ${kind} radius ${Math.hypot(vertex.x,vertex.z)} leaves placement footprint`);}});
    }
    for(const buffer of buffers)assert.deepEqual(Array.from(buffer.attribute.array),buffer.before);
    assert.deepEqual([...materials].map(m=>[m.color.getHex(),m.emissive.getHex(),m.emissiveIntensity,m.opacity,m.roughness,m.metalness]),before);
    installations.disposeInstallation(root);
  }
});


test('large motion eases out of construction and reduced-motion rather than popping',()=>{
  for(let kind=0;kind<12;kind++){
    const root=installations.createInstallation(kind,4);
    for(let frame=0;frame<100;frame++)installations.updateInstallationAnimation(root,frame*.1,{active:true});
    installations.updateInstallationAnimation(root,10,{active:false});
    const rest=meshVertices(root);
    installations.updateInstallationAnimation(root,10+1/60,{active:true});
    const resumed=meshVertices(root);
    const greatest=Math.max(...resumed.map((point,i)=>point.distanceTo(rest[i])));
    assert.ok(greatest<.12,`kind ${kind} jumps ${greatest}m on its first completed frame`);
    installations.disposeInstallation(root);
  }
});
