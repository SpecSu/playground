import type {LunarShowcaseDefinition,LunarShowcaseRecord} from './lunar-showcase-contract.ts';
import {SCHOOL_PLAYGROUND_LAYOUT} from './playground-layout.ts';
export type PlaygroundRunSpec=Readonly<{modelSha256:string;clip:'run';normalizationScale:number;duration:number;strideMeters:number;groundOffset:number;bodyRadius:number;stanceFraction:number;leftPhase:0;rightPhase:.5;flight:readonly Readonly<{from:number;to:number}>[];reportRef:string}>;
/** A true run has separate support and flight windows. It is not an alias for
 * the farm's walk or a caller-controlled speed multiplier. Final spec is compiled. */
export function validatePlaygroundRun(record:LunarShowcaseRecord,run:PlaygroundRunSpec):PlaygroundRunSpec{
 const assertRun=(v:unknown)=>{if(!v)throw new Error('A verified red-scarf run is required');},finite=(v:number)=>Number.isFinite(v),near=(a:number,b:number)=>Math.abs(a-b)<1e-7;
 assertRun(record.id==='red-scarf-person'&&run?.clip==='run'&&run.modelSha256===record.model.sha256);
 assertRun(finite(run.normalizationScale)&&run.normalizationScale===record.profile.normalizationScale&&record.profile.bodyRadius<=SCHOOL_PLAYGROUND_LAYOUT.runnerRadius);
 assertRun(finite(run.duration)&&run.duration>=.2&&run.duration<=2&&finite(run.strideMeters)&&run.strideMeters>.05&&run.strideMeters<=2);
 assertRun(finite(run.groundOffset)&&run.groundOffset>=0&&run.groundOffset<=.005&&finite(run.bodyRadius)&&run.bodyRadius>0&&run.bodyRadius<=SCHOOL_PLAYGROUND_LAYOUT.runnerRadius);
 assertRun(finite(run.stanceFraction)&&run.stanceFraction>.1&&run.stanceFraction<.5&&run.leftPhase===0&&run.rightPhase===.5);
 assertRun(Array.isArray(run.flight)&&run.flight.length===2&&near(run.flight[0].from,run.stanceFraction)&&near(run.flight[0].to,.5)&&near(run.flight[1].from,.5+run.stanceFraction)&&near(run.flight[1].to,1));
 assertRun(typeof run.reportRef==='string'&&run.reportRef.length>0&&!/(\.\.|:\/\/|\/workspace\/|\/Users\/)/.test(run.reportRef));
 return Object.freeze({...run,flight:Object.freeze(run.flight.map(f=>Object.freeze({...f})))});
}
/** Separate scene admission for the same identity and exact derivative bytes.
 * Keeps the original lunar action menu unchanged; its loader validates the real
 * run's articulated tracks/root policy just like every other admitted clip. */
export function playgroundRunRecord(record:LunarShowcaseRecord,spec:PlaygroundRunSpec):LunarShowcaseRecord{
 const run=validatePlaygroundRun(record,spec),d=structuredClone(record) as LunarShowcaseDefinition;
 if(d.profile.actions.some(a=>a.id==='playground-run'||a.clip==='run'))throw new Error('Duplicate playground run action');
 d.profile.actions.push({id:'playground-run',label:'操场跑步',clip:run.clip,duration:run.duration,cycles:1,kind:'gesture'});d.verification.carry=false;d.verification.reportRef=run.reportRef;return d;
}
