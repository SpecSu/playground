/** TEST ONLY: old procedural donor bytes exercise interfaces, never new artwork. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HUNYUAN_DESCRIPTORS,HUNYUAN_ASSET_CHECKS,HUNYUAN_RUNTIME_CHECKS,type HunyuanPromotionEvidence,type HunyuanPromotionTarget} from '../src/minimal/hunyuan-promotion.ts';
import type {AlpacaMeasuredProfile} from '../src/minimal/hunyuan-alpaca-contract.ts';
export const ALPACA_TEST_TARGET:HunyuanPromotionTarget={kind:'local',id:'http://localhost:5190',runtimeRevision:'TEST-ONLY-donor-runtime'};
export const oldAlpacaDonorBytes=()=>new Uint8Array(readFileSync(new URL('../public/models/animation-lab/alpaca.glb',import.meta.url)));
export function alpacaFixtureDeployment(bytes=oldAlpacaDonorBytes()){
 const candidate=createHash('sha256').update(bytes).digest('hex'),source='2'.repeat(64),descriptor=HUNYUAN_DESCRIPTORS.alpaca;
 const report=(name:string)=>({status:'passed' as const,candidateSha256:candidate,sourceSha256:source,reportRef:`TEST-ONLY/${name}`});
 const profile:AlpacaMeasuredProfile={candidateSha256:candidate,motion:{stride:.52,muzzleReach:.8,cyclesPerSecond:1/1.4,feet:{side:.3,front:.4,back:.4},walkFeet:{side:.35,front:.6,back:.6},walkContactFeet:{side:.3,front:.5,back:.5},reachAdjustment:{back:.1,forward:.05,pondForward:.05}},drinkDatum:{x:0,y:.045,z:.8},height:1.8,interactionRadius:1,transferUnderside:.5};
 const evidence:HunyuanPromotionEvidence={schema:1,variant:'hunyuan:alpaca',species:'alpaca',source:{kind:'hunyuan-download',species:'alpaca',originalSha256:'1'.repeat(64),reducedSha256:source,identityConfirmed:true,identityReportRef:'TEST-ONLY/fake-provenance',reductionReportRef:'TEST-ONLY/fake-reduction'},
  artifact:{sha256:candidate,bytes:bytes.length,triangles:18000,bones:64,draws:12,maxTextureDimension:1024},
  rig:{clips:[...descriptor.clips],anchors:[...descriptor.anchors],neckChain:[...descriptor.neckChain],footChains:descriptor.footChains.map(c=>({...c})),rigidSoleVertices:Object.fromEntries(descriptor.footChains.map(c=>[c.foot,3])),skinnedMeshes:1,unskinnedMeshes:0,maxInfluences:4,normalizedWeights:true},
  checks:Object.fromEntries(HUNYUAN_ASSET_CHECKS.map(check=>[check,report(check)])) as HunyuanPromotionEvidence['checks'],
  targets:[{...ALPACA_TEST_TARGET,materializedPath:'/TEST-ONLY/alpaca.glb',assetUrl:`/models/farm/hunyuan/alpaca-${candidate}.glb`,observedSha256:candidate,observedBytes:bytes.length,verificationRef:'TEST-ONLY/bytes',checks:Object.fromEntries(HUNYUAN_RUNTIME_CHECKS.map(check=>[check,{...report(check),runtimeRevision:ALPACA_TEST_TARGET.runtimeRevision}])) as HunyuanPromotionEvidence['targets'][number]['checks']}],
 };
 return {target:{...ALPACA_TEST_TARGET},manifest:{'hunyuan:alpaca':evidence},profile};
}
