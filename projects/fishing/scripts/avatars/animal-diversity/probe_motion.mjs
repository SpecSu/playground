// Offline actual-skinned-vertex verification. Does not launch browser/audio.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createClubAvatar} from '../../../lib/club-avatar-rig.ts';
const directory = process.argv[2] ?? resolve('public/avatars');
const output = process.argv[3];
const point = new THREE.Vector3();
const report = [];
for(const kind of ['cat','frog','dog','capybara','panda']){
 const bytes=readFileSync(resolve(directory,`${kind}.glb`));
 const source=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 const avatar=createClubAvatar(kind,`species-probe:${kind}`,{template:source});
 const result={kind,height:avatar.height,modes:[]};
 for(const mode of ['dance','bounce','wave','spin','unison','battle','grid','group-wave','train','manual']){
  const metric={mode,minY:Infinity,maxRadius:0,minLabelGap:Infinity,worstFloorBeat:0,worstRadiusBeat:0};
  for(let step=0;step<48;step++){
   const beat=step/12;
   const group=['unison','battle','grid','group-wave','train'].includes(mode)?{kind:mode==='group-wave'?'wave':mode,version:2,phase:'perform',beat,weight:1,wave:(1-Math.cos(beat*Math.PI*2))/2,activation:1}:undefined;
   const d=step*.025;
   const motion=['train','manual'].includes(mode)?{slot:0,x:0,z:d,heading:0,distance:d,speed:.8,walkBlend:1,action:'dance',sampleAtDistance:distance=>({x:0,z:distance,heading:0})}:undefined;
   avatar.root.position.set(0,0,motion?.z??0);
   avatar.update(beat,['dance','bounce','wave','spin'].includes(mode)?mode:'dance',false,1,motion,group);
   let peak=0;
   avatar.root.traverseVisible(node=>{if(!(node instanceof THREE.Mesh))return;for(let i=0;i<node.geometry.attributes.position.count;i++){
    node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld);
    if(point.y<metric.minY){metric.minY=point.y;metric.worstFloorBeat=beat;}
    const radius=Math.hypot(point.x,point.z-(motion?.z??0));
    if(radius>metric.maxRadius){metric.maxRadius=radius;metric.worstRadiusBeat=beat;}
    peak=Math.max(peak,point.y);
   }});
   metric.minLabelGap=Math.min(metric.minLabelGap,avatar.labelHeight-peak);
  }
  result.modes.push(metric);
 }
 avatar.dispose();report.push(result);
}
console.log(JSON.stringify(report,null,2));
if(output)writeFileSync(output,JSON.stringify(report,null,2));
