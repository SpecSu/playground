import './room-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
const festival=await import('../lib/festival-types.ts');
const roomTypes=await import('../lib/room-types.ts');
const ambient=await import('../lib/festival-ambient.ts');
const movement=await import('../lib/festival-motion.ts');
const math=await import('../src/desert/visual-math.ts');
const headAnchor=await import('../src/desert/avatar-head-anchor.ts');
const construction=await import('../src/desert/construction.ts');
const placementPreview=await import('../src/desert/placement-preview.ts');
const selfMarker=await import('../src/desert/self-marker.ts');
const focus=await import('../src/desert/artwork-focus.ts');
const speech=await import('../src/desert/speech-bubble.ts');
const screenSpaceText=await import('../src/desert/screen-space-text.ts');
const sandHaze=await import('../src/desert/sand-haze.ts');
const smoke=await import('../src/desert/smoke.ts');
const ceremony=await import('../src/desert/ceremony.ts');
const ceremonyEffects=await import('../src/desert/ceremony-effects.ts');
const environment=await import('../src/desert/environment.ts');
const js=ts.transpileModule(fs.readFileSync(new URL('../components/DesertScene.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;

// Execute the production RAF, camera and input code against Three's real scene
// graph and raycaster. Only DOM drawing, GPU renderer and asset loading are inert.
function harness(){
 let now=1000,scheduled,scene,camera,root,props,lookTarget,captureFailure=false;
 const events=new Map(),avatars=new Map(),effects=[],fires=[],lightings=[],animations=[],captureCalls=[],renderSteps=[];
 const element={clientWidth:402,clientHeight:600,appendChild(){}};
 const canvas={setAttribute(){},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener(){},setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},remove(){},getBoundingClientRect:()=>({left:0,top:0,width:402,height:600})};
 class Renderer{constructor(){this.domElement=canvas;this.debug={};this.shadowMap={};}setPixelRatio(){}setSize(){}render(s,c){scene=s;camera=c;renderSteps.push('render');}dispose(){}}
 class Camera extends THREE.PerspectiveCamera{lookAt(value){lookTarget=value.clone();super.lookAt(value);this.updateMatrixWorld();}}
 class PMREM{fromScene(){return{texture:new THREE.Texture(),dispose(){}};}dispose(){}}
 const context=vm.createContext({exports:{},console,Math,Map,Set,Promise,performance:{now:()=>now},queueMicrotask:fn=>fn(),requestAnimationFrame:fn=>{scheduled=fn;return 1;},cancelAnimationFrame:()=>{scheduled=null;},ResizeObserver:class{observe(){}disconnect(){}},window:{devicePixelRatio:1,matchMedia:()=>({matches:false})},document:{visibilityState:'visible',createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:(target,key)=>key==='measureText'?text=>({width:text.length*27}):key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true;}})})},require(specifier){
  if(specifier==='react')return{useRef:initial=>({current:initial===null?element:initial}),useState:initial=>[initial,()=>{}],useEffect:callback=>effects.push(callback)};
  if(specifier==='react/jsx-runtime')return{jsx:()=>null,jsxs:()=>null};
  if(specifier==='three')return{...THREE,WebGLRenderer:Renderer,PerspectiveCamera:Camera,PMREMGenerator:PMREM};
  if(specifier==='@/src/desert/artwork-focus')return focus;
  if(specifier==='@/src/desert/speech-bubble')return speech;
  if(specifier==='@/src/desert/screen-space-text')return screenSpaceText;
  if(specifier==='@/lib/festival-builder-avatar')return{createFestivalBuilderAvatar:()=>({update(){},dispose(){}})};
  if(specifier==='@/lib/festival-types')return festival;
  if(specifier==='@/lib/room-types')return roomTypes;
  if(specifier==='@/lib/festival-ambient')return ambient;
  if(specifier==='@/lib/festival-motion')return movement;
  if(specifier==='@/src/desert/visual-math')return math;
  if(specifier==='@/src/desert/construction')return construction;
  if(specifier==='@/src/desert/placement-preview')return placementPreview;
  if(specifier==='@/src/desert/self-marker')return selfMarker;
  if(specifier==='@/src/desert/avatar-head-anchor')return headAnchor;
  if(specifier==='@/src/desert/sand-haze')return sandHaze;
  if(specifier==='@/src/desert/smoke')return smoke;
  if(specifier==='@/src/desert/environment')return environment;
  if(specifier==='@/src/desert/ceremony')return ceremony;
  if(specifier==='@/src/desert/ceremony-effects')return ceremonyEffects;
  if(specifier==='@/src/desert/celebration-avatar')return{createFestivalCelebrationAvatar:avatar=>({lift:0,update(...args){avatar.celebration=args;},dispose(){}})};
  if(specifier==='@/src/desert/ceremony-capture')return{captureFestivalCeremonyPhoto:(renderer,scene,camera,roundIndex,capturedAt)=>{captureCalls.push({roundIndex,capturedAt});renderSteps.push('capture');return captureFailure?null:{roundIndex,capturedAt,dataUrl:'data:image/jpeg;base64,REALFRAME'};}};
  if(specifier==='@/src/desert/fire')return{createDesertFire:(seed,height,width)=>{fires.push({seed,height,width});return{root:new THREE.Group(),update(){},dispose(){}};}};
  if(specifier==='@/src/desert/artwork-lighting')return{createArtworkLighting:(root,kind)=>({update:(seconds,selection,options)=>lightings.push({root,kind,seconds,selection,options}),dispose(){}})};
  if(specifier==='@/src/desert/installations')return{updateInstallationAnimation:(root,seconds,options)=>animations.push({root,seconds,options}),createInstallation:()=>{const art=new THREE.Group();art.userData={height:24,radius:6};const mesh=new THREE.Mesh(new THREE.BoxGeometry(12,24,12),new THREE.MeshStandardMaterial());mesh.position.y=12;art.add(mesh);return art;},disposeInstallation(){}};
  if(specifier==='@/lib/club-avatar-rig')return{createClubAvatar:(kind,id)=>{root=new THREE.Group();const avatar={root,kind:roomTypes.resolveAvatarPreset(kind),loaded:true,labelHeight:2,ready:Promise.resolve(),update(...args){avatar.motion=args[4];},dispose(){root.removeFromParent();}};avatars.set(id,avatar);return avatar;}};
  throw new Error(specifier);
 }});
 const participant={id:'self',name:'Traveller',preset:'cat',slot:0,joinedAt:1,lastSeenAt:1000,x:0,z:44,targetX:0,targetZ:44,moveAt:1000,heading:0,emote:'dance',emoteAt:0};
 let snapshot={roomId:'main',revision:1,serverNow:1000,capacity:10,self:{id:'self',role:'participant',lastSequence:1},participants:[participant],installations:[],round:festival.festivalRoundAt(1,1000,1000)};
 const placements=[],messages=[];
 props={ownMarkerEnabled:true,snapshot,getSnapshot:()=>snapshot,serverTime:()=>now,selectedKind:null,active:true,view:'follow',focusVersion:0,movementVersion:{current:0},joystick:{current:{x:0,y:0,active:false}},prediction:{current:null},renderedSelf:{current:null},onMove(){props.movementVersion.current++;return true;},onPlace:(x,z)=>placements.push({x,z}),onMessage:text=>messages.push(text)};
 vm.runInContext(js,context);context.exports.default(props);const cleanups=effects.map(fn=>fn()).filter(Boolean);
 return{props,placements,messages,avatars,fires,lightings,animations,captureCalls,renderSteps,setCaptureFailure(value){captureFailure=value;},resetRound(index,startsAt){snapshot={...snapshot,round:festival.festivalRoundAt(index,startsAt,now)};},get now(){return now;},get scene(){return scene;},get camera(){return camera;},get target(){return lookTarget;},get participant(){return snapshot.participants[0];},setSelf(self){snapshot={...snapshot,self};},setParticipants(participants){snapshot={...snapshot,participants};},setParticipant(p){snapshot={...snapshot,revision:snapshot.revision+1,participants:[p]};},setInstallations(installations){snapshot={...snapshot,installations};},addAmbient(){snapshot={...snapshot,ambientParticipants:ambient.projectFestivalAmbientParticipants(snapshot.round,now),ambientInstallations:[{id:"ambient:art:1:0",actorId:"ambient:festival:0",ambient:true,kind:0,x:-11.7,z:61.3,createdAt:now,roundIndex:1}]};},frame(ms=1000/60){now+=ms;scheduled();},pointer(type,x,z,y=0){camera.updateMatrixWorld();const projected=new THREE.Vector3(x,y,z).project(camera);events.get(type)({button:0,isPrimary:true,pointerId:1,clientX:(projected.x+1)*201,clientY:(1-projected.y)*300});},screenPointer(type,id,x,y){events.get(type)({button:0,isPrimary:id===1,pointerType:'touch',pointerId:id,clientX:x,clientY:y});},dispose(){cleanups.forEach(fn=>fn());}};
}

