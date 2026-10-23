/** Minimal farm demo. This version has its own local save and never migrates V9. */
export type Terrain='meadow'|'creek'|'hill'|'grove';
export type Point={x:number;z:number};
export type Tile=Point&{terrain:Terrain;owned:boolean};
export type GuardianKind='dog'|'cat'|'frog';
export type MinimalAnimal={id:string;name:string;position:Point;target?:Point;path?:Point[];targetActivity?:'drink'|'rest'|'graze';activity:'idle'|'walk'|'drink'|'rest'|'graze';energy:number;bond:number;bornAt:number;activityUntil:number};
export type Gift={id:string;kind:'wool'|'flower'|'pebble';location:'ground'|'bag'|'display';createdAt:number;animalId:string;rare:boolean};
export type WolfEvent={startedAt:number;endsAt:number;helped:boolean};
export type MinimalState={version:1;coins:number;tiles:Tile[];animals:MinimalAnimal[];guardian:GuardianKind;player:Point;playerPath:Point[];gifts:Gift[];collection:string[];createdAt:number;updatedAt:number;nextGiftAt:number;nextWolfAt:number;expansions:number;wolfEvent:WolfEvent|null;notice:string;sequence:number};
export type MinimalCommand=
 |{type:'move';to:Point}|{type:'expand';at:Point}|{type:'convert';at:Point;terrain:Terrain}
 |{type:'care';animalId:string}|{type:'collect';giftId?:string}|{type:'sell';giftId:string}|{type:'display';giftId:string}
 |{type:'adopt'}|{type:'guardian';guardian:GuardianKind}|{type:'wolf'}|{type:'help'};
