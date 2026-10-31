/** Preparation only: this registry is deliberately separate from active Species,
 * egg pools, saves and asset providers. No real asset is enabled by this file. */
export const HUNYUAN_SPECIES=['alpaca','bear','capybara','bunny','cat','chicken','cow','crocodile','deer','penguin'] as const;
export type HunyuanSpecies=typeof HUNYUAN_SPECIES[number];
export type HunyuanVariant=`hunyuan:${HunyuanSpecies}`;
type HunyuanTheme='grassland'|'forest'|'wetland'|'desert'|'glacier';
type HunyuanFamily='hoof'|'pawed'|'hopper'|'groundbird'|'sprawlingreptile'|'penguin';
type FootChain={upper:string;lower:string;foot:string};
export type HunyuanDescriptor={
 readonly variant:HunyuanVariant;readonly status:'pending';readonly label:string;
 readonly family:HunyuanFamily;readonly theme:HunyuanTheme;
 readonly clips:readonly string[];readonly anchors:readonly string[];
 readonly neckChain:readonly string[];readonly footChains:readonly Readonly<FootChain>[];
};
const clips=Object.freeze(['idle','walk','drink_enter','drink_loop','drink_exit','eat','rest','carried','react']);
function descriptor(species:HunyuanSpecies,label:string,family:HunyuanFamily,theme:HunyuanTheme,biped=false,suffix='foot'):HunyuanDescriptor{
 const sides=biped?['L','R']:['front_L','front_R','back_L','back_R'];
 return Object.freeze({variant:`hunyuan:${species}` as const,status:'pending',label,family,theme,clips,
  anchors:Object.freeze(['feeding-mouth','animal-support','animal-head','animal-ground',`${species}_head`]),
  neckChain:Object.freeze([`${species}_neck_01`,`${species}_neck_02`,`${species}_head`]),
  footChains:Object.freeze(sides.map(side=>Object.freeze({upper:`${species}_${side}_upper`,lower:`${species}_${side}_lower`,foot:`${species}_${side}_${suffix}`}))),
 });
}
/** Names match inspected donor GLBs. Family does NOT determine the foot suffix. */
export const HUNYUAN_DESCRIPTORS:Readonly<Record<HunyuanSpecies,HunyuanDescriptor>>=Object.freeze({
 alpaca:descriptor('alpaca','羊驼','hoof','desert'),
 bear:descriptor('bear','小熊','pawed','forest'),
 capybara:descriptor('capybara','水豚','pawed','wetland'),
 bunny:descriptor('bunny','兔子','hopper','forest',false,'paw'),
 cat:descriptor('cat','小猫','pawed','forest'),
 chicken:descriptor('chicken','小鸡','groundbird','grassland',true),
 cow:descriptor('cow','奶牛','hoof','grassland',false,'hoof'),
 crocodile:descriptor('crocodile','鳄鱼','sprawlingreptile','wetland'),
 deer:descriptor('deer','小鹿','hoof','grassland'),
 penguin:descriptor('penguin','企鹅','penguin','glacier',true),
});
/** Future proposal only. Legacy animals/saves are not removed by these pools. */
export const PROPOSED_HUNYUAN_POOLS=Object.freeze({
 grassland:Object.freeze(['cow','deer','chicken'] as const),forest:Object.freeze(['bear','bunny','cat'] as const),
 wetland:Object.freeze(['capybara','crocodile'] as const),desert:Object.freeze(['alpaca'] as const),glacier:Object.freeze(['penguin'] as const),
});
export const HUNYUAN_ASSET_CHECKS=['export-preservation','production-rig','visual-anatomy'] as const;
export const HUNYUAN_RUNTIME_CHECKS=['runtime-integration','terrain-contact','carry-placement','picking','care-interruption','save-compatibility','mobile-performance'] as const;
type EvidenceCheck={status:'passed'|'failed';candidateSha256:string;sourceSha256:string;reportRef:string};
export type HunyuanPromotionTarget={kind:'local'|'hosted';id:string;runtimeRevision:string};
type TargetReceipt=HunyuanPromotionTarget&{
 materializedPath:string;assetUrl:string;observedSha256:string;observedBytes:number;verificationRef:string;
 checks:Record<typeof HUNYUAN_RUNTIME_CHECKS[number],EvidenceCheck&{runtimeRevision:string}>;
};
export type HunyuanPromotionEvidence={
 schema:1;variant:HunyuanVariant;species:HunyuanSpecies;
 source:{kind:'hunyuan-download';species:HunyuanSpecies;originalSha256:string;reducedSha256:string;identityConfirmed:boolean;identityReportRef:string;reductionReportRef:string};
 artifact:{sha256:string;bytes:number;triangles:number;bones:number;draws:number;maxTextureDimension:number};
 rig:{clips:string[];anchors:string[];neckChain:string[];footChains:FootChain[];rigidSoleVertices:Record<string,number>;skinnedMeshes:number;unskinnedMeshes:number;maxInfluences:number;normalizedWeights:boolean};
 checks:Record<typeof HUNYUAN_ASSET_CHECKS[number],EvidenceCheck>;
 targets:TargetReceipt[];
};
/** No downloaded candidate has consumer-local, production-ready evidence here. */
export const HUNYUAN_PROMOTION_MANIFEST:Readonly<Partial<Record<HunyuanVariant,HunyuanPromotionEvidence>>>=Object.freeze({});
export type HunyuanPromotionAssessment={
 status:'ready'|'blocked';reasons:string[];
 asset?:{variant:HunyuanVariant;url:string;sha256:string};
};
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const record=(value:unknown):Record<string,unknown>=>object(value)?value:{};
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const uniqueStrings=(value:unknown):value is string[]=>Array.isArray(value)&&Array.from(value).every(text)&&new Set(value).size===value.length;
const contains=(value:unknown,required:readonly string[])=>uniqueStrings(value)&&required.every(name=>value.includes(name));
const exact=(value:unknown,required:readonly string[])=>uniqueStrings(value)&&value.length===required.length&&value.every((name,i)=>name===required[i]);
function passed(value:unknown,candidateSha256:unknown,sourceSha256:unknown,runtimeRevision?:unknown):boolean{
 const proof=record(value);
 return proof.status==='passed'&&proof.candidateSha256===candidateSha256&&proof.sourceSha256===sourceSha256&&text(proof.reportRef)&&(runtimeRevision===undefined||proof.runtimeRevision===runtimeRevision);
}
function validRig(value:unknown,expected:HunyuanDescriptor):boolean{
 const rig=record(value),soles=record(rig.rigidSoleVertices);
 if(!contains(rig.clips,expected.clips)||!contains(rig.anchors,expected.anchors)||!exact(rig.neckChain,expected.neckChain))return false;
 if(!integer(rig.skinnedMeshes)||rig.unskinnedMeshes!==0||!integer(rig.maxInfluences)||rig.maxInfluences>4||rig.normalizedWeights!==true)return false;
 if(!Array.isArray(rig.footChains)||rig.footChains.length!==expected.footChains.length||Object.keys(soles).length!==expected.footChains.length)return false;
 const chains=rig.footChains.map(record);
 return expected.footChains.every(chain=>{
  const matches=chains.filter(item=>item.foot===chain.foot),count=soles[chain.foot];
  return matches.length===1&&matches[0].upper===chain.upper&&matches[0].lower===chain.lower&&integer(count)&&count>=3;
 });
}

