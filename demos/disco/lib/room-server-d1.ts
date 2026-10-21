import { RoomError } from './room-server';
import type { RoomStore, StoredRoom, StoredVisit } from './room-server';

export type RoomDatabase = Pick<D1Database, 'prepare' | 'batch'>;

export class D1RoomStore implements RoomStore {
  db: RoomDatabase;
  constructor(db: RoomDatabase) { this.db = db; }
  async ensureRoom(roomId: string, initial: StoredRoom) {
    await this.db.prepare('INSERT INTO nightclub_rooms (room_id, revision, state_json, mutation_id, updated_at) VALUES (?, 0, ?, ?, ?) ON CONFLICT(room_id) DO NOTHING')
      .bind(roomId, JSON.stringify(initial), '', Date.now()).run();
  }
  async readRoom(roomId: string): Promise<StoredRoom> {
    const row = await this.db.prepare('SELECT revision, state_json FROM nightclub_rooms WHERE room_id = ?').bind(roomId).first<{revision:number;state_json:string}>();
    if (!row) throw new RoomError('UNAVAILABLE','The room could not be loaded.',503);
    return {...JSON.parse(row.state_json), revision:row.revision};
  }
  async ensureVisit(roomId: string, actorId: string, initial: StoredVisit) {
    await this.db.prepare('INSERT INTO nightclub_visits (room_id, actor_id, last_sequence, state_json, updated_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT(room_id, actor_id) DO NOTHING')
      .bind(roomId, actorId, JSON.stringify(initial), Date.now()).run();
  }
  async readVisit(roomId: string, actorId: string): Promise<StoredVisit> {
    const row = await this.db.prepare('SELECT last_sequence, state_json FROM nightclub_visits WHERE room_id = ? AND actor_id = ?').bind(roomId,actorId).first<{last_sequence:number;state_json:string}>();
    if (!row) throw new RoomError('UNAVAILABLE','Your room session could not be loaded.',503);
    return {...JSON.parse(row.state_json), lastSequence:row.last_sequence};
  }
  async readState(roomId: string, actorId: string): Promise<{room: StoredRoom | null; visit: StoredVisit | null}> {
    const row=await this.db.prepare('SELECT r.revision, r.state_json AS room_json, v.last_sequence, v.state_json AS visit_json FROM nightclub_rooms AS r LEFT JOIN nightclub_visits AS v ON v.room_id = r.room_id AND v.actor_id = ? WHERE r.room_id = ?')
      .bind(actorId,roomId).first<{revision:number;room_json:string;last_sequence:number|null;visit_json:string|null}>();
    if(!row)return {room:null,visit:null};
    return {
      room:{...JSON.parse(row.room_json),revision:row.revision},
      visit:row.visit_json===null?null:{...JSON.parse(row.visit_json),lastSequence:row.last_sequence},
    };
  }
  async commit(roomId: string, expectedRevision: number, next: StoredRoom, actorId?: string, expectedSequence?: number, visit?: StoredVisit): Promise<boolean> {
    const mutationId=crypto.randomUUID(), now=Date.now();
    if(!visit) {
      const result=await this.db.prepare('UPDATE nightclub_rooms SET revision = ?, state_json = ?, mutation_id = ?, updated_at = ? WHERE room_id = ? AND revision = ?')
        .bind(next.revision,JSON.stringify(next),mutationId,now,roomId,expectedRevision).run();
      return result.meta.changes===1;
    }
    // D1 batch() is transactional and sequential. The first statement claims
    // both expected versions. Only its unique winning mutation token can enable
    // the second statement. A failed CAS cannot advance the guest sequence.
    const results=await this.db.batch([
      this.db.prepare('UPDATE nightclub_rooms SET revision = ?, state_json = ?, mutation_id = ?, updated_at = ? WHERE room_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM nightclub_visits WHERE room_id = ? AND actor_id = ? AND last_sequence = ?)')
        .bind(next.revision,JSON.stringify(next),mutationId,now,roomId,expectedRevision,roomId,actorId!,expectedSequence!),
      this.db.prepare('UPDATE nightclub_visits SET last_sequence = ?, state_json = ?, updated_at = ? WHERE room_id = ? AND actor_id = ? AND EXISTS (SELECT 1 FROM nightclub_rooms WHERE room_id = ? AND mutation_id = ?)')
        .bind(visit.lastSequence,JSON.stringify(visit),now,roomId,actorId!,roomId,mutationId),
    ]);
    return results[0].meta.changes===1 && results[1].meta.changes===1;
  }
}