test('production RAF gives avatar, label and follow camera one continuous reconciled pose',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.props.prediction.current={...h.participant,actorId:'self',token:1,expiresAt:31000,targetX:35};
 for(let i=0;i<60;i++)h.frame();
 const before=h.avatars.get('self').root.position.clone(),oldTarget=h.target.clone();
 h.setParticipant({...h.participant,targetX:35,moveAt:1500});h.props.prediction.current=null;
 h.frame();
 const shown=h.props.renderedSelf.current,avatar=h.avatars.get('self');
 assert.ok(shown.x>=before.x,'Acknowledgement does not snap the avatar back');
 assert.ok(shown.x-before.x<=festival.FESTIVAL_MOVE_SPEED/60*1.5+.001);
 assert.equal(avatar.root.position.x,shown.x);assert.equal(avatar.motion.x,shown.x);
 assert.ok(Math.abs(h.target.x-(oldTarget.x+(shown.x-oldTarget.x)*(1-Math.exp(-3.8/60))))<1e-8,'Camera follows the rendered pose, not a discontinuous server target');
 const label=h.scene.children.find(node=>node instanceof THREE.Sprite&&node.visible);
 assert.equal(label.position.x,shown.x);
 const beforePause=avatar.root.position.clone();h.frame(4000);
 assert.ok(avatar.root.position.distanceTo(beforePause)<=festival.FESTIVAL_MOVE_SPEED*.05*1.5+.001,'RAF resumption is bounded');
});

