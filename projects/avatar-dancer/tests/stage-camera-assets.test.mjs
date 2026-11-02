import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {stageCameraFraming, normalizeCharacterBind, createRootMotionLock} from '../src/stage.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/characters/manifest.json',import.meta.url)));
async function loadGeometry(name) {
  // Exercise real skin weights and clips with GLTFLoader; image decoding needs a browser.
  const bytes=fs.readFileSync(process.env.CAMERA_ASSET_DIR ? process.env.CAMERA_ASSET_DIR+'/'+name+'.glb' : new URL('../public/assets/characters/'+name+'.glb',import.meta.url));
  const n=bytes.readUInt32LE(12), json=JSON.parse(bytes.subarray(20,20+n));
  for(const mesh of json.meshes) for(const primitive of mesh.primitives) delete primitive.material;
  delete json.materials; delete json.images; delete json.textures;
  const encoded=Buffer.from(JSON.stringify(json)), padded=Buffer.alloc(Math.ceil(encoded.length/4)*4,32); encoded.copy(padded);
  const binaryChunk=bytes.subarray(20+n), glb=Buffer.alloc(20+padded.length+binaryChunk.length);
  glb.write('glTF'); glb.writeUInt32LE(2,4); glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(padded.length,12); glb.writeUInt32LE(0x4e4f534a,16);
  padded.copy(glb,20); binaryChunk.copy(glb,20+padded.length);
  return new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
}
for(const person of Object.keys(manifest.characters)) for(const outfit of manifest.characters[person].outfits.keys()) test(person+' '+outfit+': sampled real dance poses stay in lower gameplay safe frame', async t=>{
  const gltf=await loadGeometry(person+'-'+outfit), model=gltf.scene, def=manifest.characters[person].outfits[outfit];
  normalizeCharacterBind(model,def.height); model.rotation.y+=def.rotationY||0;
  const wrapper=new THREE.Group(); wrapper.add(model); let hips; const meshes=[];
  model.traverse(n=>{if(!hips && /hips$|pelvis$/i.test(n.name)) hips=n;if(n.isMesh)meshes.push(n);});
  const lock=createRootMotionLock(wrapper,hips), mixer=new THREE.AnimationMixer(model);
  const cameras=[-.22,0,.22].map(orbit=>{
    const frame=stageCameraFraming('playing',false,orbit), camera=new THREE.PerspectiveCamera(33,9/16,.05,80);
    camera.position.fromArray(frame.position);camera.lookAt(...frame.target);camera.updateMatrixWorld();return camera;
  });
  const point=new THREE.Vector3(), projected=new THREE.Vector3(); let top=1,bottom=0,headTop=1;
  for(const clip of gltf.animations) {
    mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
    for(let sample=0;sample<24;sample++) {
      mixer.setTime(clip.duration*sample/24); lock.apply(); wrapper.updateMatrixWorld(true);
      for(const mesh of meshes) {
        mesh.skeleton?.update();
        let node=mesh; while(node && !/DONOR_HEAD|CANONICAL/i.test(node.name)) node=node.parent;
        const isDerivedHead=Boolean(node);
        const headJoint=mesh.skeleton?.bones.findIndex(b=>/Head$/i.test(b.name));
        const skinIndex=mesh.geometry.attributes.skinIndex, skinWeight=mesh.geometry.attributes.skinWeight;
        if(mesh.isSkinnedMesh)assert(headJoint>=0 && skinIndex && skinWeight,'native head must be selected from actual skin joints/weights');
        for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
          let headWeight=0;
          if(mesh.isSkinnedMesh)for(const read of ['getX','getY','getZ','getW'])if(skinIndex[read](i)===headJoint)headWeight+=skinWeight[read](i);
          const isHead=isDerivedHead || (headWeight>=.5);
          mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);
          for(const camera of cameras) {
            projected.copy(point).project(camera);
            const y=(1-projected.y)/2;top=Math.min(top,y);bottom=Math.max(bottom,y);
            if(isHead)headTop=Math.min(headTop,y);
          }
        }
      }
    }
  }
  t.diagnostic(JSON.stringify({top,bottom,headTop}));
  assert(top>-.06,'only extreme raised hands may crop at static150% frame'); assert(bottom<.79,'feet stay above actual81% hit line');
  assert(headTop<1 && headTop>.05,'real head stays below top HUD');
  mixer.stopAllAction();mixer.uncacheRoot(model);
  model.traverse(n=>{n.geometry?.dispose();n.skeleton?.dispose();if(n.material)n.material.dispose();});
});
