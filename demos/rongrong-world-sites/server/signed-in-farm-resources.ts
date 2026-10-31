import configured from '../src/minimal/signed-in-farm-resource-deployment.json' with {type:'json'};
import {createApprovedSignedInFarmResourceContext} from '../src/minimal/signed-in-farm-resources.ts';
/** Staged integration helper. `subject` must come from the Sites dispatcher, not
 * request JSON/query/UID. This selects public static resources, never farm data.
 * Named sessions keep their existing separate resource and account namespace. */
export function signedInFarmServerResources(requestUrl:string,subject:string|null,configuration:unknown=configured){
 if(!subject?.trim()||subject.length>512)return undefined;
 const url=new URL(requestUrl);if(url.searchParams.has('name'))return undefined;
 return createApprovedSignedInFarmResourceContext(configuration,url.origin);
}
