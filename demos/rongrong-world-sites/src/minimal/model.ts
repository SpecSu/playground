import {MINIMAL_DEFENSE_ENABLED,MINIMAL_DEFENSE_PAUSED_MESSAGE} from './defense-policy.ts';
import {validTileAppearance,isTerrainAppearance,terrainAppearanceIssue,TERRAIN_APPEARANCE_LABELS,type TerrainAppearance} from './terrain-appearance.ts';
import {staticObstacleAt,staticObstacleEscape,staticObstacleSegmentClear,staticObstacleSegmentSafe,validStaticObstacles,withoutStaticObstacles} from './creative-obstacles.ts';
import {approvedCreativeAnimal,type CreativeAnimalIdentity} from './creative-assets.ts';
import {domainSelectedAnimal,assertAnimalResourceContext,type AnimalResourceContext} from './animal-resource-context.ts';
import {localAnimalWaterContact} from './local-animal-water.ts';
import {alpacaPondPlacement} from './alpaca-pond-placement.ts';
import {createPondWaterFootprint,samplePondWaterFootprint,type PondWaterFootprint} from './pond-water-footprint.ts';
import {alpacaBowlSegmentSafe} from './alpaca-bowl-safety.ts';
import {alpacaBowlPlacement} from './alpaca-bowl-placement.ts';
import {BOWL_WATER_GEOMETRY} from './bowl-water-geometry.ts';
import {sampleRarity,isAnimalRarity,rarityOf,type AnimalRarity} from './animal-rarity.ts';
import {advanceEggIncubation,retainEggProgress,eggHabitatMatches,eggIncubationStatus,validEggIncubation,type EggIncubation} from './egg-incubation.ts';
import {decodeFarmSave} from './save-migration.ts';
import {planNaturalBiomes} from './natural-biome-layout.ts';
import {eggOffer,eggPurchaseAvailability,isEggTheme,themeForNaturalTerrain,type EggTheme} from './egg-catalog.ts';
import {explorationIssue,terrainConversionIssue,grantNaturalBiome,conversionExpansionIssue} from './terrain-progression.ts';
import {availableBreedingPairs,breedingPairStatus} from './breeding-status.ts';
import {dayKey,validCalendarDay} from './farm-calendar.ts';
export {dayKey} from './farm-calendar.ts';
import {canClaimCompanionGift,COMPANION_GREETING_GIFT_COINS} from './companion-gift.ts';
export {canClaimCompanionGift,COMPANION_GREETING_GIFT_COINS} from './companion-gift.ts';
import {SHOP_TILES,SHOP_APPROACH,WATER_BOWL,REST_MAT} from './farm-landmarks.ts';
export {SHOP_TILES,SHOP_APPROACH,WATER_BOWL,REST_MAT} from './farm-landmarks.ts';
import {farmSupply,tileLevel,terrainUpgradeCost,type TerrainLevel} from './terrain-supply.ts';
export {farmSupply,tileLevel,tileSupply,terrainUpgradeCost,TERRAIN_QUALITY_LABELS} from './terrain-supply.ts';
import {animalGridTravel,animalWorldSpeed,animalMotionProfile,ANIMAL_MOTION_PROFILES} from './animal-motion.ts';
import {resolveAnimalLanding,isSafeAnimalArrival,animalInteractionRadius} from './interaction-motion.ts';
import {ANIMAL_ADULT_MS,ANIMAL_STAGE_MS,LEGACY_ADULT_MS,animalGrowthAgeMs,animalGrowthStage,animalScale,validAnimalGrowth,createAnimalGrowth,type AnimalGrowthProfile} from './animal-growth.ts';
export {animalScale,animalGrowthStage,animalGrowthLabel,animalGrowthRemainingMs,animalGrowthProgress} from './animal-growth.ts';
export type {AnimalGrowthProfile,AnimalGrowthStage} from './animal-growth.ts';
import {advancePlayerMotion,MAX_PLAYER_SPEED,MAX_SAVED_PLAYER_SPEED,retargetPlayerSpeed} from './player-motion.ts';
/** V12 egg farm: isolated browser save; V11/V9 saves are deliberately untouched. */
export type Terrain='meadow'|'creek'|'pond'|'hill'|'grove'|'desert'|'glacier';
export type Point={x:number;z:number};
export type Tile=Point&{appearance?:TerrainAppearance;terrain:Terrain;naturalTerrain?:Terrain;owned:boolean;level?:TerrainLevel};
export type GuardianKind='dog'|'cat'|'frog';
import {SPECIES,isSpecies,isLegacySpecies,isAnimalProviderReady,isAnimalRuntimeActive,isAnimalCommerceReady,type Species} from './species.ts';
export {SPECIES,KNOWN_SPECIES,isSpecies} from './species.ts';
export type {Species,LegacySpecies} from './species.ts';
export type Sex='male'|'female';
export type AnimalSize='normal'|'large'|'giant';
export type DrinkAnchor={site:Point;stance:Point;waterSite?:Point};
export type MinimalAnimal={id:string;creative?:CreativeAnimalIdentity;resourceSuspended?:true;rarity?:AnimalRarity;name:string;species:Species;sex:Sex;size:AnimalSize;growth?:AnimalGrowthProfile;growthAgeMs?:number;growthBonusMs?:number;position:Point;target?:Point;path?:Point[];targetActivity?:'drink'|'rest'|'graze';drinkAnchor?:DrinkAnchor;activity:'idle'|'walk'|'drink'|'rest'|'graze'|'carried';energy:number;bond:number;bornAt:number;activityUntil:number;lastBreedAttemptDay?:string};
export type FarmEgg={id:string;rarity?:AnimalRarity;incubation?:EggIncubation;theme?:EggTheme;source:'shop'|'bred';species:Species;sex:Sex;size:AnimalSize;growth?:AnimalGrowthProfile;location:'bag'|'ground';position?:Point;boughtAt:number;placedAt?:number;readyAt?:number;parents?:[string,string]};
/** Kept as an empty compatibility surface for older render consumers; V12 never produces gifts. */
export type Gift={id:string;kind:'wool'|'flower'|'pebble';location:'ground'|'bag'|'display';createdAt:number;animalId:string;rare:boolean};
export type WolfEvent={startedAt:number;endsAt:number;helped:boolean};
export type MinimalState={staticObstacles?:Point[];version:3;biomeLayoutVersion:1;exploredBiomes:EggTheme[];biomeCompatibilityGrants?:EggTheme[];biomeCompatibilityReason?:'legacy-no-reachable-natural-target';lastCompanionGiftDay?:string;terrainGrowthAt?:number;coins:number;welcomeClaimed:boolean;tiles:Tile[];animals:MinimalAnimal[];eggs:FarmEgg[];carriedAnimalId:string|null;guardian:GuardianKind;player:Point;playerPath:Point[];playerSpeed?:number;gifts:Gift[];collection:string[];createdAt:number;updatedAt:number;nextWolfAt:number;expansions:number;wolfEvent:WolfEvent|null;notice:string;sequence:number;placedEggCount:number;hatchedCount:number;breedingDay:string|null;lastHatch:{animalId:string;at:number;position:Point}|null;lastBreeding:{animalIds:[string,string];at:number;success:boolean}|null};
export type MinimalCommand=
 |{type:'welcome'}|{type:'buyEgg';theme?:EggTheme}|{type:'emergencyEgg'}|{type:'placeEgg';eggId:string;at:Point}|{type:'hatch';eggId:string}|{type:'collectEgg';eggId:string}
 |{type:'suspendUnavailableCarry'}|{type:'resumeSuspendedAnimal';animalId:string;at?:Point}
 |{type:'pickup';animalId:string}|{type:'putdown';at?:Point}|{type:'sellAnimal'}|{type:'breed';animalIds:[string,string]}
 |{type:'upgradeTerrain';at:Point;toLevel:2|3}
 |{type:'paintTerrain';at:Point;appearance:TerrainAppearance}
 |{type:'move';to:Point}|{type:'expand';at:Point}|{type:'convert';at:Point;terrain:Terrain}|{type:'care';animalId:string}
 |{type:'guardian';guardian:GuardianKind}|{type:'wolf'}|{type:'help'};
