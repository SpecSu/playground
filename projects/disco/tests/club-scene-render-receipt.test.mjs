import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {observeAvatarDraw} from '../lib/club-avatar-render-receipt.ts';
const source=readFileSync(new URL('../components/ClubScene.tsx',import.meta.url),'utf8');
const start=source.indexOf('          const request = snapshot.avatarRenderRequest;', source.indexOf('selfMarker?.update'));
const end=source.indexOf('          // Capture synchronously after render:',start);
assert.ok(start>0&&end>start);
const js=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const events=[]; const root=new THREE.Group(); const mesh=new THREE.Mesh(); root.add(mesh); const actor={preset:'banana-cat',root:{visible:true},model:{loaded:true,root}};
 const snapshot={presentationVisible:true,avatarRenderRequest:{token:1,id:'me',preset:'banana-cat'},onAvatarRendered:r=>events.push(r)};
 const context=vm.createContext({observeAvatarDraw,snapshot,reportedAvatarToken:undefined,world:{scene:{},players:new Map([['me',actor]])},camera:{},renderer:{render(){events.push('render'); if (actor.root.visible) mesh.onAfterRender();}}});
 return {events,actor,snapshot,context,draw(){vm.runInContext(`{${js}}`,context);}};
}
test('production scene sends one success only after a successful render of the installed visible requested avatar',()=>{
 const f=fixture(); f.actor.model.loaded=false; f.draw(); assert.deepEqual(f.events,['render']);
 f.actor.model.loaded=true; f.actor.root.visible=false; f.draw(); assert.equal(f.events.length,2);
 f.actor.root.visible=true; f.snapshot.presentationVisible=false; f.draw(); assert.equal(f.events.length,3);
 f.snapshot.presentationVisible=true; f.draw(); assert.equal(f.events[3],'render'); assert.equal(f.events[4].status,'ready');
 f.draw(); assert.equal(f.events.length,6,'a later frame does not emit a duplicate receipt');
});
test('render errors and an old visible replacement cannot announce readiness',()=>{
 const f=fixture(); f.actor.preset='milk-frog'; f.draw(); assert.deepEqual(f.events,['render']);
 f.actor.preset='banana-cat'; f.context.renderer.render=()=>{throw new Error('GPU failed');}; assert.throws(()=>f.draw(),/GPU failed/); assert.deepEqual(f.events,['render']);
});

test('the observer restores callbacks even on failure and a culled mesh has no receipt',()=>{
 const root=new THREE.Group(), mesh=new THREE.Mesh(); root.add(mesh); let calls=0; const original=()=>{calls++;}; mesh.onAfterRender=original;
 const hidden=observeAvatarDraw(root); assert.equal(hidden.drawn,false); hidden.restore(); assert.equal(mesh.onAfterRender,original);
 const shown=observeAvatarDraw(root); mesh.onAfterRender(); assert.equal(shown.drawn,true); assert.equal(calls,1); shown.restore(); assert.equal(mesh.onAfterRender,original);
});
