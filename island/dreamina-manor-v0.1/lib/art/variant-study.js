import * as THREE from 'three';
import {createPlantPresentation} from './plant-presentation.js';
import {createFishPresentation} from './fish-presentation.js';
import {fishWorldLength} from './physical-contract.js';
import {FISH_STANDARD_SIZES_CM} from './fish-sizing.js';
/** Art QA fixture only. No randomness, purchases, inventory, or product game state. */
export function createVariantStudy({gltf=null,speciesId='radish',fishSizeCm=null}={}){
 const root=new THREE.Group();root.name='art-variant-study';
 const presentations=[],labels=[];
 const entries=[{name:'原生',variant:'normal',scale:1},{name:'金色',variant:'gold',scale:1},{name:'巨型',variant:'normal',scale:1.3}];
 for(let i=0;i<entries.length;i++){
  const e=entries[i];const p=fishSizeCm===null?createPlantPresentation(gltf,{instanceScale:e.scale,variant:e.variant}):createFishPresentation({speciesId,lengthCm:fishSizeCm*e.scale,worldLength:fishWorldLength(fishSizeCm*e.scale,FISH_STANDARD_SIZES_CM[speciesId]),variant:e.variant,instanceId:`study-${i}`});
  p.root.position.x=(i-1)*2.6;p.root.position.y=fishSizeCm===null?0:.8;root.add(p.root);presentations.push(p);
  labels.push({text:e.name,position:new THREE.Vector3((i-1)*2.6,-.14,0)});
 }
 const setGrowth=progress=>presentations.forEach(p=>p.setGrowth?.(progress));setGrowth(1);
 // One shared camera conversion for the three samples, never individually normalize.
 presentations.forEach(p=>p.root.position.set(0,0,0));root.updateMatrixWorld(true);
 const maxBox=new THREE.Box3().setFromObject(presentations[2].root),sz=maxBox.getSize(new THREE.Vector3());
 const spacing=Math.max(.45,sz.x*1.22,sz.z*.75),worldWidth=spacing*3.5;
 presentations.forEach((p,i)=>{p.root.position.x=(i-1)*spacing;labels[i].position.x=(i-1)*spacing;});
 const centerY=(maxBox.min.y+maxBox.max.y)*.5;
 return {root,labels,presentations,setGrowth,animate:seconds=>presentations.forEach(p=>p.animate?.(seconds)),
  camera:{position:[worldWidth*.18,centerY+worldWidth*.40,worldWidth*1.6],target:[0,centerY,0],worldWidth},
  dispose(){presentations.forEach(p=>p.dispose());root.clear();}};
}
