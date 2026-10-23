/** V12 egg farm: isolated browser save; V11/V9 saves are deliberately untouched. */
export type Terrain='meadow'|'creek'|'hill'|'grove';
export type Point={x:number;z:number};
export type Tile=Point&{terrain:Terrain;owned:boolean};
export type GuardianKind='dog'|'cat'|'frog';
export type Species='sheep'|'pig'|'cow'|'bunny';
export type Sex='male'|'female';
export type AnimalSize='normal'|'large'|'giant';
export type MinimalAnimal={id:string;name:string;species:Species;sex:Sex;size:AnimalSize;position:Point;target?:Point;path?:Point[];targetActivity?:'drink'|'rest'|'graze';activity:'idle'|'walk'|'drink'|'rest'|'graze'|'carried';energy:number;bond:number;bornAt:number;activityUntil:number;lastBreedAttemptDay?:string};
export type FarmEgg={id:string;source:'shop'|'bred';species:Species;sex:Sex;size:AnimalSize;location:'bag'|'ground';position?:Point;boughtAt:number;placedAt?:number;readyAt?:number;parents?:[string,string]};
/** Kept as an empty compatibility surface for older render consumers; V12 never produces gifts. */
export type Gift={id:string;kind:'wool'|'flower'|'pebble';location:'ground'|'bag'|'display';createdAt:number;animalId:string;rare:boolean};
export type WolfEvent={startedAt:number;endsAt:number;helped:boolean};
export type MinimalState={version:2;coins:number;welcomeClaimed:boolean;tiles:Tile[];animals:MinimalAnimal[];eggs:FarmEgg[];carriedAnimalId:string|null;guardian:GuardianKind;player:Point;playerPath:Point[];gifts:Gift[];collection:string[];createdAt:number;updatedAt:number;nextWolfAt:number;expansions:number;wolfEvent:WolfEvent|null;notice:string;sequence:number;placedEggCount:number;hatchedCount:number;breedingDay:string|null;lastHatch:{animalId:string;at:number;position:Point}|null;lastBreeding:{animalIds:[string,string];at:number;success:boolean}|null};
export type MinimalCommand=
 |{type:'welcome'}|{type:'buyEgg'}|{type:'emergencyEgg'}|{type:'placeEgg';eggId:string;at:Point}|{type:'hatch';eggId:string}
 |{type:'pickup';animalId:string}|{type:'putdown';at?:Point}|{type:'sellAnimal'}|{type:'breed';animalIds:[string,string]}
 |{type:'move';to:Point}|{type:'expand';at:Point}|{type:'convert';at:Point;terrain:Terrain}|{type:'care';animalId:string}
 |{type:'guardian';guardian:GuardianKind}|{type:'wolf'}|{type:'help'};
