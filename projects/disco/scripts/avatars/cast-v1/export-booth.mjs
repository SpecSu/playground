/** Exact static booth geometry for offline visual QA, no browser or production changes. */
import {writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {makeClubEnvironment} from '../../../lib/club-scene-environment.ts';
class NodeFileReader {
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.()})}
 readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.()})}
}
globalThis.FileReader=NodeFileReader;
const environment=makeClubEnvironment(),booth=environment.booth.clone(true);
booth.position.set(0,0,0);booth.rotation.set(0,0,0);
const omit=[];booth.traverse(n=>{if(n instanceof THREE.Mesh && (n.material.map || n instanceof THREE.InstancedMesh))omit.push(n)});omit.forEach(n=>n.removeFromParent());
const binary=await new GLTFExporter().parseAsync(booth,{binary:true});
writeFileSync(process.argv[2]??'/tmp/disco-cast-review/booth.glb',Buffer.from(binary));environment.dispose();
