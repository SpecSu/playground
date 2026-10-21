import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Texture} from 'three';

/** Geometry/bone tests do not need browser image APIs. Texture bytes and material
 * declarations are separately inspected in the untouched GLB manifest. */
export async function uploadedAvatar(id) {
 const bytes=readFileSync(new URL(`../../public/avatars/cast-v1/${id}.glb`,import.meta.url));
 const loader=new GLTFLoader().register(()=>({name:'offline-texture-placeholder',loadTexture:()=>Promise.resolve(new Texture())}));
 return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
export function glbDocument(bytes){return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());}
