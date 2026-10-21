import assert from 'node:assert/strict';
import test from 'node:test';
import { AvatarRenderGate, withAvatarLoadTimeout } from '../lib/club-avatar-submission.ts';
test('success waits for the matching rendered receipt, not preload or command completion', async () => {
 const gate = new AvatarRenderGate(), token = gate.begin()!; let settled = false;
 const done = gate.waitForRender({ token, id: 'me', preset: 'banana-cat' }).then(value => { settled = true; return value; });
 assert.equal(gate.begin(), null); await Promise.resolve(); assert.equal(settled, false);
 gate.report({ token, id: 'other', preset: 'banana-cat', status: 'ready' });
 gate.report({ token, id: 'me', preset: 'milk-frog', status: 'ready' });
 await Promise.resolve(); assert.equal(settled, false);
 gate.report({ token, id: 'me', preset: 'banana-cat', status: 'ready' }); assert.equal(await done, true); gate.finish(token);
 assert.notEqual(gate.begin(), null); gate.cancel();
});
test('cancelled/late/failed receipts never complete a newer submission', async () => {
 const gate = new AvatarRenderGate(); const token = gate.begin()!; const old = gate.waitForRender({ token, id:'me', preset:'banana-cat' }); gate.cancel(); assert.equal(await old, false);
 const next = gate.begin()!; let settled = false; const done = gate.waitForRender({ token:next, id:'me', preset:'banana-cat' }).then(value => { settled=true; return value; });
 gate.report({ token, id:'me', preset:'banana-cat', status:'ready' }); await Promise.resolve(); assert.equal(settled,false);
 gate.report({ token:next, id:'me', preset:'banana-cat', status:'failed' }); assert.equal(await done,false); gate.finish(next);
});
test('render timeout returns failure and permits a deliberate retry', async () => {
 const gate = new AvatarRenderGate(); const token = gate.begin()!;
 assert.equal(await gate.waitForRender({token,id:'me',preset:'banana-cat'}, 5),false); gate.finish(token); assert.notEqual(gate.begin(),null); gate.cancel();
});

test('background visibility pauses render and preload deadlines without inventing failure', async()=>{
 const gate = new AvatarRenderGate(); gate.setPaused(true); const token=gate.begin()!; let settled=false;
 const pending=gate.waitForRender({token,id:'me',preset:'banana-cat'},10).then(value=>{settled=true;return value;});
 await new Promise(resolve=>setTimeout(resolve,25)); assert.equal(settled,false); gate.setPaused(false);
 gate.report({token,id:'me',preset:'banana-cat',status:'ready'}); assert.equal(await pending,true); gate.finish(token);
 let loaded!:()=>void; const loading=new Promise<void>(resolve=>{loaded=resolve;}); const listeners=new Set<()=>void>();
 const visibility={hidden:true,addEventListener(_type:string,cb:()=>void){listeners.add(cb);},removeEventListener(_type:string,cb:()=>void){listeners.delete(cb);}};
 const warm=withAvatarLoadTimeout(loading,10,visibility); await new Promise(resolve=>setTimeout(resolve,25)); visibility.hidden=false; for(const notify of listeners)notify(); loaded(); await warm; assert.equal(listeners.size,0);
});