test('production ground input places unsnapped coordinates and shows valid/invalid footprint previews',t=>{
 const h=harness();t.after(()=>h.dispose());h.props.selectedKind=0;h.props.view='aerial';
 for(let i=0;i<180;i++)h.frame();
 h.pointer('pointermove',-11.7,61.3);h.frame();
 const preview=h.scene.getObjectByName('free-placement-preview');assert.ok(preview.visible);
 assert.equal(preview.getObjectByName('placement-ring').material.color.getHex(),0x00ee55);
 assert.equal(preview.scale.x,festival.FESTIVAL_INSTALLATION_RADII[0]);
 h.pointer('pointerdown',-11.7,61.3);h.pointer('pointerup',-11.7,61.3);
 assert.equal(h.placements.length,1);assert.ok(Math.abs(h.placements[0].x+11.7)<1e-6);assert.ok(Math.abs(h.placements[0].z-61.3)<1e-6);
 h.pointer('pointermove',0,0);h.frame();assert.equal(preview.getObjectByName('placement-ring').material.color.getHex(),0xff202b);
 h.pointer('pointerdown',0,0);h.pointer('pointerup',0,0);
 assert.equal(h.placements.length,1);assert.ok(h.messages.length>0);
 assert.equal(h.scene.getObjectByName('available-build-plots'),undefined);
});


test('production burn and ash effects scale to the installed sculpture dimensions',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'art',actorId:'self',kind:0,x:0,z:60,createdAt:1000,roundIndex:1}]);h.frame();
 assert.equal(h.fires[0].height,24*.95);assert.equal(h.fires[0].width,6*1.8);
 const ash=h.scene.children.find(node=>node instanceof THREE.Mesh&&node.geometry instanceof THREE.CircleGeometry&&node.material instanceof THREE.MeshStandardMaterial);
 assert.equal(ash.geometry.parameters.radius,6);
});


test('production scene animates four ambient visitors and protects their artwork without changing self',t=>{
 const h=harness();t.after(()=>h.dispose());h.addAmbient();h.frame();
 assert.equal(h.avatars.size,5);assert.ok(h.props.renderedSelf.current.actorId==='self');
 const before=h.avatars.get('ambient:festival:0').root.position.clone();
 for(let i=0;i<600;i++)h.frame();
 assert.ok(h.avatars.get('ambient:festival:0').root.position.distanceTo(before)>.1);
 assert.equal(h.fires.length,1,'Ambient art uses the normal shared burn renderer');
 h.props.selectedKind=0;h.props.view='aerial';for(let i=0;i<180;i++)h.frame();
 h.pointer('pointermove',-11.7,61.3);h.frame();
 const preview=h.scene.getObjectByName('free-placement-preview');assert.equal(preview.getObjectByName('placement-ring').material.color.getHex(),0xff202b);
 h.pointer('pointerdown',-11.7,61.3);h.pointer('pointerup',-11.7,61.3);
 assert.equal(h.placements.length,0);
});


test('new own build focuses only at arrival and view reset exits artwork orbit',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'new-art',actorId:'self',kind:0,x:35,z:40,createdAt:3000,roundIndex:1}]);
 h.setParticipant({...h.participant,buildTask:{installationId:'new-art',arrivalAt:3000,finishAt:23000,facing:1}});
 for(let i=0;i<60;i++)h.frame();
 assert.ok(h.target.x<1,'approach does not focus before arrival');
 for(let i=0;i<240;i++)h.frame();
 assert.ok(Math.abs(h.target.x-35)<.1);assert.ok(Math.abs(h.target.y-12)<.1);
 assert.ok(h.camera.position.x<35,'automatic camera approaches from builder side of artwork');
 h.props.focusVersion++;for(let i=0;i<180;i++)h.frame();
 assert.ok(h.target.x<.1,'existing view reset leaves artwork focus');
});

