import {readFile} from 'node:fs/promises';
import config from '../../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import {createApprovedSignedInFarmResourceContext} from '../../src/minimal/signed-in-farm-resources.ts';
import {alpacaProvider,ALPACA_RUNTIME_REVISION} from '../../src/minimal/alpaca-provider.ts';
import {penguinProvider,PENGUIN_RUNTIME_REVISION} from '../../src/minimal/penguin-provider.ts';
/** CPU-only: use the actual published bytes and issued scope, never a fake model token. */
export async function prepareSampleModels(){
 const context=createApprovedSignedInFarmResourceContext(config,config.target.id);
 for(const [registry,runtimeRevision] of [[alpacaProvider,ALPACA_RUNTIME_REVISION],[penguinProvider,PENGUIN_RUNTIME_REVISION]] as const){
  if(!await registry.prepareSignedInFarm(context,{kind:'hosted',id:config.target.id,runtimeRevision},{textureMode:'headers-only',loadBytes:async url=>new Uint8Array(await readFile(new URL('../../public'+url,import.meta.url)))}))throw new Error('Published sample model validation failed');
 }
 return {alpaca:alpacaProvider.get()!,penguin:penguinProvider.get()!};
}
export async function clearSampleModels(){await Promise.all([alpacaProvider.prepare(null,null),penguinProvider.prepare(null,null)]);}
