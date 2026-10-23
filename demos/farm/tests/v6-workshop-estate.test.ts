import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,currentProfile,commandEstate,settleEstate} from '../src/v5/estate.ts';
import {DEFAULT_PATTERN} from '../src/v5/workshop.ts';
const now=1_800_000_000_000;
test('first private cape survives estate roundtrip without spending or replacing animal identity',()=>{
 let s=createEstate('atelier-owner',now);let p=currentProfile(s);p.tutorial='done';p.threat=null;p.guardian='dog';const ids=p.animals.map(a=>a.id);
 const send=(type:string,extra:Record<string,unknown>={})=>{const r=commandEstate(s,{id:`${type}-${s.revision}`,type,session:currentProfile(s).session,...extra},now);assert.equal(r.accepted,true,r.message);s=r.state;};
 send('enter');send('workshop-draft',{recipe:'cape',animalId:ids[0],pattern:DEFAULT_PATTERN});
 p=currentProfile(s);send('workshop-craft',{workshopVersion:p.workshop!.version,worldVersion:p.layout.version});
 p=currentProfile(s);assert.equal(p.materials,60);const item=p.workshop!.items[0];
 send('workshop-apply',{itemId:item.id,workshopVersion:p.workshop!.version,worldVersion:p.layout.version});
 send('avatar',{avatar:'banana-cat'});s=settleEstate(JSON.parse(JSON.stringify(s)),now+10000);p=currentProfile(s);
 assert.equal(p.workshop!.equipment.cape,item.id);assert.deepEqual(p.animals.map(a=>a.id),ids);assert.equal(s.playerId,'atelier-owner');
});
test('unconnected generation records an honest unavailable task but cannot spend wool or change the scene',()=>{
 let s=createEstate('no-provider',now);let p=currentProfile(s);p.tutorial='done';p.threat=null;s=commandEstate(s,{id:'enter',type:'enter'},now).state;p=currentProfile(s);
 const before=p.materials,r=commandEstate(s,{id:'gen',type:'workshop-generate',prompt:'卷耳星空',session:p.session},now);
 assert.equal(r.accepted,false);assert.equal(currentProfile(r.state).materials,before);assert.equal(currentProfile(r.state).workshop?.jobs[0]?.status,'unavailable');assert.equal(currentProfile(r.state).workshop?.items.length,0);
});
