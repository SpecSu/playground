import * as THREE from 'three';
import type {MarineRarity} from './fishing-catalog.ts';

export type CelebratedFishingRarity = 'rare'|'epic'|'legendary';
export const FISHING_CONFETTI_DURATION_MS = 2600;
// Visual verification is complete. Production celebrates actual rarity only.
// The explicit constructor override is retained solely for isolated test fixtures.
export const TEST_FIRST_THREE_CONFETTI = false;
const TEST_SEQUENCE:readonly CelebratedFishingRarity[]=['rare','epic','legendary'];
type Observation={ownerId:string|null;catchId?:string;rarity?:MarineRarity;closeup:boolean;visible:boolean;reducedMotion:boolean};
/** A visual-only gate: a cold held catch is baseline, never a new celebration. */
export class FishingCatchCelebration {
 private readonly testFirstThree:boolean;
 private freshCatches=0;
 constructor(testFirstThree:boolean=TEST_FIRST_THREE_CONFETTI){this.testFirstThree=testFirstThree;}
 private ownerId:string|null|undefined;
 private observed=false;
 private lastCatchId:string|undefined;
 private seen=new Set<string>();
 private pending:{id:string;rarity:CelebratedFishingRarity;at:number}|null=null;
 interrupt(){this.pending=null;}
 sample(input:Observation,time:number):CelebratedFishingRarity|null {
  if(!this.observed||input.ownerId!==this.ownerId){
   this.observed=true;this.ownerId=input.ownerId;this.lastCatchId=input.catchId;this.pending=null;
   if(input.catchId)this.seen.add(input.catchId);
   return null;
  }
  if(input.catchId!==this.lastCatchId){
   this.lastCatchId=input.catchId;this.pending=null;
   if(input.catchId&&!this.seen.has(input.catchId)){
    this.seen.add(input.catchId);
    if(this.seen.size>64)this.seen.delete(this.seen.values().next().value!);
    if(input.ownerId){
     const rarity=this.testFirstThree&&this.freshCatches<3?TEST_SEQUENCE[this.freshCatches]:input.rarity;
     this.freshCatches++;
     if(rarity==='rare'||rarity==='epic'||rarity==='legendary')this.pending={id:input.catchId,rarity,at:time};
    }
   }
  }
  if(!input.visible||input.reducedMotion||!input.ownerId){this.interrupt();return null;}
  if(this.pending&&time-this.pending.at>5000)this.interrupt();
  if(this.pending&&input.closeup){const rarity=this.pending.rarity;this.pending=null;return rarity;}
  return null;
 }
}
const MACARON_PALETTE=['#ff9baa','#ffe5a3','#a8d8ff'] as const;
const TIERS={rare:36,epic:54,legendary:72} as const;
/** One fixed-capacity draw call attached to the existing camera, no RAF or timers.
 * Stratified full-screen paper stays sparse around the fish; DOM HUD stays above it. */
export function createFishingConfetti(camera:THREE.PerspectiveCamera){
 const geometry=new THREE.PlaneGeometry(1,1);
 const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.96,depthTest:false,depthWrite:false,toneMapped:false});
 const mesh=new THREE.InstancedMesh(geometry,material,72);mesh.name='Rare catch paper celebration';mesh.frustumCulled=false;mesh.renderOrder=1000;mesh.count=0;mesh.visible=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);camera.add(mesh);
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 // Deterministic, preallocated variation avoids frame-time randomness or allocation.
 const seeds=Array.from({length:72},(_,i)=>{
  // Permuting a 9×8 grid makes every prefix tier span the whole screen.
  const cell=i*37%72,u=(i*.61803398875)%1,v=(i*.41421356237)%1;
  return {x:-.88+(cell%9)*.22+(u-.5)*.07,y:-.78+Math.floor(cell/9)*.33+(v-.5)*.26,
   u,v,spin:(i*1.731)%6.28,speed:.64+u*.16,delay:(i%6)*28};
 });
 let startedAt=0,disposed=false;
 const stop=()=>{mesh.visible=false;mesh.count=0;};
 return {mesh,
  start(rarity:CelebratedFishingRarity,time:number){
   if(disposed)return;const tier=TIERS[rarity];startedAt=time;mesh.count=tier;mesh.visible=true;
   for(let i=0;i<mesh.count;i++)mesh.setColorAt(i,color.set(MACARON_PALETTE[i%MACARON_PALETTE.length]));
   if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  },
  update(time:number,width=390,height=758){
   if(disposed||!mesh.visible)return;const elapsed=Math.max(0,time-startedAt),progress=elapsed/FISHING_CONFETTI_DURATION_MS;
   if(progress>=1){stop();return;}
   material.opacity=.96*Math.min(1,elapsed/140)*Math.min(1,(1-progress)/.25);
   const p=camera.projectionMatrix.elements,depth=2;
   for(let i=0;i<mesh.count;i++){
    const seed=seeds[i],age=Math.max(0,elapsed-seed.delay),phase=age*.0018+seed.spin;
    const x=seed.x+Math.sin(phase)*.028,y=seed.y-age/FISHING_CONFETTI_DURATION_MS*seed.speed;
    dummy.position.set((x+p[8])*depth/p[0],(y+p[9])*depth/p[5],-depth);
    dummy.rotation.set(Math.sin(phase*1.7)*.4,Math.sin(phase*.8)*.5,seed.spin+Math.sin(phase)*.7);
    const entrance=Math.min(1,age/120);
    dummy.scale.set((3.6+seed.u*1.2)*entrance*2/width*depth/p[0],(8+seed.v*3)*entrance*2/height*depth/p[5],1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   }
   mesh.instanceMatrix.needsUpdate=true;
  },stop,
  dispose(){if(disposed)return;disposed=true;stop();camera.remove(mesh);geometry.dispose();material.dispose();mesh.dispose();},
 };
}
