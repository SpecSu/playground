/** Only the explicitly prepared anonymous-local deployment may replace cow/bunny.
 * Hosted/account entrypoints never call prepare; their five legacy assets stay intact. */
export type LocalTargetSpecies='cow'|'bunny';
export type LocalFootEnvelope={side:number;front:number;back:number};
export type LocalMotionProfile={stride:number;muzzleReach:number;cyclesPerSecond:number;feet:LocalFootEnvelope;walkFeet:LocalFootEnvelope;walkContactFeet:LocalFootEnvelope;reachAdjustment:{back:number;forward:number;pondForward?:number}};
export type LocalAnimalProfile={motion:LocalMotionProfile;drinkDatum:{x:number;y:number;z:number};interactionRadius:number;transferUnderside:number;water:{bowlAvailable:boolean;bowlMinimumScale:number;bowlNearSideOffsetWorld:number;bowlWaterHeight:.177|.183};provenance:Readonly<Record<string,unknown>>};
export type LocalAnimalSelection={species:LocalTargetSpecies;sha256:string;bytes:number;url:string;portrait?:{url:string;sha256:string;bytes:number}|null;profile:LocalAnimalProfile};
export type LocalAnimalManifest={schema:'local-existing-animal-deployment/v1';revision:string;selected:Partial<Record<LocalTargetSpecies,LocalAnimalSelection>>};
const freeze=<T>(value:T):Readonly<T>=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');}
function validateSelection(s:LocalAnimalSelection,species:string){
 if(!s||s.species!==species||!['cow','bunny'].includes(species)||!/^[a-f0-9]{64}$/.test(s.sha256)||!Number.isSafeInteger(s.bytes)||s.bytes<=0||s.bytes>32*1024*1024)throw new Error('Invalid selected local model identity');
 if(!s.url.startsWith('/models/farm/local/')||!s.url.endsWith('.glb')||/[\\%?#\s]/.test(s.url)||s.url.includes('//')||s.url.split('/').some(p=>p==='.'||p==='..'))throw new Error('Selected model must use a new immutable local asset path');
 if(s.portrait&&(!/^[a-f0-9]{64}$/.test(s.portrait.sha256)||!Number.isSafeInteger(s.portrait.bytes)||s.portrait.bytes<33||s.portrait.bytes>2*1024*1024||s.portrait.url!==`/models/farm/local/${species}-${s.sha256}.png`))throw new Error('Portrait must bind selected GLB identity and actual PNG SHA/bytes');
 const p=s.profile,m=p?.motion,positive=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0,nonnegative=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 if(!m||![m.stride,m.muzzleReach,m.cyclesPerSecond,p.interactionRadius].every(positive)||!nonnegative(p.transferUnderside)||!p.drinkDatum||!['x','y','z'].every(k=>Number.isFinite(p.drinkDatum[k as keyof typeof p.drinkDatum])))throw new Error('Incomplete finite selected model profile');
 for(const key of ['feet','walkFeet','walkContactFeet'] as const)if(!m[key]||!['side','front','back'].every(k=>nonnegative(m[key][k as keyof LocalFootEnvelope])))throw new Error('Incomplete measured foot envelope');
 if(!m.reachAdjustment||![m.reachAdjustment.back,m.reachAdjustment.forward].every(nonnegative)||m.reachAdjustment.pondForward!==undefined&&!nonnegative(m.reachAdjustment.pondForward))throw new Error('Incomplete selected reach policy');
 for(const key of ['side','front','back'] as const)if(m.walkContactFeet[key]>m.walkFeet[key]+1e-6)throw new Error('Contact feet exceed full walking envelope');
 if(!p.water||typeof p.water.bowlAvailable!=='boolean'||!positive(p.water.bowlMinimumScale)||!nonnegative(p.water.bowlNearSideOffsetWorld)||p.water.bowlNearSideOffsetWorld>=.225*Math.cos(Math.PI/20)-1e-6||![.177,.183].includes(p.water.bowlWaterHeight)||!p.provenance||!Object.keys(p.provenance).length)throw new Error('Invalid actual bowl surface/design policy');
}
export function createLocalAnimalDeployment(input:LocalAnimalManifest|null){
 const manifest=input===null?null:structuredClone(input);if(manifest){if(manifest.schema!=='local-existing-animal-deployment/v1'||!manifest.revision||!manifest.selected||Object.keys(manifest.selected).some(s=>!['cow','bunny'].includes(s)))throw new Error('Invalid local deployment manifest');for(const [species,s]of Object.entries(manifest.selected))validateSelection(s!,species);freeze(manifest);}
 let state:'legacy'|'loading'|'ready'|'failed'='legacy',legacyConsumed=false,pending:Promise<void>|undefined;const verified=new Map<LocalTargetSpecies,Uint8Array>();
 const get=(species:string):Readonly<LocalAnimalSelection>|null=>{const selected=manifest?.selected[species as LocalTargetSpecies];if(!selected)return null;if(state==='legacy'){legacyConsumed=true;return null;}if(state!=='ready')throw new Error('Selected local animal deployment unavailable; no legacy/profile fallback');return selected;};
 return {manifest,get,status:()=>state,
  async prepare(loadBytes:(selection:Readonly<LocalAnimalSelection>)=>Promise<Uint8Array>,validate:(species:LocalTargetSpecies,bytes:Uint8Array)=>Promise<void>){
   if(!manifest||!Object.keys(manifest.selected).length)return;if(state==='ready')return;if(pending)return pending;if(legacyConsumed)throw new Error('Cannot switch an already consumed legacy deployment in place');state='loading';
   pending=(async()=>{const prepared=new Map<LocalTargetSpecies,Uint8Array>();for(const s of Object.values(manifest.selected)){if(!s)continue;const loaded=await loadBytes(s);if(!(loaded instanceof Uint8Array))throw new Error('Selected asset loader returned no actual bytes');const bytes=Uint8Array.from(loaded);if(bytes.length!==s.bytes||await digest(bytes)!==s.sha256)throw new Error(`Selected ${s.species} byte identity mismatch`);if(await validate(s.species,bytes)!==undefined)throw new Error('Actual asset validator must return void');prepared.set(s.species,bytes);}prepared.forEach((bytes,species)=>verified.set(species,bytes));state='ready';})().catch(error=>{verified.clear();state='failed';throw error;}).finally(()=>{pending=undefined;});return pending;
  },
  bytes(species:string){const s=get(species);return s?verified.get(s.species)!.slice():null;},
 };
}