export type MinimalReply={state:MinimalState;accepted:boolean;message:string};
export const LEGACY_MINIMAL_STORAGE_KEY='dreamina-egg-farm-v2';
export const MINIMAL_STORAGE_KEY='dreamina-egg-farm-v3';
export const MINIMAL_RULES={min:-3,max:6,welcomeCoins:120,eggCost:30,firstHatchMs:10_000,hatchMs:15_000,adultMs:ANIMAL_ADULT_MS,stageMs:ANIMAL_STAGE_MS,maxAnimals:16,expandCost:40,convertCost:20,breedChance:.35,wolfMs:18_000,wolfIntervalMs:240_000} as const;
export const SPECIES_LABELS:Record<Species,string>={sheep:'小羊',pig:'小猪',cow:'小牛',bunny:'兔兔',duck:'小鸭',alpaca:'羊驼',penguin:'企鹅'};
export const MINIMAL_TERRAINS:readonly Terrain[]=['meadow','creek','pond','hill','grove','desert','glacier'];
const terrains=MINIMAL_TERRAINS;
const speciesList:readonly Species[]=SPECIES;
const same=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
const point=(p:Point)=>({x:Math.round(p.x),z:Math.round(p.z)});
const validPoint=(p:Point)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isInteger(p.x)&&Number.isInteger(p.z);
const key=(p:Point)=>`${p.x},${p.z}`;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const neighbors=(p:Point):Point[]=>[{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},{x:p.x-1,z:p.z},{x:p.x,z:p.z-1}];
const copy=<T>(value:T):T=>structuredClone(value);
export function tileAt(state:MinimalState,p:Point):Tile|undefined{return p&&state.tiles.find(t=>same(t,point(p)));}
export function isShopTile(p:Point):boolean{return !!p&&SHOP_TILES.some(t=>same(t,point(p)));}
export const isWalkableTile=(s:MinimalState,p:Point)=>{const tile=tileAt(s,p);return !!tile?.owned&&tile.terrain!=='pond'&&!isShopTile(p)&&!staticObstacleAt(s,p);};
const walkable=isWalkableTile;
function connectedLand(s:MinimalState):boolean{const land=s.tiles.filter(t=>walkable(s,t));if(!land.length)return false;const seen=new Set<string>(),queue:Point[]=[land[0]];for(let i=0;i<queue.length;i++){const p=queue[i];if(seen.has(key(p)))continue;seen.add(key(p));for(const n of neighbors(p))if(walkable(s,n)&&!seen.has(key(n)))queue.push(n);}return seen.size===land.length;}
/** Interior pond cells need not touch shore, but every owned water component must. */
function pondsHaveShore(s:MinimalState):boolean{
 const visited=new Set<string>();
 for(const tile of s.tiles){
  if(!tile.owned||tile.terrain!=='pond'||visited.has(key(tile)))continue;
  const queue:Point[]=[tile];let shore=false;
  for(let i=0;i<queue.length;i++){const p=queue[i];if(visited.has(key(p)))continue;visited.add(key(p));
   for(const n of neighbors(p)){const adjacent=tileAt(s,n);if(walkable(s,n))shore=true;else if(adjacent?.owned&&adjacent.terrain==='pond'&&!visited.has(key(n)))queue.push(n);}
  }
  if(!shore)return false;
 }
 return true;
}
export function nearShop(s:MinimalState):boolean{return distance(s.player,SHOP_APPROACH)<=1.2&&walkable(s,s.player);}
export function isAdult(a:MinimalAnimal,now:number):boolean{return animalGrowthStage(a,now)==='adult';}
export function sellValue(a:MinimalAnimal):number{return a.size==='giant'?100:a.size==='large'?65:40;}
export function terrainFor(p:Point):Terrain{if((p.x===4||p.x===5)&&(p.z===2||p.z===3))return 'pond';if(p.x===4||p.x===3&&p.z>=2)return 'creek';if(p.z<=-1&&p.x>=1)return 'hill';if(p.x<=-1&&p.z>=1||p.z>=4&&p.x<3)return 'grove';return 'meadow';}
export function createMinimalState(now:number):MinimalState{
 const time=Number.isFinite(now)?now:0,tiles:Tile[]=[];for(let x=-3;x<=6;x++)for(let z=-3;z<=6;z++)tiles.push({x,z,terrain:terrainFor({x,z}),owned:x>=0&&x<4&&z>=0&&z<4});
 const layout=planNaturalBiomes({tiles,player:{x:1,z:3},playerPath:[],animals:[],eggs:[]});
 return {version:3,biomeLayoutVersion:1,exploredBiomes:[...new Set<EggTheme>(['grassland',...tiles.filter(t=>t.owned).flatMap(t=>{const theme=themeForNaturalTerrain(t.terrain);return theme?[theme]:[];})])],terrainGrowthAt:time,coins:0,welcomeClaimed:false,tiles:layout.tiles,animals:[],eggs:[],carriedAnimalId:null,guardian:'dog',player:{x:1,z:3},playerPath:[],gifts:[],collection:[],createdAt:time,updatedAt:time,nextWolfAt:time+300_000,expansions:0,wolfEvent:null,notice:'收下开园金币，去小店挑一颗惊喜蛋',sequence:0,placedEggCount:0,hatchedCount:0,breedingDay:null,lastHatch:null,lastBreeding:null};
}
export function ownedPath(state:MinimalState,from:Point,to:Point):Point[]|null{
 if(staticObstacleAt(state,to))return null;state=staticObstacleEscape(state,from);
 if(!validPoint(to)||!walkable(state,to))return null;const start=point(from);if(!walkable(state,start))return null;
 const queue:Point[]=[start],seen=new Map<string,Point|null>([[key(start),null]]);
 for(let i=0;i<queue.length;i++){const p=queue[i];if(same(p,to)){const path:Point[]=[p];let prior=seen.get(key(p));while(prior){path.unshift(prior);prior=seen.get(key(prior));}return path;}for(const q of neighbors(p))if(walkable(state,q)&&!seen.has(key(q))){seen.set(key(q),p);queue.push(q);}}
 return null;
}
export function continuousRoute(state:MinimalState,from:Point,to:Point):Point[]|null{const path=ownedPath(state,from,to);if(!path)return null;const route=path.slice(1);if(distance(from,path[0])>.00001&&(!route.length||Math.abs(route[0].x-from.x)>.00001&&Math.abs(route[0].z-from.z)>.00001))route.unshift(path[0]);return route;}
/** Product manor timing, in logical grid cells per second. */
export const PLAYER_WALK_SPEED=MAX_PLAYER_SPEED;
const freePoint=(p:Point)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>MINIMAL_RULES.min-.5&&p.x<MINIMAL_RULES.max+.5&&p.z>MINIMAL_RULES.min-.5&&p.z<MINIMAL_RULES.max+.5;
function playerNavigation(state:MinimalState,from:Point):MinimalState{
 state=staticObstacleEscape(state,from,PLAYER_POND_CLEARANCE_CELLS);
 // Placing an egg under the avatar must never trap its owner inside the nest.
 const nests=state.eggs.filter(e=>e.location==='ground'&&e.position&&!same(point(from),e.position)).map(e=>e.position!);
 return {...state,tiles:state.tiles.map(t=>nests.some(n=>same(n,t))?{...t,owned:false}:t)};
}
export function clearPlayerSegment(state:MinimalState,from:Point,to:Point):boolean{
 if(!freePoint(from)||!freePoint(to)||!walkable(state,from)||!walkable(state,to)||!staticObstacleSegmentClear(state,from,to))return false;
 // Closed expanded boxes reject even a diagonal grazing a blocked corner.
 for(const tile of state.tiles){
  // This is already the canonical tile; avoid an O(n) lookup for each O(n) scan.
  if(tile.owned&&tile.terrain!=='pond'&&!isShopTile(tile))continue;
  let enter=0,leave=1;
  for(const axis of ['x','z'] as const){
   const delta=to[axis]-from[axis],low=tile[axis]-.500001,high=tile[axis]+.500001;
   if(Math.abs(delta)<1e-12){if(from[axis]<low||from[axis]>high){enter=2;break;}}
   else {const a=(low-from[axis])/delta,b=(high-from[axis])/delta;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));}
  }
  if(enter<=leave)return false;
 }
 return true;
}
/** Player shoes need a little more bank than the shared root/save geometry. */
export const PLAYER_POND_CLEARANCE_CELLS=.12;
function playerPondBoxIntersectsSegment(tile:Tile,from:Point,to:Point):boolean{
 const half=.5+PLAYER_POND_CLEARANCE_CELLS+.000001;
 let enter=0,leave=1;
 for(const axis of ['x','z'] as const){
  const delta=to[axis]-from[axis],low=tile[axis]-half,high=tile[axis]+half;
  if(delta===0){if(from[axis]<low||from[axis]>high)return false;}
  else {const a=(low-from[axis])/delta,b=(high-from[axis])/delta;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));}
 }
 return enter<=leave;
}
function clearPlayerWalkSegment(navigation:MinimalState,from:Point,to:Point):boolean{
 return clearPlayerSegment(navigation,from,to)&&staticObstacleSegmentClear(navigation,from,to,PLAYER_POND_CLEARANCE_CELLS)&&!navigation.tiles.some(t=>t.terrain==='pond'&&playerPondBoxIntersectsSegment(t,from,to));
}
function strictPlayerWalkRoute(navigation:MinimalState,from:Point,to:Point):Point[]|null{
 if(!clearPlayerWalkSegment(navigation,from,from)||!clearPlayerWalkSegment(navigation,to,to))return null;
 if(clearPlayerWalkSegment(navigation,from,to))return same(from,to)?[]:[{...to}];
 const grid=ownedPath(navigation,from,point(to));
 if(!grid||!clearPlayerWalkSegment(navigation,from,grid[0])||!clearPlayerWalkSegment(navigation,grid[grid.length-1],to))return null;
 const candidates=[{...from},...grid,{...to}],route:Point[]=[];
 for(let i=0;i<candidates.length-1;){
  let next=candidates.length-1;while(next>i+1&&!clearPlayerWalkSegment(navigation,candidates[i],candidates[next]))next--;
  if(!clearPlayerWalkSegment(navigation,candidates[i],candidates[next]))return null;
  if(!same(candidates[i],candidates[next]))route.push({...candidates[next]});i=next;
 }
 return route;
}
/** Remaining waypoints, without the starting position; the last is the exact click. */
export function playerWalkRoute(state:MinimalState,from:Point,to:Point):Point[]|null{
 if(!freePoint(from)||!freePoint(to)||staticObstacleAt(state,to))return null;
 const navigation=playerNavigation(state,from);
 if(!clearPlayerWalkSegment(navigation,to,to))return null;
 if(clearPlayerWalkSegment(navigation,from,from))return strictPlayerWalkRoute(navigation,from,to);
 // Old dry roots may overlap the new buffer. Retain only their checked current
 // cell center, never an arbitrary escape or a prefix without a complete suffix.
 const center=point(from);
 if(!clearPlayerSegment(navigation,from,center)||!clearPlayerWalkSegment(navigation,center,center))return null;
 const suffix=strictPlayerWalkRoute(navigation,center,to);
 return suffix?[center,...suffix]:null;
}
/** Route admissibility is intentionally separate from the historical save schema. */
export function isPlayerWalkRouteSafe(state:MinimalState,from:Point,path:readonly Point[]):boolean{
 if(!path.length)return true;
 const navigation=playerNavigation(state,from);
 let start=0;
 if(!clearPlayerWalkSegment(navigation,from,from)){
  const center=point(from);
  if(!same(path[0],center)||!clearPlayerSegment(navigation,from,center)||!clearPlayerWalkSegment(navigation,center,center))return false;
  start=1;
 }
 for(let i=start;i<path.length;i++){const previous=i?path[i-1]:from;if(!clearPlayerWalkSegment(playerNavigation(state,previous),previous,path[i])||!staticObstacleSegmentSafe(state,previous,path[i],PLAYER_POND_CLEARANCE_CELLS))return false;}
 return true;
}
function moveAlong(position:Point,path:Point[],travel:number):void{while(path.length&&travel>0){const next=path[0],d=distance(position,next);if(d<.00001){path.shift();continue;}const step=Math.min(d,travel);position.x+=(next.x-position.x)*step/d;position.z+=(next.z-position.z)*step/d;travel-=step;if(step===d){position.x=next.x;position.z=next.z;path.shift();}}}
export function canPlaceEgg(s:MinimalState,at:Point):boolean{return validPoint(at)&&walkable(s,at)&&!same(at,WATER_BOWL)&&!same(at,REST_MAT)&&!s.eggs.some(e=>e.location==='ground'&&e.position&&same(e.position,at))&&!s.animals.some(a=>a.id!==s.carriedAnimalId&&same(point(a.position),at));}
function random(s:MinimalState,salt:number):number{let x=(Math.floor(s.createdAt/1000)^Math.imul(s.sequence+1,0x9e3779b9)^Math.imul(salt+7,0x85ebca6b))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return (x>>>0)/4294967296;}
function egg(s:MinimalState,now:number,source:'shop'|'bred',species?:Species):FarmEgg{s.sequence++;const roll=random(s,2),size:AnimalSize=roll<.7?'normal':roll<.95?'large':'giant',id=`egg-${s.sequence}`;return {id,rarity:sampleRarity(random(s,7)),source,species:species??speciesList[Math.floor(random(s,0)*speciesList.length)],sex:random(s,1)<.5?'male':'female',size,growth:createAnimalGrowth(`${s.createdAt}:${id}:${now}`,size),location:'bag',boughtAt:now};}
function stopAnimal(a:MinimalAnimal,now:number){delete a.target;delete a.path;delete a.targetActivity;delete a.drinkAnchor;a.activity='idle';a.activityUntil=now+5000;}
function clearNewNestActions(s:MinimalState,now:number,inspection?:AnimalResourceContext|null){s.playerPath=[];s.playerSpeed=0;for(const a of s.animals)if(a.drinkAnchor&&!currentDrinkAnchorSafe(s,a,now,inspection))stopAnimal(a,now);}
export function eligiblePairs(s:MinimalState,now:number,inspection?:AnimalResourceContext|null):[string,string][]{return availableBreedingPairs(s,now,inspection);}
function tryBreed(s:MinimalState,ids:[string,string],now:number,inspection?:AnimalResourceContext|null):boolean{
 const eligible=eligiblePairs(s,now,inspection).some(p=>p.includes(ids[0])&&p.includes(ids[1])&&ids[0]!==ids[1]);if(!eligible)return false;
 const a=s.animals.find(a=>a.id===ids[0])!,b=s.animals.find(a=>a.id===ids[1])!;
 const available=s.tiles.filter(t=>canPlaceEgg(s,t)).sort((u,v)=>distance(u,a.position)-distance(v,a.position));if(!available.length)return false;
 s.sequence++;const success=random(s,8)<MINIMAL_RULES.breedChance;const today=dayKey(now);a.lastBreedAttemptDay=today;b.lastBreedAttemptDay=today;stopAnimal(a,now);stopAnimal(b,now);s.lastBreeding={animalIds:[a.id,b.id],at:now,success};
 if(success){const e=egg(s,now,'bred',a.species);e.parents=[a.id,b.id];e.location='ground';e.position={x:available[0].x,z:available[0].z};e.placedAt=now;e.readyAt=now+MINIMAL_RULES.hatchMs;s.eggs.push(e);clearNewNestActions(s,now,inspection);s.breedingDay=today;s.notice=`它们留下了一颗${SPECIES_LABELS[a.species]}蛋，今天的小惊喜只有这一颗。`;}
 else s.notice='它们开心地碰了碰鼻子，今天没有留下蛋，明天再看看。';return true;
}
function destinationFree(s:MinimalState,p:Point,id:string):boolean{return !s.animals.some(a=>a.id!==id&&a.id!==s.carriedAnimalId&&(distance(a.position,p)<.7||!!a.target&&same(a.target,p)));}
export function animalNavigation(s:MinimalState):MinimalState{return {...s,tiles:s.tiles.map(t=>s.eggs.some(e=>e.location==='ground'&&e.position&&same(e.position,t))?{...t,owned:false}:t)};}
export type WaterContact={standingPoint:Point;waterPoint:Point;waterHeight:number;source:'pond'|'creek'|'bowl';waterSite:Point;reachClamped?:boolean};
/** Logical grid coordinates; waterHeight is absolute scene Y. No animation data enters saves. */
function authoredDrinkSpot(s:MinimalState,a:Pick<MinimalAnimal,'position'|'target'>,waterSite?:Point,species?:Species,stance?:Point):WaterContact|null{
 const standingPoint=point(a.target??a.position),tile=tileAt(s,standingPoint);if(!tile||!walkable(s,standingPoint))return null;
 if(same(standingPoint,WATER_BOWL)){
  if(waterSite&&!same(waterSite,WATER_BOWL))return null;
  const waterPoint={x:WATER_BOWL.x-.25,z:WATER_BOWL.z-.225};let waterHeight=BOWL_WATER_GEOMETRY.centerY;
  if(species==='alpaca'){
   // New alpaca alone targets the visible near water edge, not the solid bowl's
   // center. The anchor's true stance determines the bank; no local-Y shortcut.
   const bank=stance??standingPoint,dx=bank.x-waterPoint.x,dz=bank.z-waterPoint.z,d=Math.hypot(dx,dz);if(d<1e-8)return null;
   const offset=BOWL_WATER_GEOMETRY.radius*.95/2;waterPoint.x+=dx/d*offset;waterPoint.z+=dz/d*offset;waterHeight+=BOWL_WATER_GEOMETRY.depth/2;
  }
  return {standingPoint,waterPoint,waterHeight,source:'bowl',waterSite:{...WATER_BOWL}};
 }
 const pond=neighbors(standingPoint).find(p=>{const t=tileAt(s,p);return (!waterSite||same(p,waterSite))&&t?.owned&&t.terrain==='pond';});
 if(pond){const dx=pond.x-standingPoint.x,dz=pond.z-standingPoint.z;return {standingPoint:{x:standingPoint.x+dx*.18,z:standingPoint.z+dz*.18},waterPoint:{x:standingPoint.x+dx*.58,z:standingPoint.z+dz*.58},waterHeight:.009,source:'pond',waterSite:{...pond}};}
 if(tile.terrain==='creek'&&(!waterSite||same(waterSite,standingPoint))){const jitter=(n:number)=>{const v=Math.sin(tile.x*71.57+tile.z*19.21+n*13.43)*43758.545;return (v-Math.floor(v)-.5)*.16;};const waterPoint={x:tile.x+jitter(40),z:tile.z+jitter(41)};return {standingPoint:{x:waterPoint.x-.35,z:waterPoint.z},waterPoint,waterHeight:.009,source:'creek',waterSite:{...standingPoint}};}
 return null;
}
type WaterAnimal=Pick<MinimalAnimal,'species'|'bornAt'|'size'|'growth'|'growthAgeMs'|'growthBonusMs'>;
function baseDrinkSpot(s:MinimalState,a:Pick<MinimalAnimal,'position'|'target'>,waterSite?:Point,species?:Species,stance?:Point,scale?:number,inspection?:AnimalResourceContext|null):WaterContact|null{const contact=authoredDrinkSpot(s,a,waterSite,species,stance);if(species==='penguin'&&contact?.source==='bowl'||species==='alpaca'&&contact?.source==='creek')return null;if(!species||!domainSelectedAnimal(species,inspection))return contact;if(scale===undefined)return null;return localAnimalWaterContact(contact,species,scale,inspection);}
/** Optional asset-authored muzzle reach in WORLD units, already multiplied by visual scale. */
export function getDrinkSpot(s:MinimalState,a:Pick<MinimalAnimal,'position'|'target'|'drinkAnchor'>&Partial<WaterAnimal>,options:{reachWorld?:number;scale?:number;now?:number;inspection?:AnimalResourceContext|null}={}):WaterContact|null{
 const contact=baseDrinkSpot(s,a.drinkAnchor?{position:a.drinkAnchor.site}:a,a.drinkAnchor?.waterSite,a.species,a.drinkAnchor?.stance,options.scale??(a.species&&a.size&&Number.isFinite(a.bornAt)?animalScale(a as WaterAnimal,options.now??s.updatedAt):undefined),options.inspection);let reach=options.reachWorld;if(contact&&a.drinkAnchor)return {...contact,standingPoint:{...a.drinkAnchor.stance}};
 if(contact?.source==='bowl'&&a.species==='alpaca'&&options.scale!==undefined){const profile=animalMotionProfile(a.species,options.inspection);if(profile?.bowlStanding){const fixed=alpacaBowlPlacement(profile,options.scale);if(!fixed)return null;reach=fixed.reach;}}
 if(contact?.source==='pond'&&a.species==='alpaca'&&options.scale!==undefined){const profile=animalMotionProfile(a.species,options.inspection);if(profile?.pondStanding){const fixed=alpacaPondPlacement(profile,options.scale);if(!fixed)return null;reach=fixed.reach;}}
 if(!contact||reach===undefined||!Number.isFinite(reach)||reach<=0)return contact;
 const center=point(a.target??a.position),navigation=playerNavigation(s,center),dx=contact.standingPoint.x-contact.waterPoint.x,dz=contact.standingPoint.z-contact.waterPoint.z,angle=Math.atan2(dz,dx);
 // Prefer the authored bank. Alternate sides are allowed only across continuous dry/shallow ground.
 for(const turn of a.species==='alpaca'&&contact.source==='bowl'?[0]:[0,Math.PI/2,-Math.PI/2,Math.PI]){const standingPoint={x:contact.waterPoint.x+Math.cos(angle+turn)*reach/2,z:contact.waterPoint.z+Math.sin(angle+turn)*reach/2};
  if(clearPlayerSegment(navigation,center,standingPoint))return {...contact,standingPoint,reachClamped:false};
 }
 // Keep the known safe authored stance instead of crossing deep water to satisfy neck reach.
 return {...contact,reachClamped:true};
}
const pondFootprints=new WeakMap<readonly Tile[],PondWaterFootprint>();
function hunyuanDryFootSegment(s:MinimalState,from:Point,to:Point):boolean{
 let field=pondFootprints.get(s.tiles);if(!field){field=createPondWaterFootprint(s.tiles);pondFootprints.set(s.tiles,field);}
 // Rendered water uses a 6.25 cm mesh grid; the foot boundary checks sample
 // at most 5 mm apart with a separate 3 mm dry margin. This is a bounded
 // game clearance check, not a formal continuum collision proof.
 const steps=Math.max(1,Math.ceil(distance(from,to)*2/.005));for(let i=0;i<=steps;i++){const u=i/steps,p={x:from.x+(to.x-from.x)*u,z:from.z+(to.z-from.z)*u},tile=tileAt(s,p);if(!tile?.owned||isShopTile(p))return false;if(tile.terrain==='pond'&&samplePondWaterFootprint(field,(p.x-1.5)*2,(p.z-1.5)*2).distance<.003)return false;}
 return true;
}
/** An oriented envelope of actual weighted foot vertices, not just the root. */
function dryAnimalFeet(s:MinimalState,a:MinimalAnimal,stance:Point,water:Point,scale:number,walking=false,turning=false,inspection?:AnimalResourceContext|null,overrideProfile?:NonNullable<ReturnType<typeof animalMotionProfile>>):boolean{
 const profile=overrideProfile??animalMotionProfile(a.species,inspection);if(!profile)return false;const feet=walking?profile.walkContactFeet:profile.feet,radius=Math.hypot(feet.side,Math.max(feet.front,feet.back)),bounds=turning?{side:radius,front:radius,back:radius}:feet;
 const dx=water.x-stance.x,dz=water.z-stance.z,d=Math.hypot(dx,dz);if(d<.00001)return false;
 const forward={x:dx/d,z:dz/d},side={x:forward.z,z:-forward.x},margin=.005;
 const corners=[[-bounds.side,-bounds.back],[bounds.side,-bounds.back],[bounds.side,bounds.front],[-bounds.side,bounds.front]].map(([x,z])=>({x:stance.x+side.x*(x*scale/2+Math.sign(x)*margin)+forward.x*(z*scale/2+Math.sign(z)*margin),z:stance.z+side.z*(x*scale/2+Math.sign(x)*margin)+forward.z*(z*scale/2+Math.sign(z)*margin)}));
 const segment=a.species==='alpaca'||a.species==='penguin'?hunyuanDryFootSegment:clearPlayerSegment;return corners.every((corner,i)=>segment(s,stance,corner)&&segment(s,corner,corners[(i+1)%4]));
}
function reachableDrinkStance(a:MinimalAnimal,contact:WaterContact,stance:Point,scale:number,inspection?:AnimalResourceContext|null,overrideProfile?:NonNullable<ReturnType<typeof animalMotionProfile>>):boolean{
 const profile=overrideProfile??animalMotionProfile(a.species,inspection);if(!profile)return false;const fixed=a.species==='alpaca'?(contact.source==='bowl'&&profile.bowlStanding?alpacaBowlPlacement(profile,scale):contact.source==='pond'&&profile.pondStanding?alpacaPondPlacement(profile,scale):undefined):undefined;if(fixed!==undefined){const reach=distance(stance,contact.waterPoint)*2;return !!fixed&&reach>=fixed.minimum-1e-8&&reach<=fixed.maximum+1e-8;}const adjustment=distance(stance,contact.waterPoint)*2/scale-profile.muzzleReach,forward=contact.source==='bowl'?profile.reachAdjustment.forward:profile.reachAdjustment.pondForward??profile.reachAdjustment.forward;
 return adjustment>=-profile.reachAdjustment.back-1e-8&&adjustment<=forward+1e-8;
}
/** Current support is also invalidated by a newly placed nest or terrain edit. */
function currentDrinkAnchorSafe(s:MinimalState,a:MinimalAnimal,now:number,inspection?:AnimalResourceContext|null):boolean{
 const anchor=a.drinkAnchor;if(!anchor)return true;
 const contact=baseDrinkSpot(s,{position:anchor.site},anchor.waterSite,a.species,anchor.stance,animalScale(a,now),inspection),navigation=animalNavigation(s),scale=animalScale(a,now);
 return !!contact&&clearPlayerSegment(navigation,anchor.site,anchor.stance)&&reachableDrinkStance(a,contact,anchor.stance,scale,inspection)&&dryAnimalFeet(navigation,a,anchor.stance,contact.waterPoint,scale,false,false,inspection);
}
/** Rechecked at arrival. Reserve up to 20% extra growth for a six-second planted drink. */
function safeDrinkAnchor(s:MinimalState,a:MinimalAnimal,anchor:DrinkAnchor,now:number,inspection?:AnimalResourceContext|null):boolean{
 const contact=baseDrinkSpot(s,{position:anchor.site},anchor.waterSite,a.species,anchor.stance,animalScale(a,now),inspection);if(!contact||!clearPlayerSegment(s,anchor.site,anchor.stance))return false;
 const scale=animalScale(a,now),grown=animalScale(a,now+(a.growth?7200:6000));
 return [scale,grown].every(size=>reachableDrinkStance(a,contact,anchor.stance,size,inspection))&&dryAnimalFeet(s,a,anchor.stance,contact.waterPoint,scale,true,false,inspection)&&dryAnimalFeet(s,a,anchor.stance,contact.waterPoint,grown,false,false,inspection);
}
/** Final routing is still a continuous dry segment of the existing grid route. */
function beginDrinkApproach(s:MinimalState,a:MinimalAnimal,site:Point,now:number,inspection?:AnimalResourceContext|null,requestedWaterSite?:Point):boolean{
 const contact=baseDrinkSpot(s,{position:site},requestedWaterSite??(a.drinkAnchor&&same(a.drinkAnchor.site,site)?a.drinkAnchor.waterSite:undefined),a.species,undefined,animalScale(a,now),inspection),navigation=animalNavigation(s);if(!contact)return false;
 const profile=animalMotionProfile(a.species,inspection);if(!profile)return false;const scale=animalScale(a,now),grown=animalScale(a,now+(a.growth?7200:6000)),muzzle=profile.muzzleReach,forward=contact.source==='bowl'?profile.reachAdjustment.forward:profile.reachAdjustment.pondForward??profile.reachAdjustment.forward;
 const fixed=a.species==='alpaca'?(contact.source==='bowl'&&profile.bowlStanding?{now:alpacaBowlPlacement(profile,scale),grown:alpacaBowlPlacement(profile,grown)}:contact.source==='pond'&&profile.pondStanding?{now:alpacaPondPlacement(profile,scale),grown:alpacaPondPlacement(profile,grown)}:null):null;if(fixed&&(!fixed.now||!fixed.grown))return false;
 const minimum=fixed?Math.max(fixed.now!.minimum,fixed.grown!.minimum):(muzzle-profile.reachAdjustment.back)*grown,maximum=fixed?Math.min(fixed.now!.maximum,fixed.grown!.maximum):(muzzle+forward)*scale;
 if(minimum>maximum)return false;
 const desired=Math.max(minimum,Math.min(maximum,fixed?fixed.now!.reach:muzzle*scale)),edge=contact.source==='pond'?Math.max(profile.walkContactFeet.front*scale,profile.feet.front*grown)+distance(site,contact.waterPoint)*2-1+.0101:desired,radii=[desired,edge,...Array.from({length:15},(_,i)=>minimum+(maximum-minimum)*i/14)].filter(reach=>reach>=minimum-1e-8&&reach<=maximum+1e-8).sort((x,y)=>Math.abs(x-desired)-Math.abs(y-desired));
 const angle=Math.atan2(contact.standingPoint.z-contact.waterPoint.z,contact.standingPoint.x-contact.waterPoint.x);
 for(const turn of a.species==='alpaca'&&contact.source==='bowl'?[0]:[0,Math.PI/2,-Math.PI/2,Math.PI])for(const reach of radii){
  const stance={x:contact.waterPoint.x+Math.cos(angle+turn)*reach/2,z:contact.waterPoint.z+Math.sin(angle+turn)*reach/2},anchor={site:{...site},stance,waterSite:{...contact.waterSite}};
  if(!safeDrinkAnchor(navigation,a,anchor,now,inspection))continue;
  if(a.species==='alpaca'&&contact.source==='bowl'){const route=animalRoute(navigation,a,stance,now,inspection);if(!route)continue;if(!route.length)route.push({...stance});a.drinkAnchor=anchor;a.target={...site};a.path=route;a.targetActivity='drink';a.activity='walk';return true;}
  const route=animalRoute(navigation,a,site,now,inspection);if(!route)continue;
  // Tight baby shore stances cannot safely turn a diagonal walk over the water.
  // Keep their dry center waypoint unless already aligned with enough walking
  // distance to settle yaw. Large roomy stances can take the direct shortcut.
  const incoming=Math.atan2(stance.x-a.position.x,stance.z-a.position.z),facing=Math.atan2(contact.waterPoint.x-stance.x,contact.waterPoint.z-stance.z),headingChange=Math.abs(Math.atan2(Math.sin(incoming-facing),Math.cos(incoming-facing)));
  const continuing=!!a.drinkAnchor&&a.path?.length===1,liningUp=!!a.drinkAnchor&&!!a.path&&a.path.length>1,aligned=headingChange<.02&&(continuing||distance(a.position,stance)*2>=animalWorldSpeed(a,now,0,inspection)*.5);
  if(clearPlayerSegment(navigation,a.position,stance)&&(a.species!=='alpaca'||animalBowlPathSafe(a,[stance],now,inspection))&&(!liningUp&&aligned||dryAnimalFeet(navigation,a,stance,contact.waterPoint,scale,true,true,inspection)))route.splice(0,route.length,stance);
  else {if(!dryAnimalFeet(navigation,a,site,contact.waterPoint,scale,true,false,inspection))continue;route.push(stance);}
  if(!animalBowlPathSafe(a,route,now,inspection))continue;
  a.drinkAnchor=anchor;a.target={...site};a.path=route;a.targetActivity='drink';a.activity='walk';return true;
 }
 return false;
}
function drinkDestinations(s:MinimalState):Tile[]{return s.tiles.filter(t=>walkable(s,t)&&!!getDrinkSpot(s,{position:t}));}
function selectedDrinkChoices(s:MinimalState,a:MinimalAnimal,now:number,inspection?:AnimalResourceContext|null){const result:{site:Tile;waterSite:Point}[]=[];for(const site of s.tiles){if(!walkable(s,site)||!destinationFree(s,site,a.id))continue;for(const waterSite of [site,...neighbors(site)]){const contact=baseDrinkSpot(s,{position:site},waterSite,a.species,undefined,animalScale(a,now),inspection);if(contact)result.push({site,waterSite:{...contact.waterSite}});}}return result;}
/** Creative obstacles use actual body envelopes; alpaca also retains its bowl envelope.
 * Without creative obstacles, other species retain the original grid planner. */
