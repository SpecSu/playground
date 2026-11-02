import { env } from 'cloudflare:workers';
import { handleFestivalRequest } from '@/lib/festival-http';

export const dynamic = 'force-dynamic';
export function GET(request: Request) { return handleFestivalRequest(request, env.DB); }
export function POST(request: Request) { return handleFestivalRequest(request, env.DB); }
