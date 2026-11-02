/** Offline actual-skin / convex-solid roaming clearance check.
 * Default: 12 avatars, 10 slots, 0–60s at 1s intervals. This is sampled vertex
 * containment, not continuous triangle collision or a real-device screenshot.
 * Dense regression for the former 2.575 mm sword-dog cabinet brush:
 * KIND=sword-shield-dog SLOT=3 START=17000 END=18500 STEP=5 ENERGY=1 node --experimental-strip-types scripts/avatars/cast-v1/check-roam-booth-clearance.mjs
 * Exits 1 when any sampled vertex is over 1 mm inside a solid desk part.
 */
import '../../../tests/room-loader.mjs';
import { CLUB_AVATAR_SCALE } from '../../../lib/club-avatar-scale.ts';
import * as THREE from 'three';
import {createClubAvatar} from '../../../lib/club-avatar-rig.ts';
import {makeClubEnvironment} from '../../../lib/club-scene-environment.ts';
import {clubMotionAt, CLUB_BODY_RADIUS} from '../../../lib/club-scene-motion.ts';
import {UPLOADED_CAST,uploadedTemplate,actualBounds} from '../../../tests/helpers/uploaded-avatar.ts';
const environment=makeClubEnvironment();environment.scene.updateMatrixWorld(true);
const booth=environment.scene.getObjectByName('central-dj-booth'),solids=[],cache=new Map();
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();let objectIndex=0;
booth.traverse(o=>{
 if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||o.userData.floorPickThrough)return;
 o.geometry.computeBoundingBox();const size=o.geometry.boundingBox.getSize(new THREE.Vector3());if(Math.min(size.x,size.y,size.z)<1e-6)return;
 let planes=cache.get(o.geometry);
 if(!planes){planes=[];const p=o.geometry.attributes.position,ix=o.geometry.index;for(let i=0;i<(ix?ix.count:p.count);i+=3){a.fromBufferAttribute(p,ix?ix.getX(i):i);b.fromBufferAttribute(p,ix?ix.getX(i+1):i+1);c.fromBufferAttribute(p,ix?ix.getX(i+2):i+2);n.crossVectors(b.clone().sub(a),c.clone().sub(a));if(n.lengthSq()<1e-15)continue;n.normalize();planes.push([n.x,n.y,n.z,n.dot(a)])}cache.set(o.geometry,planes)}
 solids.push({name:o.name||`mesh-${objectIndex++}`,position:o.position.toArray(),parent:o.parent.name||o.parent.position.toArray(),box:o.geometry.boundingBox.clone(),worldBox:o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld),inv:o.matrixWorld.clone().invert(),planes:planes.map(([x,y,z,d])=>{const p=new THREE.Plane(new THREE.Vector3(x,y,z),-d).applyMatrix4(o.matrixWorld);return [p.normal.x,p.normal.y,p.normal.z,-p.constant]}),cabinet:Boolean(o.userData.cameraObstacle)});
});
if(solids.length!==31)throw Error(`Expected 31 solids, got ${solids.length}`);
const STEP=Number(process.env.STEP??1000),END=Number(process.env.END??60000),START=Number(process.env.START??0),ENERGY=Number(process.env.ENERGY??1);
const onlyKind=process.env.KIND,onlySlot=process.env.SLOT===undefined?null:Number(process.env.SLOT);
let totalFrames=0,broadFrames=0,actualAabbFrames=0,insideFrames=0,cabinetFrames=0,fullVertices=0,broadValidated=0;
let worst={depth:0},cabinetWorst={depth:0};const firstCases=[],aabbCases=[];
const point=new THREE.Vector3(),local=new THREE.Vector3(),tmpbox=new THREE.Box3(),matrix=new THREE.Matrix4(),post=new THREE.Matrix4();
// A skin vertex is a convex combination of its bone-transformed positions.
// For each bone, bound all rest positions it influences. Transforming these
// per-bone boxes and unioning bounds every skin vertex, without posing vertices.
function supports(root){const rows=[];root.traverseVisible(m=>{if(!(m instanceof THREE.Mesh))return;if(m.geometry.morphAttributes.position?.length)throw Error('Unmodelled morph bounds');
 if(!(m instanceof THREE.SkinnedMesh)){m.geometry.computeBoundingBox();rows.push({m,boxes:null});return}
 const boxes=m.skeleton.bones.map(()=>new THREE.Box3()),p=m.geometry.attributes.position,si=m.geometry.attributes.skinIndex,sw=m.geometry.attributes.skinWeight;
 for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i);let sum=0;for(let j=0;j<4;j++){const w=sw.getComponent(i,j);if(w<0)throw Error('negative weight');sum+=w;if(w>0)boxes[si.getComponent(i,j)].expandByPoint(point)}if(Math.abs(sum-1)>1e-5)throw Error(`nonconvex skin weights ${sum}`)} rows.push({m,boxes});});return rows}