export function animalRoute(s:MinimalState,a:MinimalAnimal,to:Point,now:number,inspection?:AnimalResourceContext|null):Point[]|null{
 if(!s.staticObstacles?.length&&a.species!=='alpaca')return continuousRoute(s,a.position,to);
 const obstacles=s,radius=animalInteractionRadius(a,now,inspection)/2;if(!staticObstacleSegmentClear(obstacles,to,to,radius))return null;s=staticObstacleEscape(s,a.position,radius);
 const profile=animalMotionProfile(a.species,inspection);if(!profile)return null;
 const scale=animalScale(a,now+7200),clear=(from:Point,end:Point)=>clearPlayerSegment(s,from,end)&&staticObstacleSegmentSafe(obstacles,from,end,radius)&&(a.species!=='alpaca'||alpacaBowlSegmentSafe(profile,scale,from,end));
 if(!clear(a.position,a.position)||!clear(to,to))return null;
 if(clear(a.position,to))return distance(a.position,to)<1e-8?[]:[{...to}];
 const candidates=s.tiles.filter(t=>walkable(s,t)&&staticObstacleSegmentClear(obstacles,t,t,radius)&&clear(t,t)),queue:Point[]=[],prior=new Map<string,Point|null>();
 for(const t of candidates.sort((u,v)=>distance(a.position,u)-distance(a.position,v))){if(clear(a.position,t)){const p={x:t.x,z:t.z};queue.push(p);prior.set(key(p),null);}}
 for(let i=0;i<queue.length;i++){const p=queue[i];if(clear(p,to)){const result:Point[]=[p];let before=prior.get(key(p));while(before){result.unshift(before);before=prior.get(key(before));}if(distance(result.at(-1)!,to)>1e-8)result.push({...to});return result;}
  for(const next of neighbors(p))if(!prior.has(key(next))&&walkable(s,next)&&clear(p,next)){prior.set(key(next),p);queue.push(next);}
 }
 return null;
}
function animalBowlPathSafe(a:MinimalAnimal,path:Point[],now:number,inspection?:AnimalResourceContext|null):boolean{
 if(a.species!=='alpaca')return true;const profile=animalMotionProfile('alpaca',inspection);return !!profile&&path.every((to,i)=>alpacaBowlSegmentSafe(profile,animalScale(a,now+7200),i?path[i-1]:a.position,to));
}
function naturalActivity(terrain:Terrain):'drink'|'rest'|'graze'{return terrain==='creek'?'drink':terrain==='meadow'?'graze':'rest';}
function startWolf(s:MinimalState,now:number){s.wolfEvent={startedAt:now,endsAt:now+MINIMAL_RULES.wolfMs,helped:false};s.notice='两只小狼在边缘探头，伙伴会照看大家。';}
export function advanceMinimalState(input:MinimalState,now:number,lockedAnimalIds:readonly string[]=[],waitingAnimalId?:string,inspection?:AnimalResourceContext|null):MinimalState{
 if(inspection!=null)assertAnimalResourceContext(inspection);
 const s=copy(input);
 // Persist a monotone age floor, including the last known age of pre-growth saves.
 // A backwards device clock must not make an animal smaller or take adulthood away.
 const growthNow=Number.isFinite(now)?Math.max(now,s.updatedAt):s.updatedAt;
 const bonusRate=farmSupply(input).growthBonusRate;
 const bonusFrom=input.terrainGrowthAt;
 if(bonusFrom!==undefined&&growthNow>bonusFrom){
  for(const a of s.animals){
   if(!a.growth||lockedAnimalIds.includes(a.id))continue;
   const prior=animalGrowthAgeMs(a,bonusFrom);
   const eligible=Math.max(0,Math.min(growthNow-Math.max(bonusFrom,a.bornAt),(ANIMAL_ADULT_MS-prior)/(1+bonusRate)));
   if(eligible>0&&bonusRate>0)a.growthBonusMs=Math.min(24_000,(a.growthBonusMs??0)+eligible*bonusRate);
  }
 }
 s.terrainGrowthAt=growthNow;
 for(const a of s.animals)a.growthAgeMs=animalGrowthAgeMs(a,growthNow);
 if(!Number.isFinite(now)||now<s.updatedAt)return s;
 advanceEggIncubation(s,now);
 if(!isPlayerWalkRouteSafe(s,s.player,s.playerPath)){s.playerPath=[];s.playerSpeed=0;}
 const gap=now-s.updatedAt,dt=Math.min(2000,Math.max(0,gap))/1000;s.updatedAt=now;s.playerSpeed=advancePlayerMotion(s.player,s.playerPath,dt,s.playerSpeed??0).speed;
 for(let i=0;i<s.animals.length;i++){
  const a=s.animals[i];if(lockedAnimalIds.includes(a.id)||!isAnimalRuntimeActive(a,inspection))continue;const navigation=staticObstacleEscape(animalNavigation(s),a.position,animalInteractionRadius(a,now,inspection)/2);if(a.id===s.carriedAnimalId){a.position={...s.player};a.activity='carried';delete a.target;delete a.path;delete a.drinkAnchor;continue;}
  if(a.species==='alpaca'){const profile=animalMotionProfile('alpaca',inspection);if(!profile||!alpacaBowlSegmentSafe(profile,animalScale(a,now),a.position,a.position)){stopAnimal(a,now);s.notice='羊驼离高水碗太近，先抱到旁边的空地再活动';continue;}}
  // A preserved alpaca anchor is structural save data, not proof of contact with
  // this candidate. Revalidate before moving or settling an overdue action.
  if(!isLegacySpecies(a.species)&&a.drinkAnchor&&!safeDrinkAnchor(navigation,a,a.drinkAnchor,now,inspection)){stopAnimal(a,now);continue;}
  // A live explicit approach pauses only roaming. This id is never stored in the
  // farm, unlike escrow locks; earned activity rewards and growth still settle.
  if(a.id===waitingAnimalId&&(a.target||a.activity==='idle'||a.activity==='walk')){
   if(a.target||a.activity==='walk')stopAnimal(a,now);
   continue;
  }
  // Growth after a completed deadline must not retroactively cancel earned water.
  if(domainSelectedAnimal(a.species,inspection)&&a.drinkAnchor&&!currentDrinkAnchorSafe(s,a,now,inspection)){stopAnimal(a,now);continue;}
  if((a.activity==='drink'||a.targetActivity==='drink')&&!getDrinkSpot(s,a,{inspection})||a.activity==='drink'&&(!isLegacySpecies(a.species)||now<a.activityUntil)&&!currentDrinkAnchorSafe(s,a,now,inspection)){stopAnimal(a,now);continue;}
  // Old v2 center-based drinks have never reached a physical contact point. Reapproach
  // without rewarding the stale timer; a new six-second action starts only on arrival.
  if(a.activity==='drink'&&!a.drinkAnchor){if(!beginDrinkApproach(s,a,point(a.target??a.position),now,inspection))stopAnimal(a,now);continue;}
  if(a.target){
   let route=a.path;
   if(!route||!animalBowlPathSafe(a,route,now,inspection)||!route.every((q,j)=>clearPlayerSegment(navigation,j?route![j-1]:a.position,q)&&staticObstacleSegmentSafe(s,j?route![j-1]:a.position,q,animalInteractionRadius(a,now,inspection)/2))){stopAnimal(a,now);continue;}
   if(a.targetActivity==='drink'&&(!a.drinkAnchor&&route.length<=1||!!a.drinkAnchor&&!safeDrinkAnchor(navigation,a,a.drinkAnchor,now,inspection))){if(!beginDrinkApproach(s,a,a.target,now,inspection)){stopAnimal(a,now);continue;}route=a.path!;}
   moveAlong(a.position,route,animalGridTravel(input.animals[i],now-dt*1000,now,inspection));
   if(!route.length){
    const activity=a.targetActivity??naturalActivity(tileAt(s,a.target)!.terrain);
    if(activity==='drink'&&(!a.drinkAnchor||!safeDrinkAnchor(navigation,a,a.drinkAnchor,now,inspection))){const site={...a.target};if(!beginDrinkApproach(s,a,site,now,inspection))stopAnimal(a,now);continue;}
    a.position={...(a.drinkAnchor?.stance??a.target)};delete a.target;delete a.path;a.activity=activity;delete a.targetActivity;a.activityUntil=now+6000;
   }else a.activity='walk';
  }else if(now>=a.activityUntil){
   if(a.activity==='drink'||a.activity==='rest'||a.activity==='graze'){a.energy=Math.min(100,a.energy+(a.activity==='drink'?22:a.activity==='rest'?15:10));a.activity='idle';delete a.drinkAnchor;a.activityUntil=now+5000+i*1300;}
   else {
    const wanted:Terrain=a.energy<65?'creek':(['meadow','hill','grove','creek'] as Terrain[])[(Math.floor(now/12000)+i)%4];
    if(wanted==='creek'&&(a.species==='penguin'||domainSelectedAnimal(a.species,inspection))){const choices=selectedDrinkChoices(navigation,a,now,inspection),start=choices.length?(Math.floor(now/10000)+i*7)%choices.length:0;let begun=false;for(let offset=0;offset<choices.length;offset++){const choice=choices[(start+offset)%choices.length];if(beginDrinkApproach(s,a,choice.site,now,inspection,choice.waterSite)){a.energy=Math.max(25,a.energy-3);begun=true;break;}}if(!begun){stopAnimal(a,now);s.notice='这只小伙伴暂时够不到安全水源，试试浅溪或更宽的岸边；它会先休息。';}continue;}
    const available=(wanted==='creek'?drinkDestinations(navigation):s.tiles.filter(t=>walkable(navigation,t)&&t.terrain===wanted)).filter(t=>destinationFree(s,t,a.id)&&(a.species==='alpaca'&&wanted==='creek'?beginDrinkApproach(navigation,copy(a),t,now,inspection):animalRoute(navigation,a,t,now,inspection)!==null)),fallback=tileAt(s,wanted==='creek'&&a.species!=='alpaca'?WATER_BOWL:REST_MAT),options=available.length?available:fallback&&destinationFree(s,fallback,a.id)?[fallback]:[],pick=options[(Math.floor(now/10000)+i*7)%options.length],activity=wanted==='creek'&&(a.species!=='alpaca'||available.length)?'drink':available.length?naturalActivity(pick.terrain):'rest';
    if(!pick){stopAnimal(a,now);continue;}
    if(a.species==='alpaca'&&activity==='drink'){if(!beginDrinkApproach(navigation,a,pick,now,inspection))stopAnimal(a,now);continue;}
    if(distance(a.position,pick)>.01){const route=animalRoute(navigation,a,pick,now,inspection);if(route){a.target={x:pick.x,z:pick.z};a.targetActivity=activity;a.path=route;a.activity='walk';delete a.drinkAnchor;a.energy=Math.max(25,a.energy-3);}else stopAnimal(a,now);}
    else if(activity==='drink'){if(!beginDrinkApproach(s,a,pick,now,inspection))stopAnimal(a,now);}
    else {a.activity=activity;delete a.drinkAnchor;a.activityUntil=now+6000;}
   }
  }
 }
 if(MINIMAL_DEFENSE_ENABLED){
 if(s.wolfEvent&&now>=s.wolfEvent.endsAt){s.wolfEvent=null;s.nextWolfAt=now+MINIMAL_RULES.wolfIntervalMs;s.notice='小狼跑远了，所有小动物都好好的。';}
 else if(!s.wolfEvent&&now>=s.nextWolfAt){if(gap<=5000&&s.animals.length>0&&s.welcomeClaimed)startWolf(s,now);else s.nextWolfAt=now+300_000;}
 }
 return s;
}
/** Static-layout edits stop stale routes at the current position; never relocate an actor. */
export function stopStaticObstacleRoutes(input:MinimalState):MinimalState{
 if(!input.staticObstacles?.length)return input;const s=copy(input);
 if(!isPlayerWalkRouteSafe(s,s.player,s.playerPath)){s.playerPath=[];s.playerSpeed=0;}
 for(const a of s.animals){if(a.path?.some((to,i)=>!staticObstacleSegmentSafe(s,i?a.path![i-1]:a.position,to)))stopAnimal(a,s.updatedAt);}
 return s;
}
export function minimalCommand(input:MinimalState,command:MinimalCommand,now:number,lockedAnimalIds:readonly string[]=[],waitingAnimalId?:string,inspection?:AnimalResourceContext|null):MinimalReply{
 if(inspection!=null)assertAnimalResourceContext(inspection);
 if(!Number.isFinite(now)||now<input.updatedAt)return {state:copy(input),accepted:false,message:'时间尚未同步，请稍后再试'};
 const s=advanceMinimalState(input,now,lockedAnimalIds,waitingAnimalId,inspection),reply=(accepted:boolean,message:string):MinimalReply=>{s.notice=message;return {state:s,accepted,message};};
 if(!MINIMAL_DEFENSE_ENABLED&&['guardian','wolf','help'].includes(command.type))return reply(false,MINIMAL_DEFENSE_PAUSED_MESSAGE);
 if(command.type==='welcome'){if(s.welcomeClaimed)return reply(false,'开园金币已经领过啦');s.welcomeClaimed=true;s.coins+=MINIMAL_RULES.welcomeCoins;return reply(true,'收到 120 金币！去小店买第一颗惊喜蛋吧');}
 if(command.type==='move'){const path=playerWalkRoute(s,s.player,command.to);if(!path)return reply(false,'这里暂时走不到');s.playerSpeed=retargetPlayerSpeed(s.player,s.playerPath,path,s.playerSpeed);s.playerPath=path;return reply(true,'走过去看看');}
 if(!s.welcomeClaimed)return reply(false,'先收下开园金币吧');
 if(command.type==='emergencyEgg'){if(!nearShop(s)||s.coins>=30||s.animals.length||s.eggs.length)return reply(false,'只有金币不足且没有动物或蛋时，店主才会送一颗起步蛋');const pool=eggOffer(s,'grassland',inspection).species,e=egg(s,now,'shop',pool[Math.floor(random(s,0)*pool.length)]);e.theme='grassland';s.eggs.push(e);return reply(true,'店主送你一颗起步蛋，重新开始吧');}
 if(command.type==='buyEgg'){
  const theme=command.theme===undefined?'grassland':command.theme;if(!isEggTheme(theme))return reply(false,'这种主题蛋暂未开放');
  const purchase=eggPurchaseAvailability(s,theme,inspection);if(!purchase.available)return reply(false,purchase.message);const {offer}=purchase;
  const species=offer.species[Math.floor(random(s,0)*offer.species.length)],e=egg(s,now,'shop',species);e.theme=theme;
  s.coins-=offer.price;s.eggs.push(e);return reply(true,'拿到一颗惊喜蛋！找块空地放下吧');
 }
 if(command.type==='placeEgg'){const e=s.eggs.find(e=>e.id===command.eggId&&e.location==='bag');if(!e)return reply(false,'这颗蛋已经放好，或不在背包里');if(!canPlaceEgg(s,command.at))return reply(false,'找一块没有动物和蛋的已开辟空地');if(distance(s.player,command.at)>1.6)return reply(false,'走近那块空地再放下蛋');e.location='ground';e.position={...command.at};e.placedAt=now;if(!e.incubation)e.incubation={requiredMs:s.placedEggCount===0?MINIMAL_RULES.firstHatchMs:MINIMAL_RULES.hatchMs,elapsedMs:0,checkedAt:now};else e.incubation.checkedAt=now;e.readyAt=now+e.incubation.requiredMs-e.incubation.elapsedMs;s.placedEggCount++;clearNewNestActions(s,now,inspection);return reply(true,eggHabitatMatches(s,e)?'蛋放好了，等它摇摇晃晃准备好':'这里不太适合我…换到对应生态才能继续孵化');}
 if(command.type==='collectEgg'){const e=s.eggs.find(e=>e.id===command.eggId&&e.location==='ground');if(!e?.position)return reply(false,'这颗蛋不在地上');if(distance(s.player,e.position)>1.6)return reply(false,'走近一点再收回蛋');retainEggProgress(e,now);e.location='bag';delete e.position;delete e.placedAt;delete e.readyAt;return reply(true,'蛋收回背包了，已孵化进度会保留');}
 if(command.type==='hatch'){
  const e=s.eggs.find(e=>e.id===command.eggId&&e.location==='ground');
  if(!e||!e.position||e.readyAt===undefined)return reply(false,'先把蛋放到地上');
  if(!isAnimalProviderReady(e.species,inspection))return reply(false,'伙伴资源暂不可用，请在设置中重试动物模型');
  if(!eggHabitatMatches(s,e))return reply(false,'这里不太适合我…换到对应生态才能继续孵化');
  if(!eggIncubationStatus(s,e).ready)return reply(false,'再等一小会，里面正在准备');
  if(distance(s.player,e.position)>1.6)return reply(false,'走近一点，看看谁要出来');
  const hatchSpace={...s,eggs:s.eggs.filter(x=>x!==e)},id=`animal-${s.sequence+1}`;
  const a:MinimalAnimal={id,rarity:rarityOf(e.rarity),name:SPECIES_LABELS[e.species],species:e.species,sex:e.sex,size:e.size,growth:e.growth??createAnimalGrowth(`${s.createdAt}:${e.id}:${e.boughtAt}`,e.size),growthAgeMs:0,position:{...e.position},activity:'idle',energy:85,bond:0,bornAt:now,activityUntil:now+8000};
  const landing=s.tiles.filter(t=>canPlaceEgg(hatchSpace,t)&&staticObstacleSegmentClear(hatchSpace,t,t,animalInteractionRadius(a,now,inspection)/2)&&(isLegacySpecies(a.species)||isSafeAnimalArrival(hatchSpace,a,now,t,{free:p=>canPlaceEgg(hatchSpace,p),ground:p=>walkable(hatchSpace,p)&&tileAt(hatchSpace,p)?.terrain!=='creek'},inspection))).sort((u,v)=>distance(u,e.position!)-distance(v,e.position!))[0];
  if(!landing)return reply(false,!isLegacySpecies(a.species)?'先给新伙伴腾出一块安全的空地吧':'先给新伙伴腾出一块空地吧');
  a.position={x:landing.x,z:landing.z};s.sequence++;s.animals.push(a);s.hatchedCount++;s.eggs=s.eggs.filter(x=>x!==e);s.lastHatch={animalId:id,at:now,position:{...e.position}};
  if(!s.collection.includes(a.species))s.collection.push(a.species);
  return reply(true,`孵出一只${SPECIES_LABELS[a.species]}幼崽，慢慢长大吧！`);
 }
 if(command.type==='suspendUnavailableCarry'){
  const a=s.animals.find(a=>a.id===s.carriedAnimalId);
  if(!a||isLegacySpecies(a.species)||isAnimalProviderReady(a.species,inspection)||lockedAnimalIds.includes(a.id))return reply(false,'仅资源不可用且未锁定的头顶伙伴可以暂停携带');
  stopAnimal(a,now);a.resourceSuspended=true;s.carriedAnimalId=null;
  return reply(true,'已暂停携带，伙伴和位置均保留；模型恢复后请在设置中安全放置');
 }
 if(command.type==='resumeSuspendedAnimal'){
  const a=s.animals.find(a=>a.id===command.animalId);
  if(!a||isLegacySpecies(a.species)||a.resourceSuspended!==true||!isAnimalProviderReady(a.species,inspection)||lockedAnimalIds.includes(a.id))return reply(false,'伙伴尚未具备恢复条件，请先重试动物模型');
  const withoutSelf={...s,animals:s.animals.filter(other=>other.id!==a.id)},p=resolveAnimalLanding(s,a,now,{free:p=>canPlaceEgg(withoutSelf,p),ground:p=>walkable(s,p)&&tileAt(s,p)?.terrain!=='creek'},command.at);
  if(!p)return reply(false,'这里没有安全的放置位置，请走到空一点的地方再恢复');
  a.position={...p};stopAnimal(a,now);delete a.resourceSuspended;
  return reply(true,'伙伴已在安全位置恢复，继续自在散步');
 }
 if(command.type==='pickup'){const a=s.animals.find(a=>a.id===command.animalId);if(!a)return reply(false,'这只小动物已经不在这里');if(!isAnimalRuntimeActive(a,inspection))return reply(false,'伙伴资源暂不可用或已暂停，请在设置中重试模型或恢复放置');if(s.carriedAnimalId)return reply(false,'先把头顶的小伙伴放下来');if(distance(s.player,a.position)>1.6)return reply(false,'走近一点才能举起来');stopAnimal(a,now);a.activity='carried';s.carriedAnimalId=a.id;a.position={...s.player};return reply(true,`把${a.name}举起来啦！可以带去小店，或找地方放下`);}
 if(command.type==='putdown'){const a=s.animals.find(a=>a.id===s.carriedAnimalId);if(!a)return reply(false,'现在没有举着小动物');if(!isAnimalRuntimeActive(a,inspection))return reply(false,'伙伴资源暂不可用或已暂停，请在设置中重试模型或恢复放置');const p=resolveAnimalLanding(s,a,now,{free:p=>canPlaceEgg(s,p),ground:p=>walkable(s,p)&&tileAt(s,p)?.terrain!=='creek'},command.at,inspection);if(!p)return reply(false,'旁边有点挤，走到空一点的地方再放下');a.position={...p};stopAnimal(a,now);s.carriedAnimalId=null;return reply(true,'小伙伴稳稳落地，继续自在散步');}
 if(command.type==='sellAnimal'){const a=s.animals.find(a=>a.id===s.carriedAnimalId);if(!a)return reply(false,'先把想出售的小动物举起来');if(!isAnimalCommerceReady(a,inspection))return reply(false,'伙伴资源暂不可用或已暂停，请在设置中重试模型或恢复放置');if(!nearShop(s))return reply(false,'举着它走到小店柜台前');const value=sellValue(a);s.animals=s.animals.filter(x=>x!==a);s.carriedAnimalId=null;s.coins+=value;return reply(true,`小店接走了${a.name}，收到 ${value} 金币`);}
 if(command.type==='breed'){const status=breedingPairStatus(s,command.animalIds,now,inspection);if(status.code!=='ready')return reply(false,status.message);if(!tryBreed(s,command.animalIds,now,inspection))return reply(false,'小伙伴的状态变了，请重新选一下。');return reply(true,s.notice);}
 if(command.type==='paintTerrain'){
  if(!isTerrainAppearance(command.appearance))return reply(false,'选择一种地表外观');const tile=validPoint(command.at)?tileAt(s,command.at):undefined,issue=terrainAppearanceIssue(tile);if(issue)return reply(false,issue);
  if(command.appearance==='natural')delete tile!.appearance;else tile!.appearance=command.appearance;return reply(true,`已换成${TERRAIN_APPEARANCE_LABELS[command.appearance]}外观 · 生态不变`);
 }
 if(command.type==='upgradeTerrain'){
  if(!s.hatchedCount)return reply(false,'先孵出第一位小伙伴，再培养土地');
  const t=validPoint(command.at)?tileAt(s,command.at):undefined;
  if(!t?.owned||isShopTile(t))return reply(false,'只能培养小店以外的已开辟土地');
  if(t.terrain==='desert'||t.terrain==='glacier')return reply(false,'此地形不提供额外照料容量，无需付费养护');
  if(![2,3].includes(command.toLevel)||command.toLevel!==tileLevel(t)+1)return reply(false,tileLevel(t)===3?'已经培养到珍景啦':'这次培养已经完成或等级不匹配');
  const cost=terrainUpgradeCost(t)!;
  if(s.coins<cost)return reply(false,`培养需要 ${cost} 金币`);
  t.level=command.toLevel;s.coins-=cost;return reply(true,`土地更丰茂了，自动照料能力提升`);
 }
 if(command.type==='expand'){if(!s.hatchedCount)return reply(false,'先孵出第一位小伙伴，再慢慢扩大小家');const t=validPoint(command.at)?tileAt(s,command.at):undefined;if(!t||t.owned)return reply(false,'选一块还没开辟的土地');if(!neighbors(t).some(p=>walkable(s,p)))return reply(false,'先从相邻的可行走土地开辟，不能隔着池塘扩张');if(s.coins<40)return reply(false,'开辟需要 40 金币');if(t.terrain==='pond'){const preview={...s,tiles:s.tiles.map(p=>same(p,t)?{...p,owned:true}:p)};if(!connectedLand(preview)||!pondsHaveShore(preview))return reply(false,'先把已开辟的陆地连起来，再开放池塘');}t.owned=true;grantNaturalBiome(s.exploredBiomes,t);s.coins-=40;s.expansions++;return reply(true,'新地方亮起来了');}
 if(command.type==='convert'){if(!s.hatchedCount)return reply(false,'先孵出第一位小伙伴，再换风景');const t=validPoint(command.at)?tileAt(s,command.at):undefined;if(!t?.owned||isShopTile(t)||!terrains.includes(command.terrain))return reply(false,'只能改造小店以外的已开辟土地');const expansionIssue=conversionExpansionIssue(s,command.terrain);if(expansionIssue)return reply(false,expansionIssue);if(t.terrain===command.terrain)return reply(false,'这里已经是这种地形');if(s.coins<20)return reply(false,'改造需要 20 金币');const issue=explorationIssue(s.exploredBiomes,command.terrain)??terrainConversionIssue(s.tiles,t,command.terrain);if(issue)return reply(false,issue);if(command.terrain==='pond'){
 const occupied=[s.player,WATER_BOWL,REST_MAT,...s.animals.map(a=>a.position),...s.eggs.flatMap(e=>e.location==='ground'&&e.position?[e.position]:[])];
 if(occupied.some(p=>same(point(p),t)))return reply(false,'这里有人、动物、蛋或生活设施，先腾出空地再挖池塘');
 if(playerPondBoxIntersectsSegment(t,s.player,s.player))return reply(false,'这里离脚下太近，走远一点再挖池塘');
 const preview={...s,tiles:s.tiles.map(p=>same(p,t)?{...p,terrain:'pond' as const}:p)};
 // A giant's grounded hooves can occupy a neighboring tile even when its root does not.
 if(s.animals.some(a=>{if(!isAnimalRuntimeActive(a,inspection)||a.id===s.carriedAnimalId||a.activity!=='drink'||!a.drinkAnchor)return false;const contact=getDrinkSpot(s,a,{inspection});return !!contact&&!dryAnimalFeet(preview,a,a.position,contact.waterPoint,animalScale(a,now),false,false,inspection);}))return reply(false,'这里托着小动物的脚，等它走开再挖池塘');
 if(!connectedLand(preview)||!pondsHaveShore(preview))return reply(false,'池塘会切断陆地通路或缺少可达岸边，请先连通土地');
 }else if(t.terrain==='pond'&&!neighbors(t).some(p=>walkable(s,p)))return reply(false,'先连接岸边，再把池塘改成陆地');
 t.terrain=command.terrain;if(t.terrain==='pond'||t.terrain==='creek')delete t.appearance;s.playerPath=[];s.playerSpeed=0;for(const a of s.animals)if(a.path?.some(p=>!walkable(s,p))||(a.activity==='drink'||a.targetActivity==='drink')&&!getDrinkSpot(s,a,{inspection})||a.drinkAnchor&&isAnimalRuntimeActive(a,inspection)&&!currentDrinkAnchorSafe(s,a,now,inspection))stopAnimal(a,now);s.coins-=20;return reply(true,'换一种风景，等小动物发现');}
 if(command.type==='care'){const a=s.animals.find(a=>a.id===command.animalId);if(a&&!isAnimalRuntimeActive(a,inspection))return reply(false,'伙伴资源暂不可用，请在设置中重试动物模型');if(!a||a.id===s.carriedAnimalId||distance(s.player,a.position)>1.6)return reply(false,'先走到小伙伴身边');const gift=canClaimCompanionGift(s,a,now);a.energy=Math.min(100,a.energy+8);a.bond=Math.min(100,a.bond+1);stopAnimal(a,now);if(gift){s.coins+=COMPANION_GREETING_GIFT_COINS;s.lastCompanionGiftDay=dayKey(now);}return reply(true,gift?`${a.name}送来今天的第一份心意，+${COMPANION_GREETING_GIFT_COINS} 金币`:`${a.name}开心地回应了你`);}
 if(command.type==='guardian'){if(!['dog','cat','frog'].includes(command.guardian))return reply(false,'请选择一位守护伙伴');s.guardian=command.guardian;return reply(true,'伙伴换班啦');}
 if(command.type==='wolf'){if(s.wolfEvent)return reply(false,'伙伴正在处理这次小捣乱');startWolf(s,now);return reply(true,s.notice);}
 if(command.type==='help'){if(!s.wolfEvent)return reply(false,'现在很安全');s.wolfEvent.helped=true;s.wolfEvent.endsAt=Math.min(s.wolfEvent.endsAt,now+4000);return reply(true,'一起把小狼赶走啦');}
 return reply(false,'暂时不支持这个动作');
}
export type MinimalStorage=Pick<Storage,'getItem'|'setItem'>;
export function validateMinimalSave(value:unknown,inspection?:AnimalResourceContext|null):value is MinimalState{
 try{
  if(!value||typeof value!=='object')return false;const s=value as MinimalState;
  if(s.biomeLayoutVersion!==1||!Array.isArray(s.exploredBiomes)||!s.exploredBiomes.every(isEggTheme)||!s.exploredBiomes.includes('grassland')||new Set(s.exploredBiomes).size!==s.exploredBiomes.length)return false;
  if(s.biomeCompatibilityGrants!==undefined&&(!Array.isArray(s.biomeCompatibilityGrants)||s.biomeCompatibilityGrants.some(t=>!isEggTheme(t)||!s.exploredBiomes.includes(t))||new Set(s.biomeCompatibilityGrants).size!==s.biomeCompatibilityGrants.length))return false;
  if(s.biomeCompatibilityGrants?.length?s.biomeCompatibilityReason!=='legacy-no-reachable-natural-target':s.biomeCompatibilityReason!==undefined)return false;
  if(!Array.isArray(s.tiles)||s.tiles.some(t=>!t||!terrains.includes(t.naturalTerrain!)||terrainConversionIssue(s.tiles,t,t.terrain)!==null))return false;
  if(!validStaticObstacles(s.staticObstacles))return false;
  return validateFarmCore(withoutStaticObstacles(s),3,inspection);
 }catch{return false;}
}
export type LegacyMinimalState=Omit<MinimalState,'version'|'biomeLayoutVersion'|'exploredBiomes'|'biomeCompatibilityGrants'|'biomeCompatibilityReason'>&{version:2};
export function validateLegacyMinimalSave(value:unknown):value is LegacyMinimalState{
 try{if(!value||typeof value!=='object')return false;const s=value as LegacyMinimalState;
  if('staticObstacles' in s||'exploredBiomes' in s||'biomeLayoutVersion' in s||!Array.isArray(s.tiles)||s.tiles.some(t=>!['meadow','creek','pond','hill','grove'].includes(t.terrain)||t.naturalTerrain!==undefined)||!Array.isArray(s.eggs)||s.eggs.some(e=>e.theme!==undefined))return false;
  return validateFarmCore(value,2);
 }catch{return false;}
}
function validateFarmCore(value:unknown,version:2|3,inspection?:AnimalResourceContext|null):boolean{
 if(!value||typeof value!=='object')return false;const s=value as MinimalState,finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v),coordinate=(p:Point)=>!!p&&finite(p.x)&&finite(p.z)&&p.x>=-3&&p.x<=6&&p.z>=-3&&p.z<=6,integer=(p:Point)=>coordinate(p)&&validPoint(p);
 if(s.version!==version||![s.coins,s.updatedAt,s.createdAt,s.nextWolfAt,s.sequence,s.expansions,s.placedEggCount,s.hatchedCount].every(finite)||s.coins<0||s.sequence<0||s.expansions<0||s.placedEggCount<0||s.hatchedCount<0||typeof s.welcomeClaimed!=='boolean'||typeof s.notice!=='string')return false;
 if(!Array.isArray(s.tiles)||s.tiles.length!==100||!s.tiles.every(t=>integer(t)&&validTileAppearance(t)&&(version===3||t.appearance===undefined)&&terrains.includes(t.terrain)&&typeof t.owned==='boolean'&&(t.level===undefined||[1,2,3].includes(t.level)))||new Set(s.tiles.map(key)).size!==100||!SHOP_TILES.every(t=>tileAt(s,t)?.owned))return false;
 if(!pondsHaveShore(s)||s.tiles.some(t=>t.owned&&t.terrain==='pond')&&!connectedLand(s)||[...SHOP_TILES,WATER_BOWL,REST_MAT].some(p=>tileAt(s,p)?.terrain==='pond'))return false;
 const onOwned=(p:Point)=>freePoint(p)&&walkable(s,p),path=(v:unknown,a:MinimalAnimal)=>Array.isArray(v)&&v.every((p,i)=>onOwned(p)&&(integer(p)||i===v.length-1&&a.targetActivity==='drink'&&!!a.drinkAnchor&&same(p,a.drinkAnchor.stance))),validDay=(v:unknown)=>v===null||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
 if(s.lastCompanionGiftDay!==undefined&&!validCalendarDay(s.lastCompanionGiftDay))return false;
 if(s.terrainGrowthAt!==undefined&&(!finite(s.terrainGrowthAt)||s.terrainGrowthAt<s.createdAt||s.terrainGrowthAt>s.updatedAt))return false;
 if(Array.isArray(s.animals)&&s.animals.some(a=>a&&a.growthBonusMs!==undefined&&(!finite(a.growthBonusMs)||a.growthBonusMs<0||a.growthBonusMs>24_000)))return false;
 if(s.playerSpeed!==undefined&&(!finite(s.playerSpeed)||s.playerSpeed<0||s.playerSpeed>MAX_SAVED_PLAYER_SPEED))return false;
 if(!freePoint(s.player)||!walkable(s,s.player)||!Array.isArray(s.playerPath)||!s.playerPath.every(p=>freePoint(p)&&walkable(s,p))||!Array.isArray(s.animals)||!Array.isArray(s.eggs)||s.animals.length+s.eggs.length>16||new Set(s.animals.map(a=>a?.id)).size!==s.animals.length)return false;
 if(!s.animals.every(a=>a&&(a.creative===undefined||approvedCreativeAnimal(a))&&(a.rarity===undefined||isAnimalRarity(a.rarity))&&typeof a.id==='string'&&typeof a.name==='string'&&isSpecies(a.species)&&['male','female'].includes(a.sex)&&['normal','large','giant'].includes(a.size)&&(a.growth===undefined||validAnimalGrowth(a.growth))&&(a.growthAgeMs===undefined||finite(a.growthAgeMs)&&a.growthAgeMs>=0&&a.growthAgeMs<=(a.growth?ANIMAL_ADULT_MS:LEGACY_ADULT_MS))&&onOwned(a.position)&&[a.bornAt,a.energy,a.bond,a.activityUntil].every(finite)&&a.energy>=0&&a.energy<=100&&a.bond>=0&&a.bond<=100&&['idle','walk','drink','rest','graze','carried'].includes(a.activity)&&(!a.lastBreedAttemptDay||validDay(a.lastBreedAttemptDay))&&(!a.targetActivity||['drink','rest','graze'].includes(a.targetActivity))&&(!a.target||integer(a.target)&&onOwned(a.target)&&path(a.path,a))))return false;
 if(s.animals.some(a=>a.resourceSuspended!==undefined&&(a.resourceSuspended!==true||isLegacySpecies(a.species)||a.activity!=='idle'||a.target!==undefined||a.path!==undefined||a.targetActivity!==undefined||a.drinkAnchor!==undefined)))return false;
 if(s.animals.some(a=>a.path!==undefined&&!path(a.path,a)))return false;
 if(s.animals.some(a=>{
  const anchor=a.drinkAnchor;if(anchor===undefined)return false;
  if(!anchor||!integer(anchor.site)||!onOwned(anchor.site)||!onOwned(anchor.stance)||anchor.waterSite!==undefined&&!integer(anchor.waterSite)||distance(anchor.site,anchor.stance)>1.5)return true;
  const contact=a.species==='penguin'||a.species==='alpaca'?authoredDrinkSpot(s,{position:anchor.site},anchor.waterSite,a.species,anchor.stance):baseDrinkSpot(s,{position:anchor.site},anchor.waterSite,a.species,anchor.stance,animalScale(a,s.updatedAt),inspection),navigation=animalNavigation(s),scale=animalScale(a,s.updatedAt);
  if(!contact||!clearPlayerSegment(navigation,anchor.site,anchor.stance)||isLegacySpecies(a.species)&&(!dryAnimalFeet(navigation,a,anchor.stance,contact.waterPoint,scale,false,false,inspection)||!reachableDrinkStance(a,contact,anchor.stance,scale,inspection))){const selected=(a.species==='cow'||a.species==='bunny')&&domainSelectedAnimal(a.species,inspection),legacy=selected?authoredDrinkSpot(s,{position:anchor.site},anchor.waterSite,a.species,anchor.stance):null,old=a.species==='cow'||a.species==='bunny'?ANIMAL_MOTION_PROFILES[a.species]:undefined;if(!legacy||!old||!clearPlayerSegment(navigation,anchor.site,anchor.stance)||!dryAnimalFeet(navigation,a,anchor.stance,legacy.waterPoint,scale,false,false,undefined,old)||!reachableDrinkStance(a,legacy,anchor.stance,scale,undefined,old))return true;}
  return !(a.activity==='drink'&&!a.target&&same(a.position,anchor.stance)||a.activity==='walk'&&a.targetActivity==='drink'&&!!a.target&&same(a.target,anchor.site)&&!!a.path?.length&&same(a.path[a.path.length-1],anchor.stance));
 }))return false;
 if(!s.eggs.every(e=>e&&(e.rarity===undefined||isAnimalRarity(e.rarity))&&(e.incubation===undefined||validEggIncubation(e.incubation,s.updatedAt))&&(e.theme===undefined||isEggTheme(e.theme))&&typeof e.id==='string'&&['shop','bred'].includes(e.source)&&isSpecies(e.species)&&['male','female'].includes(e.sex)&&['normal','large','giant'].includes(e.size)&&(e.growth===undefined||validAnimalGrowth(e.growth))&&finite(e.boughtAt)&&(e.location==='bag'||e.location==='ground'&&!!e.position&&integer(e.position)&&onOwned(e.position)&&finite(e.placedAt)&&finite(e.readyAt)&&e.readyAt>=e.placedAt)&&(!e.parents||e.parents.length===2&&e.parents.every(v=>typeof v==='string')))||new Set(s.eggs.map(e=>e.id)).size!==s.eggs.length)return false;
 if(s.animals.some(a=>a.path?.some((p,i)=>!clearPlayerSegment(s,i?a.path![i-1]:a.position,p))))return false;
 const navigation=playerNavigation(s,s.player);if(!s.playerPath.every((p,i)=>clearPlayerSegment(navigation,i?s.playerPath[i-1]:s.player,p)))return false;
 if(s.carriedAnimalId!==null&&!s.animals.some(a=>a.id===s.carriedAnimalId&&a.activity==='carried'))return false;
 if(s.animals.some(a=>a.activity==='carried'&&a.id!==s.carriedAnimalId)||!validDay(s.breedingDay))return false;
 if(s.lastHatch!==null&&(!s.lastHatch||typeof s.lastHatch.animalId!=='string'||!finite(s.lastHatch.at)||!integer(s.lastHatch.position)))return false;
 if(s.lastBreeding!==null&&(!s.lastBreeding||!Array.isArray(s.lastBreeding.animalIds)||s.lastBreeding.animalIds.length!==2||!s.lastBreeding.animalIds.every(v=>typeof v==='string')||!finite(s.lastBreeding.at)||typeof s.lastBreeding.success!=='boolean'))return false;
 return Array.isArray(s.gifts)&&s.gifts.length===0&&Array.isArray(s.collection)&&s.collection.every(isSpecies)&&['dog','cat','frog'].includes(s.guardian)&&(s.wolfEvent===null||!!s.wolfEvent&&finite(s.wolfEvent.startedAt)&&finite(s.wolfEvent.endsAt)&&typeof s.wolfEvent.helped==='boolean');
}
/** Read-only compatibility helper; interactive clients use openFarmSession for conflict/recovery state. */
export function loadMinimalState(storage:MinimalStorage,now:number):MinimalState{try{const raw=storage.getItem(MINIMAL_STORAGE_KEY)??storage.getItem(LEGACY_MINIMAL_STORAGE_KEY);if(raw!==null){const decoded=decodeFarmSave(raw);if(decoded.kind==='current'||decoded.kind==='migrated')return advanceMinimalState(decoded.state,now);}}catch{/* Storage may be unavailable. */}return createMinimalState(now);}
export function saveMinimalState(storage:MinimalStorage,state:MinimalState):boolean{try{const old=storage.getItem(MINIMAL_STORAGE_KEY);if(old&&!validateMinimalSave(JSON.parse(old)))return false;if(!validateMinimalSave(state))return false;storage.setItem(MINIMAL_STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export const TERRAIN_LABELS:Record<Terrain,string>={meadow:'草地',creek:'小溪',pond:'池塘',hill:'丘陵',grove:'林荫',desert:'沙漠',glacier:'冰川'};
export const TERRAIN_EFFECTS:Record<Terrain,string>={meadow:'啃啃青草，恢复活力',creek:'浅水可走，沿岸喝水',pond:'深水不可走，动物在岸边喝水',hill:'爬上缓坡，晒太阳休息',grove:'在树荫下打盹，慢慢恢复',desert:'在沙地漫步，不额外提供照料容量',glacier:'在冰雪间漫步，不额外提供照料容量'};
export function canExpand(state:MinimalState,at:Point):boolean{const t=tileAt(state,at);return !!t&&!t.owned&&neighbors(t).some(p=>walkable(state,p))&&state.coins>=MINIMAL_RULES.expandCost;}
