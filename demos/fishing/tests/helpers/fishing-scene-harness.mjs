import '../room-loader.mjs';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as worldModule from '../../lib/fishing-world.ts';
import * as cameraModule from '../../lib/fishing-camera.ts';
import * as typesModule from '../../lib/fishing-types.ts';
import * as rodModule from '../../lib/fishing-rod.ts';
import * as marineModule from '../../components/fishing/MarineModels.ts';
import {createFishingAvatar} from '../../lib/fishing-avatar.ts';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {uploadedAvatar} from './uploaded-avatar.mjs';
import {UPLOADED_AVATAR_PRESETS} from '../../lib/room-types.ts';
const templates=new Map();

/** Only the unavailable WebGL/DOM/React host is replaced. Event listeners, RAF body,
 * camera math, scene graph, marine meshes and state projection are production code. */
export async function fishingSceneHarness(initial={}) {
 for(const kind of new Set([...(initial.participants??[]),...(initial.ambientParticipants??[]),...(initial.qaTemplates??[]).map(preset=>({preset}))].map(p=>p.preset))){if(!templates.has(kind)){if(UPLOADED_AVATAR_PRESETS.includes(kind)){templates.set(kind,await uploadedAvatar(kind));continue;}const bytes=readFileSync(new URL(`../../public/avatars/${kind}.glb`,import.meta.url));templates.set(kind,(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);}}
 const source=readFileSync(new URL('../../components/fishing/YachtScene.tsx',import.meta.url),'utf8');
 const actionsPath=new URL('../../lib/fishing-action-motion.ts',import.meta.url);
 const ambientPath=new URL('../../lib/fishing-ambient.ts',import.meta.url);
 const inputPath=new URL('../../lib/fishing-camera-input.ts',import.meta.url);
 const modules={
  '@/lib/fishing-confetti':await import('../../lib/fishing-confetti.ts'),'@/lib/fishing-catalog':await import('../../lib/fishing-catalog.ts'),
  '@/lib/fishing-chat':await import('../../lib/fishing-chat.ts'),'@/lib/fishing-own-marker':await import('../../lib/fishing-own-marker.ts'),
  '@/lib/fishing-catch-motion':await import('../../lib/fishing-catch-motion.ts'),
  '@/lib/fishing-sea-life':await import('../../lib/fishing-sea-life.ts'),
  '@/lib/fishing-world':worldModule,'@/lib/fishing-camera':cameraModule,
  '@/lib/fishing-seat-motion':await import('../../lib/fishing-seat-motion.ts'),'@/lib/fishing-types':typesModule,'./MarineModels':marineModule,'@/lib/fishing-rod':rodModule,
  ...(existsSync(ambientPath)?{'@/lib/fishing-ambient':await import(ambientPath.href)}:{}),
  ...(existsSync(actionsPath)?{'@/lib/fishing-action-motion':await import(actionsPath.href)}:{}),
  ...(existsSync(inputPath)?{'@/lib/fishing-camera-input':await import(inputPath.href)}:{}),
 };
 let now=initial.qaNow??1_800_000_000_000,time=100,rafId=0,refIndex=0,stateIndex=0,effectIndex=0,renderer,world;
 const refs=[],states=[],effects=[],pending=[],rafs=new Map(),renders=[],catchJobs=new Set();
 class Element extends EventTarget {
  _text='';get textContent(){return this._text+this.children.map(child=>child.textContent??'').join('');}set textContent(value){this._text=String(value);this.children=[];}
  style={};children=[];clientWidth=390;clientHeight=758;captured=new Set();attributes={};className='';inert=false;
  classList={add:()=>{},remove:()=>{}};
  appendChild(child){this.children.push(child);child.parent=this;return child;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  setAttribute(key,value){this.attributes[key]=value;}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){if(this.captured.delete(id))this.dispatchEvent(pointer('lostpointercapture',{pointerId:id}));}
  closest(){return this.inert?this:null;}
 }
 const document=new EventTarget();document.hidden=false;document.createElement=()=>new Element();
 const window=new EventTarget();window.devicePixelRatio=1;window.document=document;
 const host=new Element(),labels=new Element();
 class Renderer {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  constructor(){renderer=this;this.domElement=new Element();this.shadowMap={};}
  setPixelRatio(){} setSize(){} dispose(){this.disposed=true;}
  render(scene,camera){if(initial.qaDrawMeshes?.()!==false)scene.traverseVisible(node=>{if(node.isMesh)node.onAfterRender(this,scene,camera,node.geometry,node.material,null);});renders.push({position:camera.position.clone(),quaternion:camera.quaternion.clone(),camera:camera.clone()});this.camera=camera;this.scene=scene;}
 }
 const react={
  useRef(value){return refs[refIndex++]??(refs[refIndex-1]={current:value});},
  useState(value){const i=stateIndex++;if(!(i in states))states[i]=value;return [states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},
  useEffect(fn,deps){const i=effectIndex++,previous=effects[i];if(!previous||deps.some((d,j)=>!Object.is(d,previous.deps[j])))pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()};});},
 };
 const jsx=(type,props)=>{if(props.ref&&props.className==='yacht-canvas')props.ref.current=host;if(props.ref&&props.className==='yacht-labels')props.ref.current=labels;return {type,props};};
 const context=vm.createContext({exports:{},require:id=>{
  if(id==='react')return react;if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(id==='three')return {...THREE,WebGLRenderer:Renderer};
  if(id==='@/lib/fishing-world')return {...worldModule,createYachtWorld:()=>{world=worldModule.createYachtWorld();return world;}};
  if(id==='@/lib/fishing-avatar')return {createFishingAvatar:(kind,id)=>{if(!templates.has(kind))throw new Error(`Missing offline avatar template: ${kind}`);const actual=createFishingAvatar(kind,id,{template:templates.get(kind)}),avatar=initial.qaCreateAvatar?initial.qaCreateAvatar(actual,kind,id):initial.qaAvatarLoaded===false?{...actual,loaded:false}:actual;
   // Track the real asynchronous API without replacing its solver or geometry.
   if(avatar.prepareCatchAsync){const prepare=avatar.prepareCatchAsync.bind(avatar);avatar.prepareCatchAsync=(...args)=>{const job=prepare(...args);catchJobs.add(job);void job.then(()=>catchJobs.delete(job),()=>catchJobs.delete(job));return job;};}return avatar;}};
  if(!(id in modules))throw new Error(`Missing harness dependency: ${id}`);return modules[id];
 },window,document,Event,AbortController,queueMicrotask,console,
 Date:class extends Date {static now(){return now;}},
 requestAnimationFrame:fn=>{const id=++rafId;rafs.set(id,fn);return id;},cancelAnimationFrame:id=>rafs.delete(id),
 ResizeObserver:class{observe(){}disconnect(){}},
 });
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context,{filename:'YachtScene.tsx'});
 let props={participants:[],ownId:null,serverOffsetMs:0,cameraMode:'overview',reducedMotion:true,enabled:true,...initial};
 function render(patch={}){props={...props,...patch};refIndex=stateIndex=effectIndex=0;const tree=context.exports.default(props);while(pending.length)pending.shift()();return tree;}
 function step(ms=34){time+=ms;now+=ms;const list=[...rafs.values()];rafs.clear();for(const fn of list)fn(time);}
 function pointer(type,patch={}){const event=new Event(type,{cancelable:true,bubbles:true});Object.assign(event,{pointerId:1,pointerType:'touch',button:0,isPrimary:true,clientX:150,clientY:300,buttons:type==='pointerup'?0:1,...patch});return event;}
 async function settleCatches(){while(catchJobs.size)await Promise.allSettled([...catchJobs]);}
 render();step();
 if(catchJobs.size&&!initial.qaCreateAvatar){await settleCatches();step();}
 return {host,labels,document,window,renders,render,step,settleCatches,pointer,get canvas(){return renderer.domElement;},get camera(){return renderer.camera;},get world(){return world;},get props(){return props;},now:()=>now,
  event(type,patch={}){const event=pointer(type,patch);renderer.domElement.dispatchEvent(event);return event;},
  frames(count=60){for(let i=0;i<count;i++)step();},
  dispose(){for(const effect of effects)effect?.cleanup?.();},
 };
}
export function participant(phase='idle',overrides={}) {
 return {id:'self',name:'小浪',preset:'cat',slot:0,joinedAt:1,lastSeenAt:1_800_000_000_000,
 fishing:{phase,castId:'cast-1',castAt:1_799_999_990_000,biteAt:1_800_000_010_000,expiresAt:1_800_000_013_000,
 ...(phase==='holding'?{catch:{id:'catch-1',speciesId:'clownfish',lengthCm:14,weightKg:.08,caughtAt:1_799_999_998_000}}:{}),...overrides}};
}
