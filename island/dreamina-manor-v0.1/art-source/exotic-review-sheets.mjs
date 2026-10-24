import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import * as THREE from 'three';import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {EXOTIC_PLANT_IDS,createExoticPlant} from '../lib/art/exotic-plants.js';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:'+b.type+';base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}};
const out=fileURLToPath(new URL('../../manor-next-content-20261024/exotic-evidence/',import.meta.url));fs.mkdirSync(out,{recursive:true});
function model(id,progress,variant,black=false){const p=createExoticPlant(id,{variant});p.setGrowth(1);const full=new THREE.Box3().setFromObject(p.root).getSize(new THREE.Vector3()),s=1.35/Math.max(full.x,full.y,full.z);p.setGrowth(progress);p.update(0);p.root.scale.multiplyScalar(s);p.root.rotation.set(.12,-.28,0);if(black)p.root.traverse(n=>{if(n.isMesh)n.material=new THREE.MeshBasicMaterial({color:'#17271F',side:THREE.DoubleSide});});return p.root;}
const shapeRoot=new THREE.Group(),shapeLabels=[];
for(let i=0;i<EXOTIC_PLANT_IDS.length;i++){const id=EXOTIC_PLANT_IDS[i],x=(i%5-2)*3.4,y=(1-Math.floor(i/5))*2.2;for(const black of [false,true]){const m=model(id,1,'normal',black);m.position.set(x+(black?.76:-.76),y,0);shapeRoot.add(m);}shapeLabels.push({text:id,x,y:y-.25});}
fs.writeFileSync(out+'shape-sheet.glb',Buffer.from(await new GLTFExporter().parseAsync(shapeRoot,{binary:true})));fs.writeFileSync(out+'shape-sheet.json',JSON.stringify({width:18,height:5.0,targetY:1.7,labels:shapeLabels}));
const studyRoot=new THREE.Group(),studyLabels=[];const ids=['pitcher-plant','fantasy-chomper','rafflesia'];
for(let i=0;i<ids.length;i++)for(let j=0;j<4;j++){const x=(j-1.5)*2.3,y=(2-i)*2.0,progress=[.05,.45,1,1][j],variant=j===3?'gold':'normal',m=model(ids[i],progress,variant);m.position.set(x,y,0);studyRoot.add(m);studyLabels.push({text:ids[i]+' '+(j===3?'gold':Math.round(progress*100)+'%'),x,y:y-.24});}
fs.writeFileSync(out+'growth-gold-sheet.glb',Buffer.from(await new GLTFExporter().parseAsync(studyRoot,{binary:true})));fs.writeFileSync(out+'growth-gold-sheet.json',JSON.stringify({width:10,height:6.8,targetY:2.7,labels:studyLabels}));console.log('Exported actual geometry shape and growth/gold review sheets');
