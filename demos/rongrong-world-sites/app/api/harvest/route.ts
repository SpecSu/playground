import {env} from 'cloudflare:workers';
import {handleSitesApi} from '../../../lib/sites-api.ts';
const handle=(request:Request)=>handleSitesApi(request,'harvest',env.DB);
export const GET=handle;
export const POST=handle;
