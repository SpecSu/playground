import * as T from 'three';
// Small, continuous bends of intact imported meshes. Root contact never moves.
export const motionTime={value:0};
export function addLivingMotion(root,kind){
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();const b=g.boundingBox;
    const span=Math.max(1e-5,kind==='fish'?b.max.z-b.min.z:b.max.y-b.min.y);
    const low=kind==='fish'?b.min.z:b.min.y;
    const bend=kind==='fish'
      ? `float tail=1.-smoothstep(0.05,0.70,(position.z-(${low.toFixed(6)}))/${span.toFixed(6)});transformed.x+=sin(uLifeTime*6.0+position.z*9.)*tail*tail*${(span*.045).toFixed(6)};`
      : `float height01=clamp((position.y-(${low.toFixed(6)}))/${span.toFixed(6)},0.,1.);transformed.x+=sin(uLifeTime*1.25+height01*1.6)*height01*height01*${(span*.004).toFixed(6)};`;
    const patch=shader=>{shader.uniforms.uLifeTime=motionTime;shader.vertexShader='uniform float uLifeTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+bend);};
    const original=mesh.userData.originalMaterial||mesh.material;
    const clone=m=>{const c=m.clone();c.onBeforeCompile=patch;c.customProgramCacheKey=()=>kind+'-'+span+'-'+low;c.userData.isRuntimeClone=true;return c};
    mesh.material=Array.isArray(original)?original.map(clone):clone(original);mesh.userData.originalMaterial=mesh.material;
    mesh.customDepthMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});mesh.customDepthMaterial.onBeforeCompile=patch;mesh.customDepthMaterial.customProgramCacheKey=()=>kind+'-depth-'+span+'-'+low;
  });
}
