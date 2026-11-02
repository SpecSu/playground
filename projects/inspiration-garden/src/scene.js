import {createGrowthTapController,sameGrowingPlant} from './growth-tap.js';
import {landmarkScreenPoint,landmarkContactPoint} from './interaction-landmarks.js';
import {createCatFeedingQueue} from './cat-feeding-queue.js';
import {personalExhibitReactionSample,drawPersonalExhibitReaction} from './personal-exhibit-reactions.js';
import {terrainEdgeColors} from './terrain-palettes.js';
import {drawCatFeeding} from './cat-feeding.js';
import {roadsterHoverSample,drawRoadsterJets} from './roadster-hover.js';
import {createAnimalVisitor} from './animal-visitor.js';
import {durationLabel} from './time-label.js';
import {buildingSample} from './blueprints.js';
import {buildingFootprint,buildingCenter} from './footprints.js';
import {createCameraFollow} from './camera-follow.js';
import {canReserveBuilding} from './navigation.js';
import {ADVANCED_ART_KEYS} from './advanced-catalogue.js';
import {frameAdvancedCanopies} from './content-framing.js';
import {isBuilt,constructionProgress} from './construction.js';
import {drawWorkBadge,drawFoundationWork,drawBuildingWorksite} from './worksite-view.js';
import {CELL_W,CELL_H,isoPoint,isoCell,placementCells,buildPlacementCells,edgeAtPoint,animationSample,fitZoom,avatarStandPoint,stableSceneZoom,distanceToSegment,coversAvatarHead,minimalVerticalOffset} from './scene-math.js';
import {createTapGate,isUnpressedMouseMove} from './gesture.js';
import {footprintOf,footprintCells,plantCenter,canPlacePlant,plantAtTile,placementPreview,canPlaceBuilding,buildingPlacementPreview} from './footprints.js';
import {isMature,validEdge} from './state.js';
import {createPlantControl,stepPlantControl,controlVisual} from './plant-controls.js';
import {desiredExpression,advanceExpression} from './expression-frames.js';
import {createExhibitControl,stepExhibitControl,exhibitVisual} from './exhibit-controls.js';
import {drawLoadingPlaceholder,createLoadingReveal} from './loading-placeholder.js';
import {createGardenLife} from './garden-life.js';
const TAU=Math.PI*2;
const palette={water:'#afd9d8',land:'#b6d77e',side:'#b99066',sideDark:'#997253',cream:'#fdf9eb',ink:'#4c5647',gold:'#d7ad58'};
const roundRect=(c,x,y,w,h,r=8)=>{c.beginPath();c.roundRect(x,y,w,h,r);};
function diamond(ctx,x,y,w,h){ctx.beginPath();ctx.moveTo(x,y-h/2);ctx.lineTo(x+w/2,y);ctx.lineTo(x,y+h/2);ctx.lineTo(x-w/2,y);ctx.closePath();}
function line(ctx,a,b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
/** Fixed isometric Canvas scene. No rotation, path queue, backend or persistence. */
export function createScene(canvas,{assets,onTap=()=>{},onGrowthSkip=()=>{},onGesture=()=>{},onInteraction=()=>{},onExhibitInteraction=()=>{},onApproach=()=>{},onNavigationStatus=()=>{}}){
 const ctx=canvas.getContext('2d',{alpha:true}),camera={x:0,y:0,zoom:1},life=createGardenLife({clock:()=>now()}),loadingReveal=createLoadingReveal(),follow=createCameraFollow(),animal=createAnimalVisitor({clock:()=>now(),random:()=>Math.random()});
 let width=0,height=0,dpr=1,world=null,varieties={},selected=null,mode=null,theme='home',trayHeight=0,needsFit=true;
 let frame=0,lastFrame=0,hitRegions=[],animations=new Map(),controls=new Map(),pointerControls=new Map(),contactPulses=new Map(),expressionTransitions=new Map(),particles=[],seedFlights=[],revealSeen=new Set(),avatar={x:0,y:0,from:null,to:null,at:0,direction:'front',mirror:false},disposed=false;
 let canopySignature='',canopyFitPending=false,catWarmSignature='';
 let animalPose=null,sceneActive=true;let navigationBlocked=null;let activityAllowed=false,tapResident=null,pendingTouch=null,approachContact=null,ambientBubble=null,residentPoses=[],ambientNodAt=-Infinity;
 let cameraPan={x:0,y:0},manualZoom=null,entryZoom=null,entryFocus=null,drag=null,pinch=null,hover=null,hoverEdge=null,displayedEdge=null;const pointers=new Map(),gate=createTapGate(7),reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const now=()=>Math.max(Date.now(),world?.lastSeenAt??0);
 const growthPointers=new Set();
 const growthTap=createGrowthTapController({isReady:()=>sceneActive&&!disposed&&!document.hidden&&!mode&&world?.id==='my-inspiration-garden',isCurrent:p=>world?.plants.some(current=>sameGrowingPlant(p,current)),onSingleTap:p=>onTap({kind:'plant',id:p.id}),onDoubleTap:p=>onGrowthSkip(p)});
 const growthPlantAt=e=>{const hit=targetAt(e.clientX,e.clientY);return !mode&&hit.countdown&&world?.id==='my-inspiration-garden'?world.plants.find(p=>p.id===hit.id):null;};
 const feedingQueue=createCatFeedingQueue({load:options=>assets.requestInteraction('fluffy_cat_cottage',options),clock:()=>performance.now(),onStatus:(id,phase)=>onExhibitInteraction({plantId:id,kind:'meow',phase,events:[]}),onReady:(id,at)=>{if(disposed||!sceneActive||document.hidden||!world?.exhibits?.some(e=>e.id===id&&e.artKey==='fluffy_cat_cottage'))return;const previous=controls.get(id),result=createExhibitControl('meow',{x:previous?.x??.5,y:previous?.y??.5,at},previous);result.state.active=previous?.active??false;emitControl(id,result,'ready',at);}});
 function size(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(world)fit(false);}
 const observer=new ResizeObserver(size);observer.observe(canvas);
 function fit(reset=true){
  if(!world?.tiles.length||!width)return;
  if(reset){cameraPan={x:0,y:0};manualZoom=null;entryZoom=null;const actor=life.sample(performance.now());entryFocus=Number.isFinite(actor.x)&&Number.isFinite(actor.y)?{x:actor.x,y:actor.y}:world.tiles.find(t=>t.id===world.avatarTileId)??world.tiles[0];}
  const available=Math.max(260,height-trayHeight-180),pts=world.tiles.map(t=>isoPoint(t.x,t.y));
  const cx=(Math.min(...pts.map(p=>p.x))+Math.max(...pts.map(p=>p.x)))/2;
  const cy=(Math.min(...pts.map(p=>p.y))+Math.max(...pts.map(p=>p.y)))/2;if(reset&&entryFocus)entryFocus.screenX=['demo-frog-sea','demo-kelly-music','demo-bear-moon','demo-lx-tech'].includes(world.id)?cx:isoPoint(entryFocus.x,entryFocus.y).x;
  camera.zoom=manualZoom??stableSceneZoom(world.tiles,width,height,trayHeight);
  camera.x=width/2-cx*camera.zoom+cameraPan.x;camera.y=115+available*.55-cy*camera.zoom+cameraPan.y;
  const content=frameAdvancedCanopies({world,varieties,sprite:key=>assets.sprite(key),width,height,trayHeight:manualZoom===null?87:trayHeight,zoom:camera.zoom,time:now(),manual:manualZoom!==null,pan:cameraPan});if(content){camera.zoom=content.zoom;camera.x=content.x;camera.y=content.y;}if(manualZoom===null){entryZoom??=Math.max(.4,Math.min(2.2,camera.zoom*1.16**2));camera.zoom=entryZoom;}if(entryFocus){const focal=isoPoint(entryFocus.x,entryFocus.y);camera.x=width/2-(entryFocus.screenX??focal.x)*camera.zoom+cameraPan.x;camera.y=115+available*.55-focal.y*camera.zoom+cameraPan.y;}needsFit=false;canopyFitPending=false;
 }
 const project=(x,y)=>isoPoint(x,y,camera);
 function interruptActivity(at=performance.now(),{interrupt=true,cancelContacts=true}={}){
  const resident=life.selectedResident;life.activity(at,{interrupt});if(resident&&interrupt)onApproach({phase:'cancel',kind:'resident',id:resident.id});ambientBubble=null;if(interrupt)pendingTouch=null;
  if(interrupt&&approachContact){onApproach({phase:'cancel',kind:approachContact.targetKind,id:approachContact.plantId});approachContact=null;}
  if(interrupt&&cancelContacts&&(pointerControls.size||pointers.size))cancel();
 }
 function approachTarget(kind,id,at=performance.now()){
  follow.resume(at);
  interruptActivity(at,{cancelContacts:false});const result=life.approach(kind,id,at);if(!result.possible)onApproach({phase:'unreachable',kind,id});return result;
 }
 function approachResident(id){const at=performance.now();follow.resume(at);interruptActivity(at);const result=life.approachResident(id,at);if(!result.possible)onApproach({phase:'unreachable',kind:'resident',id});return result;}
 function activateContact(contact,event,t){
  if(contact.targetKind==='plant'){const plant=world?.plants.find(p=>p.id===contact.plantId),v=plant&&varieties[plant.varietyId];if(v)assets.requestInteraction(v.artKey);}
  pointerControls.set(contact.pointerId,contact);const point=normalizeContact(contact,event);point.at=t;
  const old=controls.get(contact.plantId),result=contact.targetKind==='exhibit'?createExhibitControl(contact.kind,{type:'start',...point},old):createPlantControl(contact.kind,{type:'start',...point},old);drag=null;gate.cancel();emitControl(contact.plantId,result,'start',t);
 }
 function advanceLife(t){
  const state=life.tick(t,{allowed:activityAllowed&&!pointerControls.size&&!approachContact&&!document.hidden});avatar=state.actor;residentPoses=state.residents??[];animal.setActive(sceneActive&&!life.selectedResident&&!mode,t);animalPose=animal.tick(t,{occupied:[avatar,...residentPoses]});ambientBubble=state.bubble;const blocked=!Number.isFinite(avatar.x);if(blocked!==navigationBlocked){navigationBlocked=blocked;onNavigationStatus({blocked});}
  for(const event of state.events){
   if(event.type==='owner-ready'){
    const contact=approachContact;approachContact=null;
    if(contact&&contact.plantId===event.id&&contact.held&&pointers.has(contact.pointerId)&&event.ready)activateContact(contact,contact.event,t);
    else onApproach({phase:'ready',kind:event.kind,id:event.id,nonce:event.nonce});
   }else{
    if(event.type==='encounter')ambientNodAt=t;const p=project(event.center.x,event.center.y);if(event.type==='ambient'){animations.set(event.id,{kind:event.kind==='plant'?(varieties[world.plants.find(p=>p.id===event.id)?.varietyId]?.interaction??'sway'):'sway',at:t,duration:1050});if(event.kind==='exhibit')contactPulses.set(event.id,{type:'page',at:t});}
    burst(p.x,p.y-28*camera.zoom,event.type==='encounter'?'float':event.kind==='exhibit'?'keyboard':'bubble',t,3);
   }
  }
 }
 function drawAmbientBubble(){
  if(!ambientBubble||!world||!Number.isFinite(avatar.x))return;const speaker=ambientBubble.residentId?residentPoses.find(r=>r.id===ambientBubble.residentId):avatar;if(!speaker)return;
  const p=project(speaker.x,speaker.y),text=ambientBubble.text,maxWidth=Math.min(190,width-32);ctx.save();ctx.font='500 11px system-ui';const lines=[];let line='';for(const char of text){if(line&&ctx.measureText(line+char).width>maxWidth-22){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);
  const w=Math.min(maxWidth,Math.max(80,...lines.map(l=>ctx.measureText(l).width+22))),h=lines.length*17+16,x=Math.max(12,Math.min(width-w-12,p.x-w/2)),y=Math.max(120,Math.min(height-h-105,p.y-78*camera.zoom-h));ctx.fillStyle='#fdf9ebed';ctx.strokeStyle='#758e6c66';ctx.lineWidth=1;roundRect(ctx,x,y,w,h,11);ctx.fill();ctx.stroke();ctx.fillStyle='#4d6550';ctx.textAlign='center';ctx.textBaseline='middle';lines.forEach((l,i)=>ctx.fillText(l,x+w/2,y+16+i*17));ctx.restore();
 }
 function drawWater(){
  // User-selected flat pale sea: no decorative image, gradients, caustics or glint strokes.
  ctx.fillStyle='#b9dfdc';ctx.fillRect(0,0,width,height);
 }

 function drawTile(tile,t){
  const p=project(tile.x,tile.y),z=camera.zoom,w=CELL_W*z,h=CELL_H*z,depth=(tile.kind==='platform'?9:16)*z,built=isBuilt(tile,now()),edges=terrainEdgeColors(world.palette,tile.kind);
  // Soft shelf shadow + a quiet foam line follow each actual tile, so all shapes work.
  ctx.save();ctx.fillStyle='#638d8a25';ctx.filter=`blur(${3*z}px)`;ctx.beginPath();ctx.ellipse(p.x+3*z,p.y+21*z,w*.5,h*.45,0,0,TAU);ctx.fill();ctx.filter='none';
  ctx.strokeStyle='#e5f4e778';ctx.lineWidth=4*z;diamond(ctx,p.x,p.y+depth+2*z,w+8*z,h+4*z);ctx.stroke();
  ctx.fillStyle=tile.kind==='platform'?(world.palette?.woodDark??'#b28b60'):(world.palette?.sideDark??palette.sideDark);ctx.beginPath();ctx.moveTo(p.x-w/2,p.y);ctx.lineTo(p.x,p.y+h/2);ctx.lineTo(p.x,p.y+h/2+depth);ctx.lineTo(p.x-w/2,p.y+depth);ctx.closePath();ctx.fill();
  ctx.fillStyle=tile.kind==='platform'?(world.palette?.woodSide??'#c4a06d'):(world.palette?.side??palette.side);ctx.beginPath();ctx.moveTo(p.x,p.y+h/2);ctx.lineTo(p.x+w/2,p.y);ctx.lineTo(p.x+w/2,p.y+depth);ctx.lineTo(p.x,p.y+h/2+depth);ctx.closePath();ctx.fill();
  ctx.fillStyle=tile.kind==='platform'?(world.palette?.wood??'#d5b07a'):(world.palette?.land??palette.land);diamond(ctx,p.x,p.y,w-.7*z,h-.4*z);ctx.fill();
  ctx.strokeStyle=edges.grid;ctx.lineWidth=1.2*z;ctx.stroke();
  const occupied=(x,y)=>world.tiles.some(t=>t.x===x&&t.y===y);ctx.strokeStyle=edges.outer;ctx.lineWidth=1.2*z;
  const corners={north:[{x:p.x,y:p.y-h/2},{x:p.x+w/2,y:p.y}],east:[{x:p.x+w/2,y:p.y},{x:p.x,y:p.y+h/2}],south:[{x:p.x,y:p.y+h/2},{x:p.x-w/2,y:p.y}],west:[{x:p.x-w/2,y:p.y},{x:p.x,y:p.y-h/2}]};
  for(const [side,dx,dy] of [['north',0,-1],['east',1,0],['south',0,1],['west',-1,0]])if(!occupied(tile.x+dx,tile.y+dy)){const [a,b]=corners[side];line(ctx,a,b);if(['east','south'].includes(side))line(ctx,{x:a.x,y:a.y+depth},{x:b.x,y:b.y+depth});}
  if(!built){drawFoundationWork(ctx,p,tile,now(),z,CELL_W,CELL_H);}
  else if(tile.kind==='platform'&&world.palette?.woodGrain!==false){
   ctx.save();diamond(ctx,p.x,p.y,w-3*z,h-2*z);ctx.clip();ctx.strokeStyle='#a0835d';ctx.lineWidth=.85*z;
   for(let i=-2;i<=2;i++)line(ctx,{x:p.x-w/2,y:p.y-h/2+i*12*z},{x:p.x+w/2,y:p.y+h/2+i*12*z});ctx.restore();
  }else if(tile.kind==='land'){
   ctx.fillStyle='#e0e4ad77';for(const [dx,dy] of [[-24,-1],[25,6],[-7,-13],[8,17]]){ctx.beginPath();ctx.ellipse(p.x+dx*z,p.y+dy*z,2*z,1*z,0,0,TAU);ctx.fill();}
  }
  // Future tile/terrain atlas can override geometry without changing hit tests.
  // The seamless grid is exact procedural terrain; authored land/platform art appears in tool previews.
  if(selected?.kind==='tile'&&selected.id===tile.id){ctx.strokeStyle='#f7ebbf';ctx.lineWidth=3*z;diamond(ctx,p.x,p.y+1*z,w-8*z,h-4*z);ctx.stroke();}
  ctx.restore();
 }
 function drawSoil(p,scale=1){ctx.fillStyle='#8e735c';ctx.beginPath();ctx.ellipse(p.x,p.y+5*camera.zoom,19*camera.zoom*scale,8*camera.zoom*scale,0,0,TAU);ctx.fill();ctx.fillStyle='#a58a69';ctx.beginPath();ctx.ellipse(p.x,p.y+3*camera.zoom,15*camera.zoom*scale,5*camera.zoom*scale,0,0,TAU);ctx.fill();}
 function drawPlant(plant,t,avatarP){
  const tile=world.tiles.find(x=>x.id===plant.tileId),v=varieties[plant.varietyId];if(!tile||!v)return;
  const center=plantCenter(world,plant,v),p=project(center.x,center.y),z=camera.zoom,mature=isMature(plant,now()),progress=Math.max(0,Math.min(1,(now()-plant.plantedAt)/(plant.readyAt-plant.plantedAt))),a=animations.get(plant.id),age=a?(t-a.at)/a.duration:1;
  const anim=animationSample(a?.kind??'sway',age),control=controls.get(plant.id),cv=controlVisual(control,t);anim.sx*=cv.sx;anim.sy*=cv.sy;anim.dy+=cv.dy;anim.rotation+=cv.rotation;anim.glow=Math.max(anim.glow,cv.glow);if(a&&age>=1)animations.delete(plant.id);
  const sway=reduceMotion?0:Math.sin(t/2100+tile.x*1.2+tile.y)*.018;
  const selectedPlant=selected?.kind==='plant'&&selected.id===plant.id;
  if(selectedPlant&&footprintOf(v)[0]===2){ctx.save();ctx.strokeStyle='#fbefb8';ctx.lineWidth=1.8*z;for(const cell of footprintCells(tile,v)){const cp=project(cell.x,cell.y);diamond(ctx,cp.x,cp.y,CELL_W*z-7*z,CELL_H*z-5*z);ctx.stroke();}ctx.restore();}
  if(mature&&!revealSeen.has(plant.id)){revealSeen.add(plant.id);if(plant.readyAt>0&&now()-plant.readyAt<1500)burst(p.x,p.y-20*z,'reveal',t);}
  if(!mature){
   drawSoil(p,.75);const size=.28+progress*.25;ctx.save();ctx.translate(p.x,p.y+4*z);ctx.rotate(Math.sin(t/1700)*.05);ctx.fillStyle='#6e9b60';ctx.beginPath();ctx.ellipse(-5*z,-9*z,7*z,3*z,-.6,0,TAU);ctx.ellipse(5*z,-12*z,8*z,3.5*z,.5,0,TAU);ctx.fill();ctx.strokeStyle='#668a52';ctx.lineWidth=2*z;line(ctx,{x:0,y:0},{x:0,y:-15*z});ctx.restore();
   const remaining=Math.max(1,Math.ceil((plant.readyAt-now())/1000));const label=durationLabel(remaining*1000);ctx.font=`500 ${10*z}px system-ui`;const tw=ctx.measureText(label).width;
   roundRect(ctx,p.x-tw/2-7*z,p.y-40*z,tw+14*z,20*z,10*z);ctx.fillStyle='#fdf9ebe6';ctx.fill();ctx.fillStyle='#5d7564';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,p.x,p.y-30*z);
   ctx.strokeStyle='#8cae78';ctx.lineWidth=2*z;ctx.beginPath();ctx.arc(p.x,p.y+4*z,25*z,-Math.PI/2,-Math.PI/2+progress*TAU);ctx.stroke();
   hitRegions.push({kind:'plant',id:plant.id,x:p.x-25*z,y:p.y-43*z,w:50*z,h:55*z});hitRegions.push({kind:'plant',id:plant.id,countdown:true,x:p.x-tw/2-7*z,y:p.y-40*z,w:tw+14*z,h:20*z});return;
  }
  const sprite=assets.sprite(v.artKey),baseWidth=(sprite?.width??86)*z*(plant.scale??1);
  const desired=desiredExpression(control,t),expressionTarget=desired!=='base'&&assets.hasInteractionFrame(v.artKey,desired)?desired:'base';
  const expression=advanceExpression(expressionTransitions.get(plant.id),expressionTarget,t);expressionTransitions.set(plant.id,expression);const expressionAmount=1-(expression.weights.base??0);
  if(control?.kind==='puff'&&expressionAmount>0){anim.sx=1+(anim.sx-1)*(1-expressionAmount*.85);anim.sy=1+(anim.sy-1)*(1-expressionAmount*.85);anim.dy*=1-expressionAmount;}

  const f=sprite?.frame??{w:1,h:1},ab=sprite?.alphaBounds??{x:0,y:0,w:f.w,h:f.h},an=sprite?.anchor??[.5,1],dh=baseWidth*f.h/f.w;
  const body={x:p.x+(ab.x/f.w-an[0])*baseWidth,y:p.y+8*z+(ab.y/f.h-an[1])*dh,w:ab.w/f.w*baseWidth,h:ab.h/f.h*dh};
  const coversAvatar=avatarP&&p.y>avatarP.y+4*z&&coversAvatarHead(body,avatarP,z);
  const fade=coversAvatar ? .55 : 1;
  ctx.save();ctx.globalAlpha=fade;
  if(selectedPlant||anim.glow){const glow=ctx.createRadialGradient(p.x,p.y-23*z,2*z,p.x,p.y-23*z,60*z);glow.addColorStop(0,`rgba(255,241,175,${.12+anim.glow*.32})`);glow.addColorStop(1,'rgba(255,244,190,0)');ctx.fillStyle=glow;ctx.fillRect(p.x-65*z,p.y-90*z,130*z,100*z);}
  ctx.fillStyle='#596e4b20';ctx.beginPath();ctx.ellipse(p.x,p.y+8*z,baseWidth*.29,9*z,0,0,TAU);ctx.fill();
  if(selectedPlant){ctx.strokeStyle='#f9edb8';ctx.lineWidth=2*z;ctx.beginPath();ctx.ellipse(p.x,p.y+7*z,30*z,12*z,0,0,TAU);ctx.stroke();}
  ctx.translate(p.x,p.y+8*z+anim.dy*z);ctx.rotate(sway+anim.rotation);ctx.scale(anim.sx,anim.sy);
  const artReady=assets.images?!!assets.images.get(sprite?.image)?.ready:true,artOpacity=loadingReveal.opacity(`plant:${plant.id}`,artReady,t,reduceMotion);let drawn=false;const opacity=ctx.globalAlpha;for(const [state,weight]of Object.entries(expression.weights)){if(weight<=0)continue;ctx.globalAlpha=opacity*weight*artOpacity;drawn=(state==='base'?assets.draw(ctx,v.artKey,0,0,baseWidth):assets.drawInteraction(ctx,v.artKey,state,0,0,baseWidth))||drawn;}ctx.globalAlpha=opacity;ctx.restore();
  if(v.artKey==='giant_moon_mushroom'&&control?.lit){ctx.save();const moon=ctx.createRadialGradient(p.x,p.y-baseWidth*.54,3*z,p.x,p.y-baseWidth*.54,baseWidth*.24);moon.addColorStop(0,'#fff1b58c');moon.addColorStop(1,'#fff5c000');ctx.fillStyle=moon;ctx.fillRect(p.x-baseWidth*.3,p.y-baseWidth*.84,baseWidth*.6,baseWidth*.6);ctx.restore();}
  if(!drawn||artOpacity<1){ctx.save();ctx.globalAlpha*=fade*(drawn?1-artOpacity:1);drawLoadingPlaceholder(ctx,{x:p.x,y:p.y,zoom:z,kind:'plant',footprint:footprintOf(v),height:footprintOf(v)[0]===2?70:38,time:t,reduceMotion});ctx.restore();}
  const h=baseWidth*((sprite?.frame?.h??1)/(sprite?.frame?.w??1)),instrumentArt={x:p.x,y:p.y+8*z+anim.dy*z,width:baseWidth,height:h,anchor:an,angle:sway+anim.rotation,sx:anim.sx,sy:anim.sy};
  const pulse=contactPulses.get(plant.id),pu=pulse?Math.min(1,(t-pulse.at)/420):1;
  if(pulse&&pu<1){ctx.save();ctx.globalAlpha=1-pu;ctx.strokeStyle=pulse.type==='drum'?'#fff0a9':'#f5e6ff';ctx.lineWidth=1.7*z;const landmark=pulse.type==='drum'?sprite?.interactionLandmarks?.drumZones?.[pulse.zone]:null,point=landmark?landmarkScreenPoint(instrumentArt,landmark):{x:p.x+(pulse.type==='drum'?(pulse.zone===0?-.16:.16):((pulse.note??1)-1)*.23)*baseWidth,y:p.y-h*(pulse.type==='drum'?.67:.44)},px=point.x,py=point.y;ctx.beginPath();ctx.ellipse(px,py,(6+pu*16)*z,(3+pu*8)*z,0,0,TAU);ctx.stroke();ctx.restore();}
  if(control?.kind==='keyboard'&&control.active){ctx.save();const landmark=sprite?.interactionLandmarks?.keyboardKeys?.[control.key],point=landmark?landmarkScreenPoint(instrumentArt,landmark):{x:p.x+(control.key-2)*baseWidth*.115,y:p.y-h*.3},kx=point.x,ky=point.y;ctx.fillStyle='#fff5ac';ctx.shadowColor='#fff0a1';ctx.shadowBlur=8*z;roundRect(ctx,kx-5*z,ky-4*z,10*z,6*z,2*z);ctx.fill();ctx.restore();}
  if(control?.kind==='puff'&&control.active){const pressure=control.pressure??0;ctx.strokeStyle='#fff3bd';ctx.lineWidth=2.5*z;ctx.beginPath();ctx.arc(p.x,p.y+9*z,baseWidth*.4,Math.PI*.1,Math.PI*.1+Math.PI*.8*pressure);ctx.stroke();}
  if(control?.kind==='sleep'&&control.active&&control.dreamed){ctx.fillStyle='#fff5d1';ctx.font=`500 ${14*z}px Georgia`;ctx.textAlign='center';ctx.fillText('z',p.x+baseWidth*.34,p.y-h*.7-Math.sin(t/500)*3*z);}
  const bounds=sprite?.alphaBounds??{x:0,y:0,w:sprite?.frame?.w??1,h:sprite?.frame?.h??1},fw=sprite?.frame?.w??1,fh=sprite?.frame?.h??1,anchor=sprite?.anchor??[.5,1];
  const hx=p.x+(bounds.x/fw-anchor[0])*baseWidth,hy=p.y+8*z+(bounds.y/fh-anchor[1])*h,hw=bounds.w/fw*baseWidth,hh=bounds.h/fh*h;hitRegions.push({kind:'plant',id:plant.id,x:hx-3*z,y:hy-3*z,w:hw+6*z,h:hh+6*z,artHit:expressionAmount>0?null:{key:v.artKey,x:p.x,y:p.y+8*z+anim.dy*z,width:baseWidth,height:h,anchor,angle:sway+anim.rotation,sx:anim.sx,sy:anim.sy}});
 }
 function drawExhibit(exhibit,t,avatarP){
  const [fw,fh]=buildingFootprint(world,exhibit),center=buildingCenter(world,exhibit),p=project(center.x,center.y),z=camera.zoom;
  const expanding=mode?.kind==='land'||mode?.kind==='platform';
  if(!isBuilt(exhibit,now())){ctx.save();if(expanding)ctx.globalAlpha*=.35;const bounds=drawBuildingWorksite(ctx,assets,p,exhibit,now(),z);ctx.restore();hitRegions.push({kind:'exhibit',id:exhibit.id,...bounds});return;}
  const sprite=assets.sprite(exhibit.artKey),w=(sprite?.width??180)*(exhibit.scale??1)*z,f=sprite?.frame??{w:1,h:1},h=w*f.h/f.w,anchor=sprite?.anchor??[.5,1],visual=exhibitVisual(controls.get(exhibit.id),t),pulse=contactPulses.get(exhibit.id),age=pulse?(t-pulse.at)/700:1;
  const artReady=assets.images?!!assets.images.get(sprite?.image)?.ready:true;
  const hover=roadsterHoverSample(exhibit.interaction==='hover'?t-(controls.get(exhibit.id)?.hoverAt??-Infinity):Infinity,reduceMotion),lift=hover.lift*z;
  const body={x:p.x-w*anchor[0],y:p.y+6*z-h*anchor[1]-lift,w,h};
  ctx.save();if(expanding)ctx.globalAlpha=.35;
  ctx.save();ctx.globalAlpha*=hover.shadowAlpha;ctx.fillStyle='#596e4b20';ctx.beginPath();ctx.ellipse(p.x,p.y+7*z,w*.35*hover.shadowScale,14*z*hover.shadowScale,0,0,TAU);ctx.fill();ctx.restore();
  if(artReady)drawRoadsterJets(ctx,body,sprite?.jetAnchors,hover,z,reduceMotion);
  if(selected?.kind==='exhibit'&&selected.id===exhibit.id){ctx.strokeStyle='#f8edb5';ctx.lineWidth=2*z;ctx.beginPath();ctx.ellipse(p.x,p.y+6*z,w*.4,18*z,0,0,TAU);ctx.stroke();}
  const artOpacity=loadingReveal.opacity(`exhibit:${exhibit.id}`,artReady,t,reduceMotion);ctx.save();ctx.globalAlpha*=artOpacity;ctx.translate(p.x,p.y+6*z-lift);ctx.scale(1+visual.breath,1-visual.breath);ctx.rotate(visual.breeze*.018);const drawn=assets.draw(ctx,exhibit.artKey,0,0,w);ctx.restore();
  if(!drawn||artOpacity<1){ctx.save();ctx.globalAlpha*=drawn?1-artOpacity:1;drawLoadingPlaceholder(ctx,{x:p.x,y:p.y,zoom:z,footprint:buildingFootprint(world,exhibit),time:t,reduceMotion});ctx.restore();}
  if(drawn&&exhibit.artKey==='fluffy_cat_cottage'){const feedingAt=controls.get(exhibit.id)?.feedingAt;if(Number.isFinite(feedingAt))drawCatFeeding(ctx,assets,body,t-feedingAt,reduceMotion,sprite?.catFeeding);}
  if(drawn)drawPersonalExhibitReaction(ctx,exhibit.interaction,body,sprite,personalExhibitReactionSample(exhibit.interaction,t-(controls.get(exhibit.id)?.reactionAt??-Infinity),reduceMotion),z);
  // Overlay reactions stay local and follow the building's actual illustrated landmarks.
  if(exhibit.interaction==='rehearsal'&&visual.note!==null){const zone=visual.note,pos=zone===0?{x:-.17,y:-.47}:zone===1?{x:0,y:-.43}:{x:-.09,y:-.16};ctx.fillStyle='#fff3ad77';ctx.beginPath();const landmark=sprite?.interactionLandmarks?.rehearsalZones?.[zone],point=landmark?{x:body.x+landmark[0]*w,y:body.y+landmark[1]*h}:{x:p.x+pos.x*w,y:p.y+pos.y*h};ctx.ellipse(point.x,point.y,w*(landmark?(zone===2?.14:.09):(zone===2?.14:.13)),h*(landmark?(zone===2?.035:.07):.1),0,0,TAU);ctx.fill();}
  if(exhibit.interaction==='purr'&&visual.warmth>0){ctx.globalAlpha*=visual.warmth;ctx.fillStyle='#f8d89455';ctx.beginPath();ctx.ellipse(p.x,p.y-h*.2,w*.18,h*.14,0,0,TAU);ctx.fill();if(visual.page){ctx.strokeStyle='#fdf4d0';ctx.lineWidth=1.6*z;const flutter=Math.sin(t/150)*5*z;line(ctx,{x:p.x-w*.22,y:p.y-h*.12},{x:p.x-w*.15,y:p.y-h*.15-flutter});line(ctx,{x:p.x-w*.15,y:p.y-h*.15-flutter},{x:p.x-w*.08,y:p.y-h*.12});}}
  if(exhibit.interaction==='camp'&&visual.lit){ctx.fillStyle='#ffed9d88';ctx.beginPath();ctx.ellipse(p.x-w*.29,p.y-h*.19,8*z,11*z,0,0,TAU);ctx.fill();ctx.strokeStyle='#faf0c299';ctx.lineWidth=1.3*z;for(let i=0;i<3;i++){const yy=p.y-h*.61-(t/70+i*8)%23*z;ctx.beginPath();ctx.ellipse(p.x+w*.28+Math.sin(t/500+i)*3*z+visual.breeze*9*z,yy,4*z,2*z,0,0,Math.PI);ctx.stroke();}}
  if(exhibit.interaction==='camp'&&controls.has(exhibit.id)&&!visual.lit){ctx.fillStyle='#615c4b99';ctx.beginPath();ctx.ellipse(p.x-w*.29,p.y-h*.19,5*z,8*z,0,0,TAU);ctx.fill();}
  if(pulse&&age<1&&['ink','stride','chime'].includes(pulse.type)){ctx.save();ctx.globalAlpha*=1-age;ctx.strokeStyle='#fff0af';ctx.fillStyle='#fff0af';ctx.lineWidth=1.5*z;if(pulse.type==='ink'){const inkAnchor=sprite?.inkAnchor??[.51,.07],tip={x:body.x+w*inkAnchor[0],y:body.y+h*inkAnchor[1]};ctx.beginPath();ctx.arc(tip.x,tip.y,4*z+age*10*z,0,TAU);ctx.stroke();for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(tip.x+Math.sin(age*5+i)*7*z,tip.y-age*40*z-i*6*z,1.7*z,3*z,0,0,TAU);ctx.fill();}}else if(pulse.type==='stride'){for(let i=0;i<3;i++){const q=project(center.x+.3+i*.25,center.y+.75);ctx.beginPath();ctx.ellipse(q.x,q.y-age*4*z,4*z,2*z,-.4,0,TAU);ctx.fill();}}else{const q={x:body.x+w*(sprite?.pendantAnchor?.[0]??.52),y:body.y+h*(sprite?.pendantAnchor?.[1]??.38)};for(let i=0;i<2;i++){ctx.beginPath();ctx.arc(q.x,q.y,(9+age*22+i*10)*z,-.8,2.3);ctx.stroke();}}ctx.restore();}
  if(pulse&&age<1){ctx.globalAlpha*=1-age;ctx.fillStyle='#fff0b3';ctx.font=`${14*z}px serif`;ctx.textAlign='center';ctx.fillText(({ink:'·',stride:'· ·',chime:'✦',page:'♪',purr:'·',meow:'喵',game:'✦',stitch:'· ·',scan:'◌',lap:'1',pulse:'·',hug:'♡',tempo:'· ·'}[pulse.type]??'♫'),p.x,p.y-h*(.65+age*.2));}
  ctx.restore();const b=sprite?.alphaBounds??{x:0,y:0,w:f.w,h:f.h};hitRegions.push({kind:'exhibit',id:exhibit.id,x:body.x+b.x/f.w*w,y:body.y+b.y/f.h*h,w:b.w/f.w*w,h:b.h/f.h*h,artHit:{key:exhibit.artKey,x:p.x,y:p.y+6*z-lift,width:w,height:h,anchor,angle:visual.breeze*.018,sx:1+visual.breath,sy:1-visual.breath}});
 }
 function drawSeedFlights(t){seedFlights=seedFlights.filter(s=>t-s.at<900);for(const s of seedFlights){const u=Math.min(1,(t-s.at)/900),e=u*u*(3-2*u),cx=(s.x+s.tx)/2,cy=Math.min(s.y,s.ty)-85,x=(1-e)*(1-e)*s.x+2*(1-e)*e*cx+e*e*s.tx,y=(1-e)*(1-e)*s.y+2*(1-e)*e*cy+e*e*s.ty;ctx.save();ctx.globalAlpha=Math.min(1,(1-u)*5);ctx.translate(x,y);ctx.rotate(u*2);ctx.fillStyle='#e0bd78';ctx.strokeStyle='#8c7854';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(0,0,5,7,-.3,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#8ca767';ctx.beginPath();ctx.ellipse(4,-7,5,2,-.7,0,TAU);ctx.fill();ctx.restore();}}
 function edgeGeometry(edge){
  const tile=world.tiles.find(t=>t.id===edge.tileId);if(!tile)return null;
  const d={north:[[-.5,-.5],[.5,-.5]],east:[[.5,-.5],[.5,.5]],south:[[.5,.5],[-.5,.5]],west:[[-.5,.5],[-.5,-.5]]}[edge.edge];
  const a=project(tile.x+d[0][0],tile.y+d[0][1]),b=project(tile.x+d[1][0],tile.y+d[1][1]);return {a,b,m:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
 }
 function drawEdge(edge,avatarP){
  const g=edgeGeometry(edge);if(!g)return;const {a,b,m}=g,z=camera.zoom,h=(edge.kind==='wall'?17:25)*z;
  if(!isBuilt(edge,now())){const progress=constructionProgress(edge,now());ctx.save();ctx.strokeStyle='#a58e67';ctx.lineWidth=3*z;ctx.setLineDash([4*z,3*z]);line(ctx,a,b);ctx.setLineDash([]);for(const p of [a,b])line(ctx,p,{x:p.x,y:p.y-h*(.3+progress*.7)});drawWorkBadge(ctx,m,edge,now(),z,-h/z-25);ctx.restore();hitRegions.push({kind:'edge',id:edge.id,a,b,edgeHeight:h,x:Math.min(a.x,b.x)-8*z,y:Math.min(a.y,b.y)-h-20*z,w:Math.abs(a.x-b.x)+16*z,h:Math.abs(a.y-b.y)+h+24*z});return;}
  const selectedPlant=selected?.kind==='plant'?world.plants.find(p=>p.id===selected.id):null,selectedTile=world.tiles.find(t=>t.id===selectedPlant?.tileId),selectedP=selectedTile?project(selectedTile.x,selectedTile.y):null;
  ctx.save();if([avatarP,selectedP].some(p=>p&&m.y>p.y&&m.y-p.y<65*z&&Math.abs(m.x-p.x)<65*z))ctx.globalAlpha=.43;
  const selectedEdge=selected?.kind==='edge'&&selected.id===edge.id;
  ctx.lineCap='round';
  if(edge.kind==='fence'){
   ctx.strokeStyle=selectedEdge?'#f9ecc3':'#675d45';ctx.lineWidth=6*z;for(const p of [a,b])line(ctx,{x:p.x,y:p.y+2*z},{x:p.x,y:p.y-h});
   ctx.strokeStyle='#c8a06c';ctx.lineWidth=5*z;line(ctx,{x:a.x,y:a.y-h*.72},{x:b.x,y:b.y-h*.72});line(ctx,{x:a.x,y:a.y-h*.27},{x:b.x,y:b.y-h*.27});
   ctx.strokeStyle='#efd09a';ctx.lineWidth=1.5*z;line(ctx,{x:a.x,y:a.y-h*.77},{x:b.x,y:b.y-h*.77});
  }else{
   ctx.strokeStyle=selectedEdge?'#e8e0bc':'#7e887a';ctx.lineWidth=14*z;line(ctx,{x:a.x,y:a.y-h*.45},{x:b.x,y:b.y-h*.45});
   ctx.strokeStyle='#d6d5bb';ctx.lineWidth=8*z;line(ctx,{x:a.x,y:a.y-h},{x:b.x,y:b.y-h});
   ctx.strokeStyle='#919c91';ctx.lineWidth=1*z;for(let i=0;i<4;i++){const u=(i+.5)/4,x=a.x+(b.x-a.x)*u,y=a.y+(b.y-a.y)*u;line(ctx,{x,y:y-h*.8},{x,y:y-h*.15});}
  }
  ctx.restore();hitRegions.push({kind:'edge',id:edge.id,a,b,edgeHeight:h,x:Math.min(a.x,b.x)-8*z,y:Math.min(a.y,b.y)-h-6*z,w:Math.abs(a.x-b.x)+16*z,h:Math.abs(a.y-b.y)+h+12*z});
 }
 function drawCandidates(t){
  if(!mode)return;const z=camera.zoom;
  if(['plant','restore','construct-building','restore-building','relocate-building'].includes(mode.kind)){
   const buildingMode=['construct-building','restore-building','relocate-building'].includes(mode.kind),moving=mode.kind==='relocate-building'?(world.exhibits??[]).find(b=>b.id===mode.buildingId):null,v=varieties[mode.varietyId];if(!buildingMode&&!v)return;
   const validAnchors=world.tiles.filter(tile=>buildingMode?tile.id!==moving?.tileId&&canReserveBuilding(world,tile.id,varieties,moving?.id??null,now(),life.sample(performance.now()),moving??mode):canPlacePlant(world,v,tile.id,varieties,null,now()));
   for(const tile of validAnchors){const p=project(tile.x,tile.y);ctx.fillStyle='#f7efc650';ctx.strokeStyle='#fbf3c2';ctx.lineWidth=1.4*z;diamond(ctx,p.x,p.y,CELL_W*z-16*z,CELL_H*z-9*z);ctx.fill();ctx.stroke();}
   const cell=hover??world.tiles.find(t=>t.id===mode.preferredTileId)??validAnchors[0]??world.tiles.find(t=>t.kind==='land');if(!cell)return;
   const preview=buildingMode?buildingPlacementPreview(world,cell,varieties,now(),moving?.id??null,moving??mode):placementPreview(world,v,cell,varieties,now());if(buildingMode)preview.valid=preview.valid&&canReserveBuilding(world,preview.tileId,varieties,moving?.id??null,now(),life.sample(performance.now()),moving??mode);const giant=preview.footprint[0]===2;
   if(buildingMode||giant||hover){for(const c of preview.cells){const p=project(c.x,c.y);ctx.fillStyle=preview.valid?'#fff1b950':'#e7a28b48';ctx.strokeStyle=preview.valid?'#fff4b9':'#bb7967';ctx.lineWidth=2*z;ctx.setLineDash([4*z,3*z]);diamond(ctx,p.x,p.y,CELL_W*z-5*z,CELL_H*z-4*z);ctx.fill();ctx.stroke();ctx.setLineDash([]);}
    const c=project(cell.x+(preview.footprint[0]-1)/2,cell.y+(preview.footprint[1]-1)/2);ctx.fillStyle=preview.valid?'#657a55':'#986b5c';ctx.textAlign='center';ctx.font=`500 ${10*z}px system-ui`;ctx.fillText((buildingMode||giant)?(preview.valid?`${preview.footprint.join('×')} · 可以摆放`:preview.unchanged?'原位置 · 不收取费用':buildingMode?`需要${preview.footprint.join('×')}空位 · 留出屋外走道`:'需要 2×2 空土地'):(preview.valid?'放在这里':'这里放不下'),c.x,c.y+32*z);
   }
  }else if(['land','platform','move-tile'].includes(mode.kind)){
   for(const cell of (['land','platform'].includes(mode.kind)?buildPlacementCells(world.tiles,now()):placementCells(world.tiles))){const p=project(cell.x,cell.y),isHover=hover?.x===cell.x&&hover?.y===cell.y;
    ctx.fillStyle=isHover?'#f5edbb9a':'#f4f3d84d';ctx.strokeStyle=isHover?'#fff6d4':'#eff4ddba';ctx.lineWidth=1.5*z;ctx.setLineDash([5*z,4*z]);diamond(ctx,p.x,p.y,CELL_W*z-5*z,CELL_H*z-4*z);ctx.fill();ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#63867a';ctx.font=`400 ${21*z}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('+',p.x,p.y);
    hitRegions.push({kind:'candidate',x:p.x-CELL_W*z/2,y:p.y-CELL_H*z/2,w:CELL_W*z,h:CELL_H*z,cell});
   }
  }else if(mode.kind==='fence'||mode.kind==='wall'||mode.kind==='move-edge'){
   ctx.strokeStyle='#fff3b8';ctx.lineWidth=2*z;ctx.setLineDash([4*z,4*z]);for(const tile of world.tiles.filter(tile=>isBuilt(tile,now()))){const p=project(tile.x,tile.y);diamond(ctx,p.x,p.y,CELL_W*z-5*z,CELL_H*z-3*z);ctx.stroke();}ctx.setLineDash([]);
  }
 }
 function burst(x,y,kind,t,limit=null){
  if(reduceMotion)return;const count=limit??(kind==='bubble'?9:kind==='wave'?12:kind==='whisper'?5:14);
  for(let i=0;i<count;i++){const angle=(i/count)*TAU,spread=kind==='wave'?1.5:1;particles.push({x,y,kind,vx:Math.cos(angle)*(18+(i%3)*13)*spread,vy:Math.sin(angle)*20-24-(i%4)*10,at:t,duration:kind==='firefly'?2600:900+(i%4)*100,size:kind==='firefly'?1.8:2+(i%3)*1.6,color:['#fff2b3','#f5d8a9','#c9e5c0','#e8d7f3','#9ed5d5'][i%5]});}
 }
 function drawParticles(t){particles=particles.filter(p=>t-p.at<p.duration);for(const p of particles){const u=(t-p.at)/p.duration,z=camera.zoom,x=p.x+p.vx*u*z,y=p.y+(p.vy*u+35*u*u)*z;ctx.globalAlpha=(1-u)*.9;ctx.fillStyle=p.color;ctx.strokeStyle=p.color;ctx.lineWidth=1.2*z;
  if(p.kind==='firefly'){ctx.fillStyle='#fff0a0';ctx.shadowColor='#fff5a6';ctx.shadowBlur=5*z;ctx.beginPath();ctx.arc(x+Math.sin(u*12+p.vx)*7*z,y+Math.cos(u*10+p.vy)*5*z,1.8*z,0,TAU);ctx.fill();ctx.shadowBlur=0;}
  else if(p.kind==='bubble'){ctx.beginPath();ctx.arc(x,y-p.size*u*6,p.size*(1+u)*z,0,TAU);ctx.stroke();}
  else if(p.kind==='wave'){ctx.beginPath();ctx.ellipse(x,y,7*z*(1+u),2*z,0,0,Math.PI);ctx.stroke();}
  else if(['bell','keyboard','gramophone'].includes(p.kind)){ctx.font=`${(12+p.size)*z}px serif`;ctx.textAlign='center';ctx.fillText(p.kind==='bell'?'♪':'♫',x,y);}
  else{ctx.beginPath();ctx.arc(x,y,p.size*z*(1-u*.5),0,TAU);ctx.fill();}
 }ctx.globalAlpha=1;}
 const stepContact=(id,state,event)=>world?.exhibits?.some(e=>e.id===id)?stepExhibitControl(state,event):stepPlantControl(state,event);
 function emitControl(plantId,result,phase,t){
  controls.set(plantId,result.state);const exhibit=world?.exhibits?.find(e=>e.id===plantId),plant=world?.plants.find(p=>p.id===plantId),v=plant&&varieties[plant.varietyId],center=exhibit?buildingCenter(world,exhibit):plant?plantCenter(world,plant,v):null,kind=result.state.kind;
  if(exhibit?.artKey==='fluffy_cat_cottage'&&result.events.some(e=>e.type==='feed')&&assets.interactionReady?.('fluffy_cat_cottage')===false){result.state.feedingAt=-Infinity;result.events=result.events.filter(e=>e.type!=='feed');feedingQueue.request(plantId);}
  for(const event of result.events){
   if(['ink','stride','chime','drum','bell','ensemble','purr','page','camp','meow','game','stitch','scan','lap','pulse','hug','tempo'].includes(event.type))contactPulses.set(plantId,{...event,at:t});
   if(['drum','bell','key','pop','tap','yawn','poke','game','hug','pulse','scan','tempo'].includes(event.type))animations.set(plantId,{kind,at:t,duration:event.type==='pop'?650:kind==='sleep'?1500:650});
   if(center&&(!exhibit||['page','camp'].includes(event.type))){const p=project(center.x,center.y);if(v&&footprintOf(v)[0]===2){const w=(assets.sprite(v.artKey)?.width??224)*camera.zoom;if(v.artKey==='giant_bubble_lotus'){p.x-=w*.18;p.y-=w*.46;}else p.y-=w*.38;}if(event.type==='wave')burst(p.x+result.state.displacement*25*camera.zoom,p.y+4*camera.zoom,'wave',t);else burst(p.x,p.y-32*camera.zoom,event.type==='fireflies'?'firefly':event.type==='dream'?'float':kind,t);}
  }
  const callback=exhibit?onExhibitInteraction:onInteraction;callback({plantId,kind,phase,events:result.events,pressure:result.state.pressure,displacement:result.state.displacement,lit:result.state.lit});
 }
 function normalizeContact(contact,event){
  const rect=canvas.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top},art=contact.region.artHit,geometry=art&&assets.sprite(art.key)?.interactionLandmarks;
  return {...(geometry?landmarkContactPoint(art,point):{x:(point.x-contact.region.x)/contact.region.w,y:(point.y-contact.region.y)/contact.region.h}),geometry,at:performance.now()};
 }
 function step(t){
  if(disposed)return;frame=requestAnimationFrame(step);if(document.hidden)return;
  if(pendingTouch&&pointers.size===1&&t-pendingTouch.at>=150)commitTouch(t);
  if(t-lastFrame<30)return;lastFrame=t;
  advanceLife(t);
  for(const contact of pointerControls.values()){const control=controls.get(contact.plantId);if(control?.active){const result=stepContact(contact.plantId,control,{type:'hold',x:control.x,y:control.y,at:t});controls.set(contact.plantId,result.state);if(result.events.length||t-(contact.lastHold??0)>100){contact.lastHold=t;emitControl(contact.plantId,result,'hold',t);}}}
  ctx.setTransform(dpr,0,0,dpr,0,0);drawWater(t);hitRegions=[];if(!world)return;if(needsFit)fit();else if(canopyFitPending&&!pointers.size&&!pointerControls.size)fit(false);
  const delta=follow.step(t,{owner:Number.isFinite(avatar.x)?{...project(avatar.x,avatar.y),moving:avatar.moving}:null,width,height,trayHeight,locked:!!(pointers.size||pointerControls.size||approachContact)});cameraPan.x+=delta.x;cameraPan.y+=delta.y;camera.x+=delta.x;camera.y+=delta.y;
  const order=[...world.tiles].sort((a,b)=>a.x+a.y-b.x-b.y||a.x-b.x);order.forEach(tile=>drawTile(tile,t));for(const prop of world.props??[])if(prop.layer==='ground'){const p=project(prop.x,prop.y);assets.draw(ctx,prop.artKey,p.x,p.y+(prop.yOffset??4)*camera.zoom,(prop.width??assets.sprite(prop.artKey)?.width??80)*(prop.scale??1)*camera.zoom);}
  drawCandidates(t);
  const actorPresent=Number.isFinite(avatar.x),ap=actorPresent?project(avatar.x,avatar.y):{x:-99999,y:-99999},entities=[];
  for(const plant of world.plants){const tile=world.tiles.find(x=>x.id===plant.tileId);if(tile)entities.push({depth:tile.x+tile.y+(footprintOf(varieties[plant.varietyId])[0]===2?2:.05),draw:()=>drawPlant(plant,t,ap)});}
  for(const exhibit of world.exhibits??[])entities.push({depth:exhibit.x+exhibit.y+buildingFootprint(world,exhibit).reduce((a,b)=>a+b,0)-2,draw:()=>drawExhibit(exhibit,t,ap)});
  for(const edge of world.edges??[]){const tile=world.tiles.find(x=>x.id===edge.tileId);if(tile)entities.push({depth:tile.x+tile.y+(['south','east'].includes(edge.edge)?.55:-.55),draw:()=>drawEdge(edge,ap)});}
  for(const prop of (world.props??[]).filter(p=>p.layer!=='ground')){entities.push({depth:prop.x+prop.y+(prop.depthOffset??0),draw:()=>{const p=project(prop.x,prop.y);assets.draw(ctx,prop.artKey,p.x,p.y+(prop.yOffset??4)*camera.zoom,(prop.width??assets.sprite(prop.artKey)?.width??80)*(prop.scale??1)*camera.zoom);}});}
  for(const resident of [...residentPoses,...(animalPose?[animalPose]:[])]){entities.push({depth:resident.x+resident.y+.08,draw:()=>{
   const p=project(resident.x,resident.y),z=camera.zoom,feetY=p.y+6*z-(resident.moving&&!reduceMotion?Math.abs(Math.sin(t/145))*2.2*z:0)+(t-ambientNodAt<700&&!reduceMotion?Math.sin((t-ambientNodAt)/110)*1.4*z:0);ctx.fillStyle='#4d6c5724';ctx.beginPath();ctx.ellipse(p.x,p.y+7*z,17*z,6*z,0,0,TAU);ctx.fill();assets.drawAvatar(ctx,resident.avatarKey,resident.direction,p.x,feetY,70*z,resident.mirror);
   if(!mode&&resident.interactive!==false){const a=assets.avatars?.avatars?.[resident.avatarKey],f=a?.[resident.direction]?.frame??a?.front?.frame??{w:45,h:78},h=(a?.displayHeight??78)/78*70*z,w=h*f.w/f.h,raw=a?.[resident.direction]?.anchor??a?.front?.anchor??[.5,1],ax=Array.isArray(raw)?raw[0]:raw.x,ay=Array.isArray(raw)?raw[1]:raw.y,mirror=!!(resident.mirror&&a?.mirrorForLeft);hitRegions.push({kind:'resident',id:resident.id,x:p.x-w*(mirror?1-ax:ax),y:feetY-h*ay,w,h,avatarHit:{key:resident.avatarKey,direction:resident.direction,mirror}});}
  }});}
  if(actorPresent)entities.push({depth:avatar.x+avatar.y+.1,draw:()=>{
   ctx.fillStyle='#4d6c5730';ctx.beginPath();ctx.ellipse(ap.x,ap.y+7*camera.zoom,20*camera.zoom,8*camera.zoom,0,0,TAU);ctx.fill();const bob=avatar.moving&&!reduceMotion?Math.abs(Math.sin(t/145))*2.2*camera.zoom:Math.sin(t/1500)*.7*camera.zoom+(t-ambientNodAt<700&&!reduceMotion?Math.sin((t-ambientNodAt)/110)*1.4*camera.zoom:0);
   ctx.save();if(avatar.moving&&!reduceMotion){ctx.translate(ap.x,ap.y);ctx.rotate(Math.sin(t/180)*.018);ctx.translate(-ap.x,-ap.y);}assets.drawAvatar(ctx,world.avatarKey??'niulai',avatar.direction,ap.x,ap.y+6*camera.zoom-bob,70*camera.zoom,avatar.mirror);ctx.restore();
  }});entities.sort((a,b)=>a.depth-b.depth).forEach(e=>e.draw());if(['fence','wall'].includes(mode?.kind)){const preview=hoverEdge??mode.edgePreview;displayedEdge=null;if(preview?.tileId&&!preview.invalid&&isBuilt(world.tiles.find(t=>t.id===preview.tileId)??{},now())&&validEdge(world,preview.tileId,preview.edge)){displayedEdge={tileId:preview.tileId,edge:preview.edge};const count=hitRegions.length;ctx.save();ctx.globalAlpha=.45;drawEdge({id:'edge-preview',tileId:preview.tileId,edge:preview.edge,kind:mode.kind},null);ctx.restore();hitRegions.length=count;}}drawParticles(t);drawSeedFlights(t);drawAmbientBubble();
 }
 function targetAt(clientX,clientY){
  const r=canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;
  const cell=isoCell(x,y,camera),tile=world?.tiles.find(t=>t.x===cell.x&&t.y===cell.y),p=tile?project(tile.x,tile.y):null;
  if(mode?.kind==='land'||mode?.kind==='platform'){const candidate=buildPlacementCells(world.tiles,now()).find(c=>c.x===cell.x&&c.y===cell.y);if(candidate)return {kind:'candidate',cell:candidate,point:{x,y}};}
  if(mode?.kind==='relocate-building')return tile?{kind:'tile',id:tile.id,tile,point:{x,y}}:{kind:'water',cell,point:{x,y}};
  if(mode&&['fence','wall','move-edge'].includes(mode.kind)&&tile)return {kind:'tile',id:tile.id,tile,edge:edgeAtPoint(x-p.x,y-p.y)};
  const verifiedHosts=new Set(),regions=[...hitRegions].reverse().filter(h=>{if(mode||h.kind!=='resident'||!h.avatarHit||!assets.avatarAlphaAt||x<h.x||x>h.x+h.w||y<h.y||y>h.y+h.h)return true;const u=(x-h.x)/h.w,v=(y-h.y)/h.h,a=h.avatarHit,alpha=assets.avatarAlphaAt(a.key,a.direction,a.mirror?1-u:u,v);if(alpha!==null&&alpha>=32)verifiedHosts.add(h);return alpha===null||alpha>=32;});
  // Promote only a confirmed visible host/plant through confirmed transparent art.
  // Unknown readback and opaque foreground silhouettes retain their old ownership.
  if(!mode){
   const inside=h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h;
   const artAlpha=h=>{if(!h.artHit||!assets.spriteAlphaAt)return null;const a=h.artHit,dx=x-a.x,dy=y-a.y,c=Math.cos(a.angle),s=Math.sin(a.angle);return assets.spriteAlphaAt(a.key,(c*dx+s*dy)/a.sx/a.width+a.anchor[0],(-s*dx+c*dy)/a.sy/a.height+a.anchor[1]);};
   for(let i=0;i<regions.length;i++){const candidate=regions[i];if(!inside(candidate)||!(candidate.kind==='resident'?verifiedHosts.has(candidate):candidate.kind==='plant'&&artAlpha(candidate)>=32))continue;
    const front=regions.slice(0,i).filter(h=>['plant','exhibit','resident'].includes(h.kind)&&inside(h));if(front.every(h=>{const alpha=h.kind==='resident'?null:artAlpha(h);return alpha!==null&&alpha<32;}))return {...candidate,point:{x,y}};
   }
  }
  const priority=mode?.kind==='edit'?['edge','interactive','candidate']:['interactive','candidate'];
  for(const kind of priority){const hit=regions.find(h=>(kind==='interactive'?['plant','exhibit',...(!mode?['resident']:[])].includes(h.kind):h.kind===kind)&&x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h&&(kind!=='edge'||Math.min(distanceToSegment({x,y},{x:h.a.x,y:h.a.y-h.edgeHeight*.35},{x:h.b.x,y:h.b.y-h.edgeHeight*.35}),distanceToSegment({x,y},{x:h.a.x,y:h.a.y-h.edgeHeight},{x:h.b.x,y:h.b.y-h.edgeHeight}))<9*camera.zoom));if(hit&&(kind!=='candidate'||(hit.cell.x===cell.x&&hit.cell.y===cell.y)))return {...hit,point:{x,y}};}
  if(tile)return {kind:'tile',id:tile.id,tile,edge:edgeAtPoint(x-p.x,y-p.y),point:{x,y}};
  return {kind:'water',cell,point:{x,y}};
 }
 const centerPointers=()=>{const ps=[...pointers.values()];return {x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2,d:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)};};
 function commitTouch(t){
  const touch=pendingTouch;pendingTouch=null;if(!touch||pointers.size!==1||!pointers.has(touch.pointerId))return false;
  const target=targetAt(touch.event.clientX,touch.event.clientY),exhibit=target.kind==='exhibit'?world?.exhibits?.find(b=>b.id===target.id):null,plant=target.kind==='plant'?world?.plants.find(p=>p.id===target.id):null,v=plant?varieties[plant.varietyId]:null;
  if(mode||target.id!==touch.targetId||target.kind!==touch.targetKind||!((exhibit&&isBuilt(exhibit,now()))||(plant&&v&&isMature(plant,now()))))return false;
  const targetKind=exhibit?'exhibit':'plant',entity=exhibit??plant,kind=exhibit?exhibit.interaction:v.interaction,contact={pointerId:touch.pointerId,plantId:entity.id,targetKind,kind,region:target,lastHold:0,event:touch.event,held:true};
  const result=approachTarget(targetKind,entity.id,t);drag=null;gate.cancel();
  if(result.ready)activateContact(contact,touch.event,t);
  else if(result.possible){approachContact=contact;onApproach({phase:'start',kind:targetKind,id:entity.id});}
  return true;
 }
 function down(e){if(e.pointerType!=='mouse')hoverEdge=null;const r=canvas.getBoundingClientRect();hover=isoCell(e.clientX-r.left,e.clientY-r.top,camera);onGesture();canvas.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gate.down(e);
  const growthPlant=growthPlantAt(e);if(growthPlant){growthPointers.add(e.pointerId);growthTap.handlePointerDown(e,growthPlant);}else growthTap.cancelPending();
  if(pointers.size>1){growthTap.cancelPending();}
  if(pointers.size>1){tapResident=null;pendingTouch=null;for(const [id,contact]of pointerControls){const old=controls.get(contact.plantId);if(old)emitControl(contact.plantId,stepContact(contact.plantId,old,{type:'cancel',x:old.x,y:old.y,at:performance.now()}),'cancel',performance.now());}pointerControls.clear();if(approachContact){onApproach({phase:'cancel',kind:approachContact.targetKind,id:approachContact.plantId});approachContact=null;life.cancelApproach(performance.now());}gate.cancel();}
  if(pointers.size===1){
   const target=targetAt(e.clientX,e.clientY);tapResident=!mode&&target.kind==='resident'?{id:target.id,worldId:world.id,x:e.clientX,y:e.clientY}:null;const exhibit=target.kind==='exhibit'?world?.exhibits?.find(b=>b.id===target.id):null,plant=target.kind==='plant'?world?.plants.find(p=>p.id===target.id):null,v=plant?varieties[plant.varietyId]:null;
   if(!mode&&((exhibit&&isBuilt(exhibit,now()))||(plant&&v&&isMature(plant,now()))))pendingTouch={pointerId:e.pointerId,targetId:target.id,targetKind:target.kind,at:performance.now(),event:{clientX:e.clientX,clientY:e.clientY}};
   drag={x:e.clientX,y:e.clientY,pan:{...cameraPan}};
  }else if(pointers.size===2){const p=centerPointers();pinch={...p,zoom:camera.zoom,pan:{...cameraPan}};drag=null;}
 }

 function move(e){if(!isUnpressedMouseMove(e))growthTap.handlePointerMove(e);if(!isUnpressedMouseMove(e)){hoverEdge=null;displayedEdge=null;}if(isUnpressedMouseMove(e)){const r=canvas.getBoundingClientRect();hover=isoCell(e.clientX-r.left,e.clientY-r.top,camera);if(['fence','wall'].includes(mode?.kind)){const tile=world.tiles.find(t=>t.x===hover.x&&t.y===hover.y),p=tile?project(tile.x,tile.y):null;hoverEdge=tile?{tileId:tile.id,edge:edgeAtPoint(e.clientX-r.left-p.x,e.clientY-r.top-p.y)}:null;}return;}gate.move(e);if(tapResident&&Math.hypot(e.clientX-tapResident.x,e.clientY-tapResident.y)>=7)tapResident=null;if(pendingTouch?.pointerId===e.pointerId&&Math.hypot(e.clientX-pendingTouch.event.clientX,e.clientY-pendingTouch.event.clientY)>=7)pendingTouch=null;if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(approachContact?.pointerId===e.pointerId){approachContact.event={clientX:e.clientX,clientY:e.clientY};return;}
  const contact=pointerControls.get(e.pointerId);if(contact){const point=normalizeContact(contact,e),result=stepContact(contact.plantId,controls.get(contact.plantId),{type:'move',...point});emitControl(contact.plantId,result,'move',point.at);return;}
  if(pointers.size===2&&pinch){follow.view(performance.now());const p=centerPointers();manualZoom=Math.max(.4,Math.min(2.2,pinch.zoom*p.d/Math.max(1,pinch.d)));cameraPan={x:pinch.pan.x+p.x-pinch.x,y:pinch.pan.y+p.y-pinch.y};fit(false);}
  else if(pointers.size===1&&drag){follow.view(performance.now());cameraPan={x:Math.max(-width,Math.min(width,drag.pan.x+e.clientX-drag.x)),y:Math.max(-height*.7,Math.min(height*.7,drag.pan.y+e.clientY-drag.y))};fit(false);}
 }
 function up(e){
  if(growthPointers.has(e.pointerId)){growthPointers.delete(e.pointerId);gate.up(e);gate.consume();pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!pointers.size)drag=null;growthTap.handlePointerUp(e,growthPlantAt(e));return;}
  if(pendingTouch?.pointerId===e.pointerId){if(Math.hypot(e.clientX-pendingTouch.event.clientX,e.clientY-pendingTouch.event.clientY)<7)commitTouch(performance.now());else pendingTouch=null;}
  if(approachContact?.pointerId===e.pointerId){approachContact.held=false;pointers.delete(e.pointerId);gate.cancel();onApproach({phase:'released',kind:approachContact.targetKind,id:approachContact.plantId});return;}
  const contact=pointerControls.get(e.pointerId);if(contact){const point=normalizeContact(contact,e),result=stepContact(contact.plantId,controls.get(contact.plantId),{type:'end',...point});pointerControls.delete(e.pointerId);pointers.delete(e.pointerId);gate.cancel();emitControl(contact.plantId,result,'end',point.at);if(!pointerControls.size)fit(false);return;}
  gate.up(e);pointers.delete(e.pointerId);if(gate.consume()&&world){const hit=tapResident?.worldId===world.id&&residentPoses.some(r=>r.id===tapResident.id)?{kind:'resident',id:tapResident.id}:targetAt(e.clientX,e.clientY);tapResident=null;onTap({...hit,pointerType:e.pointerType,...(mode&&['fence','wall'].includes(mode.kind)?{edgePreviewMatch:displayedEdge?.tileId===hit.tile?.id&&displayedEdge?.edge===hit.edge}:{})});}if(pointers.size<2)pinch=null;if(!pointers.size)drag=null;
 }
 const clearTransientReactions=()=>{for(const [id,c]of controls)if(c.kind==='hover'||Number.isFinite(c.reactionAt))controls.set(id,{...c,active:false,hoverAt:-Infinity,reactionAt:-Infinity});};
 const cancel=()=>{growthTap.cancelPending();growthPointers.clear();feedingQueue.cancel();clearTransientReactions();hoverEdge=null;displayedEdge=null;tapResident=null;pendingTouch=null;if(approachContact){onApproach({phase:'cancel',kind:approachContact.targetKind,id:approachContact.plantId});approachContact=null;life.cancelApproach(performance.now());}for(const contact of pointerControls.values()){const old=controls.get(contact.plantId);if(old)emitControl(contact.plantId,stepContact(contact.plantId,old,{type:'cancel',x:old.x,y:old.y,at:performance.now()}),'cancel',performance.now());}pointerControls.clear();gate.cancel();pointers.clear();drag=null;pinch=null;};
 function wheel(e){growthTap.cancelPending();hoverEdge=null;displayedEdge=null;follow.view(performance.now());pendingTouch=null;gate.cancel();e.preventDefault();manualZoom=Math.max(.4,Math.min(2.2,camera.zoom*Math.exp(-e.deltaY*.0015)));fit(false);}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('wheel',wheel,{passive:false});const blur=()=>{interruptActivity();cancel();};window.addEventListener('blur',blur);size();frame=requestAnimationFrame(step);
 return {
  setWorld(next,nextVarieties,options={}){const changed=world?.id!==next.id,previousTarget=world?.avatarTileId;world=next;varieties=nextVarieties;theme=options.theme??'home';
   const visibleCanopies=next.plants.filter(p=>isMature(p,now())&&ADVANCED_ART_KEYS.includes(nextVarieties[p.varietyId]?.artKey)).map(p=>`${p.id}:${assets.sprite(nextVarieties[p.varietyId].artKey)?.width??0}`).join('|')+'#'+(next.exhibits??[]).filter(b=>isBuilt(b,now())&&buildingSample(b.sampleId??b.artKey)?.sourceType==='memory').map(b=>`${b.id}:${assets.sprite(b.artKey)?.width??0}`).join('|');if(visibleCanopies!==canopySignature){canopySignature=visibleCanopies;if(manualZoom===null&&!cameraPan.x&&!cameraPan.y)canopyFitPending=true;}
   const catIds=(next.exhibits??[]).filter(e=>e.artKey==='fluffy_cat_cottage').map(e=>e.id),warmSignature=catIds.length?next.id+':'+catIds.join('|'):'';if(warmSignature!==catWarmSignature){catWarmSignature=warmSignature;if(catIds.length)assets.requestInteraction('fluffy_cat_cottage');}feedingQueue.retain(new Set(catIds));
   animal.setWorld(next,nextVarieties,performance.now());const previousResident=life.selectedResident;life.setWorld(next,nextVarieties,performance.now());if(previousResident&&!life.selectedResident)onApproach({phase:'cancel',kind:'resident',id:previousResident.id});
   if(approachContact&&!life.pending){onApproach({phase:'cancel',kind:approachContact.targetKind,id:approachContact.plantId});approachContact=null;gate.cancel();pointers.clear();}
   if(changed){follow.reset();cancel();revealSeen=new Set(next.plants.filter(p=>isMature(p,now())).map(p=>p.id));loadingReveal.clear();ambientBubble=null;ambientNodAt=-Infinity;seedFlights=[];controls.clear();animations.clear();contactPulses.clear();expressionTransitions.clear();}else{const ids=new Set([...next.plants,...(next.exhibits??[])].map(p=>p.id));for(const map of [controls,animations,contactPulses,expressionTransitions])for(const id of map.keys())if(!ids.has(id))map.delete(id);}if(changed||options.fit)fit(true);
  },
  setSceneActive(value){if(!value)growthTap.cancelPending();if(!value){feedingQueue.cancel();clearTransientReactions();}if(!value)for(const [id,c]of controls)if(c.kind==='meow')controls.set(id,{...c,feedingAt:-Infinity});sceneActive=!!value;animal.setActive(value,performance.now());if(!value)animalPose=null;const old=life.selectedResident;life.setSceneActive(value,performance.now());if(!value&&old)onApproach({phase:'cancel',kind:'resident',id:old.id});},getActorPosition(){const p=life.sample(performance.now());return {x:p.x,y:p.y};},noteOwnerActivity(options={}){interruptActivity(performance.now(),options);},cancelUncommittedTouch(){cancel();},setActivityAllowed(value){activityAllowed=!!value;},cancelResident(){const old=life.selectedResident;life.cancelResident(performance.now());if(old)onApproach({phase:'cancel',kind:'resident',id:old.id});},approachResident,walkToTile(id){follow.resume(performance.now());return life.walkTo(id,performance.now());},approachTarget,
  setSelection(value){selected=value;},setMode(value){if(value&&mode?.kind!==value.kind){feedingQueue.cancel();clearTransientReactions();}if(mode?.kind!==value?.kind||mode?.varietyId!==value?.varietyId){hover=null;hoverEdge=null;}mode=value;},
  setTrayHeight(value){if(Math.abs(trayHeight-value)>4){trayHeight=value;if(!pointerControls.size)fit(false);}},
  ensureSelectionVisible({top=125,bottom=height-100}){
   if(pointerControls.size||selected?.kind!=='plant')return 0;const plant=world?.plants.find(p=>p.id===selected.id),tile=world?.tiles.find(t=>t.id===plant?.tileId),v=plant&&varieties[plant.varietyId];if(!tile||!v)return 0;
   const center=plantCenter(world,plant,v),p=project(center.x,center.y),z=camera.zoom,s=assets.sprite(v.artKey),w=(s?.width??86)*z*(plant.scale??1),f=s?.frame??{w:1,h:1},h=w*f.h/f.w,a=s?.anchor??[.5,1],b=s?.alphaBounds??{x:0,y:0,w:f.w,h:f.h};
   const bounds=isMature(plant,now())?{y:p.y+8*z+(b.y/f.h-a[1])*h,h:b.h/f.h*h}:{y:p.y-43*z,h:55*z};if(ADVANCED_ART_KEYS.includes(v.artKey)&&bounds.h>bottom-top)return 0;const delta=minimalVerticalOffset(bounds,top,bottom);if(Math.abs(delta)>.5){cameraPan.y+=delta;fit(false);}return delta;
  },
  recenter(){cancel();follow.resume(performance.now());fit(true);},zoomBy(factor){cancel();follow.view(performance.now());manualZoom=Math.max(.4,Math.min(2.2,camera.zoom*factor));fit(false);},
  interact(plantId,kind){animations.set(plantId,{kind,at:performance.now(),duration:kind==='sleep'?1700:kind==='float'?1500:1050});const plant=world?.plants.find(p=>p.id===plantId),tile=world?.tiles.find(t=>t.id===plant?.tileId);if(tile){const p=project(tile.x,tile.y);burst(p.x,p.y-35*camera.zoom,kind,performance.now());}},
  shakeSeed(plantId){const plant=world?.plants.find(p=>p.id===plantId),v=plant&&varieties[plant.varietyId],center=plant&&plantCenter(world,plant,v);if(!center)return;const p=project(center.x,center.y),t=performance.now();animations.set(plantId,{kind:'seed-shake',at:t,duration:650});if(!reduceMotion)seedFlights=[...seedFlights.slice(-3),{x:p.x,y:p.y-35*camera.zoom,tx:width*.88,ty:height-47,at:t}];},
  showBurst(tileId,kind='reveal'){const tile=world?.tiles.find(t=>t.id===tileId);if(tile){const p=project(tile.x,tile.y);burst(p.x,p.y-12*camera.zoom,kind,performance.now());}},
  cancelInteractions(){cancel();},cancelGrowthTap(){growthTap.cancelPending();},
  getCamera:()=>({...camera}),
  dispose(){disposed=true;growthTap.dispose();feedingQueue.dispose();controls.clear();animal.dispose();animalPose=null;life.dispose();residentPoses=[];ambientBubble=null;cancelAnimationFrame(frame);observer.disconnect();for(const [event,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['wheel',wheel]])canvas.removeEventListener(event,fn);window.removeEventListener('blur',blur);},
 };
}