/** Fail-closed checklist for TRUSTED build evidence, not a GLB validator.
 * The producer/consumer must actually inspect source/model bytes, run the strict
 * validators, render the animal, and verify the served asset before recording a
 * receipt. This function does no I/O and cannot authenticate a fabricated report.
 * Never call it on user-supplied save/UGC metadata to confer species authority. */
export function assessHunyuanPromotion(species:unknown,manifest:unknown,target:unknown):HunyuanPromotionAssessment{
 const reasons:string[]=[],blocked=():HunyuanPromotionAssessment=>({status:'blocked',reasons});
 if(typeof species!=='string'||!Object.hasOwn(HUNYUAN_DESCRIPTORS,species)){reasons.push('unknown-species');return blocked();}
 const expected=HUNYUAN_DESCRIPTORS[species as HunyuanSpecies],requested=record(target);
 if((requested.kind!=='local'&&requested.kind!=='hosted')||!text(requested.id)||!text(requested.runtimeRevision)){reasons.push('invalid-target');return blocked();}
 if(!object(manifest)||!Object.hasOwn(manifest,expected.variant)||!object(manifest[expected.variant])){reasons.push('missing-evidence');return blocked();}
 const evidence=manifest[expected.variant] as Record<string,unknown>,source=record(evidence.source),artifact=record(evidence.artifact);
 if(evidence.schema!==1||evidence.variant!==expected.variant||evidence.species!==species)reasons.push('variant-identity-mismatch');
 if(source.kind!=='hunyuan-download'||source.species!==species||source.identityConfirmed!==true||!hash(source.originalSha256)||!hash(source.reducedSha256)||!text(source.identityReportRef)||!text(source.reductionReportRef))reasons.push('source-provenance-unverified');
 if(!hash(artifact.sha256)||artifact.sha256===source.reducedSha256)reasons.push('candidate-identity-invalid');
 const caps={bytes:4*1024*1024,triangles:species==='cow'||species==='bunny'?40000:18000,bones:64,draws:12,maxTextureDimension:1024};
 for(const [metric,cap]of Object.entries(caps)){const value=artifact[metric];if(!integer(value)||value>cap)reasons.push(`artifact-budget:${metric}`);}
 if(!validRig(evidence.rig,expected))reasons.push('production-rig-contract');
 const checks=record(evidence.checks);
 for(const check of HUNYUAN_ASSET_CHECKS)if(!passed(checks[check],artifact.sha256,source.reducedSha256))reasons.push(`asset-check:${check}`);
 const receipts=Array.isArray(evidence.targets)?evidence.targets.map(record).filter(item=>item.kind===requested.kind&&item.id===requested.id):[];
 if(receipts.length!==1){reasons.push(receipts.length?'duplicate-target-receipts':'target-unavailable');return blocked();}
 const receipt=receipts[0],url=hash(artifact.sha256)?`/models/farm/hunyuan/${species}-${artifact.sha256}.glb`:'';
 if(receipt.runtimeRevision!==requested.runtimeRevision)reasons.push('target-runtime-mismatch');
 if(receipt.observedSha256!==artifact.sha256||receipt.observedBytes!==artifact.bytes)reasons.push('target-bytes-mismatch');
 if(!text(receipt.materializedPath)||!receipt.materializedPath.startsWith('/')||!text(receipt.verificationRef))reasons.push('target-materialization-unverified');
 if(receipt.assetUrl!==url)reasons.push('target-url-mismatch');
 const runtimeChecks=record(receipt.checks);
 for(const check of HUNYUAN_RUNTIME_CHECKS)if(!passed(runtimeChecks[check],artifact.sha256,source.reducedSha256,requested.runtimeRevision))reasons.push(`runtime-check:${check}`);
 if(reasons.length)return blocked();
 return {status:'ready',reasons,asset:{variant:expected.variant,url,sha256:artifact.sha256 as string}};
}

