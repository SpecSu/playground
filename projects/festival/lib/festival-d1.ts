import { FestivalError } from './festival-server';
import type { FestivalStore, StoredFestival, StoredFestivalVisit } from './festival-server';

export type FestivalDatabase = Pick<D1Database, 'prepare' | 'batch'>;

/** One persisted room. Every command is an optimistic, transactional room/actor CAS. */
export class D1FestivalStore implements FestivalStore {
  db: FestivalDatabase;
  constructor(db: FestivalDatabase) { this.db = db; }

  async ensureRoom(initial: StoredFestival): Promise<void> {
    await this.db.prepare("INSERT INTO festival_rooms (room_id, revision, state_json, mutation_id, updated_at) VALUES ('main', 0, ?, '', ?) ON CONFLICT(room_id) DO NOTHING")
      .bind(JSON.stringify(initial), Date.now()).run();
  }

  async ensureVisit(actorId: string, initial: StoredFestivalVisit): Promise<void> {
    await this.db.prepare("INSERT INTO festival_visits (room_id, actor_id, last_sequence, state_json, updated_at) VALUES ('main', ?, 0, ?, ?) ON CONFLICT(room_id, actor_id) DO NOTHING")
      .bind(actorId, JSON.stringify(initial), Date.now()).run();
  }

  async readState(actorId: string): Promise<{ room: StoredFestival | null; visit: StoredFestivalVisit | null }> {
    // One statement provides a consistent room and actor sequence even when
    // concurrent requests are arriving at different Worker instances.
    const row = await this.db.prepare("SELECT r.revision, r.state_json AS room_json, v.last_sequence, v.state_json AS visit_json FROM festival_rooms AS r LEFT JOIN festival_visits AS v ON v.room_id = r.room_id AND v.actor_id = ? WHERE r.room_id = 'main'")
      .bind(actorId).first<{ revision: number; room_json: string; last_sequence: number | null; visit_json: string | null }>();
    if (!row) return { room: null, visit: null };
    return {
      room: { ...JSON.parse(row.room_json), revision: row.revision },
      visit: row.visit_json === null ? null : { ...JSON.parse(row.visit_json), lastSequence: row.last_sequence },
    };
  }

  async commit(expectedRevision: number, next: StoredFestival, actorId?: string, expectedSequence?: number, visit?: StoredFestivalVisit): Promise<boolean> {
    const mutation = crypto.randomUUID(), now = Date.now();
    if (!visit) {
      const result = await this.db.prepare("UPDATE festival_rooms SET revision = ?, state_json = ?, mutation_id = ?, updated_at = ? WHERE room_id = 'main' AND revision = ?")
        .bind(next.revision, JSON.stringify(next), mutation, now, expectedRevision).run();
      return result.meta.changes === 1;
    }
    // D1 batch is transactional and executes sequentially. Only the winning
    // room mutation token can authorize the actor's receipt/sequence update.
    // A failed room CAS therefore cannot consume a request or reserve an overlapping footprint.
    const result = await this.db.batch([
      this.db.prepare("UPDATE festival_rooms SET revision = ?, state_json = ?, mutation_id = ?, updated_at = ? WHERE room_id = 'main' AND revision = ? AND EXISTS (SELECT 1 FROM festival_visits WHERE room_id = 'main' AND actor_id = ? AND last_sequence = ?)")
        .bind(next.revision, JSON.stringify(next), mutation, now, expectedRevision, actorId!, expectedSequence!),
      this.db.prepare("UPDATE festival_visits SET last_sequence = ?, state_json = ?, updated_at = ? WHERE room_id = 'main' AND actor_id = ? AND EXISTS (SELECT 1 FROM festival_rooms WHERE room_id = 'main' AND mutation_id = ?)")
        .bind(visit.lastSequence, JSON.stringify(visit), now, actorId!, mutation),
    ]);
    return result[0].meta.changes === 1 && result[1].meta.changes === 1;
  }
}