test('visible artwork tap wins over floor movement while a drag cannot select it',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'old-art',actorId:'other',kind:0,x:18,z:45,createdAt:-30000,roundIndex:1}]);
 for(let i=0;i<180;i++)h.frame();
 h.pointer('pointerdown',18,45,12);h.pointer('pointerup',18,45,12);
 for(let i=0;i<180;i++)h.frame();
 assert.ok(Math.abs(h.target.x-18)<.1);assert.ok(Math.abs(h.target.y-12)<.1);
 h.props.focusVersion++;for(let i=0;i<180;i++)h.frame();
 h.pointer('pointerdown',18,45,12);h.pointer('pointermove',23,45,12);h.pointer('pointerup',23,45,12);
 for(let i=0;i<90;i++)h.frame();assert.ok(h.target.x<.1);
});


test('returning after a pause reconciles active builder at the authoritative worksite',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setParticipant({...h.participant,targetX:30,targetZ:44,moveAt:h.now,buildTask:{installationId:'job',arrivalAt:6000,finishAt:26000,facing:1}});
 h.frame(10000);
 assert.ok(Math.abs(h.avatars.get('self').root.position.x-30)<.1,'builder returns at worksite rather than hammering en route');
 assert.equal(h.avatars.get('self').motion.walkBlend,0);
});

test('manual camera intent during approach prevents deferred own build focus',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'job',actorId:'self',kind:0,x:35,z:40,createdAt:5000,roundIndex:1}]);
 h.setParticipant({...h.participant,buildTask:{installationId:'job',arrivalAt:5000,finishAt:25000,facing:1}});h.frame();
 h.props.focusVersion++;h.frame();for(let i=0;i<420;i++)h.frame();
 assert.ok(h.target.x<.1);
});


test('two-finger artwork zoom keeps the orbit center and never turns pinch into floor taps',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'art',actorId:'other',kind:0,x:18,z:45,createdAt:-30000,roundIndex:1}]);
 for(let i=0;i<180;i++)h.frame();h.pointer('pointerdown',18,45,12);h.pointer('pointerup',18,45,12);for(let i=0;i<180;i++)h.frame();
 const distance=h.camera.position.distanceTo(h.target);
 h.screenPointer('pointerdown',1,100,300);h.screenPointer('pointerdown',2,200,300);h.screenPointer('pointermove',2,300,300);h.screenPointer('pointerup',2,300,300);h.screenPointer('pointerup',1,100,300);
 for(let i=0;i<180;i++)h.frame();
 assert.ok(h.camera.position.distanceTo(h.target)<distance*.7);assert.ok(Math.abs(h.target.x-18)<.1);
});

test('resuming midway through a build approach catches up before hammering begins',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setParticipant({...h.participant,x:-10,targetX:60,targetZ:44,moveAt:h.now,buildTask:{installationId:'job',arrivalAt:11000,finishAt:31000,facing:1}});
 h.frame(5000);
 assert.ok(h.avatars.get('self').root.position.x>20,'resume restores current authoritative approach position');
 for(let i=0;i<300;i++)h.frame();
 assert.ok(Math.abs(h.avatars.get('self').root.position.x-60)<.5,'builder reaches worksite when construction starts');
});

test('scene has no ambient sand haze or distance fog but preserves local construction dust',t=>{
 const h=harness();t.after(()=>h.dispose());
 assert.equal(h.scene.getObjectByName('ambient-desert-sand'),undefined);
 assert.equal(h.scene.fog,null);
 h.setInstallations([{id:'building',actorId:'other',kind:0,x:18,z:45,createdAt:0,roundIndex:1}]);h.frame();
 assert.ok(h.scene.getObjectByName('construction-dust'),'local construction dust remains available');
});


