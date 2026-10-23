import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,currentProfile,commandEstate,type Estate} from '../src/v5/estate.ts';
const now=1_800_000_000_000;
function command(s:Estate,type:string,data:Record<string,unknown>={},at=now){return commandEstate(s,{id:`${type}-${at}`,type,session:currentProfile(s).session,...data},at);}
function ready(){let s=createEstate('feed-actions',now);let p=currentProfile(s);p.tutorial='done';p.threat=null;s=command(s,'enter').state;p=currentProfile(s);p.position={...p.animals[0].position};return s;}
test('feed selects an unoccupied side contact, not animal centre, before starting the three-second clock',()=>{
 const s=ready(),a=currentProfile(s).animals[0],r=command(s,'feed',{target:a.id},now+1);assert.equal(r.accepted,true);
 const p=currentProfile(r.state);assert.ok(Math.hypot(p.job!.to.x-a.position.x,p.job!.to.z-a.position.z)>=.8);assert.equal(p.job!.progress,0);assert.equal(p.inventory.hand,3);
});
test('backgrounding cancels uncommitted feed and clears route without consuming food',()=>{
 let s=ready();s=command(s,'feed',{target:'pipi'},now+1).state;s=command(s,'pulse',{presentationPaused:true},now+300).state;
 assert.equal(currentProfile(s).job,null);assert.deepEqual(currentProfile(s).path,[]);assert.equal(currentProfile(s).inventory.hand,3);
});
test('a long absence cannot resurrect a stale feeding pose or charge later',()=>{
 let s=ready();s=command(s,'feed',{target:'pipi'},now+1).state;s=command(s,'pulse',{},now+20000).state;
 assert.equal(currentProfile(s).job,null);assert.equal(currentProfile(s).inventory.hand,3);
 for(let i=1;i<=6;i++)s=command(s,'pulse',{},now+20000+i*500).state;
 assert.equal(currentProfile(s).inventory.hand,3);
});
