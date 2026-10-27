import {plantApproachRoute} from './plant-approach.js';
import {createResidentLife} from './resident-life.js';
import {createTileWalker,findTilePath,preferredTileRoute} from './visual-walk.js';
import {completedTerrain,isBuilt} from './construction.js';
import {avatarStandPoint} from './scene-math.js';
import {plantCenter,plantAtTile,buildingAtTile} from './footprints.js';
import {isMature} from './state.js';
import {walkableTerrain,containsPoint,tileRoute} from './navigation.js';
import {buildingCells,buildingCenter} from './footprints.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const SOLO=['这块阳光，适合发一会儿呆。','我只是路过，顺便看看你长大了没。','风把叶子翻到了下一页。','今天的巡岛任务：慢一点。','这里要是再长一朵云就好了。','嘘，我在听小岛说话。'];
const DIALOGUE={anime:[['红窗后面藏着什么故事？','先别急，让银色的枝叶说完。'],['这只蜘蛛也会织梦吗？','它只把秘密留给认真看的人。']],toy:[['这只绒芽为什么偏着头？','也许它正想一个新表情。'],['这片留白，是不是还没摆完？','是特意留下来，让喜欢的东西呼吸。']],tech:[['这艘银翼艇下一站去哪里？','先去看看明天会长出什么。'],['这里为什么这么安静？','让精密的事，慢慢发生。']],music:[['你听，连海浪都在打拍子。','那下一拍，交给你。'],['今天排练什么曲子？','先从一阵轻轻的风开始。'],['这片叶子刚刚唱歌了。','我听到了，它还差一个和声。']],moon:[['今晚演什么？','演一场不用谢幕的晚安。'],['月亮是不是又打瞌睡了？','嘘，让它再做一个小小的梦。'],['这里的星光好安静。','它们正在等蘑菇讲故事。']],sea:[['这朵花会不会吹泡泡？','小声点，它还在练习。'],['海风今天带来了什么？','一颗贝壳，还有一点好奇心。'],['泡泡里装着什么呀？','也许是明天的好天气。']]};
export function resolveLifeTarget(world,varieties,kind,id,time){
 const entity=kind==='plant'?world?.plants?.find(p=>p.id===id):world?.exhibits?.find(b=>b.id===id);if(!entity)return null;
 const tile=entity.tileId?world.tiles.find(t=>t.id===entity.tileId):world.tiles.find(t=>t.x===entity.x&&t.y===entity.y);if(!tile||!isBuilt(tile,time))return null;
 const center=kind==='plant'?plantCenter(world,entity,varieties[entity.varietyId]):buildingCenter(world,entity);if(!center)return null;
 return {kind,id,tileId:tile.id,entity,center,signature:`${kind}:${id}:${tile.id}:${tile.x}:${tile.y}`,ready:kind==='plant'?!!varieties[entity.varietyId]&&isMature(entity,time):isBuilt(entity,time)};
}
/** Transient owner/ambient activity. This module never dispatches or changes its world input. */
export function createGardenLife({clock=Date.now,random=Math.random}={}){
 const walker=createTileWalker({stepMs:380,clock}),hosts=createResidentLife({clock,random});let sceneActive=true,lastDialogue=-1;let world=null,varieties={},pending=null,routeOwner='owner',signature='',selectedResident=null,residentNonce=0,lastActivity=0,nextAction=10000,nextTalk=18000,nextEncounter=0,soloIndex=-1,lastTarget=null,speech=null;
 const rand=()=>Math.max(0,Math.min(.999999,Number(random())||0));
 function cancelResident(at){if(selectedResident)hosts.select(selectedResident.id,false,at);selectedResident=null;if(pending?.kind==='resident'){pending=null;walker.cancel(at);}}
 function resolve(kind,id){if(kind!=='resident')return resolveLifeTarget(world,varieties,kind,id,clock());const r=hosts.poses(lastTick).find(r=>r.id===id);return r?{kind,id,center:{x:r.x,y:r.y},signature:`resident:${id}:${selectedResident?.nonce}`,nonce:selectedResident?.nonce,ready:true}:null;}
 let lastTick=0;
 function activity(at,{interrupt=true}={}){if(interrupt)cancelResident(at);lastActivity=at;nextAction=at+10000;nextTalk=Math.max(nextTalk,at+18000);speech=null;hosts.release(at);if(interrupt){walker.cancel(at);pending=null;routeOwner='owner';}}
 function setWorld(next,vars,at){
  lastTick=at;hosts.setWorld(next,vars,at);
  const changed=world?.id!==next.id,oldTile=world?.avatarTileId,terrain=next.tiles.map(t=>`${t.id}:${t.x}:${t.y}:${isBuilt(t,clock())}`).join('|')+'#'+(next.exhibits??[]).map(b=>`${b.id}:${b.tileId??`${b.x}:${b.y}`}`).join('|'),structure=terrain!==signature;world=next;varieties=vars;signature=terrain;
  if(changed){selectedResident=null;walker.reset(next.tiles,next.avatarTileId,next.plants,vars,next.exhibits);pending=null;speech=null;nextEncounter=0;lastDialogue=-1;lastActivity=at;nextAction=at+10000;nextTalk=at+18000;routeOwner='owner';return;}
  if(selectedResident&&!hosts.poses(at).some(r=>r.id===selectedResident.id))cancelResident(at);
  if(pending&&(resolve(pending.kind,pending.id)?.signature!==pending.signature||(pending.kind==='plant'&&next.tiles.some(t=>containsPoint(t,pending.stand)&&plantAtTile(next,t.id,vars))))){walker.cancel(at);pending=null;cancelResident(at);}
  if(oldTile!==next.avatarTileId){activity(at);walker.go(next.tiles,next.avatarTileId,at,next.plants,vars,next.exhibits);}
  else if(structure&&!walker.revalidate(next.tiles,next.exhibits??[],at)){pending=null;cancelResident(at);}
  if(!Number.isFinite(walker.sample(at).x))walker.reset(next.tiles,next.avatarTileId,next.plants,vars,next.exhibits);
 }
 function approach(kind,id,at,source='owner'){
  const target=resolveLifeTarget(world,varieties,kind,id,clock());if(!target)return {possible:false,ready:false};
  const actor=walker.sample(at);if(!walker.go(world.tiles,target.tileId,at,world.plants,varieties,world.exhibits,kind==='plant'?{approachPlantId:id}:{}))return {possible:false,ready:false};
  if(distance(actor,walker.destination)<.22){walker.cancel(at);walker.face(target.center);return {possible:true,ready:true,target};}

  pending={...target,source,stand:{x:walker.destination.x,y:walker.destination.y}};routeOwner=source==='idle'?'idle':'approach';return {possible:true,ready:false,target};
 }
 function approachResident(id,at){activity(at);lastTick=at;const host=hosts.select(id,true,at,walker.sample(at));if(!host)return {possible:false};const actor=walker.sample(at),safe=walkableTerrain(world.tiles,world.exhibits??[],clock()),start=safe.find(t=>containsPoint(t,actor)),options=safe.filter(t=>distance(t,host)>=.7&&distance(t,host)<=1.55&&start&&tileRoute(safe,start.id,t.id).length).sort((a,b)=>distance(a,actor)-distance(b,actor));if(!options.length){hosts.select(id,false,at);return {possible:false};}selectedResident={id,nonce:++residentNonce,worldId:world.id};const target=resolve('resident',id);if(!walker.go(world.tiles,options[0].id,at,world.plants,varieties,world.exhibits)){cancelResident(at);return {possible:false};}const stand={x:walker.destination.x,y:walker.destination.y};if(distance(actor,stand)<.22){walker.cancel(at);walker.face(target.center);hosts.select(id,true,at,actor);return {possible:true,ready:true,target,nonce:selectedResident.nonce};}pending={...target,source:'owner',stand};routeOwner='approach';return {possible:true,ready:false,target,nonce:selectedResident.nonce};}
 function speak(lines,at,residentId=null){speech={lines,start:at,residentId};nextTalk=at+18000+rand()*7000;}
 function ambient(target,at){
  if(at>=nextTalk)speak([target.kind==='exhibit'?'路过小屋，顺便和它打个招呼。':target.entity.varietyId?.includes('moon')?'今天的月亮，还没睡醒呢。':'慢一点，听听它的小心事。'],at);
  return {type:'ambient',kind:target.kind,id:target.id,center:target.center};
 }
 function candidates(actor){
  const tiles=walkableTerrain(world.tiles,world.exhibits??[],clock()),start=tiles.filter(t=>Math.abs(t.x-actor.x)<=.501&&Math.abs(t.y-actor.y)<=.501).sort((a,b)=>distance(a,actor)-distance(b,actor))[0]??tiles.slice().sort((a,b)=>distance(a,actor)-distance(b,actor))[0];if(!start)return [];
  const reachable=tile=>{if(!tile)return false;const route=findTilePath(tiles,start.id,tile.id,clock());return route.length>0&&route.length<=4;};
  const empty=tiles.filter(t=>t.id!==start.id&&reachable(t)&&!plantAtTile(world,t.id,varieties)&&!buildingAtTile(world,t.id));
  const nearbyPlant=t=>{const plan=plantApproachRoute({tiles,worldTiles:world.tiles,plants:world.plants,varieties,plantId:t.id,position:actor,route:(map,start,goal)=>preferredTileRoute(map,start,goal,world.plants,varieties)});return !!plan&&plan.path.length<=4;};
  const targets=[...world.plants.map(p=>resolveLifeTarget(world,varieties,'plant',p.id,clock())),...(world.exhibits??[]).map(b=>resolveLifeTarget(world,varieties,'exhibit',b.id,clock()))].filter(t=>t?.ready&&(t.kind==='exhibit'?tiles.some(tile=>buildingCells({tiles:world.tiles},t.entity).some(c=>Math.abs(c.x-tile.x)+Math.abs(c.y-tile.y)===1)&&reachable(tile)):nearbyPlant(t)));
  return [...empty.flatMap(t=>[{kind:'wander',tileId:t.id},{kind:'wander',tileId:t.id}]),...targets].filter(t=>`${t.kind}:${t.id??t.tileId}`!==lastTarget);
 }
 function tick(at,{allowed=true}={}){
  lastTick=at;const events=[],residents=hosts.tick(at);let actor=walker.sample(at);if(!world||!Number.isFinite(actor.x))return {actor,residents,events,bubble:null};
  if(!allowed){lastActivity=at;nextAction=at+10000;nextTalk=Math.max(nextTalk,at+18000);speech=null;hosts.release(at);if(routeOwner==='idle'){walker.cancel(at);pending=null;actor=walker.sample(at);}}
  if(pending&&!actor.moving){const target=resolve(pending.kind,pending.id),old=pending;pending=null;if(target?.signature===old.signature&&distance(actor,old.stand)<.22){walker.face(target.center);if(target.kind==='resident')hosts.select(target.id,true,at,actor);events.push(old.source==='idle'?ambient(target,at):{type:'owner-ready',...target});}actor=walker.sample(at);nextAction=Math.max(nextAction,at+4000+rand()*3000);}
  const speaking=!!speech&&at<speech.start+speech.lines.length*3000;
  if(!selectedResident&&sceneActive&&allowed&&at-lastActivity>=10000&&(!actor.moving||routeOwner==='idle')&&pending?.source!=='owner'&&!speaking&&at>=nextEncounter&&at>=nextTalk){
   const safe=walkableTerrain(world.tiles,world.exhibits??[],clock()),start=safe.find(t=>containsPoint(t,actor)),resident=residents.find(r=>distance(actor,r)<=1.3&&start&&safe.some(t=>containsPoint(t,r)&&findTilePath(safe,start.id,t.id,clock()).length));
   if(resident){walker.cancel(at);pending=null;walker.face(resident);hosts.hold(resident.id,at+6000,at,actor);const lines=DIALOGUE[world.theme]??[['这里真舒服。','慢慢逛，别着急。']];let choice=Math.floor(rand()*lines.length);if(choice===lastDialogue)choice=(choice+1)%lines.length;lastDialogue=choice;speak(lines[choice],at,resident.id);nextEncounter=at+45000;nextAction=at+10000;events.push({type:'encounter',id:resident.id,center:resident});actor=walker.sample(at);}
  }
  if(!selectedResident&&allowed&&at-lastActivity>=10000&&!actor.moving&&!pending&&(!speech||at>=speech.start+speech.lines.length*3000)&&at>=nextAction){
   if(at>=nextTalk){soloIndex=(soloIndex+1)%SOLO.length;speak([SOLO[soloIndex]],at);}
   else{const choices=candidates(actor),choice=choices[Math.floor(rand()*choices.length)];if(choice){lastTarget=`${choice.kind}:${choice.id??choice.tileId}`;if(choice.kind==='wander'){walker.go(world.tiles,choice.tileId,at,world.plants,varieties,world.exhibits);routeOwner='idle';}else{const result=approach(choice.kind,choice.id,at,'idle');if(result.ready)events.push(ambient(result.target,at));}}}
   nextAction=at+4000+rand()*3000;actor=walker.sample(at);
  }
  const elapsed=speech?at-speech.start:Infinity,index=Math.floor(elapsed/3000),bubble=speech&&index<speech.lines.length?{text:speech.lines[index],residentId:index===1?speech.residentId:null}:null;
  return {actor,residents:hosts.poses(at),events,bubble};
 }
 return {setWorld,activity,approach,approachResident,cancelResident,get selectedResident(){return selectedResident?{...selectedResident}:null;},tick,setSceneActive(value,at){sceneActive=!!value;hosts.setActive(value,at);if(!value){speech=null;cancelResident(at);};},dispose(){hosts.clear();selectedResident=null;speech=null;pending=null;},cancelApproach(at){if(routeOwner==='approach'){walker.cancel(at);pending=null;routeOwner='owner';}},sample:walker.sample,walkTo(tileId,at){activity(at);return walker.go(world.tiles,tileId,at,world.plants,varieties,world.exhibits);},get pending(){return pending;},get routeOwner(){return routeOwner;}};
}