const COOKIE_NAME='club_device';
function hex(bytes: Uint8Array) { return Array.from(bytes,(v)=>v.toString(16).padStart(2,'0')).join(''); }
async function tokenHash(token: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))); }
const ADMISSION_WINDOW_MS=60_000;
const ADMISSION_LIMIT=60;
function canonicalAddress(value: string | null): string | undefined {
  const ip=value?.trim().toLowerCase();
  if(!ip || ip.length>45)return undefined;
  if(ip.includes(':')) {
    if(!/^[a-f0-9:.]+$/.test(ip))return undefined;
    try {return new URL(`http://[${ip}]/`).hostname.slice(1,-1);}catch{return undefined;}
  }
  const parts=ip.split('.');
  return parts.length===4 && parts.every((part)=>/^\d{1,3}$/.test(part)&&Number(part)<=255)?parts.map(Number).join('.'):undefined;
}
async function admitNewDevice(db: RoomDatabase, request: Request): Promise<void> {
  // CF-Connecting-IP is supplied by Cloudflare's edge for this Worker. Never
  // accept X-Forwarded-For or a client-selected address as an alternative.
  // Local Wrangler integration tests intentionally share one local-only bucket.
  const hostname=new URL(request.url).hostname;
  const isLoopback=['127.0.0.1','localhost','[::1]'].includes(hostname);
  const ip=canonicalAddress(request.headers.get('cf-connecting-ip'));
  // A proxy that strips the edge header shares one conservative global cap.
  // Missing/malformed values never create attacker-selected counter buckets.
  // This can temporarily delay unrelated new guests sharing the fallback, but
  // existing guest capabilities remain usable throughout.
  const address=isLoopback?'local-wrangler':ip??'unknown-network';
  const key=await tokenHash(`nightclub-admission:${address}`), now=Date.now();
  // One atomic conditional upsert admits at most sixty new capabilities in a
  // sixty-second window, including concurrent requests at the limit. Existing
  // valid capabilities bypass this path entirely.
  const result=await db.prepare(`INSERT INTO nightclub_admission_buckets (bucket_hash, window_started_at, admissions) VALUES (?, ?, 1)
    ON CONFLICT(bucket_hash) DO UPDATE SET
      window_started_at = CASE WHEN nightclub_admission_buckets.window_started_at <= ? THEN excluded.window_started_at ELSE nightclub_admission_buckets.window_started_at END,
      admissions = CASE WHEN nightclub_admission_buckets.window_started_at <= ? THEN 1 ELSE nightclub_admission_buckets.admissions + 1 END
    WHERE nightclub_admission_buckets.window_started_at <= ? OR nightclub_admission_buckets.admissions < ?`)
    .bind(key,now,now-ADMISSION_WINDOW_MS,now-ADMISSION_WINDOW_MS,now-ADMISSION_WINDOW_MS,ADMISSION_LIMIT).run();
  if(result.meta.changes!==1)throw new RoomError('RATE_LIMITED','Too many new devices joined from this network. Try again in a minute.',429,{retryAfterMs:ADMISSION_WINDOW_MS});
}
export async function resolveDeviceSession(db: RoomDatabase, request: Request, allowCreate: boolean): Promise<{actorId:string;setCookie?:string}> {
  const cookie=request.headers.get('cookie')?.split(';').map((v)=>v.trim()).find((v)=>v.startsWith(`${COOKIE_NAME}=`));
  const token=cookie?.slice(COOKIE_NAME.length+1);
  if(token && /^[a-f0-9]{64}$/.test(token)) {
    const session=await db.prepare('SELECT actor_id FROM nightclub_sessions WHERE token_hash = ?').bind(await tokenHash(token)).first<{actor_id:string}>();
    if(session)return {actorId:session.actor_id};
  }
  if(!allowCreate)throw new RoomError('FORBIDDEN','Open the room first to establish your device session.',403);
  await admitNewDevice(db,request);
  const fresh=hex(crypto.getRandomValues(new Uint8Array(32))), actorId=crypto.randomUUID();
  await db.prepare('INSERT INTO nightclub_sessions (token_hash, actor_id, created_at) VALUES (?, ?, ?)').bind(await tokenHash(fresh),actorId,Date.now()).run();
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return {actorId,setCookie:`${COOKIE_NAME}=${fresh}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`};
}
