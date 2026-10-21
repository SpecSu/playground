import { env } from 'cloudflare:workers';
import { handleMovementRequest } from '@/lib/room-movement-http';

export const dynamic = 'force-dynamic';
export function POST(request: Request) { return handleMovementRequest(request, env.DB); }
