import fs from 'node:fs';
import * as THREE from 'three';
import {createFishPresentation,measureFishTurnEnvelope} from '../lib/art/fish-presentation.js';
import {CATALOGUE} from '../lib/game/catalogue.js';
import {FISH_STANDARD_SIZES_CM} from '../lib/art/fish-sizing.js';
import {fishWorldLength} from '../lib/art/physical-contract.js';
const rows=[];
for(const spec of CATALOGUE.filter(s=>s.kind==='fish')){
 const lengthCm=FISH_STANDARD_SIZES_CM[spec.id]*1.2*1.3;
 const p=createFishPresentation({speciesId:spec.id,lengthCm,worldLength:fishWorldLength(lengthCm,FISH_STANDARD_SIZES_CM[spec.id]),instanceId:'audit-'+spec.id});
 const motionBox=new THREE.Box3();
 for(let i=0;i<64;i++){p.animate(i/64*16);p.root.updateMatrixWorld(true);motionBox.union(new THREE.Box3().setFromObject(p.root));}
 const ax=Math.max(Math.abs(motionBox.min.x),Math.abs(motionBox.max.x));
 const az=Math.max(Math.abs(motionBox.min.z),Math.abs(motionBox.max.z));
 const diameter=2*Math.hypot(ax,az);const height=motionBox.max.y-motionBox.min.y;
 const meshes=[];let tris=0;p.root.traverse(n=>{if(n.isMesh){meshes.push(n);tris+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;}});
 rows.push({id:spec.id,name:spec.name,maximumLengthCm:lengthCm,worldLength:fishWorldLength(lengthCm,FISH_STANDARD_SIZES_CM[spec.id]),conservativeFullYawDiameter:diameter,animatedHeight:height,clearInnerDepthWith20cmMargins:diameter+.4,clearInnerHeightWith15cmMargins:height+.3,meshCount:meshes.length,triangles:Math.round(tris)});
 p.dispose();
}
const out=new URL('../../art-evidence/fish-envelope-audit.json',import.meta.url);fs.writeFileSync(out,JSON.stringify({unit:'world grid metres; shared fish exhibition ruler .45*sqrt(standardCm/16)*(finalCm/standardCm)',metric:'overall longest axis X/Y/Z, same for all20',method:'64 motion samples, axis-aligned appendage union converted to conservative full-yaw circumscribed diameter; 20cm lateral + 15cm vertical margin each side',rows},null,2));
console.log(rows.map(r=>`${r.id.padEnd(12)} length=${r.worldLength.toFixed(3)} fullYaw=${r.conservativeFullYawDiameter.toFixed(3)} clearDepth=${r.clearInnerDepthWith20cmMargins.toFixed(3)} clearHeight=${r.clearInnerHeightWith15cmMargins.toFixed(3)} meshes=${r.meshCount}`).join('\n'));
console.log('REQUIRED',Math.max(...rows.map(r=>r.clearInnerDepthWith20cmMargins)),Math.max(...rows.map(r=>r.clearInnerHeightWith15cmMargins)));