const COOKIE_NAME = 'festival_device';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMISSION_WINDOW_MS = 60_000;
const ADMISSION_LIMIT = 60;
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
async function tokenHash(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function canonicalAddress(value: string | null): string | undefined {
  const ip = value?.trim().toLowerCase();
  if (!ip || ip.length > 45) return undefined;
  if (ip.includes(':')) {
    if (!/^[a-f0-9:.]+$/.test(ip)) return undefined;
    try { return new URL(`http://[${ip}]/`).hostname.slice(1, -1); } catch { return undefined; }
  }
  const parts = ip.split('.');
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255) ? parts.map(Number).join('.') : undefined;
}

async function admitDevice(db: FestivalDatabase, request: Request, now: number): Promise<void> {
  // Only Cloudflare's edge-provided address is trusted. Missing or malformed
  // headers share a conservative bucket; X-Forwarded-For is never accepted.
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname);
  const address = local ? 'local-wrangler' : canonicalAddress(request.headers.get('cf-connecting-ip')) ?? 'unknown-network';
  const key = await tokenHash(`festival-admission:${address}`), cutoff = now - ADMISSION_WINDOW_MS;
  const result = await db.prepare(`INSERT INTO festival_admission_buckets (bucket_hash, window_started_at, admissions) VALUES (?, ?, 1)
    ON CONFLICT(bucket_hash) DO UPDATE SET
      window_started_at = CASE WHEN festival_admission_buckets.window_started_at <= ? THEN excluded.window_started_at ELSE festival_admission_buckets.window_started_at END,
      admissions = CASE WHEN festival_admission_buckets.window_started_at <= ? THEN 1 ELSE festival_admission_buckets.admissions + 1 END
    WHERE festival_admission_buckets.window_started_at <= ? OR festival_admission_buckets.admissions < ?`)
    .bind(key, now, cutoff, cutoff, cutoff, ADMISSION_LIMIT).run();
  if (result.meta.changes !== 1) throw new FestivalError('RATE_LIMITED', '这个网络的新访客较多，请一分钟后再试。', 429, { retryAfterMs: ADMISSION_WINDOW_MS });
}

export async function resolveFestivalSession(db: FestivalDatabase, request: Request, allowCreate: boolean): Promise<{ actorId: string; setCookie?: string }> {
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
  const token = cookie?.slice(COOKIE_NAME.length + 1), now = Date.now();
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const session = await db.prepare('SELECT actor_id FROM festival_sessions WHERE token_hash = ? AND expires_at > ?')
      .bind(await tokenHash(token), now).first<{ actor_id: string }>();
    if (session) return { actorId: session.actor_id };
  }
  if (!allowCreate) throw new FestivalError('FORBIDDEN', '请重新连接广场，以恢复你的访客身份。', 403);
  await admitDevice(db, request, now);
  // Cleanup happens on admission, not on 700 ms polling. Per-visitor history,
  // expired capabilities and network buckets do not accumulate indefinitely.
  await db.prepare('DELETE FROM festival_visits WHERE updated_at <= ? AND NOT EXISTS (SELECT 1 FROM festival_sessions WHERE festival_sessions.actor_id = festival_visits.actor_id AND expires_at > ?)')
    .bind(now - SESSION_TTL_MS, now).run();
  await db.prepare('DELETE FROM festival_sessions WHERE expires_at <= ?').bind(now).run();
  await db.prepare('DELETE FROM festival_admission_buckets WHERE window_started_at < ?').bind(now - 24 * 60 * 60 * 1000).run();
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32))), actorId = crypto.randomUUID();
  await db.prepare('INSERT INTO festival_sessions (token_hash, actor_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await tokenHash(fresh), actorId, now, now + SESSION_TTL_MS).run();
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { actorId, setCookie: `${COOKIE_NAME}=${fresh}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}` };
}
