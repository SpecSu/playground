/** Offline scene-graph export, NOT a browser/WebGL screenshot. No browser process used. */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const out=path.resolve('../dance-stage-work/checkpoints/stage-architecture.glb');
let source=fs.readFileSync(new URL('../src/stage.js',import.meta.url),'utf8');
source=source.replace(/renderer = new THREE\.WebGLRenderer\([^\n]+\);/, 'renderer = globalThis.offlineRenderer;');
source=source.replace(/const pmrem = new THREE\.PMREMGenerator\(renderer\);[\s\S]*?room\.dispose\(\); pmrem\.dispose\(\);/, 'const env = { texture: null, dispose(){} };');
const temp=new URL('./.offline-stage-temp.mjs',import.meta.url);fs.writeFileSync(temp,source);
globalThis.window={devicePixelRatio:1};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
const noop=()=>{};globalThis.offlineRenderer={domElement:{style:{},setAttribute:noop,addEventListener:noop,removeEventListener:noop,remove:noop},shadowMap:{},setPixelRatio:noop,setSize:noop,render:noop,dispose:noop,info:{render:{calls:0,triangles:0},memory:{textures:0,geometries:0}}};
globalThis.FileReader=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.()}async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onloadend?.()}};
try{
 const {createStage}=await import(temp.href+'?'+Date.now());const stage=createStage({append:noop,clientWidth:390,clientHeight:693});
 const approximations=[{type:'HemisphereLight / PMREM / FogExp2',approximation:'Not represented in GLB; neutral world fill needed in Blender'}];stage.scene.traverse(object=>{if(object.material?.isShaderMaterial){const original=object.material;const tint=original.uniforms.tint?.value||new THREE.Color('white');const opacity=original.uniforms.opacity?.value??original.uniforms.strength?.value??.03;object.material=new THREE.MeshBasicMaterial({color:tint,transparent:true,opacity:Math.min(.07,opacity),depthWrite:false,side:THREE.DoubleSide});approximations.push({type:object.geometry.type,approximation:'shader radial/beam gradient replaced by uniform transparent emission',opacity:Math.min(.07,opacity)});}});
 stage.scene.traverse(o=>{if(o.isDirectionalLight){o.lookAt(o.target.getWorldPosition(new THREE.Vector3()));o.target.position.set(0,0,-1);o.add(o.target);}if(o.isHemisphereLight)o.visible=false;});
 stage.scene.add(stage.camera);stage.camera.name='RuntimeLobbyCamera';stage.scene.updateMatrixWorld(true);
 const data=await new GLTFExporter().parseAsync(stage.scene,{binary:true,onlyVisible:true,trs:false});fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,Buffer.from(data));
 const report={source:'src/stage.js direct scene construction; renderer/PMREM stubbed only for offline export',notWebGLScreenshot:true,approximations,environment:'PMREM omitted; Blender must use equivalent neutral studio fill',camera:{position:stage.camera.position.toArray(),quaternion:stage.camera.quaternion.toArray(),fov:stage.camera.fov,aspect:stage.camera.aspect},file:out,bytes:data.byteLength};fs.writeFileSync(out.replace('.glb','.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 stage.setMode('playing');for(let i=0;i<180;i++)stage.update(1/60,16);stage.camera.name='RuntimeGameCamera';stage.scene.updateMatrixWorld(true);const gameData=await new GLTFExporter().parseAsync(stage.scene,{binary:true,onlyVisible:true,trs:false});const gamePath=out.replace('.glb','-game.glb');fs.writeFileSync(gamePath,Buffer.from(gameData));const gameReport={...report,file:gamePath,bytes:gameData.byteLength,camera:{position:stage.camera.position.toArray(),quaternion:stage.camera.quaternion.toArray(),fov:stage.camera.fov,aspect:stage.camera.aspect}};fs.writeFileSync(gamePath.replace('.glb','.json'),JSON.stringify(gameReport,null,2));console.log(JSON.stringify(gameReport));stage.dispose();
}finally{fs.unlinkSync(temp)}
