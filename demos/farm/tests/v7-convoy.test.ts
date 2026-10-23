import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createConvoy,applyConvoy,advanceConvoy,convoySnapshot,routeCells,type ConvoyCommand} from '../src/v7/convoy.ts';
import {ConvoyStore} from '../server/convoy-store.ts';
const epoch=1_800_000_000_000;
let serial=0;
const cmd=(type:string,extras:Partial<ConvoyCommand>={}):ConvoyCommand=>({id:`convoy-test-${++serial}`,type,...extras});
function room(){return createConvoy('test-room','carrier',epoch,'dog');}
function apply(s:ReturnType<typeof room>,device:string,type:string,extras:Partial<ConvoyCommand>={},now=epoch){return applyConvoy(s,device,cmd(type,{sequence:(s.members.find(m=>m.device===device)?.sequence??0)+1,...extras}),now);}

test('room gives stable distinct roles; a third identity and carrier guardian commands are denied',()=>{
 const s=room();assert.equal(apply(s,'guard','join').accepted,true);assert.equal(convoySnapshot(s,'guard',epoch).selfRole,'guard');
 assert.equal(apply(s,'outsider','join').accepted,false);assert.equal(apply(s,'carrier','ability').accepted,false);
 assert.equal(apply(s,'outsider','move',{x:4,z:4}).accepted,false);
});
test('closed route gate is real navigation blocking and guard must walk close to open it',()=>{
 const s=room();apply(s,'guard','join');assert.equal(apply(s,'guard','gate',{open:true}).accepted,false);
 assert.equal(apply(s,'carrier','move',{x:14,z:4}).accepted,false);
 assert.equal(apply(s,'guard','move',{x:7,z:4}).accepted,true);
 for(let t=500;t<=3500;t+=500){apply(s,'carrier','pulse',{},epoch+t);apply(s,'guard','pulse',{},epoch+t);}
 assert.equal(apply(s,'guard','gate',{open:true},Number.NaN).accepted,false);
 assert.equal(apply(s,'guard','gate',{open:true},epoch+3500).accepted,true);
 assert.equal(apply(s,'carrier','move',{x:14,z:4},epoch+3500).accepted,true);
});
test('selected short and covered routes differ in actual walk length and reject off-route positions',()=>{
 const s=room();assert.ok(routeCells('covered').length>routeCells('short').length);
 assert.equal(apply(s,'carrier','route',{route:'covered'}).accepted,true);
 assert.equal(apply(s,'carrier','move',{x:4,z:10}).accepted,true);
 assert.equal(apply(s,'carrier','move',{x:6,z:4}).accepted,false);
 assert.equal(apply(s,'carrier','move',{x:Infinity,z:4}).accepted,false);
});
test('movement is bounded by elapsed online time and cannot cross a closed wall',()=>{
 const s=room();apply(s,'guard','join');apply(s,'carrier','move',{x:7,z:4});advanceConvoy(s,epoch+100);
 assert.ok(s.carrier.x>2&&s.carrier.x<2.2);assert.equal(s.carrier.z,4);
 const before=s.elapsed;advanceConvoy(s,epoch-1);assert.equal(s.elapsed,before);
 advanceConvoy(s,epoch+60_000);assert.ok(s.elapsed<=5.001);assert.ok(s.carrier.x<=7);
});
test('explicit background pause freezes both roles; fresh reconnect never catches up offline time',()=>{
 const s=room();apply(s,'guard','join');apply(s,'carrier','pause');apply(s,'guard','pause');
 advanceConvoy(s,epoch+180_000);assert.equal(s.elapsed,0);
 apply(s,'carrier','pulse',{},epoch+180_000);assert.equal(s.elapsed,0);
 advanceConvoy(s,epoch+180_500);assert.ok(Math.abs(s.elapsed-.5)<1e-8);
 assert.equal(convoySnapshot(s,'carrier',epoch+180_500).guardControl,'npc');
});
test('a disconnected role becomes explicit NPC after grace and real rejoin resumes the same role',()=>{
 const s=room();apply(s,'guard','join');
 for(let t=1000;t<=6000;t+=1000)apply(s,'carrier','pulse',{},epoch+t);
 assert.equal(convoySnapshot(s,'carrier',epoch+6000).guardControl,'npc');
 apply(s,'guard','pulse',{},epoch+6000);assert.equal(convoySnapshot(s,'guard',epoch+6000).guardControl,'human');
 assert.equal(s.members.length,2);
});
test('guard actions check proximity, real cooldown and sequence; carrier cannot scout',()=>{
 const s=room();apply(s,'guard','join');assert.equal(apply(s,'carrier','scout').accepted,false);
 assert.equal(apply(s,'guard','scout').accepted,false);
 s.guard={...s.guard,x:10,z:4,path:[]};s.wolf={...s.wolf,x:11,z:4,path:[]};
 assert.equal(apply(s,'guard','ability').accepted,true);assert.equal(apply(s,'guard','ability').accepted,false);
 assert.equal(apply(s,'guard','move',{x:9,z:4,sequence:1}).accepted,false);
});
test('training cargo cannot win automatically; terminal timeout persists once and never gives farm rewards',()=>{
 const s=room();apply(s,'guard','join');
 for(let t=1000;t<=181_000;t+=1000){apply(s,'carrier','pulse',{},epoch+t);apply(s,'guard','pulse',{},epoch+t);}
 assert.equal(s.phase,'failed');assert.equal(s.elapsed,180);const result=structuredClone(s.result);
 apply(s,'carrier','pulse',{},epoch+300_000);assert.deepEqual(s.result,result);
 assert.equal(s.result?.reward,0);assert.equal(s.result?.assetTransfer,false);
});
test('SQLite receipts survive reopen, protect identity/sequence, and reject changed payload for same request',()=>{
 const dir=mkdtempSync(join(tmpdir(),'farm-convoy-'));const file=join(dir,'convoy.sqlite');let store=new ConvoyStore(file);
 try{
  const create=cmd('create',{guardian:'cat'}),first=store.command('device-a',create,epoch);assert.equal(first.accepted,true);const roomId=first.snapshot!.room.id;
  const joined=store.command('device-b',cmd('join',{roomId}),epoch);assert.equal(joined.snapshot!.selfRole,'guard');
  const move=cmd('move',{roomId,sequence:1,x:4,z:4});assert.equal(store.command('device-a',move,epoch).accepted,true);
  store.close();store=new ConvoyStore(file);const repeat=store.command('device-a',move,epoch+500);assert.equal(repeat.duplicate,true);
  assert.equal(store.command('device-a',{...move,x:6},epoch+500).accepted,false);
  assert.equal(store.command('device-c',cmd('join',{roomId}),epoch+500).accepted,false);
  assert.equal(store.get('device-c',roomId,epoch+500).snapshot,null);
  assert.equal(store.get('device-b',roomId,epoch+500).snapshot!.selfRole,'guard');
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('repeated forward move commands retain the current segment without a backwards nearest-cell snap',()=>{
 const s=room();apply(s,'guard','join');let last=2;
 for(let t=0;t<2500;t+=50){apply(s,'carrier','move',{x:7,z:4},epoch+t);assert.ok(s.carrier.x>=last-1e-8);assert.equal(s.carrier.z,4);last=s.carrier.x;}
 assert.ok(last>3);
});
test('stop command stops between cells instead of walking back to the nearest grid node',()=>{
 const s=room();apply(s,'guard','join');apply(s,'carrier','move',{x:7,z:4});apply(s,'carrier','pulse',{},epoch+170);
 const p={x:s.carrier.x,z:s.carrier.z};assert.equal(apply(s,'carrier','stop',{},epoch+170).accepted,true);
 apply(s,'carrier','pulse',{},epoch+570);assert.equal(s.carrier.x,p.x);assert.equal(s.carrier.z,p.z);
});
test('cart cannot traverse the closed gate even after carrier command retries',()=>{
 const s=room();apply(s,'guard','join');apply(s,'carrier','move',{x:7,z:4});
 for(let t=100;t<=9000;t+=100){apply(s,'carrier','pulse',{},epoch+t);apply(s,'guard','pulse',{},epoch+t);}
 assert.ok(s.carrier.x<=7);assert.ok(s.cart.x<=7);assert.equal(s.gates.short,false);assert.equal(apply(s,'carrier','move',{x:14,z:4},epoch+9000).accepted,false);
});
test('a cooperative run requires a real gate opening; arrival creates a single persistent training result',()=>{
 const s=room();apply(s,'guard','join');apply(s,'carrier','move',{x:7,z:4});apply(s,'guard','move',{x:7,z:4});
 let commanded=false;
 for(let t=100;t<=60000&&s.phase==='active';t+=100){
  apply(s,'carrier','pulse',{},epoch+t);apply(s,'guard','pulse',{},epoch+t);
  if(!s.gates.short&&Math.hypot(s.guard.x-8,s.guard.z-4)<=1.5){assert.equal(apply(s,'guard','gate',{open:true},epoch+t).accepted,true);apply(s,'carrier','move',{x:14,z:4},epoch+t);commanded=true;}
  if(s.gates.short&&s.guard.path.length===0)apply(s,'guard','move',{x:Math.round(s.cart.x+1),z:Math.round(s.cart.z)},epoch+t);
  if(s.elapsed>=6&&Math.hypot(s.guard.x-s.wolf.x,s.guard.z-s.wolf.z)<=4&&s.elapsed>=s.cooldownUntil)apply(s,'guard','ability',{},epoch+t);
 }
 assert.equal(commanded,true);assert.equal(s.phase,'success');assert.equal(s.result?.reward,0);const result=structuredClone(s.result);
 apply(s,'carrier','move',{x:2,z:4},epoch+70000);assert.deepEqual(s.result,result);
});
test('clock partitioning produces the same trajectory and result; polling faster does not accelerate gameplay',()=>{
 const a=room(),b=room();for(const s of [a,b]){apply(s,'guard','join');apply(s,'carrier','move',{x:7,z:4});}
 advanceConvoy(a,epoch+1000);for(let t=50;t<=1000;t+=50)advanceConvoy(b,epoch+t);
 assert.ok(Math.abs(a.carrier.x-b.carrier.x)<1e-8);assert.ok(Math.abs(a.elapsed-b.elapsed)<1e-8);
});

test('convoy uses the real orthographic projection for canvas ground taps across viewport sizes',async()=>{
 const THREE=await import('three');const {EstateCameraController}=await import('../src/v5/isometric-camera.ts');const {convoyGroundHit}=await import('../src/v7/ConvoyWorld.ts');
 for(const [width,height]of [[390,844],[390,600],[360,780]]){
  const control=new EstateCameraController(),camera=control.update({dt:.016,aspect:width/height,mode:'third-person',position:{x:-4,z:-3},bounds:{minX:-7,maxX:7,minZ:-6,maxZ:6}});
  const rect={left:17,top:23,width,height};
  for(const point of [{x:4,z:4},{x:5,z:4},{x:4,z:5},{x:3,z:3}]){const projected=new THREE.Vector3(point.x-8,0,point.z-7).project(camera);const tap={clientX:rect.left+(projected.x+1)*width/2,clientY:rect.top+(1-projected.y)*height/2};assert.deepEqual(convoyGroundHit(camera,tap,rect),point);}
  assert.equal(convoyGroundHit(camera,{clientX:-1,clientY:-1},rect),null);
 }
});

test('actual convoy scene pose method keeps archived LX and all guardian rigs on continuous authoritative trails',async()=>{
 const THREE=await import('three');const {readFileSync}=await import('node:fs');const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {createClubAvatar}=await import('../src/avatars/club-avatar-rig.ts');const {ConvoyWorld}=await import('../src/v7/ConvoyWorld.ts');
 for(const kind of ['human-lx','sword-shield-dog','miaocuijiao','milk-frog'] as const){
  const bytes=readFileSync(new URL(`../public/avatars/cast-v1/${kind}.glb`,import.meta.url));const loader=new GLTFLoader();loader.register(()=>({name:'TEST_ONLY_NO_IMAGE_DECODE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const model=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const avatar=createClubAvatar(kind,'convoy-scene-test',{template:model.scene});await avatar.ready;
  const harness=Object.assign(Object.create(ConvoyWorld.prototype),{lastPositions:{},travelled:{carrier:0,guard:0,cart:0,wolf:0},headings:{carrier:0,guard:0},blends:{carrier:0,guard:0}}) as {avatar:(avatar:ReturnType<typeof createClubAvatar>,role:'carrier',actor:ReturnType<typeof room>['carrier'],time:number,dt:number)=>{x:number;z:number}};
  const actor={...room().carrier,track:[{x:2,z:4,t:0},{x:3,z:4,t:1},{x:3,z:5,t:2}]};let previous:InstanceType<typeof THREE.Vector3>|null=null;
  for(let frame=0;frame<=150;frame++){harness.avatar(avatar,'carrier',actor,Math.min(2,frame/60),1/60);avatar.root.updateMatrixWorld(true);if(previous)assert.ok(avatar.root.position.distanceTo(previous)<.03);previous=avatar.root.position.clone();avatar.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));}
  assert.equal(avatar.root.position.x,-5);assert.equal(avatar.root.position.z,-2);avatar.dispose();
 }
});

test('carrier keyboard directions choose the legal road neighbour, not a rejected diagonal grass cell',async()=>{
 const {EstateCameraController,screenMovement}=await import('../src/v5/isometric-camera.ts');const {convoyDirectionalTarget}=await import('../src/v7/convoy.ts');
 const s=room();const camera=new EstateCameraController().update({dt:.016,aspect:390/844,mode:'third-person',position:{x:-6,z:-3},bounds:{minX:-7,maxX:7,minZ:-6,maxZ:6}});
 for(const input of [{x:1,z:0},{x:0,z:1},{x:1,z:1}]){const target=convoyDirectionalTarget(s,'carrier',screenMovement(camera,input.x,input.z));assert.deepEqual(target,{x:3,z:4});assert.equal(apply(s,'carrier','move',target!).accepted,true);}
 s.route='covered';s.carrier.x=4;s.carrier.z=4;s.carrier.path=[];assert.deepEqual(convoyDirectionalTarget(s,'carrier',{x:0,z:1}),{x:4,z:5});
});
test('guard beside a gate can close it after the whole convoy passes, but cannot crush a crossing cart',()=>{
 const s=room();apply(s,'guard','join');s.guard.x=7;s.guard.z=4;s.gates.short=true;s.carrier.x=12;s.cart.x=11;s.wolf.x=14;
 assert.equal(apply(s,'guard','gate',{open:false}).accepted,true);s.gates.short=true;s.cart.x=9.5;
 assert.equal(apply(s,'guard','gate',{open:false}).accepted,false);
});
