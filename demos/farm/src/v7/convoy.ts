/** V7 cooperative training journey. All numbers are prototype tuning parameters.
 * Farm animals, inventory, identity cookies and rewards never enter this model. */
export type ConvoyRole='carrier'|'guard';
export type ConvoyRoute='short'|'covered';
export type ConvoyGuardian='dog'|'cat'|'frog';
export type Point={x:number;z:number};
export type TrackPoint=Point&{t:number};
export type Actor=Point&{path:Point[];distance:number;heading:number;track:TrackPoint[]};
export type ConvoyCommand={id:string;type:string;roomId?:string;sequence?:number;guardian?:ConvoyGuardian;route?:ConvoyRoute;x?:number;z?:number;open?:boolean};
export type ConvoyMember={device:string;role:ConvoyRole;sequence:number;seenAt:number;active:boolean};
export type ConvoyResult={id:string;outcome:'delivered'|'cargo-lost'|'timeout';elapsed:number;integrity:number;reward:0;assetTransfer:false};
export type ConvoyRoom={
 version:1;id:string;createdAt:number;lastTick:number;revision:number;members:ConvoyMember[];
 phase:'active'|'success'|'failed';elapsed:number;route:ConvoyRoute;guardian:ConvoyGuardian;
 carrier:Actor;guard:Actor;cart:Actor;wolf:Actor;wolfTrack:TrackPoint[];
 gates:Record<ConvoyRoute,boolean>;integrity:number;scouted:boolean;cooldownUntil:number;effectUntil:number;
 lastHint:string;result:ConvoyResult|null;events:{id:string;at:number;text:string}[];
};
export type ConvoySnapshot={
 room:Omit<ConvoyRoom,'members'|'lastTick'>&{members:{role:ConvoyRole;online:boolean}[]};
 selfRole:ConvoyRole;sequence:number;serverNow:number;guardControl:'human'|'npc';carrierControl:'human'|'npc';paused:boolean;
};
export type ConvoyReply={accepted:boolean;message:string;duplicate:boolean;snapshot:ConvoySnapshot|null};
export const CONVOY={duration:180,presenceMs:5000,carrierSpeed:1,guardSpeed:1.8,cartSpeed:.85,wolfSpeed:1.4,attackPerSecond:15,cooldown:16} as const;
export const CONVOY_START:Point={x:2,z:4},CONVOY_END:Point={x:14,z:4},CONVOY_SCOUT:Point={x:7,z:2};
export const CONVOY_GATES:Record<ConvoyRoute,Point>={short:{x:8,z:4},covered:{x:8,z:11}};
export const GUARDIAN_NAMES:Record<ConvoyGuardian,string>={dog:'刀盾狗',cat:'喵脆角',frog:'奶蛙'};
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const cellKey=(p:Point)=>`${p.x},${p.z}`;
const actor=(x:number,z:number):Actor=>({x,z,path:[],distance:0,heading:Math.PI/2,track:[{x,z,t:0}]});
const segment=(a:Point,b:Point):Point[]=>{const list:Point[]=[];const n=Math.abs(b.x-a.x)+Math.abs(b.z-a.z);for(let i=0;i<=n;i++)list.push({x:a.x+Math.sign(b.x-a.x)*i,z:a.z+Math.sign(b.z-a.z)*i});return list;};
export function routeCells(route:ConvoyRoute):Point[]{
 const corners=route==='short'?[CONVOY_START,CONVOY_END]:[CONVOY_START,{x:4,z:4},{x:4,z:11},{x:12,z:11},{x:12,z:4},CONVOY_END];
 return corners.slice(1).flatMap((p,i)=>segment(corners[i],p).slice(i===0?0:1));
}
export function convoyWalkable(point:Point,room:Pick<ConvoyRoom,'gates'|'route'>,role:ConvoyRole):boolean{
 const {x,z}=point;if(!Number.isInteger(x)||!Number.isInteger(z)||x<1||x>15||z<1||z>13)return false;
 if(x===8&&!Object.entries(CONVOY_GATES).some(([route,p])=>p.z===z&&room.gates[route as ConvoyRoute]))return false;
 return role==='guard'||routeCells(room.route).some(p=>p.x===x&&p.z===z);
}
/** Server-owned four-neighbour navigation: buildings/gates and route selection apply equally to clients/NPCs. */
export function convoyPath(start:Point,end:Point,room:Pick<ConvoyRoom,'gates'|'route'>,role:ConvoyRole):Point[]|null{
 const first={x:Math.round(start.x),z:Math.round(start.z)},last={x:Math.round(end.x),z:Math.round(end.z)};
 if(!convoyWalkable(last,room,role))return null;
 const queue=[first],parents=new Map<string,Point|null>([[cellKey(first),null]]);
 for(let i=0;i<queue.length;i++){
  const p=queue[i];if(cellKey(p)===cellKey(last)){
   const path:Point[]=[];let cursor:Point|null=p;while(cursor){path.unshift(cursor);cursor=parents.get(cellKey(cursor))??null;}
   // Keep the current grid segment: a new destination never cuts across the corner.
   return dist(start,first)>.001?path:path.slice(1);
  }
  for(const d of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){const next={x:p.x+d.x,z:p.z+d.z};if(!parents.has(cellKey(next))&&convoyWalkable(next,room,role)){parents.set(cellKey(next),p);queue.push(next);}}
 }
 return null;
}
/** Keyboard/joystick direction follows the chosen one-cell road instead of targeting diagonal grass. */
export function convoyDirectionalTarget(room:Pick<ConvoyRoom,'carrier'|'guard'|'route'|'gates'>,role:ConvoyRole,direction:Point):Point|null{
 const actor=role==='carrier'?room.carrier:room.guard,origin={x:Math.round(actor.x),z:Math.round(actor.z)};
 if(!Number.isFinite(direction.x)||!Number.isFinite(direction.z)||Math.hypot(direction.x,direction.z)<1e-8)return null;
 if(role==='guard'){const target={x:Math.round(actor.x+direction.x*1.5),z:Math.round(actor.z+direction.z*1.5)};return convoyWalkable(target,room,role)?target:null;}
 let best:Point|null=null,score=0;
 for(const delta of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){const next={x:origin.x+delta.x,z:origin.z+delta.z},dot=delta.x*direction.x+delta.z*direction.z;if(dot>score&&convoyWalkable(next,room,role)){score=dot;best=next;}}
 return best;
}
export function createConvoy(id:string,device:string,now:number,guardian:ConvoyGuardian='dog'):ConvoyRoom{
 return {version:1,id,createdAt:now,lastTick:now,revision:1,members:[{device,role:'carrier',sequence:0,seenAt:now,active:true}],phase:'active',elapsed:0,route:'short',guardian,
  carrier:actor(2,4),guard:actor(3,4),cart:actor(1,4),wolf:actor(14,1),wolfTrack:[{x:14,z:1,t:0}],gates:{short:false,covered:false},integrity:100,scouted:false,cooldownUntil:0,effectUntil:0,
  lastHint:'沿亮路带车到门前；守护者先开门，再保护车队。',result:null,events:[]};
}
function online(member:ConvoyMember|undefined,now:number){return !!member?.active&&now-member.seenAt<=CONVOY.presenceMs;}
function log(room:ConvoyRoom,text:string){room.lastHint=text;room.events.push({id:`${room.id}:${room.events.length}:${room.elapsed.toFixed(3)}`,at:room.elapsed,text});if(room.events.length>24)room.events.shift();}
function record(actor:Actor,time:number){actor.track.push({x:actor.x,z:actor.z,t:time});actor.track=actor.track.filter(p=>p.t>=time-4);}
function move(actor:Actor,speed:number,dt:number,room:ConvoyRoom,role:ConvoyRole){
 let remaining=speed*dt;
 while(remaining>1e-8&&actor.path.length){const next=actor.path[0];if(!convoyWalkable(next,room,role)){actor.path=[];break;}const length=dist(actor,next),step=Math.min(length,remaining);
  if(length>1e-8){actor.heading=Math.atan2(next.x-actor.x,next.z-actor.z);actor.x+=(next.x-actor.x)*step/length;actor.z+=(next.z-actor.z)*step/length;actor.distance+=step;}
  remaining-=step;if(length<=step+1e-8)actor.path.shift();
 }
 record(actor,room.elapsed);
}
function setTarget(actor:Actor,target:Point,room:ConvoyRoom,role:ConvoyRole){
 const next=actor.path[0];
 if(next&&dist(actor,next)>.001){const rest=convoyPath(next,target,room,role);if(rest){actor.path=[next,...rest];return;}}
 actor.path=convoyPath(actor,target,room,role)??[];
}
function finish(room:ConvoyRoom,outcome:ConvoyResult['outcome']){
 if(room.result)return;room.phase=outcome==='delivered'?'success':'failed';room.carrier.path=[];room.guard.path=[];room.cart.path=[];
 room.result={id:`${room.id}:result`,outcome,elapsed:room.elapsed,integrity:Math.round(room.integrity),reward:0,assetTransfer:false};
 log(room,outcome==='delivered'?'训练车队已进入庇护所。一起开路，才走得稳。':outcome==='timeout'?'训练时间到了。下次试试提前开门，再分工断后。':'训练货物受损，请重新尝试。自家动物和库存没有损失。');
}
function ability(room:ConvoyRoom):string|null{
 if(room.elapsed<room.cooldownUntil)return '守护技能还在恢复';
 if(dist(room.guard,room.wolf)>4)return '先走到狼附近4格内，再使用守护';
 room.cooldownUntil=room.elapsed+CONVOY.cooldown;room.effectUntil=room.elapsed+(room.guardian==='dog'?8:room.guardian==='cat'?6:10);
 log(room,room.guardian==='dog'?'刀盾狗挡住狼8秒，运货者快走！':room.guardian==='cat'?'喵脆角引开狼6秒，车队继续前进！':'奶蛙泡泡减速10秒，靠近车队还能保护货物。');return null;
}
function step(room:ConvoyRoom,dt:number,wallNow:number){
 room.elapsed=Math.min(CONVOY.duration,room.elapsed+dt);
 const carrierHuman=online(room.members.find(m=>m.role==='carrier'),wallNow),guardHuman=online(room.members.find(m=>m.role==='guard'),wallNow);
 const gate=CONVOY_GATES[room.route];
 if(!guardHuman){
  if(!room.gates[room.route]){if(dist(room.guard,gate)<=1.5){room.gates[room.route]=true;log(room,'NPC守护伙伴已打开路门');}else if(!room.guard.path.length)setTarget(room.guard,{x:7,z:gate.z},room,'guard');}
  else if(dist(room.guard,room.wolf)<=4&&room.elapsed>=6&&room.elapsed>=room.cooldownUntil)ability(room);
  else if(!room.guard.path.length)setTarget(room.guard,room.elapsed>=6?{x:Math.round(room.cart.x+1),z:Math.round(room.cart.z)}:{x:9,z:gate.z},room,'guard');
 }
 if(!carrierHuman&&!room.carrier.path.length)setTarget(room.carrier,room.gates[room.route]?CONVOY_END:{x:7,z:gate.z},room,'carrier');
 move(room.carrier,CONVOY.carrierSpeed,dt,room,'carrier');move(room.guard,CONVOY.guardSpeed,dt,room,'guard');
 // Cart can only follow the chosen road; no teleporting with the avatar and no cross-wall shortcut.
 if(dist(room.carrier,room.cart)>.65&&!room.cart.path.length){const route=routeCells(room.route);let target=route.reduce((a,p)=>dist(p,room.carrier)<dist(a,room.carrier)?p:a,route[0]);if(room.carrier.x>=13.9&&room.carrier.z===4)target=CONVOY_END;setTarget(room.cart,target,room,'carrier');}
 move(room.cart,CONVOY.cartSpeed,dt,room,'carrier');
 if(room.elapsed>=6){
  const effect=room.elapsed<room.effectUntil;
  const target=effect&&room.guardian==='cat'?room.guard:room.cart;
  const speed=effect&&room.guardian==='dog'?0:effect&&room.guardian==='frog'?CONVOY.wolfSpeed*.45:CONVOY.wolfSpeed;
  // Terrain cover on the south route slows the wolf rather than pretending the route is equally exposed.
  const cover=room.cart.z>=9?.48:1;
  if(!room.wolf.path.length||Math.floor(room.elapsed*2)!==Math.floor((room.elapsed-dt)*2))setTarget(room.wolf,{x:Math.round(target.x),z:Math.round(target.z)},room,'guard');
  move(room.wolf,speed*cover,dt,room,'guard');
  const protectedCargo=effect&&room.guardian==='frog'&&dist(room.guard,room.cart)<=4;
  if(dist(room.wolf,room.cart)<1&&!protectedCargo&&!(effect&&room.guardian==='dog'))room.integrity=Math.max(0,room.integrity-CONVOY.attackPerSecond*dt);
 }
 room.wolfTrack.push({x:room.wolf.x,z:room.wolf.z,t:room.elapsed});room.wolfTrack=room.wolfTrack.filter(p=>p.t>=room.elapsed-4);
 if(room.integrity<=0)finish(room,'cargo-lost');
 else if(dist(room.cart,CONVOY_END)<.15)finish(room,'delivered');
 else if(room.elapsed>=CONVOY.duration)finish(room,'timeout');
}
/** Advance only the period covered by an active member heartbeat. No offline catchup, capped 50ms physics steps. */
export function advanceConvoy(room:ConvoyRoom,now:number){
 if(!Number.isFinite(now)||now<=room.lastTick)return;
 const start=room.lastTick;const liveUntil=Math.max(start,...room.members.filter(m=>m.active).map(m=>m.seenAt+CONVOY.presenceMs));
 const end=Math.min(now,liveUntil);let cursor=start;
 while(cursor<end&&room.phase==='active'){const ms=Math.min(50,end-cursor);step(room,ms/1000,cursor+ms);cursor+=ms;}
 if(cursor>start)room.revision++;
 room.lastTick=now;
}
export function applyConvoy(room:ConvoyRoom,device:string,command:ConvoyCommand,now:number):{accepted:boolean;message:string}{
 const no=(message:string)=>({accepted:false,message});if(!Number.isFinite(now))return no('无效时钟');
 const member=room.members.find(m=>m.device===device);
 if(command.type==='join'){
  if(member){advanceConvoy(room,now);member.active=true;member.seenAt=Math.max(member.seenAt,now);return {accepted:true,message:'已回到原护送角色'};}
  if(room.members.some(m=>m.role==='guard'))return no('这趟已有两位参与者，请另开训练');
  if(room.phase!=='active')return no('这趟已经结束，请另开训练');
  advanceConvoy(room,now);room.members.push({device,role:'guard',sequence:0,seenAt:now,active:true});room.guard.path=[];room.revision++;log(room,'另一设备已接管守护。运货者和守护者请分工。');return {accepted:true,message:'你来守护：先到门边开门，再侦察狼与断后'};
 }
 if(!member)return no('请先加入这趟护送');
 advanceConvoy(room,now);
 if(command.type==='pulse'||command.type==='pause'){member.active=command.type==='pulse';member.seenAt=Math.max(member.seenAt,now);return {accepted:true,message:command.type==='pause'?'离开期间由在线同伴继续；都离开则暂停':'护送状态已同步'};}
 if(!Number.isSafeInteger(command.sequence)||command.sequence!<=member.sequence)return no('指令已过期，请同步后重试');
 member.sequence=command.sequence!;member.active=true;member.seenAt=Math.max(member.seenAt,now);
 if(room.phase!=='active')return no('这趟已经结束，结算已保存');
 let message='';
 if(command.type==='move'){
  if(!Number.isFinite(command.x)||!Number.isFinite(command.z))return no('请选择合法路面');
  const actor=member.role==='carrier'?room.carrier:room.guard,path=convoyPath(actor,{x:command.x!,z:command.z!},room,member.role);
  if(!path)return no(member.role==='carrier'?'这段路还不能走：沿亮路走到门前，请守护者开门':'那边被地形或关闭的门挡住了');
  setTarget(actor,{x:command.x!,z:command.z!},room,member.role);message=member.role==='carrier'?'车队沿选定路线跟着LX':'正在前往守护位置';
 }else if(command.type==='stop'){
  (member.role==='carrier'?room.carrier:room.guard).path=[];message='停下等伙伴，车队会在身旁收拢';
 }else if(command.type==='route'){
  if(member.role!=='carrier')return no('由运货者选择路线');
  if(room.carrier.distance>.1||room.cart.distance>.1)return no('出发后路线已锁定，下一趟可以换路');
  if(command.route!=='short'&&command.route!=='covered')return no('请选择短路或掩护路');
  room.route=command.route;room.carrier.path=[];room.guard.path=[];message=command.route==='short'?'短路12格：更快，但狼追得紧':'掩护路26格：更远，草丛让狼慢下来';
 }else if(command.type==='gate'){
  if(member.role!=='guard')return no('运货者不能同时指挥守护，请同伴开门');
  if(typeof command.open!=='boolean')return no('请选择开门或关门');
  const gate=CONVOY_GATES[room.route];if(dist(room.guard,gate)>1.5)return no('先走到当前路线的门旁1.5格内');
  // Reserve the cart's trailing NPC herd envelope too; closing may not cut the tail of the convoy.
  if(!command.open&&([room.carrier,room.wolf].some(p=>dist(p,gate)<1.1)||dist(room.cart,gate)<2.2||dist(room.guard,gate)<.45))return no('门口有人或车队，暂时不能关门');
  room.gates[room.route]=command.open;message=command.open?'门已打开，告诉运货者继续':'门已关闭，狼也需要绕路';
 }else if(command.type==='scout'){
  if(member.role!=='guard')return no('由守护者侦察，运货者专心带队');
  if(dist(room.guard,CONVOY_SCOUT)>1.5)return no('先到蓝色观察点附近');
  room.scouted=true;message='发现北边的狼！6秒后出动，长路草丛会减慢追赶';
 }else if(command.type==='ability'){
  if(member.role!=='guard')return no('运货者不能同时指挥守护');
  const reason=ability(room);if(reason)return no(reason);message=room.lastHint;
 }else return no('未知护送指令');
 room.revision++;if(command.type!=='ability'&&command.type!=='move')log(room,message);return {accepted:true,message};
}
export function convoySnapshot(room:ConvoyRoom,device:string,now:number):ConvoySnapshot{
 const member=room.members.find(m=>m.device===device);if(!member)throw new Error('not a convoy member');
 const {members,lastTick:discarded,...publicRoom}=structuredClone(room);void discarded;
 const guardOnline=online(members.find(m=>m.role==='guard'),now),carrierOnline=online(members.find(m=>m.role==='carrier'),now);
 return {room:{...publicRoom,members:members.map(m=>({role:m.role,online:online(m,now)}))},selfRole:member.role,sequence:member.sequence,serverNow:now,
  guardControl:guardOnline?'human':'npc',carrierControl:carrierOnline?'human':'npc',paused:!guardOnline&&!carrierOnline};
}
/** Renderer uses authoritative trails; interpolation preserves each navigation corner. */
export function convoyTrackAt(track:readonly TrackPoint[],time:number):Point{
 if(!track.length)return {x:0,z:0};if(time<=track[0].t)return {x:track[0].x,z:track[0].z};
 for(let i=1;i<track.length;i++){const b=track[i],a=track[i-1];if(time<=b.t){const ratio=b.t===a.t?1:(time-a.t)/(b.t-a.t);return {x:a.x+(b.x-a.x)*ratio,z:a.z+(b.z-a.z)*ratio};}}
 const last=track.at(-1)!;return {x:last.x,z:last.z};
}
