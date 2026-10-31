import {HUNYUAN_DESCRIPTORS} from './hunyuan-promotion.ts';

export type SampledBowlStanding={kind:'sampled-center-distance';localSlack:number;samples:readonly Readonly<{scale:number;centerDistance:number}>[]};
export type SampledPondStanding={kind:'sampled-local-reach';localSlack:number;samples:readonly Readonly<{scale:number;reach:number}>[]};
type FootEnvelope={side:number;front:number;back:number};
export type AnimalMotionProfile={stride:number;muzzleReach:number;cyclesPerSecond:number;feet:FootEnvelope;walkFeet:FootEnvelope;walkContactFeet:FootEnvelope;reachAdjustment:{back:number;forward:number;pondForward?:number};bowlStanding?:SampledBowlStanding;pondStanding?:SampledPondStanding};
export type AlpacaMeasuredProfile={candidateSha256:string;motion:AnimalMotionProfile;drinkDatum:{x:number;y:number;z:number};height:number;interactionRadius:number;transferUnderside:number;portraitUrl?:string};
export type HunyuanMainSpecies='alpaca'|'penguin';
function mainDescriptor(species:HunyuanMainSpecies){requireThat(species==='alpaca'||species==='penguin','unsupported main-farm species');return HUNYUAN_DESCRIPTORS[species];}
function requireThat(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(`Alpaca: ${message}`);}
function record(value:unknown,label:string):Record<string,unknown>{requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),`${label} must be an object`);return value as Record<string,unknown>;}
function finite(value:unknown,label:string,minimum=-Infinity,exclusive=false):number{requireThat(typeof value==='number'&&Number.isFinite(value)&&(exclusive?value>minimum:value>=minimum),`${label} must be finite and ${exclusive?'greater than':'at least'} ${minimum}`);return value;}
/** Measurements are supplied by reviewed candidate-local evidence, never inferred
 * here or defaulted to donor values. This validates consistency, not provenance. */
export function assertAlpacaMeasuredProfile(input:unknown,sha256:string):asserts input is AlpacaMeasuredProfile{assertHunyuanMainMeasuredProfile(input,sha256,'alpaca');}
/** The two new main-farm species share measurement invariants, not measurements. */
export function assertHunyuanMainMeasuredProfile(input:unknown,sha256:string,species:HunyuanMainSpecies):asserts input is AlpacaMeasuredProfile{
 mainDescriptor(species);
 requireThat(/^[a-f0-9]{64}$/.test(sha256),'expected SHA256 is invalid');
 const p=record(input,'profile');requireThat(p.candidateSha256===sha256,'profile candidate SHA256 mismatch');
 const motion=record(p.motion,'motion'),drink=record(p.drinkDatum,'drinkDatum'),reach=record(motion.reachAdjustment,'reachAdjustment');
 for(const key of ['stride','muzzleReach','cyclesPerSecond'])finite(motion[key],key,0,true);
 for(const key of ['height','interactionRadius'])finite(p[key],key,0,true);
 const height=p.height as number;
 finite(p.transferUnderside,'transferUnderside',0);requireThat((p.transferUnderside as number)<=height,'transferUnderside exceeds height');
 finite(drink.x,'drinkDatum.x');finite(drink.y,'drinkDatum.y',0);finite(drink.z,'drinkDatum.z',0,true);
 requireThat((drink.y as number)<=height,'drink datum exceeds height');
 requireThat(Math.abs((drink.z as number)-(motion.muzzleReach as number))<=1e-6,'drink datum z does not match muzzleReach');
 for(const key of ['back','forward'])finite(reach[key],`reachAdjustment.${key}`,0);
 if(reach.pondForward!==undefined)finite(reach.pondForward,'reachAdjustment.pondForward',0);
 requireThat((motion.muzzleReach as number)-(reach.back as number)>0,'minimum reach must be positive');
 if(motion.pondStanding!==undefined){
  requireThat(species==='alpaca','pondStanding is only supported for alpaca');const policy=record(motion.pondStanding,'pondStanding');requireThat(policy.kind==='sampled-local-reach','unknown pondStanding kind');
  finite(policy.localSlack,'pondStanding.localSlack',0);requireThat((policy.localSlack as number)<=.02,'pondStanding slack exceeds explicit 2 cm trial budget');
  requireThat(Array.isArray(policy.samples)&&policy.samples.length===4,'pondStanding requires four explicit source samples');
  const scales=[.6,.75,1,2.2];for(let i=0;i<scales.length;i++){const sample=record(policy.samples[i],'pondStanding sample');requireThat(sample.scale===scales[i],'pondStanding scale sequence mismatch');finite(sample.reach,'pondStanding preferred reach',policy.localSlack as number,true);}
 }
 if(motion.bowlStanding!==undefined){
  const policy=record(motion.bowlStanding,'bowlStanding');requireThat(policy.kind==='sampled-center-distance','unknown bowlStanding kind');
  finite(policy.localSlack,'bowlStanding.localSlack',0);requireThat((policy.localSlack as number)<=.02,'bowlStanding slack exceeds explicit 2 cm trial budget');
  requireThat(Array.isArray(policy.samples)&&policy.samples.length===4,'bowlStanding requires four explicit source samples');
  const scales=[.6,.75,1,2.2];let previous=0;
  for(let index=0;index<scales.length;index++){const sample=record(policy.samples[index],'bowlStanding sample');requireThat(sample.scale===scales[index],'bowlStanding scale sequence mismatch');const center=finite(sample.centerDistance,'bowlStanding centerDistance',.21375,true);requireThat(center>previous,'bowlStanding centers must increase');previous=center;}
 }
 const feet=record(motion.feet,'feet'),walk=record(motion.walkFeet,'walkFeet'),contact=record(motion.walkContactFeet,'walkContactFeet');
 for(const key of ['side','front','back']){
  finite(feet[key],`feet.${key}`,0);finite(walk[key],`walkFeet.${key}`,0);finite(contact[key],`walkContactFeet.${key}`,0);
  requireThat((contact[key] as number)<=(walk[key] as number)+1e-6,'walkContactFeet exceeds walkFeet');
 }
 if(p.portraitUrl!==undefined)requireThat(typeof p.portraitUrl==='string'&&new RegExp(`^/models/farm/hunyuan/portraits/${species}-${sha256}\\.(png|jpg|jpeg|webp)$`).test(p.portraitUrl),'portrait must be candidate-bound same-origin new art');
}

