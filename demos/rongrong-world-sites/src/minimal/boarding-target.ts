import type {BoardingParent,BoardingStatus} from './boarding-contract.ts';
/** A sample is never an account UID and must never reach boarding-command. */
export type BoardingTarget={kind:'real';uid:string}|{kind:'sample';sampleId:string};
export type SampleBoardingSnapshot={mode:'sample';sampleId:string;nonTransferable:true;status:BoardingStatus|'idle';parents:BoardingParent[];demoEggs:number;demoCoins:number;readyAt?:number;message:string};
/** Local/sample-space-only demonstrations cannot expose a canonical farm/result.
 * Implementations keep all sample animals, eggs and rewards outside real saves.
 * No sampleId -> uid conversion, profile lookup, or production API invocation. */
export interface SampleBoardingAdapter{
 readonly kind:'sample';
 read(sampleId:string):Promise<SampleBoardingSnapshot>;
 invite(input:{sampleId:string;parentId:string;requestId:string}):Promise<SampleBoardingSnapshot>;
 confirm(input:{sampleId:string;partnerId:string;requestId:string}):Promise<SampleBoardingSnapshot>;
 cancel(input:{sampleId:string;requestId:string}):Promise<SampleBoardingSnapshot>;
}
