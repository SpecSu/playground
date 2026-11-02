import { env } from 'cloudflare:workers';
import { handleFishingRequest } from '@/lib/fishing-http';
export const dynamic='force-dynamic';
export function GET(request:Request){return handleFishingRequest(request,env.DB);}
export function POST(request:Request){return handleFishingRequest(request,env.DB);}