test('production RAF fades local smoke and ground scorch before authoritative round cleanup',t=>{
 const h=harness();t.after(()=>h.dispose());
 const round=festival.festivalRoundAt(1,1000,1000);
 h.setInstallations([{id:'burning-art',actorId:'other',kind:0,x:18,z:45,createdAt:0,roundIndex:1}]);h.frame();
 const plume=h.scene.getObjectByName('artwork-burn-smoke');
 const ash=h.scene.children.find(node=>node instanceof THREE.Mesh&&node.geometry instanceof THREE.CircleGeometry&&node.geometry.parameters.radius===6);
 assert.ok(plume);assert.ok(ash);assert.equal(plume.visible,false);
 h.frame(round.burnAt+5000-h.now);assert.equal(plume.visible,true);
 assert.equal(plume.position.x,18);assert.equal(plume.position.z,45);
 h.frame(round.ashesAt-h.now);
 const opacity=ash.material.opacity,footprint=ash.scale.x,intensity=plume.children[0].material.uniforms.uIntensity.value;
 assert.ok(opacity>.7);assert.ok(intensity>.3);
 h.frame(5000);
 assert.ok(ash.material.opacity>0&&ash.material.opacity<opacity);
 assert.ok(plume.children[0].material.uniforms.uIntensity.value<intensity);
 assert.equal(ash.scale.x,footprint,'dissipation fades the scorch rather than shrinking its circle');
 h.frame(round.endsAt-250-h.now);
 assert.equal(ash.material.opacity,0);assert.equal(plume.visible,false);
});

for (const input of ['ground','joystick','external']) test(`accepted ${input} movement exits artwork focus and follows self in aerial view`,t=>{
 const h=harness();t.after(()=>h.dispose());h.props.view='aerial';
 h.setInstallations([{id:'art',actorId:'other',kind:0,x:18,z:45,createdAt:-30000,roundIndex:1}]);
 for(let i=0;i<180;i++)h.frame();h.pointer('pointerdown',18,45,12);h.pointer('pointerup',18,45,12);for(let i=0;i<180;i++)h.frame();
 assert.ok(Math.abs(h.target.x-18)<.1);
 if(input==='ground'){h.pointer('pointerdown',-20,40);h.pointer('pointerup',-20,40);}
 else if(input==='joystick')h.props.joystick.current={x:1,y:0,active:true};
 else h.props.onMove(-20,40);
 h.frame();h.props.joystick.current={x:0,y:0,active:false};
 h.props.prediction.current={...h.participant,actorId:'self',token:1,expiresAt:h.now+30000,targetX:-20,moveAt:h.now};
 for(let i=0;i<180;i++)h.frame();
 assert.ok(h.target.x<0,'camera leaves artwork and follows moving self');assert.ok(Math.abs(h.target.y-4.4)<.1);
 assert.equal(h.props.view,'aerial','movement does not change selected view');
 h.pointer('pointerdown',18,45,12);h.pointer('pointerup',18,45,12);for(let i=0;i<180;i++)h.frame();
 assert.ok(Math.abs(h.target.x-18)<.1,'later explicit artwork tap refocuses');
});

test('rejected ground movement preserves artwork focus',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'art',actorId:'other',kind:0,x:18,z:45,createdAt:-30000,roundIndex:1}]);
 for(let i=0;i<180;i++)h.frame();h.pointer('pointerdown',18,45,12);h.pointer('pointerup',18,45,12);for(let i=0;i<180;i++)h.frame();
 h.props.onMove=()=>false;h.pointer('pointerdown',-20,40);h.pointer('pointerup',-20,40);
 for(let i=0;i<180;i++)h.frame();assert.ok(Math.abs(h.target.x-18)<.1);
});

test('movement supersedes a build task not yet observed by RAF and its deferred focus',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'job',actorId:'self',kind:0,x:35,z:40,createdAt:5000,roundIndex:1}]);
 h.setParticipant({...h.participant,buildTask:{installationId:'job',arrivalAt:5000,finishAt:25000,facing:1}});
 h.props.onMove(-20,40);for(let i=0;i<420;i++)h.frame();assert.ok(h.target.x<.1);
});

test('late snapshot of an older build cannot regain focus after movement',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.props.onMove(-20,40);h.frame();
 h.setInstallations([{id:'late-job',actorId:'self',kind:0,x:35,z:40,createdAt:5000,roundIndex:1}]);
 h.setParticipant({...h.participant,buildTask:{installationId:'late-job',arrivalAt:5000,finishAt:25000,facing:1}});
 for(let i=0;i<420;i++)h.frame();assert.ok(h.target.x<.1);
 h.setInstallations([{id:'next-job',actorId:'self',kind:0,x:35,z:40,createdAt:h.now+1000,roundIndex:1}]);
 h.setParticipant({...h.participant,moveAt:h.now,buildTask:{installationId:'next-job',arrivalAt:h.now+1000,finishAt:h.now+21000,facing:1}});
 for(let i=0;i<180;i++)h.frame();assert.ok(Math.abs(h.target.x-35)<.1,'a genuinely later build may autofocus');
});


