import { RoomError } from './room-server';
import { resolveDeviceSession } from './room-server-d1';
import type { RoomDatabase } from './room-server-d1';
import { readCommandBody, validateMutationRequest } from './room-server-http';
import { D1MovementStore } from './room-movement-d1';
import { createMovementService, MovementError } from './room-movement-server';

function json(data: unknown, status = 200, retryAfterMs?: number) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store, max-age=0', pragma: 'no-cache', vary: 'Cookie', 'x-content-type-options': 'nosniff' });
  if (retryAfterMs) headers.set('retry-after', String(Math.ceil(retryAfterMs / 1000)));
  return new Response(JSON.stringify(data), { status, headers });
}
export async function handleMovementRequest(request: Request, db: RoomDatabase | undefined): Promise<Response> {
  try {
    if (!db) throw new MovementError('UNAVAILABLE', 'The shared room is temporarily unavailable.', 503);
    if (request.method !== 'POST') throw new MovementError('INVALID_COMMAND', 'This request method is not supported.', 405);
    validateMutationRequest(request);
    const input = await readCommandBody(request);
    const { actorId } = await resolveDeviceSession(db, request, false);
    return json(await createMovementService(new D1MovementStore(db)).command(actorId, input));
  } catch (error) {
    const known = error instanceof MovementError || error instanceof RoomError ? error : new MovementError('UNAVAILABLE', 'The shared room is temporarily unavailable.', 503);
    if (!(error instanceof MovementError) && !(error instanceof RoomError)) console.error('[room-movement-api] A persistence request failed.');
    return json({ error: { code: known.code, message: known.message, ...(known.retryAfterMs ? { retryAfterMs: known.retryAfterMs } : {}), ...(known instanceof MovementError && known.lastMoveSequence !== undefined ? { lastMoveSequence: known.lastMoveSequence } : {}) } }, known.status, known.retryAfterMs);
  }
}
