import './view-loader.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createElement,createRef} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import FarmView,{type FarmViewProps} from '../src/FarmView.tsx';
import {createFarm,snapshot} from '../src/model.ts';
import {layoutPhoneViewport,PHONE_SCREEN} from '../src/feed/phone-viewport.ts';
import {ClubCameraController} from '../src/avatars/club-camera.ts';
import {CLUB_AVATAR_SCALE} from '../src/avatars/club-avatar-scale.ts';
function props(sheet:FarmViewProps['sheet']=null):FarmViewProps{return {farm:snapshot(createFarm('a',100000),100000),target:'all',camera:'overview',reduced:false,sheet,busy:false,pending:false,error:'',message:'',assetStatus:'伙伴已就位',now:100000,guide:'对大家跳舞',nextLearn:0,worldRef:createRef(),onTarget(){},onSheet(){},onCommand(){},onAction(){},onCamera(){},onReduced(){},onMove(){},onStop(){}};}
test('farm renders the same portrait feed, full scene and bottom navigation without a dashboard rail',()=>{
 const html=renderToStaticMarkup(createElement(FarmView,props()));
 assert.match(html,/app-shell app-shell-v020/);assert.match(html,/data-phone-ratio="195:422"/);assert.match(html,/feed-window feed-v020 farm-feed joined/);assert.match(html,/class="club-stage"/);assert.match(html,/class="interaction-dock/);assert.match(html,/class="bottom-nav"/);
 assert.doesNotMatch(html,/role="dialog"|class="residents|class="topbar|A LITTLE PLACE/);
 assert.match(html,/移动摇杆/);assert.match(html,/打开互动菜单/);
});
test('relationship and appearance controls live in a lightweight bottom sheet while the stage stays mounted',()=>{
 const p=props('residents');p.farm.animals[0].growthEligible=true;
 const html=renderToStaticMarkup(createElement(FarmView,p));
 assert.match(html,/role="dialog"/);assert.match(html,/aria-modal="true"/);assert.match(html,/皮皮的记忆/);assert.match(html,/留下星点卷毛/);assert.match(html,/class="club-stage"/);assert.match(html,/sheet-handle/);
});
test('actions, guardian, wool, facility and revisit remain available through the shared feed controls',()=>{
 const actions=renderToStaticMarkup(createElement(FarmView,props('actions')));for(const label of ['跳舞','蹦跳','喜欢','奶蛙合拍'])assert.ok(actions.includes(label));
 const wool=renderToStaticMarkup(createElement(FarmView,props('wool')));assert.match(wool,/领取/);assert.match(wool,/软垫舞台/);
 const avatar=renderToStaticMarkup(createElement(FarmView,props('avatar')));assert.match(avatar,/喵脆角/);assert.match(avatar,/香蕉猫/);assert.match(avatar,/体验下次来访/);assert.match(avatar,/演示快进 6 小时/);
});
test('390×844 viewport fits desktop, narrow phone and rotated screens with uniform scale',()=>{
 assert.deepEqual(PHONE_SCREEN,{width:390,height:844});
 for(const [w,h] of [[1440,900],[390,844],[320,568],[844,390]]){const p=layoutPhoneViewport(w,h,{left:0,top:0,right:0,bottom:0},undefined,false,1);assert.ok(p.width<=w&&p.height<=h);assert.ok(Math.abs(p.width/p.height-390/844)<1e-10);}
});
test('reused feed styles, viewport and camera modules stay verbatim except local imports',()=>{
 for(const [farm,source] of [['src/feed/FeedInterface.css','components/FeedInterface.css'],['src/feed/phone-viewport.ts','lib/phone-viewport.ts'],['src/avatars/club-camera.ts','lib/club-camera.ts']])assert.equal(readFileSync(farm,'utf8'),readFileSync(new URL(`../../disco/${source}`,import.meta.url),'utf8'));
 assert.equal(CLUB_AVATAR_SCALE,1.5);
 const controller=new ClubCameraController();const camera=controller.update({width:390,height:758,mode:'overview',subject:null,orbit:{yaw:0,pitch:0},deltaSeconds:0,reducedMotion:false});assert.ok(Math.abs(camera.position.x-camera.position.z)<1e-10);assert.ok(camera.position.y>camera.position.x-1);
});

test('joystick directions follow the isometric camera and releasing stops at the current position',async()=>{
 const {screenMovementFromCamera,CameraMovementGesture}=await import('../src/farm-camera.ts');const {FarmWorld}=await import('../src/world.ts');const THREE=await import('three');
 const camera=new THREE.PerspectiveCamera();camera.position.set(10,10,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const up=screenMovementFromCamera(camera,0,-1);assert.ok(up.x<0&&up.z<0);const right=screenMovementFromCamera(camera,1,0);assert.ok(right.x>0&&right.z<0);
 const world=Object.create(FarmWorld.prototype) as InstanceType<typeof FarmWorld>;Object.assign(world,{movementGesture:new CameraMovementGesture(),playerGroup:{position:{x:2,z:3}},destination:{x:4,z:5}});world.move({x:0,z:0});assert.deepEqual(Reflect.get(world,'destination'),{x:2,z:3});
});

test('continuous keyboard or joystick input travels straight in follow view without rotating the camera',async()=>{
 const movement=await import('../src/farm-camera.ts');const THREE=await import('three');
 for(const [x,z] of [[0,-1],[1,0]]){
  const gesture=new movement.CameraMovementGesture(),controller=new ClubCameraController(),position=new THREE.Vector3();let heading=0;
  const subject=()=>({id:'player',position,heading,height:2.25,radius:.9,displayScale:1.5});
  let camera=controller.update({width:390,height:758,mode:'third-person',subject:subject(),orbit:{yaw:0,pitch:0},deltaSeconds:0,reducedMotion:false});
  const initialForward=camera.getWorldDirection(new THREE.Vector3());
  let initialDirection:{x:number;z:number}|undefined;
  for(let frame=0;frame<120;frame++){
   const direction=gesture.sample(camera,'third-person',x,z);initialDirection??=direction;
   position.x+=direction.x*2.8/60;position.z+=direction.z*2.8/60;
   const target=Math.atan2(direction.x,direction.z);heading+=Math.atan2(Math.sin(target-heading),Math.cos(target-heading))*7/60;
   camera=controller.update({width:390,height:758,mode:'third-person',subject:subject(),orbit:{yaw:0,pitch:0},headingLock:gesture.headingLock,deltaSeconds:1/60,reducedMotion:false});
  }
  assert.ok(position.length()>5.5,'held input must move rather than circle in place');
  assert.ok(Math.abs(position.x*initialDirection!.z-position.z*initialDirection!.x)<1e-6,'travel remains on the initial screen basis');
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).angleTo(initialForward)<1e-6,'the camera heading stays locked throughout the gesture');
  assert.equal(gesture.active,true);assert.deepEqual(gesture.sample(camera,'third-person',0,0),{x:0,z:0});assert.equal(gesture.active,false);assert.equal(gesture.headingLock,undefined);
 }
});