test('production ceremony raises all human and ambient actors, spins only the stone top, dims lighting and resets after ashes', t => {
 const h=harness();t.after(()=>h.dispose());h.addAmbient();h.frame();
 const round=festival.festivalRoundAt(1,1000,1000);
 const top=h.scene.getObjectByName('dreamina-weathered-stone'),base=h.scene.getObjectByName('dreamina-disc-base');
 const light=h.scene.children.find(node=>node instanceof THREE.HemisphereLight);
 assert.equal(top.rotation.y,0);const daylight=light.intensity;
 for(const avatar of h.avatars.values())assert.equal(avatar.celebration?.[0],null);
 h.frame(round.burnAt+5000-h.now);
 assert.ok(top.rotation.y>0);assert.equal(base.rotation.y,0);assert.ok(light.intensity<daylight);
 for(const avatar of h.avatars.values())assert.equal(avatar.celebration[0],5,'human and ambient roles share ceremony pose');
 assert.equal(h.scene.getObjectByName('festival-burn-ceremony').visible,true);
 h.frame(round.ashesAt-h.now);
 for(const avatar of h.avatars.values())assert.equal(avatar.celebration[0],null);
 assert.equal(h.scene.getObjectByName('festival-burn-ceremony').visible,false);
 h.frame(round.endsAt-h.now);assert.equal(top.rotation.y,0);assert.equal(light.intensity,daylight);assert.equal(h.scene.fog,null);
});

test('production capture runs after a visible peak render once per round and a late visible burn can still make its photo', t => {
 const h=harness();t.after(()=>h.dispose());const photos=[];h.props.onCelebrationPhoto=photo=>photos.push(photo);
 const round=festival.festivalRoundAt(1,1000,1000);
 h.frame(round.burnAt+21000-h.now);assert.equal(photos.length,0);
 h.props.active=false;h.frame(2000);assert.equal(photos.length,0);
 h.props.active=true;h.frame(1000);assert.equal(photos.length,1);assert.equal(photos[0].capturedAt,h.now);
 assert.equal(h.renderSteps.at(-2),'render');assert.equal(h.renderSteps.at(-1),'capture');
 for(let i=0;i<20;i++)h.frame();assert.equal(photos.length,1);
 h.frame(round.ashesAt-h.now);assert.equal(photos.length,1);
 h.resetRound(2,h.now-300000-25000);h.frame();assert.equal(photos.length,2);assert.equal(photos[1].roundIndex,2);
 h.resetRound(3,h.now-300000-34900);h.frame();assert.equal(photos.length,2,'joining during the dim finale never mislabels it as a peak');
 h.resetRound(4,h.now-300000-35000);h.frame();assert.equal(photos.length,2,'joining after fire ends never invents a peak');
});


test('peak capture waits for loaded actors and bounded failed attempts never manufacture a photo', t => {
 const h=harness();t.after(()=>h.dispose());const photos=[];h.props.onCelebrationPhoto=photo=>photos.push(photo);
 const round=festival.festivalRoundAt(1,1000,1000);h.avatars.get('self').loaded=false;
 h.frame(round.burnAt+22000-h.now);assert.equal(h.captureCalls.length,0,'late loaded characters are not missing from the photograph');
 h.avatars.get('self').loaded=true;h.setCaptureFailure(true);h.frame();assert.equal(h.captureCalls.length,1);
 for(let i=0;i<12;i++)h.frame();assert.equal(h.captureCalls.length,1,'a failed framebuffer read is not retried every RAF');
 h.frame(1000);h.frame(1000);h.frame(1000);assert.equal(h.captureCalls.length,3);assert.equal(photos.length,0);
 h.resetRound(2,h.now-300000-22000);h.setCaptureFailure(false);h.frame();assert.equal(photos.length,1,'next round can capture normally');
});


test('festival avatars double the current visual scale while placement, labels, shadow and follow target remain coherent',t=>{
 const h=harness();t.after(()=>h.dispose());h.addAmbient();for(let i=0;i<180;i++)h.frame();
 assert.ok(h.avatars.size>1);for(const actor of h.avatars.values())assert.deepEqual(actor.root.scale.toArray(),[4,4,4]);
 const avatar=h.avatars.get('self');assert.deepEqual(avatar.root.scale.toArray(),[4,4,4]);
 assert.equal(avatar.root.position.x,h.props.renderedSelf.current.x);assert.equal(avatar.root.position.z,h.props.renderedSelf.current.z);
 const label=h.scene.children.find(node=>node instanceof THREE.Sprite&&node.visible);
 assert.equal(label.position.y,(avatar.labelHeight-.22)*4+.35);assert.ok(label.userData.screenSpaceText.width>0);
 const shadow=h.scene.children.find(node=>node instanceof THREE.Mesh&&node.geometry instanceof THREE.CircleGeometry&&node.material instanceof THREE.MeshBasicMaterial);
 assert.deepEqual(shadow.scale.toArray(),[4,4,4]);assert.equal(shadow.position.x,avatar.root.position.x);assert.equal(shadow.position.z,avatar.root.position.z);
 assert.ok(Math.abs(h.target.y-4.4)<.01,'follow aims above the enlarged character center without backing away');
});

