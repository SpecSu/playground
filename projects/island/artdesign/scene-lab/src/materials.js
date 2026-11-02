// Runtime art calibration on cloned materials; original PBR files remain unchanged.
export function calibrateMaterial(root,id){
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
    const apply=source=>{
      const m=source.userData.isRuntimeClone?source:source.clone();m.userData.isRuntimeClone=true;
      m.normalScale?.setScalar(id==='tree'?.55:id==='ground'?.55:.75);
      const previous=m.onBeforeCompile,previousKey=m.customProgramCacheKey();
      m.onBeforeCompile=shader=>{
        previous.call(m,shader);
        if(['tree','shrub','ground'].includes(id)){
          shader.vertexShader='varying float vAssetHeight;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvAssetHeight=clamp((position.y-(${box.min.y.toFixed(6)}))/${(box.max.y-box.min.y).toFixed(6)},0.,1.);`);
          shader.fragmentShader='varying float vAssetHeight;\n'+shader.fragmentShader;
          const tint=id==='tree'?'mix(vec3(.48,.70,.82),vec3(1.08,.98,.72),vAssetHeight)':id==='shrub'?'vec3(.72,.88,.84)':'vec3(.93,.96,.86)';
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\nfloat greenMask=smoothstep(1.02,1.35,diffuseColor.g/max(.001,diffuseColor.r))*smoothstep(1.04,1.5,diffuseColor.g/max(.001,diffuseColor.b));diffuseColor.rgb*=mix(vec3(1.),${tint},greenMask);${id==='tree'?'diffuseColor.rgb+=vec3(0.,.014,.045)*(1.-vAssetHeight)*greenMask;':''}`);
        }
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.68);');
      };
      m.customProgramCacheKey=()=>previousKey+'-art-v1-'+id;return m;
    };
    const material=mesh.userData.originalMaterial||mesh.material;
    mesh.material=Array.isArray(material)?material.map(apply):apply(material);mesh.userData.originalMaterial=mesh.material;
  });
}
