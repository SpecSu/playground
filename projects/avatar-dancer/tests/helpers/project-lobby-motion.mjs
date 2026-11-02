import fs from 'node:fs';import * as T from 'three';
import {loadGeometry} from './load-rig.mjs';
import {normalizeCharacterBind,createRootMotionLock,stageCameraFraming} from '../../src/stage.js';
import {createInputMotionController} from '../../src/input-motion.js';
const output=process.argv[2]||'qa/input-motion/projections.json',rows=[];
for(const name of (process.env.PROJECTION_MODELS?.split(',')||['jiji-0','lx-0','jiaxin-0'])){
 const g=await loadGeometry(name);normalizeCharacterBind(g.scene);g.scene.rotation.y=-Math.PI/2;const wrapper=new T.Group;wrapper.add(g.scene);
 let hips;g.scene.traverse(n=>{if(n.name.endsWith('Hips'))hips=n});const lock=createRootMotionLock(wrapper,hips),c=createInputMotionController(g.scene,g.animations);c.setMode('lobby');c.setBPM(Number(process.env.PROJECTION_BPM)||128);
 const f=stageCameraFraming('lobby',false,0),cam=new T.PerspectiveCamera(33,9/16,.05,80);cam.position.fromArray(f.position);cam.lookAt(...f.target);cam.updateMatrixWorld();
 const advance=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++){c.update(1/60);lock.apply()}};
 const snap=label=>{wrapper.updateMatrixWorld(true);const meshes=[];g.scene.traverse(m=>{if(!m.isMesh)return;m.skeleton?.update();const vertices=[],p=new T.Vector3;for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,p);p.applyMatrix4(m.matrixWorld).project(cam);vertices.push([p.x,p.y,p.z])}let parent=m,isHead=false;while(parent){if(/HEAD|CANONICAL/.test(parent.name))isHead=true;parent=parent.parent}meshes.push({vertices,indices:Array.from(m.geometry.index?.array||vertices.map((_,i)=>i)),head:isHead})});rows.push({name,label,bpm:Number(process.env.PROJECTION_BPM)||128,meshes})};
 let elapsed=0;for(const time of [0,1.8,3.3,4,4.6,6.5,9]){advance(time-elapsed);elapsed=time;snap(time.toFixed(1)+'s / LOBBY')}
}
fs.writeFileSync(output,JSON.stringify(rows));console.log(output);
