import { env } from 'cloudflare:workers';
import { handleRoomRequest } from '@/lib/room-server-http';

export const dynamic = 'force-dynamic';
export function GET(request: Request) { return handleRoomRequest(request,env.DB); }
export function POST(request: Request) { return handleRoomRequest(request,env.DB); }
