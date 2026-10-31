import * as THREE from 'three/webgpu';
import {GaussianSplat} from 'three/addons/objects/GaussianSplat.js';
import {createClubAvatar,type ClubAvatar} from '../avatars/club-avatar-rig.ts';
import {FarmAvatarPose,farmLocomotion} from './avatar-pose.ts';
import {PyramidInteriorMotion,pyramidFloorHeight,pyramidThirdPersonCamera} from './pyramid-interior-motion.ts';
import {loadPyramidGeometry} from './pyramid-interior-asset.ts';
export type PyramidInput='forward'|'backward'|'left'|'right'|'turnLeft'|'turnRight';
export type PyramidSnapshot={phase:'loading'|'ready'|'failed';progress:number;message?:string};
type Renderer=Pick<THREE.WebGPURenderer,'domElement'|'init'|'setSize'|'setPixelRatio'|'render'|'dispose'>;
type Options={createRenderer?:()=>Renderer;loadGeometry?:typeof loadPyramidGeometry;createPlayer?:()=>ClubAvatar};
const keys:Record<string,PyramidInput>={KeyW:'forward',KeyS:'backward',KeyA:'left',KeyD:'right',ArrowUp:'forward',ArrowDown:'backward',ArrowLeft:'turnLeft',ArrowRight:'turnRight'};
/** A separately owned third-person LX visit; never reads or writes farm state or audio. */
export class PyramidInteriorWorld{
 readonly ready:Promise<void>;private readonly host:HTMLElement;private readonly changed:(value:PyramidSnapshot)=>void;private readonly renderer:Renderer;
 private readonly scene=new THREE.Scene();private readonly camera=new THREE.PerspectiveCamera(80,1,.04,70);private readonly motion=new PyramidInteriorMotion();private readonly inputs=new Set<PyramidInput>();private readonly abort=new AbortController();private readonly resizeObserver:ResizeObserver;
 private player:ClubAvatar|undefined;private readonly playerRoot=new THREE.Group();private playerPose:FarmAvatarPose|undefined;private elapsed=0;private distance=0;
 private status:PyramidSnapshot={phase:'loading',progress:0};private splat:GaussianSplat|undefined;private source:THREE.BufferGeometry|undefined;private disposed=false;private initialized=false;private released=false;private frame=0;private previous=0;private focused=true;private dragging:{id:number;x:number;y:number}|null=null;
 constructor(host:HTMLElement,changed:(value:PyramidSnapshot)=>void,options:Options={}){
  this.host=host;this.changed=changed;this.renderer=options.createRenderer?.()??new THREE.WebGPURenderer({forceWebGL:true,antialias:false,alpha:false,powerPreference:'low-power'});
  this.scene.background=new THREE.Color('#211a13');this.camera.rotation.order='YXZ';this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));const c=this.renderer.domElement;c.tabIndex=0;c.setAttribute('aria-label','金字塔内部第三人称漫游，控制LX用WASD移动，方向键转向，拖动环顾');host.appendChild(c);
  c.addEventListener('keydown',this.keyDown);c.addEventListener('keyup',this.keyUp);c.addEventListener('blur',this.stop);c.addEventListener('pointerdown',this.pointerDown);c.addEventListener('pointermove',this.pointerMove);c.addEventListener('pointerup',this.pointerEnd);c.addEventListener('pointercancel',this.pointerEnd);c.addEventListener('lostpointercapture',this.pointerEnd);c.addEventListener('webglcontextlost',this.contextLost);window.addEventListener('blur',this.blur);window.addEventListener('focus',this.focus);document.addEventListener('visibilitychange',this.visibility);
  this.resizeObserver=new ResizeObserver(this.resize);this.resizeObserver.observe(host);this.resize();this.ready=this.load(options);
 }
 snapshot(){return {...this.status};}pose(){return this.motion.snapshot();}
 private emit(value:PyramidSnapshot){if(this.disposed)return;this.status=value;this.changed(this.snapshot());}
 private async load(options:Options){try{await this.renderer.init();this.initialized=true;if(this.disposed){this.release();return;}
  this.player=options.createPlayer?.()??createClubAvatar('human-lx','minimal-player');this.player.root.scale.setScalar(.65);this.playerRoot.add(this.player.root);this.playerRoot.name='pyramid-local-LX';this.playerRoot.rotation.y=Math.PI/2;this.scene.add(this.playerRoot,new THREE.HemisphereLight('#fff1d6','#735744',2),new THREE.DirectionalLight('#ffe4b9',1.5));
  const avatarReady=this.player.ready.then(()=>true,()=>false);
  const source=await(options.loadGeometry??loadPyramidGeometry)(this.abort.signal,progress=>this.emit({phase:'loading',progress:progress*.95}));if(this.disposed||this.abort.signal.aborted){source.dispose();return;}this.source=source;
  const loaded=await avatarReady;if(this.disposed||this.abort.signal.aborted)return;if(!loaded||!this.player.loaded)throw new Error('LX player model unavailable');
  this.player.update(0,'dance',true,0,farmLocomotion(this.playerRoot,0,0));this.playerPose=new FarmAvatarPose(this.player.root);
  this.splat=new GaussianSplat(source);this.splat.rotation.x=Math.PI;this.scene.add(this.splat);this.updatePlayer(0,0);this.syncCamera();this.renderer.render(this.scene,this.camera);this.emit({phase:'ready',progress:1});this.previous=0;this.frame=requestAnimationFrame(this.animate);
 }catch(error){if(!this.disposed){this.stop();this.emit({phase:'failed',progress:0,message:error instanceof Error?error.message:'Interior unavailable'});}}finally{if(this.disposed&&this.initialized)this.release();}}

 setInput(input:PyramidInput,pressed:boolean){if(this.disposed||this.status.phase!=='ready'||!this.focused||document.hidden)return;if(pressed)this.inputs.add(input);else this.inputs.delete(input);}
 nudge(input:PyramidInput){this.setInput(input,true);this.advance(.1);this.setInput(input,false);}
 reset(){if(this.disposed||this.status.phase!=='ready')return;this.stop();this.motion.reset();this.playerRoot.rotation.y=Math.PI/2;this.updatePlayer(0,0);this.syncCamera();}
 advance(dt:number){if(this.disposed||this.status.phase!=='ready'||!this.focused||document.hidden)return;const value=(a:PyramidInput,b:PyramidInput)=>Number(this.inputs.has(a))-Number(this.inputs.has(b)),before=this.motion.snapshot();this.motion.move(value('forward','backward'),value('right','left'),dt);if(Number.isFinite(dt)&&dt>0&&dt<=.1)this.motion.look(value('turnLeft','turnRight')*dt*1.35,0);const after=this.motion.snapshot(),travel=Math.hypot(after.x-before.x,after.z-before.z);if(travel>1e-8)this.playerRoot.rotation.y=Math.atan2(after.x-before.x,after.z-before.z);this.distance+=travel;this.updatePlayer(dt,travel);this.syncCamera();}
 private updatePlayer(dt:number,travel:number){const p=this.motion.snapshot();this.playerRoot.position.set(p.x,pyramidFloorHeight(p.x),p.z);if(!this.player?.loaded)return;if(Number.isFinite(dt)&&dt>0&&dt<=.1)this.elapsed+=dt;const speed=dt>0&&dt<=.1?travel/dt:0;this.player.root.position.y=0;this.player.update(this.elapsed,'dance',speed<.02,.08,farmLocomotion(this.playerRoot,speed,this.distance));this.playerPose?.ground(v=>pyramidFloorHeight(v.x));}
 private syncCamera(){const c=pyramidThirdPersonCamera(this.motion.snapshot());this.camera.position.set(c.x,c.y,c.z);this.camera.lookAt(c.target.x,c.target.y,c.target.z);}

 private animate=(now:number)=>{if(this.disposed)return;const dt=this.previous?Math.min(.1,(now-this.previous)/1000):0;this.previous=now;if(this.focused&&!document.hidden&&this.status.phase==='ready'){this.advance(dt);try{this.renderer.render(this.scene,this.camera);}catch{this.stop();this.emit({phase:'failed',progress:0,message:'当前设备的3D渲染中断，请重试或返回'});return;}}this.frame=requestAnimationFrame(this.animate);};
 private resize=()=>{if(this.disposed)return;const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);};
 private stop=()=>{this.inputs.clear();this.dragging=null;this.previous=0;};
 private blur=()=>{this.focused=false;this.stop();};private focus=()=>{this.focused=true;this.stop();};private visibility=()=>{this.stop();};
 private keyDown=(event:KeyboardEvent)=>{const input=keys[event.code];if(input){event.preventDefault();this.setInput(input,true);}};private keyUp=(event:KeyboardEvent)=>{const input=keys[event.code];if(input){event.preventDefault();this.setInput(input,false);}};
 private pointerDown=(event:PointerEvent)=>{if(this.status.phase!=='ready'||event.button!==0||this.dragging)return;event.preventDefault();this.renderer.domElement.focus({preventScroll:true});this.dragging={id:event.pointerId,x:event.clientX,y:event.clientY};this.renderer.domElement.setPointerCapture?.(event.pointerId);};
 private pointerMove=(event:PointerEvent)=>{const d=this.dragging;if(!d||d.id!==event.pointerId)return;this.motion.look(-(event.clientX-d.x)*.004,-(event.clientY-d.y)*.004);d.x=event.clientX;d.y=event.clientY;this.syncCamera();};
 private pointerEnd=(event:PointerEvent)=>{if(this.dragging?.id!==event.pointerId)return;this.dragging=null;if(this.renderer.domElement.hasPointerCapture?.(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);};
 private contextLost=(event:Event)=>{event.preventDefault();this.abort.abort();this.stop();cancelAnimationFrame(this.frame);this.emit({phase:'failed',progress:0,message:'3D画面已中断，请重试或返回庭院'});};
 private release(){if(this.released)return;this.released=true;this.splat?.removeFromParent();this.splat?.geometry.dispose();this.splat?.material.dispose();this.source?.dispose();this.splat=undefined;this.source=undefined;this.scene.clear();this.renderer.dispose();}
 dispose(){if(this.disposed)return;this.disposed=true;this.abort.abort();this.player?.dispose();this.playerRoot.clear();this.stop();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();const c=this.renderer.domElement;c.removeEventListener('keydown',this.keyDown);c.removeEventListener('keyup',this.keyUp);c.removeEventListener('blur',this.stop);c.removeEventListener('pointerdown',this.pointerDown);c.removeEventListener('pointermove',this.pointerMove);c.removeEventListener('pointerup',this.pointerEnd);c.removeEventListener('pointercancel',this.pointerEnd);c.removeEventListener('lostpointercapture',this.pointerEnd);c.removeEventListener('webglcontextlost',this.contextLost);window.removeEventListener('blur',this.blur);window.removeEventListener('focus',this.focus);document.removeEventListener('visibilitychange',this.visibility);c.remove();if(this.initialized)this.release();}
}
