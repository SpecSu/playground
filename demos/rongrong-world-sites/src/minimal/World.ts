import {MINIMAL_DEFENSE_ENABLED} from './defense-policy.ts';
import {lunarPlayerRoute,lunarPlayerRouteSafe} from './lunar-player-path.ts';
import {LUNAR_SHOWCASE_LAYOUT} from './lunar-showcase-layout.ts';
import {lunarGroundClear} from './lunar-showcase-ground.ts';
import {LunarShowcaseScene,type LunarActorSummary,type LunarActionReply} from './lunar-showcase-scene.ts';
import type {LunarShowcaseAssetLibrary} from './lunar-showcase-assets.ts';
import type {LunarShowcaseId,LunarShowcaseRecord} from './lunar-showcase-contract.ts';
import {staticObstacleEscape,staticObstacleSegmentSafe} from './creative-obstacles.ts';
import {prepareActiveMainAnimalModel} from './farm-model-recovery.ts';
import {SampleScenery} from './sample-scenery.ts';
import type {VisitorLandmarkStatus} from './visitor-landmark-scene.ts';
import type {SampleFarm} from './sample-farms.ts';
import {createBankSolidContact} from './bank-solid-contact.ts';
import {getHunyuanMainResource,assertHunyuanMainInspectionContext,type AlpacaInspectionContext} from './alpaca-inspection.ts';
import {alpacaLiftSupportPoint} from './alpaca-transfer.ts';
import {alpacaProvider} from './alpaca-provider.ts';
import {penguinProvider} from './penguin-provider.ts';
import {HunyuanEnvironmentScene,type HunyuanEnvironmentPlacement} from './hunyuan-environment-scene.ts';
import {selectEnvironmentPlacements,environmentPlacementClear,type EnvironmentExclusions} from './hunyuan-environment-placement.ts';
import {createWeatherSurfaceSampler} from './weather-surface.ts';
import {eggHabitatHint} from './egg-habitat-hint.ts';
import {eggIncubationStatus} from './egg-incubation.ts';
import {TerrainReadiness,type TerrainRenderStatus} from './terrain-renderer-lifecycle.ts';
export type {TerrainRenderStatus} from './terrain-renderer-lifecycle.ts';
import {projectCreativeAnimals} from './creative-lifecycle.ts';
import {CreativeScene,type CreativeScenePose} from './creative-scene.ts';
import {CREATIVE_CATALOG,type CreativeAsset} from './creative-assets.ts';
import {deriveWeather,type WeatherOverride} from './weather.ts';
import {WeatherWorld} from './weather-world.ts';
import {FarmAvatarPose,farmLocomotion,refreshPose} from './avatar-pose.ts';
import {advancePlayerMotion,retargetPlayerSpeed,type PlayerMotionSnapshot} from './player-motion.ts';
import {animalGridTravel,animalWorldSpeed,ANIMAL_VISIBLE_CORRECTION} from './animal-motion.ts';
import {greetingPoseAt,GREETING_DURATION_MS,animalTransferPoint,animalTransferProgress,ANIMAL_TRANSFER_DURATION_MS,animalTransferUnderside} from './interaction-motion.ts';
import {AnimalPickSampler,isPickVisible,visiblePickMeshes,rankAnimalTouchCandidates,type PickSurfacePoint} from './animal-picking.ts';
import * as THREE from 'three';
import {SaleHandoff} from './sale-feedback.ts';
import {TerrainPreviewCache} from './terrain-preview-cache.ts';
import {createTerrainGround,terrainPreviewEnabled} from './terrain-ground.ts';
import {createWaterField,sampleWater,waterContactHeight,type WaterField} from './terrain-water.ts';
import {TerrainAccentCache} from './terrain-accent-cache.ts';
import {HATCH_DURATION_MS,hatchPoseAt} from './hatch-choreography.ts';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createTapGate,isUnpressedMouseMove} from './gesture.ts';
import {createClubAvatar,type ClubAvatar} from '../avatars/club-avatar-rig.ts';
import {FarmActionRig} from '../v5/farm-action-rig.ts';
import {feedingPoseAt,guardianPoseAt} from '../v5/action-sequence.ts';
import {canPlaceEgg,continuousRoute,playerWalkRoute,animalRoute,animalNavigation,clearPlayerSegment,isPlayerWalkRouteSafe,SHOP_APPROACH,WATER_BOWL,REST_MAT,animalScale,getDrinkSpot,isWalkableTile,tileAt,isShopTile,type MinimalState,type Point} from './model.ts';
import {createFarmAnimal,createFarmEgg} from './animal-art.ts';
import {isAnimalRuntimeActive,isLegacySpecies} from './species.ts';
import {OwnedEggModelPreloader} from './owned-egg-preload.ts';
import {worldPoint as toWorld,makeTerrainBase,terrainBaseStamp,terrainVisualStamp,terrainSurfaceHeight,makeShop,makeEssentials,makeBeyond,batchScenery,mesh,orb,block} from './scenery-art.ts';
export type WorldTarget={kind:'landmark';id:'golden-pyramid'}|{kind:'showcase';id:LunarShowcaseId}|{kind:'creative';id:string}|{kind:'tile';x:number;z:number;worldPoint?:Point}|{kind:'animal';id:string}|{kind:'egg';id:string}|{kind:'shop'};
export type MinimalWorldHandlers={now?:()=>number;select:(target:WorldTarget)=>void;arrive:(point:Point,requestId?:number)=>void;interactionCancel?:()=>void;animalModelsChanged?:(status:{loading:number;failed:number})=>void;status?:(text:string)=>void;showcaseChanged?:()=>void;landmarkChanged?:(status:VisitorLandmarkStatus)=>void;terrainStatus?:(status:TerrainRenderStatus)=>void};
const toGrid=(p:THREE.Vector3):Point=>({x:p.x/2+1.5,z:p.z/2+1.5});
const smooth=(x:number)=>{const v=THREE.MathUtils.clamp(x,0,1);return v*v*(3-2*v);};
function disposeTree(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m instanceof THREE.MeshBasicMaterial||m instanceof THREE.MeshStandardMaterial)m.map?.dispose();m.dispose();}}});}
function wolf(){const root=new THREE.Group(),body=new THREE.Group();root.add(body);orb(body,'#879293',0,.44,0,.24,.26,.45);const head=new THREE.Group();head.position.set(0,.69,.36);body.add(head);orb(head,'#A8AFA8',0,0,0,.21,.22,.24);orb(head,'#D5D7C4',0,-.09,.2,.14,.11,.16);orb(head,'#3E4A4B',0,-.05,.34,.06,.045,.04);for(const side of [-1,1]){mesh(head,new THREE.ConeGeometry(.09,.22,3),'#6E8080',side*.13,.24,-.015);orb(head,'#E8BF70',side*.14,.045,.18,.027,.032,.026);}const legs=Array.from({length:4},(_,i)=>{const leg=new THREE.Group();body.add(leg);leg.position.set(i%2?.15:-.15,.33,i<2?-.28:.25);block(leg,'#6E8080',0,-.14,0,.09,.29,.1,.02);return leg;});const tail=mesh(body,new THREE.ConeGeometry(.11,.5,7),'#6E8080',0,.43,-.55);tail.rotation.x=-.9;return {root,head,legs,tail,distance:0};}
type AnimalTransfer={kind:'lift'|'lower';at:number;from:THREE.Vector3;fromRoot:THREE.Vector3;heading:number;clearance:number};
type AnimalVisual={art:ReturnType<typeof createFarmAnimal>;distance:number;speed:number;label:HTMLDivElement;hatchAt:number;hatchOrigin?:THREE.Vector3;standingPoint?:THREE.Vector3;transfer?:AnimalTransfer};
type EggVisual={art:ReturnType<typeof createFarmEgg>;label:HTMLDivElement};
type Burst={root:THREE.Group;at:number;kind:'hatch'|'coins'|'hearts';egg?:ReturnType<typeof createFarmEgg>};
type ActionKind='feed'|'pet'|'collect'|'help'|'hatch'|'hold'|'sell';
/** Real 3D toy-world renderer. Game rules remain in model.ts. Optional renderer injection is for geometry QA. */
export class MinimalWorld{
 private visitorScenery:SampleScenery|undefined;
 private interiorFollowAnchor:THREE.Vector3|undefined;
 private interiorReturn:{position:THREE.Vector3;quaternion:THREE.Quaternion;target:THREE.Vector3;zoom:number;enabled:boolean}|undefined;
 setVisitorInteriorOpen(open:boolean){
  if(this.disposed)return;if(open){if(this.interiorReturn)return;this.interiorReturn={position:this.camera.position.clone(),quaternion:this.camera.quaternion.clone(),target:this.controls.target.clone(),zoom:this.camera.zoom,enabled:this.controls.enabled};this.controls.enabled=false;const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;this.setPlayerMotionVisible(false);}else if(!this.interiorReturn)return;
  const snapshot=this.interiorReturn!;this.camera.position.copy(snapshot.position);this.camera.quaternion.copy(snapshot.quaternion);this.camera.zoom=snapshot.zoom;this.controls.target.copy(snapshot.target);this.camera.updateProjectionMatrix();if(!open){this.controls.enabled=snapshot.enabled;this.interiorFollowAnchor=snapshot.target.clone();this.interiorReturn=undefined;}
 }
 private showcaseOverview=false;private visitorOverviewBounds:{min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}}|undefined;private showcase:LunarShowcaseScene|undefined;private showcaseBaseObstacles:Point[]|undefined;
 setVisitorScenery(layout:SampleFarm|null){this.showcaseOverview=false;this.visitorOverviewBounds=undefined;this.camera.clearViewOffset();this.setLunarShowcase(null);this.visitorScenery?.dispose();this.visitorScenery=undefined;if(layout&&!this.disposed)this.visitorScenery=new SampleScenery(this.scene,layout,{landmark:{changed:status=>{if(!this.disposed)this.handlers.landmarkChanged?.(status);}}});}
 retryVisitorLandmark(){this.visitorScenery?.suppliedLandmark.retry();}
 visitorLandmarkBounds(){return this.visitorScenery?.landmarkBounds;}
 setLunarShowcase(library:LunarShowcaseAssetLibrary|null):boolean{
  this.showcase?.dispose();this.showcase=undefined;
  if(!library)return true;if(this.disposed||this.visitorScenery?.root.userData.theme!=='lunar'){library.dispose();return false;}
  this.showcase=new LunarShowcaseScene(this.scene,library,{player:()=>this.playerRoot.position.clone(),carrySupport:()=>this.carryPoint(),playerHeading:()=>this.playerRoot.rotation.y,groundHeight:p=>this.groundHeight(p),walkable:(p,radius)=>this.showcaseWalkable(p,radius),landing:(record,occupied)=>this.showcaseLanding(record,occupied),court:this.visitorScenery.court??undefined,changed:()=>{if(!this.disposed){this.handlers.showcaseChanged?.();}}});this.showcase.setPaused(!this.playerMotionVisible);return true;
 }
 showcaseSummary():readonly LunarActorSummary[]{return this.showcase?.snapshot()??[];}
 showcasePosition(id:LunarShowcaseId):Point|null{const p=this.showcase?.position(id);return p?toGrid(p):null;}
 showcaseAction(id:LunarShowcaseId,action:string):LunarActionReply{if(action==='pickup'&&this.state.carriedAnimalId)return {accepted:false,message:'先放下原来的伙伴'};const result=this.showcase?.action(id,action)??{accepted:false,message:'DIY伙伴尚未准备好'};if(result.accepted){if(action==='pickup'||action==='putdown')this.cancelWalk();}return result;}
 pauseShowcase(paused:boolean){this.showcase?.setPaused(paused||!this.playerMotionVisible);}
 retryShowcase(id:LunarShowcaseId){this.showcase?.retry(id);}
 private playerRoute(from:Point,to:Point){return this.showcase?lunarPlayerRoute(this.state,from,to,this.showcase.obstacleCircles()):playerWalkRoute(this.state,from,to);}
 private playerRouteSafe(from:Point,path:readonly Point[]){return this.showcase?lunarPlayerRouteSafe(this.state,from,path,this.showcase.obstacleCircles()):isPlayerWalkRouteSafe(this.state,from,path);}
 private showcaseWalkable(p:THREE.Vector3,radius:number){return lunarGroundClear(this.state,p,radius,this.showcaseBaseObstacles??[])&&Math.hypot(p.x-this.playerRoot.position.x,p.z-this.playerRoot.position.z)>=radius+.36&&(!this.path.length||lunarPlayerRouteSafe(this.state,toGrid(this.playerRoot.position),this.path.map(toGrid),[{x:p.x,z:p.z,radius}]))&&!this.state.animals.some(a=>a.id!==this.state.carriedAnimalId&&Math.hypot(p.x-toWorld(a.position).x,p.z-toWorld(a.position).z)<radius+animalScale(a,this.state.updatedAt));}
 private showcaseLanding(record:LunarShowcaseRecord,occupied:readonly {position:THREE.Vector3;radius:number}[]):THREE.Vector3|null{
  const player=this.playerRoot.position,radius=record.profile.bodyRadius;
  const candidates=this.state.tiles.filter(t=>t.owned&&t.terrain!=='pond'&&t.terrain!=='creek'&&!isShopTile(t)&&![WATER_BOWL,REST_MAT].some(p=>p.x===t.x&&p.z===t.z)&&isWalkableTile(this.state,t)).map(t=>toWorld(t)).sort((a,b)=>a.distanceTo(player)-b.distanceTo(player));
  for(const p of candidates){if(!lunarGroundClear(this.state,p,radius,this.showcaseBaseObstacles??[]))continue;const d=Math.hypot(p.x-player.x,p.z-player.z);if(d>3.2||d<radius+.36||occupied.some(a=>Math.hypot(p.x-a.position.x,p.z-a.position.z)<radius+a.radius+.06))continue;if(this.state.animals.some(a=>Math.hypot(p.x-toWorld(a.position).x,p.z-toWorld(a.position).z)<radius+1))continue;p.y=this.groundHeight(p);return p;}return null;
 }
 private alpacaInspection:AlpacaInspectionContext|undefined;
 private state:MinimalState;private host:HTMLElement;private handlers:MinimalWorldHandlers;private renderer:THREE.WebGLRenderer;
 private creativeAssets:readonly CreativeAsset[]=[];private creativeRoot=new THREE.Group();private creativeScene=new CreativeScene(this.creativeRoot,CREATIVE_CATALOG,{groundHeight:p=>this.groundHeight(new THREE.Vector3(p.x,0,p.z)),sizeForAsset:(asset,template)=>template.id==='wish-tree'?1.45:asset.kind==='custom-creature'?.85:.8});
 private terrainReadiness:TerrainReadiness;readonly ready:Promise<TerrainRenderStatus>;private fallbackReason:string|undefined;private drawing=false;private pendingTerrainUploadValidation=true;private contextLost=false;private shaderFailure:Error|undefined;private previousShaderError:THREE.WebGLRenderer['debug']['onShaderError']=null;private previousShaderChecks=true;
 private scene=new THREE.Scene();private camera=new THREE.OrthographicCamera(-5.2,5.2,7,-7,.1,100);
 private environmentScene=new HunyuanEnvironmentScene(this.scene);private environmentPlacements:HunyuanEnvironmentPlacement[]=[];private environmentStamp='';private environmentTilesStamp='';private nextEnvironmentSelect=0;
 private terrainPreview=terrainPreviewEnabled(window.location?.search??'');private terrainGround:ReturnType<typeof createTerrainGround>|undefined;private waterField:WaterField|undefined;private terrainPreviewCache:TerrainPreviewCache|undefined;
 private solidFootTriangleLiftWorld:ReturnType<typeof createBankSolidContact>|undefined;private terrain=new THREE.Group();private terrainAccents=new THREE.Group();private terrainAccentCache=new TerrainAccentCache(this.terrainAccents,this.terrainPreview);private accentStamp='';private pickLayer=new THREE.Group();private shop=new THREE.Group();private picks:THREE.Object3D[]=[];private tileStamp='';
 private animalLocks=new Set<string>();
 private animals=new Map<string,AnimalVisual>();private eggs=new Map<string,EggVisual>();private bursts:Burst[]=[];
 private saleEffects=new Set<SaleHandoff>();
 private eggModelPreloader=new OwnedEggModelPreloader();
 private player:ClubAvatar;private playerRig?:FarmActionRig;private playerPose?:FarmAvatarPose;private guardianPose?:FarmAvatarPose;
 private guardian:ClubAvatar|undefined;private guardianRig?:FarmActionRig;private guardianKind='';
 private playerRoot=new THREE.Group();private guardRoot=new THREE.Group();private wolves=MINIMAL_DEFENSE_ENABLED?[wolf(),wolf()]:[];
 private playerMotionVisible=true;private animalFrameTime:number|undefined;
 private playerSpeed=0;
 private path:THREE.Vector3[]=[];private destination:Point|null=null;private destinationRequestId:number|undefined;private travelled=0;private guardTravelled=0;
 private guardTarget=new THREE.Vector3();private guardNextAt=0;private guardPath:THREE.Vector3[]=[];private wolfStamp=0;private wolfFront:Point={x:1.5,z:0};
 private frame=0;private previous=0;private disposed=false;private resizeObserver:ResizeObserver;
 private raycaster=new THREE.Raycaster();private pointer=new THREE.Vector2();private pointerStart:{x:number;y:number}|null=null;private pointerMoved=false;
 private controls:OrbitControls;private tapGate=createTapGate();private activePointers=new Set<number>();
 private weather:WeatherWorld;private weatherPreferences:WeatherOverride={};
 private reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 private activeAction:{kind:ActionKind;at:number;duration:number;animalId?:string}|null=null;private selected:WorldTarget|null=null;
 private marker:THREE.Mesh;private route=new THREE.Group();private feedProp=new THREE.Group();private actionUntil=0;
 private placementMode=false;private placementOverlay=new THREE.Group();private placementCells=new Map<string,THREE.LineLoop>();private placementGhost:THREE.Mesh|null=null;private placementHover:Point|null=null;private invalidUntil=0;
 private inspectionPoint:Point|null=null;
 private terrainEditMode=false;private animalPicker=new AnimalPickSampler();private sightRay=new THREE.Raycaster();
 private animalAssetWarningShown=false;private animalModelRetry?:Promise<{ready:number;failed:number}>;private animalModelStatusStamp='';private seenHatch=0;private seenBreeding=0;private hatchFocus:{point:THREE.Vector3;at:number}|null=null;
 constructor(host:HTMLElement,state:MinimalState,handlers:MinimalWorldHandlers,rendererFactory?:()=>THREE.WebGLRenderer,alpacaInspection?:AlpacaInspectionContext){
  if(alpacaInspection!=null)assertHunyuanMainInspectionContext(alpacaInspection);this.alpacaInspection=alpacaInspection;
  this.host=host;this.state=state;if(this.terrainPreview)this.terrainPreviewCache=new TerrainPreviewCache(this.terrain);this.handlers=handlers;this.terrainReadiness=new TerrainReadiness(this.terrainPreview?'continuous':'legacy',handlers.terrainStatus);this.ready=this.terrainReadiness.ready;this.seenHatch=state.lastHatch?.at??0;this.seenBreeding=state.lastBreeding?.at??0;
  this.renderer=rendererFactory?rendererFactory():new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  if(this.renderer.debug){this.previousShaderError=this.renderer.debug.onShaderError;this.previousShaderChecks=this.renderer.debug.checkShaderErrors;this.renderer.debug.checkShaderErrors=true;this.renderer.debug.onShaderError=this.onTerrainShaderError;}
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1.08;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.domElement.setAttribute('aria-label','三维牧场，点击动物查看详情，点空地走动');this.renderer.domElement.tabIndex=0;this.renderer.domElement.style.touchAction='none';host.appendChild(this.renderer.domElement);
  const canvas=this.renderer.domElement;canvas.addEventListener('webglcontextlost',this.onTerrainContextReset);canvas.addEventListener('webglcontextrestored',this.onTerrainContextReset);canvas.addEventListener('pointermove',this.onHoverCapture,true);
  this.camera.zoom=1.6;this.camera.updateProjectionMatrix();this.camera.position.set(9,13.8,18);this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,.75,0);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.enablePan=false;this.controls.minZoom=.3;this.controls.maxZoom=8;this.controls.minPolarAngle=.25;this.controls.maxPolarAngle=1.28;this.controls.rotateSpeed=.65;this.controls.zoomSpeed=.8;this.controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};this.controls.update();this.controls.addEventListener('start',this.onOrbitStart);
  this.scene.background=new THREE.Color('#E3E5CE');this.scene.fog=new THREE.Fog('#E3E5CE',23,53);
  const hemisphere=new THREE.HemisphereLight('#FFF8E5','#92A079',1.7);this.scene.add(hemisphere);const key=new THREE.DirectionalLight('#FFF0D1',2.2);key.position.set(-8,15,8);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-13,right:13,top:13,bottom:-13});key.shadow.bias=-.00035;key.shadow.normalBias=.025;key.shadow.radius=4;this.scene.add(key);const fill=new THREE.DirectionalLight('#DEEADC',.75);fill.position.set(8,7,-4);this.scene.add(fill);this.weather=new WeatherWorld(this.scene,{hemisphere,key,fill,reducedMotion:this.reduced,shopPosition:{x:-2,y:2.2,z:-3}});
  this.scene.add(this.creativeRoot,batchScenery(makeBeyond()),this.terrain,this.terrainAccents,this.pickLayer,this.placementOverlay,this.route,this.playerRoot);this.shop=batchScenery(makeShop());this.scene.add(this.shop);
  this.marker=new THREE.Mesh(new THREE.RingGeometry(.29,.34,36),new THREE.MeshBasicMaterial({color:'#FFF7D8',side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));this.marker.rotation.x=-Math.PI/2;this.marker.visible=false;this.scene.add(this.marker);
  this.player=createClubAvatar('human-lx','minimal-player');this.playerRoot.add(this.player.root);this.player.root.scale.setScalar(.65);this.playerRoot.position.copy(toWorld(state.player));
  const copiedRouteSafe=isPlayerWalkRouteSafe(state,state.player,state.playerPath);
  this.path=copiedRouteSafe?state.playerPath.map(toWorld):[];this.playerSpeed=copiedRouteSafe?(state.playerSpeed??0):0;this.destination=this.path.length?{...state.playerPath[state.playerPath.length-1]}:null;
  void this.player.ready.then(()=>{if(this.disposed)return;this.player.update(0,'dance',true,0,farmLocomotion(this.playerRoot,0,0));this.playerRig=new FarmActionRig(this.player.root);this.playerRig.attach(this.feedProp);this.playerPose=new FarmAvatarPose(this.player.root);}).catch(()=>{if(!this.disposed)handlers.status?.('LX 模型暂未载入，刷新可重试');});
  if(MINIMAL_DEFENSE_ENABLED){this.scene.add(this.guardRoot);this.guardian=createClubAvatar('sword-shield-dog','minimal-dog');this.guardRoot.add(this.guardian.root);this.guardian.root.scale.setScalar(.64);this.guardRoot.position.copy(toWorld({x:3,z:1}));this.guardTarget.copy(this.guardRoot.position);this.guardianKind='dog';this.loadGuardian();}
  for(let i=0;i<4;i++){const leaf=mesh(this.feedProp,new THREE.ConeGeometry(.025,.19,4),'#8CAD55',(i-1.5)*.04,0,0);leaf.rotation.z=(i-1.5)*.16;}this.feedProp.visible=false;
  this.wolves.forEach(w=>{w.root.visible=false;this.scene.add(w.root);});
  canvas.addEventListener('pointerdown',this.onPointerDown);canvas.addEventListener('pointermove',this.onPointerMove);canvas.addEventListener('pointerup',this.onPointerUp);canvas.addEventListener('pointercancel',this.onPointerCancel);canvas.addEventListener('click',this.onClick);canvas.addEventListener('pointerleave',this.clearHover);window.addEventListener('blur',this.onWindowBlur);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);try{this.update(state);this.resize();this.renderTerrainFrame();if(this.terrainReadiness.status.phase==='error')throw new Error(this.terrainReadiness.status.error);this.frame=requestAnimationFrame(this.animate);}catch(error){this.terrainReadiness.fail(this.renderError(error));this.dispose();throw error;}
 }
 private now(){return this.handlers.now?.()??Date.now();}
 private loadGuardian(){const avatar=this.guardian;if(!avatar)return;void avatar.ready.then(()=>{if(this.disposed||avatar!==this.guardian)return;avatar.update(0,'dance',true,0);this.guardianRig=new FarmActionRig(avatar.root);this.guardianPose=new FarmAvatarPose(avatar.root);}).catch(()=>{if(!this.disposed&&avatar===this.guardian)this.handlers.status?.('守护者模型暂未载入，可刷新重试');});}
 private label(){const label=document.createElement('div');label.className='minimal-world-label';label.style.cssText='display:none;position:absolute;pointer-events:none;transform:translate(-50%,-100%);font-size:11px;font-weight:650;color:#5b6446;background:#fff9e8e6;padding:4px 9px;border:1px solid #fff8;border-radius:12px;white-space:nowrap;box-shadow:0 2px 7px #33492214;';this.host.appendChild(label);return label;}
 update(state:MinimalState){
  this.showcaseBaseObstacles=state.staticObstacles?.map(p=>({...p}));
  this.eggModelPreloader.update(state.eggs);
  const heldBefore=this.state.carriedAnimalId,resumed=new Set(state.animals.filter(a=>!isLegacySpecies(a.species)&&!a.resourceSuspended&&this.state.animals.some(before=>before.id===a.id&&before.resourceSuspended===true)).map(a=>a.id));
  if(heldBefore!==state.carriedAnimalId){
   if(heldBefore&&state.animals.some(a=>a.id===heldBefore&&!a.resourceSuspended))this.startTransfer(heldBefore,'lower');
   if(state.carriedAnimalId)this.startTransfer(state.carriedAnimalId,'lift');
  }
  this.state=state;const stamp=terrainBaseStamp(state.tiles);if(stamp!==this.tileStamp){this.tileStamp=stamp;this.buildTerrain();this.repairGuardianRoute();}
  const accentStamp=terrainVisualStamp(state.tiles);if(accentStamp!==this.accentStamp){this.accentStamp=accentStamp;this.buildTerrainAccents();}
  if(this.placementMode)this.refreshPlacement();
  if(MINIMAL_DEFENSE_ENABLED&&state.guardian!==this.guardianKind){this.guardian?.dispose();this.guardRoot.clear();this.guardianKind=state.guardian;this.guardianRig=undefined;this.guardianPose=undefined;this.guardian=createClubAvatar(state.guardian==='cat'?'miaocuijiao':state.guardian==='frog'?'milk-frog':'sword-shield-dog',`minimal-${state.guardian}`);this.guardRoot.add(this.guardian.root);this.guardian.root.scale.setScalar(.64);this.loadGuardian();}
  const ids=new Set(state.animals.filter(a=>!a.creative).map(a=>a.id));for(const[id,v]of this.animals)if(!ids.has(id)){this.scene.remove(v.art.root);v.art.dispose();v.label.remove();this.animals.delete(id);}
  for(const a of state.animals)if(!a.creative&&!this.animals.has(a.id)){const art=createFarmAnimal(a.species,a.sex,{skeletal:true,alpacaInspection:!isLegacySpecies(a.species)?this.alpacaInspection:undefined,onLoadStateChange:()=>this.reportAnimalModels(),onLoadError:species=>{if(!this.disposed&&!this.animalAssetWarningShown){this.animalAssetWarningShown=true;this.handlers.status?.(!isLegacySpecies(species)?'伙伴资源暂不可用，已保留动物和存档，可在设置中重试动物模型':'伙伴模型未加载完整，已保留基础外观，可在设置中重试动物模型');}}});art.root.position.copy(toWorld(a.position));art.root.scale.setScalar(animalScale(a,this.now()));art.root.userData.target={kind:'animal',id:a.id};this.scene.add(art.root);this.animals.set(a.id,{art,distance:0,speed:0,label:this.label(),hatchAt:0});}
  // Explicit domain resume has already validated this endpoint. A dormant actor
  // must not reappear at its old berth and visually walk through intervening water.
  for(const a of state.animals){const v=this.animals.get(a.id);if(!v)continue;if(a.resourceSuspended){v.art.root.visible=false;delete v.transfer;}if(resumed.has(a.id)){v.art.root.visible=false;v.art.root.position.copy(toWorld(a.position));v.art.root.position.y=this.groundHeight(v.art.root.position);v.speed=0;v.distance=0;v.hatchAt=0;delete v.standingPoint;delete v.hatchOrigin;delete v.transfer;if(this.activeAction?.animalId===a.id)this.activeAction=null;}}
  this.updateCreativeView();this.reportAnimalModels();if(!this.playerMotionVisible)this.rebaseHiddenAnimals();
  const groundEggs=state.eggs.filter(e=>e.location==='ground'&&e.position);const eggIds=new Set(groundEggs.map(e=>e.id));for(const[id,v]of this.eggs)if(!eggIds.has(id)){this.scene.remove(v.art.root);v.art.dispose();v.label.remove();this.eggs.delete(id);}
  for(const e of groundEggs)if(!this.eggs.has(e.id)){const art=createFarmEgg(e.source==='bred'?'#F2DBB6':'#FBEDD5');art.root.position.copy(toWorld(e.position!));art.root.userData.target={kind:'egg',id:e.id};this.scene.add(art.root);this.eggs.set(e.id,{art,label:this.label()});}
  if(state.lastHatch&&state.lastHatch.at!==this.seenHatch){this.seenHatch=state.lastHatch.at;if(this.now()-state.lastHatch.at<5000){const v=this.animals.get(state.lastHatch.animalId);if(v){v.hatchAt=performance.now();v.hatchOrigin=toWorld(state.lastHatch.position);v.hatchOrigin.y=this.groundHeight(v.hatchOrigin);v.art.root.position.copy(v.hatchOrigin);}this.spawnBurst('hatch',toWorld(state.lastHatch.position));this.hatchFocus={point:toWorld(state.lastHatch.position),at:performance.now()};}}
  const environmentTilesStamp=`${stamp}|${state.tiles.map(t=>t.naturalTerrain??t.terrain).join(',')}`;this.updateEnvironment(performance.now(),environmentTilesStamp!==this.environmentTilesStamp);this.environmentTilesStamp=environmentTilesStamp;
  if(state.lastBreeding&&state.lastBreeding.at!==this.seenBreeding){this.seenBreeding=state.lastBreeding.at;if(this.now()-state.lastBreeding.at<4000){const pair=state.lastBreeding.animalIds.map(id=>state.animals.find(a=>a.id===id)).filter(a=>!!a);if(pair.length)this.spawnBurst('hearts',toWorld(pair[0].position));}}
 }
 private updateEnvironment(now:number,force=false){
  if(this.disposed)return;
  const circles=[{x:this.playerRoot.position.x,z:this.playerRoot.position.z,radius:.5}],paths:THREE.Vector3[][]=[[this.playerRoot.position,...this.path]];
  if(MINIMAL_DEFENSE_ENABLED){circles.push({x:this.guardRoot.position.x,z:this.guardRoot.position.z,radius:.5});paths.push([this.guardRoot.position,...this.guardPath]);}
  for(const a of this.state.animals){const visual=this.animals.get(a.id),root=visual?.art.root??this.creativeScene.rootForAsset(a.id);if(!root)continue;const p=root.position;circles.push({x:p.x,z:p.z,radius:Math.max(.5,animalScale(a)*1.2)});paths.push([p,...(a.path??[]).map(toWorld)]);}
  for(const egg of this.state.eggs)if(egg.location==='ground'&&egg.position){const p=toWorld(egg.position);circles.push({x:p.x,z:p.z,radius:.35});}
  const exclusions:EnvironmentExclusions={circles,paths,observer:this.playerRoot.position};
  // Full selection is bounded to 4 Hz; approaching actors/routes remove existing
  // decoration before every rendered frame, without scanning all tiles.
  if(force||now>=this.nextEnvironmentSelect){this.environmentPlacements=selectEnvironmentPlacements(this.state.tiles,exclusions);this.nextEnvironmentSelect=now+250;}
  else this.environmentPlacements=this.environmentPlacements.filter(p=>environmentPlacementClear(p,exclusions));
  const stamp=JSON.stringify(this.environmentPlacements);if(stamp!==this.environmentStamp){this.environmentStamp=stamp;this.environmentScene.update(this.environmentPlacements);}
 }
 retryEnvironmentModels(){this.environmentScene.retry();}
 /** Display-only authority snapshot. Copy IDs; never erase canonical navigation.
  * Existing ahead-of-snapshot visuals still reconcile at their bounded speed. */
 setAnimalLocks(ids:readonly string[]){this.animalLocks=new Set(ids);}
 setCreativeAssets(assets:readonly CreativeAsset[]){this.creativeAssets=assets;this.updateCreativeView();}
 private updateCreativeView(dt=0){
  const poses=new Map<string,CreativeScenePose>(),now=Math.max(this.now(),this.state.updatedAt);
  for(const a of this.state.animals){
   if(!a.creative||!isAnimalRuntimeActive(a,this.alpacaInspection))continue;
   const carried=a.id===this.state.carriedAnimalId;if(carried)this.playerPose?.braceCarry();
   const root=this.creativeScene.rootForAsset(a.id),position=carried?this.carryPoint():root&&this.playerMotionVisible?root.position.clone():toWorld(a.position);
   let heading=carried?this.playerRoot.rotation.y:root?.rotation.y??0;
   if(!carried){
    // The canonical actor is the only simulation authority. Its GLB is a stable
    // per-frame projection, not a second actor snapped at every 250ms/GET update.
    const predicted={...a.position};let travel=this.animalLocks.has(a.id)?0:animalGridTravel(a,this.state.updatedAt,this.state.updatedAt+Math.min(500,Math.max(0,now-this.state.updatedAt)),this.alpacaInspection);
    for(const waypoint of a.path??[]){const dx=waypoint.x-predicted.x,dz=waypoint.z-predicted.z,d=Math.hypot(dx,dz);if(d<1e-8)continue;const step=Math.min(d,travel);predicted.x+=dx/d*step;predicted.z+=dz/d*step;travel-=step;if(travel<=0)break;}
    if(root&&dt>0&&this.playerMotionVisible){
     const from=toGrid(position),navigation=animalNavigation(this.state);
     const direct=clearPlayerSegment(navigation,from,predicted),route=this.state.staticObstacles?.length?animalRoute(navigation,{...a,position:from},predicted,now,this.alpacaInspection):direct?[predicted]:continuousRoute(navigation,from,{x:Math.round(predicted.x),z:Math.round(predicted.z)});
     if(route&&!direct&&!this.state.staticObstacles?.length)route.push(predicted);
     let remaining=animalWorldSpeed(a,now,Math.max(root.scale.x,animalScale(a,now)),this.alpacaInspection)*ANIMAL_VISIBLE_CORRECTION*Math.min(.1,dt),previous=from;
     for(const point of route??[]){
      if(!clearPlayerSegment(staticObstacleEscape(navigation,from),previous,point))break;
      const target=toWorld(point),dx=target.x-position.x,dz=target.z-position.z,d=Math.hypot(dx,dz),step=Math.min(d,remaining);
      if(d>1e-8&&step>0){position.x+=dx/d*step;position.z+=dz/d*step;const yaw=Math.atan2(dx,dz);heading+=Math.atan2(Math.sin(yaw-heading),Math.cos(yaw-heading))*(1-Math.exp(-dt*9));}
      remaining-=step;if(step<d||remaining<=0)break;previous=point;
     }
    }
    position.y=this.groundHeight(position);
   }
   poses.set(a.id,{animalId:a.id,position:{x:position.x,y:position.y,z:position.z},scale:Math.max(root?.scale.x??0,animalScale(a,now)),heading,carried});
  }
  this.creativeScene.update(projectCreativeAnimals(this.creativeAssets,this.state).map(asset=>{if(!asset.position)return asset;const position=toWorld(asset.position);return {...asset,position:{x:position.x,z:position.z}};}),poses);
 }

 retryCreativeModels(){this.creativeScene.retry();}
 /** Ordinary network authority corrections travel through the same legal route
  * and speed integrator as walking. Reload/account replacement constructs a new
  * World; explicit relocation can opt into teleport without weakening validation. */
 reconcilePlayer(state:MinimalState,{teleport=false}:{teleport?:boolean}={}){
  if(this.disposed)return;
  const from=toGrid(this.playerRoot.position),before=this.path.map(toGrid),speed=this.playerSpeed;
  const copiedSafe=isPlayerWalkRouteSafe(state,state.player,state.playerPath);
  const correction=playerWalkRoute(state,from,state.player);
  this.cancelWalk();
  if(teleport){this.playerRoot.position.copy(toWorld(state.player));this.playerRoot.position.y=this.groundHeight(this.playerRoot.position);this.path=copiedSafe?state.playerPath.map(toWorld):[];this.playerSpeed=copiedSafe?(state.playerSpeed??0):0;return;}
  if(!correction)return; // Never cut through blocked terrain to disguise divergence.
  const route=[...correction,...(copiedSafe?state.playerPath:[])];
  this.path=route.map(toWorld);this.playerSpeed=retargetPlayerSpeed(from,before,route,speed);
  // Correction arrival is not a user arrival and must not replay care/place.
 }
 animalModelStatus(){let loading=0,failed=0;for(const [species,registry] of [['alpaca',alpacaProvider],['penguin',penguinProvider]] as const){if(this.state.animals.some(a=>a.species===species))continue;const provider=registry.status();if(provider.state==='loading')loading++;if(provider.state==='failed')failed++;}for(const {art}of this.animals.values()){if(art.root.userData.animationStatus==='loading')loading++;if(art.root.userData.animationStatus==='failed')failed++;}return {loading,failed};}
 private reportAnimalModels(){if(this.disposed)return;const status=this.animalModelStatus(),stamp=`${status.loading}:${status.failed}`;if(stamp!==this.animalModelStatusStamp){this.animalModelStatusStamp=stamp;this.handlers.animalModelsChanged?.(status);}}
 retryAnimalModels():Promise<{ready:number;failed:number}>{
  if(this.disposed)return Promise.resolve({ready:0,failed:0});if(this.animalModelRetry)return this.animalModelRetry;
  const legacyRetries=[...this.animals.entries()].filter(([id])=>isLegacySpecies(this.state.animals.find(a=>a.id===id)?.species)).map(([,v])=>v.art.retryAnimation());
  const resourceRetries=(['alpaca','penguin'] as const).map(species=>(this.alpacaInspection?Promise.resolve(!!getHunyuanMainResource(species,this.alpacaInspection)):prepareActiveMainAnimalModel(species,{retry:true})).then(()=>this.disposed||!getHunyuanMainResource(species,this.alpacaInspection)?[]:Promise.all([...this.animals.entries()].filter(([id])=>this.state.animals.find(a=>a.id===id)?.species===species).map(([,v])=>v.art.retryAnimation()))));
  const result=Promise.all([Promise.all(legacyRetries),...resourceRetries]).then(()=>{if(this.disposed)return {ready:0,failed:0};this.reportAnimalModels();const failed=this.animalModelStatus().failed,ready=[...this.animals.values()].filter(v=>v.art.root.userData.animationStatus==='ready').length;return {ready,failed};}).finally(()=>{if(this.animalModelRetry===result)this.animalModelRetry=undefined;});
  this.animalModelRetry=result;return result;
 }
 getTerrainRenderStatus(){return this.terrainReadiness.status;}
 private renderError(error:unknown){return error instanceof Error?error.message.slice(0,200):String(error).slice(0,200);}
 private onTerrainShaderError:NonNullable<THREE.WebGLRenderer['debug']['onShaderError']>=(...args)=>{this.shaderFailure=new Error('地表材质无法编译');this.previousShaderError?.(...args);};
 private isContextLost(){return this.contextLost||(typeof this.renderer.getContext==='function'&&this.renderer.getContext().isContextLost());}
 private onTerrainContextReset=(event:Event)=>{if(this.disposed)return;this.contextLost=event.type==='webglcontextlost';this.terrainGround?.resetUploads();this.terrainReadiness.building(this.terrainPreview?'continuous':'legacy',this.fallbackReason);if(!this.contextLost)this.renderTerrainFrame();};
 /** View-only recovery: never replay a command, replace the farm, or clear actor routes. */
 private rebuildLegacy(reason:string){
  if(this.disposed)return false;
  // WebGL keeps one flag per error category. Do not blame a fresh legacy draw
  // for residual errors from the failed continuous attempt; never loop unbounded.
  const gl=typeof this.renderer.getContext==='function'?this.renderer.getContext():undefined;
  for(let i=0;gl&&i<8&&!gl.isContextLost();i++){const code=gl.getError();if(!code||code===gl.NO_ERROR||code===37442)break;}
  this.fallbackReason=reason;this.terrainPreview=false;this.terrainReadiness.building('legacy',reason);
  this.terrainGround?.dispose();this.terrainGround=undefined;this.terrainPreviewCache?.dispose();this.terrainPreviewCache=undefined;this.waterField=undefined;this.terrainAccentCache.dispose();this.terrainAccentCache=new TerrainAccentCache(this.terrainAccents,false);
  try{this.buildTerrainForMode();this.tileStamp=terrainBaseStamp(this.state.tiles);this.buildTerrainAccents();this.accentStamp=terrainVisualStamp(this.state.tiles);return true;}catch(error){this.terrainReadiness.fail(`兼容地表无法建立：${this.renderError(error)}`);return false;}
 }
 useLegacyTerrain(reason='已切换兼容地表'){
  if(this.disposed)return false;if(this.terrainPreview&&!this.rebuildLegacy(reason))return false;if(!this.drawing)this.renderTerrainFrame();return this.terrainReadiness.status.phase==='ready';
 }
 /** A real first draw attempts texture upload too; CPU fixtures deliberately replace the GPU. */
 private renderTerrainFrame(){
  if(this.disposed||this.drawing||this.terrainReadiness.status.phase==='error')return;
  if(this.isContextLost()){this.terrainReadiness.building(this.terrainPreview?'continuous':'legacy',this.fallbackReason);return;}
  this.drawing=true;
  const draw=()=>{this.shaderFailure=undefined;this.renderer.render(this.scene,this.camera);if(this.isContextLost())return false;if(this.shaderFailure)throw this.shaderFailure;const gl=typeof this.renderer.getContext==='function'?this.renderer.getContext():undefined,code=this.terrainReadiness.status.phase==='building'||this.pendingTerrainUploadValidation?gl?.getError():0;if(code&&code!==gl?.NO_ERROR)throw new Error(`绘制错误 ${code}`);this.pendingTerrainUploadValidation=false;return true;};
  try{if(draw())this.terrainReadiness.complete(this.terrainPreview?'continuous':'legacy',this.fallbackReason);}
  catch(error){if(this.isContextLost())this.terrainReadiness.building(this.terrainPreview?'continuous':'legacy',this.fallbackReason);else if(this.terrainPreview&&this.rebuildLegacy(this.renderError(error))){try{if(draw())this.terrainReadiness.complete('legacy',this.fallbackReason);}catch(legacyError){this.terrainReadiness.fail(`兼容地表无法绘制：${this.renderError(legacyError)}`);}}else this.terrainReadiness.fail(this.renderError(error));}
  finally{this.drawing=false;}
 }
 private buildTerrain(){try{this.buildTerrainForMode();}catch(error){if(!this.terrainPreview||!this.rebuildLegacy(this.renderError(error)))throw error;}}
 private buildTerrainForMode(){
  this.pendingTerrainUploadValidation=true;
  if(this.terrainPreview&&this.terrainPreviewCache){
   this.waterField=createWaterField(this.state.tiles);
   const revision=this.terrainPreviewCache.revision;this.terrainPreviewCache.update(this.state.tiles,this.waterField);if(this.terrainPreviewCache.revision!==revision)this.terrain.add(makeEssentials());
   if(!this.terrainGround||this.terrainGround.update(this.state.tiles)===null){this.terrainGround?.dispose();this.terrainGround=createTerrainGround(this.state.tiles);this.scene.add(this.terrainGround.root);}
  }else{
   disposeTree(this.terrain);this.terrain.clear();for(const t of this.state.tiles)this.terrain.add(makeTerrainBase(t,this.state.tiles).root);this.terrain.add(makeEssentials());batchScenery(this.terrain);
  }
  this.solidFootTriangleLiftWorld=this.terrainPreview?createBankSolidContact(this.terrain):undefined;
  this.weather.setSurfaceSampler(createWeatherSurfaceSampler(this.state.tiles,this.waterField));
  disposeTree(this.pickLayer);this.pickLayer.clear();this.picks=[];for(const t of this.state.tiles){const hit=new THREE.Mesh(new THREE.BoxGeometry(1.985,.3,1.985),new THREE.MeshBasicMaterial({visible:false}));hit.position.copy(toWorld(t));hit.position.y=-.15;hit.userData.target={kind:'tile',x:t.x,z:t.z};this.pickLayer.add(hit);this.picks.push(hit);}
 }
 private buildTerrainAccents(){this.terrainAccentCache.update(this.state.tiles);this.pendingTerrainUploadValidation=true;}
 /** Placement hints stay mounted across simulation ticks, avoiding half-second flicker. */
 setPlacementMode(active:boolean){if(this.placementMode===active)return;this.placementMode=active;this.placementOverlay.visible=active;this.placementHover=null;if(active)this.refreshPlacement();else{if(this.placementGhost)this.placementGhost.visible=false;this.renderer.domElement.style.cursor='';}}
 setTerrainEditMode(active:boolean){this.terrainEditMode=active;}
 private refreshPlacement(){
  for(const tile of this.state.tiles){if(!tile.owned)continue;const key=`${tile.x},${tile.z}`;let line=this.placementCells.get(key);if(!line){const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.88,0,-.88),new THREE.Vector3(.88,0,-.88),new THREE.Vector3(.88,0,.88),new THREE.Vector3(-.88,0,.88)]);line=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({transparent:true,depthWrite:false}));line.position.copy(toWorld(tile));line.position.y=.065;this.placementOverlay.add(line);this.placementCells.set(key,line);}const valid=canPlaceEgg(this.state,tile),material=line.material as THREE.LineBasicMaterial;material.color.set(valid?'#B7F1B3':'#8E9280');material.opacity=valid?.58:.15;}
  if(!this.placementGhost){this.placementGhost=new THREE.Mesh(new THREE.SphereGeometry(1,18,14),new THREE.MeshBasicMaterial({color:'#D5FFE1',transparent:true,opacity:.38,depthWrite:false}));this.placementGhost.scale.set(.27,.37,.27);this.placementGhost.visible=false;this.placementOverlay.add(this.placementGhost);}if(this.placementHover)this.showPlacementHover(this.placementHover);
 }
 private showPlacementHover(point:Point){this.placementHover=point;const valid=canPlaceEgg(this.state,point);if(this.placementGhost){this.placementGhost.visible=valid;this.placementGhost.position.copy(toWorld(point));this.placementGhost.position.y=.44;}this.renderer.domElement.style.cursor=valid?'copy':'not-allowed';}
 private pointerHits(event:PointerEvent,prepare=false){
  const b=this.renderer.domElement.getBoundingClientRect();if(!b.width||!b.height)return [];
  if(prepare){this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);if(this.showcase)this.animalPicker.refreshRayBounds(this.showcase.root);for(const {art}of this.animals.values())this.animalPicker.refreshRayBounds(art.root);this.animalPicker.refreshRayBounds(this.playerRoot);this.animalPicker.refreshRayBounds(this.guardRoot);}
  this.pointer.set((event.clientX-b.left)/b.width*2-1,-(event.clientY-b.top)/b.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
  const roots:THREE.Object3D[]=this.placementMode?this.picks:[this.shop,this.creativeRoot,...this.visitorScenery?.suppliedLandmark.root.userData.target?[this.visitorScenery.suppliedLandmark.root]:[],...this.showcase?[this.showcase.root]:[],...[...this.animals.values()].map(v=>v.art.root),...[...this.eggs.values()].map(v=>v.art.root),...this.picks];
  return this.raycaster.intersectObjects(roots,true).filter(hit=>{
   if(!isPickVisible(hit.object))return false;if(this.picks.includes(hit.object))return true;
   if(!(hit.object instanceof THREE.Mesh))return false;const material=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;
   return !!material?.visible&&(!material.transparent||material.opacity>.05);
  });
 }
 private pickingBlockers(except?:THREE.Object3D){
  return [this.terrain,this.creativeRoot,this.playerRoot,this.guardRoot,this.shop,...this.showcase?[this.showcase.root]:[],...[...this.animals.values()].map(v=>v.art.root),...[...this.eggs.values()].map(v=>v.art.root)].filter(root=>root!==except).flatMap(visiblePickMeshes);
 }
 private pickPointVisible(point:PickSurfacePoint,except:THREE.Object3D,blockers:THREE.Object3D[]){
  const b=this.renderer.domElement.getBoundingClientRect();this.sightRay.setFromCamera(new THREE.Vector2((point.screen.x-b.left)/b.width*2-1,-(point.screen.y-b.top)/b.height*2+1),this.camera);
  const distance=point.world.clone().sub(this.sightRay.ray.origin).dot(this.sightRay.ray.direction);
  // The sampled point already belongs to the candidate's real skin. Exclude
  // that actor before raycasting, not after paying for its full triangles.
  return !this.sightRay.intersectObjects(blockers.filter(object=>!this.belongsTo(object,except)),false).some(hit=>hit.distance<distance-.004&&isPickVisible(hit.object));
 }
 private belongsTo(object:THREE.Object3D,root:THREE.Object3D){for(let node:THREE.Object3D|null=object;node;node=node.parent)if(node===root)return true;return false;}
 private targetFromPointer(event:PointerEvent,assist=true):WorldTarget|null{
  const hits=this.pointerHits(event,assist&&!this.placementMode);let direct:WorldTarget|null=null,semanticHit:THREE.Intersection|undefined,semanticRoot:THREE.Object3D|undefined;
  for(const hit of hits){let o:THREE.Object3D|null=hit.object;while(o&&!o.userData.target&&!o.userData.creativeAssetId)o=o.parent;if(o?.userData.target||o?.userData.creativeAssetId){const target=(o.userData.target??{kind:'creative',id:o.userData.creativeAssetId}) as WorldTarget;direct=target.kind==='tile'?{...target,worldPoint:toGrid(hit.point)}:target;semanticHit=hit;semanticRoot=o;break;}}
  if(!assist||this.placementMode||!direct)return direct;
  const viewport=this.renderer.domElement.getBoundingClientRect(),screen={x:event.clientX,y:event.clientY};
  if(direct.kind!=='tile'){
   // Exact semantic geometry wins, but never through an opaque foreground actor.
   const blockers=[this.terrain,this.creativeRoot,this.playerRoot,this.guardRoot].flatMap(visiblePickMeshes),point={screen,world:semanticHit!.point,depth:0};
   return this.pickPointVisible(point,semanticRoot!,blockers)?direct:null;
  }
  const tile=tileAt(this.state,direct);
  if(this.terrainEditMode||!tile?.owned||tile.terrain==='pond'||tile.terrain==='creek'||isShopTile(direct)||[WATER_BOWL,REST_MAT].some(point=>point.x===direct.x&&point.z===direct.z))return direct;
  const roots=[...[...this.animals].map(([id,{art}])=>({id,root:art.root,kind:'animal' as const})),...this.showcaseSummary().filter(a=>a.status==='ready').flatMap(a=>{const root=this.showcase?.rootFor(a.id);return root?[{id:a.id,root,kind:'showcase' as const}]:[];})];const candidates=roots.flatMap(({id,root,kind})=>{const projection=this.animalPicker.project(root,this.camera,viewport,screen);return projection&&(projection.bounds.right-projection.bounds.left<44||projection.bounds.bottom-projection.bounds.top<44)?[{id,kind,root,...projection}]:[];});
  // The lunar overview has many walkable gaps next to tiny projected bodies.
  // Do not expand its actor hit-box into visible ground; ordinary animals keep
  // their existing44px assist. Exact skin hits above still always win.
  const ranked=rankAnimalTouchCandidates(screen,candidates.filter(c=>c.kind!=='showcase'||screen.x>=c.bounds.left&&screen.x<=c.bounds.right&&screen.y>=c.bounds.top&&screen.y<=c.bounds.bottom));if(!ranked.length)return direct;
  const blockers=this.pickingBlockers(),foreground=[this.terrain,this.creativeRoot,this.playerRoot,this.guardRoot].flatMap(visiblePickMeshes),pointerBlockers=this.raycaster.intersectObjects(foreground,false);
  for(const candidate of ranked){
   const front=Math.min(...candidate.points.map(p=>p.world.clone().sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction)));
   if(pointerBlockers.some(hit=>hit.distance<front-.004&&isPickVisible(hit.object)))continue;
   const probes=candidate.points.slice().sort((a,b)=>Math.hypot(a.screen.x-screen.x,a.screen.y-screen.y)-Math.hypot(b.screen.x-screen.x,b.screen.y-screen.y)).slice(0,8);
   if(probes.some(point=>this.pickPointVisible(point,candidate.root,blockers)))return candidate.kind==='showcase'?{kind:'showcase',id:candidate.id as LunarShowcaseId}:{kind:'animal',id:candidate.id};
  }
  return direct;
 }
 private groundHeight(p:THREE.Vector3){const q=toGrid(p),tile=this.state.tiles.find(t=>t.x===Math.round(q.x)&&t.z===Math.round(q.z));if(!tile)return 0;if(this.waterField&&tile.terrain==='creek'){const water=sampleWater(this.waterField,p.x,p.z,tile);return water.coverage?water.height:water.distance<.12?.003:0;}const center=toWorld(tile);return terrainSurfaceHeight(tile,p.x-center.x,p.z-center.z,this.state.tiles);}
 walkTo(point:Point,requestId?:number){
  const route=this.playerRoute(toGrid(this.playerRoot.position),point);if(!route)return false;this.interiorFollowAnchor=undefined;this.inspectionPoint=null;
  // Replace intent immediately, but let an in-flight lift/lower settle without snapping.
  this.playerSpeed=retargetPlayerSpeed(toGrid(this.playerRoot.position),this.path.map(toGrid),route,this.playerSpeed);
  this.path=route.map(toWorld);this.activeAction=null;this.actionUntil=0;
  // Use the exact commanded destination, not an extra renderer-only animal approach.
  // Both simulation and visual route must converge to the same point.
  this.destination={...point};this.destinationRequestId=requestId;(this.marker.material as THREE.MeshBasicMaterial).color.set(this.placementMode?'#B7F1B3':'#FFF7D8');this.invalidUntil=0;this.marker.position.copy(toWorld(point));this.marker.position.y=.06;this.marker.visible=true;disposeTree(this.route);this.route.clear();for(const p of this.path){const dot=new THREE.Mesh(new THREE.CircleGeometry(.04,8),new THREE.MeshBasicMaterial({color:'#FFF5CD',transparent:true,opacity:.75}));dot.rotation.x=-Math.PI/2;dot.position.copy(p);dot.position.y=.045;this.route.add(dot);}if(!this.path.length){this.destination=null;this.destinationRequestId=undefined;this.marker.visible=false;this.handlers.arrive(point,requestId);}return true;}
 playerMotionSnapshot():PlayerMotionSnapshot{return {position:toGrid(this.playerRoot.position),path:this.path.map(toGrid),speed:this.path.length?this.playerSpeed:0};}
 /** Called only while hidden or synchronously before the first visible render. */
 private rebaseHiddenAnimals(){
  for(const a of this.state.animals){const v=this.animals.get(a.id);if(!v||a.id===this.state.carriedAnimalId)continue;v.art.root.position.copy(toWorld(a.position));v.art.root.position.y=this.groundHeight(v.art.root.position);v.speed=0;delete v.standingPoint;delete v.hatchOrigin;v.hatchAt=0;}
 }
 setPlayerMotionVisible(visible:boolean){
  if(this.disposed||visible===this.playerMotionVisible)return;
  this.playerMotionVisible=visible;this.showcase?.setPaused(!visible);
  if(!visible){
   cancelAnimationFrame(this.frame);this.frame=0;this.finishTransfers();
   for(const effect of this.saleEffects)effect.dispose();this.saleEffects.clear();
   // Finish shell and animal together. A short app switch must not reveal the
   // animal inside a still-closed shell, or replay particles on returning.
   for(const burst of this.bursts){this.scene.remove(burst.root);burst.egg?.dispose();disposeTree(burst.root);}
   this.bursts=[];this.hatchFocus=null;this.activeAction=null;this.feedProp.visible=false;
   this.rebaseHiddenAnimals();
  }else{
   this.rebaseHiddenAnimals();this.previous=0;this.animalFrameTime=undefined;
   this.frame=requestAnimationFrame(this.animate);
  }
 }

 setSelection(target:WorldTarget|null){if(target?.kind!=='tile'||this.inspectionPoint&&(target.x!==this.inspectionPoint.x||target.z!==this.inspectionPoint.z))this.inspectionPoint=null;this.selected=target;for(const[id,v]of this.animals)if(target?.kind!=='animal'||target.id!==id){v.label.style.display='none';v.label.textContent='';}}
 cancelWalk(){this.playerSpeed=0;this.path=[];this.destination=null;this.destinationRequestId=undefined;disposeTree(this.route);this.route.clear();this.marker.visible=false;}
 perform(kind:ActionKind,animalId?:string){
  if(kind==='sell'){
   if(this.disposed||!animalId||this.state.carriedAnimalId!==animalId)return;
   const visual=this.animals.get(animalId);if(!visual)return;
   this.animals.delete(animalId);visual.label.remove();delete visual.transfer;
   if(this.playerMotionVisible)this.saleEffects.add(new SaleHandoff(visual.art,performance.now(),this.reduced));
   else{this.scene.remove(visual.art.root);visual.art.dispose();}
   return;
  }
  const target=animalId??(this.selected?.kind==='animal'?this.selected.id:undefined),animal=target?this.animals.get(target):undefined;
  const custom=target?this.creativeScene.rootForAsset(target):undefined;if((kind==='pet'||kind==='feed')&&!animal&&!custom)return;
  if(kind==='pet'||kind==='feed')this.finishTransfers(target);
  const at=performance.now(),duration=kind==='pet'?GREETING_DURATION_MS:kind==='feed'?2400:500;this.activeAction={kind,at,duration,animalId:target};this.actionUntil=at+duration;
  if(kind==='pet'&&(animal||custom))this.spawnBurst('hearts',(animal?.art.root??custom!).position.clone());
  if(kind==='collect')this.spawnBurst('coins',this.playerRoot.position.clone());
 }
 private supportPoint(visual:AnimalVisual){refreshPose(visual.art.root);return visual.art.root.getObjectByName('animal-support')?.getWorldPosition(new THREE.Vector3())??visual.art.root.position.clone();}
 private carryPoint(){return this.playerPose?.carrySupport()??this.playerRoot.position.clone().add(new THREE.Vector3(0,.97,0));}
 private placeSupport(visual:AnimalVisual,point:THREE.Vector3){const support=this.supportPoint(visual);visual.art.root.position.add(point.clone().sub(support));refreshPose(visual.art.root);}
 private startTransfer(id:string,kind:AnimalTransfer['kind']){const visual=this.animals.get(id);if(!visual)return;visual.transfer={kind,at:performance.now(),from:this.supportPoint(visual),fromRoot:visual.art.root.position.clone(),heading:visual.art.root.rotation.y,clearance:-Infinity};visual.hatchAt=0;delete visual.hatchOrigin;delete visual.standingPoint;visual.speed=0;}
 private finishTransfers(onlyId?:string){
  for(const a of this.state.animals){if(onlyId&&a.id!==onlyId)continue;const v=this.animals.get(a.id);if(!v?.transfer)continue;const carried=a.id===this.state.carriedAnimalId;delete v.transfer;v.speed=0;v.art.update({solidFootTriangleLiftWorld:a.species==='alpaca'||a.species==='penguin'?this.solidFootTriangleLiftWorld:undefined,time:performance.now()/1000,speed:0,distance:v.distance,activity:carried?'carried':'idle',carried,hatch:1});
   if(carried){v.art.root.rotation.y=this.playerRoot.rotation.y;this.playerPose?.braceCarry();this.placeSupport(v,this.carryPoint());}
   else{v.art.root.position.copy(toWorld(a.position));v.art.root.position.y=this.groundHeight(v.art.root.position);refreshPose(v.art.root);}
  }
 }
 setWeatherReducedMotion(reduced:boolean){this.weather.setReducedMotion(reduced);}
 setWeatherPreferences(preferences:WeatherOverride){this.weatherPreferences={...preferences};}
 focus(){this.interiorFollowAnchor=undefined;this.inspectionPoint=null;this.hatchFocus=null;this.controls.enableDamping=false;this.controls.update();this.controls.target.copy(this.playerRoot.position).setY(.75);this.camera.position.copy(this.controls.target).add(new THREE.Vector3(9,13.05,18));this.camera.zoom=1.6;this.camera.updateProjectionMatrix();this.controls.update();this.controls.enableDamping=true;}
 focusTile(point:Point){this.interiorFollowAnchor=undefined;if(!this.state.tiles.some(t=>t.x===point.x&&t.z===point.z))return;this.inspectionPoint={x:point.x,z:point.z};this.hatchFocus=null;this.controls.enableDamping=false;this.controls.update();this.controls.target.copy(toWorld(point)).setY(.75);this.camera.position.copy(this.controls.target).add(new THREE.Vector3(9,13.05,18));this.camera.zoom=1.1;this.camera.updateProjectionMatrix();this.controls.update();this.controls.enableDamping=true;}
 zoom(delta:number){this.showcaseOverview=false;this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom+delta,this.controls.minZoom,this.controls.maxZoom);this.camera.updateProjectionMatrix();this.controls.update();}
 screenPoint(point:Point){const v=toWorld(point).add(new THREE.Vector3(0,1.2,0)).project(this.camera);return{x:(v.x+1)*.5*this.host.clientWidth,y:(1-v.y)*.5*this.host.clientHeight};}
 /** Visitor-only opening frame reserves header and the optional compact menu. */
 frameLunarShowcase(){if(this.visitorScenery?.root.userData.theme!=='lunar')return;this.frameVisitorOverview();}
 frameVisitorOverview(bounds?:{min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}}){if(!this.visitorScenery)return;this.visitorOverviewBounds=bounds;this.showcaseOverview=true;this.resize();}
 private fitLunarOverview(w:number,h:number){
  this.camera.clearViewOffset();this.camera.zoom=1;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
  // Initial five maximum-growth actors + hoop/flight envelope, not the empty
  // outer terrain corners. Roaming keeps the normal camera/drag controls.
  const points:THREE.Vector3[]=[],lunar=this.visitorScenery?.root.userData.theme==='lunar';const play=lunar?{min:{x:-2.5,y:0,z:LUNAR_SHOWCASE_LAYOUT.bounds.min.z},max:{x:7.2,y:LUNAR_SHOWCASE_LAYOUT.bounds.max.y,z:6.5}}:{min:{x:-4,y:0,z:-4},max:{x:8,y:2,z:8}};for(const b of [play,...(this.visitorOverviewBounds?[this.visitorOverviewBounds]:[])])for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new THREE.Vector3(x,y,z));
  const project=()=>points.map(p=>p.clone().project(this.camera)).map(p=>({x:(p.x+1)*w/2,y:(1-p.y)*h/2}));
  let projected=project();const primary=projected.slice(0,8),width=Math.max(...primary.map(p=>p.x))-Math.min(...primary.map(p=>p.x)),height=Math.max(...primary.map(p=>p.y))-Math.min(...primary.map(p=>p.y)),top=104,bottom=176;
  this.camera.zoom=Math.min(.65,Math.max(.08,Math.min((w-32)/width,Math.max(60,h-top-bottom)/height)*.94));this.camera.updateProjectionMatrix();projected=project();
  // Decorative skyline may crop at the edge: never zoom the player/companions out merely to fit it.
  const core=projected.slice(0,8),centerY=(Math.min(...projected.map(p=>p.y))+Math.max(...projected.map(p=>p.y)))/2,centerX=(Math.min(...projected.map(p=>p.x))+Math.max(...projected.map(p=>p.x)))/2;
  const offsetX=THREE.MathUtils.clamp(centerX-w/2,Math.max(...core.map(p=>p.x))-(w-16),Math.min(...core.map(p=>p.x))-16),offsetY=THREE.MathUtils.clamp(centerY-(top+h-bottom)/2,Math.max(...core.map(p=>p.y))-(h-bottom),Math.min(...core.map(p=>p.y))-top);this.camera.setViewOffset(w,h,offsetX,offsetY,w,h);this.camera.updateProjectionMatrix();
 }
 private resize(){const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h,false);const half=5.2;this.camera.left=-half;this.camera.right=half;this.camera.top=half*h/w;this.camera.bottom=-half*h/w;this.camera.updateProjectionMatrix();if(this.showcaseOverview)this.fitLunarOverview(w,h);}
 private onOrbitStart=()=>{this.hatchFocus=null;};
 private clearHover=()=>{this.placementHover=null;if(this.placementGhost)this.placementGhost.visible=false;this.renderer.domElement.style.cursor='';};
 private hover(event:PointerEvent){const target=this.targetFromPointer(event,false);if(this.placementMode&&target?.kind==='tile')this.showPlacementHover(target);else{this.clearHover();this.renderer.domElement.style.cursor=target?'pointer':'';}}
 private onHoverCapture=(event:PointerEvent)=>{if(isUnpressedMouseMove(event)){this.hover(event);event.stopImmediatePropagation();}};
 private cancelInteraction=()=>{this.cancelWalk();this.handlers.interactionCancel?.();};
 private onPointerDown=(event:PointerEvent)=>{this.activePointers.add(event.pointerId);this.tapGate.down(event);if(this.activePointers.size===1){this.pointerStart={x:event.clientX,y:event.clientY};this.pointerMoved=false;this.hover(event);}else{this.pointerMoved=true;this.clearHover();}};
 private onPointerMove=(event:PointerEvent)=>{this.tapGate.move(event);if(!this.pointerMoved&&this.pointerStart&&Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)>=6){this.pointerMoved=true;}if(this.pointerMoved){this.clearHover();this.renderer.domElement.style.cursor='grabbing';}};
 private onWindowBlur=()=>{this.cancelInteraction();this.onPointerCancel();this.controls.disconnect();this.controls.connect(this.renderer.domElement);};
 private onPointerCancel=()=>{this.tapGate.cancel();this.activePointers.clear();this.pointerStart=null;this.pointerMoved=false;this.clearHover();};
 private onPointerUp=(event:PointerEvent)=>{this.tapGate.up(event);this.activePointers.delete(event.pointerId);this.pointerStart=null;this.clearHover();};
 private onClick=(event:MouseEvent)=>{event.stopPropagation();if(!this.tapGate.consume())return;this.choose(event as PointerEvent);};
 private choose(event:PointerEvent){const target=this.targetFromPointer(event);if(target){if(this.placementMode&&target.kind==='tile'){this.showPlacementHover(target);if(!canPlaceEgg(this.state,target)){this.marker.position.copy(toWorld(target));this.marker.position.y=.08;(this.marker.material as THREE.MeshBasicMaterial).color.set('#E68F79');this.marker.visible=true;this.invalidUntil=performance.now()+700;}else{(this.marker.material as THREE.MeshBasicMaterial).color.set('#B7F1B3');this.invalidUntil=0;}}this.setSelection(target);this.handlers.select(target);}}

 private move(root:THREE.Object3D,target:THREE.Vector3,dt:number,speed:number,tolerance=.008){const dx=target.x-root.position.x,dz=target.z-root.position.z,d=Math.hypot(dx,dz);if(d<tolerance)return 0;const step=Math.min(d,speed*dt);root.position.x+=dx/d*step;root.position.z+=dz/d*step;const yaw=Math.atan2(dx,dz);root.rotation.y+=Math.atan2(Math.sin(yaw-root.rotation.y),Math.cos(yaw-root.rotation.y))*(1-Math.exp(-dt*9));return step;}
 private locomotion(root:THREE.Object3D,speed:number,distance:number){return farmLocomotion(root,speed,distance);}
 private projectedLabel(label:HTMLDivElement,position:THREE.Vector3,height:number){const p=position.clone().add(new THREE.Vector3(0,height,0)).project(this.camera);label.style.left=`${(p.x+1)*.5*this.host.clientWidth}px`;label.style.top=`${(1-p.y)*.5*this.host.clientHeight}px`;label.style.display=p.z>1||Math.abs(p.x)>1.2||Math.abs(p.y)>1.2?'none':'';}
 private spawnBurst(kind:Burst['kind'],point:THREE.Vector3){const root=new THREE.Group();root.position.copy(point);if(kind==='hatch')root.position.y=this.groundHeight(root.position);this.scene.add(root);const burst:Burst={root,kind,at:performance.now()};if(kind==='hatch'){burst.egg=createFarmEgg();root.add(burst.egg.root);}
  else for(let i=0;i<8;i++){let p:THREE.Mesh;if(kind==='coins'){p=mesh(root,new THREE.CylinderGeometry(.085,.085,.025,16),'#F2C967');p.rotation.x=Math.PI/2;}else{const heart=new THREE.Shape();heart.moveTo(0,-.11);heart.bezierCurveTo(-.2,.015,-.09,.16,0,.07);heart.bezierCurveTo(.09,.16,.2,.015,0,-.11);p=mesh(root,new THREE.ExtrudeGeometry(heart,{depth:.035,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:2,steps:1,curveSegments:8}),'#E9A29D');p.rotation.y=this.controls.getAzimuthalAngle();p.rotation.x=-.2;}p.userData.particle=i;}this.bursts.push(burst);}
 private updateBursts(now:number){for(const b of this.bursts){const t=(now-b.at)/1000;if(b.egg)b.egg.update(1,now/1000,Math.min(1,(now-b.at)/HATCH_DURATION_MS),this.reduced);for(const child of b.root.children){const i=child.userData.particle as number|undefined;if(i===undefined)continue;const angle=i/12*Math.PI*2;child.position.set(Math.cos(angle)*t*.65,.35+Math.sin(Math.min(1,t/2)*Math.PI)*1.1,Math.sin(angle)*t*.65);child.scale.setScalar(Math.max(0,1-t/2.2));}if(t>2.4){this.scene.remove(b.root);b.egg?.dispose();disposeTree(b.root);}}
  this.bursts=this.bursts.filter(b=>now-b.at<=2400);}
 private updateActors(dt:number,now:number){
  if(!this.playerRouteSafe(toGrid(this.playerRoot.position),this.path.map(toGrid))){
   const liveIntent=!!this.destination||this.destinationRequestId!==undefined||this.path.length>0;
   const replanned=this.showcase&&this.destination?this.playerRoute(toGrid(this.playerRoot.position),this.destination):null;
   if(replanned?.length){this.path=replanned.map(toWorld);this.playerSpeed=0;}else{this.cancelWalk();if(liveIntent){this.handlers.interactionCancel?.();if(this.showcase)this.handlers.status?.('伙伴挡住了这条路，点旁边的空地试试');}}
  }
  const position=toGrid(this.playerRoot.position),route=this.path.map(toGrid),oldLength=route.length;
  const transferEnd=Math.max(0,...Array.from(this.animals.values(),v=>v.transfer?v.transfer.at+ANIMAL_TRANSFER_DURATION_MS:0));
  const travelDt=this.showcase?.transferring()?0:Math.min(dt,Math.max(0,(now-transferEnd)/1000));
  const movement=this.playerMotionVisible?advancePlayerMotion(position,route,travelDt,this.playerSpeed):{speed:this.playerSpeed,distance:0};this.playerSpeed=movement.speed;
  if(movement.distance>0){
   const destination=toWorld(position),dx=destination.x-this.playerRoot.position.x,dz=destination.z-this.playerRoot.position.z;
   this.playerRoot.position.x=destination.x;this.playerRoot.position.z=destination.z;
   const yaw=Math.atan2(dx,dz);this.playerRoot.rotation.y+=Math.atan2(Math.sin(yaw-this.playerRoot.rotation.y),Math.cos(yaw-this.playerRoot.rotation.y))*(1-Math.exp(-dt*9));
   this.travelled+=movement.distance*2;
  }
  if(route.length!==oldLength)this.path.splice(0,oldLength-route.length);
  if(!this.path.length&&this.destination){const arrived=this.destination,requestId=this.destinationRequestId;this.destination=null;this.destinationRequestId=undefined;disposeTree(this.route);this.route.clear();this.marker.visible=false;this.handlers.arrive(arrived,requestId);}
  this.playerRoot.position.y=THREE.MathUtils.lerp(this.playerRoot.position.y,this.groundHeight(this.playerRoot.position),1-Math.exp(-dt*14));
  const speed=movement.distance*2/dt;this.player.root.position.y=0;
  this.player.update(now/1000,'dance',speed<.02,.08,this.locomotion(this.playerRoot,speed,this.travelled));
  this.playerPose?.ground(p=>this.groundHeight(p));if(this.state.carriedAnimalId)this.feedProp.visible=false;
  // Animals retain their independently bounded frame clock.
  const elapsed=this.animalFrameTime===undefined?dt:(now-this.animalFrameTime)/1000,animalDt=Math.min(.1,elapsed>0?elapsed:dt);this.animalFrameTime=now;
  // The visual can be ahead of the saved tick; a wall-clock rollback must not shrink it. Hatch bounce stays inside the art rig.
  for(const a of this.state.animals){const v=this.animals.get(a.id);if(!v)continue;if(!isLegacySpecies(a.species)&&(!isAnimalRuntimeActive(a,this.alpacaInspection)||v.art.root.userData.animationStatus!=='ready')){v.art.root.visible=false;v.label.style.display='none';v.label.textContent='';continue;}const locked=this.animalLocks.has(a.id),active=this.activeAction?.animalId===a.id&&now-this.activeAction.at<this.activeAction.duration&&['feed','pet'].includes(this.activeAction.kind),carried=a.id===this.state.carriedAnimalId,scale=Math.max(v.art.root.scale.x,animalScale(a,this.now())),drinkSpot=!locked&&!active&&a.activity==='drink'?getDrinkSpot(this.state,a,{reachWorld:Number(v.art.root.userData.muzzleReach??.72)*scale,scale,inspection:this.alpacaInspection,now:this.now()}):null;v.art.root.scale.setScalar(scale);
   const transfer=v.transfer,transferProgress=transfer?animalTransferProgress(now-transfer.at):1,visualCarried=carried||!!transfer&&transferProgress<.65;
   if(carried||transfer){if(transfer){const desired=transfer.kind==='lift'?this.playerRoot.rotation.y:transfer.heading;v.art.root.rotation.y=transfer.heading+Math.atan2(Math.sin(desired-transfer.heading),Math.cos(desired-transfer.heading))*smooth(transferProgress);}else v.art.root.rotation.y=this.playerRoot.rotation.y;v.speed=0;delete v.standingPoint;}
   else if(active){v.speed=0;delete v.standingPoint;if(this.activeAction!.kind==='feed'){const desired=Math.atan2(this.playerRoot.position.x-v.art.root.position.x,this.playerRoot.position.z-v.art.root.position.z);v.art.root.rotation.y+=Math.atan2(Math.sin(desired-v.art.root.rotation.y),Math.cos(desired-v.art.root.rotation.y))*(1-Math.exp(-dt*5));}}
   else if(!this.playerMotionVisible){v.speed=0;}
   else{
    const predicted={...a.position},predictionEnd=this.state.updatedAt+Math.min(500,Math.max(0,this.now()-this.state.updatedAt));let travel=locked?0:animalGridTravel(a,this.state.updatedAt,predictionEnd,this.alpacaInspection);
    for(const waypoint of a.path??[]){const dx=waypoint.x-predicted.x,dz=waypoint.z-predicted.z,d=Math.hypot(dx,dz);if(d<.0001)continue;const step=Math.min(d,travel);predicted.x+=dx/d*step;predicted.z+=dz/d*step;travel-=step;if(travel<=0)break;}
    // New saves already place the authority at its frozen bank stance. The local
    // fallback only supports direct legacy scene consumers until model hydration.
    if(drinkSpot&&!a.drinkAnchor)v.standingPoint=toWorld(drinkSpot.standingPoint);
    else if(locked||a.drinkAnchor||a.path?.length||v.standingPoint&&!isWalkableTile(this.state,toGrid(v.standingPoint)))delete v.standingPoint;
    let target=v.standingPoint?.clone()??toWorld(predicted);
    if(!locked&&!drinkSpot&&!a.path?.length&&this.state.animals.some(other=>other.id!==a.id&&other.id!==this.state.carriedAnimalId&&Math.hypot(other.position.x-a.position.x,other.position.z-a.position.z)<.2)){const angle=this.state.animals.indexOf(a)*2.399;target.x+=Math.cos(angle)*.27;target.z+=Math.sin(angle)*.27;}
    // A correction is still motion: use the same body-safe route as authority,
    // rather than cutting a straight line through a newly placed prop.
    if(this.state.staticObstacles?.length){const route=animalRoute(animalNavigation(this.state),{...a,position:toGrid(v.art.root.position)},toGrid(target),this.now(),this.alpacaInspection);target=route?.length?toWorld(route[0]):v.art.root.position.clone();}
    const remaining=Math.hypot(target.x-v.art.root.position.x,target.z-v.art.root.position.z),maximum=animalWorldSpeed(a,this.now(),scale,this.alpacaInspection)*ANIMAL_VISIBLE_CORRECTION;
    const step=this.move(v.art.root,target,animalDt,Math.min(maximum,remaining*(1-Math.exp(-animalDt*12))/animalDt),.0001);v.distance+=step/scale;v.speed=step/animalDt;
    v.art.root.position.y=THREE.MathUtils.lerp(v.art.root.position.y,this.groundHeight(v.art.root.position),1-Math.exp(-animalDt*10));
    if(drinkSpot){const water=toWorld(drinkSpot.waterPoint),desired=Math.atan2(water.x-v.art.root.position.x,water.z-v.art.root.position.z);v.art.root.rotation.y+=Math.atan2(Math.sin(desired-v.art.root.rotation.y),Math.cos(desired-v.art.root.rotation.y))*(1-Math.exp(-animalDt*5));}
   }
   const greeting=active&&this.activeAction!.kind==='pet'?greetingPoseAt(now-this.activeAction!.at):undefined;
   const activity=active?(this.activeAction!.kind==='feed'?'eat':greeting?.reacting?'love':'idle'):locked?'idle':a.activity;const hatch=v.hatchAt?Math.min(1,(now-v.hatchAt)/HATCH_DURATION_MS):1,hatchPose=hatchPoseAt(hatch,this.reduced);v.art.root.visible=hatchPose.visible;if(v.hatchOrigin&&hatch<1&&!carried){const landing=toWorld(a.position);landing.y=this.groundHeight(landing);v.art.root.position.copy(v.hatchOrigin).lerp(landing,hatchPose.travel);v.speed=0;}const waterContact=drinkSpot?toWorld(drinkSpot.waterPoint):undefined;if(waterContact){waterContact.y=this.waterField?waterContactHeight(this.waterField,waterContact.x,waterContact.z,drinkSpot!.waterHeight,drinkSpot!.source):drinkSpot!.waterHeight;v.art.root.updateMatrixWorld(true);v.art.root.worldToLocal(waterContact);}v.art.update({solidFootTriangleLiftWorld:a.species==='alpaca'||a.species==='penguin'?this.solidFootTriangleLiftWorld:undefined,time:now/1000,speed:v.speed,distance:v.distance,activity,carried:visualCarried,hatch:this.reduced?1:hatch,reactProgress:greeting?.reactProgress,drinkPhase:1-(a.activityUntil-this.now())/6000,waterContact,selected:this.selected?.kind==='animal'&&this.selected.id===a.id});
   if(transfer){
    const support=this.supportPoint(v),head=this.carryPoint();let goal=head;
    if(transfer.kind==='lower'){goal=toWorld(a.position);goal.y=this.groundHeight(goal);goal.add(support.clone().sub(v.art.root.position));}
    const underside=animalTransferUnderside(a.species,this.alpacaInspection);if(underside===null){v.art.root.visible=false;continue;}transfer.clearance=Math.max(transfer.clearance,head.y-.018+underside*scale+.08,transfer.from.y+.06,goal.y+.06);
    // Only the new-species path preserves actor XZ while its authored carry support
    // offset changes. Legacy five and all lowering retain the exact existing path.
    const point=!isLegacySpecies(a.species)&&transfer.kind==='lift'?alpacaLiftSupportPoint({fromSupport:transfer.from,fromRoot:transfer.fromRoot,goalSupport:goal,currentSupportOffset:support.clone().sub(v.art.root.position),clearanceY:transfer.clearance,elapsedMs:now-transfer.at}):animalTransferPoint(transfer.from,goal,transfer.clearance,now-transfer.at);this.placeSupport(v,new THREE.Vector3(point.x,point.y,point.z));
    this.playerPose?.braceCarry(transfer.kind==='lift'?smooth(transferProgress/.4):1-smooth((transferProgress-.6)/.4));if(transferProgress>=1)delete v.transfer;
   }else if(carried){this.playerPose?.braceCarry();this.placeSupport(v,this.carryPoint());}
   v.label.style.display='none';v.label.textContent='';
  }
  const eggHint=eggHabitatHint({...this.state,player:toGrid(this.playerRoot.position)},this.selected?.kind==='egg'?this.selected.id:null,2);
  for(const egg of this.state.eggs){const v=this.eggs.get(egg.id);if(!v||!egg.position)continue;const status=eggIncubationStatus(this.state,egg),duration=Math.max(1,egg.incubation?.requiredMs??((egg.readyAt??0)-(egg.placedAt??0))),progress=Math.min(1,Math.max(0,1-status.remainingMs/duration));v.art.update(progress,now/1000);v.label.textContent=eggHint?.eggId===egg.id?eggHint.text:status.paused?'':status.ready?'要出来啦！点一下':`${Math.ceil(status.remainingMs/1000)} 秒`;if(v.label.textContent)this.projectedLabel(v.label,v.art.root.position,1.15);else v.label.style.display='none';}
  if(this.activeAction&&now-this.activeAction.at<this.activeAction.duration){const act=this.activeAction,a=act.animalId?this.animals.get(act.animalId):undefined;const root=a?.art.root??(act.animalId?this.creativeScene.rootForAsset(act.animalId):undefined);if(root&&(act.kind==='feed'||act.kind==='pet')&&!this.state.carriedAnimalId){const dir=root.position.clone().sub(this.playerRoot.position);const yaw=Math.atan2(dir.x,dir.z);this.playerRoot.rotation.y+=Math.atan2(Math.sin(yaw-this.playerRoot.rotation.y),Math.cos(yaw-this.playerRoot.rotation.y))*(1-Math.exp(-dt*9));if(act.kind==='pet')this.playerRig?.greet(greetingPoseAt(now-act.at));else this.playerRig?.feed(feedingPoseAt(now-act.at,'feed'),a?a.art.mouth.getWorldPosition(new THREE.Vector3()):root.position.clone().add(new THREE.Vector3(0,.4*root.scale.y,0)));this.feedProp.visible=act.kind==='feed'&&now-act.at>400&&now-act.at<2000;}}else{this.activeAction=null;this.feedProp.visible=false;}
  this.updateGuardian(dt,now);this.updateBursts(now);for(const effect of this.saleEffects)if(effect.update(now))this.saleEffects.delete(effect);
 }
 /** Terrain edits must never leave the autonomous companion walking through new deep water. */
 private repairGuardianRoute(){
  if(!MINIMAL_DEFENSE_ENABLED)return;
  const from=toGrid(this.guardRoot.position),safe=this.state.tiles.filter(t=>isWalkableTile(this.state,t));
  if(!safe.length)return;
  if(!isWalkableTile(this.state,from)){
   // A tile changed underneath this visual-only actor: relocate at edit time, not through water.
   const nearest=safe.sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z))[0];
   this.guardRoot.position.copy(toWorld(nearest));this.guardPath=[];this.guardTarget.copy(this.guardRoot.position);this.guardNextAt=0;this.wolfStamp=0;return;
  }
  if(!isWalkableTile(this.state,toGrid(this.guardTarget))||this.guardPath.some(p=>!isWalkableTile(this.state,toGrid(p)))){
   const goal=this.guardPath.at(-1)??this.guardTarget;
   this.guardPath=isWalkableTile(this.state,toGrid(goal))?(continuousRoute(this.state,from,toGrid(goal))??[]).map(toWorld):[];
   this.guardTarget.copy(this.guardPath[0]??this.guardRoot.position);this.guardNextAt=0;this.wolfStamp=0;
  }
 }
 private updateGuardian(dt:number,now:number){if(!MINIMAL_DEFENSE_ENABLED||!this.guardian)return;const event=this.state.wolfEvent;if(event){if(this.wolfStamp!==event.startedAt){this.wolfStamp=event.startedAt;const owned=this.state.tiles.filter(t=>isWalkableTile(this.state,t)),north=Math.min(...owned.map(t=>t.z)),front=owned.filter(t=>t.z===north).sort((a,b)=>Math.abs(a.x-2.5)-Math.abs(b.x-2.5))[0];this.wolfFront={x:front.x,z:north};this.guardPath=(continuousRoute(this.state,toGrid(this.guardRoot.position),front)??[]).map(toWorld);this.wolves.forEach((w,i)=>{w.root.position.copy(toWorld({x:this.wolfFront.x-.8+i*1.6,z:this.wolfFront.z-2.4}));w.distance=0;});}const age=(this.now()-event.startedAt)/1000,ending=Math.max(0,(this.now()-(event.endsAt-3500))/3500);this.guardTarget.copy(this.guardPath[0]??toWorld(this.wolfFront));this.wolves.forEach((w,i)=>{w.root.visible=true;const entry=toWorld({x:this.wolfFront.x-.8+i*1.6,z:this.wolfFront.z-2.4}),edge=toWorld({x:this.wolfFront.x-.8+i*1.6,z:this.wolfFront.z-.7}),progress=smooth(age/4)*(1-smooth(ending)),desired=entry.clone().lerp(edge,progress),delta=this.move(w.root,desired,dt,2.1);w.distance+=delta;w.head.rotation.y=delta<.001?Math.sin(now/1800+i)*.16:0;w.legs.forEach((leg,j)=>leg.rotation.x=Math.sin(w.distance/.6*Math.PI*2+(j%2?Math.PI:0))*.4*(delta>0?1:0));});}
  else{this.wolves.forEach(w=>w.root.visible=false);if(now>this.guardNextAt&&!this.guardPath.length){this.guardNextAt=now+6500;const tiles=this.state.tiles.filter(t=>isWalkableTile(this.state,t));const index=Math.floor(now/6500)%tiles.length;this.guardPath=(continuousRoute(this.state,toGrid(this.guardRoot.position),tiles[index]??SHOP_APPROACH)??[]).map(toWorld);}if(this.guardPath[0])this.guardTarget.copy(this.guardPath[0]);}if(this.state.staticObstacles?.length&&!staticObstacleSegmentSafe(this.state,toGrid(this.guardRoot.position),toGrid(this.guardTarget))){this.guardPath=[];this.guardTarget.copy(this.guardRoot.position);this.guardNextAt=0;this.wolfStamp=0;}const step=this.move(this.guardRoot,this.guardTarget,dt,event?1.9:.85);if(this.guardPath.length&&Math.hypot(this.guardRoot.position.x-this.guardPath[0].x,this.guardRoot.position.z-this.guardPath[0].z)<.04)this.guardPath.shift();this.guardRoot.position.y=THREE.MathUtils.lerp(this.guardRoot.position.y,this.groundHeight(this.guardRoot.position),1-Math.exp(-dt*10));this.guardTravelled+=step;this.guardian.root.position.y=0;this.guardian.update(now/500,'dance',step<.001,.12,this.locomotion(this.guardRoot,step/dt,this.guardTravelled));if(event&&step<.01)this.guardianRig?.guardian(guardianPoseAt(this.state.guardian,'protect',(this.now()-event.startedAt)/1000));this.guardianPose?.ground(p=>this.groundHeight(p));}
 private animate=(now:number)=>{if(this.disposed||!this.playerMotionVisible)return;if(this.terrainReadiness.status.phase!=='ready'||this.isContextLost()){this.previous=now;this.renderTerrainFrame();this.frame=requestAnimationFrame(this.animate);return;}const dt=Math.min(.25,Math.max(.001,(now-(this.previous||now-16))/1000));this.previous=now;if(this.invalidUntil&&now>this.invalidUntil){this.invalidUntil=0;this.marker.visible=false;(this.marker.material as THREE.MeshBasicMaterial).color.set('#FFF7D8');}this.updateActors(dt,now);this.showcase?.tick(dt);if(this.showcase?.carriedId())this.playerPose?.braceCarry();this.updateCreativeView(dt);this.updateEnvironment(now);if(!this.reduced)this.creativeScene.tick(now/1000);const player=this.playerRoot.position,nearby=this.state.tiles.filter(t=>t.owned&&toWorld(t).distanceTo(player)<=5),bias=new THREE.Vector3();if(nearby.length){const xs=nearby.map(t=>toWorld(t).x),zs=nearby.map(t=>toWorld(t).z);bias.set(((Math.min(...xs)+Math.max(...xs))/2-player.x)*.45,0,((Math.min(...zs)+Math.max(...zs))/2-player.z)*.45);bias.clampLength(0,1.3);}const follow=this.interiorFollowAnchor?.clone()??(this.inspectionPoint?toWorld(this.inspectionPoint):player.clone().add(bias));follow.y=.75;if(this.hatchFocus){const age=now-this.hatchFocus.at;if(age>=HATCH_DURATION_MS)this.hatchFocus=null;}const translation=follow.sub(this.controls.target).multiplyScalar(1-Math.exp(-dt*5));this.controls.target.add(translation);this.camera.position.add(translation);this.controls.update();this.weather.update(deriveWeather(this.now(),this.weatherPreferences),dt,now/1000,this.playerRoot.position);this.renderTerrainFrame();this.frame=requestAnimationFrame(this.animate);};
 dispose(){if(this.disposed)return;this.disposed=true;this.showcase?.dispose();this.showcase=undefined;this.visitorScenery?.dispose();this.visitorScenery=undefined;if(this.terrainReadiness.status.phase!=='error')this.terrainReadiness.dispose();if(this.renderer.debug?.onShaderError===this.onTerrainShaderError){this.renderer.debug.onShaderError=this.previousShaderError;this.renderer.debug.checkShaderErrors=this.previousShaderChecks;}this.environmentScene.dispose();this.creativeScene.dispose();this.terrainGround?.dispose();this.terrainGround=undefined;this.terrainPreviewCache?.dispose();this.terrainAccentCache.dispose();for(const effect of this.saleEffects)effect.dispose();this.saleEffects.clear();this.eggModelPreloader.dispose();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();const c=this.renderer.domElement;c.removeEventListener('webglcontextlost',this.onTerrainContextReset);c.removeEventListener('webglcontextrestored',this.onTerrainContextReset);c.removeEventListener('pointerdown',this.onPointerDown);c.removeEventListener('pointermove',this.onPointerMove);c.removeEventListener('pointerup',this.onPointerUp);c.removeEventListener('pointercancel',this.onPointerCancel);c.removeEventListener('pointermove',this.onHoverCapture,true);c.removeEventListener('click',this.onClick);c.removeEventListener('pointerleave',this.clearHover);window.removeEventListener('blur',this.onWindowBlur);this.controls.removeEventListener('start',this.onOrbitStart);this.controls.dispose();disposeTree(this.feedProp);this.feedProp.clear();this.feedProp.removeFromParent();this.player.dispose();this.guardian?.dispose();for(const a of this.animals.values()){a.art.dispose();a.label.remove();}for(const e of this.eggs.values()){e.art.dispose();e.label.remove();}this.weather.dispose();disposeTree(this.scene);this.renderer.dispose();c.remove();}
}
