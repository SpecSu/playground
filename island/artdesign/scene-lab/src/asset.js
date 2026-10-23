import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// Decode a local 1px lossless WebP before selecting EXT_texture_webp assets.
// Older/unsupported browsers keep the existing JPEG + PNG runtime files.
export function supportsWebP() {
  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(false), 2000);
    image.onload = () => { clearTimeout(timer); resolve(image.width === 1 && image.height === 1); };
    image.onerror = () => { clearTimeout(timer); resolve(false); };
    image.src = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQvEJVq/+BiOh/AAA=';
  });
}

// Reject external image/buffer URLs before GLTFLoader can fetch them. This lab accepts embedded GLB.
export function inspectContainer(buffer) {
  const header = new DataView(buffer);
  if (buffer.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) throw new Error('请选择完整的 glTF 2.0 二进制 GLB 文件。');
  const length = header.getUint32(12, true);
  if (header.getUint32(16, true) !== 0x4e4f534a || length + 20 > buffer.byteLength) throw new Error('GLB JSON 区块损坏。');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  for (const resource of [...(json.images || []), ...(json.buffers || [])]) if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('请导出内嵌纹理的 GLB；此检查页不加载模型引用的外部网址。');
  const unsupported = (json.extensionsRequired || []).filter(x => ['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression'].includes(x));
  if (unsupported.length) throw new Error(`暂未配套 ${unsupported.join('、')} 解码器，请先使用原始未压缩 GLB。`);
  return json;
}

export class AssetLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.clay = new T.MeshStandardMaterial({ color: '#bbb9ac', roughness: .82, metalness: 0 });
    this.loader = new GLTFLoader();
  }
  async parse(buffer) {
    inspectContainer(buffer);
    const gltf = await this.loader.parseAsync(buffer, '');
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = node.receiveShadow = true;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        // GLTFLoader owns the color spaces, channel mapping, UVs, and PBR factors.
        for (const value of Object.values(m)) if (value?.isTexture) value.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      }
    });
    return { root: gltf.scene, animations: gltf.animations, bytes: buffer.byteLength };
  }
  async load(url) {
    if (!this.cache.has(url)) this.cache.set(url, (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`模型请求失败（${response.status}）。`);
      return this.parse(await response.arrayBuffer());
    })().catch(error => { this.cache.delete(url); throw error; }));
    return this.cache.get(url);
  }
  instance(asset, spec) {
    const root = new T.Group(), orientation = new T.Group(), model = clone(asset.root);
    orientation.rotation.set(...(spec.rotation || [0, 0, 0]).map(T.MathUtils.degToRad));
    orientation.add(model); root.add(orientation); root.updateMatrixWorld(true);
    const rawBounds = new T.Box3().setFromObject(root, true), rawSize = rawBounds.getSize(new T.Vector3());
    const extent = rawSize[spec.axis || 'y'];
    if (!Number.isFinite(extent) || extent < 1e-6) throw new Error('模型没有可用的边界尺寸。');
    const scale = spec.size / extent;
    orientation.scale.setScalar(scale); root.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(root, true), center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
    let anchorY = bounds.min.y;
    if (spec.anchor === 'top') anchorY = bounds.max.y;
    if (spec.anchor === 'center') anchorY = center.y;
    if (spec.anchor === 'waterline') anchorY = bounds.min.y + size.y * (spec.waterlineFraction ?? .24);
    orientation.position.set(-center.x, -anchorY, -center.z);
    root.userData.dimensions = size.toArray();
    root.userData.uniformScale = scale;
    root.traverse(node => {
      if (!node.isMesh) return;
      node.userData.originalMaterial = node.material;
      const base = m => new T.MeshBasicMaterial({ color: m.color || '#ffffff', map: m.map || null, vertexColors: m.vertexColors, side: m.side, alphaTest: m.alphaTest, transparent: m.transparent, opacity: m.opacity });
      node.userData.baseMaterial = Array.isArray(node.material) ? node.material.map(base) : base(node.material);
    });
    root.updateMatrixWorld(true);
    return root;
  }
  setMaterial(root, mode) {
    root.traverse(node => {
      if (!node.isMesh || !node.userData.originalMaterial) return;
      node.material = mode === 'clay' ? this.clay : mode === 'base' ? node.userData.baseMaterial : node.userData.originalMaterial;
    });
  }
  releaseInstance(root) {
    // Geometry and source materials belong to the cache. Dispose only per-instance debug materials.
    root.traverse(node => { for (const m of [node.userData.baseMaterial].flat()) m?.dispose(); for(const m of [node.userData.originalMaterial].flat())if(m?.userData?.isRuntimeClone)m.dispose();node.customDepthMaterial?.dispose(); });
    root.removeFromParent();
  }

  // Call only after releasing all instances. A/B switching must not retain two sets of PBR textures.
  async clearCache() {
    const cached = await Promise.allSettled(this.cache.values());
    this.cache.clear();
    const geometries=new Set(),materials=new Set(),textures=new Set();
    for(const result of cached)if(result.status==='fulfilled')result.value.root.traverse(node=>{
      if(!node.isMesh)return;
      geometries.add(node.geometry);
      for(const material of [node.material].flat()){
        materials.add(material);
        for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
      }
    });
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    for(const texture of textures){texture.dispose();texture.source?.data?.close?.();}
  }

  // Repeated imported props share geometry, PBR textures, and a single draw per primitive.
  batch(asset, spec, placements) {
    const sample=this.instance(asset,spec), group=new T.Group();sample.updateMatrixWorld(true);
    sample.traverse(node=>{
      if(!node.isMesh)return;
      const mesh=new T.InstancedMesh(node.geometry,node.material,placements.length);
      mesh.userData.sourceMatrix=node.matrixWorld.clone();
      mesh.userData.originalMaterial=node.material;mesh.userData.baseMaterial=node.userData.baseMaterial;
      mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
    });
    placements.forEach((p,i)=>this.updateBatch(group,i,p));
    return group;
  }
  updateBatch(group,index,{position,rotation=0,scale=1}) {
    const transform=new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),rotation),new T.Vector3(scale,scale,scale));
    group.traverse(m=>{if(!m.isInstancedMesh)return;m.setMatrixAt(index,new T.Matrix4().multiplyMatrices(transform,m.userData.sourceMatrix));m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();});
  }
}

