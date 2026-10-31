import * as THREE from 'three';
import {LunarShowcaseAssetLibrary,type LunarAssetInstance} from './lunar-showcase-assets.ts';
import {PlaygroundFormation} from './playground-formation.ts';
import {SCHOOL_PLAYGROUND_LAYOUT as L} from './playground-layout.ts';
import {validatePlaygroundRun,type PlaygroundRunSpec} from './playground-run-contract.ts';
type Runner={root:THREE.Group;instance:LunarAssetInstance;mixer:THREE.AnimationMixer;action:THREE.AnimationAction};
export type PlaygroundSnapshot=Readonly<{status:'loading'|'ready'|'failed'|'disposed';paused:boolean;blocked:boolean;selectedId:string|null;count:number;message:string}>;
/** One temporary presentation realm. Eight independent skeletons, one source
 * template. There is deliberately no MinimalState/UID/storage/command service. */
export class PlaygroundScene{
 readonly root=new THREE.Group();readonly ready:Promise<void>;
 private readonly library:LunarShowcaseAssetLibrary;private readonly run:PlaygroundRunSpec;private readonly formation:PlaygroundFormation;private readonly changed:()=>void;
 private actors:Runner[]=[];private status:PlaygroundSnapshot['status']='loading';private userPaused=false;private blocked=false;private selectedId:string|null=null;private disposed=false;
 constructor(parent:THREE.Object3D,library:LunarShowcaseAssetLibrary,run:PlaygroundRunSpec,changed=()=>{}){
  this.library=library;this.changed=changed;const record=library.catalog().find(r=>r.id===L.group.templateId);
  try{if(!record)throw new Error('No admitted school template');this.run=validatePlaygroundRun(record,run);if(!record.profile.actions.some(a=>a.id==='playground-run'&&a.clip==='run'&&Math.abs(a.duration-run.duration)<1e-7))throw new Error('Run clip has not been admitted');}catch(error){library.dispose();throw error;}
  this.formation=new PlaygroundFormation(this.run);this.root.name='school-running-group';parent.add(this.root);this.ready=this.load();
 }
 private async load(){
  const loaded=await Promise.allSettled(Array.from({length:L.group.count},()=>this.library.instantiate(L.group.templateId)));
  const instances=loaded.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  if(this.disposed||instances.length!==L.group.count){instances.forEach(v=>v.release());if(!this.disposed){this.status='failed';this.changed();}return;}
  try{for(const [i,instance]of instances.entries()){
   const clip=instance.animations.find(c=>c.name===this.run.clip);if(!clip||Math.abs(clip.duration-this.run.duration)>.005)throw new Error('Reviewed run clip missing');
   const root=new THREE.Group();root.name=`school-runner-${i+1}`;root.userData.playgroundRunner=root.name;instance.scene.scale.setScalar(instance.definition.profile.normalizationScale);instance.scene.rotation.y=instance.definition.profile.facingYaw;root.add(instance.scene);this.root.add(root);
   const mixer=new THREE.AnimationMixer(instance.scene),action=mixer.clipAction(clip);action.setLoop(THREE.LoopRepeat,Infinity).play();this.actors.push({root,instance,mixer,action});
  }this.pose();this.status='ready';this.changed();}
  catch{for(const a of this.actors){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.instance.scene);}this.actors=[];instances.forEach(v=>v.release());this.root.clear();this.status='failed';this.changed();}
 }
 private pose(){const frames=this.formation.snapshot();for(const [i,a]of this.actors.entries()){const frame=frames[i];a.root.position.set(frame.x,L.track.surfaceY+this.run.groundOffset,frame.z);a.root.rotation.y=frame.heading;a.action.time=frame.runTime%this.run.duration;a.mixer.update(0);a.root.updateMatrixWorld(true);}}
 clearSelection(){if(this.selectedId){this.selectedId=null;this.changed();}}
 frames(){return this.formation.snapshot();}
 preview(dt:number){return this.status==='ready'&&!this.userPaused&&!this.blocked?this.formation.preview(dt):this.frames();}
 snapshot():PlaygroundSnapshot{return Object.freeze({status:this.status,paused:this.userPaused,blocked:this.blocked,selectedId:this.selectedId,count:this.status==='ready'?this.actors.length:0,message:this.status==='failed'?'跑步模型暂未就绪 · 未用旧动作代替':this.status==='loading'?'正在准备八人跑队…':'同一豆包模板的八个示例 · 不是真人账号'});}
 command(input:unknown):{accepted:boolean;message:string}{
  if(this.disposed||this.status!=='ready')return {accepted:false,message:'跑队还没准备好'};const c=input as {type?:string;instanceId?:string};
  if(c?.type==='select'&&this.actors.some(a=>a.root.name===c.instanceId)){this.selectedId=c.instanceId!;this.changed();return {accepted:true,message:'已选中伙伴 · 不支持举起或带走'};}
  if(c?.type==='pause'||c?.type==='resume'){this.userPaused=c.type==='pause';this.formation.setPaused(this.userPaused||this.blocked);this.changed();return {accepted:true,message:this.userPaused?'全队已暂停':'全队继续跑步'};}
  return {accepted:false,message:'跑队不能举起、交易或寄养'};
 }
 setBlocked(blocked:boolean){if(this.disposed)return;this.blocked=blocked;this.formation.setPaused(blocked||this.userPaused);this.changed();}
 tick(deltaSeconds:number){if(this.disposed||this.status!=='ready'||this.userPaused||this.blocked||!Number.isFinite(deltaSeconds)||deltaSeconds<=0||deltaSeconds>.25)return;this.formation.tick(deltaSeconds);this.pose();}
 dispose(){if(this.disposed)return;this.disposed=true;this.status='disposed';this.formation.dispose();for(const a of this.actors){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.instance.scene);a.instance.release();}this.actors=[];this.root.clear();this.root.removeFromParent();this.library.dispose();}
}
