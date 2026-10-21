import type { RoomDatabase } from './room-server-d1';
import type { Participant } from './room-types';
import type { MovementState, MovementStore, StoredMovement } from './room-movement-server';
import type { ParticipantMovement } from './room-movement';

/** Movement writes never replace visit state_json or advance ordinary sequences. */
export class D1MovementStore implements MovementStore {
  readonly db: RoomDatabase;
  constructor(db: RoomDatabase) { this.db = db; }
  async readState(roomId: string, actorId: string): Promise<MovementState> {
    const row = await this.db.prepare('SELECT r.revision, r.state_json AS room_json, v.last_sequence, v.state_json AS visit_json, v.move_sequence, v.move_json FROM nightclub_rooms AS r LEFT JOIN nightclub_visits AS v ON v.room_id = r.room_id AND v.actor_id = ? WHERE r.room_id = ?')
      .bind(actorId, roomId).first<{ revision: number; room_json: string; last_sequence: number | null; visit_json: string | null; move_sequence: number | null; move_json: string | null }>();
    if (!row) return { room: null, visit: null, moveSequence: 0, movement: null };
    return {
      room: { ...JSON.parse(row.room_json), revision: row.revision },
      visit: row.visit_json === null ? null : { ...JSON.parse(row.visit_json), lastSequence: row.last_sequence },
      moveSequence: row.move_sequence ?? 0,
      movement: row.move_json === null ? null : JSON.parse(row.move_json),
    };
  }
  async commit(roomId: string, actorId: string, expectedRoomRevision: number, expectedMoveSequence: number, movement: StoredMovement): Promise<boolean> {
    // This room revision is a read guard, not a room write/CAS. Different actors
    // can all commit against the same revision. A group/join/leave race cannot.
    const result = await this.db.prepare('UPDATE nightclub_visits SET move_sequence = ?, move_json = ? WHERE room_id = ? AND actor_id = ? AND move_sequence = ? AND EXISTS (SELECT 1 FROM nightclub_rooms WHERE room_id = ? AND revision = ?)')
      .bind(movement.sample.moveSequence, JSON.stringify(movement), roomId, actorId, expectedMoveSequence, roomId, expectedRoomRevision).run();
    return result.meta.changes === 1;
  }
  async readParticipantMovements(roomId: string, participants: readonly Pick<Participant, 'id' | 'joinedAt'>[]): Promise<ParticipantMovement[]> {
    const active = participants.slice(0, 10);
    if (!active.length) return [];
    const ids = active.map(person => person.id), placeholders = ids.map(() => '?').join(',');
    const rows = await this.db.prepare(`SELECT actor_id, move_sequence, move_json FROM nightclub_visits WHERE room_id = ? AND actor_id IN (${placeholders}) AND move_json IS NOT NULL`)
      .bind(roomId, ...ids).all<{ actor_id: string; move_sequence: number; move_json: string }>();
    const membership = new Map(active.map(person => [person.id, person.joinedAt]));
    return rows.results.flatMap(row => {
      const stored = JSON.parse(row.move_json) as StoredMovement;
      return stored.sample.joinedAt === membership.get(row.actor_id) ? [{ ...stored.sample, actorId: row.actor_id, moveSequence: row.move_sequence }] : [];
    });
  }
  async readSequence(roomId: string, actorId: string): Promise<number> {
    const row = await this.db.prepare('SELECT move_sequence FROM nightclub_visits WHERE room_id = ? AND actor_id = ?').bind(roomId, actorId).first<{ move_sequence: number }>();
    return row?.move_sequence ?? 0;
  }
}
