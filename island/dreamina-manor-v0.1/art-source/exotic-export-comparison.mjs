import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {createPlantPresentation} from '../lib/art/plant-presentation.js';
import {createExoticPlant} from '../lib/art/exotic-plants.js';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:'+b.type+';base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}};
const out=fileURLToPath(new URL('../../manor-next-content-20261024/exotic-evidence/',import.meta.url));
const tiers=[['radish','daisy','lithops','corkscrew-grass'],['tomato','tulip','mimosa','string-of-pearls'],['pumpkin','sunflower','pitcher-plant','spiral-aloe'],['dragonfruit','iris','fantasy-chomper','travellers-palm'],['grape','phalaenopsis','rafflesia','titan-arum']];
const root=new THREE.Group(),labels=[],references=[],dimensions=[];
for(let t=0;t<5;t++){
 const y=(4-t)*6.5;
 references.push({x:-11,y});labels.push({text:`T${t+1} / 1.8m`,x:-11,y:y-.38});
 for(let i=0;i<4;i++){
  const id=tiers[t][i];let p;
  if(i<2){const bytes=fs.readFileSync(new URL(`../public/assets/world/plants/${id}.glb`,import.meta.url));const gltf=await new Promise((yes,no)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',yes,no));p=createPlantPresentation(gltf,{speciesId:id});}
  else p=createExoticPlant(id);
  p.setGrowth(1);p.update?.(0);const box=new THREE.Box3().setFromObject(p.root),size=box.getSize(new THREE.Vector3());dimensions.push({tier:t+1,id,source:i<2?'existing':'new',size:size.toArray()});
  const x=[-7,-2.5,2,6.5][i];p.root.position.set(x,y,0);p.root.rotation.y=-.28;root.add(p.root);
  labels.push({text:`${id}\nH${size.y.toFixed(2)} / W${Math.max(size.x,size.z).toFixed(2)}m`,x,y:y-.37});
 }
}
fs.writeFileSync(out+'same-scale.glb',Buffer.from(await new GLTFExporter().parseAsync(root,{binary:true})));
fs.writeFileSync(out+'same-scale.json',JSON.stringify({width:25,height:34,targetY:15.7,labels,references,dimensions},null,2));
console.log(JSON.stringify(dimensions,null,2));