export type HunyuanDemoMobileEvidence={status:'passed'|'unmeasured';candidateSha256:string;sourceSha256:string;runtimeRevision:string;reportRef:string;reason?:string};
export type HunyuanDemoAdmissionAssessment={status:'demo-ready'|'blocked';reasons:string[];asset?:HunyuanPromotionAssessment['asset'];mobilePerformance?:HunyuanDemoMobileEvidence};
/** Separate TRUSTED-build demo admission, never a production pass. Reuse every
 * original strict check without rewriting its result/evidence. Only an explicitly
 * unmeasured mobile result may replace the sole mobile-performance blocker.
 * Report references remain trusted evidence, not authenticated by this pure check. */
export function assessHunyuanDemoAdmission(species:unknown,manifest:unknown,target:unknown):HunyuanDemoAdmissionAssessment{
 const production=assessHunyuanPromotion(species,manifest,target);
 if(production.status==='blocked'&&(production.reasons.length!==1||production.reasons[0]!=='runtime-check:mobile-performance'))return {status:'blocked',reasons:production.reasons};
 const expected=HUNYUAN_DESCRIPTORS[species as HunyuanSpecies],evidence=record(record(manifest)[expected.variant]),artifact=record(evidence.artifact),source=record(evidence.source),requested=record(target);
 const receipt=(evidence.targets as unknown[]).map(record).find(item=>item.kind===requested.kind&&item.id===requested.id)!,mobile=record(record(receipt.checks)['mobile-performance']);
 if(production.status!=='ready'&&!(mobile.status==='unmeasured'&&mobile.candidateSha256===artifact.sha256&&mobile.sourceSha256===source.reducedSha256&&mobile.runtimeRevision===requested.runtimeRevision&&text(mobile.reportRef)&&text(mobile.reason)))return {status:'blocked',reasons:production.reasons};
 const mobilePerformance:HunyuanDemoMobileEvidence={status:mobile.status as 'passed'|'unmeasured',candidateSha256:artifact.sha256 as string,sourceSha256:source.reducedSha256 as string,runtimeRevision:requested.runtimeRevision as string,reportRef:mobile.reportRef as string,...(mobile.status==='unmeasured'?{reason:mobile.reason as string}:{})};
 return {status:'demo-ready',reasons:[],asset:production.asset??{variant:expected.variant,url:receipt.assetUrl as string,sha256:artifact.sha256 as string},mobilePerformance};
}
