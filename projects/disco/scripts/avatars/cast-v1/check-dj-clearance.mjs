/** Offline exact skin/solid collision check across 517 DJ and ceremony poses. */
import '../../../tests/room-loader.mjs';
import * as THREE from 'three';
import {createClubAvatar} from '../../../lib/club-avatar-rig.ts';
import {makeClubWorld} from '../../../lib/club-scene-world.ts';
import {uploadedTemplate,actualBounds} from '../../../tests/helpers/uploaded-avatar.ts';
import {ClubDanceStaging} from '../../../lib/club-dance-staging.ts';
const dj=createClubAvatar('dj-kunkun','house-dj',{template:await uploadedTemplate('dj-kunkun'),mode:'dj'});
const world=makeClubWorld({createAvatar(k){return k==='dj-kunkun'?dj:{root:new THREE.Group(),height:1.5,labelHeight:2,footprintRadius:.6,loaded:true,ready:Promise.resolve(),update(){},dispose(){}}}});
world.scene.updateMatrixWorld(true);
const booth=world.scene.getObjectByName('central-dj-booth'),solids=[],cache=new Map();
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();let objectIndex=0;
booth.traverse(o=>{
 if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||o.userData.floorPickThrough)return;
 o.geometry.computeBoundingBox();const size=o.geometry.boundingBox.getSize(new THREE.Vector3());if(Math.min(size.x,size.y,size.z)<1e-6)return;
 let planes=cache.get(o.geometry);
 if(!planes){planes=[];const p=o.geometry.attributes.position,ix=o.geometry.index;for(let i=0;i<(ix?ix.count:p.count);i+=3){a.fromBufferAttribute(p,ix?ix.getX(i):i);b.fromBufferAttribute(p,ix?ix.getX(i+1):i+1);c.fromBufferAttribute(p,ix?ix.getX(i+2):i+2);n.crossVectors(b.clone().sub(a),c.clone().sub(a));if(n.lengthSq()<1e-15)continue;n.normalize();planes.push([n.x,n.y,n.z,n.dot(a)])}cache.set(o.geometry,planes)}
 const scale=o.getWorldScale(new THREE.Vector3());
 const name=o.name||`mesh-${objectIndex++}`;
 solids.push({name,position:o.position.toArray(),parent:o.parent.name||o.parent.position.toArray(),box:o.geometry.boundingBox.clone(),worldBox:o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld),inv:o.matrixWorld.clone().invert(),planes:planes.map(([x,y,z,d])=>{const p=new THREE.Plane(new THREE.Vector3(x,y,z),-d).applyMatrix4(o.matrixWorld);return [p.normal.x,p.normal.y,p.normal.z,-p.constant]}),scale:Math.min(scale.x,scale.y,scale.z),cabinet:Boolean(o.userData.cameraObstacle)});
});
const point=new THREE.Vector3(),local=new THREE.Vector3();let totalFrames=0,insideFrames=0,worst={depth:0},cabinetWorst={depth:0},minHand=Infinity,minPlatform=Infinity;const cases=[];
function check(frame){
 totalFrames++;const bounds=actualBounds(dj.root);minPlatform=Math.min(minPlatform,bounds.min.y);let count=0;
 for(const side of ['L','R'])minHand=Math.min(minHand,dj.root.getObjectByName('hand_'+side).getWorldPosition(new THREE.Vector3()).y);
 dj.root.traverseVisible(m=>{if(!(m instanceof THREE.SkinnedMesh))return;
  for(let i=0;i<m.geometry.attributes.position.count;i++){
   m.getVertexPosition(i,point).applyMatrix4(m.matrixWorld);
   for(const s of solids){
    if(!s.worldBox.containsPoint(point))continue;local.copy(point).applyMatrix4(s.inv);if(!s.box.containsPoint(local))continue;
    let max=-Infinity;for(const [x,y,z,d]of s.planes){max=Math.max(max,x*point.x+y*point.y+z*point.z-d);if(max>=0)break}
    const depth=-max;if(depth<=0)continue;
    const detail={depth,frame,vertex:i,solid:s.name,solidPosition:s.position,parent:s.parent,position:point.toArray()};
    if(depth>worst.depth)worst=detail;if(s.cabinet&&depth>cabinetWorst.depth)cabinetWorst=detail;
    if(depth>.001){count++;if(cases.length<8)cases.push(detail)}
   }
  }
 });
 if(count)insideFrames++;
}
for(const energy of [0,.25,.65,1]){
 for(let i=0;i<=80;i++){const beat=i*.05;dj.update(beat,'dance',false,energy);world.scene.updateMatrixWorld(true);check({mode:'dj',energy,beat})}
 console.log(JSON.stringify({progress:'dance energy complete',energy,worst,cabinetWorst,insideFrames}));
}
dj.update(10,'dance',true,1);world.scene.updateMatrixWorld(true);check({mode:'dj',reduced:true});
const stage=new ClubDanceStaging(),round={id:'r',seed:'s',version:2,startsAt:1000,endsAt:52120};
for(const reduced of [false,true])for(let age=0;age<2400;age+=25){stage.apply([],null,0,reduced,1,round.endsAt+age,null,round,world.dj);world.scene.updateMatrixWorld(true);check({mode:'bow',reduced,age});stage.restore()}
console.log(JSON.stringify({final:true,solids:solids.length,totalFrames,insideFrames,worst,cabinetWorst,minHand,minPlatform,cases}));world.dispose();

if (insideFrames) process.exitCode = 1;