export type MinimalReply={state:MinimalState;accepted:boolean;message:string};
export const MINIMAL_STORAGE_KEY='dreamina-egg-farm-v2';
export const MINIMAL_RULES={min:-3,max:6,welcomeCoins:120,eggCost:30,firstHatchMs:10_000,hatchMs:15_000,adultMs:60_000,maxAnimals:16,expandCost:40,convertCost:20,breedChance:.35,wolfMs:18_000,wolfIntervalMs:240_000} as const;
export const SHOP_TILES:Point[]=[{x:0,z:0},{x:1,z:0}];
export const SHOP_APPROACH:Point={x:1,z:1};
export const WATER_BOWL:Point={x:0,z:1};
export const REST_MAT:Point={x:0,z:2};
export const SPECIES_LABELS:Record<Species,string>={sheep:'小羊',pig:'小猪',cow:'小牛',bunny:'兔兔'};
const terrains:Terrain[]=['meadow','creek','hill','grove'];
const speciesList:Species[]=['sheep','pig','cow','bunny'];
const same=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
const point=(p:Point)=>({x:Math.round(p.x),z:Math.round(p.z)});
const validPoint=(p:Point)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isInteger(p.x)&&Number.isInteger(p.z);
const key=(p:Point)=>`${p.x},${p.z}`;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const neighbors=(p:Point):Point[]=>[{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},{x:p.x-1,z:p.z},{x:p.x,z:p.z-1}];
const copy=<T>(value:T):T=>structuredClone(value);
export function tileAt(state:MinimalState,p:Point):Tile|undefined{return p&&state.tiles.find(t=>same(t,point(p)));}
export function isShopTile(p:Point):boolean{return !!p&&SHOP_TILES.some(t=>same(t,point(p)));}
const walkable=(s:MinimalState,p:Point)=>!!tileAt(s,p)?.owned&&!isShopTile(p);
export function nearShop(s:MinimalState):boolean{return distance(s.player,SHOP_APPROACH)<=1.2&&walkable(s,s.player);}
export function dayKey(now:number):string{return new Date(now+8*3600000).toISOString().slice(0,10);}
export function isAdult(a:MinimalAnimal,now:number):boolean{return now-a.bornAt>=MINIMAL_RULES.adultMs;}
export function sellValue(a:MinimalAnimal):number{return a.size==='giant'?100:a.size==='large'?65:40;}
export function animalScale(a:MinimalAnimal):number{return a.size==='giant'?1.8:a.size==='large'?1.3:1;}
export function terrainFor(p:Point):Terrain{if(p.x===4||p.x===3&&p.z>=2)return 'creek';if(p.z<=-1&&p.x>=1)return 'hill';if(p.x<=-1&&p.z>=1||p.z>=4&&p.x<3)return 'grove';return 'meadow';}
export function createMinimalState(now:number):MinimalState{
 const time=Number.isFinite(now)?now:0,tiles:Tile[]=[];for(let x=-3;x<=6;x++)for(let z=-3;z<=6;z++)tiles.push({x,z,terrain:terrainFor({x,z}),owned:x>=0&&x<4&&z>=0&&z<4});
 return {version:2,coins:0,welcomeClaimed:false,tiles,animals:[],eggs:[],carriedAnimalId:null,guardian:'dog',player:{x:1,z:3},playerPath:[],gifts:[],collection:[],createdAt:time,updatedAt:time,nextWolfAt:time+300_000,expansions:0,wolfEvent:null,notice:'收下开园金币，去小店挑一颗惊喜蛋',sequence:0,placedEggCount:0,hatchedCount:0,breedingDay:null,lastHatch:null,lastBreeding:null};
}
export function ownedPath(state:MinimalState,from:Point,to:Point):Point[]|null{
 if(!validPoint(to)||!walkable(state,to))return null;const start=point(from);if(!walkable(state,start))return null;
 const queue:Point[]=[start],seen=new Map<string,Point|null>([[key(start),null]]);
 for(let i=0;i<queue.length;i++){const p=queue[i];if(same(p,to)){const path:Point[]=[p];let prior=seen.get(key(p));while(prior){path.unshift(prior);prior=seen.get(key(prior));}return path;}for(const q of neighbors(p))if(walkable(state,q)&&!seen.has(key(q))){seen.set(key(q),p);queue.push(q);}}
 return null;
}
export function continuousRoute(state:MinimalState,from:Point,to:Point):Point[]|null{const path=ownedPath(state,from,to);if(!path)return null;const route=path.slice(1);if(distance(from,path[0])>.00001&&(!route.length||Math.abs(route[0].x-from.x)>.00001&&Math.abs(route[0].z-from.z)>.00001))route.unshift(path[0]);return route;}
function moveAlong(position:Point,path:Point[],travel:number):void{while(path.length&&travel>0){const next=path[0],d=distance(position,next);if(d<.00001){path.shift();continue;}const step=Math.min(d,travel);position.x+=(next.x-position.x)*step/d;position.z+=(next.z-position.z)*step/d;travel-=step;if(step===d){position.x=next.x;position.z=next.z;path.shift();}}}
export function canPlaceEgg(s:MinimalState,at:Point):boolean{return validPoint(at)&&walkable(s,at)&&!same(at,WATER_BOWL)&&!same(at,REST_MAT)&&!s.eggs.some(e=>e.location==='ground'&&e.position&&same(e.position,at))&&!s.animals.some(a=>a.id!==s.carriedAnimalId&&same(point(a.position),at));}
function random(s:MinimalState,salt:number):number{let x=(Math.floor(s.createdAt/1000)^Math.imul(s.sequence+1,0x9e3779b9)^Math.imul(salt+7,0x85ebca6b))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return (x>>>0)/4294967296;}
function egg(s:MinimalState,now:number,source:'shop'|'bred',species?:Species):FarmEgg{s.sequence++;const roll=random(s,2);return {id:`egg-${s.sequence}`,source,species:species??speciesList[Math.min(3,Math.floor(random(s,0)*4))],sex:random(s,1)<.5?'male':'female',size:roll<.7?'normal':roll<.95?'large':'giant',location:'bag',boughtAt:now};}
function stopAnimal(a:MinimalAnimal,now:number){delete a.target;delete a.path;delete a.targetActivity;a.activity='idle';a.activityUntil=now+5000;}
export function eligiblePairs(s:MinimalState,now:number):[string,string][]{
 if(s.breedingDay===dayKey(now)||s.animals.length+s.eggs.length>=MINIMAL_RULES.maxAnimals)return [];
 const candidates=s.animals.filter(a=>a.id!==s.carriedAnimalId&&isAdult(a,now)&&a.lastBreedAttemptDay!==dayKey(now));const pairs:[string,string][]=[];
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j];if(a.species===b.species&&a.sex!==b.sex&&distance(a.position,b.position)<=1.6)pairs.push([a.id,b.id]);}return pairs;
}
function tryBreed(s:MinimalState,ids:[string,string],now:number):boolean{
 const eligible=eligiblePairs(s,now).some(p=>p.includes(ids[0])&&p.includes(ids[1])&&ids[0]!==ids[1]);if(!eligible)return false;
 const a=s.animals.find(a=>a.id===ids[0])!,b=s.animals.find(a=>a.id===ids[1])!;
 const available=s.tiles.filter(t=>canPlaceEgg(s,t)).sort((u,v)=>distance(u,a.position)-distance(v,a.position));if(!available.length)return false;
 s.sequence++;const success=random(s,8)<MINIMAL_RULES.breedChance;const today=dayKey(now);a.lastBreedAttemptDay=today;b.lastBreedAttemptDay=today;stopAnimal(a,now);stopAnimal(b,now);s.lastBreeding={animalIds:[a.id,b.id],at:now,success};
 if(success){const e=egg(s,now,'bred',a.species);e.parents=[a.id,b.id];e.location='ground';e.position={x:available[0].x,z:available[0].z};e.placedAt=now;e.readyAt=now+MINIMAL_RULES.hatchMs;s.eggs.push(e);s.breedingDay=today;s.notice=`它们留下了一颗${SPECIES_LABELS[a.species]}蛋，今天的小惊喜只有这一颗。`;}
 else s.notice='它们开心地碰了碰鼻子，今天没有留下蛋，明天再看看。';return true;
}
function destinationFree(s:MinimalState,p:Point,id:string):boolean{return !s.animals.some(a=>a.id!==id&&a.id!==s.carriedAnimalId&&(distance(a.position,p)<.7||!!a.target&&same(a.target,p)));}
function animalNavigation(s:MinimalState):MinimalState{return {...s,tiles:s.tiles.map(t=>s.eggs.some(e=>e.location==='ground'&&e.position&&same(e.position,t))?{...t,owned:false}:t)};}
function naturalActivity(terrain:Terrain):'drink'|'rest'|'graze'{return terrain==='creek'?'drink':terrain==='meadow'?'graze':'rest';}
function startWolf(s:MinimalState,now:number){s.wolfEvent={startedAt:now,endsAt:now+MINIMAL_RULES.wolfMs,helped:false};s.notice='两只小狼在边缘探头，伙伴会照看大家。';}
export function advanceMinimalState(input:MinimalState,now:number):MinimalState{
 const s=copy(input);if(!Number.isFinite(now)||now<s.updatedAt)return s;const gap=now-s.updatedAt,dt=Math.min(2000,Math.max(0,gap))/1000;s.updatedAt=now;moveAlong(s.player,s.playerPath,dt*2.2);
 for(let i=0;i<s.animals.length;i++){
  const a=s.animals[i],navigation=animalNavigation(s);if(a.id===s.carriedAnimalId){a.position={...s.player};a.activity='carried';delete a.target;delete a.path;continue;}
  if(a.target){const route=a.path;if(!route||!route.every(q=>walkable(navigation,q))){stopAnimal(a,now);}else{moveAlong(a.position,route,dt*(i%2?.55:.65));if(distance(a.position,a.target)<.01){a.position={...a.target};delete a.target;delete a.path;a.activity=a.targetActivity??naturalActivity(tileAt(s,a.position)!.terrain);delete a.targetActivity;a.activityUntil=now+6000;}else a.activity='walk';}}
  else if(now>=a.activityUntil){if(a.activity==='drink'||a.activity==='rest'||a.activity==='graze'){a.energy=Math.min(100,a.energy+(a.activity==='drink'?22:a.activity==='rest'?15:10));a.activity='idle';a.activityUntil=now+5000+i*1300;}else{const wanted:Terrain=a.energy<65?'creek':(['meadow','hill','grove','creek'] as Terrain[])[(Math.floor(now/12000)+i)%4],available=s.tiles.filter(t=>walkable(navigation,t)&&t.terrain===wanted&&destinationFree(s,t,a.id)),fallback=tileAt(s,wanted==='creek'?WATER_BOWL:REST_MAT),options=available.length?available:fallback&&destinationFree(s,fallback,a.id)?[fallback]:[],pick=options[(Math.floor(now/10000)+i*7)%options.length],activity=available.length?naturalActivity(pick.terrain):wanted==='creek'?'drink':'rest';if(!pick){stopAnimal(a,now);continue;}if(distance(a.position,pick)>.01){const route=continuousRoute(navigation,a.position,pick);if(route){a.target={x:pick.x,z:pick.z};a.targetActivity=activity;a.path=route;a.activity='walk';a.energy=Math.max(25,a.energy-3);}else stopAnimal(a,now);}else{a.activity=activity;a.activityUntil=now+6000;}}}
 }
 if(s.wolfEvent&&now>=s.wolfEvent.endsAt){s.wolfEvent=null;s.nextWolfAt=now+MINIMAL_RULES.wolfIntervalMs;s.notice='小狼跑远了，所有小动物都好好的。';}
 else if(!s.wolfEvent&&now>=s.nextWolfAt){if(gap<=5000&&s.animals.length>0&&s.welcomeClaimed)startWolf(s,now);else s.nextWolfAt=now+300_000;}
 return s;
}
export function minimalCommand(input:MinimalState,command:MinimalCommand,now:number):MinimalReply{
 if(!Number.isFinite(now)||now<input.updatedAt)return {state:copy(input),accepted:false,message:'时间尚未同步，请稍后再试'};
 const s=advanceMinimalState(input,now),reply=(accepted:boolean,message:string):MinimalReply=>{s.notice=message;return {state:s,accepted,message};};
 if(command.type==='welcome'){if(s.welcomeClaimed)return reply(false,'开园金币已经领过啦');s.welcomeClaimed=true;s.coins+=MINIMAL_RULES.welcomeCoins;return reply(true,'收到 120 金币！去小店买第一颗惊喜蛋吧');}
 if(command.type==='move'){const path=continuousRoute(s,s.player,command.to);if(!path)return reply(false,'这里暂时走不到');s.playerPath=path;return reply(true,'走过去看看');}
 if(!s.welcomeClaimed)return reply(false,'先收下开园金币吧');
 if(command.type==='emergencyEgg'){if(!nearShop(s)||s.coins>=30||s.animals.length||s.eggs.length)return reply(false,'只有金币不足且没有动物或蛋时，店主才会送一颗起步蛋');s.eggs.push(egg(s,now,'shop'));return reply(true,'店主送你一颗起步蛋，重新开始吧');}
 if(command.type==='buyEgg'){if(!nearShop(s))return reply(false,'先走到小店柜台前');if(s.coins<30)return reply(false,'惊喜蛋需要 30 金币');if(s.animals.length+s.eggs.length>=16)return reply(false,'小家暂时最多容纳 16 位伙伴和待孵的蛋');s.coins-=30;s.eggs.push(egg(s,now,'shop'));return reply(true,'拿到一颗惊喜蛋！找块空地放下吧');}
 if(command.type==='placeEgg'){const e=s.eggs.find(e=>e.id===command.eggId&&e.location==='bag');if(!e)return reply(false,'这颗蛋已经放好，或不在背包里');if(!canPlaceEgg(s,command.at))return reply(false,'找一块没有动物和蛋的已开辟空地');if(distance(s.player,command.at)>1.6)return reply(false,'走近那块空地再放下蛋');e.location='ground';e.position={...command.at};e.placedAt=now;e.readyAt=now+(s.placedEggCount===0?MINIMAL_RULES.firstHatchMs:MINIMAL_RULES.hatchMs);s.placedEggCount++;return reply(true,'蛋放好了，等它摇摇晃晃准备好');}
 if(command.type==='hatch'){const e=s.eggs.find(e=>e.id===command.eggId&&e.location==='ground');if(!e||!e.position||e.readyAt===undefined)return reply(false,'先把蛋放到地上');if(now<e.readyAt)return reply(false,'再等一小会，里面正在准备');if(distance(s.player,e.position)>1.6)return reply(false,'走近一点，看看谁要出来');const hatchSpace={...s,eggs:s.eggs.filter(x=>x!==e)},landing=s.tiles.filter(t=>canPlaceEgg(hatchSpace,t)).sort((u,v)=>distance(u,e.position!)-distance(v,e.position!))[0];if(!landing)return reply(false,'先给新伙伴腾出一块空地吧');s.sequence++;const id=`animal-${s.sequence}`,a:MinimalAnimal={id,name:SPECIES_LABELS[e.species],species:e.species,sex:e.sex,size:e.size,position:{x:landing.x,z:landing.z},activity:'idle',energy:85,bond:0,bornAt:now,activityUntil:now+8000};s.animals.push(a);s.hatchedCount++;s.eggs=s.eggs.filter(x=>x!==e);s.lastHatch={animalId:id,at:now,position:{...e.position}};if(!s.collection.includes(a.species))s.collection.push(a.species);return reply(true,`${a.size==='giant'?'哇，是巨大':a.size==='large'?'是一只大大的':'蹦出来一只'}${SPECIES_LABELS[a.species]}！`);}
 if(command.type==='pickup'){const a=s.animals.find(a=>a.id===command.animalId);if(!a)return reply(false,'这只小动物已经不在这里');if(s.carriedAnimalId)return reply(false,'先把头顶的小伙伴放下来');if(distance(s.player,a.position)>1.6)return reply(false,'走近一点才能举起来');stopAnimal(a,now);a.activity='carried';s.carriedAnimalId=a.id;a.position={...s.player};return reply(true,`把${a.name}举起来啦！可以带去小店，或找地方放下`);}
 if(command.type==='putdown'){const a=s.animals.find(a=>a.id===s.carriedAnimalId);if(!a)return reply(false,'现在没有举着小动物');const p=command.at??point(s.player);if(!canPlaceEgg(s,p)||distance(s.player,p)>1.6)return reply(false,'找身边一块空地放下它');a.position={...p};stopAnimal(a,now);s.carriedAnimalId=null;return reply(true,'小伙伴稳稳落地，继续自在散步');}
 if(command.type==='sellAnimal'){const a=s.animals.find(a=>a.id===s.carriedAnimalId);if(!a)return reply(false,'先把想出售的小动物举起来');if(!nearShop(s))return reply(false,'举着它走到小店柜台前');const value=sellValue(a);s.animals=s.animals.filter(x=>x!==a);s.carriedAnimalId=null;s.coins+=value;return reply(true,`小店接走了${a.name}，收到 ${value} 金币`);}
 if(command.type==='breed'){if(!tryBreed(s,command.animalIds,now))return reply(false,'需要同种异性、已长大的伙伴靠在一起，且今天还有机会');return reply(true,s.notice);}
 if(command.type==='expand'){if(!s.hatchedCount)return reply(false,'先孵出第一位小伙伴，再慢慢扩大小家');const t=validPoint(command.at)?tileAt(s,command.at):undefined;if(!t||t.owned)return reply(false,'选一块还没开辟的土地');if(!neighbors(t).some(p=>tileAt(s,p)?.owned))return reply(false,'先开辟一块相邻土地');if(s.coins<40)return reply(false,'开辟需要 40 金币');t.owned=true;s.coins-=40;s.expansions++;return reply(true,'新地方亮起来了');}
 if(command.type==='convert'){if(!s.hatchedCount)return reply(false,'先孵出第一位小伙伴，再换风景');const t=validPoint(command.at)?tileAt(s,command.at):undefined;if(!t?.owned||isShopTile(t)||!terrains.includes(command.terrain))return reply(false,'只能改造小店以外的已开辟土地');if(!s.expansions)return reply(false,'先开辟一块新地，再尝试改造');if(t.terrain===command.terrain)return reply(false,'这里已经是这种地形');if(s.coins<20)return reply(false,'改造需要 20 金币');t.terrain=command.terrain;s.coins-=20;return reply(true,'换一种风景，等小动物发现');}
 if(command.type==='care'){const a=s.animals.find(a=>a.id===command.animalId);if(!a||a.id===s.carriedAnimalId||distance(s.player,a.position)>1.6)return reply(false,'先走到小伙伴身边');a.energy=Math.min(100,a.energy+8);a.bond=Math.min(100,a.bond+1);stopAnimal(a,now);return reply(true,`${a.name}蹭了蹭你的手`);}
 if(command.type==='guardian'){if(!['dog','cat','frog'].includes(command.guardian))return reply(false,'请选择一位守护伙伴');s.guardian=command.guardian;return reply(true,'伙伴换班啦');}
 if(command.type==='wolf'){if(s.wolfEvent)return reply(false,'伙伴正在处理这次小捣乱');startWolf(s,now);return reply(true,s.notice);}
 if(command.type==='help'){if(!s.wolfEvent)return reply(false,'现在很安全');s.wolfEvent.helped=true;s.wolfEvent.endsAt=Math.min(s.wolfEvent.endsAt,now+4000);return reply(true,'一起把小狼赶走啦');}
 return reply(false,'暂时不支持这个动作');
}
export type MinimalStorage=Pick<Storage,'getItem'|'setItem'>;
function validSave(value:unknown):value is MinimalState{
 if(!value||typeof value!=='object')return false;const s=value as MinimalState,finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v),coordinate=(p:Point)=>!!p&&finite(p.x)&&finite(p.z)&&p.x>=-3&&p.x<=6&&p.z>=-3&&p.z<=6,integer=(p:Point)=>coordinate(p)&&validPoint(p);
 if(s.version!==2||![s.coins,s.updatedAt,s.createdAt,s.nextWolfAt,s.sequence,s.expansions,s.placedEggCount,s.hatchedCount].every(finite)||s.coins<0||s.sequence<0||s.expansions<0||s.placedEggCount<0||s.hatchedCount<0||typeof s.welcomeClaimed!=='boolean'||typeof s.notice!=='string')return false;
 if(!Array.isArray(s.tiles)||s.tiles.length!==100||!s.tiles.every(t=>integer(t)&&terrains.includes(t.terrain)&&typeof t.owned==='boolean')||new Set(s.tiles.map(key)).size!==100||!SHOP_TILES.every(t=>tileAt(s,t)?.owned))return false;
 const onOwned=(p:Point)=>coordinate(p)&&walkable(s,p),path=(v:unknown)=>Array.isArray(v)&&v.every(p=>integer(p)&&onOwned(p)),validDay=(v:unknown)=>v===null||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
 if(!onOwned(s.player)||!path(s.playerPath)||!Array.isArray(s.animals)||!Array.isArray(s.eggs)||s.animals.length+s.eggs.length>16||new Set(s.animals.map(a=>a?.id)).size!==s.animals.length)return false;
 if(!s.animals.every(a=>a&&typeof a.id==='string'&&typeof a.name==='string'&&speciesList.includes(a.species)&&['male','female'].includes(a.sex)&&['normal','large','giant'].includes(a.size)&&onOwned(a.position)&&[a.bornAt,a.energy,a.bond,a.activityUntil].every(finite)&&a.energy>=0&&a.energy<=100&&a.bond>=0&&a.bond<=100&&['idle','walk','drink','rest','graze','carried'].includes(a.activity)&&(!a.lastBreedAttemptDay||validDay(a.lastBreedAttemptDay))&&(!a.targetActivity||['drink','rest','graze'].includes(a.targetActivity))&&(!a.target||integer(a.target)&&onOwned(a.target)&&path(a.path))))return false;
 if(!s.eggs.every(e=>e&&typeof e.id==='string'&&['shop','bred'].includes(e.source)&&speciesList.includes(e.species)&&['male','female'].includes(e.sex)&&['normal','large','giant'].includes(e.size)&&finite(e.boughtAt)&&(e.location==='bag'||e.location==='ground'&&!!e.position&&integer(e.position)&&onOwned(e.position)&&finite(e.placedAt)&&finite(e.readyAt)&&e.readyAt>=e.placedAt)&&(!e.parents||e.parents.length===2&&e.parents.every(v=>typeof v==='string')))||new Set(s.eggs.map(e=>e.id)).size!==s.eggs.length)return false;
 if(s.carriedAnimalId!==null&&!s.animals.some(a=>a.id===s.carriedAnimalId&&a.activity==='carried'))return false;
 if(s.animals.some(a=>a.activity==='carried'&&a.id!==s.carriedAnimalId)||!validDay(s.breedingDay))return false;
 if(s.lastHatch!==null&&(!s.lastHatch||typeof s.lastHatch.animalId!=='string'||!finite(s.lastHatch.at)||!integer(s.lastHatch.position)))return false;
 if(s.lastBreeding!==null&&(!s.lastBreeding||!Array.isArray(s.lastBreeding.animalIds)||s.lastBreeding.animalIds.length!==2||!s.lastBreeding.animalIds.every(v=>typeof v==='string')||!finite(s.lastBreeding.at)||typeof s.lastBreeding.success!=='boolean'))return false;
 return Array.isArray(s.gifts)&&s.gifts.length===0&&Array.isArray(s.collection)&&s.collection.every(v=>speciesList.includes(v as Species))&&['dog','cat','frog'].includes(s.guardian)&&(s.wolfEvent===null||!!s.wolfEvent&&finite(s.wolfEvent.startedAt)&&finite(s.wolfEvent.endsAt)&&typeof s.wolfEvent.helped==='boolean');
}
export function loadMinimalState(storage:MinimalStorage,now:number):MinimalState{try{const raw=storage.getItem(MINIMAL_STORAGE_KEY);if(raw){const saved:unknown=JSON.parse(raw);if(validSave(saved))return advanceMinimalState(saved,now);}}catch{/* Storage may be unavailable. */}return createMinimalState(now);}
export function saveMinimalState(storage:MinimalStorage,state:MinimalState):boolean{try{const old=storage.getItem(MINIMAL_STORAGE_KEY);if(old&&!validSave(JSON.parse(old)))return false;if(!validSave(state))return false;storage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export const TERRAIN_LABELS:Record<Terrain,string>={meadow:'草地',creek:'小溪',hill:'丘陵',grove:'林荫'};
export const TERRAIN_EFFECTS:Record<Terrain,string>={meadow:'啃啃青草，恢复活力',creek:'沿岸喝水，补充能量',hill:'爬上缓坡，晒太阳休息',grove:'在树荫下打盹，慢慢恢复'};
export function canExpand(state:MinimalState,at:Point):boolean{const t=tileAt(state,at);return !!t&&!t.owned&&neighbors(t).some(p=>tileAt(state,p)?.owned)&&state.coins>=MINIMAL_RULES.expandCost;}