export type MinimalReply={state:MinimalState;accepted:boolean;message:string};
export const MINIMAL_STORAGE_KEY='dreamina-minimal-farm-v1';
export const MINIMAL_RULES={min:-3,max:6,firstGiftMs:10_000,giftMs:120_000,giftValue:20,maxGroundGifts:14,expandCost:40,convertCost:20,adoptCost:80,maxAnimals:8,wolfMs:18_000,wolfIntervalMs:240_000} as const;
const terrains:Terrain[]=['meadow','creek','hill','grove'];
const same=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
const point=(p:Point)=>({x:Math.round(p.x),z:Math.round(p.z)});
const validPoint=(p:Point)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isInteger(p.x)&&Number.isInteger(p.z);
const key=(p:Point)=>`${p.x},${p.z}`;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const neighbors=(p:Point):Point[]=>[{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},{x:p.x-1,z:p.z},{x:p.x,z:p.z-1}];
const copy=<T>(value:T):T=>structuredClone(value);
export function tileAt(state:MinimalState,p:Point):Tile|undefined{return state.tiles.find(t=>same(t,point(p)));}
export function terrainFor(p:Point):Terrain{
 if(p.x===4||p.x===3&&p.z>=2)return 'creek';
 if(p.z<=-1&&p.x>=1)return 'hill';
 if(p.x<=-1&&p.z>=1||p.z>=4&&p.x<3)return 'grove';
 return 'meadow';
}
export function createMinimalState(now:number):MinimalState{
 const tiles:Tile[]=[];for(let x=-3;x<=6;x++)for(let z=-3;z<=6;z++)tiles.push({x,z,terrain:terrainFor({x,z}),owned:x>=0&&x<4&&z>=0&&z<4});
 return {version:1,coins:80,tiles,animals:[{id:'sheep-1',name:'团团',position:{x:1,z:1},activity:'idle',energy:72,bond:0,bornAt:now,activityUntil:now+5000},{id:'sheep-2',name:'绵绵',position:{x:2,z:2},activity:'idle',energy:48,bond:0,bornAt:now,activityUntil:now+8000}],guardian:'dog',player:{x:1,z:3},playerPath:[],gifts:[],collection:[],createdAt:now,updatedAt:now,nextGiftAt:now+MINIMAL_RULES.firstGiftMs,nextWolfAt:now+45_000,expansions:0,wolfEvent:null,notice:'点点小动物，或去看看边缘那片小溪',sequence:0};
}
/** All terrain is walkable after opening. Creek tiles include a dry bank. */
export function ownedPath(state:MinimalState,from:Point,to:Point):Point[]|null{
 if(!validPoint(to)||!tileAt(state,to)?.owned)return null;
 const start=point(from);if(!tileAt(state,start)?.owned)return null;
 const queue:Point[]=[start],seen=new Map<string,Point|null>([[key(start),null]]);
 for(let i=0;i<queue.length;i++){const p=queue[i];if(same(p,to)){const path:Point[]=[p];let prior=seen.get(key(p));while(prior){path.unshift(prior);prior=seen.get(key(prior));}return path;}
  for(const q of neighbors(p))if(tileAt(state,q)?.owned&&!seen.has(key(q))){seen.set(key(q),p);queue.push(q);}}
 return null;
}
export function continuousRoute(state:MinimalState,from:Point,to:Point):Point[]|null{
 const path=ownedPath(state,from,to);if(!path)return null;const route=path.slice(1);
 if(distance(from,path[0])>.00001&&(!route.length||Math.abs(route[0].x-from.x)>.00001&&Math.abs(route[0].z-from.z)>.00001))route.unshift(path[0]);
 return route;
}
function moveAlong(position:Point,path:Point[],travel:number):void{while(path.length&&travel>0){const next=path[0],d=distance(position,next);if(d<.00001){path.shift();continue;}const step=Math.min(d,travel);position.x+=(next.x-position.x)*step/d;position.z+=(next.z-position.z)*step/d;travel-=step;if(step===d){position.x=next.x;position.z=next.z;path.shift();}}}
function naturalActivity(terrain:Terrain):MinimalAnimal['activity']{return terrain==='creek'?'drink':terrain==='meadow'?'graze':'rest';}
function startWolf(s:MinimalState,now:number){s.wolfEvent={startedAt:now,endsAt:now+MINIMAL_RULES.wolfMs,helped:false};s.notice='两只小狼在边缘探头！伙伴会守住这里，也可以帮它一下。';}
export function advanceMinimalState(input:MinimalState,now:number):MinimalState{
 const s=copy(input);if(!Number.isFinite(now)||now<s.updatedAt)return s;
 const dt=Math.min(2000,Math.max(0,now-s.updatedAt))/1000;s.updatedAt=now;
 if(now>=s.nextGiftAt){const count=Math.floor((now-s.nextGiftAt)/MINIMAL_RULES.giftMs)+1;const room=Math.max(0,MINIMAL_RULES.maxGroundGifts-s.gifts.filter(g=>g.location==='ground').length);
  for(let i=0;i<Math.min(count,room);i++){s.sequence++;const rare=s.sequence%10===0;const kind:Gift['kind']=rare?'pebble':s.sequence%3===0?'flower':'wool';s.gifts.push({id:`gift-${s.sequence}`,kind,location:'ground',createdAt:s.nextGiftAt+i*MINIMAL_RULES.giftMs,animalId:s.animals[(s.sequence-1)%s.animals.length].id,rare});}
  s.nextGiftAt+=count*MINIMAL_RULES.giftMs;
 }
 moveAlong(s.player,s.playerPath,dt*2.2);
 for(let i=0;i<s.animals.length;i++){
  const a=s.animals[i];
  if(a.target){const route=a.path;if(!route||!route.every(q=>tileAt(s,q)?.owned)){delete a.target;delete a.path;delete a.targetActivity;a.activity='idle';a.activityUntil=now+3000;}else{moveAlong(a.position,route,dt*(i%2?.55:.65));if(distance(a.position,a.target)<.01){a.position={...a.target};delete a.target;delete a.path;a.activity=a.targetActivity??naturalActivity(tileAt(s,a.position)!.terrain);delete a.targetActivity;a.activityUntil=now+6000;}else a.activity='walk';}}
  else if(now>=a.activityUntil){
   if(a.activity==='drink'||a.activity==='rest'||a.activity==='graze'){a.energy=Math.min(100,a.energy+(a.activity==='drink'?22:a.activity==='rest'?15:10));a.activity='idle';a.activityUntil=now+5000+i*1300;}
   else{const wanted:Terrain=a.energy<65?'creek':i%2?'grove':'hill';const available=s.tiles.filter(t=>t.owned&&t.terrain===wanted);const fallback=tileAt(s,wanted==='creek'?{x:0,z:0}:{x:0,z:1});const options=available.length?available:fallback?[fallback]:s.tiles.filter(t=>t.owned);const pick=options[(Math.floor(now/10_000)+i*7)%options.length];const activity:MinimalAnimal['targetActivity']=available.length?naturalActivity(pick.terrain) as 'drink'|'rest'|'graze':wanted==='creek'?'drink':'rest';if(pick&&distance(a.position,pick)>.01){a.target={x:pick.x,z:pick.z};a.targetActivity=activity;a.path=continuousRoute(s,a.position,a.target)??[];a.activity='walk';a.energy=Math.max(25,a.energy-3);}else{a.activity=activity;a.activityUntil=now+6000;}}
  }
 }
 if(s.wolfEvent&&now>=s.wolfEvent.endsAt){s.wolfEvent=null;s.nextWolfAt=now+MINIMAL_RULES.wolfIntervalMs;s.notice='小狼抱着空篮子跑了，大家都好好的。';}
 // Only short, active sessions spawn events. Returning after a long absence is safe.
 else if(!s.wolfEvent&&now>=s.nextWolfAt){if(now-input.updatedAt<=5000)startWolf(s,now);else s.nextWolfAt=now+45_000;}
 return s;
}
export function minimalCommand(input:MinimalState,command:MinimalCommand,now:number):MinimalReply{
 const s=advanceMinimalState(input,now);const reply=(accepted:boolean,message:string):MinimalReply=>{s.notice=message;return {state:s,accepted,message};};
 if(command.type==='move'){const path=continuousRoute(s,s.player,command.to);if(!path)return reply(false,'这片还没开辟，先点边缘地块看看');s.playerPath=path;return reply(true,'走过去看看');}
 if(command.type==='expand'){const t=validPoint(command.at)?tileAt(s,command.at):undefined;if(!t||t.owned)return reply(false,'选一块还没开辟的土地');if(!neighbors(t).some(p=>tileAt(s,p)?.owned))return reply(false,'从已开辟土地旁边慢慢扩展');if(s.coins<40)return reply(false,'还差一点金币，收下礼物后可以出售');t.owned=true;s.coins-=40;s.expansions++;return reply(true,'新地方亮起来了，小动物也能来啦');}
 if(command.type==='convert'){const t=validPoint(command.at)?tileAt(s,command.at):undefined;if(!t?.owned||!terrains.includes(command.terrain))return reply(false,'只能改造已开辟的土地');if(!s.expansions)return reply(false,'先开辟一块新地，就能尝试改造');if(t.terrain===command.terrain)return reply(false,'这里已经是这种地形');if(s.coins<20)return reply(false,'改造需要 20 金币');t.terrain=command.terrain;s.coins-=20;for(const a of s.animals)if(same(point(a.position),t)&&!a.target){a.activity='idle';a.activityUntil=now+1000;}return reply(true,'地形换好了，等小动物来发现');}
 if(command.type==='care'){const a=s.animals.find(a=>a.id===command.animalId);if(!a)return reply(false,'这只伙伴不在家');a.energy=Math.min(100,a.energy+8);a.bond=Math.min(100,a.bond+1);a.activity='idle';a.activityUntil=now+5000;delete a.target;delete a.path;delete a.targetActivity;return reply(true,`${a.name}蹭了蹭你的手`);}
 if(command.type==='collect'){const gifts=s.gifts.filter(g=>g.location==='ground'&&(!command.giftId||g.id===command.giftId));if(!gifts.length)return reply(false,'礼物还在准备中');for(const g of gifts){g.location='bag';const discovery=`${g.kind}${g.rare?'-rare':''}`;if(!s.collection.includes(discovery))s.collection.push(discovery);}return reply(true,`收下 ${gifts.length} 份礼物，可以留下展示，也可以出售`);}
 if(command.type==='sell'||command.type==='display'){const g=s.gifts.find(g=>g.id===command.giftId&&g.location!=='ground');if(!g)return reply(false,'先把礼物收进背包');if(command.type==='sell'){s.gifts=s.gifts.filter(v=>v!==g);s.coins+=20;return reply(true,'获得 20 金币，图鉴仍会记住这份礼物');}g.location=g.location==='display'?'bag':'display';return reply(true,g.location==='display'?'放在小家里，随时都能看见':'已收回背包');}
 if(command.type==='adopt'){if(s.animals.length>=8)return reply(false,'这个小家暂时最多照顾 8 位伙伴');if(s.coins<80)return reply(false,'领养需要 80 金币');const i=s.animals.length,t=s.tiles.find(t=>t.owned&&!s.animals.some(a=>same(point(a.position),t)))??s.tiles.find(t=>t.owned)!;s.animals.push({id:`sheep-${i+1}`,name:['团团','绵绵','栗子','糯米','云朵','布丁','小麦','棉花'][i],position:{x:t.x,z:t.z},activity:'idle',energy:70,bond:0,bornAt:now,activityUntil:now+5000});s.coins-=80;return reply(true,'新的幼崽来到小家，礼物产速不会因此增加');}
 if(command.type==='guardian'){if(!['dog','cat','frog'].includes(command.guardian))return reply(false,'请选择一位守护伙伴');s.guardian=command.guardian;return reply(true,'伙伴换班啦，守护都一样可靠');}
 if(command.type==='wolf'){if(s.wolfEvent)return reply(false,'伙伴正在处理这次小捣乱');startWolf(s,now);return reply(true,s.notice);}
 if(command.type==='help'){if(!s.wolfEvent)return reply(false,'现在很安全');s.wolfEvent.helped=true;s.wolfEvent.endsAt=Math.min(s.wolfEvent.endsAt,now+4000);return reply(true,'你摇响铃铛，伙伴赶来一起守护');}
 return reply(false,'暂时不支持这个动作');
}
export type MinimalStorage=Pick<Storage,'getItem'|'setItem'>;
function validSave(value:unknown):value is MinimalState{
 if(!value||typeof value!=='object')return false;const s=value as MinimalState;
 const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
 const coordinate=(p:Point)=>!!p&&finite(p.x)&&finite(p.z)&&p.x>=-3&&p.x<=6&&p.z>=-3&&p.z<=6;
 const integer=(p:Point)=>coordinate(p)&&validPoint(p);
 if(s.version!==1||![s.coins,s.updatedAt,s.createdAt,s.nextGiftAt,s.nextWolfAt,s.sequence,s.expansions].every(finite)||s.coins<0||s.expansions<0||s.sequence<0||typeof s.notice!=='string')return false;
 if(!Array.isArray(s.tiles)||s.tiles.length!==100||!s.tiles.every(t=>integer(t)&&terrains.includes(t.terrain)&&typeof t.owned==='boolean')||new Set(s.tiles.map(key)).size!==100||!s.tiles.some(t=>t.owned))return false;
 const onOwned=(p:Point)=>coordinate(p)&&!!tileAt(s,p)?.owned;
 const path=(v:unknown)=>Array.isArray(v)&&v.every(p=>integer(p)&&onOwned(p));
 if(!onOwned(s.player)||!path(s.playerPath)||!Array.isArray(s.animals)||s.animals.length<1||s.animals.length>8||new Set(s.animals.map(a=>a?.id)).size!==s.animals.length)return false;
 if(!s.animals.every(a=>a&&typeof a.id==='string'&&typeof a.name==='string'&&onOwned(a.position)&&[a.bornAt,a.energy,a.bond,a.activityUntil].every(finite)&&a.energy>=0&&a.energy<=100&&a.bond>=0&&a.bond<=100&&['idle','walk','drink','rest','graze'].includes(a.activity)&&(!a.targetActivity||['drink','rest','graze'].includes(a.targetActivity))&&(!a.target||integer(a.target)&&onOwned(a.target)&&path(a.path))))return false;
 if(!Array.isArray(s.gifts)||!s.gifts.every(g=>g&&typeof g.id==='string'&&['wool','flower','pebble'].includes(g.kind)&&['ground','bag','display'].includes(g.location)&&finite(g.createdAt)&&typeof g.rare==='boolean'&&s.animals.some(a=>a.id===g.animalId))||new Set(s.gifts.map(g=>g.id)).size!==s.gifts.length)return false;
 return Array.isArray(s.collection)&&s.collection.every(v=>typeof v==='string')&&['dog','cat','frog'].includes(s.guardian)&&(s.wolfEvent===null||!!s.wolfEvent&&finite(s.wolfEvent.startedAt)&&finite(s.wolfEvent.endsAt)&&typeof s.wolfEvent.helped==='boolean');
}
/** Broken saves are left untouched until the app can present recovery; no implicit reset write. */
export function loadMinimalState(storage:MinimalStorage,now:number):MinimalState{try{const raw=storage.getItem(MINIMAL_STORAGE_KEY);if(raw){const saved:unknown=JSON.parse(raw);if(validSave(saved))return advanceMinimalState(saved,now);}}catch{/* Storage may be unavailable. */}return createMinimalState(now);}
export function saveMinimalState(storage:MinimalStorage,state:MinimalState):boolean{try{const old=storage.getItem(MINIMAL_STORAGE_KEY);if(old&&!validSave(JSON.parse(old)))return false;if(!validSave(state))return false;storage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export const TERRAIN_LABELS:Record<Terrain,string>={meadow:'草地',creek:'小溪',hill:'丘陵',grove:'林荫'};
export const TERRAIN_EFFECTS:Record<Terrain,string>={meadow:'啃啃青草，恢复活力',creek:'沿岸喝水，补充能量',hill:'爬上缓坡，晒太阳休息',grove:'在树荫下打盹，慢慢恢复'};
export function canExpand(state:MinimalState,at:Point):boolean{const t=tileAt(state,at);return !!t&&!t.owned&&neighbors(t).some(p=>tileAt(state,p)?.owned)&&state.coins>=MINIMAL_RULES.expandCost;}
