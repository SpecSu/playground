import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
// The optional isolated QA dependency is installed through the official Sites helper.
const domUrl=new URL('../../work/cpu-deps/node_modules/happy-dom/lib/index.js',import.meta.url);
export async function installFixture(){
 const {Window}=await import('happy-dom').catch(error=>{if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;return import(domUrl.href);});
 const w=new Window({url:'http://localhost/?name=twx'});
 const oldDate=Date.now,oldPerformance=globalThis.performance;let now=1_800_000_000_000,mono=1000;
 const performance=new Proxy(oldPerformance,{get(target,key){if(key==='now')return ()=>mono;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,localStorage:w.localStorage,getComputedStyle:w.getComputedStyle.bind(w),ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},performance,IS_REACT_ACT_ENVIRONMENT:true});
 Date.now=()=>now;w.HTMLCanvasElement.prototype.getContext=()=>null;
 Object.defineProperties(w.HTMLElement.prototype,{clientWidth:{get:()=>390,configurable:true},clientHeight:{get:()=>844,configurable:true}});
 const intervals=new Map();let next=1;w.setInterval=(fn,period)=>{const id=next++;intervals.set(id,{fn,period,next:mono+period});return id;};w.clearInterval=id=>intervals.delete(id);
 const hooks=registerHooks({load(url,c,next){
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export default {};'};
  if(url.endsWith('/avatars/club-avatar-rig.ts'))return {format:'module',shortCircuit:true,source:`import * as THREE from 'three';export function createClubAvatar(){return {root:new THREE.Group(),height:1.8,loaded:false,ready:Promise.resolve(),update(){},dispose(){}};}`};
  if(url.endsWith('/minimal/World.ts'))return {format:'module',shortCircuit:true,source:`import {MinimalWorld as Actual} from './World.ts?cpu-actual';export class MinimalWorld extends Actual{constructor(host,state,handlers){const canvas=document.createElement('canvas'),renderer={domElement:canvas,shadowMap:{},setPixelRatio(){},setSize(){},render(){},dispose(){}};super(host,state,handlers,()=>renderer);globalThis.__motionWorld=this;}}`};
  if(url.endsWith('/minimal/World.ts?cpu-actual')){const source=readFileSync(process.env.MOTION_BASELINE?new URL('../../work/World.teleport-baseline.ts.txt',import.meta.url):new URL(url),'utf8');return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};}
  if(process.env.MOTION_BASELINE&&url.endsWith('/minimal/canonical-presentation.ts'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL('../../work/canonical-presentation.teleport-baseline.ts.txt',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};
  if(url.endsWith('.tsx'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(process.env.MOTION_BASELINE&&url.endsWith('/minimal/MinimalApp.tsx')?new URL('../../work/MinimalApp.teleport-baseline.tsx.txt',import.meta.url):new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText};
  return next(url,c);
 }});
 const oldLoad=GLTFLoader.prototype.loadAsync;let loadedPoop=0,triangles=0;
 GLTFLoader.prototype.loadAsync=async function(url){
  const pathname=new URL(url,'http://localhost').pathname,path=new URL('../../public'+pathname,import.meta.url);
  if(!existsSync(path))throw new Error('CPU fixture cannot load '+pathname);
  const data=readFileSync(path),loader=new GLTFLoader();
  loader.register(()=>({name:'cpu-texture-decoder',loadTexture:async()=>new THREE.Texture()}));
  const gltf=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  if(pathname==='/ugc/poop-pal.glb'){loadedPoop++;gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});}
  return gltf;
 };
 return {w,get now(){return now;},get mono(){return mono;},world:()=>globalThis.__motionWorld,geometry:()=>({loadedPoop,triangles}),advance(ms){now+=ms;mono+=ms;for(const timer of intervals.values())while(mono+1e-6>=timer.next){timer.next+=timer.period;timer.fn();}},async dispose(){hooks.deregister();GLTFLoader.prototype.loadAsync=oldLoad;Date.now=oldDate;globalThis.performance=oldPerformance;delete globalThis.IS_REACT_ACT_ENVIRONMENT;await w.happyDOM.close();}};
}
export class MemoryRepository{
 rows=new Map();tail=Promise.resolve();
 transaction(work){const run=this.tail.then(async()=>{const next=structuredClone(this.rows),tx={get:async(table,key)=>structuredClone(next.get(`${table}:${key}`))??null,put:async(table,key,value)=>{next.set(`${table}:${key}`,structuredClone(value));},listOpenOffers:async()=>[]};const value=await work(tx);this.rows=next;return value;});this.tail=run.then(()=>{},()=>{});return run;}
}
