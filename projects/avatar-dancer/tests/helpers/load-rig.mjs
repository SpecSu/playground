import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function loadGeometry(name, {path} = {}) {
  // Exercise real skin weights and clips with GLTFLoader; image decoding needs a browser.
  const bytes=fs.readFileSync(path || (process.env.CAMERA_ASSET_DIR ? process.env.CAMERA_ASSET_DIR+'/'+name+'.glb' : new URL('../../public/assets/characters/'+name+'.glb',import.meta.url)));
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