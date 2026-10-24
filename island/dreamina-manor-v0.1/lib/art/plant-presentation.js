import{plantVisualMultiplier}from'./plant-tier-scale.js';
import * as THREE from 'three';
import {CHARACTER_PLANT_VISUAL_SCALE} from './physical-contract.js';

/** Art-owned animation and appearance only. Server progress / final size are inputs. */
export function createPlantPresentation(gltf,{instanceScale=1,variant='normal',speciesId=null}={}) {
  // Botanical GLBs use node animation, not skinning. Clone nodes per instance; geometry stays cached.
  const root=gltf.scene.clone(true);
  if(!Number.isFinite(instanceScale)||instanceScale<=0)throw new Error('Invalid physical plant scale');
  root.scale.setScalar(instanceScale*CHARACTER_PLANT_VISUAL_SCALE*plantVisualMultiplier(speciesId));
  root.userData.artPhysicalScale=instanceScale;
  const mixer=new THREE.AnimationMixer(root);
  const actions=(gltf.animations||[]).map(clip=>{
    const a=mixer.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();return a;
  });
  const duration=Math.max(0,...(gltf.animations||[]).map(c=>c.duration));
  const ownedMaterials=[];
  root.traverse(node=>{
    if(!node.isMesh)return;
    node.castShadow=true;node.receiveShadow=true;
    const map=(m)=>{
      const out=m.clone();ownedMaterials.push(out);
      if(variant==='gold')goldMaterial(out,node.name);
      return out;
    };
    node.material=Array.isArray(node.material)?node.material.map(map):map(node.material);
  });
  let progress=NaN;
  const setGrowth=(value)=>{
    const next=THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);
    if(next===progress)return;
    progress=next;
    // End time stays infinitesimally before a loop boundary; all organ tracks share duration.
    for(const a of actions){a.enabled=true;a.paused=false;a.play();}
    mixer.setTime(Math.min(duration,next*duration));
    for(const a of actions)a.paused=true;
    root.updateMatrixWorld(true);
  };
  setGrowth(0);
  return {root,setGrowth,duration,dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);ownedMaterials.forEach(m=>m.dispose());}};
}

/** Warm gold, dark anatomy and pale crests. Never emissive yellow. */
export function goldMaterial(material,nodeName='') {
  const name=(material.name+' '+nodeName).toLowerCase();
  if(/soil|earth|support|stake|twine|pupil|(^|[\s_-])eye(?:[-_\s]|$)|mouth|gill/.test(name))return material;
  const luminance=.2126*material.color.r+.7152*material.color.g+.0722*material.color.b;
  let color=luminance>.55?'#F1DDA7':luminance<.12?'#B18A47':'#E0BC73',metalness=.36,roughness=.38;
  if(/stem|branch|petiole|vein|crown|foliage deep|center|disk|throat|seed/.test(name)){color='#AE884B';roughness=.46;metalness=.28;}
  else if(/petal|cream|white|tip|foliage light/.test(name)){color='#F1DDA7';roughness=.34;metalness=.34;}
  material.color.set(color);material.metalness=metalness;material.roughness=roughness;
  material.emissive?.set('#000000');material.needsUpdate=true;
  return material;
}
