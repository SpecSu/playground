/** Rebuild after fish geometry/motion changes. Unit world length; all yaw is covered by vertex radius. */
import fs from 'node:fs';import * as THREE from 'three';
import{createFishPresentation}from'../lib/art/fish-presentation.js';import{FISH_STANDARD_SIZES_CM}from'../lib/art/fish-sizing.js';
const rows={};for(const[id,standard]of Object.entries(FISH_STANDARD_SIZES_CM)){
 const p=createFishPresentation({speciesId:id,lengthCm:standard,worldLength:1,instanceId:'envelope-'+id}),v=new THREE.Vector3();let radius=0,halfHeight=0,halfLength=0,halfWidth=0;
 for(let i=0;i<128;i++){p.animate(i/128*32);p.root.updateMatrixWorld(true);p.root.traverse(n=>{if(!n.isMesh)return;const a=n.geometry.getAttribute('position');for(let k=0;k<a.count;k++){v.fromBufferAttribute(a,k).applyMatrix4(n.matrixWorld);radius=Math.max(radius,Math.hypot(v.x,v.z));halfHeight=Math.max(halfHeight,Math.abs(v.y));halfLength=Math.max(halfLength,Math.abs(v.x));halfWidth=Math.max(halfWidth,Math.abs(v.z));}});}
 rows[id]={radius:Math.ceil(radius*1.005*1e5)/1e5,halfHeight:Math.ceil(halfHeight*1.005*1e5)/1e5,halfLength:Math.ceil(halfLength*1.005*1e5)/1e5,halfWidth:Math.ceil(halfWidth*1.005*1e5)/1e5};p.dispose();
}
fs.writeFileSync(new URL('../lib/game/fish-space-profiles.js',import.meta.url),'// Generated from actual vertices, 128 appendage samples over32s; radius covers any yaw. Extra0.5% envelope margin.\nexport const FISH_SPACE_PROFILES=Object.freeze('+JSON.stringify(rows,null,1)+');\n');
