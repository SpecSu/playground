import {createHash} from 'node:crypto';
import {lunarLoaderFixture} from './lunar-showcase-fixture.ts';
/** Synthetic articulated parser fixture only. It is NOT evidence of a real running gait. */
export async function playgroundFixture(){
 const f=await lunarLoaderFixture(),source=Buffer.from(f.bytes),jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());json.animations.push({...structuredClone(json.animations[1]),name:'run'});const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);const tail=source.subarray(20+jsonLength),out=Buffer.alloc(20+padded.length+tail.length);source.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);padded.copy(out,20);tail.copy(out,20+padded.length);const bytes=new Uint8Array(out),sha=createHash('sha256').update(bytes).digest('hex');f.record.id='red-scarf-person';f.record.profile.bodyRadius=.35;f.record.model={...f.record.model,sha256:sha,bytes:bytes.length};
 return {bytes,record:f.record,run:{modelSha256:sha,clip:'run' as const,normalizationScale:1,duration:1,strideMeters:.4,groundOffset:0,bodyRadius:.35,stanceFraction:.28,leftPhase:0 as const,rightPhase:.5 as const,flight:[{from:.28,to:.5},{from:.78,to:1}],reportRef:'tests/synthetic-run-contract'}};
}