test('production ground ring follows self motion through body hops, view changes and avatar replacement without duplicating',t=>{
 const h=harness();t.after(()=>h.dispose());h.addAmbient();h.frame();const ring=h.scene.getObjectByName('festival-self-marker');
 assert.ok(ring.visible);assert.equal(ring.parent,h.scene);assert.equal(h.scene.children.filter(node=>node.userData.festivalSelfMarker).length,1);
 const avatar=h.avatars.get('self'),baseUpdate=avatar.update;avatar.update=(...args)=>{baseUpdate(...args);avatar.root.position.y=9;};
 h.props.prediction.current={...h.participant,actorId:'self',token:1,expiresAt:31000,targetX:35};h.props.view='aerial';
 h.frame();assert.equal(avatar.root.position.y,9);assert.equal(ring.position.y,.12);assert.equal(ring.position.x,h.props.renderedSelf.current.x);assert.equal(ring.position.z,h.props.renderedSelf.current.z);
 h.setParticipant({...h.participant,preset:'frog'});h.frame();assert.equal(ring,h.scene.getObjectByName('festival-self-marker'));assert.equal(ring.parent,h.scene);assert.ok(ring.visible);
 const next={...h.participant,id:'new-self',joinedAt:2000,lastSeenAt:h.now};h.setParticipants([next]);h.setSelf({id:'new-self',role:'participant',lastSequence:1});h.frame();
 assert.ok(ring.visible);assert.equal(h.scene.children.filter(node=>node.userData.festivalSelfMarker).length,1);assert.equal(ring.position.x,h.props.renderedSelf.current.x);
});
test('production ring hides for disconnect, lost membership, expiry and unloaded replacement while NPCs remain unmarked',t=>{
 const h=harness();t.after(()=>h.dispose());h.addAmbient();h.frame();const ring=h.scene.getObjectByName('festival-self-marker');
 h.props.ownMarkerEnabled=false;h.frame();assert.equal(ring.visible,false);h.props.ownMarkerEnabled=true;h.frame();assert.equal(ring.visible,true);
 h.avatars.get('self').loaded=false;h.frame();assert.equal(ring.visible,false);h.avatars.get('self').loaded=true;h.frame();assert.equal(ring.visible,true);
 h.setSelf({id:'self',role:'spectator',lastSequence:1});h.frame();assert.equal(ring.visible,false);
 h.setSelf({id:'self',role:'participant',lastSequence:1});h.frame();assert.equal(ring.visible,true);
 h.participant.lastSeenAt=h.now-60000;h.frame();assert.equal(ring.visible,false);h.participant.lastSeenAt=h.now;h.frame();assert.equal(ring.visible,true);
 h.setParticipants([]);h.frame();assert.equal(ring.visible,false);assert.equal(h.scene.children.filter(node=>node.userData.festivalSelfMarker).length,1);
});

test('clicking the central stone top focuses it until accepted personal movement resumes following',t=>{
 const h=harness();t.after(()=>h.dispose());h.props.view='aerial';
 for(let i=0;i<180;i++)h.frame();
 h.pointer('pointerdown',0,0,18);h.pointer('pointerup',0,0,18);
 for(let i=0;i<180;i++)h.frame();
 assert.ok(h.target.y>10,'camera now targets the monument body instead of the ground');
 assert.ok(Math.abs(h.target.x)<.1&&Math.abs(h.target.z)<.1);
 h.props.movementVersion.current++;for(let i=0;i<180;i++)h.frame();
 assert.ok(Math.abs(h.target.y-4.4)<.1);assert.ok(Math.abs(h.target.z-44)<.1,'walking restores the rendered-self anchor');
});


