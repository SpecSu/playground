import deploymentSource from './hunyuan-penguin-deployment.json' with {type:'json'};
import {AlpacaProviderRegistry,actualAlpacaTarget} from './alpaca-provider.ts';
import type {AlpacaRuntimeProvider} from './alpaca-provider.ts';
import type {AlpacaMeasuredProfile} from './hunyuan-alpaca-contract.ts';

/** Independently compiled consumer revision; never read it from a receipt. */
export const PENGUIN_RUNTIME_REVISION='farm-penguin-main-v28-contract-4';
export type PenguinMeasuredProfile=AlpacaMeasuredProfile;
export type PenguinRuntimeProvider=AlpacaRuntimeProvider<'penguin'>;
export class PenguinProviderRegistry extends AlpacaProviderRegistry<'penguin'>{constructor(){super('penguin');}}
export const penguinProvider=new PenguinProviderRegistry();
export function configuredPenguinTarget(origin:unknown){return actualAlpacaTarget(origin,PENGUIN_RUNTIME_REVISION);}
/** Missing resources are a no-fetch no-op, not a lab/provider fallback. */
export function prepareConfiguredPenguinProvider(options:{retry?:boolean}={}):Promise<boolean>{
 const deployment:unknown=deploymentSource;
 if(deployment===null)return penguinProvider.prepare(null,null);
 return penguinProvider.prepare(deployment,configuredPenguinTarget(globalThis.location?.origin),options);
}
