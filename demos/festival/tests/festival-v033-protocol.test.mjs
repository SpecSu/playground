import './room-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const {createFestivalService}=await import('../lib/festival-server.ts');
const {CANONICAL_AVATAR_PRESETS,resolveAvatarPreset}=await import('../lib/room-types.ts');
class MemoryStore{
 room=null;visits=new Map();
 async readState(id){return structuredClone({room:this.room,visit:this.visits.get(id)??null});}
 async ensureRoom(initial){this.room??=structuredClone(initial);}
 async ensureVisit(id,initial){if(!this.visits.has(id))this.visits.set(id,structuredClone(initial));}
 async commit(revision,next,id,sequence,visit){await Promise.resolve();if(this.room.revision!==revision||(visit&&this.visits.get(id).lastSequence!==sequence))return false;this.room=structuredClone(next);if(visit)this.visits.set(id,structuredClone(visit));return true;}
}
const command=(type,sequence,preset)=>({type,requestId:`v033-${type}-${sequence}`,sequence,name:'新朋友',preset});
test('every uploaded role is accepted for join and profile changes without changing human capacity or ambient count',async()=>{
 let now=1_800_000_000_000;const store=new MemoryStore(),service=createFestivalService(store,{now:()=>now});
 for(const [index,preset]of CANONICAL_AVATAR_PRESETS.entries()){
  now+=2000;const result=await service.command('self',command(index?'profile':'join',index+1,preset));
  assert.equal(result.participants[0].preset,preset);assert.equal(result.self.role,'participant');assert.equal(result.capacity,10);assert.equal(result.ambientParticipants.length,4);assert.equal(result.participants.length,1);
 }
 const again=await service.snapshot('other');assert.equal(again.participants[0].preset,'human-jiaxin');assert.equal(again.self.role,'visitor');
});
test('legacy saved profile identifiers stay readable and can migrate through a normal profile update',async()=>{
 let now=1_800_000_000_000;const service=createFestivalService(new MemoryStore(),{now:()=>now});
 const first=await service.command('self',command('join',1,'monster-blob'));assert.equal(resolveAvatarPreset(first.participants[0].preset),'feidudu');
 now+=2000;const next=await service.command('self',command('profile',2,'feidudu'));assert.equal(next.participants[0].preset,'feidudu');assert.equal(next.participants.length,1);
});