test('artwork-only animation starts when construction completes without changing focus or ground avatars',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations([{id:'art',actorId:'other',kind:0,x:18,z:45,createdAt:1000,roundIndex:1}]);h.frame();
 assert.ok(h.animations.length>0,'scene invokes the artwork animation API');assert.equal(h.animations.at(-1).options.active,false);
 h.frame(20000);assert.equal(h.animations.at(-1).options.active,true);
 assert.deepEqual(Object.keys(h.animations.at(-1).options).sort(),['active','reducedMotion']);
 for(let i=0;i<180;i++)h.frame();h.pointer('pointerdown',18,45,12);h.pointer('pointerup',18,45,12);for(let i=0;i<180;i++)h.frame();
 assert.ok(Math.abs(h.target.x-18)<.1,'tap focuses the artwork');assert.equal(h.avatars.get('self').root.position.y,0,'avatar remains on the ground');
 assert.equal(h.props.renderedSelf.current.z,44);assert.equal(h.scene.getObjectByName('festival-own-art-marker'),undefined);
 const round=festival.festivalRoundAt(1,1000,1000);h.frame(round.burnAt-h.now);assert.equal(h.animations.at(-1).options.active,true,'completed sculpture continues its ordinary animation during original burn');
 h.setInstallations([{id:'unfinished',actorId:'other',kind:0,x:18,z:45,createdAt:round.burnAt-1000,roundIndex:1}]);h.frame(22000);assert.equal(h.animations.at(-1).options.active,false,'ignition never completes or animates an unfinished sculpture');
});


test('art and monument taps only focus the camera without lighting interaction callbacks',t=>{
 const h=harness();t.after(()=>h.dispose());const picks=[];h.props.onSelectArtwork=id=>picks.push(id);
 h.setInstallations([{id:'art',actorId:'other',kind:0,x:18,z:45,createdAt:-30000,roundIndex:1}]);for(let i=0;i<180;i++)h.frame();
 h.pointer('pointerdown',18,45,12);h.pointer('pointerup',18,45,12);for(let i=0;i<180;i++)h.frame();assert.ok(Math.abs(h.target.x-18)<.1);assert.equal(h.props.renderedSelf.current.z,44);
 h.props.view='aerial';h.props.focusVersion++;for(let i=0;i<180;i++)h.frame();h.pointer('pointerdown',0,0,18);h.pointer('pointerup',0,0,18);for(let i=0;i<180;i++)h.frame();assert.ok(Math.abs(h.target.x)<.1&&Math.abs(h.target.z)<.1);assert.equal(picks.length,0);assert.equal(h.lightings.filter(item=>item.kind==='monument').length,0);
});
test('all twelve completed artworks automatically use stable chase solar lighting and ignore legacy overrides',t=>{
 const h=harness();t.after(()=>h.dispose());
 h.setInstallations(Array.from({length:12},(_,kind)=>({id:`art-${kind}`,actorId:'other',kind,x:35,z:35,createdAt:-30000,roundIndex:1,lighting:{mode:'spark',palette:'ice',startedAt:500}})));h.frame();
 for(let kind=0;kind<12;kind++){
  const applied=h.lightings.filter(item=>item.kind===kind).at(-1);assert.ok(applied);assert.equal(applied.selection.mode,'chase');assert.equal(applied.selection.palette,'solar');assert.equal(applied.selection.startedAt,-18000);assert.equal(applied.options.active,true);assert.equal(applied.seconds,(h.now+18000)/1000);
 }
 const stable=h.lightings.filter(item=>item.kind===2).at(-1).selection;h.props.lightingPreview={current:{targetId:'art-2',roundIndex:1,token:1,lighting:null}};h.frame();assert.equal(h.lightings.filter(item=>item.kind===2).at(-1).selection,stable,'intrinsic selection is cached and cannot be overridden by stale UI preview');
 const round=festival.festivalRoundAt(1,1000,1000);h.frame(round.burnAt-h.now);assert.ok(h.lightings.slice(-12).every(item=>item.options.active===false));assert.equal(h.lightings.filter(item=>item.kind==='monument').length,0);
});
test('intrinsic lighting waits for completion, includes ambient artwork, and never lights stopped construction',t=>{
 const h=harness();t.after(()=>h.dispose());h.setInstallations([{id:'building',actorId:'other',kind:2,x:35,z:35,createdAt:1000,roundIndex:1}]);h.addAmbient();h.frame();
 assert.ok(h.lightings.slice(-2).every(item=>!item.options.active));h.frame(12999-h.now);
 assert.equal(h.lightings.filter(item=>item.kind===2).at(-1).options.active,false);h.frame(1);
 for(const kind of [0,2]){const applied=h.lightings.filter(item=>item.kind===kind).at(-1);assert.equal(applied.options.active,true);assert.equal(applied.selection.mode,'chase');assert.equal(applied.selection.palette,'solar');}
 h.setInstallations([{id:'stopped',actorId:'other',kind:3,x:35,z:35,createdAt:1000,constructionStoppedAt:5000,roundIndex:1}]);h.frame();assert.equal(h.lightings.filter(item=>item.kind===3).at(-1).options.active,false);
});
