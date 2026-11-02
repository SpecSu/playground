import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {findFishingTriangleCrossings, createFishingTriangleClearanceProbe, createFishingMeshTriangleReader, createFishingTriangleIntersectionProbe} from './helpers/fishing-triangle-clearance.mjs';
import {uploadedAvatar} from './helpers/uploaded-avatar.mjs';
import {FISHING_AVATAR_CATALOG} from '../lib/fishing-avatar-catalog.ts';
import {createFishingAvatar} from '../lib/fishing-avatar.ts';
import {createFishingRod} from '../lib/fishing-rod.ts';
import {sampleFishingAction} from '../lib/fishing-action-motion.ts';
import {positionFishingCatchArrival} from '../lib/fishing-catch-motion.ts';
import {createMarineModel,animateMarineModel} from '../components/fishing/MarineModels.ts';
import {catchDisplayScale,disposeObject} from '../lib/fishing-world.ts';

const triangle = points => new THREE.Triangle(...points.map(p => new THREE.Vector3(...p)));

test('triangle crossings detect both edge directions through an open surface, not merely wrist origins', () => {
  const body = triangle([[-1,-1,0],[1,-1,0],[0,1,0]]);
  const crossing = triangle([[0,0,-.3],[0,0,.3],[.2,.2,.3]]);
  const outside = triangle([[0,0,.3],[.2,0,.3],[0,.2,.3]]);
  assert.equal(findFishingTriangleCrossings([crossing],[body]).count,1);
  assert.equal(findFishingTriangleCrossings([body],[crossing]).count,1);
  assert.equal(findFishingTriangleCrossings([outside],[body]).count,0);
});

test('a broad flat fish triangle cannot cut a body surface between its exterior vertices', () => {
  const wing=triangle([[-2,0,-2],[2,0,-2],[0,0,2]]);
  const body=triangle([[-.1,-.1,0],[.1,-.1,0],[0,.1,0]]);
  const closest=new THREE.Vector3();
  for(const vertex of [wing.a,wing.b,wing.c]) assert.ok(body.closestPointToPoint(vertex,closest).distanceTo(vertex)>1);
  assert.equal(findFishingTriangleCrossings([wing],[body]).count,1,'the body edge pierces the interior of the horizontal wing');
});

test('skinned triangle coverage includes upper arms, forearms and complete hand surfaces', () => {
  const positions = [[-1,-1,0],[1,-1,0],[0,1,0]];
  const labels = ['spine','upperArm_R','forearm_R','hand_R'];
  for (const x of [-.3,0,.3]) positions.push([x,0,-.2],[x,0,.2],[x+.1,.2,.2]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions.flat(),3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(positions.flatMap((_,i)=>[Math.floor(i/3),0,0,0]),4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(positions.flatMap(()=>[1,0,0,0]),4));
  const bones = labels.map(name=>{const bone=new THREE.Bone();bone.name=name;return bone;});
  const material = new THREE.MeshBasicMaterial(), mesh = new THREE.SkinnedMesh(geometry,material);
  mesh.add(...bones); mesh.bind(new THREE.Skeleton(bones));
  const root = new THREE.Group();root.add(mesh);root.position.set(3,2,-5);root.rotation.y=.7;
  const probe = createFishingTriangleClearanceProbe(root);
  const crossed = probe();
  assert.equal(crossed.bodyTriangles,1);
  assert.equal(crossed.armTriangles,3);
  assert.equal(crossed.upperArmTriangles,1);
  assert.equal(crossed.armBody.count,3);
  const allTriangles=createFishingMeshTriangleReader(root,{relativeTo:root})();
  assert.equal(allTriangles.length,4,'whole-mesh reader retains all surfaces');
  assert.equal(createFishingTriangleIntersectionProbe(allTriangles.slice(0,1))(allTriangles.slice(1)).count,3);
  for (const name of labels.slice(1)) assert.ok(Object.keys(crossed.armBody.labels).some(label=>label.includes(name)),name);
  for (const bone of bones.slice(1)) bone.position.z=2;
  assert.equal(probe().armBody.count,0,'actual skin transforms move the surfaces outside');
  geometry.dispose();material.dispose();
});

test('whole static mesh reader updates transformed surfaces without classifying away geometry',()=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material),root=new THREE.Group();root.add(mesh);
  const read=createFishingMeshTriangleReader(root);assert.equal(read().length,1);
  root.position.set(2,3,4);const moved=read();assert.deepEqual(moved[0].a.toArray(),[2,3,4]);
  assert.deepEqual(createFishingMeshTriangleReader(root,{relativeTo:root})()[0].a.toArray(),[0,0,0]);
  geometry.dispose();material.dispose();
});

