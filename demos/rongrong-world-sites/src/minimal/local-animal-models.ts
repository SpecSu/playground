import {UNKNOWN_LOCAL_ANIMAL_PORTRAIT,verifyLocalPortraitBytes} from './local-animal-portrait.ts';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {createLocalAnimalDeployment,type LocalAnimalSelection} from './local-animal-deployment.ts';
import {LOCAL_ANIMAL_MANIFEST} from './local-animal-manifest.ts';
/** Build-time opt-in for the separate anonymous Mac demo; hosted V27 defaults off. */
export const localAnimalModelsRequested=()=>((import.meta as ImportMeta&{env?:Record<string,string>}).env?.VITE_LOCAL_ANIMAL_MODELS==='1');
const deployment=createLocalAnimalDeployment(LOCAL_ANIMAL_MANIFEST),templates=new Map<string,GLTF>(),portraits=new Map<string,string>();
export const selectedLocalAnimalPortrait=(species:string)=>deployment.get(species)?portraits.get(species)??UNKNOWN_LOCAL_ANIMAL_PORTRAIT:null;
export const selectedLocalAnimal=(species:string)=>deployment.get(species);
export function selectedLocalAnimalTemplate(species:string){const selected=deployment.get(species);if(!selected)return null;const template=templates.get(species);if(!template)throw new Error('Selected verified template unavailable; no old model fallback');return template;}
export const selectedLocalAnimalBytes=(species:string)=>deployment.bytes(species);
export const localAnimalDeploymentStatus=()=>deployment.status();
/** Explicit anonymous-local startup only. Account/Worker flows do not call this. */
export async function prepareLocalAnimalModels(loadBytes:(selection:Readonly<LocalAnimalSelection>)=>Promise<Uint8Array>=async selection=>{const response=await fetch(selection.url,{credentials:'same-origin',redirect:'error',cache:'no-cache'});if(!response.ok)throw new Error(`Local ${selection.species} model unavailable (${response.status})`);return new Uint8Array(await response.arrayBuffer());}){
 const {validateLocalAnimalBytes,disposeLocalAnimalTemplate}=await import('./local-animal-validation.ts');
 try{await deployment.prepare(loadBytes,async(species,bytes)=>{const template=await validateLocalAnimalBytes(species,bytes,deployment.manifest!.selected[species]!.profile,typeof document!=='undefined');templates.set(species,template);});if(typeof document!=='undefined')for(const selection of Object.values(deployment.manifest!.selected)){if(!selection?.portrait||portraits.has(selection.species))continue;let url:string|undefined;try{const response=await fetch(selection.portrait.url,{credentials:'same-origin',redirect:'error',cache:'no-cache'});if(!response.ok)continue;const bytes=new Uint8Array(await response.arrayBuffer());await verifyLocalPortraitBytes(bytes,selection.portrait);url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));const img=new Image();img.src=url;await img.decode();portraits.set(selection.species,url);url=undefined;}catch{/* Unknown/unavailable portrait stays neutral, never old animal imagery. */}finally{if(url)URL.revokeObjectURL(url);}}}catch(error){templates.forEach(disposeLocalAnimalTemplate);templates.clear();throw error;}
}
