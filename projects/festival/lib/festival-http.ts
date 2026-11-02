import { createFestivalService, FestivalError, validateFestivalCommand } from './festival-server';
import { D1FestivalStore, resolveFestivalSession } from './festival-d1';
import type { FestivalDatabase } from './festival-d1';
import type { FestivalSnapshot } from './festival-types';

const BODY_LIMIT = 4096;

export function validateFestivalReadRequest(request: Request): void {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin !== null && origin !== new URL(request.url).origin)) throw new FestivalError('FORBIDDEN', '请从本站打开沙漠广场。', 403);
}

export function validateFestivalMutationRequest(request: Request): void {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new FestivalError('FORBIDDEN', '广场操作必须从本站发起。', 403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new FestivalError('INVALID_COMMAND', '请使用 JSON 发送广场指令。', 415);
}

export async function readFestivalCommandBody(request: Request): Promise<unknown> {
  const tooLarge = () => new FestivalError('INVALID_COMMAND', '这条指令太长了。', 413);
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) throw tooLarge();
  if (!request.body) throw new FestivalError('INVALID_COMMAND', '缺少广场指令。');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BODY_LIMIT) { await reader.cancel(); throw tooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new FestivalError('INVALID_COMMAND', '指令不是有效的 JSON。'); }
}

function json(data: unknown, status = 200, setCookie?: string, retryAfterMs?: number): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store, max-age=0', pragma: 'no-cache', vary: 'Cookie', 'x-content-type-options': 'nosniff' });
  if (setCookie) headers.set('set-cookie', setCookie);
  if (retryAfterMs) headers.set('retry-after', String(Math.ceil(retryAfterMs / 1000)));
  if (status === 405) headers.set('allow', 'GET, POST');
  return new Response(JSON.stringify(data), { status, headers });
}

export async function handleFestivalRequest(request: Request, db: FestivalDatabase | undefined): Promise<Response> {
  let setCookie: string | undefined, actorId: string | undefined;
  const service = db ? createFestivalService(new D1FestivalStore(db)) : undefined;
  try {
    if (!db || !service) throw new FestivalError('UNAVAILABLE', '共享广场暂时离线，请稍后重试。', 503);
    if (request.method !== 'GET' && request.method !== 'POST') throw new FestivalError('INVALID_COMMAND', '不支持这种请求方式。', 405);
    let body: unknown;
    if (request.method === 'GET') {
      validateFestivalReadRequest(request);
      const room = new URL(request.url).searchParams.get('room');
      if (room !== null && room !== 'main') throw new FestivalError('INVALID_COMMAND', '这里只开放同一个沙漠广场。');
    } else {
      validateFestivalMutationRequest(request);
      body = validateFestivalCommand(await readFestivalCommandBody(request));
    }
    const session = await resolveFestivalSession(db, request, request.method === 'GET');
    actorId = session.actorId; setCookie = session.setCookie;
    const snapshot = request.method === 'GET' ? await service.snapshot(actorId) : await service.command(actorId, body);
    return json(snapshot, 200, setCookie);
  } catch (error) {
    const known = error instanceof FestivalError ? error : new FestivalError('UNAVAILABLE', '共享广场暂时离线，请稍后重试。', 503);
    if (!(error instanceof FestivalError)) console.error('[festival-api] A persistence request failed.');
    let snapshot: FestivalSnapshot | undefined;
    if (service && actorId && ['STALE_SEQUENCE', 'REQUEST_CONFLICT', 'NOT_PARTICIPANT', 'RATE_LIMITED', 'PLOT_OCCUPIED', 'PLACEMENT_BLOCKED', 'BUILD_LIMIT', 'ROUND_CLOSED', 'LIGHTING_CLOSED', 'INSTALLATION_UNAVAILABLE'].includes(known.code)) {
      try { snapshot = await service.snapshot(actorId); } catch { /* Preserve the original failure if refresh is also offline. */ }
    }
    return json({ error: { code: known.code, message: known.message, retryAfterMs: known.retryAfterMs, lastSequence: known.lastSequence }, ...(snapshot ? { snapshot } : {}) }, known.status, setCookie, known.retryAfterMs);
  }
}
