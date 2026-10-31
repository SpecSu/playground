import configured from '../src/minimal/named-demo-resource-deployment.json' with {type:'json'};
import {parseDemoName} from '../src/minimal/demo-name.ts';
import {createApprovedDemoResourceContext} from '../src/minimal/named-demo-resources.ts';
/** Internal adapter input only: never pass request JSON as configuration. Caller
 * verifies loopback/private-owner boundary first. Missing required models blocks
 * before any repository is opened; it never degrades a release into old-only art. */
export function namedDemoServerResources(requestUrl:string,required:boolean,configuration:unknown=configured){
 const url=new URL(requestUrl);if(parseDemoName(url.searchParams).kind!=='demo')return undefined;
 if(configuration===null&&!required)return undefined;
 return createApprovedDemoResourceContext(configuration,url.origin);
}