export function modelStatistics(root) {
  let triangles = 0, meshes = 0, uvMeshes = 0;
  const materials = new Set(), textures = new Set();
  root.traverse(node => {
    if (!node.isMesh) return;
    meshes++; const g = node.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (g.attributes.uv) uvMeshes++;
    for (const m of [node.userData.originalMaterial || node.material].flat()) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  let pixels = 0;
  for (const t of textures) { const i = t.image; if (i) pixels += (i.width || 0) * (i.height || 0); }
  return { triangles: Math.round(triangles), meshes, uvMeshes, materials: materials.size, textures: textures.size, estimatedTextureMiB: pixels * 4 * 4 / 3 / 1048576 };
}

// Find the main upward-facing horizontal surface, e.g. a dock deck rather than post tops.
export function mainSurfaceHeight(root) {
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root, true), span = bounds.max.y-bounds.min.y;
  const bins = Array.from({length:80},()=>({area:0,weightedY:0}));
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
  root.traverse(node=>{
    if(!node.isMesh)return;
    const g=node.geometry,p=g.attributes.position,idx=g.index,n=idx?idx.count:p.count;
    for(let i=0;i<n;i+=3){
      a.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(node.matrixWorld);
      b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1).applyMatrix4(node.matrixWorld);
      c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2).applyMatrix4(node.matrixWorld);
      ab.subVectors(b,a);ac.subVectors(c,a);ab.cross(ac);const twiceArea=ab.length();
      if(twiceArea<1e-12 || ab.y/twiceArea<.88)continue;
      const y=(a.y+b.y+c.y)/3,k=T.MathUtils.clamp(Math.floor((y-bounds.min.y)/span*80),0,79);
      bins[k].area+=twiceArea;bins[k].weightedY+=y*twiceArea;
    }
  });
  const best=bins.reduce((a,b)=>a.area>b.area?a:b);
  return best.area?best.weightedY/best.area:bounds.max.y;
}
