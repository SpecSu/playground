import {env} from 'cloudflare:workers';
import {handleSitesMinimalRequest} from '../../../../server/sites-minimal-adapter.ts';

// Hosted Sites only: the existing outer withChatGPTAccess boundary and Sites
// dispatcher own trusted identity. No alternate caller UID or auth bypass.
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleSitesMinimalRequest(request,env);
export const GET=handle;
export const POST=handle;