test('a giant manta tail clears the real supporting hand throughout the late arrival segment',async()=>{
  const avatar=createFishingAvatar('human-bear','manta-tail-regression',{template:await uploadedAvatar('human-bear')});
  const fish=createMarineModel('manta-ray',400),scale=catchDisplayScale(400);fish.scale.setScalar(scale);
  const size=avatar.prepareCatch(fish),readAvatar=createFishingMeshTriangleReader(avatar.root,{relativeTo:avatar.root}),readFish=createFishingMeshTriangleReader(fish);
  const water=new THREE.Vector3(0,-1.5,4.2),contact=new THREE.Vector3(),failures=[];
  // This final local-space segment is independent of seat/world transforms.
  // A 40–100 ms scan can miss the narrow tail/palm crossing around 1405 ms.
  for(let elapsed=1380;elapsed<=1440;elapsed+=5){
    const now=1000+elapsed,time=now/1000,pose=sampleFishingAction({phase:'holding',catch:{caughtAt:1000}},now);
    avatar.updateFishing(time,'holding',false,scale*1.6,pose,undefined,size);
    avatar.positionCatch(contact,size);
    positionFishingCatchArrival(fish.position,water,contact,size,pose.haulProgress,avatar.catchApproachDirection);
    animateMarineModel(fish,time,pose.haulProgress);
    const result=createFishingTriangleIntersectionProbe(readAvatar(),{sampleLimit:1})(readFish());
    if(result.count)failures.push({elapsed,count:result.count,sample:result.samples[0]});
  }
  avatar.dispose();disposeObject(fish);
  assert.deepEqual(failures,[]);
});

test('all 12 uploaded avatars keep actual arm and rod triangles clear through cast and haul', async () => {
  const stages = [
    {name:'idle',time:0,state:{phase:'idle'}},
    {name:'waiting',time:4000,state:{phase:'waiting',castAt:1000}},
    {name:'bite',time:5300,state:{phase:'bite',castAt:1000,biteAt:5000}},
  ];
  for (const ms of [...Array.from({length:16},(_,i)=>i*100),1540]) stages.push({name:`cast-${ms}`,time:1000+ms,state:{phase:'waiting',castAt:1000}});
  for (const ms of [...Array.from({length:15},(_,i)=>i*100),1450]) stages.push({name:`haul-${ms}`,time:7000+ms,state:{phase:'holding',catch:{caughtAt:7000}}});
  const material = new THREE.MeshBasicMaterial(), rod=createFishingRod(material,material), failures=[];
  for (const {id} of FISHING_AVATAR_CATALOG) {
    const avatar=createFishingAvatar(id,'triangle-regression',{template:await uploadedAvatar(id)});
    const probe=createFishingTriangleClearanceProbe(avatar.root);
    for (const stage of stages) {
      const pose=sampleFishingAction(stage.state,stage.time);
      avatar.updateFishing(stage.time/1000,stage.state.phase,false,.352,pose);
      rod.position.copy(avatar.rodPosition);rod.quaternion.copy(avatar.rodQuaternion);rod.updateRestPose(pose.restProgress);
      const result=probe({rod,rodVisible:pose.rodVisible,checkProps:id==='sword-shield-dog'});
      assert.ok(result.bodyTriangles>0&&result.armTriangles>0&&result.upperArmTriangles>0,`${id}: real surfaces were retained`);
      for (const kind of ['armBody','rodBody','rodProps']) if (result[kind].count) failures.push({id,stage:stage.name,kind,count:result[kind].count,labels:result[kind].labels,example:result[kind].samples[0]?.point});
    }
    avatar.dispose();
  }
  rod.traverse(node=>{if(node.isMesh)node.geometry.dispose();});material.dispose();
  assert.deepEqual(failures,[]);
});
