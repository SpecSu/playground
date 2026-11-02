/** Offline real-skinned-mesh audit; --baseline locks the approved v0.3.0 solver. */
import '../tests/room-loader.mjs';
import * as THREE from 'three';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {uploadedAvatar} from '../tests/helpers/uploaded-avatar.mjs';
import {createFishingMeshClearanceProbe} from '../tests/helpers/fishing-mesh-clearance.mjs';
import {FISHING_AVATAR_CATALOG} from '../lib/fishing-avatar-catalog.ts';
import {sampleFishingAction} from '../lib/fishing-action-motion.ts';
if (process.argv.includes('--self-test')) {
 const box=new THREE.BoxGeometry(1,1,1),points=Array.from(box.attributes.position.array),bodyVertices=box.attributes.position.count;
 points.push(0,0,0,0,0,1,0,0,-1);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(Array.from(box.index.array));
 const indices=[],weights=[];for(let i=0;i<points.length/3;i++){indices.push(i<bodyVertices?0:1,0,0,0);weights.push(1,0,0,0);}
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 const torso=new THREE.Bone(),hand=new THREE.Bone();torso.name='spine';hand.name='hand_L';const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());mesh.add(torso,hand);mesh.bind(new THREE.Skeleton([torso,hand]));const root=new THREE.Group();root.add(mesh);
 const result=createFishingMeshClearanceProbe(root)();assert.equal(result.testedVertices,3);assert.equal(result.penetratingVertices,1);assert.ok(Math.abs(result.maxDepth-.5)<1e-6);console.log('Mesh-clearance probe self-test passed: interior vertex detected; front/back exterior vertices rejected.');process.exit(0);
}
const baseline=process.argv.includes('--baseline'), args=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const dir=new URL('../.local-qa/v031/',import.meta.url);mkdirSync(dir,{recursive:true});
const sourceUrl=new URL(baseline?'../.local-qa/v031/fishing-avatar-v030-baseline.ts':'../lib/fishing-avatar.ts',import.meta.url);
let source=readFileSync(sourceUrl,'utf8').replace(/from '\.\/([^']+)'/g,(_,path)=>`from '${new URL('../lib/'+path,import.meta.url).href}'`).replace("from 'three'",`from '${import.meta.resolve('three')}'`);
source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {createFishingAvatar}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const stages=[{name:'idle',state:{phase:'idle'},time:0}];
for(let ms=0;ms<=1540;ms+=70)stages.push({name:`cast-${ms}`,state:{phase:'waiting',castAt:1000},time:1000+ms});
stages.push({name:'waiting',state:{phase:'waiting',castAt:1000},time:4000});
for(const ms of [0,150,300,600])stages.push({name:`bite-${ms}`,state:{phase:'bite',castAt:1000,biteAt:5000},time:5000+ms});
for(let ms=0;ms<=1470;ms+=70)stages.push({name:`haul-${ms}`,state:{phase:'holding',catch:{caughtAt:7000}},time:7000+ms});
stages.push({name:'holding-small',state:{phase:'holding',catch:{caughtAt:7000}},time:10000,width:.352},{name:'holding-medium',state:{phase:'holding',catch:{caughtAt:7000}},time:10000,width:.9});
const report={baseline,source:sourceUrl.pathname,thresholdMetres:.01,measure:'Z-axis depth inside actual torso/head-weighted body triangles',samplesPerModel:stages.length,characters:[]};
for(const {id} of FISHING_AVATAR_CATALOG){
 if(args.length&&!args.includes(id))continue;
 const avatar=createFishingAvatar(id,'mesh-audit',{template:await uploadedAvatar(id)}),probe=createFishingMeshClearanceProbe(avatar.root);const frames=[];
 for(const stage of stages){avatar.updateFishing(stage.time/1000,stage.state.phase,false,stage.width??.352,sampleFishingAction(stage.state,stage.time));const result=probe();frames.push({stage:stage.name,...result});}
 frames.sort((a,b)=>b.maxDepth-a.maxDepth);const item={id,worstStage:frames[0].stage,maxDepth:frames[0].maxDepth,penetratingVerticesAtWorst:frames[0].penetratingVertices,framesWithPenetration:frames.filter(f=>f.penetratingVertices).length,testedVertices:frames[0].testedVertices,retainedBodyTriangles:frames[0].retainedBodyTriangles,palmsAtWorst:frames[0].palms,limbsAtWorst:frames[0].limbs,closedBodyRaysAtWorst:frames[0].closedBodyRays,openBodyRaysAtWorst:frames[0].openBodyRays,frames};report.characters.push(item);avatar.dispose();console.log(JSON.stringify({...item,frames:undefined}));writeFileSync(new URL(`${baseline?'baseline':'current'}-mesh-clearance.json`,dir),JSON.stringify(report,null,2));
}
