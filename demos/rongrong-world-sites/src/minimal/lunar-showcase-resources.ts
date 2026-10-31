import {NAMED_DEMO_HOST,namedDemoActualTarget,approvedDemoPreparation,isApprovedDemoResourceContext,type ApprovedDemoResourceContext} from './named-demo-resources.ts';
import {approvedSignedInFarmPreparation,isApprovedSignedInFarmResourceContext,type ApprovedSignedInFarmResourceContext} from './signed-in-farm-resources.ts';
import {ALPACA_RUNTIME_REVISION} from './alpaca-provider.ts';
declare const lunarScopeBrand:unique symbol;
export type LunarShowcaseScope={readonly [lunarScopeBrand]:true};
type ScopeInfo=Readonly<{origin:string;scope:'signed-in-farm'|'named-demo';purpose:'visitor-showcase-only'}>;
const issued=new WeakMap<object,ScopeInfo>();
/** Static-resource capability only: this cannot authorize an account, action,
 * economy command or arbitrary model. Call after verified account bootstrap. */
export function createLunarShowcaseScope(context:unknown,origin:unknown):LunarShowcaseScope{
 const actual=namedDemoActualTarget(origin),target={...actual,runtimeRevision:ALPACA_RUNTIME_REVISION};let scope:ScopeInfo['scope'];
 if(isApprovedSignedInFarmResourceContext(context)){if(origin!==NAMED_DEMO_HOST)throw new Error('Formal lunar resources require the hosted origin');approvedSignedInFarmPreparation(context,'alpaca',target);scope='signed-in-farm';}
 else if(isApprovedDemoResourceContext(context)){approvedDemoPreparation(context,'alpaca',target);scope='named-demo';}
 else throw new Error('Lunar showcase requires an issued farm resource context');
 // Keep the actual document origin (localhost is an approved alias), while the
 // underlying named resource proof remains bound to its canonical local target.
 const token=Object.freeze({}) as LunarShowcaseScope;issued.set(token,Object.freeze({origin:origin as string,scope,purpose:'visitor-showcase-only'}));return token;
}
export function lunarShowcaseScopeInfo(context:unknown):ScopeInfo{const info=context&&typeof context==='object'?issued.get(context):undefined;if(!info)throw new Error('Unissued lunar showcase scope');return info;}
let active:LunarShowcaseScope|null=null;
/** No fetch: ordinary farm startup only binds the reviewed static scope. */
export function bindLunarShowcaseScope(context:ApprovedSignedInFarmResourceContext|ApprovedDemoResourceContext,origin:string){
 const next=createLunarShowcaseScope(context,origin),info=lunarShowcaseScopeInfo(next);
 if(active){const old=lunarShowcaseScopeInfo(active);if(old.origin!==info.origin||old.scope!==info.scope)throw new Error('Lunar showcase scope change requires a document reload');}
 active=next;
}
export function activeLunarShowcaseScope():LunarShowcaseScope|null{return active&&globalThis.location?.origin===lunarShowcaseScopeInfo(active).origin?active:null;}
