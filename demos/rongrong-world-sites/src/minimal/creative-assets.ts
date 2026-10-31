import type {Point,MinimalAnimal} from './model.ts';
export const CREATIVE_ASSET_KINDS=['custom-egg','custom-creature','prop'] as const;
export type CreativeAssetKind=typeof CREATIVE_ASSET_KINDS[number];
export type CreativeEgg={stage:'blank'|'configured'|'ready';incubation?:{requiredMs:number;elapsedMs:number;checkedAt:number}};
export type CreativeAsset={egg?:CreativeEgg;id:string;kind:CreativeAssetKind;templateId:string;name:string;prompt:string;createdAt:number;jobId:string;origin:'mock';location:'bag'|'ground';position?:Point;hatchedAt?:number;/** Canonical lifecycle while in the bag; ground lifecycle lives in state.animals. */animal?:MinimalAnimal};
export type CreativeJob={id:string;kind:'creature'|'prop';templateId:string;name:string;prompt:string;status:'queued'|'image-ready'|'model-pending'|'ready'|'claimed'|'failed';createdAt:number;updatedAt:number;assetId?:string};
export type CreativeInventory={version:1;assets:CreativeAsset[];jobs:CreativeJob[]};
export type CreativeTemplate={id:string;kind:'creature'|'prop';name:string;portraitUrl:string;model:{status:'missing'}|{status:'ready';url:string;sha256:string;source:'hunyuan-generated'|'authored-demo'};mock:true};
/** Catalog is a trusted release input, not a model URL accepted from the browser. */
export const CREATIVE_CATALOG:readonly CreativeTemplate[]=[
 {id:'poop-pal',kind:'creature',name:'便便小伙伴',portraitUrl:'/ugc/poop-reference.png',model:{status:'ready',url:'/ugc/poop-pal.glb',sha256:'3b9533e8afc97ecd2efd86c6ab1d4cb07843d0882ac5f7d358c180a8ac3dd2e8',source:'hunyuan-generated'},mock:true},
 {id:'wish-tree',kind:'prop',name:'许愿松树',portraitUrl:'/ugc/wish-tree-hy.png',model:{status:'ready',url:'/ugc/wish-tree-hy.glb',sha256:'c111d109a0c64b4074ad494349a5d992c9ca78668fc20972682d579d91a5cb33',source:'hunyuan-generated'},mock:true},
 {id:'moon-rock',kind:'prop',name:'月亮圆石',portraitUrl:'/ugc/moon-rock-hy.png',model:{status:'ready',url:'/ugc/moon-rock-hy.glb',sha256:'bda09d449197b71bdfaefd296eb06a601c3e07b410e1c3a3d8252064f020d281',source:'hunyuan-generated'},mock:true},
 {id:'wish-bush',kind:'prop',name:'团团灌木',portraitUrl:'/ugc/wish-bush-hy.png',model:{status:'ready',url:'/ugc/wish-bush-hy.glb',sha256:'555c87f147b455fa79186f756b1410de38631b8952cde39dd340796ff6471329',source:'hunyuan-generated'},mock:true},
];
export const EMPTY_CREATIVE=():CreativeInventory=>({version:1,assets:[],jobs:[]});
export function creativeTemplate(catalog:readonly CreativeTemplate[],id:string){return catalog.find(template=>template.id===id);}
export function creativeModelReady(template:CreativeTemplate|undefined):boolean{return !!template&&template.model.status==='ready'&&/^\/(?!\/)[a-zA-Z0-9_./-]+\.glb$/.test(template.model.url)&&/^[a-f0-9]{64}$/.test(template.model.sha256);}

/** Explicit release admission, not inferred from a GLB filename or an inspection provider.
 * This fixed sample reuses the existing pig care rules; its render identity stays UGC. */
export type CreativeAnimalIdentity={assetId:string;templateId:string;modelSha256:string};
export function approvedCreativeAnimalTemplate(template:CreativeTemplate|undefined):boolean{
 const released=CREATIVE_CATALOG.find(t=>t.id==='poop-pal');
 return !!template&&template.kind==='creature'&&template.id===released?.id&&creativeModelReady(template)&&template.model.status==='ready'&&released.model.status==='ready'&&template.model.url===released.model.url&&template.model.sha256===released.model.sha256&&template.model.source===released.model.source;
}
export function approvedCreativeAnimal(animal:{id?:unknown;species:unknown;creative?:CreativeAnimalIdentity},catalog:readonly CreativeTemplate[]=CREATIVE_CATALOG):boolean{
 if(!animal.creative)return false;const template=creativeTemplate(catalog,animal.creative.templateId);
 return approvedCreativeAnimalTemplate(template)&&animal.id===animal.creative.assetId&&animal.species==='pig'&&template?.model.status==='ready'&&animal.creative.modelSha256===template.model.sha256;
}

/** A purchased egg may select only an explicitly shipped fixed sample, never browser/inspection models. */
export function approvedCreativeTemplate(template:CreativeTemplate|undefined):boolean{
 const released=CREATIVE_CATALOG.find(t=>t.id===template?.id);
 return !!template&&!!released&&template.kind===released.kind&&creativeModelReady(template)&&template.model.status==='ready'&&released.model.status==='ready'&&template.model.url===released.model.url&&template.model.sha256===released.model.sha256&&template.model.source===released.model.source;
}
/** Read-only projection; only the authority persists elapsed time or grants a hatch. */
export function creativeEggProgress(asset:CreativeAsset,now:number){
 const clock=asset.egg?.incubation;
 const elapsedMs=clock?Math.min(clock.requiredMs,clock.elapsedMs+(asset.location==='ground'?Math.max(0,now-clock.checkedAt):0)):0;
 return {elapsedMs,remainingMs:clock?Math.max(0,clock.requiredMs-elapsedMs):0,progress:clock&&clock.requiredMs>0?elapsedMs/clock.requiredMs:0,ready:asset.egg?.stage==='ready'&&asset.location==='ground'&&!!clock&&elapsedMs>=clock.requiredMs};
}
