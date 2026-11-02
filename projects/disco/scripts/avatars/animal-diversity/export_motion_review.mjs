// Bake the real runtime skin into a five-species/six-pose offline review sheet.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createClubAvatar} from '../../../lib/club-avatar-rig.ts';
globalThis.FileReader=class{result=null;onloadend=null;readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.();});}};
const assetDirectory=process.argv[2]??resolve('public/avatars');
const destination=process.argv[3];
if(!destination)throw new Error('Supply an offline review destination GLB.');
const scene=new THREE.Scene();
const point=new THREE.Vector3();
for(const[row,kind]of ['cat','frog','dog','capybara','panda'].entries()){
 const bytes=readFileSync(resolve(assetDirectory,`${kind}.glb`));
 const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 const avatar=createClubAvatar(kind,`review:${kind}`,{template:source});
 for(const[column,beat]of [.08,.45,.8,.42,1.325,.5].entries()){
  const action=column===3?'bounce':column===4?'wave':'dance';
  const group=undefined;
  const motion=column===5?{slot:0,x:0,z:0,heading:0,distance:.2,speed:.6,walkBlend:1,action:'dance',sampleAtDistance:d=>({x:0,z:d-.2,heading:0})}:undefined;
  avatar.update(beat,action,false,1,motion,group);
  const wrapper=new THREE.Group();wrapper.name=`${kind}-pose-${column}`;wrapper.position.set((column-2.5)*1.9,0,-row*2.6);scene.add(wrapper);
  avatar.root.traverseVisible(node=>{
   if(!(node instanceof THREE.Mesh))return;
   const geometry=node.geometry.clone();const positions=geometry.attributes.position;
   for(let vertex=0;vertex<positions.count;vertex++){node.getVertexPosition(vertex,point).applyMatrix4(node.matrixWorld);positions.setXYZ(vertex,point.x,point.y,point.z);}
   geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();
   const mesh=new THREE.Mesh(geometry,Array.isArray(node.material)?node.material.map(material=>material.clone()):node.material.clone());mesh.name=`${wrapper.name}-${node.name}`;wrapper.add(mesh);
  });
 }
 avatar.dispose();
}
scene.updateMatrixWorld(true);
const result=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true});
writeFileSync(destination,Buffer.from(result));
console.log(destination,`${result.byteLength} bytes`);
