/** Repository-owned namespace, never a browser-selected raw key prefix. Existing
 * production keys remain byte-for-byte unchanged. The reserved control delimiter
 * cannot be supplied as a logical key, even by a direct repository caller. */
export function minimalRepositoryNamespace(namespace?:string){
 if(namespace!==undefined&&!/^[a-f0-9]{64}$/.test(namespace))throw new Error('Invalid minimal namespace');
 const delimiter='\u001f',prefix=namespace===undefined?'':`${delimiter}minimal-demo-v1:${namespace}${delimiter}`;
 return {
  key(value:string){if(value.includes(delimiter))throw new Error('Reserved minimal namespace key');return prefix+value;},
  offerPredicate:prefix?'substr(key,1,?)=?':'instr(key,?)=0',
  offerArgs:prefix?[prefix.length,prefix]:[delimiter],
 };
}