function broadBound(rows){const bound=new THREE.Box3();for(const {m,boxes}of rows){if(!boxes){bound.union(tmpbox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));continue}m.skeleton.update();post.multiplyMatrices(m.matrixWorld,m.bindMatrixInverse);for(let i=0;i<boxes.length;i++){if(boxes[i].isEmpty())continue;matrix.copy(post).multiply(m.skeleton.bones[i].matrixWorld).multiply(m.skeleton.boneInverses[i]).multiply(m.bindMatrix);bound.union(tmpbox.copy(boxes[i]).applyMatrix4(matrix))}}return bound.expandByScalar(.0001)}
function check(model,rows,frame){
 totalFrames++;model.root.updateWorldMatrix(true,true);const broad=broadBound(rows);let candidates=solids.filter(s=>s.worldBox.intersectsBox(broad));
 // Validate the broad bound independently for the first pose of every slot/model.
 let actual;if(frame.time===START&&frame.action==='dance'){actual=actualBounds(model.root);broadValidated++;if(!broad.containsBox(actual))throw Error(`Nonconservative bounds ${JSON.stringify(frame)}`)}
 if(!candidates.length)return;broadFrames++;
 actual??=actualBounds(model.root);candidates=candidates.filter(s=>s.worldBox.intersectsBox(actual));if(!candidates.length)return;actualAabbFrames++;
 if(aabbCases.length<8)aabbCases.push({frame,candidates:candidates.map(s=>s.name),bounds:{min:actual.min.toArray(),max:actual.max.toArray()}});
 let collided=false,cabinetCollided=false;
 for(const {m}of rows){for(let i=0;i<m.geometry.attributes.position.count;i++){fullVertices++;m.getVertexPosition(i,point).applyMatrix4(m.matrixWorld);for(const s of candidates){if(!s.worldBox.containsPoint(point))continue;local.copy(point).applyMatrix4(s.inv);if(!s.box.containsPoint(local))continue;
 let max=-Infinity;for(const[x,y,z,d]of s.planes){max=Math.max(max,x*point.x+y*point.y+z*point.z-d);if(max>=0)break}const depth=-max;if(depth<=0)continue;
 const detail={depth,frame,vertex:i,solid:s.name,solidPosition:s.position,parent:s.parent,position:point.toArray()};if(depth>worst.depth)worst=detail;if(s.cabinet&&depth>cabinetWorst.depth)cabinetWorst=detail;
 if(depth>.001){collided=true;cabinetCollided ||=s.cabinet;if(firstCases.length<8){firstCases.push(detail);console.log(JSON.stringify({issue:true,...detail}))}}
 }}}
 if(collided)insideFrames++;if(cabinetCollided)cabinetFrames++;
}
console.log(JSON.stringify({start:true,bodyRadius:CLUB_BODY_RADIUS,scale:CLUB_AVATAR_SCALE,solids:solids.length,START,END,STEP,ENERGY,actionModes:['default participant dance','ambient route action (wave filtered to dance)']}));
for(const kind of UPLOADED_CAST){if(onlyKind&&kind!==onlyKind)continue;const model=createClubAvatar(kind,`booth-qa:${kind}`,{template:await uploadedTemplate(kind)});const root=new THREE.Group();root.scale.setScalar(CLUB_AVATAR_SCALE);root.userData.avatarDisplayScale=CLUB_AVATAR_SCALE;root.add(model.root);const rows=supports(model.root);for(let slot=0;slot<10;slot++){if(onlySlot!==null&&slot!==onlySlot)continue;for(let time=START;time<=END;time+=STEP){const motion=clubMotionAt(time,slot);root.position.set(motion.x,0,motion.z);root.rotation.y=motion.heading;root.updateMatrixWorld(true);const actions=new Set(['dance',motion.action==='wave'?'dance':motion.action]);for(const action of actions){model.update(time/500,action,false,ENERGY,motion);check(model,rows,{kind,slot,time,beat:time/500,action,motion:{x:motion.x,z:motion.z,heading:motion.heading,walkBlend:motion.walkBlend,speed:motion.speed,distance:motion.distance}})}}}
 model.dispose();console.log(JSON.stringify({progress:kind,totalFrames,broadFrames,actualAabbFrames,insideFrames,cabinetFrames,worst,cabinetWorst}));}
console.log(JSON.stringify({final:true,solids:solids.length,totalFrames,broadFrames,actualAabbFrames,insideFrames,cabinetFrames,fullVertices,broadValidated,worst,cabinetWorst,firstCases,aabbCases}));environment.dispose();if(insideFrames)process.exitCode=1;
