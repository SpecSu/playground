import * as THREE from 'three';
export type SolidFootTriangleLiftWorld=(a:Readonly<{x:number;y:number;z:number}>,b:Readonly<{x:number;y:number;z:number}>,c:Readonly<{x:number;y:number;z:number}>)=>number;

/** Correct only the extra floor penetration of a partial grounded-action crossfade.
 * The source clips already solve their leg contacts, but interpolating their
 * joint rotations does not interpolate the ankle along that contact plane.
 * This is not a foot-lock or a replacement locomotion animation. */
export function createTransitionFloorContact(root:THREE.Group,contactRoot:THREE.Object3D,chains?:readonly Readonly<{upper:string;lower:string;foot:string}>[]){
 const feet:THREE.Bone[]=[];root.traverse(node=>{if(node instanceof THREE.Bone&&/_(?:hoof|paw|foot)$/.test(node.name))feet.push(node);});
 const legacyLegs=()=>feet.flatMap(foot=>{const lower=foot.parent,upper=lower?.parent;if(!(lower instanceof THREE.Bone)||!(upper instanceof THREE.Bone)||!lower.name.endsWith('_lower')||!upper.name.endsWith('_upper'))return [];return [{foot,lower,upper,sole:[] as THREE.Vector3[],triangles:[] as [THREE.Vector3,THREE.Vector3,THREE.Vector3][]}];});
 const legs=chains?chains.map(chain=>{const upper=root.getObjectByName(chain.upper),lower=root.getObjectByName(chain.lower),foot=root.getObjectByName(chain.foot);if(!(upper instanceof THREE.Bone)||!(lower instanceof THREE.Bone)||!(foot instanceof THREE.Bone)||lower.parent!==upper||foot.parent!==lower)throw new Error(`Invalid contact foot chain ${chain.foot}`);return {foot,lower,upper,sole:[] as THREE.Vector3[],triangles:[] as [THREE.Vector3,THREE.Vector3,THREE.Vector3][]};}):legacyLegs();
 // All shipped soles are rigidly weighted to their semantic foot bone. Store
 // actual vertices in that bone's bind frame, once; never skin whole bodies in
 // the render loop or approximate a sole using an empty marker/AABB.
 const point=new THREE.Vector3(),bindToFoot=new THREE.Matrix4(),triangleWorld=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()] as const;
 root.traverse(mesh=>{if(!(mesh instanceof THREE.SkinnedMesh))return;const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),positions=mesh.geometry.getAttribute('position');
  for(const leg of legs){const boneIndex=mesh.skeleton.bones.indexOf(leg.foot);if(boneIndex<0)continue;bindToFoot.multiplyMatrices(mesh.skeleton.boneInverses[boneIndex],mesh.bindMatrix);
   const rigid=new Map<number,THREE.Vector3>();
   for(let i=0;i<positions.count;i++){let influence=0;for(let j=0;j<4;j++)if(indices.getComponent(i,j)===boneIndex)influence+=weights.getComponent(i,j);if(influence>.999){const vertex=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(bindToFoot);leg.sole.push(vertex);rigid.set(i,vertex);}}
   const index=mesh.geometry.index,count=index?.count??positions.count;for(let i=0;i+2<count;i+=3){const a=rigid.get(index?index.getX(i):i),b=rigid.get(index?index.getX(i+1):i+1),c=rigid.get(index?index.getX(i+2):i+2);if(a&&b&&c)leg.triangles.push([a,b,c]);}
  }
 });
 const authored=legs.flatMap(leg=>[leg.upper,leg.lower,leg.foot]).map(bone=>({bone,rotation:bone.quaternion.clone(),additive:new THREE.Quaternion()}));
 const authoredByBone=new Map(authored.map(item=>[item.bone,item]));
 let releaseTime=.2,hasAdditive=false;const releasing=new THREE.Quaternion(),identity=new THREE.Quaternion();
 function clearAdditive(){for(const item of authored)item.additive.identity();releaseTime=.2;hasAdditive=false;delete root.userData.transitionFloorRelease;}
 const inverseRoot=new THREE.Matrix4(),footToRoot=new THREE.Matrix4(),start=new THREE.Vector3(),middle=new THREE.Vector3(),end=new THREE.Vector3(),target=new THREE.Vector3(),axis=new THREE.Vector3(),pole=new THREE.Vector3(),wantedKnee=new THREE.Vector3(),origin=new THREE.Vector3(),before=new THREE.Vector3(),after=new THREE.Vector3();
 const footRotation=new THREE.Quaternion(),boneRotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),delta=new THREE.Quaternion();
 function rotateToward(bone:THREE.Object3D,child:THREE.Object3D,wanted:THREE.Vector3){
  bone.getWorldPosition(origin);child.getWorldPosition(before).sub(origin).normalize();after.copy(wanted).sub(origin).normalize();delta.setFromUnitVectors(before,after);bone.getWorldQuaternion(boneRotation);bone.parent!.getWorldQuaternion(parentRotation);
  bone.quaternion.copy(parentRotation.invert()).multiply(delta).multiply(boneRotation).normalize();bone.updateWorldMatrix(false,true);
 }
 return {
  restoreAuthored(){for(const item of authored)item.bone.quaternion.copy(item.rotation);},
  captureAuthored(){for(const item of authored)item.rotation.copy(item.bone.quaternion);},
  // Explicit new-species handoff only. Always multiply the fresh authored pose,
  // never the previous rendered result; reversals cannot restart this snapshot.
  release(dt:number){
   delete root.userData.transitionFloorContact;if(!hasAdditive){delete root.userData.transitionFloorRelease;return;}
   releaseTime=Math.min(.2,releaseTime+Math.max(0,dt));
   // Retire at the floating-point representation of the 200ms boundary.
   if(releaseTime/.2>=1-Number.EPSILON*16){clearAdditive();return;}
   const u=releaseTime/.2,t=u*u*(3-2*u);
   for(const item of authored)item.bone.quaternion.multiply(releasing.copy(item.additive).slerp(identity,t)).normalize();
   root.userData.transitionFloorRelease={elapsedSeconds:releaseTime,remainingSeconds:.2-releaseTime};
  },
  solve(enabled:boolean,solidFootTriangleLiftWorld?:SolidFootTriangleLiftWorld){
   clearAdditive();delete root.userData.transitionFloorContact;if(!enabled)return;
   root.updateWorldMatrix(true,true);inverseRoot.copy(contactRoot.matrixWorld).invert();let correctedFeet=0,maxLiftLocal=0,maxErrorWorld=0,reachable=true;
   for(const leg of legs){if(!leg.sole.length)continue;footToRoot.multiplyMatrices(inverseRoot,leg.foot.matrixWorld);let floor=Infinity;
    let terrainLiftWorld=0;
    for(const vertex of leg.sole)floor=Math.min(floor,point.copy(vertex).applyMatrix4(footToRoot).y);
    if(solidFootTriangleLiftWorld)for(const triangle of leg.triangles){for(let i=0;i<3;i++)triangleWorld[i].copy(triangle[i]).applyMatrix4(leg.foot.matrixWorld);const lift=solidFootTriangleLiftWorld(...triangleWorld);if(!Number.isFinite(lift)||lift<0)throw new Error('Invalid solid foot triangle lift');terrainLiftWorld=Math.max(terrainLiftWorld,lift);}
    if(floor>=0&&terrainLiftWorld<=0)continue;
    // The unchanged native-plane branch keeps all old species numerical behavior.
    // Only an explicit new-species World sampler can add a real solid-bank target.
    const lift=floor<0?-floor+.00001:0;leg.foot.getWorldPosition(target).applyMatrix4(inverseRoot);target.y+=lift;target.applyMatrix4(contactRoot.matrixWorld);
    const axisScale=solidFootTriangleLiftWorld?new THREE.Vector3().setFromMatrixColumn(contactRoot.matrixWorld,1).length():1;
    const extraWorld=terrainLiftWorld>0?Math.max(0,terrainLiftWorld+.00001*axisScale-lift*axisScale):0;target.y+=extraWorld;
    leg.upper.getWorldPosition(start);leg.lower.getWorldPosition(middle);leg.foot.getWorldPosition(end);leg.foot.getWorldQuaternion(footRotation);
    const length1=start.distanceTo(middle),length2=middle.distanceTo(end),distance=start.distanceTo(target);
    // A valid solve bends a leg; it never scales a joint or silently stretches
    // an unreachable contact. The diagnostic preserves that distinction.
    if(distance>=length1+length2-1e-8||distance<=Math.abs(length1-length2)+1e-8){reachable=false;continue;}
    axis.copy(target).sub(start).normalize();pole.copy(middle).sub(start).addScaledVector(axis,-pole.dot(axis));
    if(pole.lengthSq()<1e-12){reachable=false;continue;}pole.normalize();
    const along=(length1*length1-length2*length2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,length1*length1-along*along));wantedKnee.copy(start).addScaledVector(axis,along).addScaledVector(pole,height);
    rotateToward(leg.upper,leg.lower,wantedKnee);rotateToward(leg.lower,leg.foot,target);leg.foot.parent!.getWorldQuaternion(parentRotation);leg.foot.quaternion.copy(parentRotation.invert()).multiply(footRotation).normalize();leg.foot.updateWorldMatrix(false,true);
    // Capture only freshly corrected legs. Uncorrected/unsolved joints remain
    // identity after clearAdditive, so stale corrections cannot survive.
    for(const bone of [leg.upper,leg.lower,leg.foot]){const item=authoredByBone.get(bone)!;item.additive.copy(item.rotation).invert().multiply(bone.quaternion).normalize();}hasAdditive=true;releaseTime=0;
    maxErrorWorld=Math.max(maxErrorWorld,leg.foot.getWorldPosition(end).distanceTo(target));maxLiftLocal=Math.max(maxLiftLocal,lift+extraWorld/axisScale);correctedFeet++;
   }
   root.userData.transitionFloorContact={correctedFeet,maxLiftLocal,maxErrorWorld,reachable};
  },
 };
}
